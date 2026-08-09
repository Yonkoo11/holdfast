import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BreachEvidence, OpenedIncident } from "./types.js";

export type DeliveryRecord = {
  incident: OpenedIncident;
  evidence: BreachEvidence;
  alerted: boolean;
};

export interface DeliveryStore {
  get(key: string): Promise<DeliveryRecord | undefined>;
  put(key: string, value: DeliveryRecord): Promise<void>;
}

export class MemoryDeliveryStore implements DeliveryStore {
  private readonly values = new Map<string, DeliveryRecord>();

  async get(key: string): Promise<DeliveryRecord | undefined> {
    return this.values.get(key);
  }

  async put(key: string, value: DeliveryRecord): Promise<void> {
    this.values.set(key, value);
  }
}

type StoredRecord = {
  incident: { id: string; address: string; signature: string | null; reconciledAfterRpcError?: boolean };
  evidence: {
    vault: string;
    observedTvl: string;
    withdrawalAmount: string;
    withdrawalSequence: string;
    thresholdBps: number;
    evidenceHash: string;
    detectedAtMs: number;
    sourceSlot?: number;
  };
  alerted: boolean;
};

export class JsonFileDeliveryStore implements DeliveryStore {
  private writeQueue = Promise.resolve();

  constructor(private readonly path: string) {}

  async get(key: string): Promise<DeliveryRecord | undefined> {
    const records = await this.read();
    const value = records[key];
    if (!value) return undefined;
    return {
      incident: { ...value.incident, id: BigInt(value.incident.id) },
      evidence: {
        ...value.evidence,
        observedTvl: BigInt(value.evidence.observedTvl),
        withdrawalAmount: BigInt(value.evidence.withdrawalAmount),
        withdrawalSequence: BigInt(value.evidence.withdrawalSequence),
        evidenceHash: Buffer.from(value.evidence.evidenceHash, "hex"),
      },
      alerted: value.alerted,
    };
  }

  async put(key: string, value: DeliveryRecord): Promise<void> {
    const write = this.writeQueue.then(async () => {
      const records = await this.read();
      records[key] = {
        incident: { ...value.incident, id: value.incident.id.toString() },
        evidence: {
          ...value.evidence,
          observedTvl: value.evidence.observedTvl.toString(),
          withdrawalAmount: value.evidence.withdrawalAmount.toString(),
          withdrawalSequence: value.evidence.withdrawalSequence.toString(),
          evidenceHash: Buffer.from(value.evidence.evidenceHash).toString("hex"),
        },
        alerted: value.alerted,
      };
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    this.writeQueue = write.catch(() => undefined);
    await write;
  }

  private async read(): Promise<Record<string, StoredRecord>> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Record<string, StoredRecord>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
}
