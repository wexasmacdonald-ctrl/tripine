import { describe, expect, it } from "vitest";
import { dedupeLatestNamedFiles, normalizeDriveResource, rankAndMergeDriveHits } from "../src/connectors/microsoft/graph/drive-results";

describe("Microsoft drive result normalization", () => {
  it("uses the real remote item identity for files shared with Alex", () => {
    const result = normalizeDriveResource({
      id: "shortcut",
      name: "ABC Manufacturing Quote v3.txt",
      remoteItem: { id: "shared-file", parentReference: { driveId: "connor-drive" }, size: 547 },
    });
    expect(result.id).toBe("shared-file");
    expect(result.parentReference?.driveId).toBe("connor-drive");
    expect(result.name).toBe("ABC Manufacturing Quote v3.txt");
  });

  it("ranks a newer exact-name match ahead of an older duplicate", () => {
    const hits = rankAndMergeDriveHits("ABC Manufacturing Quote", [
      { resource: { id: "old", name: "ABC Manufacturing Quote v3.txt", lastModifiedDateTime: "2026-08-14T00:00:00Z", parentReference: { driveId: "alex" } } },
      { resource: { id: "new", name: "ABC Manufacturing Quote v3.txt", lastModifiedDateTime: "2026-08-17T00:00:00Z", parentReference: { driveId: "connor" } } },
    ]);
    expect(hits.map((hit) => hit.resource?.id)).toEqual(["new", "old"]);
  });

  it("keeps the readable copy when duplicate names are returned", () => {
    const files = dedupeLatestNamedFiles([
      { name: "ABC Manufacturing Quote v3.txt", modifiedAt: "2026-08-14T00:00:00Z", excerpt: "" },
      { name: "ABC Manufacturing Quote v3.txt", modifiedAt: "2026-08-17T00:00:00Z", excerpt: "Quote total: $18,500 CAD" },
    ]);
    expect(files).toHaveLength(1);
    expect(files[0].excerpt).toContain("18,500");
  });
});
