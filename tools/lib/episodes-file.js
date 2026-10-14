// Shared helpers for tools that read and rewrite data/episodes.js in place.
// The file is JavaScript with comments (e.g. "// TODO full name"), so it is never regenerated from objects;
// each tool replaces only the `notes: { ... }` object of the episodes it changed and leaves every other byte alone.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "..");
const episodesFile = path.join(root, "data", "episodes.js");

function loadData() {
  const ctx = vm.createContext({});
  for (const f of ["data/shows.js", "data/episodes.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return vm.runInContext("({ SHOWS, EPISODES })", ctx);
}

const q = s => JSON.stringify(String(s));
// One line, same shape the admin editor's single-line output uses.
function notesSource(n) {
  const parts = [
    `takeaways: [${(n.takeaways || []).map(q).join(", ")}]`,
    `chapters: [${(n.chapters || []).map(([t, x]) => `[${Number(t)}, ${q(x)}]`).join(", ")}]`,
    `links: [${(n.links || []).map(([x, u]) => `[${q(x)}, ${q(u)}]`).join(", ")}]`
  ];
  if (n.generated === true) parts.push("generated: true");
  return `{ ${parts.join(", ")} }`;
}

// Find the `notes: {` of the episode with this id and return [start, end] of the object literal (end is exclusive).
function findNotes(src, id) {
  const head = src.indexOf(`id: ${q(id)}`);
  if (head < 0) throw new Error(`episode ${id} not found in data/episodes.js`);
  const next = src.indexOf("\n  { id:", head + 1);
  const block = src.slice(head, next < 0 ? src.length : next);
  const m = /\bnotes:\s*\{/.exec(block);
  if (!m) throw new Error(`episode ${id} has no notes object`);
  const open = head + m.index + m[0].length - 1;
  let depth = 0, i = open, inStr = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === "\\") i++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") inStr = c;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) return [open, i + 1]; }
  }
  throw new Error(`episode ${id}: unbalanced notes object`);
}

function setNotes(src, id, notes) {
  const [a, b] = findNotes(src, id);
  return src.slice(0, a) + notesSource(notes) + src.slice(b);
}

// Em dashes are not allowed anywhere in the data. Replace spaced ones with a comma, tight ones with a hyphen.
const noDash = s => String(s).replace(/\s*—\s*/g, (m) => /\s/.test(m) ? ", " : "-").replace(/\s*–\s*/g, m => /\s/.test(m) ? ", " : "-");

module.exports = { root, episodesFile, loadData, setNotes, notesSource, noDash };
