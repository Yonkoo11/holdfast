import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, type AccountInfo, type Context } from "@solana/web3.js";
import type { VaultSnapshot } from "./types.js";

type DecodedVault = {
  totalAssets: { toString(): string };
  lastWithdrawal: { toString(): string };
  withdrawalSeq: { toString(): string };
  paused: boolean;
};

export class SolanaVaultSource {
  private readonly coder: BorshAccountsCoder;

  constructor(
    private readonly connection: Connection,
    private readonly vault: PublicKey,
    idl: Idl,
  ) {
    this.coder = new BorshAccountsCoder(idl);
  }

  async subscribe(
    onSnapshot: (snapshot: VaultSnapshot) => Promise<void>,
    onError: (error: unknown) => void = console.error,
  ): Promise<() => Promise<void>> {
    const initial = await this.connection.getAccountInfoAndContext(this.vault, "confirmed");
    if (!initial.value) throw new Error(`vault account ${this.vault.toBase58()} was not found`);
    await onSnapshot(await this.decode(initial.value, initial.context));

    let queue = Promise.resolve();
    const subscription = this.connection.onAccountChange(
      this.vault,
      (account, context) => {
        queue = queue
          .then(async () => onSnapshot(await this.decode(account, context)))
          .catch(onError);
      },
      "confirmed",
    );
    return async () => {
      await this.connection.removeAccountChangeListener(subscription);
      await queue;
    };
  }

  private async decode(account: AccountInfo<Buffer>, context: Context): Promise<VaultSnapshot> {
    const decoded = this.coder.decode("vault", account.data) as DecodedVault;
    const blockTimeSeconds = await this.connection.getBlockTime(context.slot).catch(() => null);
    const receivedAtMs = Date.now();
    const observedAtMs = blockTimeSeconds === null
      ? receivedAtMs
      : Math.min(blockTimeSeconds * 1_000, receivedAtMs);
    return {
      vault: this.vault.toBase58(),
      totalAssets: BigInt(decoded.totalAssets.toString()),
      lastWithdrawal: BigInt(decoded.lastWithdrawal.toString()),
      withdrawalSequence: BigInt(decoded.withdrawalSeq.toString()),
      paused: decoded.paused,
      observedAtMs,
      slot: context.slot,
    };
  }
}
