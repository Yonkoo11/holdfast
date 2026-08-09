import { runFailedActionSpike } from "./spike-core.js";

runFailedActionSpike().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
