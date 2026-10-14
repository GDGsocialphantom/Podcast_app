#!/usr/bin/env node
// Writes 3 to 5 takeaways per episode from its transcript, using the Anthropic Messages API. Node 18+, no dependencies.
//
//   ANTHROPIC_API_KEY=... node tools/generate-takeaways.js             every episode with a transcript and no takeaways
//   ANTHROPIC_API_KEY=... node tools/generate-takeaways.js dl-abc123   one episode
//   add --force to regenerate takeaways that were generated before (never ones an admin wrote)
//
// The key comes only from the environment (the GitHub Actions secret, or your shell). Never put it in a file in this repo.
//
// Takeaways are saved to notes.takeaways with notes.generated: true. An episode whose takeaways exist without
// generated: true was written by hand and is always skipped. The episode page shows "Generated from the transcript"
// under generated takeaways; editing them in the admin form clears the flag.
const fs = require("fs");
const path = require("path");
const { root, episodesFile, loadData, setNotes, noDash } = require("./lib/episodes-file");

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("ANTHROPIC_API_KEY is not set. Export it (or run through the GitHub workflow) and try again."); process.exit(2); }
const MODEL = "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";
const PRICE = { input: 3 / 1e6, output: 15 / 1e6 };   // USD per token, for the cost line only
const GAP_MS = 1000;   // 1 request per second
const args = process.argv.slice(2);
const force = args.includes("--force");
const ids = args.filter(a => !a.startsWith("--"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SYSTEM = `You write show notes for a podcast website. Given an episode title and its transcript, return 3 to 5 takeaways.
Rules:
- One sentence each, 12 to 30 words.
- Grounded only in what was said in the transcript. No claims, numbers or names that are not in it.
- Use the speakers' own terms and plain language. No marketing tone, no superlatives, no "in this episode".
- Do not use em dashes or semicolons.
- Return only a JSON array of strings, nothing else.`;

const mmss = t => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
function transcriptText(cues) { return cues.map(c => `[${mmss(c.t)}] ${c.s}: ${c.x}`).join("\n"); }

async function ask(e, cues) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 600, system: SYSTEM,
      messages: [{ role: "user", content: `Episode title: ${e.title}\n\nTranscript:\n${transcriptText(cues)}` }]
    })
  });
  let body = null; try { body = await res.json(); } catch (err) { body = null; }
  return { status: res.status, body, retry: parseInt(res.headers.get("retry-after") || "10", 10) || 10 };
}

function parseTakeaways(text) {
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("["), end = t.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("no JSON array in the reply");
  const arr = JSON.parse(t.slice(start, end + 1));
  if (!Array.isArray(arr) || arr.length < 3 || arr.length > 5 || !arr.every(x => typeof x === "string" && x.trim())) throw new Error("expected 3 to 5 strings, got " + JSON.stringify(arr).slice(0, 120));
  return arr.map(x => noDash(x).replace(/\s+/g, " ").trim());
}

(async () => {
  const { EPISODES } = loadData();
  const todo = ids.length ? EPISODES.filter(e => ids.includes(e.id)) : EPISODES;
  for (const id of ids) if (!EPISODES.find(e => e.id === id)) console.log(`${id}: no such episode`);
  let src = fs.readFileSync(episodesFile, "utf8");
  let written = 0, skippedAdmin = 0, skippedDone = 0, noTranscript = 0, errors = 0, stopped = false;
  let inTok = 0, outTok = 0;
  for (const e of todo) {
    if (stopped) break;
    const n = e.notes || {};
    const has = Array.isArray(n.takeaways) && n.takeaways.length > 0;
    if (has && n.generated !== true) { skippedAdmin++; continue; }
    if (has && !force) { skippedDone++; continue; }
    const file = path.join(root, "data", "transcripts", e.id + ".json");
    if (!fs.existsSync(file)) { noTranscript++; continue; }
    let cues; try { cues = JSON.parse(fs.readFileSync(file, "utf8")); } catch (err) { console.log(`${e.id}: transcript file is not valid JSON`); errors++; continue; }
    if (!Array.isArray(cues) || !cues.length) { noTranscript++; continue; }
    let r;
    try { r = await ask(e, cues); } catch (err) { console.log(`${e.id}: request failed, ${err.message}`); errors++; await sleep(GAP_MS); continue; }
    const err = r.body && r.body.error;
    if (r.status === 401 || r.status === 403 || (err && err.type === "authentication_error")) { console.log(`${e.id}: ${r.status} ${err ? err.message : "authentication error"}. Stopping.`); errors++; stopped = true; break; }
    if (r.status === 402 || (err && /credit|billing|balance/i.test(err.message || ""))) { console.log(`${e.id}: ${r.status} ${err ? err.message : "billing error"}. Stopping.`); errors++; stopped = true; break; }
    if (r.status === 429) { const wait = Math.max(2, r.retry); console.log(`${e.id}: rate limited, waiting ${wait}s`); await sleep(wait * 1000); try { r = await ask(e, cues); } catch (e2) { r = { status: 0, body: null }; } }
    if (r.status !== 200 || !r.body || !r.body.content) { console.log(`${e.id}: HTTP ${r.status}${err ? " " + err.type + ": " + err.message : ""}`); errors++; await sleep(GAP_MS); continue; }
    const usage = r.body.usage || {};
    inTok += usage.input_tokens || 0; outTok += usage.output_tokens || 0;
    let takeaways;
    try { takeaways = parseTakeaways(r.body.content.map(c => c.text || "").join("")); }
    catch (perr) { console.log(`${e.id}: could not parse the reply, ${perr.message} (${usage.input_tokens} in, ${usage.output_tokens} out)`); errors++; await sleep(GAP_MS); continue; }
    src = setNotes(src, e.id, { ...n, takeaways, generated: true });
    fs.writeFileSync(episodesFile, src);
    written++;
    console.log(`${e.id}: ${takeaways.length} takeaways (${usage.input_tokens} in, ${usage.output_tokens} out)`);
    for (const t of takeaways) console.log(`    - ${t}`);
    await sleep(GAP_MS);
  }
  const cost = inTok * PRICE.input + outTok * PRICE.output;
  console.log(`\nDone: ${written} written, ${skippedDone} already generated, ${skippedAdmin} admin-written (skipped), ${noTranscript} without a transcript, ${errors} errors${stopped ? ", run stopped early" : ""}.`);
  console.log(`Tokens: ${inTok} in, ${outTok} out. Estimated cost: $${cost.toFixed(4)} at ${MODEL} list prices.`);
  process.exit(stopped ? 1 : 0);
})();
