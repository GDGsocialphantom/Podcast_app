#!/usr/bin/env node
// Fetches transcripts from YouTubeTranscript.dev into data/transcripts/<episode id>.json
// and records what happened in data/transcript-status.json. Node 18+ (built-in fetch), no dependencies.
//
//   YOUTUBETRANSCRIPT_API_KEY=... node tools/fetch-transcripts.js            every episode with no transcript file
//   YOUTUBETRANSCRIPT_API_KEY=... node tools/fetch-transcripts.js dl-abc123  one episode
//   add --force to refetch episodes that already have a file
//
// The key comes only from the environment (the GitHub Actions secret, or your shell for a local run).
// Never put it in a file in this repo.
//
// What it will not do: use ASR (allow_asr stays false), translate, summarize, estimate, or keep going
// after a 402. Captions arrive as short segments; they are merged into cues of roughly 30 to 45 seconds
// without changing a word.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const API = "https://www.youtubetranscript.dev/api/v2/transcribe";
const KEY = process.env.YOUTUBETRANSCRIPT_API_KEY;
if (!KEY) { console.error("YOUTUBETRANSCRIPT_API_KEY is not set. Export it (or run through the GitHub workflow) and try again."); process.exit(2); }

const root = path.join(__dirname, "..");
const outDir = path.join(root, "data", "transcripts");
const statusFile = path.join(root, "data", "transcript-status.json");
const args = process.argv.slice(2);
const force = args.includes("--force");
const ids = args.filter(a => !a.startsWith("--"));

const ctx = vm.createContext({});
for (const f of ["data/shows.js", "data/episodes.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
const { SHOWS, EPISODES } = vm.runInContext("({ SHOWS, EPISODES })", ctx);
const hostOf = e => { const s = SHOWS.find(x => x.id === e.show); return s && s.hosts && s.hosts[0] ? s.hosts[0] : "Host"; };

const CUE_MIN = 30, CUE_MAX = 45;   // a cue ends at the first sentence end after 30 seconds, or at 45 seconds
const BATCH = 10;             // free plan: batches of 10
const GAP_MS = 1100;          // free plan: 1 request per second
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();

let status = { last_run: null, credits_used_total: 0, episodes: {} };
if (fs.existsSync(statusFile)) { try { status = JSON.parse(fs.readFileSync(statusFile, "utf8")); } catch (e) { console.error("transcript-status.json is not valid JSON, starting fresh:", e.message); } }
status.episodes = status.episodes || {};
status.credits_used_total = status.credits_used_total || 0;
function record(id, st, credits) {
  status.episodes[id] = { status: st, checked: now(), credits_used: credits || 0 };
  status.credits_used_total += credits || 0;
}
function saveStatus() { status.last_run = now(); fs.writeFileSync(statusFile, JSON.stringify(status, null, 2) + "\n"); }

// Segments come back with start/end; the docs do not say whether those are seconds or milliseconds.
// Decide per response: if the last end is far beyond the episode's length in seconds, they are milliseconds.
function toSeconds(segments, e) {
  const last = Math.max(...segments.map(s => Number(s.end || s.start || 0)));
  const ms = last > e.duration * 60 * 3;
  return { ms, secs: s => Number(s) / (ms ? 1000 : 1) };
}

// Merge short segments into 30 to 45 second cues. Text is joined with single spaces and never edited.
function merge(segments, e, speaker) {
  const { ms, secs } = toSeconds(segments, e);
  const cues = [];
  let cur = null;
  for (const seg of segments) {
    const text = String(seg.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const start = secs(seg.start), end = secs(seg.end != null ? seg.end : seg.start);
    const len = cur ? start - cur.t : 0;   // length the cue would have if this segment started a new one
    if (!cur || len >= CUE_MAX || (len >= CUE_MIN && /[.!?]$/.test(cur.x))) { if (cur) cues.push(cur); cur = { t: Math.floor(start), s: speaker, x: text }; }
    else cur.x += " " + text;
  }
  if (cur) cues.push(cur);
  return { cues, unit: ms ? "ms" : "s" };
}
const q = s => JSON.stringify(s);
const fileSource = cues => "[\n" + cues.map(c => `  { "t": ${c.t}, "s": ${q(c.s)}, "x": ${q(c.x)} }`).join(",\n") + "\n]\n";

async function transcribe(youtubeId, retried = false) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ video: youtubeId, language: "en", source: "auto", allow_asr: false, format: { timestamp: true, paragraphs: true, words: false } })
  });
  let body = null; try { body = await res.json(); } catch (e) { body = null; }
  if (res.status === 429 && !retried) {
    const wait = Math.max(1, parseInt(res.headers.get("retry-after") || "5", 10));
    console.log(`  rate limited, waiting ${wait}s`);
    await sleep(wait * 1000);
    return transcribe(youtubeId, true);
  }
  return { status: res.status, body };
}

