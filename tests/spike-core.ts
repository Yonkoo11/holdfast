import * as anchor from "@coral-xyz/anchor";
import {
  GetCommitmentSignature,
  MAGIC_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  createTopUpEscrowInstruction,
  escrowPdaFromEscrowAuthority,
  getAuthToken,
  permissionPdaFromAccount,
  verifyTeeRpcIntegrity,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import BN from "bn.js";
import nacl from "tweetnacl";

// Match Anchor.toml for local runs while still allowing CI/operator override.
process.env.ANCHOR_WALLET ??= join(homedir(), ".config", "solana", "id.json");

const BASE_URL = process.env.PROVIDER_ENDPOINT ?? "https://rpc.magicblock.app/devnet";
const TEE_URL = (process.env.TEE_PROVIDER_ENDPOINT ?? "https://devnet-tee.magicblock.app").replace(/\/$/, "");
const TEE_WS_URL = process.env.TEE_WS_ENDPOINT ?? "wss://devnet-tee.magicblock.app";
const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
const EPHEMERAL_VAULT = new PublicKey("MagicVau1t999999999999999999999999999999999");
const HOLDFAST_ID = new PublicKey("EjU7sFMStj15r1NVrzgVbRJBdjUTUGbgyzHvFzEaaZuz");
const VAULT_ID = new PublicKey("H9pEwKaL9JwCjYj1ZgmVbZ6AAHHRyXMd4HZfSi1GZaBy");

type Fixture = {
  base: anchor.AnchorProvider;
  holdfast: anchor.Program;
  vaultProgram: anchor.Program;
  responder: Keypair;
  outsider: Keypair;
  controller: PublicKey;
  incident: PublicKey;
  receipt: PublicKey;
  vault: PublicKey;
};

function idl(name: "holdfast" | "test_vault"): anchor.Idl {
  return JSON.parse(readFileSync(new URL(`../target/idl/${name}.json`, import.meta.url), "utf8"));
}

function u64(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stage<T>(name: string, operation: () => Promise<T>): Promise<T> {
  console.error(`[spike] ${name}: start`);
  const result = await operation();
  console.error(`[spike] ${name}: ${typeof result === "string" ? result : "ok"}`);
  return result;
}

async function tokenProvider(wallet: anchor.Wallet): Promise<anchor.AnchorProvider> {
  const payer = wallet.payer;
  const auth = await getAuthToken(TEE_URL, payer.publicKey, (message) =>
    Promise.resolve(nacl.sign.detached(message, payer.secretKey)),
  );
  return new anchor.AnchorProvider(
    new anchor.web3.Connection(`${TEE_URL}?token=${auth.token}`, {
      wsEndpoint: `${TEE_WS_URL}?token=${auth.token}`,
      commitment: "confirmed",
    }),
    wallet,
    { commitment: "confirmed", skipPreflight: true },
  );
}

async function fund(base: anchor.AnchorProvider, recipients: PublicKey[]): Promise<string> {
  const transaction = new Transaction();
  for (const recipient of recipients) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: base.wallet.publicKey,
        toPubkey: recipient,
        lamports: 50_000_000,
      }),
    );
  }
  return sendAndConfirmTransaction(base.connection, transaction, [base.wallet.payer!], {
    commitment: "confirmed",
  });
}

