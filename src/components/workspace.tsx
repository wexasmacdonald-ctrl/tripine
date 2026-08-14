"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Message = { id: string; role: "user" | "agent"; text: string; source?: string };
type WorkspaceData = {
  connections?: Array<{ id: string; status: string; account_address?: string }>;
  subscriptions?: Array<{ id: string; status: string; expires_at: string; last_notification_at?: string }>;
  deliveries?: Array<{ id: string; status: string; attempt_count: number; last_error?: string; received_at: string; processed_at?: string }>;
  tasks?: Array<{ id: string; description: string; status: string }>;
  commitments?: Array<{ id: string; description: string; status: string; external_party_aware: boolean }>;
  events?: Array<{ id: string; action: string; status: string; reason?: string; created_at: string }>;
  approvals?: Array<{ id: string; action: string; payload: { to?: string[]; subject?: string; body?: string }; status: string }>;
};

const initial: Message[] = [
  {
    id: "welcome",
    role: "agent",
    text: "Morning, Connor. I’m caught up on ABC Manufacturing. Their latest quote is $18,500, and Sarah replied yesterday asking whether installation is included.",
    source: "ABC Quote v3.xlsx · Outlook thread with Sarah",
  },
];

export function Workspace({ configured }: { configured: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [workspace, setWorkspace] = useState<WorkspaceData>({});
  const [workspaceError, setWorkspaceError] = useState<string>();
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState({ to: "", subject: "", body: "" });

  const refreshWorkspace = useCallback(async () => {
    if (!configured) return;
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const data = await response.json() as WorkspaceData & { error?: string };
    if (response.ok) { setWorkspace(data); setWorkspaceError(undefined); }
    else setWorkspaceError(data.error ?? "Workspace data could not be loaded.");
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    void fetch("/api/workspace", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as WorkspaceData & { error?: string };
      if (active && response.ok) { setWorkspace(data); setWorkspaceError(undefined); }
      else if (active) setWorkspaceError(data.error ?? "Workspace data could not be loaded.");
    });
    return () => { active = false; };
  }, [configured]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text }]);
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });
      const data = (await response.json()) as { answer?: string; source?: string; error?: string; conversationId?: string };
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "agent", text: data.answer ?? data.error ?? "I couldn’t complete that.", source: data.source },
      ]);
      void refreshWorkspace();
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: [draft.to], cc: [], subject: draft.subject, body: draft.body }) });
    const data = await response.json() as { error?: string };
    if (response.ok) { setDraft({ to: "", subject: "", body: "" }); setDraftOpen(false); await refreshWorkspace(); }
    else setMessages((current) => [...current, { id: crypto.randomUUID(), role: "agent", text: data.error ?? "The approval request could not be created." }]);
  }

  async function approve(id: string) {
    const response = await fetch(`/api/approvals/${id}/approve`, { method: "POST" });
    const data = await response.json() as { error?: string };
    if (!response.ok) setMessages((current) => [...current, { id: crypto.randomUUID(), role: "agent", text: data.error ?? "The approved email could not be sent." }]);
    await refreshWorkspace();
  }

  async function retryFailedDeliveries() {
    await fetch("/api/deliveries/retry", { method: "POST" });
    await refreshWorkspace();
  }

  const connected = configured && workspace.connections?.some((item) => item.status === "connected");
  const openWork = [...(workspace.tasks ?? []).map((item) => ({ ...item, kind: "Task" })), ...(workspace.commitments ?? []).map((item) => ({ ...item, kind: item.external_party_aware ? "External commitment" : "Commitment" }))];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">T</span>Tripine</div>
        <div className="agentCard">
          <div className="agentLine"><div className="avatar">A</div><div><strong>Alex</strong><br /><small><span className="status" />Available</small></div></div>
        </div>
        <nav className="nav">
          <div className="navItem active">Conversation</div>
          <div className="navItem">Work</div>
          <div className="navItem">Activity</div>
          <div className="navItem">Connections</div>
        </nav>
        <div className="sidebarFooter">One employee identity.<br />One memory. Many tools.</div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">Demo Company · AI employee</div><h1>Work with Alex</h1><p className="subtitle">Email or chat—Alex keeps the same context.</p></div>
          <div className="connection"><span className={`dot ${connected ? "live" : ""}`} />{connected ? `Microsoft 365 · ${workspace.connections?.[0]?.account_address ?? "Alex"}` : configured ? "Microsoft 365 setup needed" : "Demo mode"}</div>
        </header>
        <div className="grid">
          {workspaceError && <div className="workspaceAlert" role="alert">{workspaceError}</div>}
          <section className="card chat">
            <div className="cardHeader"><strong>ABC Manufacturing</strong><span className="channel">Web chat</span></div>
            <div className="messages">
              {messages.map((message) => <div className={`message ${message.role === "user" ? "user" : ""}`} key={message.id}>
                <div className="avatar">{message.role === "user" ? "C" : "A"}</div>
                <div><div className="bubble">{message.text}</div>{message.source && <span className="source">↗ {message.source}</span>}</div>
              </div>)}
              {busy && <div className="typing">Alex is checking company context…</div>}
            </div>
            <form className="composer" onSubmit={send}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Alex about a customer, quote, email, or task…" /><button className="primary" disabled={busy}>Send</button></form>
          </section>
          <aside className="rail">
            <section className="card section"><h2>Open work</h2>
              {(configured ? openWork : [{ id: "demo-task", description: "Confirm installation scope for ABC", status: "waiting", kind: "Task" }, { id: "demo-commitment", description: "Send revised quote to Sarah", status: "waiting", kind: "External commitment" }]).map((item) => <div className="item" key={item.id}><div className="icon">{item.kind === "Task" ? "✓" : "↗"}</div><div><p>{item.description}</p><small>{item.kind}</small><br /><span className="taskStatus">{item.status}</span></div></div>)}
              {configured && openWork.length === 0 && <p className="empty">No open tasks or commitments.</p>}
            </section>
            <section className="card section"><h2>Recent activity</h2>
              {(configured ? workspace.events ?? [] : [{ id: "demo-email", action: "Read Sarah's reply", status: "success", reason: "Outlook · yesterday", created_at: "" }, { id: "demo-file", action: "Found latest ABC quote", status: "success", reason: "SharePoint · Quote v3", created_at: "" }]).slice(0, 5).map((item) => <div className="item" key={item.id}><div className="icon">{item.action.includes("email") ? "✉" : "⌕"}</div><div><p>{item.action.replaceAll(".", " ")}</p><small>{item.reason ?? item.status}</small></div></div>)}
            </section>
            {configured && connected && <section className="card section"><h2>Workplace health</h2>
              <div className="healthLine"><span className={`dot ${workspace.subscriptions?.some((item) => item.status === "active") ? "live" : ""}`} /><span>{workspace.subscriptions?.some((item) => item.status === "active") ? "Outlook listener active" : "Outlook listener needs attention"}</span></div>
              {(workspace.deliveries ?? []).slice(0, 3).map((item) => <div className={`delivery ${item.status}`} key={item.id}><strong>{item.status}</strong><span>{new Date(item.received_at).toLocaleString()}</span>{item.last_error && <small>{item.last_error}</small>}</div>)}
              {(workspace.deliveries ?? []).length === 0 && <p className="empty">No mailbox deliveries yet.</p>}
              {workspace.deliveries?.some((item) => item.status === "failed") && <button className="retryButton" onClick={retryFailedDeliveries}>Retry failed delivery</button>}
            </section>}
            {configured && <section className="card section"><div className="sectionTitle"><h2>External actions</h2><button className="textButton" onClick={() => setDraftOpen((value) => !value)}>Draft email</button></div>
              {draftOpen && <form className="draftForm" onSubmit={requestApproval}><input type="email" required placeholder="Recipient email" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /><input required placeholder="Subject" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /><textarea required placeholder="Message from Alex" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /><button className="primary">Request approval</button></form>}
              {(workspace.approvals ?? []).map((item) => <div className="approval" key={item.id}><strong>{item.payload.subject}</strong><small>To {item.payload.to?.join(", ")}</small><p>{item.payload.body}</p><button className="approveButton" onClick={() => approve(item.id)}>Approve exact email</button></div>)}
              {!draftOpen && (workspace.approvals ?? []).length === 0 && <p className="empty">No external actions awaiting approval.</p>}
            </section>}
            {!configured && <section className="card section setup"><h2>Cloud setup required</h2><p>The product is running with deterministic demo data. Add Supabase, OpenAI, and Microsoft credentials in Vercel to activate live integrations.</p></section>}
            {configured && !connected && <section className="card section setup"><h2>Connect Alex&apos;s workplace</h2><p>Sign in as Alex to activate Outlook and SharePoint.</p><a href="/api/connections/microsoft/start">Connect Microsoft 365 →</a></section>}
          </aside>
        </div>
      </main>
    </div>
  );
}
