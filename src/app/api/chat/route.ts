import { z } from "zod";
import { answerWithAlex } from "@/agent/models/gateway";

const inputSchema = z.object({ message: z.string().trim().min(1).max(8000) });
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid message is required." }, { status: 400 });
  try { return Response.json(await answerWithAlex(parsed.data.message)); }
  catch (error) { console.error("chat_failed", { error: error instanceof Error ? error.message : "unknown" }); return Response.json({ error: "Alex could not complete that request." }, { status: 500 }); }
}
