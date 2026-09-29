#!/usr/bin/env node
// Validates data/shows.js and data/episodes.js before they hit the site.
// Run: node tools/check-data.js   (exit code 1 on any problem)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = vm.createContext({});
let src = "";
for (const f of ["data/shows.js", "data/episodes.js"]) {
  const code = fs.readFileSync(path.join(root, f), "utf8");
  try {
    new vm.Script(code, { filename: f }); // syntax check with a useful file:line
  } catch (e) {
    console.error(`${f}: does not parse. ${e.message}\n${e.stack.split("\n").slice(0, 3).join("\n")}`);
    process.exit(1);
  }
  src += code + "\n";
}
const { SHOWS, EPISODES } = vm.runInContext(src + "\n;({ SHOWS: typeof SHOWS === 'undefined' ? undefined : SHOWS, EPISODES: typeof EPISODES === 'undefined' ? undefined : EPISODES })", ctx);
const problems = [];
const bad = (id, msg) => problems.push(`${id}: ${msg}`);

if (!Array.isArray(SHOWS) || !SHOWS.length) bad("shows", "SHOWS is missing or empty");
if (!Array.isArray(EPISODES)) bad("episodes", "EPISODES is not an array");

const showIds = new Set();
for (const s of SHOWS || []) {
  const id = s.id || "(no id)";
  if (!s.id) bad("shows", "a show has no id");
  if (showIds.has(s.id)) bad(id, "duplicate show id");
  showIds.add(s.id);
  for (const k of ["name", "color", "org", "tagline", "about"]) if (!s[k]) bad(id, `show missing ${k}`);
  if (!Array.isArray(s.hosts) || !s.hosts.length) bad(id, "show has no hosts");
}

const epIds = new Set();
const SAMPLE_YT = "dQw4w9WgXcQ";
for (const e of EPISODES || []) {
  const id = e.id || "(no id)";
  if (!e.id) bad("episodes", "an episode has no id");
  if (epIds.has(e.id)) bad(id, "duplicate episode id");
  epIds.add(e.id);
  if (e.id && /^(home|find|shows|login)$/.test(e.id)) bad(id, "id collides with a route name");
  if (e.id && e.id.startsWith("show-")) bad(id, "ids starting with show- collide with show pages");
  if (e.id && e.id.startsWith("admin-")) bad(id, "ids starting with admin- collide with admin pages");
  if (!showIds.has(e.show)) bad(id, `show "${e.show}" does not exist in shows.js`);
  for (const k of ["title", "summary", "format", "date"]) if (!e[k]) bad(id, `missing ${k}`);
  if (e.date && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) bad(id, `date "${e.date}" should be YYYY-MM-DD`);
  if (e.date && isNaN(Date.parse(e.date))) bad(id, `date "${e.date}" is not a real date`);
  if (typeof e.duration !== "number" || e.duration <= 0) bad(id, "duration should be a number of minutes");
  if (!Array.isArray(e.topics) || !e.topics.length) bad(id, "no topics");
  if (!Array.isArray(e.people) || !e.people.length) bad(id, "no people");
  for (const p of e.people || []) if (!p.n || !p.r) bad(id, "each person needs n (name) and r (role)");
  if (!e.youtube || !/^[\w-]{11}$/.test(e.youtube)) bad(id, "youtube should be an 11-character video id");
  if (e.youtube === SAMPLE_YT) console.warn(`warning ${id}: still using the sample YouTube id`);
  if (!Array.isArray(e.transcript)) bad(id, "transcript should be an array (empty is fine)");
  let last = -1;
  for (const c of e.transcript || []) {
    if (typeof c.t !== "number" || !c.s || !c.x) bad(id, "transcript cues need t (seconds), s (speaker), x (text)");
    if (typeof c.t === "number" && c.t < last) bad(id, `transcript cue at ${c.t}s is out of order`);
    last = c.t;
  }
  if (e.notes) {
    if (!Array.isArray(e.notes.takeaways)) bad(id, "notes.takeaways should be an array");
    if (!Array.isArray(e.notes.chapters)) bad(id, "notes.chapters should be an array");
    for (const ch of e.notes.chapters || []) if (!Array.isArray(ch) || typeof ch[0] !== "number" || !ch[1]) bad(id, "each chapter is [seconds, title]");
    for (const l of e.notes.links || []) if (!Array.isArray(l) || !l[0] || !/^https?:\/\//.test(l[1] || "")) bad(id, "each link is [label, url]");
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} found.`);
  process.exit(1);
}
console.log(`OK: ${SHOWS.length} shows, ${EPISODES.length} episodes.`);