(async () => {
  const todo = ids.length ? ids.map(id => EPISODES.find(e => e.id === id) || { id, missing: true }) : EPISODES;
  fs.mkdirSync(outDir, { recursive: true });
  let written = 0, skipped = 0, none = 0, errors = 0, stopped = false, requests = 0;
  for (const e of todo) {
    if (stopped) break;
    const file = path.join(outDir, e.id + ".json");
    if (e.missing) { console.log(`${e.id}: no such episode in data/episodes.js`); errors++; continue; }
    if (fs.existsSync(file) && !force) { skipped++; continue; }
    if (requests && requests % BATCH === 0) { console.log(`  batch of ${BATCH} done, pausing`); await sleep(3000); }
    requests++;
    let r;
    try { r = await transcribe(e.youtube); } catch (err) { console.log(`${e.id}: error, ${err.message}`); record(e.id, "error", 0); errors++; await sleep(GAP_MS); continue; }
    const code = r.body && r.body.code;
    const credits = (r.body && typeof r.body.credits_used === "number") ? r.body.credits_used : 0;
    if (r.status === 402 || code === "payment_required") {
      console.log(`${e.id}: 402 payment_required. Credits are exhausted; stopping the run.`);
      record(e.id, "credits_exhausted", 0); stopped = true; break;
    }
    if (r.status === 404 || code === "no_captions") { console.log(`${e.id}: no captions`); record(e.id, "no_captions", credits); none++; await sleep(GAP_MS); continue; }
    if (r.status === 401) { console.log(`${e.id}: 401 invalid API key. Stopping.`); record(e.id, "error", 0); errors++; stopped = true; break; }
    const segments = r.body && r.body.data && r.body.data.transcript && r.body.data.transcript.segments;
    if (r.status !== 200 || !Array.isArray(segments) || !segments.length) {
      console.log(`${e.id}: error, HTTP ${r.status}${code ? " " + code : ""}${r.body && r.body.message ? ": " + r.body.message : ""}`);
      record(e.id, "error", credits); errors++; await sleep(GAP_MS); continue;
    }
    const speaker = e.format === "Solo" ? hostOf(e) : "Speaker";
    const { cues, unit } = merge(segments, e, speaker);
    fs.writeFileSync(file, fileSource(cues));
    record(e.id, "ok", credits);
    const lang = r.body.data.transcript.language || "?", src = r.body.data.transcript.source || "?";
    console.log(`${e.id}: ${cues.length} cues from ${segments.length} segments (${lang}, ${src}, timestamps in ${unit}, ${credits} credit${credits === 1 ? "" : "s"})`);
    written++;
    saveStatus();
    await sleep(GAP_MS);
  }
  saveStatus();
  console.log(`\nDone: ${written} written, ${skipped} skipped (already have a file), ${none} without captions, ${errors} errors${stopped ? ", run stopped early" : ""}. Credits used total: ${status.credits_used_total}.`);
  process.exit(stopped && !written ? 1 : 0);
})();
