"use client";

import { useEffect, useState } from "react";

/** A time in the viewer's zone. The server doesn't know that zone, so it renders nothing for this text. */
export function LocalTime({ iso, timeOnly }: { iso: string; timeOnly?: boolean }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const date = new Date(iso);
    setText(timeOnly ? date.toLocaleTimeString() : date.toLocaleString());
  }, [iso, timeOnly]);
  return <time dateTime={iso}>{text}</time>;
}
