import { z } from "zod";

export const capabilities = ["files.search", "files.read", "email.search", "email.read", "email.reply", "email.replyAll", "email.forward", "email.send", "calendar.search", "calendar.availability", "calendar.create", "calendar.update"] as const;
export type Capability = (typeof capabilities)[number];
export type PolicyEffect = "allowed" | "requires_approval" | "denied";

export interface ToolContext { organizationId: string; agentId: string; connectionId: string; requestedByPartyId?: string }
export interface RegisteredTool<Input = unknown, Output = unknown> {
  capability: Capability;
  risk: "read" | "write";
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType<Output>;
  execute(context: ToolContext, input: Input): Promise<Output>;
}
export interface Connector {
  provider: string;
  connectionId: string;
  capabilities(): Capability[];
  createTools(): RegisteredTool[];
}
