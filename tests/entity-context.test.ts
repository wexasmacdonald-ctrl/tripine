import { describe, expect, it } from "vitest";
import { findCompanyMentions } from "../src/domain/business-context/mentions";

describe("business entity context", () => {
  const companies = [{ id: "abc", name: "ABC Manufacturing" }, { id: "acme", name: "Acme Supply" }];

  it("resolves a full company name", () => {
    expect(findCompanyMentions(companies, "What happened with ABC Manufacturing?").map((item) => item.id)).toEqual(["abc"]);
  });

  it("resolves a business shorthand on a word boundary", () => {
    expect(findCompanyMentions(companies, "What happened with ABC?").map((item) => item.id)).toEqual(["abc"]);
  });

  it("does not match shorthand embedded in another word", () => {
    expect(findCompanyMentions(companies, "This alphabet is unrelated.")).toEqual([]);
  });
});
