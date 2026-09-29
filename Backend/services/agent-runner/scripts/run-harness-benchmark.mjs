import { readFile } from "node:fs/promises";

const fixture = JSON.parse(
  await readFile(new URL("../benchmarks/fixtures/exception-basic.json", import.meta.url), "utf8"),
);
const endpoint = process.env.BENCHMARK_ENDPOINT;
if (!endpoint)
  throw new Error("BENCHMARK_ENDPOINT is required; fake harnesses are not benchmarked");
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(fixture.request),
});
if (!response.ok) throw new Error(`benchmark request failed: ${response.status}`);
const result = await response.json();
const text = String(result.finalResponse ?? "").toLowerCase();
for (const token of fixture.expected.mustMention)
  if (!text.includes(token.toLowerCase())) throw new Error(`missing expected token: ${token}`);
for (const token of fixture.expected.mustNotContain)
  if (text.includes(token.toLowerCase())) throw new Error(`unsafe token found: ${token}`);
console.log(
  JSON.stringify({
    fixture: fixture.name,
    status: "passed",
    harness: result.harness,
    provider: result.provider,
    model: result.model,
  }),
);
