#!/usr/bin/env node
// Read-only lookups against the YouTube Data API v3, run on GitHub where YOUTUBE_API_KEY lives. Node 18+, no dependencies.
//
//   YOUTUBE_API_KEY=... node tools/youtube-lookup.js channels "The EKO System" "Court Ordered" "Keystone Sessions"
//   YOUTUBE_API_KEY=... node tools/youtube-lookup.js search <channelId> "Suzanne Gunn"
//   YOUTUBE_API_KEY=... node tools/youtube-lookup.js comments dl-abc123 dl-def456 ...      (episode ids from data/episodes.js)
//   YOUTUBE_API_KEY=... node tools/youtube-lookup.js videos <videoId> ...
//
// Each command prints JSON to stdout. The YouTube lookup workflow runs them and commits the output to the
// yt-lookup-results branch so it can be read from a workspace that cannot reach Google. Quota: search.list costs
// 100 units per call, everything else 1; the free daily quota is 10,000.
const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error("YOUTUBE_API_KEY is not set."); process.exit(2); }
const API = "https://www.googleapis.com/youtube/v3/";

async function yt(path, params) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  u.searchParams.set("key", KEY);
  const r = await fetch(u);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${j && j.error ? j.error.message : ""}`);
  return j;
}

async function channels(names) {
  const out = [];
  for (const name of names) {
    const s = await yt("search", { part: "snippet", type: "channel", q: name, maxResults: 5 });
    const candidates = [];
    for (const item of s.items || []) {
      const id = item.snippet.channelId;
      const c = await yt("channels", { part: "snippet,statistics,contentDetails", id });
      const ch = c.items && c.items[0];
      if (!ch) continue;
      const uploads = ch.contentDetails.relatedPlaylists.uploads;
      const pl = await yt("playlists", { part: "snippet,contentDetails", channelId: id, maxResults: 25 });
      const playlists = (pl.items || []).map(p => ({ id: p.id, title: p.snippet.title, count: p.contentDetails.itemCount }));
      const latest = await yt("playlistItems", { part: "snippet", playlistId: uploads, maxResults: 1 }).catch(() => ({ items: [] }));
      const lv = latest.items && latest.items[0];
      candidates.push({
        channelId: id, title: ch.snippet.title, handle: ch.snippet.customUrl || "", description: (ch.snippet.description || "").slice(0, 200),
        videoCount: Number(ch.statistics.videoCount || 0), subscribers: ch.statistics.hiddenSubscriberCount ? "hidden" : Number(ch.statistics.subscriberCount || 0),
        uploadsPlaylist: uploads, latestUpload: lv ? { title: lv.snippet.title, date: lv.snippet.publishedAt.slice(0, 10), videoId: lv.snippet.resourceId.videoId } : null,
        playlists
      });
    }
    out.push({ query: name, candidates });
  }
  return out;
}

async function search(channelId, q) {
  const s = await yt("search", { part: "snippet", type: "video", channelId, q, maxResults: 10 });
  const ids = (s.items || []).map(i => i.id.videoId);
  return ids.length ? videos(ids) : [];
}

async function videos(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await yt("videos", { part: "snippet,contentDetails", id: ids.slice(i, i + 50).join(",") });
    for (const it of v.items || []) out.push({ videoId: it.id, title: it.snippet.title, date: it.snippet.publishedAt.slice(0, 10), duration: it.contentDetails.duration, description: it.snippet.description, channelTitle: it.snippet.channelTitle });
  }
  return out;
}

async function comments(episodeIds) {
  const fs = require("fs"), path = require("path"), vm = require("vm");
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "data", "episodes.js"), "utf8"), ctx);
  const EPISODES = vm.runInContext("EPISODES", ctx);
  const out = [];
  for (const id of episodeIds) {
    const e = EPISODES.find(x => x.id === id);
    if (!e) { out.push({ id, error: "no such episode" }); continue; }
    let threads;
    try { threads = await yt("commentThreads", { part: "snippet", videoId: e.youtube, maxResults: 50, order: "relevance", textFormat: "plainText" }); }
    catch (err) { out.push({ id, youtube: e.youtube, error: err.message }); continue; }
    const list = (threads.items || []).map(t => { const c = t.snippet.topLevelComment.snippet; return { author: c.authorDisplayName, channelOwner: c.authorChannelId && c.authorChannelId.value === t.snippet.channelId, likes: c.likeCount, text: c.textDisplay.slice(0, 600) }; });
    out.push({ id, youtube: e.youtube, title: e.title, people: e.people.map(p => p.n), comments: list });
  }
  return out;
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  let result;
  if (cmd === "channels") result = await channels(args);
  else if (cmd === "search") result = await search(args[0], args.slice(1).join(" "));
  else if (cmd === "comments") result = await comments(args);
  else if (cmd === "videos") result = await videos(args);
  else { console.error("commands: channels, search, comments, videos"); process.exit(2); }
  console.log(JSON.stringify(result, null, 2));
})().catch(err => { console.error(err.message); process.exit(1); });
