import "server-only";

export async function graphFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...init?.headers }, cache: "no-store" });
  if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status})`);
  if (response.status === 202 || response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
