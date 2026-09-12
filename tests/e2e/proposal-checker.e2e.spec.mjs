import { expect, test } from "@playwright/test";

const solicitation = [
  "Project Narrative must include a dissemination plan.",
  "Total budget must not exceed $100,000.",
  "Applicants must attach current resumes."
].join("\n");
const proposal = "Project Narrative\nOur goals are listed but no distribution details are included.\n\nBudget\nThe budget requests $120,000.";

async function fillDocuments(page, solicitationValue = solicitation, proposalValue = proposal) {
  await page.locator("#solicitationText").fill(solicitationValue);
  await page.locator("#proposalText").fill(proposalValue);
}

async function runReview(page, solicitationValue = solicitation, proposalValue = proposal) {
  await fillDocuments(page, solicitationValue, proposalValue);
  await page.getByRole("button", { name: "Run compliance review" }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 15_000 });
}

test("U01 public interface states the human decision boundary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Proposal Completeness & Compliance Checker" })).toBeVisible();
  await expect(page.getByText("A human reviewer decides what matters")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not assessed by this tool" })).toBeVisible();
});

test("U02 review remains unavailable until both documents are supplied", async ({ page }) => {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "Run compliance review" });
  await expect(submit).toBeDisabled();
  await page.locator("#solicitationText").fill(solicitation);
  await expect(submit).toBeDisabled();
  await page.locator("#proposalText").fill(proposal);
  await expect(submit).toBeEnabled();
});

test("U03 pasted documents complete the browser-to-review flow", async ({ page }) => {
  await page.goto("/");
  await runReview(page);
  await expect(page.locator("tbody tr")).toHaveCount(3);
});

test("U04 a missing narrative requirement is explicit", async ({ page }) => {
  await page.goto("/");
  await runReview(page);
  const row = page.locator("tbody tr").filter({ hasText: "Include a dissemination plan" });
  await expect(row).toContainText("MISSING");
  await expect(row).toContainText("No dissemination plan is present");
});

test("U05 an over-limit budget is reported as non-compliant", async ({ page }) => {
  await page.goto("/");
  await runReview(page);
  const row = page.locator("tbody tr").filter({ hasText: "Budget may not exceed" });
  await expect(row).toContainText("NON-COMPLIANT");
  await expect(row).toContainText("$120,000");
});

test("U06 the report names every reviewed section", async ({ page }) => {
  await page.goto("/");
  await runReview(page);
  await expect(page.locator(".report-meta")).toHaveText("3 sections reviewed");
  await expect(page.locator("tbody")).toContainText("Project Narrative");
  await expect(page.locator("tbody")).toContainText("Budget");
  await expect(page.locator("tbody")).toContainText("Full draft");
});

test("U07 every finding keeps the supporting solicitation requirement visible", async ({ page }) => {
  await page.goto("/");
  await runReview(page);
  await expect(page.locator(".citation")).toHaveCount(3);
  await expect(page.locator(".citation").first()).toContainText("must include a dissemination plan");
});

test("U08 attachment uncertainty is routed to a human", async ({ page }) => {
  await page.goto("/");
  await runReview(page);
  const row = page.locator("tbody tr").filter({ hasText: "Attach current resumes" });
  await expect(row).toContainText("NEEDS HUMAN REVIEW");
  await expect(row).toContainText("Confirm the final upload package");
});

test("U09 a corrected second draft replaces the earlier report", async ({ page }) => {
  await page.goto("/");
  await runReview(page);
  await page.locator("#proposalText").fill("Full draft\nThe dissemination plan assigns quarterly outreach. The budget requests $90,000.");
  await page.getByRole("button", { name: "Run compliance review" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: "Include a dissemination plan" })).toContainText("PRESENT");
  await expect(page.locator("tbody tr").filter({ hasText: "Budget may not exceed" })).toContainText("PRESENT");
});

test("U10 the research caveat and source remain visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".caveat")).toContainText("6-proposal preprint");
  await expect(page.getByRole("link", { name: "arXiv 2603.08281" })).toHaveAttribute("href", /^https:\/\/arxiv\.org\//);
});

test("A01 an empty multipart request fails closed", async ({ request }) => {
  const response = await request.post("/api/review", { multipart: {} });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatch(/both the solicitation and the draft/i);
});

test("A02 a one-document request cannot start a review", async ({ request }) => {
  const response = await request.post("/api/review", { multipart: { solicitationText: solicitation } });
  expect(response.status()).toBe(400);
});

test("A03 a non-PDF upload is rejected as user input", async ({ request }) => {
  const response = await request.post("/api/review", { multipart: {
    solicitationText: solicitation,
    proposalFile: { name: "proposal.txt", mimeType: "text/plain", buffer: Buffer.from(proposal) }
  } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain("must be a PDF");
});

test("A04 an oversized submission is rejected before model work", async ({ request }) => {
  const response = await request.post("/api/review", { multipart: {
    solicitationText: solicitation,
    proposalText: "x".repeat(2 * 1024 * 1024)
  } });
  expect(response.status()).toBe(413);
});

test("A05 malformed model JSON produces a bounded recovery message", async ({ page }) => {
  await page.goto("/");
  await fillDocuments(page, `${solicitation}\nMALFORMED_MODEL_OUTPUT`, proposal);
  await page.getByRole("button", { name: "Run compliance review" }).click();
  await expect(page.locator(".error")).toContainText("review could not be completed");
  await expect(page.locator(".error")).not.toContainText(/SyntaxError|JSON\.parse|node_modules/);
});

test("A06 invalid model categories cannot enter the report", async ({ page }) => {
  await page.goto("/");
  await fillDocuments(page, solicitation, `${proposal}\nINVALID_MODEL_STATUS`);
  await page.getByRole("button", { name: "Run compliance review" }).click();
  await expect(page.locator(".error")).toContainText("review could not be completed");
  await expect(page.getByText("WINNER")).toHaveCount(0);
});

test("A07 upstream provider failure leaves a manual-review route", async ({ page }) => {
  await page.goto("/");
  await fillDocuments(page, `${solicitation}\nUPSTREAM_FAILURE`, proposal);
  await page.getByRole("button", { name: "Run compliance review" }).click();
  await expect(page.locator(".error")).toContainText("review the documents manually");
  await expect(page.getByRole("button", { name: "Run compliance review" })).toBeEnabled();
});

test("A08 active HTML returned as evidence stays inert", async ({ page }) => {
  await page.goto("/");
  await runReview(page, solicitation, "Full draft\n<img src=x onerror=window.__pwned=true>");
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("<img src=x");
});

test("A09 unknown routes and unsupported methods fail closed", async ({ request }) => {
  const [unknown, method] = await Promise.all([
    request.get("/api/not-a-route"),
    request.put("/api/review", { data: {} })
  ]);
  expect(unknown.status()).toBe(404);
  expect(method.status()).toBe(405);
});

test("A10 API failures omit credentials and set defensive headers", async ({ request }) => {
  const response = await request.post("/api/review", { multipart: {
    solicitationText: `${solicitation}\nMALFORMED_MODEL_OUTPUT`,
    proposalText: proposal
  } });
  const body = await response.text();
  expect(response.status()).toBe(502);
  expect(body).not.toMatch(/OPENAI_API_KEY|e2e-fixture-key|authorization|node_modules|SyntaxError/);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
