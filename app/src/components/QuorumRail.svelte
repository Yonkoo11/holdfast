<script lang="ts">
  import StatusGlyph from "./StatusGlyph.svelte";
  let {
    approvalCount,
    teeVerified,
    walletAddress,
    walletError,
    connecting,
    onConnect,
    onDemoApprove,
  }: {
    approvalCount: number;
    teeVerified: boolean;
    walletAddress: string | null;
    walletError: string | null;
    connecting: boolean;
    onConnect: () => void;
    onDemoApprove: () => void;
  } = $props();

  const responders = ["North watch", "Protocol lead", "Reserve officer"];
</script>

<aside class="rail" id="response" aria-labelledby="response-heading">
  <header>
    <div>
      <p class="eyebrow">Private response / TEE replay</p>
      <h2 id="response-heading">Two keys must agree</h2>
    </div>
    <div class="tee"><StatusGlyph state={teeVerified ? "contained" : "neutral"} /> {teeVerified ? "TEE proof recorded" : "Not verified"}</div>
  </header>

  <div class="counter" aria-label={`${approvalCount} of 2 approvals`}>
    <strong>{Math.min(approvalCount, 2)}<span>/2</span></strong>
    <p>{approvalCount >= 2 ? "Quorum reached" : approvalCount === 1 ? "One distinct responder still required" : "No approval recorded"}</p>
  </div>

  <ol class="stations">
    {#each responders as responder, index}
      <li class:approved={index < approvalCount}>
        <span class="station-number">0{index + 1}</span>
        <div><strong>{responder}</strong><small>{index < approvalCount ? "Action hash approved" : "Station available"}</small></div>
        <span class="dog" aria-hidden="true">{index < approvalCount ? "SET" : "OPEN"}</span>
      </li>
    {/each}
  </ol>

  <section class="action-proof" aria-labelledby="fixed-action-heading">
    <p class="eyebrow">Fixed action</p>
    <h3 id="fixed-action-heading">Pause test vault</h3>
    <dl>
      <div><dt>Target</dt><dd>H9pE…ZaBy</dd></div>
      <div><dt>Program</dt><dd>Test Vault</dd></div>
      <div><dt>Action hash</dt><dd>4b71…980d</dd></div>
      <div><dt>Expires</dt><dd>Slot 401,904,124</dd></div>
    </dl>
  </section>

  {#if walletAddress}
    <div class="wallet-state">
      <p>Connected responder</p><code>{walletAddress.slice(0, 5)}…{walletAddress.slice(-4)}</code>
    </div>
    <button class="primary" type="button" disabled={approvalCount >= 2} onclick={onDemoApprove}>
      {approvalCount >= 2 ? "Quorum already reached" : "Approve fixed action"}
    </button>
    <p class="demo-note">Local interaction preview. No transaction is submitted without live incident configuration.</p>
  {:else}
    <button class="primary" type="button" disabled={connecting} onclick={onConnect}>
      {connecting ? "Waiting for wallet" : "Connect responder wallet"}
    </button>
    <p class="button-reason">Approval stays disabled until wallet role and TEE integrity are verified.</p>
  {/if}

  {#if walletError}
    <div class="inline-error" role="alert"><strong>Wallet not connected</strong><p>{walletError}</p></div>
  {/if}
</aside>

<style>
  .rail { min-width:0; padding:var(--space-6); background:var(--surface); box-shadow:var(--shadow-lg), inset 0 0 0 1px rgba(201,168,106,.16); }
  header { display:flex; justify-content:space-between; gap:var(--space-4); align-items:flex-start; }
  .eyebrow, .tee { margin:0; color:var(--text-muted); font-size:var(--text-xs); letter-spacing:.08em; text-transform:uppercase; }
  h2 { margin:var(--space-2) 0 0; font-size:var(--text-2xl); line-height:1.2; letter-spacing:-.02em; }
  .tee { display:flex; align-items:center; gap:var(--space-2); min-height:44px; white-space:nowrap; }
  .counter { display:flex; gap:var(--space-5); align-items:center; margin:var(--space-6) 0; padding-bottom:var(--space-5); border-bottom:1px solid var(--border-default); }
  .counter strong { color:var(--brass); font:600 48px/1 var(--font-mono); letter-spacing:-.05em; }
  .counter strong span { color:var(--text-muted); font-size:24px; }
  .counter p { margin:0; max-width:18ch; color:var(--text-secondary); font-size:var(--text-sm); }
  .stations { display:grid; gap:var(--space-3); margin:0 0 var(--space-6); padding:0; list-style:none; }
  .stations li { display:grid; grid-template-columns:32px 1fr auto; gap:var(--space-3); align-items:center; min-height:68px; padding:var(--space-3) var(--space-4); background:var(--surface-raised); box-shadow:inset 0 0 0 1px var(--border-subtle); }
  .stations li.approved { background:rgba(201,168,106,.08); box-shadow:inset 4px 0 0 rgba(201,168,106,.72), inset 0 0 0 1px rgba(201,168,106,.18); }
  .station-number { color:var(--text-muted); font:var(--text-sm)/1 var(--font-mono); }
  .stations strong { display:block; font-size:var(--text-base); font-weight:500; }
  .stations small { color:var(--text-muted); font-size:var(--text-sm); }
  .dog { min-width:52px; padding:var(--space-2); background:var(--base); color:var(--text-muted); font:var(--text-xs)/1 var(--font-mono); text-align:center; letter-spacing:.08em; }
  .approved .dog { color:var(--base); background:var(--brass); box-shadow:0 0 22px rgba(201,168,106,.12); }
  .action-proof { padding:var(--space-5); background:var(--base); border-top:4px solid rgba(201,168,106,.42); box-shadow:inset 0 0 0 1px var(--border-subtle); }
  h3 { margin:var(--space-2) 0 var(--space-5); font-size:var(--text-xl); }
  dl { display:grid; gap:var(--space-3); margin:0; }
  dl div { display:flex; justify-content:space-between; gap:var(--space-4); }
  dt { color:var(--text-muted); font-size:var(--text-sm); }
  dd { margin:0; color:var(--paper); font:var(--text-sm)/1.4 var(--font-mono); text-align:right; }
  .primary { width:100%; min-height:52px; margin-top:var(--space-5); padding:0 var(--space-5); border:0; background:var(--brass); color:var(--base); font:600 var(--text-sm)/1 var(--font-ui); letter-spacing:.02em; box-shadow:var(--shadow-button), 0 0 30px rgba(201,168,106,.15); transition:transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out), background-color 160ms var(--ease-out); }
  .primary:active { transform:scale(.97); transition-duration:80ms; }
  .primary:disabled { color:var(--text-disabled); background:var(--surface-overlay); box-shadow:none; cursor:not-allowed; }
  .button-reason, .demo-note { margin:var(--space-3) 0 0; color:var(--text-muted); font-size:var(--text-sm); line-height:1.5; }
  .wallet-state { display:flex; justify-content:space-between; align-items:center; gap:var(--space-4); margin-top:var(--space-5); color:var(--text-secondary); font-size:var(--text-sm); }
  .wallet-state p { margin:0; }
  .wallet-state code { color:var(--brass); font-size:var(--text-sm); }
  .inline-error { margin-top:var(--space-4); padding:var(--space-4); border-left:4px solid var(--breach); background:rgba(216,116,97,.08); }
  .inline-error p { margin:var(--space-1) 0 0; color:var(--text-secondary); font-size:var(--text-sm); }
  @media (hover:hover) { .primary:not(:disabled):hover { transform:translateY(-1px); background:var(--brass-bright); box-shadow:var(--shadow-button), 0 0 36px rgba(201,168,106,.2); } }
  @media (max-width:420px) {
    .rail { padding:var(--space-4); }
    header { display:block; }
    .tee { margin-top:var(--space-3); }
    .stations li { grid-template-columns:24px minmax(0,1fr) auto; gap:var(--space-2); padding:var(--space-3); }
    .stations small { display:block; overflow-wrap:anywhere; }
    .action-proof { padding:var(--space-4); }
    dl div { align-items:baseline; }
    dd { overflow-wrap:anywhere; }
  }
</style>
