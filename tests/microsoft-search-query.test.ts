import { describe, expect, it } from "vitest";
import { buildMicrosoftMailSearchQueries, buildMicrosoftSearchQueries, fileNameMatchesQuery } from "../src/connectors/microsoft/graph/search-query";

describe("Microsoft workplace search queries", () => {
  it("reduces a natural employee request to the business document identity", () => {
    expect(buildMicrosoftSearchQueries(
      "RE: Find ABC Manufacturing Quote v3",
      "Alex, please check our Microsoft files and Outlook for the latest quote and tell me whether Sarah replied.",
    )).toEqual({
      fileQuery: "ABC Manufacturing Quote v3",
      emailQuery: "ABC Manufacturing Quote v3 Sarah replied",
    });
  });

  it("uses the message body when the subject is generic", () => {
    expect(buildMicrosoftSearchQueries("Question", "Can you find the Acme Supply pricing change?").fileQuery)
      .toBe("Acme Supply pricing change");
  });

  it("ignores conversational test wording around the business entity", () => {
    expect(buildMicrosoftSearchQueries(undefined, "Search the real Microsoft files now. Find the latest ABC Manufacturing quote, state the verified amount, and tell me whether Sarah replied about installation."))
      .toEqual({ fileQuery: "ABC Manufacturing quote", emailQuery: "ABC Manufacturing quote Sarah replied installation" });
  });

  it("does not overconstrain file search with email workflow wording after the document type", () => {
    expect(buildMicrosoftSearchQueries(
      "ABC quote final channel verification",
      "Verify the latest shared ABC Manufacturing quote using live Microsoft files.",
    ).fileQuery).toBe("ABC quote");
  });

  it("adds a participant fallback so differently worded replies are discoverable", () => {
    expect(buildMicrosoftMailSearchQueries(
      "Sarah ABC Manufacturing quote confirmed asked",
      "Sarah ABC",
    )).toEqual([
      "Sarah ABC Manufacturing quote confirmed asked",
      "Sarah ABC",
      "Sarah",
    ]);
  });

  it("matches a recently created root file without relying on search indexing", () => {
    expect(fileNameMatchesQuery("ABC Manufacturing Quote v3.txt", "ABC Manufacturing Quote v3")).toBe(true);
    expect(fileNameMatchesQuery("Unrelated Customer Contract.pdf", "ABC Manufacturing Quote v3")).toBe(false);
  });
});
