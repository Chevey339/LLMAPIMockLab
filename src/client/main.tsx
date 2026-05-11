import { Activity, Braces, Check, Copy, Database, FileDown, ListFilter, Play, Plus, RefreshCcw, Save, Settings, Trash2, Workflow } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { removeRuleImmediately, upsertRuleImmediately } from "./ruleState.js";
import "./styles.css";

type Tab = "requests" | "rules" | "providers" | "settings";

type CapturedRequest = {
  id: number;
  timestamp: string;
  provider: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  rawHeaders: string[];
  rawBody: string;
  parsedJson: unknown;
  matchedRuleId: number | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  durationMs: number;
};

type MockRule = {
  id: number;
  name: string;
  provider: string;
  method: string;
  pathPattern: string;
  priority: number;
  enabled: boolean;
  matchers: unknown[];
  responseMode: "json" | "sse";
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  sseEvents: string[];
  delayMs: number;
};

function App() {
  const [tab, setTab] = useState<Tab>("requests");
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [rules, setRules] = useState<MockRule[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => requests.find((item) => item.id === selectedId) ?? requests[0], [requests, selectedId]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return requests;
    return requests.filter((item) => `${item.provider} ${item.method} ${item.path} ${item.rawBody} ${item.responseBody}`.toLowerCase().includes(needle));
  }, [requests, query]);

  async function refresh() {
    const [requestData, ruleData] = await Promise.all([
      fetch("/_mock/api/requests").then((res) => res.json()),
      fetch("/_mock/api/rules").then((res) => res.json())
    ]);
    setRequests(requestData.items);
    setRules(ruleData.items);
    const current = selectedIdRef.current;
    if (current && requestData.items.some((item: CapturedRequest) => item.id === current)) {
      return;
    }
    if (!current && requestData.items[0]) {
      selectedIdRef.current = requestData.items[0].id;
      setSelectedId(requestData.items[0].id);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, []);

  async function clearRequests() {
    await fetch("/_mock/api/requests", { method: "DELETE" });
    selectedIdRef.current = null;
    setSelectedId(null);
    await refresh();
  }

  async function createRule() {
    const response = await fetch("/_mock/api/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "New fixed response",
        provider: "openai",
        method: "POST",
        pathPattern: "/v1/chat/completions",
        priority: 10,
        enabled: true,
        matchers: [],
        responseMode: "json",
        status: 200,
        responseHeaders: {},
        responseBody: {
          id: "chatcmpl_custom",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: "Custom mock response" }, finish_reason: "stop" }]
        }
      })
    });
    const created = await response.json();
    setRules((current) => upsertRuleImmediately(current, created));
    setSelectedRuleId(created.id);
    setTab("rules");
    void refresh();
  }

  async function saveRule(rule: MockRule) {
    const response = await fetch(`/_mock/api/rules/${rule.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rule)
    });
    if (!response.ok) throw new Error(await response.text());
    const saved = await response.json();
    setRules((current) => upsertRuleImmediately(current, saved));
    setSelectedRuleId(saved.id);
    void refresh();
  }

  async function deleteRule(id: number) {
    const response = await fetch(`/_mock/api/rules/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await response.text());
    let nextSelectedRuleId: number | null = selectedRuleId;
    setRules((current) => {
      const next = removeRuleImmediately(current, id, nextSelectedRuleId);
      nextSelectedRuleId = next.selectedRuleId;
      return next.rules;
    });
    setSelectedRuleId(nextSelectedRuleId);
    void refresh();
  }

  function selectRequest(id: number) {
    selectedIdRef.current = id;
    setSelectedId(id);
  }

  return (
    <div className="app-shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark"><Activity size={18} /></span>
          <div>
            <strong>Mock Lab</strong>
            <small>LLM API simulator</small>
          </div>
        </div>
        <nav className="tabs" aria-label="Main">
          <TabButton active={tab === "requests"} onClick={() => setTab("requests")} icon={<Braces size={18} />} label="Requests" />
          <TabButton active={tab === "rules"} onClick={() => setTab("rules")} icon={<Workflow size={18} />} label="Rules" />
          <TabButton active={tab === "providers"} onClick={() => setTab("providers")} icon={<Play size={18} />} label="Providers" />
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings size={18} />} label="Settings" />
        </nav>
        <div className="side-note">
          <Database size={16} />
          Headers and bodies are stored raw.
        </div>
      </aside>

      <main className="workspace">
        {tab === "requests" && (
          <RequestsView
            requests={filtered}
            selected={selected}
            selectedId={selectedId}
            query={query}
            setQuery={setQuery}
            onSelect={selectRequest}
            onRefresh={refresh}
            onClear={clearRequests}
          />
        )}
        {tab === "rules" && (
          <RulesView
            rules={rules}
            selectedId={selectedRuleId}
            onSelect={setSelectedRuleId}
            onCreate={createRule}
            onSave={saveRule}
            onDelete={deleteRule}
          />
        )}
        {tab === "providers" && <ProvidersView />}
        {tab === "settings" && <SettingsView onClear={clearRequests} requests={requests} />}
      </main>
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button className={props.active ? "tab active" : "tab"} onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function RequestsView(props: {
  requests: CapturedRequest[];
  selected?: CapturedRequest;
  selectedId: number | null;
  query: string;
  setQuery: (value: string) => void;
  onSelect: (id: number) => void;
  onRefresh: () => void;
  onClear: () => void;
}) {
  return (
    <section className="surface">
      <header className="toolbar">
        <div>
          <h1>Requests</h1>
          <p>Inspect provider calls exactly as your client sent them.</p>
        </div>
        <div className="actions">
          <label className="search">
            <ListFilter size={16} />
            <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Filter requests" />
          </label>
          <button onClick={props.onRefresh}><RefreshCcw size={16} />Refresh</button>
          <button className="danger" onClick={props.onClear}><Trash2 size={16} />Clear</button>
        </div>
      </header>
      <div className="request-grid">
        <div className="request-list" role="list">
          {props.requests.length === 0 ? (
            <div className="empty">No captured traffic yet. Point your client base URL at this service and send a request.</div>
          ) : (
            props.requests.map((item) => (
              <button key={item.id} className={props.selectedId === item.id ? "request-row selected" : "request-row"} onClick={() => props.onSelect(item.id)}>
                <span className={`pill ${item.provider}`}>{item.provider}</span>
                <span className="method">{item.method}</span>
                <span className="path">{item.path}</span>
                <span className="status">{item.responseStatus}</span>
              </button>
            ))
          )}
        </div>
        <RequestDetail request={props.selected} />
      </div>
    </section>
  );
}

