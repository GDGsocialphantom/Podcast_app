#!/usr/bin/env node
// Pulls YouTube captions into data/transcripts/<episode id>.json.
// Node 18+ (built-in fetch). No npm dependencies. Uses yt-dlp if it is installed (see below).
//
//   node tools/fetch-captions.js dl-r7Qa3dc5WiE      one episode (any number of ids)
//   node tools/fetch-captions.js --all               every episode in data/episodes.js
//   add --force to overwrite transcript files that already exist
//
// How it gets the captions:
//   1. Direct: read the caption track URL from the video page and fetch it. YouTube currently
//      answers these requests with an empty body unless they carry a proof-of-origin token that
//      only its own player has, so this path mostly fails today. It is kept because it is free
//      when it works and needs nothing installed.
//   2. yt-dlp: if `yt-dlp` is on the PATH, run it with --skip-download to fetch the subtitle
//      file (json3) and convert it. Install with `pip install -U yt-dlp` or `brew install yt-dlp`.
//
// Auto-captions are rough: no punctuation, no speaker names, the occasional misheard word.
// Good enough for search and timestamps. Clean transcripts come from tools/transcribe.py.
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "data", "transcripts");
const args = process.argv.slice(2);
const force = args.includes("--force");
const all = args.includes("--all");
const ids = args.filter(a => !a.startsWith("--"));
if (!all && !ids.length) { console.error("usage: node tools/fetch-captions.js <episode id> [...] | --all   [--force]"); process.exit(2); }

const ctx = vm.createContext({});
for (const f of ["data/shows.js", "data/episodes.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
const { SHOWS, EPISODES } = vm.runInContext("({ SHOWS, EPISODES })", ctx);
const hostOf = e => { const s = SHOWS.find(x => x.id === e.show); return s && s.hosts && s.hosts[0] ? s.hosts[0] : "Host"; };

const CUE_SECONDS = 40;  // merge caption fragments into cues of roughly this length so the page reads as paragraphs
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const hasYtDlp = spawnSync("yt-dlp", ["--version"], { encoding: "utf8" }).status === 0;

/* ---- caption fragments: [{ t: seconds, x: text }] from either source ---- */
function parseJson3(body) {
  const j = JSON.parse(body);
  return (j.events || []).filter(ev => ev.segs).map(ev => ({ t: (ev.tStartMs || 0) / 1000, x: ev.segs.map(s => s.utf8 || "").join("") })).filter(f => f.x.trim() && f.x !== "\n");
}
function parseXml(body) {
  const out = [];
  for (const m of body.matchAll(/<text start="([\d.]+)"[^>]*>(.*?)<\/text>/gs)) out.push({ t: parseFloat(m[1]), x: decode(m[2].replace(/<[^>]+>/g, "")) });
  return out;
}

async function viaDirect(youtubeId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${youtubeId}&hl=en`, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
  if (!res.ok) throw new Error(`video page HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});(?:\s*var|\s*<\/script>)/s);
  if (!m) throw new Error("no player data in page (blocked or layout changed)");
  const data = JSON.parse(m[1]);
  const tracks = (((data.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
  if (!tracks.length) return { none: true };
  const en = tracks.filter(t => (t.languageCode || "").startsWith("en"));
  const pick = en.find(t => t.kind !== "asr") || en.find(t => t.kind === "asr") || tracks.find(t => t.kind !== "asr") || tracks[0];
  const cap = await fetch(pick.baseUrl + "&fmt=json3", { headers: { "User-Agent": UA } });
  if (!cap.ok) throw new Error(`captions HTTP ${cap.status}`);
  const body = await cap.text();
  if (!body.trim()) throw new Error("empty caption body (YouTube wants a proof-of-origin token)");
  return { frags: body.trim().startsWith("{") ? parseJson3(body) : parseXml(body), kind: pick.kind === "asr" ? "auto" : "manual", lang: pick.languageCode };
}

function viaYtDlp(youtubeId) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "captions-"));
  const r = spawnSync("yt-dlp", ["--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", "en.*,en", "--sub-format", "json3", "--no-warnings", "--no-playlist", "-o", path.join(tmp, "cap"), `https://www.youtube.com/watch?v=${youtubeId}`], { encoding: "utf8" });
  const files = fs.existsSync(tmp) ? fs.readdirSync(tmp).filter(f => f.endsWith(".json3")) : [];
  if (!files.length) {
    fs.rmSync(tmp, { recursive: true, force: true });
    const tail = (r.stderr || r.stdout || "").trim().split("\n").filter(Boolean).pop() || "";
    if (r.status !== 0) throw new Error("yt-dlp failed: " + tail);
    if (/sign in|bot|cookies|429|unavailable/i.test(tail)) throw new Error("yt-dlp blocked: " + tail);
    return { none: true };
  }
  // yt-dlp writes cap.en.json3 for manual subs and the same name for auto subs when no manual track exists; "en-orig" marks the original-language auto track
  const pick = files.find(f => !/-orig/.test(f)) || files[0];
  const body = fs.readFileSync(path.join(tmp, pick), "utf8");
  const auto = /Automatic|auto/i.test(r.stdout || "") && !/Writing video subtitles/.test(r.stdout || "");
  fs.rmSync(tmp, { recursive: true, force: true });
  return { frags: parseJson3(body), kind: auto ? "auto" : "yt-dlp", lang: (pick.match(/\.([a-z]{2}(?:-[A-Za-z]+)?)\.json3$/) || [])[1] || "en" };
}

