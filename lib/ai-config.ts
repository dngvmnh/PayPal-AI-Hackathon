/** Server-only provider selection. No credentials are returned to the browser. */
export function aiProvider(): "anthropic" | "astropods" {
  const provider = process.env.AI_PROVIDER || "anthropic";
  if (provider !== "anthropic" && provider !== "astropods") {
    throw new Error("AI_PROVIDER must be anthropic or astropods.");
  }
  return provider;
}

export function aiModel(): string {
  return aiProvider() === "astropods"
    ? process.env.ASTRO_MODEL || "qwen3-vl"
    : "claude-opus-5-5";
}

export function aiConfigured(): boolean {
  return aiProvider() === "astropods"
    ? Boolean(process.env.ASTRO_GATEWAY_URL && process.env.ASTRO_GATEWAY_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);
}
