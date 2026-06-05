import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

describe("UI copy guardrails", () => {
  it("does not include prohibited quality-score or win-rate copy", () => {
    const files = [
      "app/page.tsx",
      "src/lib/review.ts",
      "src/lib/constants.ts",
      "ftp-site/index.html",
      "ftp-site/about.html"
    ].map((file) => readFileSync(join(repoRoot, file), "utf8"));
    const combined = files.join("\n").toLowerCase();

    expect(combined).not.toContain("quality score");
    expect(combined).not.toContain("win-rate");
    expect(combined).not.toContain("improve your odds");
    expect(combined).not.toContain("predict winning");
  });
});