function merge(frags, speaker) {
  const cues = [];
  let cur = null;
  for (const f of frags) {
    const text = f.x.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (!cur || f.t - cur.t >= CUE_SECONDS) { if (cur) cues.push(cur); cur = { t: Math.floor(f.t), s: speaker, x: text }; }
    else cur.x += " " + text;
  }
  if (cur) cues.push(cur);
  return cues;
}
const q = s => JSON.stringify(s);
const fileSource = cues => "[\n" + cues.map(c => `  { "t": ${c.t}, "s": ${q(c.s)}, "x": ${q(c.x)} }`).join(",\n") + "\n]\n";

(async () => {
  const todo = all ? EPISODES : ids.map(id => EPISODES.find(e => e.id === id) || { id, missing: true });
  fs.mkdirSync(outDir, { recursive: true });
  if (!hasYtDlp) console.log("yt-dlp not found on PATH; trying direct requests only (these usually come back empty now). Install: pip install -U yt-dlp\n");
  let written = 0, skipped = 0, none = 0, failed = 0;
  const failures = [];
  for (const e of todo) {
    const file = path.join(outDir, e.id + ".json");
    if (e.missing) { console.log(`${e.id}: no such episode in data/episodes.js`); failed++; failures.push(e.id); continue; }
    if (fs.existsSync(file) && !force) { console.log(`${e.id}: already has a transcript, skipping (use --force)`); skipped++; continue; }
    // Direct first; if it fails or sees no caption tracks (YouTube serves some clients a stripped page), yt-dlp decides.
    let result, how = "direct", directErr = null;
    try { result = await viaDirect(e.youtube); } catch (err) { directErr = err; }
    if ((!result || result.none) && hasYtDlp) {
      try { how = "yt-dlp"; result = viaYtDlp(e.youtube); }
      catch (err2) { console.log(`${e.id}: FAILED, ${err2.message}`); failed++; failures.push(e.id); await sleep(1000); continue; }
    } else if (!result) {
      console.log(`${e.id}: FAILED, ${directErr.message}`); failed++; failures.push(e.id); await sleep(1000); continue;
    }
    if (result.none) { console.log(`${e.id}: no captions on YouTube`); none++; await sleep(1000); continue; }
    const speaker = e.format === "Solo" ? hostOf(e) : "Speaker";
    const cues = merge(result.frags, speaker);
    if (!cues.length) { console.log(`${e.id}: caption track was empty`); none++; await sleep(1000); continue; }
    fs.writeFileSync(file, fileSource(cues));
    console.log(`${e.id}: ${cues.length} cues from ${result.kind} ${result.lang} captions via ${how} (${result.frags.length} fragments)`);
    written++;
    await sleep(1000 + Math.random() * 1000);
  }
  console.log(`\nDone: ${written} written, ${skipped} skipped, ${none} without captions, ${failed} failed.`);
  if (failures.length) console.log("Failed: " + failures.join(" "));
  process.exit(failed && !written ? 1 : 0);
})();
