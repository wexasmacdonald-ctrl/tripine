import { isMicrosoftConfigured, isPersistenceConfigured } from "@/infrastructure/env";

export function GET() {
  const mode = isMicrosoftConfigured
    ? "connected"
    : isPersistenceConfigured
      ? "persistent"
      : "demo";
  return Response.json({ ok: true, service: "tripine", mode });
}