function RequestDetail({ request }: { request?: CapturedRequest }) {
  const [panel, setPanel] = useState<"headers" | "body" | "response">("body");
  if (!request) return <div className="detail empty">Select a request to inspect it.</div>;
  const panelText = panel === "headers" ? JSON.stringify(request.headers, null, 2) : panel === "body" ? request.rawBody : request.responseBody;
  return (
    <aside className="detail">
      <div className="detail-head">
        <div>
          <h2>#{request.id} {request.path}</h2>
          <p>{new Date(request.timestamp).toLocaleString()} · {request.durationMs}ms · rule {request.matchedRuleId ?? "fallback"}</p>
        </div>
        <button title="Copy current panel" onClick={() => navigator.clipboard.writeText(panelText)}><Copy size={16} /></button>
      </div>
      <div className="segmented">
        <button className={panel === "headers" ? "active" : ""} onClick={() => setPanel("headers")}>Headers</button>
        <button className={panel === "body" ? "active" : ""} onClick={() => setPanel("body")}>Body</button>
        <button className={panel === "response" ? "active" : ""} onClick={() => setPanel("response")}>Response</button>
      </div>
      <pre>{panelText}</pre>
    </aside>
  );
}

function RulesView({
  rules,
  selectedId,
  onSelect,
  onCreate,
  onSave,
  onDelete
}: {
  rules: MockRule[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onSave: (rule: MockRule) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const selected = rules.find((rule) => rule.id === selectedId) ?? rules[0];
  return (
    <section className="surface">
      <header className="toolbar">
        <div>
          <h1>Rules</h1>
          <p>Rules decide what fixed response a matching client request receives. Higher priority wins.</p>
        </div>
        <button onClick={onCreate}><Plus size={16} />New rule</button>
      </header>
      <div className="rules-grid">
        <div className="rule-list">
          {rules.map((rule) => (
            <button className={selected?.id === rule.id ? "rule selected" : "rule"} key={rule.id} onClick={() => onSelect(rule.id)}>
              <div>
                <h2>{rule.name}</h2>
                <p>{rule.method} {rule.pathPattern}</p>
              </div>
              <span className={`pill ${rule.provider}`}>{rule.provider}</span>
              <span>priority {rule.priority}</span>
              <span>{rule.enabled ? "enabled" : "disabled"}</span>
              <span>{rule.responseMode}</span>
            </button>
          ))}
        </div>
        <RuleEditor rule={selected} onSave={onSave} onDelete={onDelete} />
      </div>
    </section>
  );
}

function RuleEditor({ rule, onSave, onDelete }: { rule?: MockRule; onSave: (rule: MockRule) => Promise<void>; onDelete: (id: number) => Promise<void> }) {
  const [draft, setDraft] = useState<MockRule | undefined>(rule);
  const [matchersText, setMatchersText] = useState("[]");
  const [headersText, setHeadersText] = useState("{}");
  const [bodyText, setBodyText] = useState("null");
  const [eventsText, setEventsText] = useState("[]");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(rule);
    setMatchersText(JSON.stringify(rule?.matchers ?? [], null, 2));
    setHeadersText(JSON.stringify(rule?.responseHeaders ?? {}, null, 2));
    setBodyText(JSON.stringify(rule?.responseBody ?? null, null, 2));
    setEventsText(JSON.stringify(rule?.sseEvents ?? [], null, 2));
    setMessage("");
  }, [rule?.id]);

  if (!draft) return <aside className="rule-editor empty">Create or select a rule.</aside>;

  function update(patch: Partial<MockRule>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function save() {
    if (!draft) return;
    try {
      const next = {
        ...draft,
        matchers: JSON.parse(matchersText),
        responseHeaders: JSON.parse(headersText),
        responseBody: JSON.parse(bodyText),
        sseEvents: JSON.parse(eventsText)
      };
      await onSave(next);
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid JSON");
    }
  }

  async function remove() {
    if (!draft) return;
    await onDelete(draft.id);
  }

  return (
    <aside className="rule-editor">
      <div className="detail-head">
        <div>
          <h2>Rule #{draft.id}</h2>
          <p>Match a request, then return this fixed response.</p>
        </div>
        {message && <span className="save-state"><Check size={14} />{message}</span>}
      </div>
      <div className="form-grid">
        <label>Name<input value={draft.name} onChange={(event) => update({ name: event.target.value })} /></label>
        <label>Provider
          <select value={draft.provider} onChange={(event) => update({ provider: event.target.value })}>
            <option value="openai">openai</option>
            <option value="anthropic">anthropic</option>
            <option value="gemini">gemini</option>
            <option value="unknown">unknown</option>
          </select>
        </label>
        <label>Method<input value={draft.method} onChange={(event) => update({ method: event.target.value.toUpperCase() })} /></label>
        <label>Path pattern<input value={draft.pathPattern} onChange={(event) => update({ pathPattern: event.target.value })} /></label>
        <label>Priority<input type="number" value={draft.priority} onChange={(event) => update({ priority: Number(event.target.value) })} /></label>
        <label>Status<input type="number" value={draft.status} onChange={(event) => update({ status: Number(event.target.value) })} /></label>
        <label>Stream delay ms<input type="number" min="0" value={draft.delayMs} onChange={(event) => update({ delayMs: Number(event.target.value) })} /></label>
        <label>Mode
          <select value={draft.responseMode} onChange={(event) => update({ responseMode: event.target.value as MockRule["responseMode"] })}>
            <option value="json">json</option>
            <option value="sse">sse</option>
          </select>
        </label>
        <label className="check-row"><input type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} /> Enabled</label>
      </div>
      <label className="textarea-label">Matchers JSON
        <textarea value={matchersText} onChange={(event) => setMatchersText(event.target.value)} />
      </label>
      <p className="hint">Example: [{"{"}"source":"json","key":"model","op":"equals","value":"gpt-test"{"}"}] or [{"{"}"source":"body","op":"contains","value":"weather"{"}"}]</p>
      <label className="textarea-label">Response headers JSON
        <textarea value={headersText} onChange={(event) => setHeadersText(event.target.value)} />
      </label>
      <label className="textarea-label">Response body JSON
        <textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} />
      </label>
      <label className="textarea-label">SSE events JSON array
        <textarea value={eventsText} onChange={(event) => setEventsText(event.target.value)} />
      </label>
      <div className="actions">
        <button onClick={save}><Save size={16} />Save</button>
        <button className="danger" onClick={remove}><Trash2 size={16} />Delete</button>
      </div>
    </aside>
  );
}

