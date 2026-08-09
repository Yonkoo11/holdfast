import { createHash } from "node:crypto";
import type { BreachEvidence, VaultSnapshot } from "./types.js";

export const DEFAULT_THRESHOLD_BPS = 2_000;

export function evidenceKey(snapshot: VaultSnapshot): string {
  return `${snapshot.vault}:${snapshot.withdrawalSequence}`;
}

export function evaluateWithdrawal(
  previous: VaultSnapshot,
  current: VaultSnapshot,
  thresholdBps = DEFAULT_THRESHOLD_BPS,
): BreachEvidence | undefined {
  if (previous.vault !== current.vault || current.paused) return undefined;
  if (current.withdrawalSequence !== previous.withdrawalSequence + 1n) return undefined;
  if (current.lastWithdrawal <= 0n || current.lastWithdrawal > previous.totalAssets) return undefined;
  if (current.totalAssets + current.lastWithdrawal !== previous.totalAssets) return undefined;
  if (current.lastWithdrawal * 10_000n <= previous.totalAssets * BigInt(thresholdBps)) {
    return undefined;
  }

  const canonical = [
    "holdfast-evidence-v1",
    current.vault,
    previous.totalAssets.toString(),
    current.lastWithdrawal.toString(),
    current.withdrawalSequence.toString(),
    String(thresholdBps),
    String(current.slot ?? 0),
  ].join("|");

  return {
    vault: current.vault,
    observedTvl: previous.totalAssets,
    withdrawalAmount: current.lastWithdrawal,
    withdrawalSequence: current.withdrawalSequence,
    thresholdBps,
    evidenceHash: createHash("sha256").update(canonical).digest(),
    detectedAtMs: current.observedAtMs,
    sourceSlot: current.slot,
  };
}
