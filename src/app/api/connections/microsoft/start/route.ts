import { cookies } from "next/headers";
import { createOAuthRequest } from "@/connectors/microsoft/auth/oauth";

export async function GET() {
  try {
    const request = createOAuthRequest();
    const jar = await cookies();
    jar.set("tripine_ms_state", request.state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
    jar.set("tripine_ms_verifier", request.verifier, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
    return Response.redirect(request.url);
  } catch { return Response.json({ error: "Add Microsoft OAuth environment variables before connecting." }, { status: 503 }); }
}
