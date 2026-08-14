import { cookies } from "next/headers";
import { completeMicrosoftCallback } from "@/connectors/microsoft/auth/complete-callback";

export const dynamic = "force-dynamic";

export default async function MicrosoftReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string }>;
}) {
  const { code, state } = await searchParams;
  const jar = await cookies();
  const expected = jar.get("tripine_ms_state")?.value;
  const verifier = jar.get("tripine_ms_verifier")?.value;

  if (!code || !state || !expected || state !== expected || !verifier) {
    return <main><h1>Microsoft connection expired</h1><p>Return to Tripine and connect Alex again.</p></main>;
  }

  let destination: string | undefined;
  try {
    const profile = await completeMicrosoftCallback(code, verifier);
    destination = `/?connected=${encodeURIComponent(profile.mail ?? profile.userPrincipalName)}`;
  } catch (error) {
    console.error("microsoft_return_page_failed", { error: error instanceof Error ? error.message : "unknown" });
  }

  if (!destination) return <main><h1>Microsoft connection failed</h1><p>Return to Tripine and try connecting Alex again.</p></main>;
  return <main><meta httpEquiv="refresh" content={`0;url=${destination}`} /><h1>Microsoft 365 connected</h1><p>Alex&apos;s workplace is ready.</p><a href={destination}>Continue to Tripine</a></main>;
}
