// Video metadata (title and description) kept in data/video-meta.json, keyed by episode id.
// Filled by tools/fetch-transcripts.js from the YouTubeTranscript.dev response at fetch time and read by
// tools/notes-from-descriptions.js. The site never loads this file.
const fs = require("fs");
const path = require("path");
const { root } = require("./episodes-file");

const metaFile = path.join(root, "data", "video-meta.json");

function loadMeta() {
  if (!fs.existsSync(metaFile)) return {};
  try { return JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch (e) { console.error("video-meta.json is not valid JSON, starting fresh:", e.message); return {}; }
}
function saveMeta(meta) {
  const sorted = {};
  for (const k of Object.keys(meta).sort()) sorted[k] = meta[k];
  fs.writeFileSync(metaFile, JSON.stringify(sorted, null, 2) + "\n");
}

// Pull a title and description out of an API response without assuming its exact shape:
// looks for the usual key names up to three levels down and remembers which keys were there.
function pickMeta(body) {
  const data = (body && body.data) || body || {};
  const found = { title: null, description: null, fields: Object.keys(data).filter(k => k !== "transcript") };
  const want = { title: ["title", "video_title", "videoTitle", "name"], description: ["description", "video_description", "videoDescription", "shortDescription"] };
  const walk = (o, depth) => {
    if (!o || typeof o !== "object" || depth > 3) return;
    for (const [k, v] of Object.entries(o)) {
      if (k === "transcript" || k === "segments") continue;
      if (typeof v === "string") {
        if (!found.title && want.title.includes(k)) found.title = v;
        if (!found.description && want.description.includes(k)) found.description = v;
      } else if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(data, 0);
  return found;
}

function recordMeta(meta, id, picked) {
  const prev = meta[id] || {};
  meta[id] = {
    title: picked.title || prev.title || null,
    description: picked.description || prev.description || null,
    fields: picked.fields && picked.fields.length ? picked.fields : (prev.fields || []),
    fetched: new Date().toISOString()
  };
  return meta[id];
}

module.exports = { metaFile, loadMeta, saveMeta, pickMeta, recordMeta };