async function createFixture(correctPauseAuthority: boolean): Promise<Fixture> {
  const base = new anchor.AnchorProvider(
    new anchor.web3.Connection(BASE_URL, "confirmed"),
    anchor.Wallet.local(),
    { commitment: "confirmed" },
  );
  const holdfast = new anchor.Program(idl("holdfast"), base);
  const vaultProgram = new anchor.Program(idl("test_vault"), base);
  const vaultAuthority = Keypair.generate();
  const responder = Keypair.generate();
  const reserveResponder = Keypair.generate();
  const outsider = Keypair.generate();

  await stage("fund fixture wallets", () => fund(base, [vaultAuthority.publicKey, responder.publicKey]));

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultAuthority.publicKey.toBuffer()],
    VAULT_ID,
  );
  const [controller] = PublicKey.findProgramAddressSync(
    [Buffer.from("controller"), vault.toBuffer()],
    HOLDFAST_ID,
  );
  const [actionAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("action-authority"), controller.toBuffer()],
    HOLDFAST_ID,
  );
  const pauseAuthority = correctPauseAuthority ? actionAuthority : base.wallet.publicKey;

  await stage("initialize vault", () => vaultProgram.methods
    .initialize(new BN(1_000), pauseAuthority)
    .accountsPartial({ vault, authority: vaultAuthority.publicKey })
    .signers([vaultAuthority])
    .rpc());

  await stage("initialize controller", () => holdfast.methods
    .initializeController(base.wallet.publicKey, [
      base.wallet.publicKey,
      responder.publicKey,
      reserveResponder.publicKey,
    ])
    .accountsPartial({ controller, vault, actionAuthority, admin: base.wallet.publicKey })
    .rpc());

  await stage("withdraw 25 percent", () => vaultProgram.methods
    .withdraw(new BN(250))
    .accountsPartial({ vault, authority: vaultAuthority.publicKey })
    .signers([vaultAuthority])
    .rpc());

  const incidentId = 1;
  const [incident] = PublicKey.findProgramAddressSync(
    [Buffer.from("incident"), controller.toBuffer(), u64(incidentId)],
    HOLDFAST_ID,
  );
  const [receipt] = PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), incident.toBuffer()],
    HOLDFAST_ID,
  );
  const evidence = Array.from(
    createHash("sha256")
      .update(`holdfast:${vault.toBase58()}:1:250:1000`)
      .digest(),
  );

  await stage("open incident", () => holdfast.methods
    .openIncident(evidence, new BN(1_000), new BN(250), new BN(1), new BN(20_000))
    .accountsPartial({ controller, vault, incident, receipt, detector: base.wallet.publicKey })
    .rpc());

  const topUpEscrow = createTopUpEscrowInstruction(
    escrowPdaFromEscrowAuthority(base.wallet.publicKey),
    base.wallet.publicKey,
    base.wallet.publicKey,
    2_000_000,
  );
  await stage("top up action escrow", () =>
    sendAndConfirmTransaction(base.connection, new Transaction().add(topUpEscrow), [base.wallet.payer!], {
      commitment: "confirmed",
    }),
  );

  await stage("delegate incident", () => holdfast.methods
    .delegateIncident(new BN(1))
    .accountsPartial({ controller, payer: base.wallet.publicKey, incident, validator: TEE_VALIDATOR })
    .rpc({ skipPreflight: false }));
  await sleep(4_000);

  return { base, holdfast, vaultProgram, responder, outsider, controller, incident, receipt, vault };
}

async function initializePrivacy(fixture: Fixture): Promise<{
  mainEr: anchor.AnchorProvider;
  responderEr: anchor.AnchorProvider;
  actionHash: number[];
}> {
  await stage("verify TEE integrity", () => verifyTeeRpcIntegrity(TEE_URL));
  const mainEr = await tokenProvider(fixture.base.wallet as anchor.Wallet);
  const responderEr = await tokenProvider(new anchor.Wallet(fixture.responder));
  const erProgram = new anchor.Program(idl("holdfast"), mainEr);
  const permission = permissionPdaFromAccount(fixture.incident);

  await stage("initialize private permission", () => erProgram.methods
    .initPrivatePermission()
    .accountsPartial({
      incident: fixture.incident,
      permission,
      permissionProgram: PERMISSION_PROGRAM_ID,
      ephemeralVault: EPHEMERAL_VAULT,
      magicProgram: MAGIC_PROGRAM_ID,
    })
    .rpc({ skipPreflight: true }));
  await sleep(1_500);

  const authorized = await mainEr.connection.getAccountInfo(fixture.incident);
  if (!authorized) throw new Error("authorized responder cannot read private incident");

  const outsiderEr = await tokenProvider(new anchor.Wallet(fixture.outsider));
  let unauthorizedReadBlocked = false;
  try {
    const leaked = await outsiderEr.connection.getAccountInfo(fixture.incident);
    unauthorizedReadBlocked = leaked === null;
  } catch {
    unauthorizedReadBlocked = true;
  }
  if (!unauthorizedReadBlocked) throw new Error("unauthorized wallet read private incident state");

  const incidentState = await (erProgram.account as any).incident.fetch(fixture.incident);
  return { mainEr, responderEr, actionHash: Array.from(incidentState.actionHash as number[]) };
}

