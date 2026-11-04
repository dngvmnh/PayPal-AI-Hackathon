"use client";

import { useEffect, useRef, useState } from "react";

export interface AskOptions {
  title: string;
  body?: string;
  /** label of the text field; leave out for a plain yes/no dialog */
  inputLabel?: string;
  initial?: string;
  multiline?: boolean;
  minLength?: number;
  /** a statement the person must tick before going on */
  checkbox?: string;
  confirmLabel: string;
  danger?: boolean;
}

export type Ask = (options: AskOptions) => Promise<string | null>;

/** Replaces the browser's prompt() and confirm(): `await ask(...)` gives the typed value, or null if cancelled. */
export function useAsk() {
  const [request, setRequest] = useState<{ options: AskOptions; resolve: (value: string | null) => void }>();
  const ask: Ask = (options) => new Promise((resolve) => setRequest({ options, resolve }));
  const dialog = request ? (
    <AskDialog
      options={request.options}
      onClose={(value) => {
        request.resolve(value);
        setRequest(undefined);
      }}
    />
  ) : null;
  return { ask, dialog };
}

function AskDialog({ options, onClose }: { options: AskOptions; onClose: (value: string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(options.initial ?? "");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const hasInput = options.inputLabel != null;
  const longEnough = !options.minLength || value.trim().length >= options.minLength;
  const ready = longEnough && (!options.checkbox || checked);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose(null);
      }}
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{options.title}</h2>
      </div>
      <form
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onClose(value.trim());
        }}
      >
        {options.body && <p>{options.body}</p>}
        {hasInput && (
          <>
            <label htmlFor="dialog-input" style={{ marginTop: 0 }}>{options.inputLabel}</label>
            {options.multiline ? (
              <textarea id="dialog-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            ) : (
              <input id="dialog-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            )}
            {options.minLength && <p className="hint">At least {options.minLength} characters.</p>}
          </>
        )}
        {options.checkbox && (
          <label className="check-label stack-top">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            {options.checkbox}
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={() => onClose(null)}>Cancel</button>
          <button className={options.danger ? "danger" : "primary"} disabled={!ready}>
            {options.confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
