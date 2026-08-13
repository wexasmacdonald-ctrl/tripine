import { cookies } from "next/headers";
import { createOAuthRequest } from "@/connectors/microsoft/auth/oauth";
import { isCloudConfigured } from "@/infrastructure/env";
import { createServerSupabase } from "@/infrastructure/supabase/server";

export async function GET() {
  try {
    if (isCloudConfigured) {
      const supabase = await createServerSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return Response.json({ error: "Sign in to Tripine before connecting Microsoft 365." }, { status: 401 });
      const { data: membership } = await supabase.from("organization_members").select("role").eq("user_id", user.id).in("role", ["owner", "admin"]).maybeSingle();
      if (!membership) return Response.json({ error: "Organization owner access is required." }, { status: 403 });
    }
    const request = createOAuthRequest();
    const jar = await cookies();
    jar.set("tripine_ms_state", request.state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
    jar.set("tripine_ms_verifier", request.verifier, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
    return Response.redirect(request.url);
  } catch { return Response.json({ error: "Add Microsoft OAuth environment variables before connecting." }, { status: 503 }); }
}
