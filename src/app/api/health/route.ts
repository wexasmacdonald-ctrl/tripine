import { isCloudConfigured } from "@/infrastructure/env";
export function GET() { return Response.json({ ok: true, service: "tripine", mode: isCloudConfigured ? "connected" : "demo" }); }
