"use client";

import { useEffect, useState } from "react";

/** A time in the viewer's zone. The server doesn't know that zone, so it renders nothing for this text. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => setText(new Date(iso).toLocaleString()), [iso]);
  return <time dateTime={iso}>{text}</time>;
}
