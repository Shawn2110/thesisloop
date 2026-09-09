"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Status = "open" | "closed";
type Tab = "overview" | "setups" | "trades" | "insights";
type Setup = {
  id: number;
  symbol: string;
  setup: string;
  source: string;
  thesis: string;
  plannedRisk: number;
  createdAt: string;
  status: Status;
  returnPct?: number;
  followedPlan?: boolean;
  outcomeNote?: string;
};

function daysSince(date: string) {
  const diff = Date.now() - new Date(`${date}T00:00:00`).getTime();
  const days = Math.max(0, Math.floor(diff / 86400000));
  return days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("overview");
  const [setups, setSetups] = useState<Setup[]>([]);
  const [selectedId, setSelectedId] = useState(0);
  const [modal, setModal] = useState<"record" | "close" | "import" | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/setups")
      .then(async (response) => {
        const data = await response.json() as { setups?: Setup[]; error?: string };
        if (!response.ok || !data.setups) throw new Error(data.error ?? "Unable to load the demo.");
        if (!cancelled) {
          setSetups(data.setups);
          setSelectedId(data.setups[0]?.id ?? 0);
          setLoadError("");
        }
      })
      .catch((error: Error) => { if (!cancelled) setLoadError(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selected = setups.find((item) => item.id === selectedId) ?? setups[0];
  const open = setups.filter((item) => item.status === "open");
  const closed = setups.filter((item) => item.status === "closed");
  const followed = closed.filter((item) => item.followedPlan).length;
  const quality = closed.length ? Math.round((followed / closed.length) * 100) : 0;

  const sources = useMemo(() => {
    const map = new Map<string, { source: string; total: number; returns: number; followed: number }>();
    closed.forEach((item) => {
      const row = map.get(item.source) ?? { source: item.source, total: 0, returns: 0, followed: 0 };
      row.total += 1;
      row.returns += item.returnPct ?? 0;
      row.followed += item.followedPlan ? 1 : 0;
      map.set(item.source, row);
    });
    return [...map.values()].map((row) => ({ ...row, average: row.returns / row.total })).sort((a, b) => b.average - a.average);
  }, [closed]);

  const bestSource = sources[0]?.source ?? "Not enough data";

  async function saveSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const item: Setup = {
      id: Date.now(),
      symbol: String(data.get("symbol") ?? "").toUpperCase().trim(),
      setup: String(data.get("setup") ?? "").trim(),
      source: String(data.get("source") ?? "").trim(),
      thesis: String(data.get("thesis") ?? "").trim(),
      plannedRisk: Number(data.get("risk")),
      createdAt: String(data.get("date")),
      status: "open",
    };
    setSaving(true);
    try {
      const response = await fetch("/api/setups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) });
      const result = await response.json() as { setups?: Setup[]; error?: string };
      if (!response.ok || !result.setups?.[0]) throw new Error(result.error ?? "Unable to save the setup.");
      const saved = result.setups[0];
      setSetups((current) => [saved, ...current]);
      setSelectedId(saved.id);
      setModal(null);
      setTab("overview");
      setNotice(`${saved.symbol} was added to the review queue.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save the setup.");
    } finally {
      setSaving(false);
    }
  }

  async function closeLoop(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/setups/outcome", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
        id: selected.id,
        returnPct: Number(data.get("returnPct")),
        followedPlan: data.get("followedPlan") === "yes",
        outcomeNote: String(data.get("outcomeNote") ?? "").trim(),
      }) });
      const result = await response.json() as { setup?: Setup; error?: string };
      if (!response.ok || !result.setup) throw new Error(result.error ?? "Unable to save the outcome.");
      setSetups((current) => current.map((item) => item.id === result.setup?.id ? result.setup : item));
      setModal(null);
      setNotice(`${selected.symbol} now has an outcome.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save the outcome.");
    } finally {
      setSaving(false);
    }
  }

  function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
        const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
        const required = ["symbol", "setup", "source", "thesis", "plannedrisk", "createdat"];
        if (!required.every((header) => headers.includes(header))) throw new Error("Missing headers");
        const imported = lines.slice(1).map((line, index) => {
          const values = parseCsvLine(line);
          const get = (name: string) => values[headers.indexOf(name)] ?? "";
          const status: Status = get("status").toLowerCase() === "closed" ? "closed" : "open";
          return {
            id: Date.now() + index,
            symbol: get("symbol").toUpperCase(),
            setup: get("setup"), source: get("source"), thesis: get("thesis"),
            plannedRisk: Number(get("plannedrisk")), createdAt: get("createdat"), status,
            returnPct: status === "closed" ? Number(get("returnpct")) : undefined,
            followedPlan: status === "closed" ? get("followedplan").toLowerCase() === "yes" : undefined,
            outcomeNote: get("outcomenote") || undefined,
          } satisfies Setup;
        });
        setSaving(true);
        const response = await fetch("/api/setups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(imported) });
        const result = await response.json() as { setups?: Setup[]; error?: string };
        if (!response.ok || !result.setups) throw new Error(result.error ?? "Unable to import records.");
        setSetups((current) => [...result.setups!, ...current]);
        setModal(null);
        setNotice(`${result.setups.length} record${result.setups.length === 1 ? "" : "s"} imported.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "That file does not match the ThesisLoop CSV format.");
      } finally {
        setSaving(false);
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  async function resetDemo() {
    setSaving(true);
    try {
      const response = await fetch("/api/setups/reset", { method: "POST" });
      const result = await response.json() as { setups?: Setup[]; error?: string };
      if (!response.ok || !result.setups) throw new Error(result.error ?? "Unable to restore demo data.");
      setSetups(result.setups);
      setSelectedId(result.setups[0]?.id ?? 0);
      setTab("overview");
      setNotice("Demo data restored.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to restore demo data.");
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    const csv = "symbol,setup,source,thesis,plannedRisk,createdAt,status,returnPct,followedPlan,outcomeNote\nSHOP,Breakout,Momentum leaders,Price cleared the base on volume,2.0,2026-09-08,open,,,";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "thesisloop-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function selectSetup(item: Setup) {
    setSelectedId(item.id);
    if (tab !== "overview") setTab(item.status === "closed" ? "trades" : "setups");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><span className="brand-mark">T</span><div><strong>ThesisLoop</strong><span>Research with memory</span></div></div>
        <nav aria-label="Primary navigation">
          {(["overview", "setups", "trades", "insights"] as Tab[]).map((item, index) => (
            <button key={item} className={`nav-item ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}><span>0{index + 1}</span> {item[0].toUpperCase() + item.slice(1)}{item === "setups" && <b>{open.length}</b>}</button>
          ))}
        </nav>
        <div className="side-note"><span className="status-dot" /> Connected demo<p>Records are saved in the demo database.</p><button onClick={resetDemo} disabled={saving}>Reset demo data</button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">{tab === "overview" ? "Research review" : tab}</p><h1>{tab === "overview" ? "Know what actually worked." : tab === "setups" ? "Your open ideas." : tab === "trades" ? "The outcome, not the story." : "Patterns from your own decisions."}</h1><p className="subtitle">{tab === "overview" ? "Connect every market idea to the decision and its outcome." : tab === "setups" ? "Keep the original reasoning visible before the market changes your memory." : tab === "trades" ? "Review what happened and whether you followed the plan." : "Learn which sources, setups and habits have earned your trust."}</p></div>
          <div className="header-actions"><input ref={fileRef} className="file-input" type="file" accept=".csv,text/csv" onChange={importCsv} /><button className="button secondary" disabled={saving} onClick={() => setModal("import")}>Import CSV</button><button className="button primary" disabled={saving} onClick={() => setModal("record")}>Record a setup <span>+</span></button></div>
        </header>

        {loading && <div className="system-state"><span className="loading-dot" /> Loading saved research...</div>}
        {loadError && <div className="system-state error-state"><div><strong>The database could not be reached.</strong><p>{loadError}</p></div><button className="button secondary" onClick={() => window.location.reload()}>Try again</button></div>}

        {!loading && !loadError && tab === "overview" && <>
          <div className="metrics" aria-label="Account summary">
            <article><span>Open theses</span><strong>{open.length}</strong><small>{open.filter((item) => daysSince(item.createdAt).match(/[7-9]|\d{2}/)).length} need a review</small></article>
            <article><span>Closed trades</span><strong>{closed.length}</strong><small>Saved in the demo database</small></article>
            <article><span>Plan adherence</span><strong>{quality}%</strong><small className={quality >= 70 ? "positive" : "negative"}>{followed} of {closed.length} followed plan</small></article>
            <article><span>Best source</span><strong className="word-metric">{bestSource}</strong><small>By average outcome</small></article>
          </div>
          <div className="content-grid">
            <SetupTable title="Ideas waiting for an outcome" eyebrow="Review queue" items={open} selectedId={selected?.id} onSelect={selectSetup} empty="No open ideas. Record one to begin." />
            {selected && <ThesisCard item={selected} onClose={() => setModal("close")} />}
          </div>
        </>}

        {!loading && !loadError && tab === "setups" && <div className="single-grid"><SetupTable title="Open setups" eyebrow="Original reasoning" items={open} selectedId={selected?.id} onSelect={selectSetup} empty="No open setups." />{selected?.status === "open" && <ThesisCard item={selected} onClose={() => setModal("close")} />}</div>}

        {!loading && !loadError && tab === "trades" && <div className="single-grid"><SetupTable title="Completed reviews" eyebrow="Trade history" items={closed} selectedId={selected?.id} onSelect={selectSetup} empty="No closed trades yet." />{selected?.status === "closed" && <ThesisCard item={selected} onClose={() => undefined} />}</div>}

        {!loading && !loadError && tab === "insights" && <Insights sources={sources} closed={closed} />}
      </section>

      {modal === "record" && <Modal title="Record the idea before the outcome" onClose={() => setModal(null)}><form onSubmit={saveSetup} className="form-grid"><label>Symbol<input name="symbol" required placeholder="NVDA" maxLength={8} /></label><label>Setup<input name="setup" required placeholder="Breakout" /></label><label>Found through<input name="source" required placeholder="Momentum leaders" /></label><label>Planned risk (%)<input name="risk" required type="number" min="0.1" max="100" step="0.1" placeholder="2.0" /></label><label>Date<input name="date" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><label className="full">Original thesis<textarea name="thesis" required rows={4} placeholder="What did you see and what would prove this idea wrong?" /></label><div className="form-actions full"><button type="button" className="button secondary" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving..." : "Save setup"}</button></div></form></Modal>}

      {modal === "close" && selected && <Modal title={`Close the loop on ${selected.symbol}`} onClose={() => setModal(null)}><form onSubmit={closeLoop} className="form-grid"><label>Return (%)<input name="returnPct" required type="number" step="0.1" placeholder="4.2" /></label><label>Did you follow the plan?<select name="followedPlan" required defaultValue=""><option value="" disabled>Select one</option><option value="yes">Yes</option><option value="no">No</option></select></label><label className="full">What actually happened?<textarea name="outcomeNote" required rows={4} placeholder="Record the decision, not only the market move." /></label><div className="original-box full"><span>Original thesis</span><p>{selected.thesis}</p></div><div className="form-actions full"><button type="button" className="button secondary" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving..." : "Save outcome"}</button></div></form></Modal>}

      {modal === "import" && <Modal title="Import past decisions" onClose={() => setModal(null)}><div className="import-panel"><p>Use the template so every trade stays connected to its setup, source and original thesis. Open and closed records can be imported together.</p><div className="header-list"><span>Required headers</span><code>symbol, setup, source, thesis, plannedRisk, createdAt</code></div><div className="form-actions"><button className="button secondary" onClick={downloadTemplate}>Download template</button><button className="button primary" onClick={() => fileRef.current?.click()}>Choose CSV</button></div></div></Modal>}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

function SetupTable({ title, eyebrow, items, selectedId, onSelect, empty }: { title: string; eyebrow: string; items: Setup[]; selectedId?: number; onSelect: (item: Setup) => void; empty: string }) {
  return <section className="panel review-panel"><div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><span className="count-label">{items.length} records</span></div>{items.length ? <div className="table-wrap"><table><thead><tr><th>Symbol</th><th>Setup</th><th>Found through</th><th>{items[0]?.status === "closed" ? "Outcome" : "Age"}</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id} className={selectedId === item.id ? "selected-row" : ""}><td><strong>{item.symbol}</strong><span className="exchange">US MARKET</span></td><td>{item.setup}</td><td>{item.source}</td><td>{item.status === "closed" ? <span className={(item.returnPct ?? 0) >= 0 ? "gain" : "loss"}>{(item.returnPct ?? 0) > 0 ? "+" : ""}{item.returnPct}%</span> : daysSince(item.createdAt)}</td><td><button className="mini-button" onClick={() => onSelect(item)}>View</button></td></tr>)}</tbody></table></div> : <div className="empty-state">{empty}</div>}</section>;
}

function ThesisCard({ item, onClose }: { item: Setup; onClose: () => void }) {
  return <aside className="panel thesis-card"><div className="thesis-top"><div><span className="ticker">{item.symbol}</span><span className="pill">{item.setup}</span></div>{item.status === "closed" ? <span className={(item.returnPct ?? 0) >= 0 ? "gain" : "loss"}>{(item.returnPct ?? 0) > 0 ? "+" : ""}{item.returnPct}%</span> : <span className="open-label">Open</span>}</div><p className="eyebrow">Original thesis</p><h2>{item.thesis}</h2>{item.status === "closed" && <div className="outcome-box"><span>What happened</span><p>{item.outcomeNote}</p></div>}<dl><div><dt>Found through</dt><dd>{item.source}</dd></div><div><dt>Planned risk</dt><dd>{item.plannedRisk}%</dd></div><div><dt>{item.status === "closed" ? "Plan followed" : "Recorded"}</dt><dd>{item.status === "closed" ? <><span className={item.followedPlan ? "status-dot" : "status-dot missed"} />{item.followedPlan ? "Yes" : "No"}</> : new Date(`${item.createdAt}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</dd></div></dl>{item.status === "open" && <button className="button dark" onClick={onClose}>Close the loop <span>→</span></button>}</aside>;
}

function Insights({ sources, closed }: { sources: Array<{ source: string; total: number; average: number; followed: number }>; closed: Setup[] }) {
  const planned = closed.filter((item) => item.followedPlan);
  const unplanned = closed.filter((item) => item.followedPlan === false);
  const average = (items: Setup[]) => items.length ? items.reduce((sum, item) => sum + (item.returnPct ?? 0), 0) / items.length : 0;
  const planGap = average(planned) - average(unplanned);
  return <div className="insights-grid"><section className="panel source-panel"><div className="panel-heading"><div><p className="eyebrow">Source attribution</p><h2>Where your useful ideas came from</h2></div></div><div className="source-list">{sources.length ? sources.map((row) => <div className="source-row" key={row.source}><div className="source-copy"><strong>{row.source}</strong><span>{row.total} trade{row.total === 1 ? "" : "s"} · {row.followed} followed plan</span></div><div className="bar-track"><span style={{ width: `${Math.max(7, Math.min(100, ((row.average + 3) / 15) * 100))}%` }} /></div><b className={row.average >= 0 ? "gain" : "loss"}>{row.average > 0 ? "+" : ""}{row.average.toFixed(1)}%</b></div>) : <div className="empty-state">Close a trade to create your first insight.</div>}</div></section><aside className="insight-stack"><article className="insight-callout"><p className="eyebrow">Behavior signal</p><strong>{planGap >= 0 ? "+" : ""}{planGap.toFixed(1)}%</strong><h2>difference when you followed the plan</h2><p>This is based only on your saved outcomes. It describes your history, it does not predict the next trade.</p></article><article className="panel trust-note"><p className="eyebrow">Why this matters</p><h2>The tool remembers what the market makes easy to forget.</h2><p>Every result stays tied to the thesis you wrote before you knew the outcome.</p></article></aside></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">ThesisLoop</p><h2 id="modal-title">{title}</h2></div><button onClick={onClose} aria-label="Close dialog">×</button></div>{children}</section></div>;
}
