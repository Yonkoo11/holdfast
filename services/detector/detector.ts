import { evaluateWithdrawal, evidenceKey } from "./evidence.js";
import type {
  AlertSink,
  BreachEvidence,
  DetectorAlert,
  IncidentOpener,
  OpenedIncident,
  VaultSnapshot,
} from "./types.js";
import { MemoryDeliveryStore, type DeliveryRecord, type DeliveryStore } from "./persistence.js";

export class VaultDetector {
  private previous?: VaultSnapshot;

  constructor(
    private readonly openIncident: IncidentOpener,
    private readonly sendAlert: AlertSink,
    private readonly now: () => number = Date.now,
    private readonly deliveries: DeliveryStore = new MemoryDeliveryStore(),
  ) {}

  async observe(current: VaultSnapshot): Promise<DetectorAlert | undefined> {
    const currentKey = evidenceKey(current);
    const pendingDelivery = await this.deliveries.get(currentKey);
    if (pendingDelivery && !pendingDelivery.alerted) {
      return this.deliver(currentKey, pendingDelivery);
    }

    const previous = this.previous;
    if (!previous) {
      this.previous = current;
      return undefined;
    }

    const evidence = evaluateWithdrawal(previous, current);
    if (!evidence) {
      if (current.withdrawalSequence >= previous.withdrawalSequence) this.previous = current;
      return undefined;
    }
    const key = evidenceKey(current);
    let delivery = await this.deliveries.get(key);
    if (delivery?.alerted) return undefined;

    if (!delivery) {
      const incident = await this.openIncident(evidence);
      delivery = { incident, evidence, alerted: false };
      await this.deliveries.put(key, delivery);
    }

    this.previous = current;
    return this.deliver(key, delivery);
  }

  private async deliver(key: string, delivery: DeliveryRecord): Promise<DetectorAlert> {
    const alert: DetectorAlert = {
      kind: "vault-threshold-breach",
      incident: delivery.incident,
      evidence: delivery.evidence,
      elapsedMs: this.now() - delivery.evidence.detectedAtMs,
    };
    await this.sendAlert(alert);
    delivery.alerted = true;
    await this.deliveries.put(key, delivery);
    return alert;
  }
}
