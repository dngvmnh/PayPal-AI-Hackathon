"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GateResult } from "@/lib/gate.ts";
import {
  SPEC_FIELDS,
  SPEC_LABELS,
  type Finding,
  type Order,
  type RequiredArtworkField,
  type ArtworkVerification,
} from "@/lib/types.ts";
import { post } from "./api.ts";
import { StatusPill } from "./status.tsx";

interface Props {
  order: Order;
  gate: GateResult;
  aiConfigured: boolean;
  paypalConfigured: boolean;
  /** true when the last check read different artwork than the current versions */
  checkStale: boolean;
}

const LOCKED = new Set(["authorized", "captured", "cancelled"]);
const HANDLED = new Set(["resolved", "resolved_by_artwork", "waived", "dismissed_ai_error"]);

export function OrderWorkspace({ order, gate, aiConfigured, paypalConfigured, checkStale }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const locked = LOCKED.has(order.status);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(undefined);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      router.refresh();
    } finally {
      setBusy(undefined);
    }
  }
  const api = (label: string, url: string, body?: unknown) => run(label, () => post(url, body));

  const findings = order.analysis?.findings ?? [];
  const openQuestions = findings.filter((f) => f.status === "open" && f.severity !== "info");
  const sourceName = (id: string) => order.sources.find((s) => s.id === id)?.name ?? id;

  return (
    <>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <div>
          <h1>{order.title}</h1>
          <div className="muted">
            {order.customerName} {order.customerEmail && `· ${order.customerEmail}`} ·{" "}
            <StatusPill status={order.status} />
            {order.iteration > 1 && <span className="small"> · iteration {order.iteration}</span>}
          </div>
        </div>
        <div className="row">
          <button
            className={!order.analysis || checkStale ? "primary" : ""}
            disabled={!!busy || locked}
            onClick={() => api("analyze", `/api/orders/${order.id}/analyze`)}
          >
            {busy === "analyze" ? "Checking all sources…" : order.analysis ? "Re-run AI check" : "Run AI check"}
          </button>
        </div>
      </div>

      {!aiConfigured && (
        <p className="hint">
          Demo mode: no ANTHROPIC_API_KEY set, so the sample order uses a saved analysis. Add a key to analyze
          your own orders live.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className={`gate ${gate.ok ? "open" : "blocked"}`}>
        {locked ? (
          <b>Order locked: {order.status === "cancelled" ? "cancelled" : "payment held or captured"}.</b>
        ) : (
          <>
            <b>{gate.ok ? "Ready for customer approval" : "Approval blocked"}</b>
            {gate.ok ? (
              <> — {gate.amount?.toFixed(2)} {order.pricing.currency}. Send the customer the proof link.</>
            ) : (
              <> — {gate.reasons.join(" ")}</>
            )}
          </>
        )}
      </div>

      <div className="grid-main">
        <div>
          {order.analysis && (
            <div className="panel">
              <div className="row spread">
                <h2>AI findings</h2>
                <span className="small muted">
                  {order.analysis.status === "failed" ? "last check FAILED" : order.analysis.demo ? "demo fixture" : order.analysis.model} ·{" "}
                  {new Date(order.analysis.ranAt).toLocaleString()}
                </span>
              </div>
              {order.analysis.status === "failed" && <p className="error small">{order.analysis.error}</p>}
              <p>{order.analysis.summary}</p>
              {findings.length === 0 && <p className="pill ok">All sources agree.</p>}
              {findings.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
verificationResults={(order.analysis?.verifications ?? []).filter(
  (verification) => verification.findingId === f.id
)}
hasArtworkEvidence={f.evidence.some((item) =>
  order.sources.some((source) => source.id === item.sourceId && source.kind === "design")
)}
                  sourceName={sourceName}
                  disabled={!!busy || locked}
                  onAction={(body) => api(f.id, `/api/orders/${order.id}/findings/${f.id}`, body)}
                />
              ))}
              {openQuestions.length > 0 && <ClarificationDraft order={order} findings={openQuestions} />}
            </div>
          )}

          <ArtworkPanel order={order} disabled={!!busy || locked} checkStale={checkStale} run={run} />

          <div className="panel">
            <h2>Sources ({order.sources.length})</h2>
            {order.sources.map((s) => (
              <details key={s.id} style={{ marginBottom: 8 }}>
                <summary>
                  <span className="pill info">{s.kind}</span> {s.name} <span className="small muted">({s.id})</span>
                </summary>
                {s.text && <div className="source-text">{s.text}</div>}
              </details>
            ))}
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>Final spec</h2>
            {!order.analysis ? (
              <p className="muted small">Run the AI check to build the spec from all sources.</p>
            ) : (
              <table>
                <tbody>
                  {SPEC_FIELDS.map((field) => (
                    <tr key={field}>
                      <th style={{ width: "40%" }}>{SPEC_LABELS[field]}</th>
                      <td>
                        {order.spec[field] ?? <span className="muted">—</span>}{" "}
                        {!locked && (
                          <button
                            className="small"
                            style={{ padding: "0 6px" }}
                            onClick={() => {
                              const value = prompt(SPEC_LABELS[field], order.spec[field] ?? "");
                              if (value != null) api(field, `/api/orders/${order.id}/spec`, { field, value });
                            }}
                          >
                            edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <PaymentPanel order={order} gate={gate} paypalConfigured={paypalConfigured} disabled={!!busy} api={api} />

          <div className="panel">
            <h2>History</h2>
            <ul className="evidence">
              {[...order.history].reverse().slice(0, 30).map((h, i) => (
                <li key={i}>
                  <span className="muted">{new Date(h.at).toLocaleString()}</span> — {h.summary}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function ArtworkPanel({
  order,
  disabled,
  checkStale,
  run,
}: {
  order: Order;
  disabled: boolean;
  checkStale: boolean;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const designs = order.sources.filter((s) => s.kind === "design");
  if (!designs.length) return null;
  return (
    <div className="panel">
      <h2>Artwork</h2>
      {checkStale && <p className="error small">Artwork changed since the last AI check. Re-run the check.</p>}
      {designs.map((s) => {
        const current = s.versions?.at(-1);
        return (
          <div key={s.id} style={{ marginBottom: 16 }}>
            <h3>
              {s.name} <span className="small muted">current: v{current?.version} · {current?.sha256.slice(0, 12)}</span>
            </h3>
            {current?.mimeType.startsWith("image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${order.id}/${current.file}`} alt={s.name} className="thumb" style={{ maxWidth: 320 }} />
            )}
            {current?.mimeType === "application/pdf" && (
              <a href={`/api/files/${order.id}/${current.file}`} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            )}
            {(s.versions?.length ?? 0) > 1 && (
              <ul className="evidence">
                {s.versions!.map((v) => (
                  <li key={v.version}>
                    <a href={`/api/files/${order.id}/${v.file}`} target="_blank" rel="noreferrer">
                      v{v.version}
                    </a>{" "}
                    {new Date(v.uploadedAt).toLocaleString()} · {v.sha256.slice(0, 12)} {v.note && `· ${v.note}`}
                  </li>
                ))}
              </ul>
            )}
            {!disabled && (
              <form
                className="row"
                style={{ marginTop: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  form.set("sourceId", s.id);
                  run(`upload-${s.id}`, async () => {
                    const res = await fetch(`/api/orders/${order.id}/artwork`, { method: "POST", body: form });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
                  });
                }}
              >
                <input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" style={{ flex: 2, minWidth: 180 }} />
                <input name="note" placeholder="What changed (optional)" style={{ flex: 2, minWidth: 140 }} />
                <button>Upload corrected version</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PaymentPanel({
  order,
  gate,
  paypalConfigured,
  disabled,
  api,
}: {
  order: Order;
  gate: GateResult;
  paypalConfigured: boolean;
  disabled: boolean;
  api: (label: string, url: string, body?: unknown) => Promise<void>;
}) {
  const current = order.payments.find((p) => p.iteration === order.iteration);
  const askVoid = (reopen: boolean) => {
    const reason = prompt(reopen ? "Why reopen this order? (the customer will need to approve again)" : "Why cancel this order?");
    if (reason) api("void", `/api/orders/${order.id}/paypal/void`, { reopen, reason });
  };
  return (
    <div className="panel">
      <h2>Approval &amp; payment (PayPal)</h2>
      {!paypalConfigured && <p className="error small">PayPal sandbox credentials are not set in .env.local.</p>}
      <p className="small">
        Amount: <b>{gate.amount != null ? `${gate.amount.toFixed(2)} ${order.pricing.currency}` : "—"}</b>
        <br />
        Customer approval:{" "}
        {order.approval ? (
          <>
            <b>{order.approval.approvedBy.name}</b>, {new Date(order.approval.approvedAt).toLocaleString()} · version{" "}
            <code>{order.approval.versionHash.slice(0, 12)}</code>
          </>
        ) : (
          <span className="muted">none for the current version</span>
        )}
      </p>
      <div className="row">
        {(gate.ok || order.status === "approved") && (
          <Link href={`/p/${order.id}`} className="button" target="_blank">
            Open customer proof page ↗
          </Link>
        )}
        {current?.status === "authorized" && (
          <>
            <button className="primary" disabled={disabled} onClick={() => api("capture", `/api/orders/${order.id}/paypal/capture`)}>
              Start production &amp; capture
            </button>
            <button disabled={disabled} onClick={() => askVoid(true)}>
              Void &amp; reopen for changes
            </button>
            <button disabled={disabled} onClick={() => askVoid(false)}>
              Void &amp; cancel order
            </button>
          </>
        )}
      </div>
      {order.payments.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Iter.</th>
              <th>Status</th>
              <th>PayPal ids &amp; events</th>
            </tr>
          </thead>
          <tbody>
            {[...order.payments].reverse().map((p) => (
              <tr key={p.iteration}>
                <td>{p.iteration}</td>
                <td>
                  <span className={`pill ${p.status === "voided" ? "info" : "ok"}`}>{p.status}</span>
                </td>
                <td className="small">
                  order <code>{p.paypalOrderId}</code>
                  {p.authorizationId && (
                    <>
                      <br />
                      auth <code>{p.authorizationId}</code>
                    </>
                  )}
                  {p.captureId && (
                    <>
                      <br />
                      capture <code>{p.captureId}</code>
                    </>
                  )}
                  <ul className="evidence">
                    {p.events.map((e, i) => (
                      <li key={i}>
                        {new Date(e.at).toLocaleTimeString()} · {e.id === "api" ? "app" : "webhook"} · {e.type} — {e.summary}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const ARTWORK_FIELDS: RequiredArtworkField[] = ["year", "date", "name", "url", "text_line", "ink_colors"];

// Minimal controls so the agreed rules can be exercised end to end. The full findings UI is AI-8a/8b.
function FindingCard({
  finding: f,
  hasArtworkEvidence,
  sourceName,
  disabled,
  onAction,
verificationResults,
}: {
  finding: Finding;
verificationResults: ArtworkVerification[];
  hasArtworkEvidence: boolean;
  sourceName: (id: string) => string;
  disabled: boolean;
  onAction: (body: unknown) => void;
}) {
  const invalidEvidence = f.evidenceValid === false;
  const [value, setValue] = useState(f.resolvedValue ?? (invalidEvidence ? "" : f.suggestedValue ?? ""));
  const [required, setRequired] = useState<{ field: RequiredArtworkField; value: string }[]>(
    f.requiredFields ?? [{ field: "text_line", value: "" }],
  );
  const done = HANDLED.has(f.status);

  const askReason = (message: string) => {
    const reason = prompt(message);
    return reason?.trim() ? reason.trim() : undefined;
  };

  return (
    <div className={`finding ${f.severity} ${done ? "done" : ""}`}>
      <div className="row spread">
        <div className="row" style={{ gap: 8 }}>
          <span className={`pill ${f.severity}`}>{f.severity}</span>
          <span className="small muted">{SPEC_LABELS[f.field]}</span>
          {f.requiresArtworkFix && <span className="pill warning">artwork fix</span>}
{invalidEvidence && (
  <span className="pill blocking">
    {f.evidenceStatus === "invalid" ? "invalid evidence" : "unverified evidence"}
  </span>
)}
        </div>
        <span className="pill info">{f.status.replaceAll("_", " ")}</span>
      </div>
      <h3 style={{ marginTop: 6 }}>{f.title}</h3>
<div className="small">{f.explanation}</div>
{invalidEvidence && f.evidenceProblems?.map((problem, index) => (
  <p className="error small" key={index}>{problem}</p>
))}
      <ul className="evidence">
        {f.evidence.map((e, i) => (
          <li key={i}>
            <b>{sourceName(e.sourceId)}</b> {e.value} — <span className="quote">{e.quote}</span>
          </li>
        ))}
      </ul>
{verificationResults.length > 0 && (
  <div className="small">
    <b>Artwork re-check</b>
    <ul>
      {verificationResults.map((verification, index) => (
        <li key={index}>
          {verification.field}: expected "{verification.expected}";
          observed "{verification.observed ?? "not readable"}" —{" "}
          {verification.matches &&
          verification.codeCheck === "pass" &&
          !verification.reason
            ? "confirmed"
            : "not confirmed"}
          {verification.reason ? ` (${verification.reason})` : ""}
        </li>
      ))}
    </ul>
  </div>
)}
      {f.waiveReason && <div className="small">Waived: {f.waiveReason}</div>}
      {f.dismissal && <div className="small">Dismissed as AI error: {f.dismissal.reason}</div>}
      {f.requiredFields && (
        <div className="small">
          Artwork must show: {f.requiredFields.map((r) => `${r.field} = "${r.value}"`).join(", ")}
        </div>
      )}

      {f.severity === "info" ? null : f.status !== "open" ? (
        <button className="small" disabled={disabled} onClick={() => onAction({ type: "reopen" })}>
          Reopen
        </button>
      ) : (
        <>
          {!f.requiresArtworkFix && (
            <div className="row" style={{ marginTop: 8 }}>
              <input
                style={{ flex: 1, minWidth: 180 }}
                value={value}
                placeholder={invalidEvidence ? "Type the correct value yourself" : ""}
                onChange={(e) => setValue(e.target.value)}
              />
              <button
                className="primary"
                disabled={disabled || !value.trim()}
                onClick={() => onAction({ type: "confirm", value, typedByHand: invalidEvidence })}
              >
                Confirm value
              </button>
            </div>
          )}
          <details style={{ marginTop: 8 }} open={f.requiresArtworkFix}>
            <summary className="small">Needs corrected artwork: set what it must show</summary>
            {required.map((r, i) => (
              <div className="row" key={i} style={{ marginTop: 4 }}>
                <select
                  value={r.field}
                  style={{ width: 130 }}
                  onChange={(e) =>
                    setRequired(required.map((x, j) => (j === i ? { ...x, field: e.target.value as RequiredArtworkField } : x)))
                  }
                >
                  {ARTWORK_FIELDS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <input
                  style={{ flex: 1, minWidth: 140 }}
                  value={r.value}
                  onChange={(e) => setRequired(required.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                />
              </div>
            ))}
            <div className="row" style={{ marginTop: 4 }}>
              <button className="small" onClick={() => setRequired([...required, { field: "text_line", value: "" }])}>
                + field
              </button>
              <button
                className="small primary"
                disabled={disabled}
                onClick={() => onAction({ type: "require_artwork", requiredFields: required.filter((r) => r.value.trim()) })}
              >
                Require corrected artwork
              </button>
            </div>
          </details>
          <div className="row" style={{ marginTop: 8 }}>
            {!f.requiresArtworkFix && (
              <button
                className="small"
                disabled={disabled}
                onClick={() => {
                  const reason = askReason("Why is it OK to print with this exception? The customer will see this.");
                  if (reason) onAction({ type: "waive", reason });
                }}
              >
                Waive (shown to customer)
              </button>
            )}
            <button
              className="small"
              disabled={disabled}
              onClick={() => {
                const reason = askReason("Why is this an AI error? (logged, not shown to the customer)");
                if (!reason) return;
const checkedArtworkMyself = f.requiresArtworkFix || hasArtworkEvidence
                  ? confirm("I checked the artwork file myself and the problem isn't there.")
                  : false;
                onAction({ type: "dismiss", reason, checkedArtworkMyself });
              }}
            >
              Dismiss as AI error
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ClarificationDraft({ order, findings }: { order: Order; findings: Finding[] }) {
  const [copied, setCopied] = useState(false);
  const text = [
    `Hi ${order.customerName.split(" ")[0] || "there"},`,
    "",
    `Before we print "${order.title}", we want to confirm a few details:`,
    "",
    ...findings.map((f, i) => `${i + 1}. ${f.customerQuestion}`),
    "",
    "Once these are settled we'll send a final proof to approve and pay with PayPal.",
    "",
    "Thanks!",
  ].join("\n");
  return (
    <details style={{ marginTop: 12 }}>
      <summary>Draft clarification message ({findings.length} questions)</summary>
      <div className="source-text" style={{ maxHeight: "none" }}>
        {text}
      </div>
      <button
        className="small"
        style={{ marginTop: 6 }}
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </details>
  );
}
