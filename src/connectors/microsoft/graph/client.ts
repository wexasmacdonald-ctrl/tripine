import "server-only";

export async function graphFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response | undefined;
  const method = (init?.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" || method === "HEAD" ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...init?.headers }, cache: "no-store" });
    if (response.ok || ![429, 502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) break;
    const retryAfter = Number(response.headers.get("retry-after") ?? 0);
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter ? retryAfter * 1000 : 250 * 2 ** attempt, 5000)));
  }
  if (!response?.ok) {
    const requestId = response?.headers.get("request-id") ?? response?.headers.get("client-request-id");
    throw new Error(`Microsoft Graph request failed (${response?.status ?? "network"})${requestId ? ` [request ${requestId}]` : ""}`);
  }
  if (response.status === 202 || response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
