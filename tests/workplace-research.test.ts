import { describe, expect, it } from "vitest";
import { boundWorkplaceEvidence, shouldResearchWorkplace } from "../src/agent/context/workplace-research";

describe("web workplace research", () => {
  it("recognizes requests that require Microsoft workplace evidence", () => {
    expect(shouldResearchWorkplace("Find the latest ABC quote and tell me whether Sarah replied")).toBe(true);
    expect(shouldResearchWorkplace("What am I still waiting on?")).toBe(false);
  });

  it("bounds untrusted evidence before it enters model context", () => {
    const bounded = boundWorkplaceEvidence({
      query: "ABC Manufacturing Quote v3",
      emails: [{ excerpt: "e".repeat(2_000) }],
      files: [{ excerpt: "f".repeat(7_000) }],
    });
    expect(bounded.emails[0].excerpt).toHaveLength(1_500);
    expect(bounded.files[0].excerpt).toHaveLength(6_000);
  });
});
