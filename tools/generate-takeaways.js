#!/usr/bin/env node
// Writes 3 to 5 takeaways per episode from its transcript, using the Google Gemini API on the free tier. Node 18+, no dependencies.
//
//   GEMINI_API_KEY=... node tools/generate-takeaways.js             every episode with a transcript and no takeaways
//   GEMINI_API_KEY=... node tools/generate-takeaways.js dl-abc123   one episode
//   add --force to regenerate takeaways that were generated before (never ones an admin wrote)
//   GEMINI_MODEL=gemini-2.5-flash to use another free-tier flash model
//
// The key comes only from the environment (the GitHub Actions secret, or your shell). Never put it in a file in this repo.
//
// Free tier: the tool keeps under the per-minute limit, pauses on 429 for as long as the API asks, and stops cleanly
// when the daily quota is hit, saying how many episodes remain. The next run picks up where it left off, because
// episodes that already have takeaways are skipped. It never enables billing or switches to a paid model.
//
// Takeaways are saved to notes.takeaways with notes.generated: true. An episode whose takeaways exist without
// generated: true was written by hand and is always skipped. The episode page shows "Generated from the transcript"
// under generated takeaways; editing them in the admin form clears the flag.
const fs = require("fs");
const path = require("path");
const { root, episodesFile, loadData, setNotes, noDash } = require("./lib/episodes-file");

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY is not set. Export it (or run through the GitHub workflow) and try again."); process.exit(2); }
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const GAP_MS = 4500;          // free tier flash models allow about 15 requests per minute
const MAX_429_WAITS = 3;      // a 429 that is not the daily quota: wait what the API asks, this many times, then stop
const args = process.argv.slice(2);
const force = args.includes("--force");
const ids = args.filter(a => !a.startsWith("--"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROMPT = `You write show notes for a podcast website. Below are an episode title and its transcript. Return 3 to 5 takeaways.
Rules:
- One sentence each, 12 to 30 words.
- Grounded only in what was said in the transcript. No claims, numbers or names that are not in it.
- Use the speakers' own terms and plain language. No marketing tone, no superlatives, no "in this episode".
- Do not use em dashes or semicolons.
- Return only a JSON array of strings, nothing else.`;

const mmss = t => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
const transcriptText = cues => cues.map(c => `[${mmss(c.t)}] ${c.s}: ${c.x}`).join("\n");

async function ask(e, cues) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${PROMPT}\n\nEpisode title: ${e.title}\n\nTranscript:\n${transcriptText(cues)}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800, responseMimeType: "application/json" }
    })
  });
  let body = null; try { body = await res.json(); } catch (err) { body = null; }
  const limits = {};
  for (const [k, v] of res.headers) if (/ratelimit|retry-after/i.test(k)) limits[k] = v;
  return { status: res.status, body, limits, retryAfter: Number(res.headers.get("retry-after")) || 0 };
}

