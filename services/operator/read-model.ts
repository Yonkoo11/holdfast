export type PublicVaultState = {
  paused: boolean;
  lastPauseIncident: bigint;
  observedSlot: bigint;
  observedAtMs: number;
};

export type PublicReceiptState = {
  incidentId: bigint;
  status: "pending" | "executed";
  executedSlot: bigint;
};

export type PrivateIncidentState = {
  approvalCount: number;
  quorum: number;
  expiresSlot: bigint;
  actionHash: string;
};

export type ContainmentState =
  | "watching"
  | "room-open"
  | "committed-pending-action"
  | "contained"
  | "failed-safe"
  | "state-disagreement";

export type OperatorReadModel = {
  containment: ContainmentState;
  isFresh: boolean;
  public: {
    vaultPaused: boolean;
    incidentId?: string;
    receiptStatus?: "pending" | "executed";
  };
  private:
    | { visibility: "observer" }
    | {
        visibility: "authorized";
        approvalCount: number;
        quorum: number;
        decision: "awaiting-approvals" | "one-of-two" | "quorum-reached" | "expired";
        actionHash: string;
      };
};

export type ReadModelInput = {
  vault: PublicVaultState;
  receipt?: PublicReceiptState;
  commitObserved: boolean;
  reconciliationTimedOut: boolean;
  privateIncident?: PrivateIncidentState;
  authorizedForPrivateState: boolean;
  currentSlot: bigint;
  nowMs: number;
  staleAfterMs?: number;
};

export function buildOperatorReadModel(input: ReadModelInput): OperatorReadModel {
  const isFresh = input.nowMs - input.vault.observedAtMs <= (input.staleAfterMs ?? 15_000);
  const containment = deriveContainment(input);
  const privateState = input.authorizedForPrivateState && input.privateIncident
    ? authorizedDecision(input.privateIncident, input.currentSlot)
    : { visibility: "observer" as const };

  return {
    containment,
    isFresh,
    public: {
      vaultPaused: input.vault.paused,
      incidentId: input.receipt?.incidentId.toString(),
      receiptStatus: input.receipt?.status,
    },
    private: privateState,
  };
}

function deriveContainment(input: ReadModelInput): ContainmentState {
  const { receipt, vault } = input;
  if (!receipt) return vault.paused ? "state-disagreement" : "watching";

  if (receipt.status === "executed") {
    return vault.paused && vault.lastPauseIncident === receipt.incidentId
      ? "contained"
      : "state-disagreement";
  }
  if (vault.paused && vault.lastPauseIncident === receipt.incidentId) return "state-disagreement";
  if (!input.commitObserved) return "room-open";
  return input.reconciliationTimedOut ? "failed-safe" : "committed-pending-action";
}

function authorizedDecision(
  incident: PrivateIncidentState,
  currentSlot: bigint,
): OperatorReadModel["private"] {
  let decision: "awaiting-approvals" | "one-of-two" | "quorum-reached" | "expired";
  if (currentSlot > incident.expiresSlot) decision = "expired";
  else if (incident.approvalCount >= incident.quorum) decision = "quorum-reached";
  else if (incident.approvalCount === 1) decision = "one-of-two";
  else decision = "awaiting-approvals";
  return {
    visibility: "authorized",
    approvalCount: incident.approvalCount,
    quorum: incident.quorum,
    decision,
    actionHash: incident.actionHash,
  };
}
