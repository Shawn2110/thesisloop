import { useEffect, useMemo, useRef, useState } from "react";

type Status = "open" | "closed";
type View = "review" | "open" | "casebook" | "patterns";
type Setup = {
  id: number;
  symbol: string;
  setup: string;
  source: string;
  thesis: string;
  plannedRisk: number;
  createdAt: string;
  status: Status;
  returnPct: number | null;
  followedPlan: boolean | null;
  outcomeNote: string | null;
};
type Modal = "capture" | "close" | "import" | null;
type ApiError = { detail?: string | Array<{ msg?: string }> };

const viewCopy: Record<View, { title: string; description: string }> = {
  review: { title: "Decision review", description: "Close open loops before hindsight changes the story." },
  open: { title: "Open loops", description: "Every thesis still waiting for an outcome." },
  casebook: { title: "Casebook", description: "Original reasoning paired with what happened later." },
  patterns: { title: "Journal evidence", description: "Descriptive patterns from your own closed cases." },
};

const workspaceId = (() => {
  const key = "thesisloop-workspace";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
})();

const apiHeaders = (json = false) => ({
  "X-Workspace-Id": workspaceId,
  ...(json ? { "content-type": "application/json" } : {}),
});

function apiMessage(payload: ApiError, fallback: string) {
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail)) return payload.detail.map((item) => item.msg).filter(Boolean).join(" ") || fallback;
  return fallback;
}

