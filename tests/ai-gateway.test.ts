import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeWithGateway, gatewayAnalysisSchema, gatewayContent, parseGatewayAnalysis } from "../lib/ai-gateway.ts";

const analysis = {
  summary: "AI reported no inconsistencies in the scoped checks. This is not a guarantee; review the sources and artwork before approval.",
  proposedSpec: [], findings: [],
  pricing: { quantity: 10, unitPrice: 2, currency: "USD" },
};
const config = { url: "https://gateway.example", key: "synthetic-test-key", model: "qwen3-vl" };
const content = [
  { type: "text" as const, text: '<source id="brief">10 shirts</source>' },
  { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: "dGVzdA==" } },
];
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function success(overrides: Record<string, unknown> = {}) {
  return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) }, ...overrides }] };
}

test("gateway sends image bytes and source labels, then validates the actual schema", async () => {
  let count = 0;
  const mock = (async (url: string | URL | Request, init?: RequestInit) => {
    count++;
    assert.equal(url, "https://gateway.example/v1/chat/completions");
    const body = JSON.parse(String(init!.body));
    assert.equal(body.messages[1].content[1].image_url.url, "data:image/png;base64,dGVzdA==");
    assert.match(body.messages[1].content[0].text, /source id="brief"/);
    assert.match(body.messages[0].content, /proposedSpec/);
    return reply(success());
  }) as typeof fetch;
  assert.deepEqual(await analyzeWithGateway(content, "Check this order", config, mock), analysis);
  assert.equal(count, 1);
});

test("invalid JSON and missing schema fields never count as a successful check", () => {
  assert.throws(() => parseGatewayAnalysis("Not JSON"), /invalid JSON/);
  assert.throws(() => parseGatewayAnalysis('{"summary":"looks fine"}'), /schema/);
  assert.deepEqual(parseGatewayAnalysis('```json\n' + JSON.stringify(analysis) + '\n```'), analysis);
});

test("duplicate spec fields are rejected", () => {
  const field = { field: "quantity", value: "10", confidence: "high" };
  assert.throws(() => parseGatewayAnalysis(JSON.stringify({ ...analysis, proposedSpec: [field, field] })), /duplicate/);
});

test("PDF artwork is refused before any request rather than silently omitted", async () => {
  let called = false;
  const mock = (async () => { called = true; return reply(success()); }) as typeof fetch;
  await assert.rejects(() => analyzeWithGateway([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: "dGVzdA==" } },
  ], "Check", config, mock), /PDF/);
  assert.equal(called, false);
  assert.equal(gatewayContent(content).length, 2);
});

test("truncated or refused output is rejected", async () => {
  for (const body of [success({ finish_reason: "length" }), success({ message: { refusal: "No", content: "{}" } })]) {
    await assert.rejects(() => analyzeWithGateway(content, "Check", config,
      (async () => reply(body)) as typeof fetch), /refused, incomplete or missing/);
  }
});

test("provider errors never disclose response bodies or credentials and do not retry", async () => {
  let count = 0;
  const mock = (async () => { count++; return reply({ error: config.key }, 401); }) as typeof fetch;
  await assert.rejects(() => analyzeWithGateway(content, "Check", config, mock), (error: Error) => {
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, /synthetic-test-key/);
    return true;
  });
  assert.equal(count, 1);
});

test("transport errors and insecure URLs cannot produce a successful check", async () => {
  await assert.rejects(() => analyzeWithGateway(content, "Check", config,
    (async () => { throw new Error(config.key); }) as typeof fetch), /timed out/);
  await assert.rejects(() => analyzeWithGateway(content, "Check", { ...config, url: "http://gateway.example" }), /HTTPS/);
});

test("a model's blanket all-clear is replaced with a qualified summary", () => {
  const result = parseGatewayAnalysis(JSON.stringify({ ...analysis, summary: "All other specs are aligned. Guaranteed correct." }));
  assert.equal(result.summary, analysis.summary);
  assert.doesNotMatch(result.summary, /guaranteed correct|all other specs are aligned/i);
});

test("request schema binds each text source to actual body lines and excludes invented sources", () => {
  const schema = gatewayAnalysisSchema([
    {id:"brief",kind:"brief",text:"Quantity: 12\nUnit price: USD 2.00"},
    {id:"msg-1",kind:"message",text:"We need 14 shirts."},
    {id:"design",kind:"design"},
  ]);
  const finding={field:"quantity",requiresArtworkFix:false,severity:"blocking",title:"Count mismatch",explanation:"Counts differ",suggestedValue:"14",customerQuestion:"Confirm?",evidence:[{sourceId:"brief",value:"12",quote:"Quantity: 12"}]};
  assert.equal(schema.safeParse({...analysis,findings:[finding]}).success,true);
  for(const evidence of [
    {sourceId:"calculation",value:"28",quote:"14 × 2 = 28"},
    {sourceId:"brief",value:"14",quote:"We need 14 shirts."},
    {sourceId:"brief",value:"12",quote:"Quantity: 14"},
  ])assert.equal(schema.safeParse({...analysis,findings:[{...finding,evidence:[evidence]}]}).success,false);
  assert.equal(schema.safeParse({...analysis,findings:[{...finding,evidence:[{sourceId:"design",value:"2025",quote:"Image shows 2025"}]}]}).success,true);
});

test("a grounded gateway request supplies the source-specific schema to the model", async () => {
  const mock=(async (_url:unknown,init?:RequestInit)=>{
    const body=JSON.parse(String(init!.body));
    assert.match(body.messages[0].content,/Put arithmetic in explanation/);
    const schema=JSON.parse(body.messages[0].content.slice(body.messages[0].content.indexOf('{')));
    const evidence=schema.properties.findings.items.properties.evidence.items;
    assert.ok(JSON.stringify(evidence).includes('Quantity: 12'));
    assert.ok(JSON.stringify(evidence).includes('brief'));
    return reply(success());
  }) as typeof fetch;
  await analyzeWithGateway(content,'Check this order',{...config,sources:[{id:'brief',kind:'brief',text:'Quantity: 12'}]},mock);
});

test("malformed JSON is rejected rather than repaired into a successful analysis",()=>{
  assert.throws(()=>parseGatewayAnalysis(JSON.stringify(analysis).slice(0,-1)),/invalid JSON/);
});