// How long a 429 asks us to wait, from Retry-After or the RetryInfo detail in the error body.
function retryDelay(r) {
  if (r.retryAfter) return r.retryAfter;
  const det = (r.body && r.body.error && r.body.error.details) || [];
  for (const d of det) if (d.retryDelay) { const s = parseFloat(String(d.retryDelay).replace(/s$/, "")); if (s > 0) return Math.ceil(s); }
  return 30;
}
function isDailyQuota(r) {
  const text = JSON.stringify(r.body || {});
  return /PerDay|per day|daily/i.test(text);
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
  let written = 0, skippedAdmin = 0, skippedDone = 0, noTranscript = 0, errors = 0, stopped = "", waits = 0;
  let inTok = 0, outTok = 0, lastLimits = null;
  const queue = [];
  for (const e of todo) {
    const n = e.notes || {};
    const has = Array.isArray(n.takeaways) && n.takeaways.length > 0;
    if (has && n.generated !== true) { skippedAdmin++; continue; }
    if (has && !force) { skippedDone++; continue; }
    const file = path.join(root, "data", "transcripts", e.id + ".json");
    if (!fs.existsSync(file)) { noTranscript++; continue; }
    queue.push({ e, n, file });
  }
  for (let i = 0; i < queue.length; i++) {
    const { e, n, file } = queue[i];
    let cues; try { cues = JSON.parse(fs.readFileSync(file, "utf8")); } catch (err) { console.log(`${e.id}: transcript file is not valid JSON`); errors++; continue; }
    if (!Array.isArray(cues) || !cues.length) { noTranscript++; continue; }
    let r;
    try { r = await ask(e, cues); } catch (err) { console.log(`${e.id}: request failed, ${err.message}`); errors++; await sleep(GAP_MS); continue; }
    if (Object.keys(r.limits).length) lastLimits = r.limits;
    const err = r.body && r.body.error;
    if (r.status === 429) {
      if (isDailyQuota(r)) { stopped = `daily quota reached (${err ? err.message : "429"})`; console.log(`${e.id}: ${stopped}. Stopping; ${queue.length - i} episode${queue.length - i === 1 ? "" : "s"} remain for the next run.`); break; }
      if (waits >= MAX_429_WAITS) { stopped = "rate limited repeatedly"; console.log(`${e.id}: still rate limited after ${waits} waits. Stopping; ${queue.length - i} remain.`); break; }
      const wait = retryDelay(r); waits++;
      console.log(`${e.id}: 429 rate limited, waiting ${wait}s (${err ? err.message.slice(0, 120) : ""})`);
      await sleep(wait * 1000); i--; continue;   // retry the same episode
    }
    if (r.status === 400 || r.status === 401 || r.status === 403) { stopped = `${r.status} ${err ? err.message : "key or request rejected"}`; console.log(`${e.id}: ${stopped}. Stopping.`); errors++; break; }
    const text = r.body && r.body.candidates && r.body.candidates[0] && r.body.candidates[0].content && r.body.candidates[0].content.parts ? r.body.candidates[0].content.parts.map(p => p.text || "").join("") : "";
    if (r.status !== 200 || !text) {
      const why = err ? `${err.status || ""} ${err.message}` : (r.body && r.body.candidates && r.body.candidates[0] && r.body.candidates[0].finishReason) || "empty reply";
      console.log(`${e.id}: HTTP ${r.status}, ${why}`); errors++; await sleep(GAP_MS); continue;
    }
    const usage = r.body.usageMetadata || {};
    inTok += usage.promptTokenCount || 0; outTok += usage.candidatesTokenCount || 0;
    let takeaways;
    try { takeaways = parseTakeaways(text); }
    catch (perr) { console.log(`${e.id}: could not parse the reply, ${perr.message} (${usage.promptTokenCount || 0} in, ${usage.candidatesTokenCount || 0} out)`); errors++; await sleep(GAP_MS); continue; }
    src = setNotes(src, e.id, { ...n, takeaways, generated: true });
    fs.writeFileSync(episodesFile, src);
    written++;
    console.log(`${e.id}: ${takeaways.length} takeaways (${usage.promptTokenCount || 0} in, ${usage.candidatesTokenCount || 0} out)`);
    for (const t of takeaways) console.log(`    - ${t}`);
    if (i < queue.length - 1) await sleep(GAP_MS);
  }
  const remaining = stopped ? queue.length - written - errors : 0;
  console.log(`\nDone: ${written} written, ${skippedDone} already generated, ${skippedAdmin} admin-written (skipped), ${noTranscript} without a transcript, ${errors} errors${stopped ? `, stopped: ${stopped}, ${Math.max(0, remaining)} remaining` : ""}.`);
  console.log(`Tokens: ${inTok} in, ${outTok} out (${MODEL}, free tier, no cost).${lastLimits ? " Rate limit headers: " + JSON.stringify(lastLimits) : ""}`);
  process.exit(stopped && !written ? 1 : 0);
})();
