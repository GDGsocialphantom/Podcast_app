#!/usr/bin/env node
// Builds show-note links and chapters from YouTube descriptions. Node 18+, no dependencies.
//
//   node tools/notes-from-descriptions.js                 every episode
//   node tools/notes-from-descriptions.js dl-abc123       one episode
//
// Descriptions live in data/descriptions/<episode id>.txt, the video's description as published on YouTube. The
// back catalog was saved once from the browser on 2026-10-21; the episode importer stores the description for new
// episodes when it creates them. This tool never reads youtube.com, and nothing on GitHub does either.
//
// Rules: every URL in a description becomes a notes.links entry [label, url], labelled from the surrounding text or
// the domain. Social handles and the channel's own subscribe and profile links are skipped. A list of timestamps
// becomes notes.chapters when the episode has none. Existing chapters and links are never overwritten; new links
// are added only when their URL is not already there.
const fs = require("fs");
const path = require("path");
const { root, episodesFile, loadData, setNotes, noDash } = require("./lib/episodes-file");

const descDir = path.join(root, "data", "descriptions");
const ids = process.argv.slice(2).filter(a => !a.startsWith("--"));


// Links to skip: the channel's own subscribe and social links, and anything that is only a handle.
const OWN_CHANNEL = /youtube\.com\/(@|channel\/|c\/|user\/)|sub_confirmation=1|youtube\.com\/thedisruptionlab/i;
const OWN_SOCIAL = /(instagram|facebook|twitter|x|tiktok|linkedin|threads|youtube)\.com\/[^\s/]*(disruption|keystone)/i;   // the show's and Keystone's own profiles; guests' profiles stay
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()"']+)/g;

const TRACKING = /^(utm_\w*|gad_\w*|gbraid|gclid|fbclid|igsh|r|ref|showWelcomeOnShare|si)$/i;
function cleanUrl(u) {
  u = u.replace(/[.,;:!?)\]]+$/, "");
  if (/^www\./i.test(u)) u = "https://" + u;
  try {   // drop tracking parameters so the same page is one link
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (TRACKING.test(k)) x.searchParams.delete(k);
    u = x.toString().replace(/\?$/, "");
  } catch (e) {}
  return u;
}
function domainLabel(u) {   // registered name only: open.substack.com -> Substack
  try { const parts = new URL(u).hostname.replace(/^www\./, "").split("."); return parts.length > 1 ? parts[parts.length - 2] : parts[0]; } catch (e) { return u; }
}
const tidy = s => noDash(s).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " ").replace(/^[\s\-:|•*>#]+|[\s\-:|•*>#]+$/g, "").replace(/\s+/g, " ").trim();
const looksLikeLabel = s => s && s.length >= 2 && s.length <= 70 && !/https?:\/\/|www\./i.test(s);

// Label for a URL: text before it on the same line, else a short previous line, else the domain.
function labelFor(lines, i, before) {
  let t = tidy(before.replace(/\b(at|here|link|visit|website|learn more|more info|more|check out|follow|see)\s*$/i, ""));
  t = tidy(t.replace(/^(learn more about|more about|more on|read more about|check out|visit|follow|find|see|website|link to|link|subscribe to|sign up for)\s+/i, ""));
  if (looksLikeLabel(t)) return cap(t);
  for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
    const prev = tidy(lines[j]);
    if (!prev) continue;
    if (looksLikeLabel(prev) && !/^\d{1,2}:\d{2}/.test(prev)) return cap(prev);
    break;
  }
  return cap(domainLabel(cleanUrl(lines[i].match(URL_RE)[0])));
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function extractLinks(desc) {
  const lines = desc.split(/\r?\n/);
  const out = [], seen = new Set();
  lines.forEach((line, i) => {
    let m; URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(line))) {
      const url = cleanUrl(m[1]);
      if (OWN_CHANNEL.test(url) || OWN_SOCIAL.test(url)) continue;
      if (/youtube\.com/i.test(url) && !/list=|watch\?v=/i.test(url)) continue;   // a YouTube page that is not a video or playlist
      const key = url.toLowerCase().replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([labelFor(lines, i, line.slice(0, m.index)), url]);
    }
  });
  return out;
}

const TS = /(?:^|\s|\()((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\)|\s|$)/;
const secs = t => t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
function extractChapters(desc) {
  const rows = [];
  for (const raw of desc.split(/\r?\n/)) {
    const line = raw.trim();
    const m = TS.exec(line);
    if (!m) continue;
    const text = tidy(line.replace(m[0], " "));
    if (!text) continue;
    rows.push([secs(m[1]), text]);
  }
  if (rows.length < 2) return [];
  rows.sort((a, b) => a[0] - b[0]);
  return rows.filter((r, i) => i === 0 || r[0] > rows[i - 1][0]);   // ascending, no duplicate times
}

(async () => {
  const { EPISODES } = loadData();
  const todo = ids.length ? EPISODES.filter(e => ids.includes(e.id)) : EPISODES;
  for (const id of ids) if (!EPISODES.find(e => e.id === id)) console.log(`${id}: no such episode`);
  let src = fs.readFileSync(episodesFile, "utf8");
  let withDesc = 0, noDesc = 0, linksAdded = 0, chaptersAdded = 0, changed = 0;
  for (const e of todo) {
    const file = path.join(descDir, e.id + ".txt");
    if (!fs.existsSync(file)) { noDesc++; continue; }
    const desc = fs.readFileSync(file, "utf8");
    if (!desc.trim()) { noDesc++; continue; }
    withDesc++;
    const n = e.notes || { takeaways: [], chapters: [], links: [] };
    const have = new Set((n.links || []).map(([, u]) => u.toLowerCase().replace(/\/$/, "")));
    const links = extractLinks(desc).filter(([, u]) => !have.has(u.toLowerCase().replace(/\/$/, "")));
    const chapters = (n.chapters && n.chapters.length) ? [] : extractChapters(desc);
    if (!links.length && !chapters.length) continue;
    const notes = { ...n, links: [...(n.links || []), ...links], chapters: chapters.length ? chapters : (n.chapters || []) };
    src = setNotes(src, e.id, notes);
    changed++; linksAdded += links.length; chaptersAdded += chapters.length ? 1 : 0;
    console.log(`${e.id}: +${links.length} link${links.length === 1 ? "" : "s"}${chapters.length ? `, ${chapters.length} chapters` : ""}`);
    for (const [l, u] of links) console.log(`    ${l} | ${u}`);
    for (const [t, x] of chapters) console.log(`    ${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")} ${x}`);
  }
  if (changed) fs.writeFileSync(episodesFile, src);
  console.log(`\nDone: ${todo.length} episodes, ${withDesc} with a description, ${noDesc} without. ${changed} episodes updated: ${linksAdded} links added, chapters added to ${chaptersAdded}.`);
})();
