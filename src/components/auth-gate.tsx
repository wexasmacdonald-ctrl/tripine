"use client";
import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/infrastructure/supabase/browser";
import { Workspace } from "./workspace";

export function AuthGate({ configured }: { configured: boolean }) {
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(!configured);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  useEffect(() => {
    if (!configured) return;
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [configured]);
  async function login(event: FormEvent) {
    event.preventDefault(); setError("");
    const { error: authError } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
  }
  if (!ready) return <div className="login"><div className="loginCard"><div className="brand"><span className="brandMark">T</span>Tripine</div><p>Loading your organization…</p></div></div>;
  if (configured && !session) return <div className="login"><form className="loginCard" onSubmit={login}><div className="brand"><span className="brandMark">T</span>Tripine</div><div><div className="eyebrow">Demo Company</div><h1>Sign in to work with Alex</h1><p className="subtitle">Use the Connor account created in Supabase Auth.</p></div><label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <p className="formError">{error}</p>}<button className="primary loginButton">Sign in</button></form></div>;
  return <Workspace configured={configured} />;
}
