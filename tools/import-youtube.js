#!/usr/bin/env node
// Daily episode importer. For every show in data/shows.js with youtube.autoImport true, reads its playlist through the
// YouTube Data API, finds videos not yet in data/episodes.js (by YouTube id), and adds them as episodes. Node 18+.
//
//   YOUTUBE_API_KEY=... node tools/import-youtube.js              add new episodes, write data/import-status.json
//   YOUTUBE_API_KEY=... node tools/import-youtube.js --dry-run    print what it would add, change nothing
//   YOUTUBE_API_KEY=... node tools/import-youtube.js eko          one show only
//
// Rules: reads a playlist per show, never a channel. Skips videos under 5 minutes (Shorts and promos), live or
// upcoming streams, and anything already on the site. A new episode gets: id <prefix>-<youtube id>, title, date,
// duration (minutes, from the ISO 8601 duration), summary from the first paragraph of the description, the host as
// its only person, empty topics (an admin fills them in), empty notes, and its description saved under
// data/descriptions/ so the Transcripts workflow can build links and chapters. Transcripts and takeaways follow in
// that workflow. The Worker's /import/run button dispatches the Import workflow by hand.
const fs = require("fs");
const path = require("path");
const RULES = require("./rules.js");
const { root, episodesFile, loadData, noDash } = require("./lib/episodes-file");

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error("YOUTUBE_API_KEY is not set."); process.exit(2); }
const API = "https://www.googleapis.com/youtube/v3/";
const MIN_MINUTES = 5;
const PREFIX = { disruption: "dl" };             // episode id prefix per show; default is the show id
const FORMAT = { sessions: "Talk" };             // default format per show; default is Interview
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter(a => !a.startsWith("--"));
const statusFile = path.join(root, "data", "import-status.json");
const descDir = path.join(root, "data", "descriptions");

async function yt(resource, params) {
  const u = new URL(API + resource);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  u.searchParams.set("key", KEY);
  const r = await fetch(u);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${resource}: HTTP ${r.status} ${j && j.error ? j.error.message : ""}`);
  return j;
}
async function playlistVideoIds(playlistId) {
  const ids = []; let pageToken;
  do {
    const j = await yt("playlistItems", { part: "contentDetails", playlistId, maxResults: 50, pageToken });
    for (const it of j.items || []) ids.push(it.contentDetails.videoId);
    pageToken = j.nextPageToken;
  } while (pageToken);
  return ids;
}
async function videoDetails(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt("videos", { part: "snippet,contentDetails,status", id: ids.slice(i, i + 50).join(",") });
    out.push(...(j.items || []));
  }
  return out;
}
const isoMinutes = iso => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "") || []; return (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) / 60; };
function firstParagraph(desc) {
  const paras = String(desc || "").split(/\n\s*\n/).map(p => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  let p = paras.find(x => !/^https?:\/\//.test(x) && x.length > 40) || paras[0] || "";
  p = noDash(p);
  if (p.length > 420) { const cut = p.slice(0, 420); p = cut.slice(0, Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? ")) + 1) || cut + "..."; }
  return p;
}

(async () => {
  const { SHOWS, EPISODES } = loadData();
  const have = new Set(EPISODES.map(e => e.youtube));
  const showIds = new Set(SHOWS.map(s => s.id)), episodeIds = new Set(EPISODES.map(e => e.id));
  let src = fs.readFileSync(episodesFile, "utf8");
  let status = { last_run: null, shows: {} };
  if (fs.existsSync(statusFile)) { try { status = JSON.parse(fs.readFileSync(statusFile, "utf8")); } catch (e) { /* start fresh */ } }
  status.shows = status.shows || {};
  const added = [];
  for (const s of SHOWS) {
    if (only.length && !only.includes(s.id)) continue;
    const cfg = s.youtube || {};
    if (!cfg.autoImport || !cfg.playlist) { console.log(`${s.id}: autoImport off, skipped`); continue; }
    let ids;
    try { ids = await playlistVideoIds(cfg.playlist); } catch (err) { console.log(`${s.id}: could not read playlist ${cfg.playlist}: ${err.message}`); status.shows[s.id] = { ...(status.shows[s.id] || {}), checked: new Date().toISOString(), error: err.message }; continue; }
    const fresh = ids.filter(id => !have.has(id));
    const details = fresh.length ? await videoDetails(fresh) : [];
    let short = 0, live = 0, priv = 0, count = 0;
    for (const v of details) {
      const minutes = isoMinutes(v.contentDetails.duration);
      if (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none") { live++; continue; }
      if (v.status && v.status.privacyStatus && v.status.privacyStatus !== "public") { priv++; continue; }
      if (minutes < MIN_MINUTES) { short++; continue; }
      const prefix = PREFIX[s.id] || s.id;
      const e = {
        id: `${prefix}-${v.id}`, show: s.id, format: FORMAT[s.id] || "Interview", date: v.snippet.publishedAt.slice(0, 10), duration: Math.max(1, Math.round(minutes)),
        title: noDash(v.snippet.title).replace(/\s+/g, " ").trim(), summary: firstParagraph(v.snippet.description) || noDash(v.snippet.title),
        topics: [], people: [{ n: (s.hosts && s.hosts[0]) || "Host", r: "Host" }], youtube: v.id, notes: { takeaways: [], chapters: [], links: [] }
      };
      const r = RULES.validateEpisode(e, { showIds, episodeIds });
      if (r.problems.length) { console.log(`${e.id}: not added, ${r.problems.join(" ")}`); continue; }
      count++;
      added.push({ show: s.id, e, description: v.snippet.description || "" });
      console.log(`${dryRun ? "would add" : "add"} ${e.id}  ${e.date}  ${e.duration} min  ${e.title}`);
      if (!dryRun) {
        src = RULES.insertBlock(src, "EPISODES", RULES.episodeSource(e));
        episodeIds.add(e.id); have.add(v.id);
      }
    }
    status.shows[s.id] = { playlist: cfg.playlist, checked: new Date().toISOString(), in_playlist: ids.length, added: count, skipped_short: short, skipped_live: live, skipped_private: priv };
    console.log(`${s.id}: ${ids.length} in playlist, ${fresh.length} not on the site, ${count} ${dryRun ? "would be " : ""}added, ${short} under ${MIN_MINUTES} min, ${live} live or upcoming, ${priv} not public`);
  }
  if (!dryRun) {
    if (added.length) {
      fs.mkdirSync(descDir, { recursive: true });
      for (const a of added) fs.writeFileSync(path.join(descDir, a.e.id + ".txt"), a.description.replace(/\r\n/g, "\n").trim() + "\n");
      fs.writeFileSync(episodesFile, src);
    }
    status.last_run = new Date().toISOString();
    status.last_added = added.length;
    fs.writeFileSync(statusFile, JSON.stringify(status, null, 2) + "\n");
  }
  const perShow = Object.entries(status.shows).map(([id, v]) => `${id} ${v.added == null ? "?" : v.added}`).join(", ");
  console.log(`\nDone: ${added.length} episode${added.length === 1 ? "" : "s"} ${dryRun ? "would be " : ""}added (${perShow}).`);
})().catch(err => { console.error(err.message); process.exit(1); });
