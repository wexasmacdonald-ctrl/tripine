"use client";

import { FormEvent, useState } from "react";

type Message = { id: string; role: "user" | "agent"; text: string; source?: string };

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
        body: JSON.stringify({ message: text }),
      });
      const data = (await response.json()) as { answer?: string; source?: string; error?: string };
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "agent", text: data.answer ?? data.error ?? "I couldn’t complete that.", source: data.source },
      ]);
    } finally {
      setBusy(false);
    }
  }

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
          <div className="connection"><span className={`dot ${configured ? "live" : ""}`} />{configured ? "Microsoft 365 connected" : "Demo mode"}</div>
        </header>
        <div className="grid">
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
              <div className="item"><div className="icon">✓</div><div><p>Confirm installation scope for ABC</p><small>Assigned by Connor</small><br /><span className="taskStatus">Waiting</span></div></div>
              <div className="item"><div className="icon">↗</div><div><p>Send revised quote to Sarah</p><small>External commitment · Friday</small><br /><span className="taskStatus">Approval needed</span></div></div>
            </section>
            <section className="card section"><h2>Recent activity</h2>
              <div className="item"><div className="icon">✉</div><div><p>Read Sarah’s reply</p><small>Outlook · yesterday</small></div></div>
              <div className="item"><div className="icon">⌕</div><div><p>Found latest ABC quote</p><small>SharePoint · Quote v3</small></div></div>
            </section>
            {!configured && <section className="card section setup"><h2>Cloud setup required</h2><p>The product is running with deterministic demo data. Add Supabase, OpenAI, and Microsoft credentials in Vercel to activate live integrations.</p><a href="/api/connections/microsoft/start">Connect Microsoft 365 →</a></section>}
          </aside>
        </div>
      </main>
    </div>
  );
}
