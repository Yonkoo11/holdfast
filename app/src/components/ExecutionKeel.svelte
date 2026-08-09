<script lang="ts">
  let {
    scenario,
    liveProof,
    onVerifyDevnet,
  }: {
    scenario: import("../lib/scenario.js").IncidentScenario;
    liveProof: import("../lib/live-replay.js").LiveProof;
    onVerifyDevnet: () => void;
  } = $props();

  let stages = $derived([
    { label: "Evidence sealed", value: "Incident 01", done: scenario.name !== "watching" && scenario.name !== "loading" && scenario.name !== "error" },
    { label: "Quorum committed", value: scenario.commitObserved ? "Confirmed" : "Not committed", done: scenario.commitObserved },
    { label: "Action receipt", value: scenario.receiptExecuted ? "Executed" : scenario.commitObserved ? "Pending" : "Not scheduled", done: scenario.receiptExecuted },
    { label: "Vault state", value: scenario.vaultPaused ? "Paused" : "Unpaused", done: scenario.vaultPaused },
  ]);
</script>

<section class="keel" id="outcome" aria-labelledby="outcome-heading" class:failed={scenario.name === "failed"} class:contained={scenario.name === "contained"}>
  <header>
    <div><p>Execution keel / Base layer</p><h2 id="outcome-heading">Decision and containment are separate facts</h2></div>
    <strong>{scenario.status}</strong>
  </header>
  <ol>
    {#each stages as stage, index}
      <li class:done={stage.done}>
        <span class="index">0{index + 1}</span>
        <div><small>{stage.label}</small><b>{stage.value}</b></div>
      </li>
    {/each}
  </ol>
  {#if scenario.name === "failed"}
    <div class="outcome-note" role="alert"><strong>Pause did not execute.</strong> The commit is durable, the receipt is pending, and the vault remains unpaused. Reconcile the configured pause authority before any new action.</div>
  {:else if scenario.name === "contained"}
    <div class="outcome-note"><strong>Containment confirmed.</strong> Receipt 01 executed at slot 401,884,219 and the vault reports pause incident 01.</div>
  {/if}
  <div class="live-proof" class:verified={liveProof.state === "verified"} class:proof-error={liveProof.state === "error"}>
    <div>
      <small>Public Devnet proof</small>
      {#if liveProof.state === "verified"}
        <strong>Receipt and vault agree</strong>
        <span>Incident {liveProof.incidentId} executed at slot {liveProof.executedSlot}; observed at {liveProof.observedSlot}.</span>
      {:else if liveProof.state === "error"}
        <strong>Proof read unavailable</strong>
        <span>{liveProof.error}</span>
      {:else}
        <strong>Verify without a wallet</strong>
        <span>Read the deployed receipt and paused vault directly from MagicBlock Devnet.</span>
      {/if}
    </div>
    <button type="button" disabled={liveProof.state === "loading"} onclick={onVerifyDevnet}>
      {liveProof.state === "loading" ? "Reading Devnet" : liveProof.state === "verified" ? "Verify again" : "Verify Devnet proof"}
    </button>
  </div>
</section>

<style>
  .keel { position:relative; padding:var(--space-5) var(--space-6) var(--space-6); background:linear-gradient(180deg,var(--surface),var(--base)); box-shadow:var(--shadow-xl), inset 0 4px 0 rgba(214,168,95,.55), inset 0 0 0 1px var(--border-subtle); }
  .keel::after { content:""; position:absolute; left:50%; bottom:-16px; width:24px; height:16px; transform:translateX(-50%); background:var(--pending); clip-path:polygon(0 0,100% 0,70% 100%,30% 100%); opacity:.72; }
  .keel.contained { box-shadow:var(--shadow-xl), inset 0 4px 0 rgba(114,168,137,.65), inset 0 0 0 1px var(--border-subtle); }
  .keel.contained::after { background:var(--contained); }
  .keel.failed { box-shadow:var(--shadow-xl), inset 0 4px 0 rgba(216,116,97,.65), inset 0 0 0 1px var(--border-subtle); }
  .keel.failed::after { background:var(--breach); }
  header { display:flex; justify-content:space-between; gap:var(--space-5); align-items:flex-start; }
  header p { margin:0; color:var(--text-muted); font-size:var(--text-xs); letter-spacing:.08em; text-transform:uppercase; }
  h2 { margin:var(--space-2) 0 0; font-size:var(--text-xl); letter-spacing:-.02em; }
  header > strong { color:var(--pending); font:600 var(--text-sm)/1 var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .contained header > strong { color:var(--contained); }
  .failed header > strong { color:var(--breach); }
  ol { display:grid; grid-template-columns:repeat(4,1fr); gap:0; margin:var(--space-5) 0 0; padding:0; list-style:none; }
  li { display:grid; grid-template-columns:28px 1fr; gap:var(--space-3); min-height:68px; padding:var(--space-3) var(--space-4); border-left:1px solid var(--border-default); color:var(--text-muted); }
  li:first-child { border-left:0; padding-left:0; }
  .index { font:var(--text-sm)/1.5 var(--font-mono); }
  li small { display:block; margin-bottom:var(--space-1); font-size:var(--text-xs); letter-spacing:.05em; text-transform:uppercase; }
  li b { font:500 var(--text-sm)/1.4 var(--font-mono); }
  li.done { color:var(--paper); }
  li.done .index { color:var(--brass); }
  .outcome-note { margin-top:var(--space-4); padding:var(--space-4); background:rgba(114,168,137,.07); border-left:4px solid var(--contained); color:var(--text-secondary); font-size:var(--text-sm); }
  .failed .outcome-note { background:rgba(216,116,97,.07); border-color:var(--breach); }
  .outcome-note strong { color:var(--paper); }
  .live-proof { display:flex; justify-content:space-between; align-items:center; gap:var(--space-5); margin-top:var(--space-5); padding:var(--space-4); background:var(--surface-raised); box-shadow:inset 0 0 0 1px var(--border-default); }
  .live-proof div { min-width:0; }
  .live-proof small,.live-proof strong,.live-proof span { display:block; }
  .live-proof small { color:var(--text-muted); font-size:var(--text-xs); letter-spacing:.06em; text-transform:uppercase; }
  .live-proof strong { margin-top:var(--space-1); color:var(--paper); }
  .live-proof span { margin-top:var(--space-1); color:var(--text-secondary); font-size:var(--text-sm); overflow-wrap:anywhere; }
  .live-proof button { flex:0 0 auto; min-height:44px; padding:0 var(--space-4); border:1px solid var(--border-strong); background:var(--base); color:var(--paper); }
  .live-proof.verified { box-shadow:inset 4px 0 0 var(--contained), inset 0 0 0 1px var(--border-default); }
  .live-proof.proof-error { box-shadow:inset 4px 0 0 var(--breach), inset 0 0 0 1px var(--border-default); }
  @media (max-width:760px) { .keel { padding:var(--space-5); } header { display:block; } header > strong { display:block; margin-top:var(--space-3); } ol { grid-template-columns:1fr; } li { border-left:0; border-top:1px solid var(--border-default); padding-left:0; } .live-proof { display:block; } .live-proof button { width:100%; margin-top:var(--space-4); } }
</style>
