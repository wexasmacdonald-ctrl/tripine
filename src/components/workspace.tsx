"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/infrastructure/supabase/browser";

type Section = "conversation" | "work" | "activity" | "connections";
type Message = { id: string; role: "user" | "agent"; text: string; channel?: string; occurredAt?: string; source?: string };
type Conversation = { id: string; title?: string; status: string; channel: "web" | "email"; created_at: string };
type WorkItem = { id: string; description: string; status: string; due_at?: string; external_party_aware?: boolean };
type WorkspaceData = {
  connections?: Array<{ id: string; status: string; account_address?: string; updated_at?: string }>;
  subscriptions?: Array<{ id: string; status: string; expires_at: string; last_notification_at?: string }>;
  deliveries?: Array<{ id: string; status: string; attempt_count: number; last_error?: string; received_at: string }>;
  tasks?: WorkItem[]; commitments?: WorkItem[];
  events?: Array<{ id: string; action: string; status: string; reason?: string; created_at: string }>;
  approvals?: Array<{ id: string; action: string; payload: { to?: string[]; subject?: string; body?: string }; status: string; expires_at?: string }>;
};

const demoMessages: Message[] = [{ id: "welcome", role: "agent", text: "Morning, Connor. Ask me about ABC Manufacturing, an email, a file, or open work." }];
const labels: Record<Section, string> = { conversation: "Conversations", work: "Work", activity: "Activity", connections: "Connections" };

