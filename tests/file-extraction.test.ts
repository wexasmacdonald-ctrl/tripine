import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractDocumentText, MAX_EXTRACTED_CHARACTERS, supportsTextExtraction } from "../src/connectors/microsoft/files/extract-text";

describe("business document extraction", () => {
  it("extracts and bounds plain-text evidence", async () => {
    const text = await extractDocumentText({ name: "quote.txt", contentType: "text/plain", buffer: Buffer.from(`ABC quote $18,500\n${"x".repeat(MAX_EXTRACTED_CHARACTERS + 100)}`) });
    expect(text).toContain("$18,500");
    expect(text.length).toBe(MAX_EXTRACTED_CHARACTERS);
  });

  it("extracts shared and numeric cells from XLSX files", async () => {
    const xlsx = zipSync({
      "xl/sharedStrings.xml": strToU8('<?xml version="1.0"?><sst><si><t>ABC Manufacturing</t></si><si><t>Current quote</t></si></sst>'),
      "xl/worksheets/sheet1.xml": strToU8('<?xml version="1.0"?><worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c><c><v>18500</v></c></row></sheetData></worksheet>'),
    });
    const text = await extractDocumentText({ name: "ABC Quote v3.xlsx", buffer: Buffer.from(xlsx) });
    expect(text).toContain("ABC Manufacturing | Current quote | 18500");
  });

  it("rejects unsupported active file types", () => {
    expect(supportsTextExtraction("payload.exe", "application/octet-stream")).toBe(false);
  });

  it("rejects invalid Office archives before parser expansion", async () => {
    await expect(extractDocumentText({ name: "quote.xlsx", buffer: Buffer.from("not-a-zip") })).rejects.toThrow("archive is invalid");
  });
});
