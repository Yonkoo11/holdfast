export type ScenarioName = "watching" | "response" | "committed" | "contained" | "failed" | "loading" | "error";

export type IncidentScenario = {
  name: ScenarioName;
  headline: string;
  status: string;
  approvalCount: number;
  teeVerified: boolean;
  commitObserved: boolean;
  receiptExecuted: boolean;
  vaultPaused: boolean;
  stale: boolean;
};

export const scenarios: Record<ScenarioName, IncidentScenario> = {
  watching: {
    name: "watching",
    headline: "Vault invariant in force",
    status: "Watching",
    approvalCount: 0,
    teeVerified: false,
    commitObserved: false,
    receiptExecuted: false,
    vaultPaused: false,
    stale: false,
  },
  response: {
    name: "response",
    headline: "Withdrawal 01 breached vault invariant",
    status: "Response active",
    approvalCount: 1,
    teeVerified: true,
    commitObserved: false,
    receiptExecuted: false,
    vaultPaused: false,
    stale: false,
  },
  committed: {
    name: "committed",
    headline: "Quorum committed, action unresolved",
    status: "Action pending",
    approvalCount: 2,
    teeVerified: true,
    commitObserved: true,
    receiptExecuted: false,
    vaultPaused: false,
    stale: false,
  },
  contained: {
    name: "contained",
    headline: "Vault pause confirmed on Solana",
    status: "Contained",
    approvalCount: 2,
    teeVerified: true,
    commitObserved: true,
    receiptExecuted: true,
    vaultPaused: true,
    stale: false,
  },
  failed: {
    name: "failed",
    headline: "Commit landed, pause action failed",
    status: "Reconcile",
    approvalCount: 2,
    teeVerified: true,
    commitObserved: true,
    receiptExecuted: false,
    vaultPaused: false,
    stale: false,
  },
  loading: {
    name: "loading",
    headline: "Reading public incident state",
    status: "Loading",
    approvalCount: 0,
    teeVerified: false,
    commitObserved: false,
    receiptExecuted: false,
    vaultPaused: false,
    stale: false,
  },
  error: {
    name: "error",
    headline: "Public RPC did not return the incident",
    status: "Read failed",
    approvalCount: 0,
    teeVerified: false,
    commitObserved: false,
    receiptExecuted: false,
    vaultPaused: false,
    stale: true,
  },
};

export function scenarioFromLocation(): ScenarioName {
  const value = new URLSearchParams(location.search).get("scenario") as ScenarioName | null;
  return value && value in scenarios ? value : "response";
}
