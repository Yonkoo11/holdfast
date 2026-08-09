type InjectedWallet = {
  publicKey?: { toBase58(): string };
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?(): Promise<void>;
};

declare global {
  interface Window { solana?: InjectedWallet }
}

export async function connectInjectedWallet(): Promise<string> {
  if (!window.solana) throw new Error("No compatible Solana wallet was found. Observer mode is still available.");
  const result = await window.solana.connect();
  return result.publicKey.toBase58();
}
