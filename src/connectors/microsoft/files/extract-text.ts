import { unzipSync } from "fflate";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 24_000;
const MAX_ARCHIVE_EXPANDED_BYTES = 30 * 1024 * 1024;

function assertSafeArchive(buffer: Buffer) {
  let total = 0;
  let entries = 0;
  for (let offset = 0; offset <= buffer.length - 46; offset++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const size = buffer.readUInt32LE(offset + 24);
    if (size === 0xffffffff) throw new Error("ZIP64 Office documents are not supported");
    total += size;
    entries++;
    if (entries > 2000 || total > MAX_ARCHIVE_EXPANDED_BYTES) throw new Error("Office document exceeds safe archive expansion limits");
  }
  if (!entries) throw new Error("Office document archive is invalid");
}

function decodeXml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function extension(name: string) {
  return name.toLowerCase().split(".").pop() ?? "";
}

function extractSpreadsheet(buffer: Buffer) {
  assertSafeArchive(buffer);
  const archive = unzipSync(new Uint8Array(buffer));
  const sharedXml = archive["xl/sharedStrings.xml"] ? new TextDecoder().decode(archive["xl/sharedStrings.xml"]) : "";
  const shared = [...sharedXml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => decodeXml(match[1]));
  const sheets = Object.entries(archive)
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([name, bytes]) => {
      const xml = new TextDecoder().decode(bytes);
      const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
        const cells = [...row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map((cell) => {
          const type = /\bt="([^"]+)"/.exec(cell[1])?.[1];
          const raw = /<v[^>]*>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell[2])?.[1] ?? "";
          if (type === "s") return shared[Number(raw)] ?? "";
          return decodeXml(raw);
        });
        return cells.filter(Boolean).join(" | ");
      });
      return `${name.replace("xl/worksheets/", "")}\n${rows.filter(Boolean).join("\n")}`;
    });
  return sheets.join("\n\n");
}

export function supportsTextExtraction(name: string, contentType?: string) {
  const ext = extension(name);
  return ["txt", "md", "csv", "json", "html", "htm", "docx", "xlsx", "pdf"].includes(ext) || Boolean(contentType?.startsWith("text/"));
}

export async function extractDocumentText(input: { name: string; contentType?: string; buffer: Buffer }) {
  if (input.buffer.byteLength > MAX_FILE_BYTES) throw new Error(`File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB extraction limit`);
  const ext = extension(input.name);
  let text = "";
  if (["txt", "md", "csv", "json", "html", "htm"].includes(ext) || input.contentType?.startsWith("text/")) {
    text = input.buffer.toString("utf8");
    if (["html", "htm"].includes(ext) || input.contentType === "text/html") text = decodeXml(text);
  } else if (ext === "docx") {
    assertSafeArchive(input.buffer);
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer: input.buffer })).value;
  } else if (ext === "xlsx") {
    text = extractSpreadsheet(input.buffer);
  } else if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: input.buffer });
    try { text = (await parser.getText({ first: 30 })).text; } finally { await parser.destroy(); }
  } else {
    throw new Error(`Unsupported file type: ${ext || input.contentType || "unknown"}`);
  }
  return text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_EXTRACTED_CHARACTERS);
}
