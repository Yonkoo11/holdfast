import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const baseURL = "http://127.0.0.1:4183";
const checks = [];
let server;
let browser;

async function check(name, run) {
  await run();
  checks.push(name);
  console.log(`PASS ${name}`);
}

try {
  server = await createServer({
    configFile: `${root}vite.config.ts`,
    server: { host: "127.0.0.1", port: 4183, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await check("response room shows fixed action and incomplete quorum", async () => {
    await page.goto(`${baseURL}/?scenario=response`);
    assert.equal(await page.getByRole("heading", { name: "Withdrawal 01 breached vault invariant" }).isVisible(), true);
    assert.equal(await page.getByLabel("1 of 2 approvals").isVisible(), true);
    assert.equal(await page.getByRole("heading", { name: "Pause test vault" }).isVisible(), true);
  });

  await check("committed is not presented as contained", async () => {
    await page.goto(`${baseURL}/?scenario=committed`);
    assert.equal(await page.getByText("Unpaused", { exact: true }).isVisible(), true);
    assert.equal(await page.getByText("Containment confirmed.").count(), 0);
  });

  await check("contained requires an executed receipt and paused vault", async () => {
    await page.goto(`${baseURL}/?scenario=contained`);
    assert.equal(await page.getByText("Executed", { exact: true }).isVisible(), true);
    assert.equal(await page.getByText("Paused", { exact: true }).isVisible(), true);
    assert.equal(await page.getByText("Containment confirmed.").isVisible(), true);
  });

  await check("failed action names the unresolved public state", async () => {
    await page.goto(`${baseURL}/?scenario=failed`);
    const alert = page.getByRole("alert");
    assert.match(await alert.innerText(), /Pause did not execute/);
    assert.match(await alert.innerText(), /vault remains unpaused/);
  });

  await check("RPC failure remains explicit and retryable", async () => {
    await page.goto(`${baseURL}/?scenario=error`);
    assert.match(await page.getByRole("alert").innerText(), /Solana RPC read failed/);
    assert.equal(await page.getByRole("button", { name: "Retry public read" }).isVisible(), true);
  });

  await check("missing wallet has actionable recovery copy", async () => {
    await page.goto(`${baseURL}/?scenario=response`);
    await page.getByRole("button", { name: "Connect responder wallet" }).click();
    assert.match(await page.getByRole("alert").innerText(), /No compatible Solana wallet was found/);
  });

  await check("scenario control updates state and URL", async () => {
    await page.getByLabel("Local evidence state").selectOption("contained");
    assert.match(page.url(), /scenario=contained/);
    assert.equal(await page.getByRole("heading", { name: "Vault pause confirmed on Solana" }).isVisible(), true);
  });

  await check("375px viewport has no horizontal overflow", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseURL}/?scenario=response`);
    const widths = await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth, document.body.scrollWidth]);
    assert.deepEqual(widths, [375, 375, 375]);
  });

  await check("wallet-free Devnet proof requires matching receipt and vault state", async () => {
    const receipt = Buffer.alloc(153);
    Buffer.from("3423106fc3281045", "hex").copy(receipt, 0);
    receipt.writeBigUInt64LE(7n, 40);
    receipt.writeUInt8(1, 144);
    receipt.writeBigUInt64LE(482_432_895n, 145);
    const vault = Buffer.alloc(105);
    Buffer.from("d308e82b02987577", "hex").copy(vault, 0);
    vault.writeBigUInt64LE(7n, 96);
    vault.writeUInt8(1, 104);
    await page.route("https://rpc.magicblock.app/devnet", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "holdfast-public-replay",
        result: {
          context: { slot: 482_500_000 },
          value: [
            { owner: "EjU7sFMStj15r1NVrzgVbRJBdjUTUGbgyzHvFzEaaZuz", data: [receipt.toString("base64"), "base64"] },
            { owner: "H9pEwKaL9JwCjYj1ZgmVbZ6AAHHRyXMd4HZfSi1GZaBy", data: [vault.toString("base64"), "base64"] },
          ],
        },
      }),
    }));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${baseURL}/?scenario=response`);
    await page.getByRole("button", { name: "Verify Devnet proof" }).click();
    await page.getByText("Receipt and vault agree").waitFor();
    assert.match(await page.getByText(/Incident 7 executed/).innerText(), /observed at 482500000/);
    await page.unroute("https://rpc.magicblock.app/devnet");
  });

  await check("Devnet proof rejects mismatched incident state", async () => {
    const receipt = Buffer.alloc(153);
    Buffer.from("3423106fc3281045", "hex").copy(receipt, 0);
    receipt.writeBigUInt64LE(7n, 40);
    receipt.writeUInt8(1, 144);
    receipt.writeBigUInt64LE(482_432_895n, 145);
    const vault = Buffer.alloc(105);
    Buffer.from("d308e82b02987577", "hex").copy(vault, 0);
    vault.writeBigUInt64LE(8n, 96);
    vault.writeUInt8(1, 104);
    await page.route("https://rpc.magicblock.app/devnet", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "holdfast-public-replay",
        result: {
          context: { slot: 482_500_001 },
          value: [
            { owner: "EjU7sFMStj15r1NVrzgVbRJBdjUTUGbgyzHvFzEaaZuz", data: [receipt.toString("base64"), "base64"] },
            { owner: "H9pEwKaL9JwCjYj1ZgmVbZ6AAHHRyXMd4HZfSi1GZaBy", data: [vault.toString("base64"), "base64"] },
          ],
        },
      }),
    }));
    await page.goto(`${baseURL}/?scenario=response`);
    await page.getByRole("button", { name: "Verify Devnet proof" }).click();
    await page.getByText("Proof read unavailable").waitFor();
    assert.match(await page.getByText(/do not jointly prove containment/).innerText(), /do not jointly prove containment/);
    await page.unroute("https://rpc.magicblock.app/devnet");
  });

  console.log(`Browser gate passed: ${checks.length} checks`);
} finally {
  await browser?.close();
  await server?.close();
}
