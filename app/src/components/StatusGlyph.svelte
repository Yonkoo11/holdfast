<script lang="ts">
  let { state = "neutral" }: { state?: "neutral" | "breach" | "pending" | "contained" } = $props();
</script>

<span class:breach={state === "breach"} class:pending={state === "pending"} class:contained={state === "contained"} aria-hidden="true"></span>

<style>
  span { display:inline-block; width:8px; height:8px; background:var(--text-muted); box-shadow:0 0 0 3px rgba(150,147,139,.12); }
  .breach { background:var(--breach); box-shadow:0 0 0 3px rgba(216,116,97,.14), 0 0 18px rgba(216,116,97,.16); }
  .pending { background:var(--pending); box-shadow:0 0 0 3px rgba(214,168,95,.14), 0 0 18px rgba(214,168,95,.14); }
  .contained { background:var(--contained); box-shadow:0 0 0 3px rgba(114,168,137,.14), 0 0 18px rgba(114,168,137,.14); }
</style>
