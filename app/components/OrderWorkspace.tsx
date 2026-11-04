"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GateResult } from "@/lib/gate.ts";
import {
  CHECK_GROUP_LABELS,
  CHECKED_FIELDS,
  runDiff,
  SPEC_FIELDS,
  SPEC_LABELS,
  type CheckGroup,
  type Finding,
  type Order,
  type RequiredArtworkField,
  type ArtworkVerification,
} from "@/lib/types.ts";
import { post } from "./api.ts";
import { useAsk, type Ask } from "./Dialog.tsx";
import { LocalTime } from "./LocalTime.tsx";
import { OrderSteps, StatusPill } from "./status.tsx";

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
  const { ask, dialog } = useAsk();
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
  const toSettle = findings.filter((f) => f.severity !== "info");
  const settled = toSettle.filter((f) => HANDLED.has(f.status)).length;
  const sourceName = (id: string) => order.sources.find((s) => s.id === id)?.name ?? id;
  const diff = order.analysis ? runDiff(order.analysis) : null;
  const findingGroups = (Object.keys(CHECK_GROUP_LABELS) as CheckGroup[])
    .map((group) => ({ group, items: findings.filter((f) => f.checkGroup === group) }))
    .filter(({ items }) => items.length > 0);

  const editSpec = async (field: (typeof SPEC_FIELDS)[number]) => {
    const value = await ask({
      title: `Edit ${SPEC_LABELS[field].toLowerCase()}`,
      inputLabel: SPEC_LABELS[field],
      initial: order.spec[field] ?? "",
      confirmLabel: "Save",
    });
    if (value != null) api(field, `/api/orders/${order.id}/spec`, { field, value });
  };

  return (
    <>
      {dialog}
      <div className="row spread page-head">
        <div style={{ minWidth: 0 }}>
          <h1>{order.title}</h1>
          <div className="row" style={{ gap: 8 }}>
            <span className="muted">
              {order.customerName} {order.customerEmail && `· ${order.customerEmail}`}
            </span>
            <StatusPill status={order.status} />
            {order.iteration > 1 && <span className="pill plain">Revision {order.iteration}</span>}
          </div>
        </div>
        <button
          className={!order.analysis || checkStale ? "primary" : ""}
          disabled={!!busy || locked}
          aria-busy={busy === "analyze"}
          onClick={() => api("analyze", `/api/orders/${order.id}/analyze`)}
        >
          {busy === "analyze" ? "Checking all sources…" : order.analysis ? "Re-run AI check" : "Run AI check"}
        </button>
      </div>

      <OrderSteps status={order.status} />

      {!aiConfigured && (
        <p className="notice small">
          Demo mode: no AI key is set, so the sample order uses saved results. Add a key to analyze your own orders
          live.
        </p>
      )}
      {error && <p className="error error-sticky" role="alert">{error}</p>}

      <GateBanner order={order} gate={gate} locked={locked} />

      <div className="grid-main">
        <div>
          {order.analysis && (
            <div className="panel">
              <div className="row spread" style={{ alignItems: "baseline" }}>
                <h2>AI findings</h2>
                <span className="small muted">
                  {order.analysis.status === "failed" ? "last check FAILED" : order.analysis.savedRecheck ? "saved re-check of the sample's corrected file (not a live check)" : order.analysis.demo ? "demo fixture" : order.analysis.model} ·{" "}
                  <LocalTime iso={order.analysis.ranAt} />
                </span>
              </div>
              {order.analysis.status === "failed" && <p className="error">{order.analysis.error}</p>}
              <p>{order.analysis.summary}</p>
              {toSettle.length > 0 && (
                <div>
                  <b className="small">{settled} of {toSettle.length} settled</b>
                  <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={toSettle.length} aria-valuenow={settled}>
                    <span className={settled === 0 ? "empty-bar" : ""} style={{ width: `${(settled / toSettle.length) * 100}%` }} />
                  </div>
                </div>
              )}
              {diff && (
                <p className="small muted">
                  Since the last check: {diff.new.length} new, {diff.stillOpen.length} still open,{" "}
                  {diff.resolved.length} resolved.
                </p>
              )}
              {findings.length === 0 && <p className="pill ok">All sources agree.</p>}
              {findingGroups.map(({ group, items }) => (
                <div key={group} className="check-group">
                  <h3>{CHECK_GROUP_LABELS[group]}</h3>
                  {items.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      isNew={diff?.new.includes(f) ?? false}
                      verificationResults={(order.analysis?.verifications ?? []).filter(
                        (verification) => verification.findingId === f.id,
                      )}
                      hasArtworkEvidence={f.evidence.some((item) =>
                        order.sources.some((source) => source.id === item.sourceId && source.kind === "design"),
                      )}
                      sourceName={sourceName}
                      disabled={!!busy || locked}
                      ask={ask}
                      onAction={(body) => api(f.id, `/api/orders/${order.id}/findings/${f.id}`, body)}
                    />
                  ))}
                </div>
              ))}
              {openQuestions.length > 0 && <ClarificationDraft order={order} findings={openQuestions} />}
            </div>
          )}

          <ArtworkPanel order={order} disabled={!!busy || locked} checkStale={checkStale} run={run} />

          <div className="panel">
            <h2>Sources ({order.sources.length})</h2>
            {order.sources.map((s) => (
              <details key={s.id}>
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
                      <th style={{ width: "40%" }}>
                        {SPEC_LABELS[field]}
                        {!CHECKED_FIELDS.includes(field) && <div className="spec-note">not verified by AI</div>}
                      </th>
                      <td>
                        {order.spec[field] ?? <span className="muted">—</span>}{" "}
                        {!locked && (
                          <button className="edit-button" aria-label={`Edit ${SPEC_LABELS[field]}`} onClick={() => editSpec(field)}>
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

          <PaymentPanel order={order} gate={gate} paypalConfigured={paypalConfigured} disabled={!!busy} ask={ask} api={api} />

          <div className="panel">
            <h2>History</h2>
            <ul className="timeline">
              {[...order.history].reverse().slice(0, 30).map((h, i) => (
                <li key={i}>
                  <span className="muted small"><LocalTime iso={h.at} /></span>
                  <br />
                  {h.summary}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function GateBanner({ order, gate, locked }: { order: Order; gate: GateResult; locked: boolean }) {
  if (locked) {
    return (
      <div className="gate locked">
        <div>
          <b>Order locked: {order.status === "cancelled" ? "cancelled" : "payment held or captured"}.</b>
        </div>
        {order.status !== "cancelled" && (
          <Link href={`/p/${order.id}`} className="button" target="_blank">
            View customer receipt ↗
          </Link>
        )}
      </div>
    );
  }
  const canOpenProof = gate.ok || order.status === "approved";
  return (
    <div className={`gate ${gate.ok ? "open" : "blocked"}`}>
      <div>
        <b>{gate.ok ? "Ready for customer approval" : "Approval blocked"}</b>
        {gate.ok ? (
          <p>{gate.amount?.toFixed(2)} {order.pricing.currency}. Send the customer the proof link.</p>
        ) : gate.reasons.length > 1 ? (
          <ul>
            {gate.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        ) : (
          <p>{gate.reasons[0]}</p>
        )}
      </div>
      {canOpenProof && (
        <Link href={`/p/${order.id}`} className="button" target="_blank">
          Open customer proof page ↗
        </Link>
      )}
    </div>
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
      {checkStale && <p className="error">Artwork changed since the last AI check. Re-run the check.</p>}
      {order.isSample && (
        <p className="notice small">
          Sample order: <a href="/api/orders/sample/corrected-artwork">download its corrected artwork</a> to upload as
          the new version.
        </p>
      )}
      {designs.map((s) => {
        const current = s.versions?.at(-1);
        return (
          <div key={s.id} style={{ marginBottom: 20 }}>
            <h3>
              {s.name}
              <span className="artwork-meta">Current: v{current?.version} · {current?.sha256.slice(0, 12)}</span>
            </h3>
            {current?.mimeType.startsWith("image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${order.id}/${current.file}`} alt={s.name} className="thumb preview stack-top" />
            )}
            {current?.mimeType === "application/pdf" && (
              <a href={`/api/files/${order.id}/${current.file}`} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            )}
            {(s.versions?.length ?? 0) > 1 && (
              <ul className="evidence stack-top">
                {s.versions!.map((v) => (
                  <li key={v.version}>
                    <a href={`/api/files/${order.id}/${v.file}`} target="_blank" rel="noreferrer">
                      v{v.version}
                    </a>{" "}
                    <LocalTime iso={v.uploadedAt} /> · {v.sha256.slice(0, 12)} {v.note && `· ${v.note}`}
                  </li>
                ))}
              </ul>
            )}
            {!disabled && (
              <form
                className="upload-form"
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
                <input name="file" type="file" aria-label={`Corrected file for ${s.name}`} accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
                <input name="note" placeholder="What changed (optional)" aria-label="What changed" />
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
  ask,
  api,
}: {
  order: Order;
  gate: GateResult;
  paypalConfigured: boolean;
  disabled: boolean;
  ask: Ask;
  api: (label: string, url: string, body?: unknown) => Promise<void>;
}) {
  const current = order.payments.find((p) => p.iteration === order.iteration);
  const askVoid = async (reopen: boolean) => {
    const reason = await ask(
      reopen
        ? {
            title: "Void & reopen for changes",
            body: "PayPal releases the held payment. The customer will need to approve again and pay again.",
            inputLabel: "Why reopen this order?",
            multiline: true,
            minLength: 1,
            confirmLabel: "Void & reopen",
            danger: true,
          }
        : {
            title: "Void & cancel order",
            body: "PayPal releases the held payment and the order is cancelled.",
            inputLabel: "Why cancel this order?",
            multiline: true,
            minLength: 1,
            confirmLabel: "Void & cancel",
            danger: true,
          },
    );
    if (reason) api("void", `/api/orders/${order.id}/paypal/void`, { reopen, reason });
  };
  return (
    <div className="panel">
      <h2>Approval &amp; payment (PayPal)</h2>
      {!paypalConfigured && <p className="error">PayPal sandbox credentials are not set in .env.local.</p>}
      {gate.amount != null ? (
        <div className="pay-amount">{gate.amount.toFixed(2)} {order.pricing.currency}</div>
      ) : (
        <p className="small">Amount: <b>—</b></p>
      )}
      <p className="small">
        Customer approval:{" "}
        {order.approval ? (
          <>
            <b>{order.approval.approvedBy.name}</b>, <LocalTime iso={order.approval.approvedAt} /> · version{" "}
            <code>{order.approval.versionHash.slice(0, 12)}</code>
          </>
        ) : (
          <span className="muted">none for the current version</span>
        )}
      </p>
      {current?.status === "authorized" && (
        <div className="actions">
          <button className="primary" disabled={disabled} onClick={() => api("capture", `/api/orders/${order.id}/paypal/capture`)}>
            Start production &amp; capture
          </button>
          <button disabled={disabled} onClick={() => askVoid(true)}>
            Void &amp; reopen for changes
          </button>
          <button disabled={disabled} onClick={() => askVoid(false)}>
            Void &amp; cancel order
          </button>
        </div>
      )}
      {[...order.payments].reverse().map((p) => (
        <div key={p.iteration} className="payment-card">
          <div className="row spread">
            <b>Revision {p.iteration}</b>
            <span className={`pill ${p.status === "voided" ? "info" : "ok"}`}>{p.status}</span>
          </div>
          <dl>
            <dt>Order</dt>
            <dd><code>{p.paypalOrderId}</code></dd>
            {p.authorizationId && (
              <>
                <dt>Auth</dt>
                <dd><code>{p.authorizationId}</code></dd>
              </>
            )}
            {p.captureId && (
              <>
                <dt>Capture</dt>
                <dd><code>{p.captureId}</code></dd>
              </>
            )}
          </dl>
          <ul className="evidence">
            {p.events.map((e, i) => (
              <li key={i}>
                <LocalTime iso={e.at} timeOnly /> · {e.id === "api" ? "app" : "webhook"} · {e.type} — {e.summary}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const ARTWORK_FIELDS: { value: RequiredArtworkField; label: string }[] = [
  { value: "year", label: "Year" },
  { value: "date", label: "Date" },
  { value: "name", label: "Name" },
  { value: "url", label: "URL" },
  { value: "text_line", label: "Text line" },
  { value: "ink_colors", label: "Ink colors" },
];
const artworkFieldLabel = (field: string) => ARTWORK_FIELDS.find((a) => a.value === field)?.label ?? field;

function FindingCard({
  finding: f,
  hasArtworkEvidence,
  sourceName,
  disabled,
  ask,
  onAction,
  verificationResults,
  isNew,
}: {
  finding: Finding;
  verificationResults: ArtworkVerification[];
  isNew: boolean;
  hasArtworkEvidence: boolean;
  sourceName: (id: string) => string;
  disabled: boolean;
  ask: Ask;
  onAction: (body: unknown) => void;
}) {
  const invalidEvidence = f.evidenceValid === false;
  const [value, setValue] = useState(f.resolvedValue ?? (invalidEvidence ? "" : f.suggestedValue ?? ""));
  const [required, setRequired] = useState<{ field: RequiredArtworkField; value: string }[]>(
    f.requiredFields ?? [{ field: "text_line", value: "" }],
  );
  const done = HANDLED.has(f.status);

  const waive = async () => {
    const reason = await ask({
      title: "Waive this issue",
      body: "The order goes ahead with this exception, and the customer sees your reason before approving.",
      inputLabel: "Why is it OK to print with this exception?",
      multiline: true,
      minLength: 10,
      confirmLabel: "Waive",
    });
    if (reason) onAction({ type: "waive", reason });
  };

  const dismiss = async () => {
    const mustCheckArtwork = f.requiresArtworkFix || hasArtworkEvidence;
    const reason = await ask({
      title: "Dismiss as AI error",
      body: "Use this when the problem doesn't exist. Your reason is logged and isn't shown to the customer.",
      inputLabel: "Why is this an AI error?",
      multiline: true,
      minLength: 10,
      checkbox: mustCheckArtwork ? "I checked the artwork file myself and the problem isn't there." : undefined,
      confirmLabel: "Dismiss",
    });
    if (reason) onAction({ type: "dismiss", reason, checkedArtworkMyself: mustCheckArtwork });
  };

  return (
    <div className={`finding ${f.severity} ${done ? "done" : ""}`}>
      <div className="finding-head">
        <div className="pills">
          <span className={`pill ${f.severity}`}>{f.severity}</span>
          <span className="field-name">{SPEC_LABELS[f.field]}</span>
          {f.requiresArtworkFix && <span className="pill warning">artwork fix</span>}
          {isNew && <span className="pill info">new</span>}
          {invalidEvidence ? (
            <span className={`pill ${f.evidenceStatus === "invalid" ? "blocking" : "warning"}`}>
              {f.evidenceStatus === "invalid" ? "invalid evidence" : "unverified evidence"}
            </span>
          ) : (
            <span className="pill ok">quotes checked</span>
          )}
        </div>
        <span className="pill plain">{f.status.replaceAll("_", " ")}</span>
      </div>
      <div className="finding-body">
        <h3>{f.title}</h3>
        <div className="small">{f.explanation}</div>
        {invalidEvidence && f.evidenceProblems?.map((problem, index) => (
          <p className={f.evidenceStatus === "invalid" ? "error" : "notice warn small"} key={index}>{problem}</p>
        ))}
        <ul className="evidence">
          {f.evidence.map((e, i) => (
            <li key={i} className="evidence-item">
              <span className="evidence-source">{sourceName(e.sourceId)}</span>
              {e.value} — <span className="quote">{e.quote}</span>
            </li>
          ))}
        </ul>
        {verificationResults.length > 0 && (
          <div className="recheck">
            <b>Artwork re-check</b>
            <ul>
              {verificationResults.map((verification, index) => {
                const confirmed = verification.matches && verification.codeCheck === "pass" && !verification.reason;
                return (
                  <li key={index}>
                    <span className={`pill ${confirmed ? "ok" : "blocking"}`}>{confirmed ? "confirmed" : "not confirmed"}</span>{" "}
                    <b>{artworkFieldLabel(verification.field)}:</b> expected &quot;{verification.expected}&quot;;
                    observed &quot;{verification.observed ?? "not readable"}&quot;
                    {verification.reason ? ` (${verification.reason})` : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {f.laterReports?.map((report, index) => (
          <p className="note" key={index}>The latest check also said: {report}</p>
        ))}
        {f.waiveReason && <p className="note">Waived: {f.waiveReason}</p>}
        {f.dismissal && <p className="note">Dismissed as AI error: {f.dismissal.reason}</p>}
        {f.requiredFields && (
          <p className="note">
            Artwork must show: {f.requiredFields.map((r) => `${artworkFieldLabel(r.field)} = "${r.value}"`).join(", ")}
          </p>
        )}

        {f.severity === "info" ? null : f.status !== "open" ? (
          <div className="actions">
            <button className="small" disabled={disabled} onClick={() => onAction({ type: "reopen" })}>
              Reopen
            </button>
          </div>
        ) : (
          <>
            {!f.requiresArtworkFix && (
              <div className="confirm-row">
                <input
                  value={value}
                  aria-label={`Confirmed value for ${SPEC_LABELS[f.field]}`}
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
            <details open={f.requiresArtworkFix}>
              <summary>Needs corrected artwork: set what it must show</summary>
              <div className="details-body">
                {required.map((r, i) => (
                  <div className="field-row" key={i}>
                    <select
                      value={r.field}
                      aria-label="Artwork field"
                      onChange={(e) =>
                        setRequired(required.map((x, j) => (j === i ? { ...x, field: e.target.value as RequiredArtworkField } : x)))
                      }
                    >
                      {ARTWORK_FIELDS.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                    <input
                      value={r.value}
                      aria-label="What the artwork must show"
                      onChange={(e) => setRequired(required.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    />
                    {required.length > 1 && (
                      <button
                        className="small"
                        aria-label="Remove this field"
                        onClick={() => setRequired(required.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <div className="actions">
                  <button className="small" onClick={() => setRequired([...required, { field: "text_line", value: "" }])}>
                    + Add field
                  </button>
                  <button
                    className="small primary"
                    disabled={disabled}
                    onClick={() => onAction({ type: "require_artwork", requiredFields: required.filter((r) => r.value.trim()) })}
                  >
                    Require corrected artwork
                  </button>
                </div>
              </div>
            </details>
            <div className="actions">
              {!f.requiresArtworkFix && (
                <button className="small" disabled={disabled} onClick={waive}>
                  Waive (shown to customer)
                </button>
              )}
              <button className="small" disabled={disabled} onClick={dismiss}>
                Dismiss as AI error
              </button>
            </div>
          </>
        )}
      </div>
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
    <details>
      <summary>Draft clarification message ({findings.length} questions)</summary>
      <div className="source-text" style={{ maxHeight: "none" }}>
        {text}
      </div>
      <div className="details-body">
        <button
          className="small"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </details>
  );
}
