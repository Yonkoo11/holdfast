import { runPrivacySpike } from "./spike-core.js";

runPrivacySpike().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

