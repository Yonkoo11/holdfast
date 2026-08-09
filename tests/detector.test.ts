import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { VaultDetector } from "../services/detector/detector.js";
import { evaluateWithdrawal } from "../services/detector/evidence.js";
import { incidentAddresses, reconciledIncidentMatches, u64Le } from "../services/detector/anchor-opener.js";
import { WebhookAlertSink, webhookPayload } from "../services/detector/webhook.js";
import { JsonFileDeliveryStore, MemoryDeliveryStore } from "../services/detector/persistence.js";
import type { DetectorAlert, VaultSnapshot } from "../services/detector/types.js";

const vault = "H9pEwKaL9JwCjYj1ZgmVbZ6AAHHRyXMd4HZfSi1GZaBy";
const snapshot = (assets: bigint, withdrawal: bigint, sequence: bigint, at: number): VaultSnapshot => ({
  vault,
  totalAssets: assets,
  lastWithdrawal: withdrawal,
  withdrawalSequence: sequence,
  paused: false,
  observedAtMs: at,
  slot: Number(sequence + 100n),
});

describe("withdrawal evidence", () => {
  it("uses a strict greater-than 20% threshold", () => {
    const before = snapshot(1_000n, 0n, 0n, 1_000);
    assert.equal(evaluateWithdrawal(before, snapshot(800n, 200n, 1n, 1_100)), undefined);
    assert.ok(evaluateWithdrawal(before, snapshot(799n, 201n, 1n, 1_100)));
  });

  it("rejects gaps and state that cannot reconstruct the prior TVL", () => {
    const before = snapshot(1_000n, 0n, 4n, 1_000);
    assert.equal(evaluateWithdrawal(before, snapshot(700n, 300n, 6n, 1_100)), undefined);
    assert.equal(evaluateWithdrawal(before, snapshot(701n, 300n, 5n, 1_100)), undefined);
  });
});

describe("vault detector", () => {
  it("opens exactly one incident and emits a detailed alert in under ten seconds", async () => {
    let opens = 0;
    const alerts: DetectorAlert[] = [];
    const detector = new VaultDetector(
      async () => ({ id: BigInt(++opens), address: "incident-pda", signature: "open-signature" }),
      async (alert) => void alerts.push(alert),
      () => 7_500,
    );

    await detector.observe(snapshot(1_000n, 0n, 0n, 1_000));
    const breached = snapshot(750n, 250n, 1n, 2_000);
    await detector.observe(breached);
    await detector.observe(breached);

    assert.equal(opens, 1);
    assert.equal(alerts.length, 1);
    assert.ok(alerts[0].elapsedMs < 10_000);
    assert.equal(alerts[0].evidence.observedTvl, 1_000n);
    assert.equal(alerts[0].evidence.withdrawalAmount, 250n);
    assert.equal(alerts[0].evidence.withdrawalSequence, 1n);
    assert.equal(alerts[0].evidence.evidenceHash.length, 32);
    assert.equal(alerts[0].incident.signature, "open-signature");
  });

  it("does not open below threshold and retries alert delivery without reopening", async () => {
    let opens = 0;
    let alertAttempts = 0;
    const detector = new VaultDetector(
      async () => ({ id: BigInt(++opens), address: "incident-pda", signature: "open-signature" }),
      async () => {
        alertAttempts += 1;
        if (alertAttempts === 1) throw new Error("sink unavailable");
      },
      () => 3_000,
    );

    await detector.observe(snapshot(1_000n, 0n, 0n, 1_000));
    await detector.observe(snapshot(850n, 150n, 1n, 1_500));
    const breached = snapshot(600n, 250n, 2n, 2_000);
    await assert.rejects(detector.observe(breached), /sink unavailable/);
    await detector.observe(breached);

    assert.equal(opens, 1);
    assert.equal(alertAttempts, 2);
  });

  it("retains the prior baseline when incident opening fails so the breach can retry", async () => {
    let attempts = 0;
    const detector = new VaultDetector(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("RPC unavailable before submission");
        return { id: 1n, address: "incident-pda", signature: "open-signature" };
      },
      async () => undefined,
      () => 4_000,
    );
    await detector.observe(snapshot(1_000n, 0n, 0n, 1_000));
    const breach = snapshot(750n, 250n, 1n, 2_000);
    await assert.rejects(detector.observe(breach), /RPC unavailable/);
    await detector.observe(breach);
    assert.equal(attempts, 2);
  });
});

