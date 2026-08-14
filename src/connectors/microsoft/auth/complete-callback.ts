import "server-only";
import { exchangeCode } from "./oauth";
import { graphFetch } from "@/connectors/microsoft/graph/client";
import { saveMicrosoftConnection } from "./connection-store";
import { createMailboxSubscription } from "@/connectors/microsoft/subscriptions/manager";

export async function completeMicrosoftCallback(code: string, verifier: string) {
  const token = await exchangeCode(code, verifier);
  const profile = await graphFetch<{ id: string; displayName: string; mail?: string; userPrincipalName: string }>(
    token.access_token,
    "/me?$select=id,displayName,mail,userPrincipalName",
  );
  const connection = await saveMicrosoftConnection(profile, token);
  await createMailboxSubscription({
    connectionId: connection.id,
    accountObjectId: profile.id,
    accessToken: token.access_token,
  });
  return profile;
}
