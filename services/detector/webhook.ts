import type { AlertSink, DetectorAlert } from "./types.js";

export type WebhookPoster = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

export function webhookPayload(alert: DetectorAlert): Record<string, unknown> {
  return {
    schema: "holdfast.alert.v1",
    kind: alert.kind,
    incident: {
      id: alert.incident.id.toString(),
      address: alert.incident.address,
      openSignature: alert.incident.signature,
      reconciledAfterRpcError: alert.incident.reconciledAfterRpcError === true,
    },
    evidence: {
      vault: alert.evidence.vault,
      observedTvl: alert.evidence.observedTvl.toString(),
      withdrawalAmount: alert.evidence.withdrawalAmount.toString(),
      withdrawalSequence: alert.evidence.withdrawalSequence.toString(),
      thresholdBps: alert.evidence.thresholdBps,
      evidenceHash: Buffer.from(alert.evidence.evidenceHash).toString("hex"),
      detectedAtMs: alert.evidence.detectedAtMs,
      sourceSlot: alert.evidence.sourceSlot,
    },
    delivery: { elapsedMs: alert.elapsedMs },
  };
}

export class WebhookAlertSink {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 5_000,
    private readonly post: WebhookPoster = fetch,
  ) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error("webhook must use HTTPS unless it targets localhost");
    }
  }

  readonly send: AlertSink = async (alert) => {
    const response = await this.post(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "holdfast-detector/0.1" },
      body: JSON.stringify(webhookPayload(alert)),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`webhook rejected Holdfast alert with HTTP ${response.status}`);
  };
}
