"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GateResult } from "@/lib/gate.ts";
import { SPEC_FIELDS, SPEC_LABELS, type Finding, type Order } from "@/lib/types.ts";
import { post } from "./api.ts";
import { StatusPill } from "./status.tsx";

interface Props {
  order: Order;
  gate: GateResult;
  aiConfigured: boolean;
  paypalConfigured: boolean;
}

export function OrderWorkspace({ order, gate, aiConfigured, paypalConfigured }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const locked = Boolean(order.paypal?.authorizationId);

  async function run(label: string, url: string, body?: unknown) {
    setBusy(label);
    setError(undefined);
    try {
      await post(url, body);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  }

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
          </div>
        </div>
        <div className="row">
          <button
            className={order.analysis ? "" : "primary"}
            disabled={!!busy || locked}
            onClick={() => run("analyze", `/api/orders/${order.id}/analyze`)}
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
        <b>{gate.ok ? "Payment unlocked" : "Payment blocked"}</b>
        {gate.ok ? (
          <> — {gate.amount?.toFixed(2)} {order.pricing.currency} ready to collect via PayPal.</>
        ) : (
          <> — {gate.reasons.join(" ")}</>
        )}
      </div>

      <div className="grid-main">
        <div>
          {order.analysis && (
            <div className="panel">
              <div className="row spread">
                <h2>AI findings</h2>
                <span className="small muted">
                  {order.analysis.demo ? "demo fixture" : order.analysis.model} ·{" "}
                  {new Date(order.analysis.ranAt).toLocaleString()}
                </span>
              </div>
              <p>{order.analysis.summary}</p>
              {findings.length === 0 && <p className="pill ok">All sources agree.</p>}
              {findings.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  sourceName={sourceName}
                  disabled={!!busy || locked}
                  onAction={(body) => run(f.id, `/api/orders/${order.id}/findings/${f.id}`, body)}
                />
              ))}
              {openQuestions.length > 0 && <ClarificationDraft order={order} findings={openQuestions} />}
            </div>
          )}

          <div className="panel">
            <h2>Sources ({order.sources.length})</h2>
            {order.sources.map((s) => (
              <details key={s.id} style={{ marginBottom: 8 }}>
                <summary>
                  <span className="pill info">{s.kind}</span> {s.name} <span className="small muted">({s.id})</span>
                </summary>
                {s.text && <div className="source-text">{s.text}</div>}
                {s.file && s.mimeType?.startsWith("image/") && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${order.id}/${s.file}`} alt={s.name} className="thumb" style={{ maxWidth: 320 }} />
                )}
                {s.file && s.mimeType === "application/pdf" && (
                  <a href={`/api/files/${order.id}/${s.file}`} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                )}
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
                              if (value != null) run(field, `/api/orders/${order.id}/spec`, { field, value });
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

          <div className="panel">
            <h2>Payment (PayPal)</h2>
            {!paypalConfigured && <p className="error small">PayPal sandbox credentials are not set in .env.local.</p>}
            <p className="small">
              Amount: <b>{gate.amount != null ? `${gate.amount.toFixed(2)} ${order.pricing.currency}` : "—"}</b>
              {order.approvedSpecHash && (
                <>
                  <br />
                  Approved spec hash: <code>{order.approvedSpecHash}</code>
                </>
              )}
              {order.paypal?.orderId && (
                <>
                  <br />
                  PayPal order: <code>{order.paypal.orderId}</code> ({order.paypal.lastStatus})
                </>
              )}
              {order.paypal?.authorizationId && (
                <>
                  <br />
                  Authorization: <code>{order.paypal.authorizationId}</code>
                </>
              )}
              {order.paypal?.captureId && (
                <>
                  <br />
                  Capture: <code>{order.paypal.captureId}</code>
                </>
              )}
            </p>
            <div className="row">
              {(order.status === "ready_for_proof" || order.status === "proof_sent") && (
                <button
                  className={order.status === "ready_for_proof" ? "primary" : ""}
                  disabled={!!busy}
                  onClick={() => run("proof", `/api/orders/${order.id}/spec`, { action: "send_proof" })}
                >
                  {order.status === "proof_sent" ? "Proof sent ✓" : "Send proof to customer"}
                </button>
              )}
              {gate.ok && (
                <Link href={`/p/${order.id}`} className="button" target="_blank">
                  Open customer proof page ↗
                </Link>
              )}
              {order.status === "authorized" && (
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => run("capture", `/api/orders/${order.id}/paypal/capture`)}
                >
                  Start production &amp; capture payment
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FindingCard({
  finding: f,
  sourceName,
  disabled,
  onAction,
}: {
  finding: Finding;
  sourceName: (id: string) => string;
  disabled: boolean;
  onAction: (body: { status: "resolved" | "waived" | "open"; value?: string }) => void;
}) {
  const [value, setValue] = useState(f.resolvedValue ?? f.suggestedValue ?? "");
  const done = f.status !== "open";
  return (
    <div className={`finding ${f.severity} ${done ? "done" : ""}`}>
      <div className="row spread">
        <div className="row" style={{ gap: 8 }}>
          <span className={`pill ${f.severity}`}>{f.severity}</span>
          <span className="small muted">{SPEC_LABELS[f.field]}</span>
        </div>
        {done && <span className="pill ok">{f.status === "resolved" ? `→ ${f.resolvedValue}` : "waived"}</span>}
      </div>
      <h3 style={{ marginTop: 6 }}>{f.title}</h3>
      <div className="small">{f.explanation}</div>
      <ul className="evidence">
        {f.evidence.map((e, i) => (
          <li key={i}>
            <b>{sourceName(e.sourceId)}</b> {e.value} — <span className="quote">{e.quote}</span>
          </li>
        ))}
      </ul>
      {f.severity !== "info" && (
        <div className="small muted" style={{ marginBottom: 8 }}>
          Ask the customer: “{f.customerQuestion}”
        </div>
      )}
      {done ? (
        <button className="small" disabled={disabled} onClick={() => onAction({ status: "open" })}>
          Reopen
        </button>
      ) : (
        f.severity !== "info" && (
          <div className="row">
            <input style={{ flex: 1, minWidth: 180 }} value={value} onChange={(e) => setValue(e.target.value)} />
            <button className="primary" disabled={disabled || !value.trim()} onClick={() => onAction({ status: "resolved", value })}>
              Confirm value
            </button>
            <button disabled={disabled} onClick={() => onAction({ status: "waived" })}>
              Waive
            </button>
          </div>
        )
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
    "Once these are settled we'll send a final proof with a PayPal link to approve and pay.",
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
