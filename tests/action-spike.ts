import { runActionSpike } from "./spike-core.js";

runActionSpike().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

