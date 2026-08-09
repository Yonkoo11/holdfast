<script lang="ts">
  import { onMount } from "svelte";
  import WatchLog from "./components/WatchLog.svelte";
  import QuorumRail from "./components/QuorumRail.svelte";
  import ExecutionKeel from "./components/ExecutionKeel.svelte";
  import StatusGlyph from "./components/StatusGlyph.svelte";
  import { connectInjectedWallet } from "./lib/wallet.js";
  import { verifyLiveContainment, type LiveProof } from "./lib/live-replay.js";
  import { scenarioFromLocation, scenarios, type ScenarioName } from "./lib/scenario.js";

  let scenarioName: ScenarioName = "response";
  let approvalCount = 1;
  let walletAddress: string | null = null;
  let walletError: string | null = null;
  let connecting = false;
  let mounted = false;
  let liveProof: LiveProof = { state: "idle" };

  $: scenario = { ...scenarios[scenarioName], approvalCount };
  $: outcomeState = scenario.vaultPaused ? "contained" : scenario.commitObserved ? "pending" : scenarioName === "response" ? "breach" : "neutral";

  onMount(() => {
    scenarioName = scenarioFromLocation();
    approvalCount = scenarios[scenarioName].approvalCount;
    mounted = true;
  });

  function selectScenario(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value as ScenarioName;
    scenarioName = value;
    approvalCount = scenarios[value].approvalCount;
    const url = new URL(location.href);
    url.searchParams.set("scenario", value);
    history.replaceState({}, "", url);
  }

  async function connectWallet() {
    connecting = true;
    walletError = null;
    try {
      walletAddress = await connectInjectedWallet();
    } catch (error) {
      walletError = error instanceof Error ? error.message : "The wallet did not complete the connection request.";
    } finally {
      connecting = false;
    }
  }

  function demoApprove() {
    approvalCount = Math.min(2, approvalCount + 1);
  }

  async function verifyDevnet() {
    liveProof = { state: "loading" };
    try {
      liveProof = await verifyLiveContainment();
    } catch (error) {
      liveProof = {
        state: "error",
        error: error instanceof Error ? error.message : "The public proof read did not complete.",
      };
    }
  }
</script>

<svelte:head><title>Holdfast / Incident 01 / {scenario.status}</title></svelte:head>

<a class="skip-link" href="#incident-board">Skip to incident board</a>

<div class="shell" class:ready={mounted}>
  <header class="topbar">
    <a class="identity" href="#incident-board" aria-label="Holdfast incident board">
      <span class="mark" aria-hidden="true">
        <svg viewBox="0 0 64 64"><path d="M10 8h12v14h20V8h12v24l-8 8h-8v16H26V40h-8l-8-8V8Zm8 8v13l3 3h22l3-3V16h-4v10H22V16h-4Zm16 24v8h4v-8h-4Z"/></svg>
      </span>
      <span><strong>Holdfast</strong><small>Incident board</small></span>
    </a>

    <nav aria-label="Incident sections">
      <a href="#evidence">Evidence</a>
      <a href="#response">Private response</a>
      <a href="#outcome">Outcome</a>
    </nav>

    <div class="network">
      <span><StatusGlyph state={scenario.stale ? "pending" : "contained"} /> DEVNET</span>
      <code>401,884,124</code>
    </div>
  </header>

  <div class="incident-bar">
    <div><span>HF-01</span><strong>Planted vault withdrawal</strong></div>
    <div class="incident-status"><StatusGlyph state={outcomeState} /><span>{scenario.status}</span></div>
    <label>
      <span>Local evidence state</span>
      <select aria-label="Local evidence state" value={scenarioName} onchange={selectScenario}>
        <option value="watching">Watching</option>
        <option value="response">Response active</option>
        <option value="committed">Action pending</option>
        <option value="contained">Contained</option>
        <option value="failed">Failed action</option>
        <option value="loading">Loading</option>
        <option value="error">RPC error</option>
      </select>
    </label>
  </div>

  <main id="incident-board">
    <div class="board">
      <WatchLog {scenario} />
      <QuorumRail
        approvalCount={scenario.approvalCount}
        teeVerified={scenario.teeVerified}
        {walletAddress}
        {walletError}
        {connecting}
        onConnect={connectWallet}
        onDemoApprove={demoApprove}
      />
    </div>
    <ExecutionKeel {scenario} {liveProof} onVerifyDevnet={verifyDevnet} />
  </main>

  <footer>
    <p>Public evidence stays visible. Approval identities remain inside the permissioned ER.</p>
    <div><a href="https://explorer.solana.com/address/EjU7sFMStj15r1NVrzgVbRJBdjUTUGbgyzHvFzEaaZuz?cluster=devnet" target="_blank" rel="noreferrer">Holdfast program</a><a href="https://explorer.solana.com/address/H9pEwKaL9JwCjYj1ZgmVbZ6AAHHRyXMd4HZfSi1GZaBy?cluster=devnet" target="_blank" rel="noreferrer">Test vault program</a></div>
  </footer>
</div>