export function Workspace({ configured }: { configured: boolean }) {
  const [section, setSection] = useState<Section>("conversation");
  const [messages, setMessages] = useState<Message[]>(configured ? [] : demoMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [conversationChannel, setConversationChannel] = useState<"web" | "email">("web");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceData>({});
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState({ to: "", subject: "", body: "" });

  const refreshWorkspace = useCallback(async () => {
    if (!configured) return;
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const data = await response.json() as WorkspaceData & { error?: string };
    if (response.ok) { setWorkspace(data); setError(undefined); }
    else setError(data.error ?? "Workspace data could not be loaded.");
  }, [configured]);

  const refreshConversations = useCallback(async () => {
    if (!configured) return;
    const response = await fetch("/api/conversations", { cache: "no-store" });
    const data = await response.json() as { conversations?: Conversation[]; error?: string };
    if (response.ok) setConversations(data.conversations ?? []);
    else setError(data.error ?? "Conversations could not be loaded.");
  }, [configured]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void Promise.all([refreshWorkspace(), refreshConversations()]); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshWorkspace, refreshConversations]);

  async function openConversation(conversation: Conversation) {
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/interactions`, { cache: "no-store" });
      const data = await response.json() as { interactions?: Array<{ id: string; direction: "inbound" | "outbound"; channel: string; content_text: string; occurred_at: string }>; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Conversation could not be opened.");
      setConversationId(conversation.id); setConversationChannel(conversation.channel);
      setMessages((data.interactions ?? []).map((item) => ({ id: item.id, role: item.direction === "inbound" ? "user" : "agent", text: item.content_text, channel: item.channel, occurredAt: item.occurred_at })));
      setSection("conversation");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Conversation could not be opened."); }
    finally { setBusy(false); }
  }

  function newConversation() { setConversationId(undefined); setConversationChannel("web"); setMessages([]); setSection("conversation"); setInput(""); }

  async function send(event: FormEvent) {
    event.preventDefault(); const text = input.trim();
    if (!text || busy || conversationChannel !== "web") return;
    setInput(""); setError(undefined); setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text, channel: "web" }]); setBusy(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, conversationId }) });
      const data = await response.json() as { answer?: string; source?: string; error?: string; conversationId?: string };
      if (!response.ok) throw new Error(data.error ?? "Alex could not complete that request.");
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "agent", text: data.answer ?? "I could not complete that.", source: data.source, channel: "web" }]);
      await Promise.all([refreshWorkspace(), refreshConversations()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Alex could not complete that request."); }
    finally { setBusy(false); }
  }

  async function requestApproval(event: FormEvent) {
    event.preventDefault(); setError(undefined);
    const response = await fetch("/api/approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: [draft.to], cc: [], subject: draft.subject, body: draft.body }) });
    const data = await response.json() as { error?: string };
    if (response.ok) { setDraft({ to: "", subject: "", body: "" }); setDraftOpen(false); setNotice("Exact email saved for human approval."); await refreshWorkspace(); }
    else setError(data.error ?? "The approval request could not be created.");
  }

  async function decideApproval(id: string, decision: "approve" | "cancel") {
    setBusy(true); setError(undefined);
    const response = await fetch(`/api/approvals/${id}/${decision}`, { method: "POST" });
    const data = await response.json() as { error?: string };
    if (response.ok) setNotice(decision === "approve" ? "Alex sent the approved email." : "The email was cancelled.");
    else setError(data.error ?? `The email could not be ${decision === "approve" ? "sent" : "cancelled"}.`);
    await refreshWorkspace(); setBusy(false);
  }

  async function updateWork(kind: "tasks" | "commitments", id: string, status: "open" | "waiting" | "completed" | "cancelled") {
    setBusy(true); setError(undefined);
    const response = await fetch(`/api/work/${kind}/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) setError(data.error ?? "The work item could not be updated."); else setNotice(`Work item marked ${status}.`);
    await refreshWorkspace(); setBusy(false);
  }

  async function retryFailedDeliveries() {
    setBusy(true); const response = await fetch("/api/deliveries/retry", { method: "POST" });
    const data = await response.json() as { processed?: number; error?: string };
    if (response.ok) setNotice(`Processed ${data.processed ?? 0} mailbox deliveries.`);
    else setError(data.error ?? "Mailbox processing failed.");
    await refreshWorkspace(); setBusy(false);
  }

  async function signOut() { await createBrowserSupabase().auth.signOut(); }

  const connected = configured && workspace.connections?.some((item) => item.status === "connected");
  const openCount = (workspace.tasks?.length ?? 0) + (workspace.commitments?.length ?? 0);
  const pendingApprovals = workspace.approvals?.length ?? 0;
  const activeSubscription = workspace.subscriptions?.some((item) => item.status === "active");
  const heading = useMemo(() => section === "conversation" ? "Work with Alex" : labels[section], [section]);

  return <div className="shell">
    <aside className="sidebar"><div className="brand"><span className="brandMark">T</span>Tripine</div><div className="agentCard"><div className="agentLine"><div className="avatar">A</div><div><strong>Alex</strong><br /><small><span className="status" />Available</small></div></div></div><nav className="nav" aria-label="Workspace">{(Object.keys(labels) as Section[]).map((item) => <button key={item} className={`navItem ${section === item ? "active" : ""}`} onClick={() => setSection(item)}>{labels[item]}{item === "work" && openCount > 0 && <span className="navBadge">{openCount}</span>}{item === "activity" && pendingApprovals > 0 && <span className="navBadge attention">{pendingApprovals}</span>}</button>)}</nav><button className="signOut" onClick={signOut}>Sign out</button><div className="sidebarFooter">One employee identity.<br />One memory. Many channels.</div></aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">Demo Company · AI employee</div><h1>{heading}</h1><p className="subtitle">{section === "conversation" ? "Email or chat—Alex keeps the same context." : "Manage Alex’s work without scripts or hidden controls."}</p></div><div className="connection"><span className={`dot ${connected ? "live" : ""}`} />{connected ? `Microsoft 365 · ${workspace.connections?.find((item) => item.status === "connected")?.account_address ?? "Alex"}` : configured ? "Microsoft setup needed" : "Demo mode"}</div></header>
      <div className="mobileNav">{(Object.keys(labels) as Section[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>{labels[item]}</button>)}</div>
      {error && <div className="workspaceAlert" role="alert">{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}{notice && <div className="workspaceNotice" role="status">{notice}<button onClick={() => setNotice(undefined)}>Dismiss</button></div>}

      {section === "conversation" && <div className="conversationLayout"><aside className="card conversationList"><div className="sectionTitle"><h2>Inbox & chats</h2><button className="textButton" onClick={newConversation}>New chat</button></div>{conversations.length === 0 && <p className="empty">Your conversations will appear here.</p>}{conversations.map((item) => <button key={item.id} onClick={() => openConversation(item)} className={`conversationRow ${conversationId === item.id ? "selected" : ""}`}><span className={`channelIcon ${item.channel}`}>{item.channel === "email" ? "✉" : "●"}</span><span><strong>{item.title || "Untitled conversation"}</strong><small>{item.channel === "email" ? "Outlook email" : "Web chat"} · {new Date(item.created_at).toLocaleDateString()}</small></span></button>)}</aside><section className="card chat"><div className="cardHeader"><strong>{conversationId ? conversations.find((item) => item.id === conversationId)?.title ?? "Conversation" : "New conversation"}</strong><span className="channel">{conversationChannel === "email" ? "Outlook" : "Web chat"}</span></div><div className="messages">{messages.length === 0 && <div className="emptyState"><div className="avatar large">A</div><h2>What can I help with?</h2><p>Ask about customers, quotes, email, files, commitments, or anything Alex has worked on.</p></div>}{messages.map((message) => <div className={`message ${message.role === "user" ? "user" : ""}`} key={message.id}><div className="avatar">{message.role === "user" ? "C" : "A"}</div><div><div className="bubble">{message.text}</div>{message.source && <span className="source">↗ {message.source}</span>}{message.occurredAt && <small className="messageTime">{new Date(message.occurredAt).toLocaleString()}</small>}</div></div>)}{busy && <div className="typing">Alex is checking company context…</div>}</div>{conversationChannel === "email" ? <div className="readonlyComposer"><span>This Outlook thread is read-only here.</span><button className="primary" onClick={newConversation}>Start a web follow-up</button></div> : <form className="composer" onSubmit={send}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Alex about a customer, quote, email, or task…" /><button className="primary" disabled={busy}>Send</button></form>}</section></div>}

      {section === "work" && <div className="pageGrid"><section className="card pageCard"><div className="sectionTitle"><div><h2>Tasks</h2><p>Assignments Alex is responsible for.</p></div><span className="countPill">{workspace.tasks?.length ?? 0} open</span></div><WorkList items={workspace.tasks ?? []} kind="tasks" busy={busy} onUpdate={updateWork} /></section><section className="card pageCard"><div className="sectionTitle"><div><h2>Commitments</h2><p>Promises made internally or externally.</p></div><span className="countPill">{workspace.commitments?.length ?? 0} open</span></div><WorkList items={workspace.commitments ?? []} kind="commitments" busy={busy} onUpdate={updateWork} /></section></div>}

      {section === "activity" && <div className="pageGrid"><section className="card pageCard"><div className="sectionTitle"><div><h2>Approval queue</h2><p>Review the exact external action before Alex executes it.</p></div><button className="primary compact" onClick={() => setDraftOpen((value) => !value)}>Draft email</button></div>{draftOpen && <form className="draftForm wide" onSubmit={requestApproval}><label>To<input type="email" required placeholder="sarah@example.com" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label><label>Subject<input required value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></label><label>Message<textarea required value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label><button className="primary compact">Submit for approval</button></form>}{(workspace.approvals ?? []).map((item) => <div className="approval" key={item.id}><div className="approvalMeta"><span>Pending email</span>{item.expires_at && <small>Expires {new Date(item.expires_at).toLocaleString()}</small>}</div><strong>{item.payload.subject}</strong><small>To {item.payload.to?.join(", ")}</small><p>{item.payload.body}</p><div className="buttonRow"><button disabled={busy} className="approveButton" onClick={() => decideApproval(item.id, "approve")}>Approve and send</button><button disabled={busy} className="secondaryButton" onClick={() => decideApproval(item.id, "cancel")}>Cancel</button></div></div>)}{!draftOpen && pendingApprovals === 0 && <p className="empty">No external actions await approval.</p>}</section><section className="card pageCard"><div className="sectionTitle"><div><h2>Event history</h2><p>Automatically recorded actions across every channel.</p></div><button className="secondaryButton" onClick={refreshWorkspace}>Refresh</button></div><div className="eventList">{(workspace.events ?? []).map((item) => <div className="eventRow" key={item.id}><span className={`eventDot ${item.status}`} /><div><strong>{item.action.replaceAll(".", " ")}</strong><p>{item.reason ?? item.status}</p><small>{new Date(item.created_at).toLocaleString()}</small></div></div>)}</div></section></div>}

      {section === "connections" && <div className="pageGrid"><section className="card pageCard"><div className="sectionTitle"><div><h2>Microsoft 365</h2><p>Alex’s Outlook, SharePoint, and OneDrive workplace.</p></div><span className={`connectionState ${connected ? "connected" : ""}`}>{connected ? "Connected" : "Not connected"}</span></div>{(workspace.connections ?? []).map((item) => <div className="connectionDetail" key={item.id}><div className="avatar microsoft">M</div><div><strong>{item.account_address ?? "Microsoft account"}</strong><p>Service-owned delegated connection</p><small>Last updated {item.updated_at ? new Date(item.updated_at).toLocaleString() : "recently"}</small></div></div>)}<a className="primary linkButton" href="/api/connections/microsoft/start">{connected ? "Reconnect Microsoft 365" : "Connect Microsoft 365"}</a></section><section className="card pageCard"><div className="sectionTitle"><div><h2>Outlook listener</h2><p>Receives mail addressed or CC’d to Alex.</p></div><span className={`connectionState ${activeSubscription ? "connected" : ""}`}>{activeSubscription ? "Active" : "Needs attention"}</span></div>{(workspace.subscriptions ?? []).map((item) => <div className="healthBlock" key={item.id}><strong>Mailbox subscription</strong><span>Expires {new Date(item.expires_at).toLocaleString()}</span><small>{item.last_notification_at ? `Last message ${new Date(item.last_notification_at).toLocaleString()}` : "Waiting for the first message"}</small></div>)}<h3>Recent deliveries</h3>{(workspace.deliveries ?? []).slice(0, 8).map((item) => <div className={`delivery ${item.status}`} key={item.id}><strong>{item.status}</strong><span>{new Date(item.received_at).toLocaleString()}</span>{item.last_error && <small>{item.last_error}</small>}</div>)}{workspace.deliveries?.some((item) => item.status === "failed") && <button disabled={busy} className="secondaryButton full" onClick={retryFailedDeliveries}>Retry failed deliveries</button>}</section></div>}
    </main>
  </div>;
}

function WorkList({ items, kind, busy, onUpdate }: { items: WorkItem[]; kind: "tasks" | "commitments"; busy: boolean; onUpdate: (kind: "tasks" | "commitments", id: string, status: "open" | "waiting" | "completed" | "cancelled") => Promise<void> }) {
  if (items.length === 0) return <p className="empty spacious">Nothing open.</p>;
  return <div className="workList">{items.map((item) => <article className="workRow" key={item.id}><div><div className="workType">{kind === "tasks" ? "Task" : item.external_party_aware ? "External commitment" : "Commitment"}</div><h3>{item.description}</h3><p>{item.due_at ? `Due ${new Date(item.due_at).toLocaleString()}` : "No due date"}</p></div><div className="workActions"><select aria-label={`Status for ${item.description}`} value={item.status} disabled={busy} onChange={(event) => onUpdate(kind, item.id, event.target.value as "open" | "waiting" | "completed" | "cancelled")}><option value="open">Open</option><option value="waiting">Waiting</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><button disabled={busy} className="secondaryButton" onClick={() => onUpdate(kind, item.id, "completed")}>Complete</button></div></article>)}</div>;
}
