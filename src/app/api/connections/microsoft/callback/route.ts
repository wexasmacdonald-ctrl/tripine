import { cookies } from "next/headers";
import { exchangeCode } from "@/connectors/microsoft/auth/oauth";
import { graphFetch } from "@/connectors/microsoft/graph/client";

export async function GET(request: Request) {
  const url = new URL(request.url); const jar = await cookies();
  const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  const expected = jar.get("tripine_ms_state")?.value; const verifier = jar.get("tripine_ms_verifier")?.value;
  jar.delete("tripine_ms_state"); jar.delete("tripine_ms_verifier");
  if (!code || !state || !expected || state !== expected || !verifier) return Response.json({ error: "Invalid or expired OAuth callback." }, { status: 400 });
  try {
    const token = await exchangeCode(code, verifier);
    const profile = await graphFetch<{ displayName: string; mail?: string; userPrincipalName: string }>(token.access_token, "/me?$select=displayName,mail,userPrincipalName");
    // Production persistence is intentionally blocked until the encrypted credential migration is applied.
    const destination = new URL("/", request.url); destination.searchParams.set("connected", profile.mail ?? profile.userPrincipalName);
    return Response.redirect(destination);
  } catch (error) { console.error("microsoft_callback_failed", { error: error instanceof Error ? error.message : "unknown" }); return Response.json({ error: "Microsoft connection failed." }, { status: 502 }); }
}
