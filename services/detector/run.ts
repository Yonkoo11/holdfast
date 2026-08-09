import { AnchorProvider, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { readFile } from "node:fs/promises";
import { AnchorIncidentOpener } from "./anchor-opener.js";
import { VaultDetector } from "./detector.js";
import { JsonFileDeliveryStore } from "./persistence.js";
import { SolanaVaultSource } from "./solana-source.js";
import { WebhookAlertSink } from "./webhook.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function loadIdl(name: "holdfast" | "test_vault"): Promise<Idl> {
  const contents = await readFile(new URL(`../../target/idl/${name}.json`, import.meta.url), "utf8");
  return JSON.parse(contents) as Idl;
}

export async function runDetector(): Promise<void> {
  const provider = AnchorProvider.env();
  const vault = new PublicKey(required("HOLDFAST_VAULT"));
  const controller = new PublicKey(required("HOLDFAST_CONTROLLER"));
  const statePath = process.env.HOLDFAST_STATE_PATH ?? "./var/detector-deliveries.json";
  const [holdfastIdl, vaultIdl] = await Promise.all([loadIdl("holdfast"), loadIdl("test_vault")]);

  const opener = new AnchorIncidentOpener(holdfastIdl, provider, controller, vault);
  const webhook = new WebhookAlertSink(required("HOLDFAST_WEBHOOK_URL"));
  const detector = new VaultDetector(
    opener.open,
    webhook.send,
    Date.now,
    new JsonFileDeliveryStore(statePath),
  );
  const source = new SolanaVaultSource(provider.connection, vault, vaultIdl);
  const unsubscribe = await source.subscribe(
    (snapshot) => detector.observe(snapshot).then(() => undefined),
    (error) => console.error("[holdfast] account notification failed", error),
  );

  console.info(`[holdfast] watching vault ${vault.toBase58()} with controller ${controller.toBase58()}`);
  const stop = async (signal: string) => {
    console.info(`[holdfast] received ${signal}; closing account subscription`);
    await unsubscribe();
    process.exitCode = 0;
  };
  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDetector().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
