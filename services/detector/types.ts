export type VaultSnapshot = {
  vault: string;
  totalAssets: bigint;
  lastWithdrawal: bigint;
  withdrawalSequence: bigint;
  paused: boolean;
  observedAtMs: number;
  slot?: number;
};

export type BreachEvidence = {
  vault: string;
  observedTvl: bigint;
  withdrawalAmount: bigint;
  withdrawalSequence: bigint;
  thresholdBps: number;
  evidenceHash: Uint8Array;
  detectedAtMs: number;
  sourceSlot?: number;
};

export type OpenedIncident = {
  id: bigint;
  address: string;
  signature: string | null;
  reconciledAfterRpcError?: boolean;
};

export type IncidentOpener = (evidence: BreachEvidence) => Promise<OpenedIncident>;

export type DetectorAlert = {
  kind: "vault-threshold-breach";
  incident: OpenedIncident;
  evidence: BreachEvidence;
  elapsedMs: number;
};

export type AlertSink = (alert: DetectorAlert) => Promise<void>;
