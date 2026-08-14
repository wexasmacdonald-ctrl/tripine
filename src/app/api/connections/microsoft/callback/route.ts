import { cookies } from "next/headers";
import { completeMicrosoftCallback } from "@/connectors/microsoft/auth/complete-callback";

export async function GET(request: Request) {
  const url = new URL(request.url); const jar = await cookies();
  const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  const expected = jar.get("tripine_ms_state")?.value; const verifier = jar.get("tripine_ms_verifier")?.value;
  jar.delete("tripine_ms_state"); jar.delete("tripine_ms_verifier");
  if (!code || !state || !expected || state !== expected || !verifier) return Response.json({ error: "Invalid or expired OAuth callback." }, { status: 400 });
  try {
    const profile = await completeMicrosoftCallback(code, verifier);
    const destination = new URL("/", request.url); destination.searchParams.set("connected", profile.mail ?? profile.userPrincipalName);
    return Response.redirect(destination);
  } catch (error) { console.error("microsoft_callback_failed", { error: error instanceof Error ? error.message : "unknown" }); return Response.json({ error: "Microsoft connection failed." }, { status: 502 }); }
}
