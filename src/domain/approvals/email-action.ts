import { createHash } from "node:crypto";

export type EmailSendApproval = {
  type: "email.send";
  to: string[];
  cc: string[];
  subject: string;
  body: string;
};

export type EmailReplyAllApproval = {
  type: "email.replyAll";
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  sourceMessageId: string;
  sourceInteractionId: string;
  conversationId: string;
};

export type EmailApprovalPayload = EmailSendApproval | EmailReplyAllApproval;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function hashApprovalPayload(payload: EmailApprovalPayload) {
  return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}
