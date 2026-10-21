// The one set of rules for shows and episodes, plus the serializers that write them in the style of data/.
// Loaded three ways, so it has no dependencies and no top-level side effects:
//   node:    const RULES = require("./tools/rules.js")           (tools/check-data.js)
//   browser: <script src="tools/rules.js"> defines window.RULES  (js/admin.js)
//   worker:  import RULES from "../../tools/rules.js"            (worker/src, bundled by wrangler)
// Change a rule here and every path (CLI, admin form, Worker) picks it up.
(function (root, factory) {
  const R = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = R;
  else root.RULES = R;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const LOGO = /^assets\/shows\/[a-z0-9-]+\.(png|svg|jpg|webp)$/;
  const SHOW_ID = /^[a-z0-9-]+$/;
  const YT = /^[\w-]{11}$/;
  const ROUTES = /^(home|find|shows|login)$/;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const EM_DASH = /—/;
  const q = s => JSON.stringify(String(s == null ? "" : s));
  const has = (set, v) => set ? (set instanceof Set ? set.has(v) : Array.from(set).includes(v)) : false;

  // ctx: { showIds: Set|array of existing show ids, editingId: id being edited (so its own id is not a duplicate) }
  function validateShow(s, ctx = {}) {
    const p = [];
    if (!s || typeof s !== "object") return ["Not a show object."];
    if (!s.id) p.push("Needs an id.");
    else {
      if (!SHOW_ID.test(s.id)) p.push("Id should be lowercase letters, numbers and dashes.");
      if (s.id !== ctx.editingId && has(ctx.showIds, s.id)) p.push(`A show with id "${s.id}" already exists.`);
    }
    for (const k of ["name", "color", "org", "tagline", "about"]) if (!s[k]) p.push(`Needs ${k}.`);
    if (s.color && !HEX.test(s.color)) p.push("Brand color should be a 6-digit hex like #1F2937.");
    if (s.ink && !HEX.test(s.ink)) p.push("Text color should be a 6-digit hex.");
    if (s.logo && !LOGO.test(s.logo)) p.push("Logo path should be assets/shows/<id>.<png|svg|jpg|webp>.");
    if (!Array.isArray(s.hosts) || !s.hosts.length) p.push("Add at least one host.");
    if (s.youtube !== undefined) {
      if (!s.youtube || typeof s.youtube !== "object") p.push("youtube should be { playlist, autoImport }.");
      else {
        if (typeof s.youtube.playlist !== "string") p.push("youtube.playlist should be a string (empty until known).");
        if (typeof s.youtube.autoImport !== "boolean") p.push("youtube.autoImport should be true or false.");
        if (s.youtube.autoImport && !s.youtube.playlist) p.push("autoImport needs a playlist id.");
      }
    }
    return p;
  }

  // ctx: { showIds, episodeIds, editingId, todoName: true when the episode's people line carries "// TODO full name" }
  // Returns { problems, warnings }. Warnings never block a commit.
  function validateEpisode(e, ctx = {}) {
    const p = [], w = [];
    if (!e || typeof e !== "object") return { problems: ["Not an episode object."], warnings: [] };
    const n = e.notes || {};
    if (!e.id) p.push("Needs an id.");
    else {
      if (ROUTES.test(e.id)) p.push("That id collides with a page route.");
      if (e.id.startsWith("show-")) p.push("Ids starting with show- collide with show pages.");
      if (e.id.startsWith("admin-")) p.push("Ids starting with admin- collide with admin pages.");
      if (e.id !== ctx.editingId && has(ctx.episodeIds, e.id)) p.push(`An episode with id "${e.id}" already exists.`);
    }
    if (!e.show || !has(ctx.showIds, e.show)) p.push(e.show ? `Show "${e.show}" does not exist in shows.js.` : "Pick a show.");
    if (!e.title) p.push("Needs a title.");
    if (!e.summary) p.push("Needs a summary.");
    if (!e.format) p.push("Pick a format.");
    if (!DATE.test(e.date || "") || isNaN(Date.parse(e.date))) p.push("Date should be YYYY-MM-DD.");
    if (typeof e.duration !== "number" || !(e.duration > 0)) p.push("Duration should be a number of minutes.");
    if (!Array.isArray(e.topics) || !e.topics.length) p.push("Add at least one topic.");
    if (!Array.isArray(e.people) || !e.people.length) p.push("Add at least one person.");
    else {
      if (e.people.some(x => !x || !x.n || !x.r)) p.push("Each person needs a name and a role: Name | Role.");
      const single = e.people.filter(x => x && x.n && !/\s/.test(String(x.n).trim())).map(x => x.n);
      if (single.length && !ctx.todoName) w.push(`${single.join(", ")} ${single.length === 1 ? "has" : "have"} no last name. Add it, or keep the first name and mark the people line with // TODO full name.`);
    }
    if (!YT.test(e.youtube || "")) p.push("YouTube should be an 11-character video id or a YouTube URL.");
    if ("transcript" in e && e.transcript !== undefined && !ctx.allowTranscript) p.push("Transcripts live in data/transcripts/<id>.json, not in the episode object.");
    if (!e.notes || typeof e.notes !== "object") p.push("Needs a notes object with takeaways, chapters and links.");
    else {
      if (!Array.isArray(n.takeaways)) p.push("notes.takeaways should be an array.");
      if (!Array.isArray(n.chapters)) p.push("notes.chapters should be an array.");
      if (!Array.isArray(n.links)) p.push("notes.links should be an array.");
      if ((n.chapters || []).some(c => !Array.isArray(c) || typeof c[0] !== "number" || isNaN(c[0]) || !c[1])) p.push("Each chapter line is a time then a title, e.g. 12:34 The middle part.");
      if ((n.links || []).some(l => !Array.isArray(l) || !l[0] || !/^https?:\/\//.test(l[1] || ""))) p.push("Each link line is Label | https://url");
      if (EM_DASH.test(JSON.stringify(n))) p.push("Show notes contain an em dash; use a comma, colon or hyphen.");
      if ("generated" in n && typeof n.generated !== "boolean") p.push("notes.generated must be true or false when present.");
      if (n.generated === true && !(n.takeaways || []).length) p.push("notes.generated is true but there are no takeaways.");
    }
    return { problems: p, warnings: w };
  }

  // Transcript cues: [{ t: seconds, s: speaker, x: text }], ascending t.
  function validateTranscript(cues) {
    const p = [];
    if (!Array.isArray(cues)) return ["Transcript should be an array of cues."];
    let last = -1;
    for (const c of cues) {
      if (!c || typeof c.t !== "number" || typeof c.s !== "string" || typeof c.x !== "string" || !c.s || !c.x) { p.push("Transcript cues need t (seconds), s (speaker) and x (text)."); break; }
      if (c.t < last) { p.push(`Transcript cue at ${c.t}s is out of order.`); break; }
      last = c.t;
    }
    return p;
  }

  /* ---------- serializers: match the style of data/episodes.js and data/shows.js ---------- */
  // opts.todoName: keep the "// TODO full name" marker on the people line (a first-name-only guest waiting on records)
  function episodeSource(e, opts = {}) {
    const n = e.notes || { takeaways: [], chapters: [], links: [] };
    const people = (e.people || []).map(p => `{ n: ${q(p.n)}, r: ${q(p.r)} }`).join(", ");
    const chapters = (n.chapters || []).map(([t, x]) => `[${Number(t)}, ${q(x)}]`).join(", ");
    const links = (n.links || []).map(([x, u]) => `[${q(x)}, ${q(u)}]`).join(", ");
    return `  { id: ${q(e.id)}, show: ${q(e.show)}, format: ${q(e.format)}, date: ${q(e.date)}, duration: ${Number(e.duration)},
    title: ${q(e.title)},
    summary: ${q(e.summary)},
    topics: [${(e.topics || []).map(q).join(", ")}],
    people: [${people}],${opts.todoName ? "  // TODO full name" : ""}
    youtube: ${q(e.youtube)},
    notes: {
      takeaways: [${(n.takeaways || []).map(q).join(", ")}],
      chapters: [${chapters}],
      links: [${links}]${n.generated === true ? ",\n      generated: true" : ""}
    } },`;
  }
  function showSource(s) {
    const yt = s.youtube ? `,\n    youtube: { playlist: ${q(s.youtube.playlist || "")}, autoImport: ${s.youtube.autoImport === true} }` : "";
    return `  { id: ${q(s.id)}, name: ${q(s.name)}, color: ${q(s.color)}, ink: ${q(s.ink || "#FFFFFF")}, logo: ${q(s.logo || "assets/shows/" + s.id + ".png")}, org: ${q(s.org)},
    tagline: ${q(s.tagline)},
    hosts: [${(s.hosts || []).map(q).join(", ")}],
    about: ${q(s.about)}${yt} },`;
  }
  function transcriptSource(cues) {
    return "[\n" + cues.map(c => `  { "t": ${Number(c.t)}, "s": ${q(c.s)}, "x": ${q(c.x)} }`).join(",\n") + "\n]\n";
  }

  /* ---------- text edits of data/*.js that do not need to evaluate the file ---------- */
  // Each top-level object in SHOWS and EPISODES starts on its own line with "  { id: ". These helpers find that block
  // by id (up to the next "  { id:" line or the closing "];") and replace it, or insert a new one after "const X = [".
  function blockRange(src, id) {
    const re = new RegExp(`\\n  \\{ id: ${q(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[,\\s]`);
    const m = re.exec(src);
    if (!m) return null;
    const start = m.index + 1;
    const rest = src.slice(start + 1);
    const next = rest.search(/\n  \{ id: |\n\];/);
    const end = next < 0 ? src.length : start + 1 + next + 1;
    return [start, end];
  }
  function replaceBlock(src, id, objectSource) {
    const r = blockRange(src, id);
    if (!r) throw new Error(`no object with id "${id}" in the file`);
    return src.slice(0, r[0]) + objectSource + "\n" + src.slice(r[1]);
  }
  function insertBlock(src, arrayName, objectSource) {
    const marker = `const ${arrayName} = [\n`;
    const i = src.indexOf(marker);
    if (i < 0) throw new Error(`"${marker.trim()}" not found`);
    const at = i + marker.length;
    return src.slice(0, at) + objectSource + "\n" + src.slice(at);
  }
  function idsIn(src) {   // every "  { id: "..." " at the start of a line
    const out = []; const re = /\n  \{ id: "([^"]+)"/g; let m;
    while ((m = re.exec(src))) out.push(m[1]);
    return out;
  }
  function hasTodoName(src, id) {
    const r = blockRange(src, id);
    return !!r && /\/\/\s*TODO full name/.test(src.slice(r[0], r[1]));
  }

  return { HEX, LOGO, SHOW_ID, YT, ROUTES, validateShow, validateEpisode, validateTranscript, episodeSource, showSource, transcriptSource, blockRange, replaceBlock, insertBlock, idsIn, hasTodoName };
});
