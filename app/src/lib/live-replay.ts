const RPC_URL = "https://rpc.magicblock.app/devnet";
const RECEIPT = "9C68VpqkY7zfBWgUafNTdqE5VBfXi59pic4gYCfoxS8F";
const VAULT = "EtHaoLjCvwUDZWmX1zmcg7HhYXPqPPMpRbe5AntfEqwi";
const HOLDFAST_PROGRAM = "EjU7sFMStj15r1NVrzgVbRJBdjUTUGbgyzHvFzEaaZuz";
const VAULT_PROGRAM = "H9pEwKaL9JwCjYj1ZgmVbZ6AAHHRyXMd4HZfSi1GZaBy";
const RECEIPT_DISCRIMINATOR = "3423106fc3281045";
const VAULT_DISCRIMINATOR = "d308e82b02987577";

export type LiveProof = {
  state: "idle" | "loading" | "verified" | "error";
  observedSlot?: number;
  executedSlot?: bigint;
  incidentId?: bigint;
  error?: string;
};

type RpcAccount = { data: [string, string]; owner: string };

export async function verifyLiveContainment(signal?: AbortSignal): Promise<LiveProof> {
  const timeout = AbortSignal.timeout(10_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "holdfast-public-replay",
      method: "getMultipleAccounts",
      params: [[RECEIPT, VAULT], { commitment: "confirmed", encoding: "base64" }],
    }),
    signal: requestSignal,
  });
  if (!response.ok) throw new Error(`MagicBlock Devnet RPC returned HTTP ${response.status}.`);

  const payload = await response.json() as {
    error?: { message?: string };
    result?: { context: { slot: number }; value: Array<RpcAccount | null> };
  };
  if (payload.error) throw new Error(payload.error.message ?? "MagicBlock Devnet RPC rejected the proof read.");
  const result = payload.result;
  if (!result || result.value.length !== 2 || !result.value[0] || !result.value[1]) {
    throw new Error("The public receipt or vault account is unavailable.");
  }

  const [receiptAccount, vaultAccount] = result.value as [RpcAccount, RpcAccount];
  if (receiptAccount.owner !== HOLDFAST_PROGRAM || vaultAccount.owner !== VAULT_PROGRAM) {
    throw new Error("A proof account has an unexpected program owner.");
  }
  const receipt = decodeBase64(receiptAccount.data[0]);
  const vault = decodeBase64(vaultAccount.data[0]);
  if (hex(receipt.slice(0, 8)) !== RECEIPT_DISCRIMINATOR || hex(vault.slice(0, 8)) !== VAULT_DISCRIMINATOR) {
    throw new Error("A proof account has an unexpected Anchor discriminator.");
  }
  if (receipt.length < 153 || vault.length < 105) throw new Error("A proof account is shorter than its declared layout.");

  const receiptView = new DataView(receipt.buffer, receipt.byteOffset, receipt.byteLength);
  const vaultView = new DataView(vault.buffer, vault.byteOffset, vault.byteLength);
  const incidentId = receiptView.getBigUint64(40, true);
  const receiptStatus = receiptView.getUint8(144);
  const executedSlot = receiptView.getBigUint64(145, true);
  const vaultIncidentId = vaultView.getBigUint64(96, true);
  const paused = vaultView.getUint8(104) === 1;

  if (receiptStatus !== 1 || executedSlot === 0n || !paused || vaultIncidentId !== incidentId) {
    throw new Error("Public receipt and vault state do not jointly prove containment.");
  }
  return { state: "verified", observedSlot: result.context.slot, executedSlot, incidentId };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
