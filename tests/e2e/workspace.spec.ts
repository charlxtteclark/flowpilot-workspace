import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const APP = "file://" + path.resolve("dist/index.html");
const CSV = readFileSync("src/data/flowpilot_feedback.csv", "utf8");
const open = async (p: Page, view = "overview") => { await p.goto(`${APP}#${view}`); await expect(p.getByTestId("comment-count")).toHaveText("90"); };

test("demo loads with FlowPilot data and leads with recommendations", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: "What should I investigate first?" })).toBeVisible();
  await expect(page.locator("article h3").first()).toHaveText("Salesforce integration reliability");
  await expect(page.locator("article").first()).toContainText("10 comments · Avg rating 1.5/5 · 4 cancellations");
  await expect(page.getByText("Frequency vs. Priority")).toBeVisible();
  await expect(page.getByTestId("quality")).not.toContainText("failed");
  await expect(page.getByTestId("fields-used")).toContainText("Customer lifetime value");
});

test("verbatims come straight from the dataset", async ({ page }) => {
  await open(page, "evidence");
  for (const name of ["Salesforce integration", "Mobile login", "Dashboard customization"]) {
    await page.getByRole("navigation", { name: "Issues" }).getByText(name).click();
    const quotes = page.getByTestId("verbatim");
    const n = await quotes.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const txt = (await quotes.nth(i).locator("blockquote span").last().innerText()).replace(/^“|”$/g, "");
      expect(CSV).toContain(txt);
    }
  }
});

test("filters change the analysis scope", async ({ page }) => {
  await open(page);
  await page.locator("#f-cancel").selectOption("yes");
  await expect(page.getByTestId("scope-count")).toHaveText("4 of 90 comments");
  await expect(page.getByTestId("priority-table").locator("tbody tr")).toHaveCount(1);
  await page.getByText("Clear filters").click();
  await page.locator("#f-seg").click();
  await page.getByRole("listbox", { name: "Segment" }).getByText("Startup").click();
  await expect(page.getByTestId("scope-count")).toContainText("of 90 comments");
  await expect(page.getByTestId("priority-table")).not.toContainText("Permissions");
});

test("review changes are saved, logged and persist across reloads", async ({ page }) => {
  await open(page, "problems");
  const row = page.getByTestId("problems-table").locator("tr", { hasText: "Salesforce integration reliability" }).first();
  await row.getByRole("button", { name: "Review" }).click();
  const rc = page.getByTestId("review-controls");
  await rc.getByRole("radio", { name: /Medium/ }).click();
  await rc.locator("input").first().fill("Salesforce sync trust");
  await rc.locator("textarea").fill("Already committed to Q4 roadmap");
  await rc.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText("Review saved.")).toBeVisible();

  // Approve another recommendation as-is
  const row2 = page.getByTestId("problems-table").locator("tr", { hasText: "Mobile login failures" }).first();
  await row2.getByRole("button", { name: "Review" }).click();
  await page.getByTestId("review-controls").getByRole("button", { name: "Approve recommendation" }).click();

  await page.reload();
  await expect(page.getByTestId("comment-count")).toHaveText("90");
  await page.goto(`${APP}#history`);
  const h = page.getByTestId("history-table");
  await expect(h).toContainText("Salesforce sync trust");
  await expect(h).toContainText("High priority");
  await expect(h).toContainText("Medium priority");
  await expect(h).toContainText("Already committed to Q4 roadmap");
  await expect(h).toContainText("Approved as recommended");
  await page.goto(`${APP}#overview`);
  await expect(page.getByTestId("priority-table")).toContainText("Salesforce sync trust");
  await expect(page.getByTestId("priority-table")).toContainText("sys: High");
  await expect(page.getByText("Changed by reviewer").first()).toBeVisible();
});

test("upload another CSV, including one with missing metadata", async ({ page }, info) => {
  await open(page);
  await page.getByTestId("csv-input").setInputFiles("src/data/flowpilot_comments_only.csv");
  await expect(page.getByTestId("dataset-name")).toHaveText("flowpilot_comments_only");
  await expect(page.getByTestId("fields-used")).toContainText("Cancellation status");
  await expect(page.locator("article").first()).toContainText("Not available in this dataset");
  await expect(page.getByTestId("quality")).not.toContainText("failed");
  const small = info.outputPath("tiny.csv");
  writeFileSync(small, 'Review,Stars,Category\n"Sync keeps failing, we may cancel",1,Integrations\nLove the templates,5,Templates\nLogin broken on mobile,2,Mobile\n');
  await page.getByTestId("csv-input").setInputFiles(small);
  await expect(page.getByTestId("comment-count")).toHaveText("3");
  await page.goto(`${APP}#history`);
  await expect(page.getByTestId("analyses-table").locator("tbody tr")).not.toHaveCount(0);
});

test("instructions can be edited and reset", async ({ page }) => {
  await open(page, "instructions");
  const ta = page.getByTestId("instructions-text");
  await ta.fill("Focus on enterprise churn.");
  await page.getByRole("button", { name: "Save instructions" }).click();
  await page.reload();
  await expect(page.getByTestId("instructions-text")).toHaveValue("Focus on enterprise churn.");
  await page.getByRole("button", { name: "Reset to recommended instructions" }).click();
  await expect(page.getByTestId("instructions-text")).toHaveValue(/You are helping a product manager/);
});