function ProvidersView() {
  const rows = [
    ["OpenAI Chat", "POST /v1/chat/completions", "stream, tools, image_url capture"],
    ["OpenAI Responses", "POST /v1/responses", "text, usage, multimodal input capture"],
    ["Anthropic Messages", "POST /v1/messages", "text, usage, tool response fixtures"],
    ["Gemini", "POST /v1beta/models/{model}:generateContent", "text, function calls, inline_data capture"],
    ["Gemini Stream", "POST /v1beta/models/{model}:streamGenerateContent", "SSE-style fixed chunks"]
  ];
  return (
    <section className="surface">
      <header className="toolbar">
        <div>
          <h1>Providers</h1>
          <p>Use this service as the base URL for your SDK or HTTP client.</p>
        </div>
      </header>
      <div className="provider-table">
        {rows.map(([name, endpoint, notes]) => (
          <div className="provider-row" key={endpoint}>
            <strong>{name}</strong>
            <code>{endpoint}</code>
            <span>{notes}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsView({ onClear, requests }: { onClear: () => void; requests: CapturedRequest[] }) {
  function exportJson() {
    const blob = new Blob([JSON.stringify(requests, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mocklab-requests.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="surface compact">
      <header className="toolbar">
        <div>
          <h1>Settings</h1>
          <p>No authentication and no redaction are enabled by default.</p>
        </div>
      </header>
      <div className="settings-grid">
        <button onClick={exportJson}><FileDown size={16} />Export requests</button>
        <button className="danger" onClick={onClear}><Trash2 size={16} />Clear request log</button>
      </div>
      <pre>{`PORT=7394
HOST=127.0.0.1
DATABASE_PATH=./data/mocklab.sqlite
MAX_BODY_BYTES=52428800`}</pre>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
