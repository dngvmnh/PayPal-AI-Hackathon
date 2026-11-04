// Fixed-window limits for the public host, kept in memory: the app runs on one instance and a restart just resets them.
// Live AI checks cost money, so they also have a cap across all visitors, which a faked IP header can't get around.
const HOUR = 60 * 60 * 1000;

type Rule = { scope: "ip" | "global"; limit: number; windowMs: number };

export const LIMITS = {
  /** Creating orders and uploading files fill the disk */
  write: [{ scope: "ip", limit: 60, windowMs: HOUR }],
  liveAi: [
    { scope: "ip", limit: 10, windowMs: HOUR },
    { scope: "global", limit: 100, windowMs: 24 * HOUR },
  ],
} satisfies Record<string, Rule[]>;

const windows = new Map<string, { count: number; resetAt: number }>();

/** Counts one request against each rule. Returns the seconds to wait if any rule is exceeded, or 0 if allowed. */
export function hit(bucket: keyof typeof LIMITS, ip: string, now = Date.now()): number {
  if (windows.size > 10_000) {
    for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
  }
  for (const rule of LIMITS[bucket] as Rule[]) {
    const key = `${bucket}:${rule.scope}:${rule.scope === "ip" ? ip : "*"}`;
    const w = windows.get(key);
    if (!w || w.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    } else if (w.count >= rule.limit) {
      return Math.ceil((w.resetAt - now) / 1000);
    } else {
      w.count++;
    }
  }
  return 0;
}

export function resetLimits(): void {
  windows.clear();
}

/** A 429 response if this request is over its limit, otherwise null. */
export function limitRequest(req: Request, bucket: keyof typeof LIMITS): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const wait = hit(bucket, ip);
  if (!wait) return null;
  return Response.json(
    { error: `Too many requests. Try again in ${Math.ceil(wait / 60)} minute(s).` },
    { status: 429, headers: { "Retry-After": String(wait) } },
  );
}