function age(date: string) {
  const elapsed = Date.now() - new Date(`${date}T00:00:00`).getTime();
  const days = Math.max(0, Math.floor(elapsed / 86400000));
  return days === 0 ? "Today" : `${days}d`;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

export default function App() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [view, setView] = useState<View>("review");
  const [selectedId, setSelectedId] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [systemState, setSystemState] = useState<{ tone: "ok" | "error" | "working"; message: string }>({ tone: "working", message: "Connecting to journal" });
  const [formError, setFormError] = useState("");
  const [database, setDatabase] = useState("database");
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadData() {
    setLoading(true);
    setSystemState({ tone: "working", message: "Loading saved cases" });
    try {
      const [setupResponse, healthResponse] = await Promise.all([fetch("/api/setups", { headers:apiHeaders() }), fetch("/api/health")]);
      const setupPayload = await setupResponse.json() as { setups?: Setup[] } & ApiError;
      if (!setupResponse.ok || !setupPayload.setups) throw new Error(apiMessage(setupPayload, "Could not load saved cases."));
      const healthPayload = healthResponse.ok ? await healthResponse.json() as { database?: string } : {};
      setSetups(setupPayload.setups);
      setSelectedId((current) => setupPayload.setups?.some((item) => item.id === current) ? current : setupPayload.setups?.[0]?.id ?? 0);
      setDatabase(healthPayload.database === "postgresql" ? "PostgreSQL" : "local SQLite");
      setSystemState({ tone: "ok", message: `${setupPayload.setups.length} cases saved` });
    } catch (error) {
      setSystemState({ tone: "error", message: error instanceof Error ? error.message : "Journal unavailable" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  const open = setups.filter((item) => item.status === "open");
  const closed = setups.filter((item) => item.status === "closed");
  const selected = setups.find((item) => item.id === selectedId) ?? setups[0];
  const followed = closed.filter((item) => item.followedPlan).length;
  const adherence = closed.length ? Math.round((followed / closed.length) * 100) : 0;
  const avgReturn = closed.length ? closed.reduce((sum, item) => sum + (item.returnPct ?? 0), 0) / closed.length : 0;
  const visibleRows = view === "open" ? open : view === "casebook" ? closed : setups;

  const patterns = useMemo(() => {
    const grouped = new Map<string, { source: string; cases: Setup[] }>();
    closed.forEach((item) => {
      const group = grouped.get(item.source) ?? { source: item.source, cases: [] };
      group.cases.push(item);
      grouped.set(item.source, group);
    });
    return [...grouped.values()].map((group) => ({
      source: group.source,
      count: group.cases.length,
      average: group.cases.reduce((sum, item) => sum + (item.returnPct ?? 0), 0) / group.cases.length,
      adherence: Math.round((group.cases.filter((item) => item.followedPlan).length / group.cases.length) * 100),
    })).sort((a, b) => b.count - a.count);
  }, [closed]);

  function selectCase(item: Setup) {
    setSelectedId(item.id);
    setMobileDetail(true);
  }

  function switchView(next: View) {
    setView(next);
    setMobileDetail(false);
    const rows = next === "open" ? open : next === "casebook" ? closed : setups;
    if (rows.length && !rows.some((item) => item.id === selectedId)) setSelectedId(rows[0].id);
  }

  async function capture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    setSystemState({ tone: "working", message: "Saving original thesis" });
    const form = new FormData(event.currentTarget);
    const payload = {
      symbol: String(form.get("symbol") ?? ""), setup: String(form.get("setup") ?? ""),
      source: String(form.get("source") ?? ""), thesis: String(form.get("thesis") ?? ""),
      plannedRisk: Number(form.get("plannedRisk")), createdAt: String(form.get("createdAt")), status: "open",
    };
    try {
      const response = await fetch("/api/setups", { method: "POST", headers:apiHeaders(true), body: JSON.stringify(payload) });
      const result = await response.json() as { setups?: Setup[] } & ApiError;
      if (!response.ok || !result.setups?.[0]) throw new Error(apiMessage(result, "The thesis could not be saved."));
      const saved = result.setups[0];
      setSetups((current) => [saved, ...current]);
      setSelectedId(saved.id);
      setModal(null);
      setView("review");
      setMobileDetail(true);
      setSystemState({ tone: "ok", message: `${saved.symbol} saved to ${database}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The thesis could not be saved.";
      setFormError(message);
      setSystemState({ tone: "error", message });
    } finally { setSaving(false); }
  }

  async function closeLoop(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setFormError("");
    setSystemState({ tone: "working", message: `Saving ${selected.symbol} outcome` });
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/setups/${selected.id}/outcome`, { method: "PATCH", headers:apiHeaders(true), body: JSON.stringify({
        returnPct: Number(form.get("returnPct")), followedPlan: form.get("followedPlan") === "yes", outcomeNote: String(form.get("outcomeNote") ?? ""),
      }) });
      const saved = await response.json() as Setup & ApiError;
      if (!response.ok || !saved.id) throw new Error(apiMessage(saved, "The outcome could not be saved."));
      setSetups((current) => current.map((item) => item.id === saved.id ? saved : item));
      setModal(null);
      setSystemState({ tone: "ok", message: `${saved.symbol} loop closed and saved` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The outcome could not be saved.";
      setFormError(message);
      setSystemState({ tone: "error", message });
    } finally { setSaving(false); }
  }

  async function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setFormError("");
    try {
      const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
      const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
      const required = ["symbol", "setup", "source", "thesis", "plannedrisk", "createdat"];
      if (!required.every((header) => headers.includes(header))) throw new Error("CSV headers do not match the template.");
      const payload = lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const get = (name: string) => values[headers.indexOf(name)] ?? "";
        const status = get("status").toLowerCase() === "closed" ? "closed" : "open";
        return { symbol:get("symbol"), setup:get("setup"), source:get("source"), thesis:get("thesis"), plannedRisk:Number(get("plannedrisk")), createdAt:get("createdat"), status,
          returnPct:status === "closed" ? Number(get("returnpct")) : null, followedPlan:status === "closed" ? get("followedplan").toLowerCase() === "yes" : null, outcomeNote:status === "closed" ? get("outcomenote") : null };
      });
      const response = await fetch("/api/setups", { method:"POST", headers:apiHeaders(true), body:JSON.stringify(payload) });
      const result = await response.json() as { setups?: Setup[] } & ApiError;
      if (!response.ok || !result.setups) throw new Error(apiMessage(result, "Import failed."));
      setSetups((current) => [...result.setups!, ...current]);
      setModal(null);
      setSystemState({ tone:"ok", message:`${result.setups.length} imported cases saved` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setFormError(message);
      setSystemState({ tone:"error", message });
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  async function resetDemo() {
    if (!window.confirm("Restore the eight demo cases? This replaces every current record.")) return;
    setSaving(true);
    setSystemState({ tone:"working", message:"Restoring demo cases" });
    try {
      const response = await fetch("/api/setups/reset", { method:"POST", headers:apiHeaders() });
      const result = await response.json() as { setups?: Setup[] } & ApiError;
      if (!response.ok || !result.setups) throw new Error(apiMessage(result, "Reset failed."));
      setSetups(result.setups);
      setSelectedId(result.setups[0]?.id ?? 0);
      setMobileDetail(false);
      setView("review");
      setSystemState({ tone:"ok", message:"Eight demo cases restored" });
    } catch (error) {
      setSystemState({ tone:"error", message:error instanceof Error ? error.message : "Reset failed" });
    } finally { setSaving(false); }
  }

  return (
    <main className={`terminal-shell ${mobileDetail ? "detail-active" : ""}`}>
      <header className="utility-bar">
        <div className="brand"><span className="brand-mark">TL</span><strong>ThesisLoop</strong><span className="product-label">Decision review terminal</span></div>
        <div className={`sync-state ${systemState.tone}`} role="status"><span className="sync-dot" />{systemState.message}</div>
        <button className="capture-button" onClick={() => { setFormError(""); setModal("capture"); }}><span>+</span> Record thesis <kbd>N</kbd></button>
      </header>

      <aside className="rail" aria-label="Primary navigation">
        <div className="rail-top">
          {(["review", "open", "casebook", "patterns"] as View[]).map((item) => <button key={item} className={view === item ? "active" : ""} aria-label={`Open ${item}`} onClick={() => switchView(item)}><span className="rail-glyph">{item === "review" ? "R" : item === "open" ? "O" : item === "casebook" ? "C" : "P"}</span><span>{item === "casebook" ? "Cases" : item[0].toUpperCase() + item.slice(1)}</span>{item === "open" && <b>{open.length}</b>}</button>)}
        </div>
        <button className="reset-button" disabled={saving} onClick={resetDemo}>Reset demo</button>
      </aside>

      <section className="terminal-main">
        <div className="screen-heading">
          <div><span className="section-code">THESIS / {view.toUpperCase()}</span><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].description}</p></div>
          <div className="source-truth"><span>Source of truth</span><strong>{database}</strong><small>No live market feed</small></div>
        </div>

        {systemState.tone === "error" && !modal && <div className="persistent-error"><div><strong>Journal connection needs attention</strong><span>{systemState.message}</span></div><button onClick={loadData}>Retry</button></div>}

        {view !== "patterns" && <>
          <section className="evidence-strip" aria-label="Journal summary">
            <div><span>Open loops</span><strong>{open.length}</strong><small>Need an outcome</small></div>
            <div><span>Closed cases</span><strong>{closed.length}</strong><small>Journal sample</small></div>
            <div><span>Plan followed</span><strong>{closed.length ? `${adherence}%` : "-"}</strong><small>{followed} of {closed.length} cases</small></div>
            <div><span>Average outcome</span><strong className={avgReturn >= 0 ? "positive" : "negative"}>{closed.length ? `${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(1)}%` : "-"}</strong><small>Descriptive, not predictive</small></div>
          </section>

          <div className={`review-workbench ${mobileDetail ? "show-detail" : ""}`}>
            <section className="queue-panel">
              <div className="panel-toolbar"><div><span className="panel-kicker">{view === "open" ? "OPEN ONLY" : view === "casebook" ? "COMPLETED ONLY" : "ALL CASES"}</span><strong>{view === "review" ? "Review queue" : viewCopy[view].title}</strong></div><span>{visibleRows.length} records</span></div>
              {loading ? <div className="loading-state">Loading journal records...</div> : visibleRows.length ? <div className="case-table" role="table" aria-label="Decision cases">
                <div className="case-row case-head" role="row"><span>Symbol</span><span>Setup / source</span><span>Status</span><span>Outcome</span></div>
                {visibleRows.map((item) => <button key={item.id} role="row" className={`case-row ${selected?.id === item.id ? "selected" : ""}`} onClick={() => selectCase(item)}>
                  <span className="symbol-cell"><b>{item.symbol}</b><small>{formatDate(item.createdAt)}</small></span>
                  <span className="setup-cell"><b>{item.setup}</b><small>{item.source}</small></span>
                  <span><i className={`status-marker ${item.status}`} />{item.status === "open" ? age(item.createdAt) : "Closed"}</span>
                  <span className={item.status === "closed" && (item.returnPct ?? 0) < 0 ? "negative" : "positive"}>{item.status === "closed" ? `${(item.returnPct ?? 0) > 0 ? "+" : ""}${item.returnPct}%` : "Pending"}</span>
                </button>)}
              </div> : <div className="empty-state"><strong>No cases in this view</strong><span>Record a thesis to start a new decision loop.</span><button onClick={() => setModal("capture")}>Record thesis</button></div>}
            </section>

            <CaseInspector item={selected} onBack={() => setMobileDetail(false)} onClose={() => { setFormError(""); setModal("close"); }} />
          </div>
        </>}

        {view === "patterns" && <Patterns patterns={patterns} cases={closed.length} onOpenCases={() => switchView("casebook")} />}
      </section>

      {modal === "capture" && <Modal title="Record the original thesis" subtitle="Saved exactly as written before the outcome" onClose={() => !saving && setModal(null)}><form className="form-grid" onSubmit={capture}>
        <label>Symbol<input name="symbol" required maxLength={12} autoFocus placeholder="NVDA" /></label>
        <label>Setup<input name="setup" required maxLength={120} placeholder="Base breakout" /></label>
        <label>Source<input name="source" required maxLength={160} placeholder="Weekly review" /></label>
        <label>Planned risk (%)<input name="plannedRisk" required type="number" min="0.1" max="100" step="0.1" placeholder="1.5" /></label>
        <label>Date recorded<input name="createdAt" required type="date" defaultValue={new Date().toISOString().slice(0,10)} /></label>
        <label className="wide">Original thesis<textarea name="thesis" required rows={5} maxLength={5000} placeholder="What do you see, and what would prove the idea wrong?" /></label>
        {formError && <div className="form-error wide" role="alert">{formError}</div>}
        <div className="form-actions wide"><button type="button" onClick={() => setModal(null)} disabled={saving}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving thesis..." : "Save original thesis"}</button></div>
      </form></Modal>}

      {modal === "close" && selected && <Modal title={`Close ${selected.symbol} decision loop`} subtitle="The original thesis will remain unchanged" onClose={() => !saving && setModal(null)}><form className="form-grid" onSubmit={closeLoop}>
        <div className="original-reference wide"><span>ORIGINAL / {formatDate(selected.createdAt)}</span><p>{selected.thesis}</p></div>
        <label>Return (%)<input name="returnPct" required type="number" min="-1000" max="10000" step="0.1" placeholder="4.2" /></label>
        <label>Did you follow the plan?<select name="followedPlan" required defaultValue=""><option value="" disabled>Select one</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label className="wide">Outcome and reflection<textarea name="outcomeNote" required rows={5} maxLength={5000} placeholder="What happened, and what did your decision process get right or wrong?" /></label>
        {formError && <div className="form-error wide" role="alert">{formError}</div>}
        <div className="form-actions wide"><button type="button" onClick={() => setModal(null)} disabled={saving}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving outcome..." : "Close and save loop"}</button></div>
      </form></Modal>}

      {modal === "import" && <Modal title="Import decision history" subtitle="Validate against the template before saving" onClose={() => !saving && setModal(null)}><div className="import-content"><p>Required columns: symbol, setup, source, thesis, plannedRisk and createdAt. Closed cases also need returnPct, followedPlan and outcomeNote.</p>{formError && <div className="form-error" role="alert">{formError}</div>}<div className="form-actions"><button onClick={() => setModal(null)} disabled={saving}>Cancel</button><button className="primary" onClick={() => fileInput.current?.click()} disabled={saving}>{saving ? "Validating..." : "Choose CSV"}</button></div></div></Modal>}
      <input ref={fileInput} hidden type="file" accept=".csv,text/csv" onChange={importCsv} />

      <button className="import-shortcut" onClick={() => { setFormError(""); setModal("import"); }}>Import CSV</button>
    </main>
  );
}

function CaseInspector({ item, onBack, onClose }: { item?: Setup; onBack: () => void; onClose: () => void }) {
  if (!item) return <aside className="inspector-panel empty-inspector"><strong>Select a case</strong><span>The saved evidence will appear here.</span></aside>;
  return <aside className="inspector-panel">
    <div className="inspector-toolbar"><button className="back-button" onClick={onBack}>Back to list</button><span>CASE {String(item.id).padStart(4,"0")}</span><span className={`case-state ${item.status}`}>{item.status}</span></div>
    <div className="inspector-title"><div><span className="large-symbol">{item.symbol}</span><span className="setup-tag">{item.setup}</span></div>{item.status === "closed" && <strong className={(item.returnPct ?? 0) >= 0 ? "positive" : "negative"}>{(item.returnPct ?? 0) > 0 ? "+" : ""}{item.returnPct}%</strong>}</div>
    <section className="evidence-block primary-evidence"><header><span>ORIGINAL THESIS</span><time>{formatDate(item.createdAt)}</time></header><p>{item.thesis}</p><small>Immutable original record</small></section>
    <dl className="case-facts"><div><dt>Found through</dt><dd>{item.source}</dd></div><div><dt>Planned risk</dt><dd>{item.plannedRisk}%</dd></div><div><dt>Current state</dt><dd><i className={`status-marker ${item.status}`} />{item.status === "open" ? "Awaiting outcome" : "Loop closed"}</dd></div></dl>
    {item.status === "closed" ? <section className="evidence-block outcome-evidence"><header><span>OUTCOME / REFLECTION</span><span className={item.followedPlan ? "positive" : "warning"}>{item.followedPlan ? "Plan followed" : "Plan missed"}</span></header><p>{item.outcomeNote}</p><small>Return and adherence are recorded separately</small></section> : <div className="close-zone"><p>Add what happened without changing what you believed before.</p><button onClick={onClose}>Close decision loop</button></div>}
  </aside>;
}

function Patterns({ patterns, cases, onOpenCases }: { patterns: Array<{ source:string; count:number; average:number; adherence:number }>; cases:number; onOpenCases:() => void }) {
  return <section className="patterns-panel">
    <div className="patterns-intro"><div><span>DESCRIPTIVE ONLY</span><h2>Source comparison</h2><p>These numbers describe your closed journal cases. They do not predict which source will work next.</p></div><button onClick={onOpenCases}>Inspect supporting cases</button></div>
    <div className="sample-banner"><strong>{cases}</strong><span>closed cases in this sample</span><small>{cases < 10 ? "Too little evidence for a reliable ranking" : "Review the cases behind every result"}</small></div>
    <div className="pattern-table" role="table" aria-label="Source evidence">
      <div className="pattern-row pattern-head" role="row"><span>Source</span><span>Sample</span><span>Average outcome</span><span>Plan adherence</span><span>Reading</span></div>
      {patterns.map((row) => <div className="pattern-row" role="row" key={row.source}><strong>{row.source}</strong><span>{row.count} case{row.count === 1 ? "" : "s"}</span><span className={row.average >= 0 ? "positive" : "negative"}>{row.average >= 0 ? "+" : ""}{row.average.toFixed(1)}%</span><span>{row.adherence}%</span><span className="evidence-label">{row.count < 3 ? "Insufficient evidence" : "Review cases"}</span></div>)}
    </div>
  </section>;
}

function Modal({ title, subtitle, onClose, children }: { title:string; subtitle:string; onClose:() => void; children:React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><span>THESISLOOP</span><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button aria-label="Close dialog" onClick={onClose}>×</button></header>{children}</section></div>;
}
