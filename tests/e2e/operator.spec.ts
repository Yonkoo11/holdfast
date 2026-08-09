import { expect, test } from "@playwright/test";

test("response room presents a fixed action and incomplete quorum", async ({ page }) => {
  await page.goto("/?scenario=response");

  await expect(page.getByRole("heading", { name: "Withdrawal 01 breached vault invariant" })).toBeVisible();
  await expect(page.getByLabel("1 of 2 approvals")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pause test vault" })).toBeVisible();
  await expect(page.getByText("One distinct responder still required")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect responder wallet" })).toBeEnabled();
});

test("committed state does not claim containment", async ({ page }) => {
  await page.goto("/?scenario=committed");

  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Unpaused", { exact: true })).toBeVisible();
  await expect(page.getByText("Containment confirmed.")).toHaveCount(0);
});

test("contained state requires both receipt execution and paused vault", async ({ page }) => {
  await page.goto("/?scenario=contained");

  await expect(page.getByText("Executed", { exact: true })).toBeVisible();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(page.getByText("Containment confirmed.")).toBeVisible();
});

test("failed action names the unresolved public state", async ({ page }) => {
  await page.goto("/?scenario=failed");

  await expect(page.getByRole("alert")).toContainText("Pause did not execute");
  await expect(page.getByRole("alert")).toContainText("vault remains unpaused");
});

test("RPC error stays explicit and retryable", async ({ page }) => {
  await page.goto("/?scenario=error");

  await expect(page.getByRole("alert")).toContainText("Solana RPC read failed");
  await expect(page.getByRole("button", { name: "Retry public read" })).toBeVisible();
  await expect(page.getByText("RPC stale")).toBeVisible();
});

test("missing injected wallet produces a useful inline error", async ({ page }) => {
  await page.goto("/?scenario=response");
  await page.getByRole("button", { name: "Connect responder wallet" }).click();

  await expect(page.getByRole("alert")).toContainText("Wallet not connected");
  await expect(page.getByRole("alert")).toContainText("Solana wallet");
});

test("scenario control changes the evidence model and URL", async ({ page }) => {
  await page.goto("/?scenario=response");
  await page.getByLabel("Local evidence state").selectOption("contained");

  await expect(page).toHaveURL(/scenario=contained/);
  await expect(page.getByRole("heading", { name: "Vault pause confirmed on Solana" })).toBeVisible();
});

test("mobile board has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?scenario=response");

  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(width.document).toBe(width.viewport);
  expect(width.body).toBe(width.viewport);
  await expect(page.getByRole("heading", { name: "Withdrawal 01 breached vault invariant" })).toBeVisible();
});
