<script lang="ts">
  import StatusGlyph from "./StatusGlyph.svelte";
  let { scenario }: { scenario: import("../lib/scenario.js").IncidentScenario } = $props();

  const baseEvents = [
    ["21:04:11.022", "SOLANA / SLOT 401,884,120", "Vault account subscribed at confirmed commitment"],
    ["21:04:13.467", "TEST VAULT / WITHDRAWAL 01", "250 units left the 1,000 unit vault"],
    ["21:04:13.512", "DETECTOR / EVIDENCE", "Sequence 1 reconstructed against current account state"],
    ["21:04:14.806", "HOLDFAST / INCIDENT 01", "Evidence receipt opened on Solana"],
    ["21:04:18.140", "MAGICBLOCK / PRIVATE ER", "Permissioned response room available"],
  ];
</script>

<section class="watch" id="evidence" aria-labelledby="evidence-heading">
  <header class="section-heading">
    <div>
      <p class="eyebrow">Watch log / Incident 01</p>
      <h1 id="evidence-heading">{scenario.headline}</h1>
    </div>
    <div class="source-state"><StatusGlyph state={scenario.stale ? "pending" : "neutral"} /> {scenario.stale ? "RPC stale" : "Replay fixture"}</div>
  </header>

  {#if scenario.name === "loading"}
    <div class="skeleton" aria-label="Loading incident evidence"><i></i><i></i><i></i><i></i></div>
  {:else if scenario.name === "error"}
    <div class="failure" role="alert">
      <strong>Solana RPC read failed</strong>
      <p>The last observation is stale. Holdfast cannot describe the vault as safe.</p>
      <button type="button" onclick={() => location.reload()}>Retry public read</button>
    </div>
  {:else}
    <div class="invariant" class:quiet={scenario.name === "watching"}>
      <div class="equation">
        <span class="amount">{scenario.name === "watching" ? "≤ 200" : "250"}</span>
        <span class="operator">/</span>
        <span>1,000</span>
        <span class="operator">=</span>
        <span class="result">{scenario.name === "watching" ? "≤ 20%" : "25%"}</span>
      </div>
      <p>{scenario.name === "watching" ? "No observed withdrawal exceeds the configured boundary." : "Strict breach confirmed. The policy triggers only above 20%."}</p>
      <dl>
        <div><dt>Vault</dt><dd>H9pE…ZaBy</dd></div>
        <div><dt>Sequence</dt><dd>0001</dd></div>
        <div><dt>Evidence</dt><dd>7f32…c18e</dd></div>
        <div><dt>Observed slot</dt><dd>401,884,124</dd></div>
      </dl>
    </div>

    <ol class="ledger" aria-label="Incident evidence log">
      {#each baseEvents as event, index}
        <li class:future={scenario.name === "watching" && index > 0}>
          <time>{event[0]}</time>
          <div><strong>{event[1]}</strong><p>{event[2]}</p></div>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .watch { min-width:0; padding:var(--space-6); background:linear-gradient(145deg, rgba(25,32,39,.96), rgba(17,22,26,.98)); box-shadow:var(--shadow-xl), inset 0 0 0 1px var(--border-subtle); }
  .section-heading { display:flex; justify-content:space-between; gap:var(--space-5); align-items:flex-start; padding-bottom:var(--space-6); border-bottom:1px solid var(--border-default); }
  h1 { margin:var(--space-2) 0 0; max-width:18ch; font-size:clamp(24px, 3vw, 36px); line-height:1.12; letter-spacing:-.03em; font-weight:600; }
  .eyebrow, .source-state { margin:0; font-size:var(--text-xs); letter-spacing:.08em; text-transform:uppercase; color:var(--text-muted); }
  .source-state { display:flex; gap:var(--space-2); align-items:center; min-height:44px; white-space:nowrap; }
  .invariant { margin:var(--space-6) 0; padding:var(--space-6); background:rgba(216,116,97,.07); border-left:4px solid rgba(216,116,97,.72); box-shadow:inset 0 0 0 1px rgba(216,116,97,.16); }
  .invariant.quiet { background:rgba(201,168,106,.05); border-color:rgba(201,168,106,.45); box-shadow:inset 0 0 0 1px rgba(201,168,106,.15); }
  .equation { display:flex; flex-wrap:wrap; align-items:baseline; gap:var(--space-3); color:var(--text-secondary); font:500 clamp(24px,4vw,48px)/1.1 var(--font-mono); letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
  .amount, .result { color:var(--breach); }
  .quiet .amount, .quiet .result { color:var(--brass); }
  .operator { font-size:.5em; color:var(--text-muted); }
  .invariant > p { max-width:60ch; margin:var(--space-4) 0 var(--space-5); color:var(--text-secondary); }
  dl { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--space-4); margin:0; }
  dl div { min-width:0; }
  dt { color:var(--text-muted); font-size:var(--text-xs); letter-spacing:.06em; text-transform:uppercase; }
  dd { margin:var(--space-2) 0 0; overflow:hidden; text-overflow:ellipsis; color:var(--paper); font:var(--text-sm)/1.4 var(--font-mono); font-variant-numeric:tabular-nums; }
  .ledger { list-style:none; margin:0; padding:0; }
  .ledger li { display:grid; grid-template-columns:112px 16px 1fr; gap:var(--space-3); position:relative; min-height:80px; }
  .ledger li::before { content:""; grid-column:2; grid-row:1; width:7px; height:7px; margin-top:5px; background:var(--brass); box-shadow:0 0 0 4px rgba(201,168,106,.10); }
  .ledger li::after { content:""; position:absolute; left:119px; top:20px; bottom:0; width:1px; background:var(--border-default); }
  .ledger li:last-child::after { display:none; }
  .ledger time { font:var(--text-sm)/1.4 var(--font-mono); color:var(--text-muted); }
  .ledger strong { display:block; color:var(--paper); font-size:var(--text-sm); letter-spacing:.04em; }
  .ledger p { margin:var(--space-1) 0 0; color:var(--text-secondary); font-size:var(--text-sm); }
  .ledger .future { opacity:.28; }
  .skeleton { display:grid; gap:var(--space-4); padding:var(--space-8) 0; }
  .skeleton i { display:block; height:24px; background:linear-gradient(90deg,var(--surface-raised),var(--surface-overlay),var(--surface-raised)); background-size:200% 100%; animation:shimmer 1.5s ease-in-out infinite; }
  .skeleton i:first-child { height:120px; }
  .failure { margin-top:var(--space-6); padding:var(--space-6); border-left:4px solid var(--pending); background:rgba(214,168,95,.08); }
  .failure p { color:var(--text-secondary); }
  .failure button { min-height:44px; padding:0 var(--space-4); color:var(--paper); background:var(--surface-overlay); border:1px solid var(--border-strong); }
  @keyframes shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
  @media (max-width:760px) {
    .watch { padding:var(--space-5); overflow:hidden; }
    .section-heading { display:block; }
    .source-state { margin-top:var(--space-3); }
    .invariant { padding:var(--space-5); }
    dl { grid-template-columns:1fr 1fr; }
    .ledger li { grid-template-columns:92px 12px minmax(0,1fr); }
    .ledger li::after { left:97px; }
    .ledger li > div { min-width:0; }
    .ledger strong,.ledger p { overflow-wrap:anywhere; }
  }
  @media (max-width:420px) {
    .watch { padding:var(--space-4); }
    .invariant { margin:var(--space-5) 0; padding:var(--space-4); }
    .equation { gap:var(--space-2); font-size:clamp(23px,8vw,32px); }
    .ledger li { grid-template-columns:76px 8px minmax(0,1fr); gap:var(--space-2); }
    .ledger li::after { left:79px; }
    .ledger time,.ledger strong,.ledger p { font-size:12px; }
  }
  @media (prefers-reduced-motion:reduce) { .skeleton i { animation:none; } }
</style>