export async function runPrivacySpike(): Promise<void> {
  const fixture = await createFixture(true);
  await initializePrivacy(fixture);
  console.log(JSON.stringify({
    result: "private-read-blocked",
    incident: fixture.incident.toBase58(),
    vault: fixture.vault.toBase58(),
  }));
}

export async function runActionSpike(): Promise<void> {
  const fixture = await createFixture(true);
  const { mainEr, responderEr, actionHash } = await initializePrivacy(fixture);
  const mainProgram = new anchor.Program(idl("holdfast"), mainEr);
  const responderProgram = new anchor.Program(idl("holdfast"), responderEr);

  const firstApproval = await stage("first private approval", () => mainProgram.methods
    .approve(actionHash)
    .accountsPartial({ incident: fixture.incident, responder: mainEr.wallet.publicKey })
    .rpc({ skipPreflight: true }));
  const secondApproval = await stage("second private approval", () => responderProgram.methods
    .approve(actionHash)
    .accountsPartial({ incident: fixture.incident, responder: fixture.responder.publicKey })
    .rpc({ skipPreflight: true }));

  const scheduled = await stage("schedule commit and pause action", () => mainProgram.methods
    .commitAndPause()
    .accountsPartial({ payer: mainEr.wallet.publicKey, incident: fixture.incident, programId: HOLDFAST_ID })
    .rpc({ skipPreflight: true }));
  const committed = await stage("resolve base commitment", () => GetCommitmentSignature(scheduled, mainEr.connection));

  let executed = false;
  let lastReceiptStatus = "unknown";
  let lastVaultPaused = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const receipt = await (fixture.holdfast.account as any).actionReceipt.fetch(fixture.receipt);
    const vault = await (fixture.vaultProgram.account as any).vault.fetch(fixture.vault);
    lastReceiptStatus = Object.keys(receipt.status)[0] ?? "unknown";
    lastVaultPaused = vault.paused === true;
    executed = "executed" in receipt.status && vault.paused === true;
    if (executed) break;
    await sleep(1_000);
  }
  if (!executed) {
    throw new Error(
      `commit landed but action did not execute: scheduled=${scheduled} committed=${committed} receipt=${lastReceiptStatus} paused=${lastVaultPaused}`,
    );
  }

  console.log(JSON.stringify({
    result: "vault-paused",
    incident: fixture.incident.toBase58(),
    firstApproval,
    secondApproval,
    scheduled,
    committed,
  }));
}

export async function runFailedActionSpike(): Promise<void> {
  const fixture = await createFixture(false);
  const { mainEr, responderEr, actionHash } = await initializePrivacy(fixture);
  const mainProgram = new anchor.Program(idl("holdfast"), mainEr);
  const responderProgram = new anchor.Program(idl("holdfast"), responderEr);

  await stage("first private approval", () => mainProgram.methods
    .approve(actionHash)
    .accountsPartial({ incident: fixture.incident, responder: mainEr.wallet.publicKey })
    .rpc({ skipPreflight: true }));
  await stage("second private approval", () => responderProgram.methods
    .approve(actionHash)
    .accountsPartial({ incident: fixture.incident, responder: fixture.responder.publicKey })
    .rpc({ skipPreflight: true }));

  const scheduled = await stage("schedule intentionally failing pause", () => mainProgram.methods
    .commitAndPause()
    .accountsPartial({ payer: mainEr.wallet.publicKey, incident: fixture.incident, programId: HOLDFAST_ID })
    .rpc({ skipPreflight: true }));
  const committed = await stage("resolve base commitment", () =>
    GetCommitmentSignature(scheduled, mainEr.connection));

  // Give the asynchronous action executor enough time to attempt the CPI.
  await sleep(8_000);
  const receipt = await (fixture.holdfast.account as any).actionReceipt.fetch(fixture.receipt);
  const vault = await (fixture.vaultProgram.account as any).vault.fetch(fixture.vault);
  const stayedPending = "pending" in receipt.status;
  if (!stayedPending || vault.paused === true) {
    throw new Error("failed action changed durable receipt or paused the misconfigured vault");
  }

  console.log(JSON.stringify({
    result: "pause-failed-safe",
    incident: fixture.incident.toBase58(),
    scheduled,
    committed,
    receipt: "pending",
    paused: false,
  }));
}