describe("detector integrations", () => {
  it("derives stable incident and receipt addresses from the onchain seed contract", () => {
    const controller = new PublicKey("11111111111111111111111111111111");
    assert.equal(u64Le(513n).toString("hex"), "0102000000000000");
    const first = incidentAddresses(controller, 9n);
    const second = incidentAddresses(controller, 9n);
    assert.equal(first.incident.toBase58(), second.incident.toBase58());
    assert.equal(first.receipt.toBase58(), second.receipt.toBase58());
    assert.notEqual(first.incident.toBase58(), incidentAddresses(controller, 10n).incident.toBase58());
  });

  it("accepts ambiguous RPC reconciliation only when every onchain evidence field matches", () => {
    const controller = new PublicKey("EjU7sFMStj15r1NVrzgVbRJBdjUTUGbgyzHvFzEaaZuz");
    const targetVault = new PublicKey(vault);
    const evidence = evaluateWithdrawal(
      { ...snapshot(1_000n, 0n, 0n, 1_000), vault: targetVault.toBase58() },
      { ...snapshot(750n, 250n, 1n, 2_000), vault: targetVault.toBase58() },
    )!;
    const state = {
      id: { toString: () => "7" },
      controller,
      vault: targetVault,
      evidenceHash: evidence.evidenceHash,
      observedTvl: { toString: () => "1000" },
      withdrawalAmount: { toString: () => "250" },
      withdrawalSequence: { toString: () => "1" },
    };
    assert.equal(reconciledIncidentMatches(state, { id: 7n, controller, vault: targetVault, evidence }), true);
    assert.equal(
      reconciledIncidentMatches(
        { ...state, withdrawalAmount: { toString: () => "251" } },
        { id: 7n, controller, vault: targetVault, evidence },
      ),
      false,
    );
  });

  it("survives a process restart without reopening an already-created incident", async () => {
    const store = new MemoryDeliveryStore();
    let opens = 0;
    let alertAttempts = 0;
    const opener = async () => ({
      id: BigInt(++opens),
      address: "incident-pda",
      signature: "open-signature",
    });
    const sink = async () => {
      alertAttempts += 1;
      if (alertAttempts === 1) throw new Error("process interrupted before delivery");
    };
    const firstProcess = new VaultDetector(opener, sink, () => 3_000, store);
    await firstProcess.observe(snapshot(1_000n, 0n, 0n, 1_000));
    const breach = snapshot(750n, 250n, 1n, 2_000);
    await assert.rejects(firstProcess.observe(breach), /interrupted/);

    const restartedProcess = new VaultDetector(opener, sink, () => 4_000, store);
    await restartedProcess.observe(breach);
    assert.equal(opens, 1);
    assert.equal(alertAttempts, 2);
  });

  it("atomically preserves concurrent delivery records in the file store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "holdfast-store-"));
    try {
      const path = join(directory, "deliveries.json");
      const store = new JsonFileDeliveryStore(path);
      const evidence = evaluateWithdrawal(
        snapshot(1_000n, 0n, 0n, 1_000),
        snapshot(750n, 250n, 1n, 2_000),
      )!;
      await Promise.all([
        store.put("vault:1", {
          incident: { id: 1n, address: "incident-1", signature: "signature-1" },
          evidence,
          alerted: false,
        }),
        store.put("vault:2", {
          incident: { id: 2n, address: "incident-2", signature: "signature-2" },
          evidence: { ...evidence, withdrawalSequence: 2n },
          alerted: true,
        }),
      ]);

      const restarted = new JsonFileDeliveryStore(path);
      assert.equal((await restarted.get("vault:1"))?.incident.id, 1n);
      assert.equal((await restarted.get("vault:2"))?.alerted, true);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("delivers the complete evidence contract and fails closed on a rejected webhook", async () => {
    const sent: string[] = [];
    const evidence = evaluateWithdrawal(
      snapshot(1_000n, 0n, 0n, 1_000),
      snapshot(750n, 250n, 1n, 2_000),
    )!;
    const alert: DetectorAlert = {
      kind: "vault-threshold-breach",
      incident: { id: 1n, address: "incident-pda", signature: "open-signature" },
      evidence,
      elapsedMs: 1_200,
    };
    const sink = new WebhookAlertSink("https://alerts.example.test/holdfast", 5_000, async (_url, init) => {
      sent.push(init.body);
      return { ok: true, status: 202 };
    });
    await sink.send(alert);
    const body = JSON.parse(sent[0]) as {
      evidence: { evidenceHash: string };
      [key: string]: unknown;
    };
    assert.deepEqual(body, webhookPayload(alert));
    assert.equal(body.evidence.evidenceHash.length, 64);

    const rejected = new WebhookAlertSink("https://alerts.example.test/holdfast", 5_000, async () => ({
      ok: false,
      status: 503,
    }));
    await assert.rejects(rejected.send(alert), /HTTP 503/);
  });
});
