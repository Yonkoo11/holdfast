import { Program, type AnchorProvider, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { BreachEvidence, IncidentOpener } from "./types.js";

const HOLDFAST_PROGRAM_ID = new PublicKey("EjU7sFMStj15r1NVrzgVbRJBdjUTUGbgyzHvFzEaaZuz");

export function u64Le(value: bigint): Buffer {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new RangeError("u64 value out of range");
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

export function incidentAddresses(controller: PublicKey, id: bigint): {
  incident: PublicKey;
  receipt: PublicKey;
} {
  const [incident] = PublicKey.findProgramAddressSync(
    [Buffer.from("incident"), controller.toBuffer(), u64Le(id)],
    HOLDFAST_PROGRAM_ID,
  );
  const [receipt] = PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), incident.toBuffer()],
    HOLDFAST_PROGRAM_ID,
  );
  return { incident, receipt };
}

export class AnchorIncidentOpener {
  private readonly program: Program;

  constructor(
    idl: Idl,
    private readonly provider: AnchorProvider,
    private readonly controller: PublicKey,
    private readonly vault: PublicKey,
    private readonly ttlSlots = 20_000n,
  ) {
    this.program = new Program(idl, provider);
  }

  readonly open: IncidentOpener = async (evidence: BreachEvidence) => {
    if (evidence.vault !== this.vault.toBase58()) {
      throw new Error("detector evidence targets a different vault");
    }
    const controllerState = await (this.program.account as any).controller.fetch(this.controller);
    const id = BigInt(controllerState.nextIncidentId.toString());
    const { incident, receipt } = incidentAddresses(this.controller, id);
    try {
      const signature = await this.program.methods
        .openIncident(
          Array.from(evidence.evidenceHash),
          new BN(evidence.observedTvl.toString()),
          new BN(evidence.withdrawalAmount.toString()),
          new BN(evidence.withdrawalSequence.toString()),
          new BN(this.ttlSlots.toString()),
        )
        .accountsPartial({
          controller: this.controller,
          vault: this.vault,
          incident,
          receipt,
          detector: this.provider.publicKey,
        })
        .rpc();
      return { id, address: incident.toBase58(), signature };
    } catch (submissionError) {
      const reconciled = await this.reconcileSubmittedIncident(id, incident, evidence).catch(() => false);
      if (!reconciled) throw submissionError;
      return {
        id,
        address: incident.toBase58(),
        signature: null,
        reconciledAfterRpcError: true,
      };
    }
  };

  private async reconcileSubmittedIncident(
    id: bigint,
    incident: PublicKey,
    evidence: BreachEvidence,
  ): Promise<boolean> {
    const controller = await (this.program.account as any).controller.fetch(this.controller);
    if (BigInt(controller.nextIncidentId.toString()) !== id + 1n) return false;
    if (BigInt(controller.lastWithdrawalSequence.toString()) !== evidence.withdrawalSequence) return false;
    const state = await (this.program.account as any).incident.fetch(incident);
    return reconciledIncidentMatches(state, {
      id,
      controller: this.controller,
      vault: this.vault,
      evidence,
    });
  }
}

type ReconciledIncident = {
  id: { toString(): string };
  controller: PublicKey;
  vault: PublicKey;
  evidenceHash: number[] | Uint8Array;
  observedTvl: { toString(): string };
  withdrawalAmount: { toString(): string };
  withdrawalSequence: { toString(): string };
};

export function reconciledIncidentMatches(
  state: ReconciledIncident,
  expected: { id: bigint; controller: PublicKey; vault: PublicKey; evidence: BreachEvidence },
): boolean {
  return BigInt(state.id.toString()) === expected.id
    && state.controller.equals(expected.controller)
    && state.vault.equals(expected.vault)
    && Buffer.from(state.evidenceHash).equals(Buffer.from(expected.evidence.evidenceHash))
    && BigInt(state.observedTvl.toString()) === expected.evidence.observedTvl
    && BigInt(state.withdrawalAmount.toString()) === expected.evidence.withdrawalAmount
    && BigInt(state.withdrawalSequence.toString()) === expected.evidence.withdrawalSequence;
}
