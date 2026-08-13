export function parseRecipientAllowlist(value?: string) {
  return new Set((value ?? "").split(",").map((address) => address.trim().toLowerCase()).filter(Boolean));
}

export function recipientsAreAllowed(recipients: string[], configured?: string) {
  const allowlist = parseRecipientAllowlist(configured);
  return allowlist.size > 0 && recipients.every((address) => allowlist.has(address.trim().toLowerCase()));
}
