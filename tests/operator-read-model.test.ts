import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOperatorReadModel, type ReadModelInput } from "../services/operator/read-model.js";

const base = (): ReadModelInput => ({
  vault: { paused: false, lastPauseIncident: 0n, observedSlot: 100n, observedAtMs: 10_000 },
  commitObserved: false,
  reconciliationTimedOut: false,
  authorizedForPrivateState: false,
  currentSlot: 100n,
  nowMs: 11_000,
});

describe("operator read model", () => {
  it("requires both an executed receipt and matching paused vault for containment", () => {
    const input = base();
    input.receipt = { incidentId: 7n, status: "executed", executedSlot: 110n };
    assert.equal(buildOperatorReadModel(input).containment, "state-disagreement");
    input.vault.paused = true;
    input.vault.lastPauseIncident = 7n;
    assert.equal(buildOperatorReadModel(input).containment, "contained");
  });

  it("distinguishes an open room, pending committed action, and failed-safe timeout", () => {
    const input = base();
    input.receipt = { incidentId: 7n, status: "pending", executedSlot: 0n };
    assert.equal(buildOperatorReadModel(input).containment, "room-open");
    input.commitObserved = true;
    assert.equal(buildOperatorReadModel(input).containment, "committed-pending-action");
    input.reconciliationTimedOut = true;
    assert.equal(buildOperatorReadModel(input).containment, "failed-safe");
  });

  it("never includes private approval details for an observer", () => {
    const input = base();
    input.privateIncident = { approvalCount: 1, quorum: 2, expiresSlot: 200n, actionHash: "private" };
    const observer = buildOperatorReadModel(input);
    assert.deepEqual(observer.private, { visibility: "observer" });

    input.authorizedForPrivateState = true;
    const responder = buildOperatorReadModel(input);
    assert.deepEqual(responder.private, {
      visibility: "authorized",
      approvalCount: 1,
      quorum: 2,
      decision: "one-of-two",
      actionHash: "private",
    });
  });

  it("labels stale observations and expired private decisions explicitly", () => {
    const input = base();
    input.nowMs = 30_001;
    input.authorizedForPrivateState = true;
    input.currentSlot = 201n;
    input.privateIncident = { approvalCount: 1, quorum: 2, expiresSlot: 200n, actionHash: "hash" };
    const model = buildOperatorReadModel(input);
    assert.equal(model.isFresh, false);
    assert.equal(model.private.visibility, "authorized");
    if (model.private.visibility === "authorized") assert.equal(model.private.decision, "expired");
  });
});
