export function normalizeEmployeeEmailText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
