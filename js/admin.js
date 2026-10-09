// Admin editor: forms for episodes and shows that GENERATE the object to paste into data/, plus the transcript file for data/transcripts/.
// Nothing here writes to the repo or to any backend. See claude/known-issues.md, "Where does the admin editor save?"
// Drafts are kept in localStorage (per browser) so a half-finished form survives a reload.
//
// Exposed to js/app.js:  renderAdmin(kind, id)   kind = "episode" | "show" | "shows"
// Expects from js/app.js at call time:  app, esc, setNav, showById, episodeRow, ts, EPISODES, SHOWS
// Expects from auth/auth.js:  isAdmin(), renderLogin()

const FORMATS = ["Interview", "Panel", "Solo", "Talk"];
const DRAFT_PREFIX = "kl.draft.";

/* ---------- small helpers ---------- */
const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
const commaList = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
const q = s => JSON.stringify(String(s == null ? "" : s));
function parseTime(v) {                        // "1:02:03", "12:34" or "754" -> seconds
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return +s;
  const p = s.split(":").map(Number);
  if (p.some(isNaN) || p.length > 3) return NaN;
  return p.reduce((a, b) => a * 60 + b, 0);
}
function parseYouTube(v) {                     // accepts an id or any youtube.com / youtu.be URL
  const s = String(v).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : s;
}
function nextEpisodeId(show) {
  const nums = EPISODES.filter(e => e.show === show).map(e => parseInt((e.id.match(/(\d+)$/) || [])[1], 10)).filter(n => !isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `${show}-${String(n).padStart(3, "0")}`;
}
function draftKey(kind, id) { return DRAFT_PREFIX + kind + "." + (id || "new"); }
function loadDraft(kind, id) { try { return JSON.parse(localStorage.getItem(draftKey(kind, id)) || "null"); } catch (e) { return null; } }
function saveDraft(kind, id, data) { try { localStorage.setItem(draftKey(kind, id), JSON.stringify(data)); } catch (e) {} }
function clearDraft(kind, id) { try { localStorage.removeItem(draftKey(kind, id)); } catch (e) {} }
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  const old = btn.textContent; btn.textContent = "Copied"; setTimeout(() => btn.textContent = old, 1400);
}

/* ---------- serializers: match the style of data/episodes.js and data/shows.js ---------- */
function episodeSource(e) {
  const people = e.people.map(p => `{ n: ${q(p.n)}, r: ${q(p.r)} }`).join(", ");
  const chapters = e.notes.chapters.map(([t, n]) => `[${t}, ${q(n)}]`).join(", ");
  const links = e.notes.links.map(([n, u]) => `[${q(n)}, ${q(u)}]`).join(", ");
  return `  { id: ${q(e.id)}, show: ${q(e.show)}, format: ${q(e.format)}, date: ${q(e.date)}, duration: ${e.duration},
    title: ${q(e.title)},
    summary: ${q(e.summary)},
    topics: [${e.topics.map(q).join(", ")}],
    people: [${people}],
    youtube: ${q(e.youtube)},
    notes: {
      takeaways: [${e.notes.takeaways.map(q).join(", ")}],
      chapters: [${chapters}],
      links: [${links}]
    } },`;
}
function transcriptSource(e) {  // data/transcripts/<id>.json
  return "[\n" + e.transcript.map(c => `  { "t": ${c.t}, "s": ${q(c.s)}, "x": ${q(c.x)} }`).join(",\n") + "\n]\n";
}
function showSource(s) {
  return `  { id: ${q(s.id)}, name: ${q(s.name)}, color: ${q(s.color)}, ink: ${q(s.ink || "#FFFFFF")}, logo: ${q(s.logo || "assets/shows/" + s.id + ".png")}, org: ${q(s.org)},
    tagline: ${q(s.tagline)},
    hosts: [${s.hosts.map(q).join(", ")}],
    about: ${q(s.about)} },`;
}

/* ---------- validation: same rules as tools/check-data.js ---------- */
function validateEpisode(e, editingId) {
  const p = [];
  if (!e.id) p.push("Needs an id.");
  else {
    if (/^(home|find|shows|login)$/.test(e.id) || e.id.startsWith("show-") || e.id.startsWith("admin-")) p.push("That id collides with a page route.");
    if (e.id !== editingId && EPISODES.some(x => x.id === e.id)) p.push(`An episode with id "${e.id}" already exists.`);
  }
  if (!showById(e.show)) p.push("Pick a show.");
  if (!e.title) p.push("Needs a title.");
  if (!e.summary) p.push("Needs a summary.");
  if (!e.format) p.push("Pick a format.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || isNaN(Date.parse(e.date))) p.push("Date should be YYYY-MM-DD.");
  if (!(e.duration > 0)) p.push("Duration should be a number of minutes.");
  if (!e.topics.length) p.push("Add at least one topic.");
  if (!e.people.length) p.push("Add at least one person.");
  if (e.people.some(x => !x.n || !x.r)) p.push("Each person needs a name and a role: Name | Role.");
  const single = e.people.filter(x => x.n && !/\s/.test(x.n.trim())).map(x => x.n);
  if (single.length) p.push(`Heads up: ${single.join(", ")} ${single.length === 1 ? "has" : "have"} no last name. Add it, or keep the first name and mark the people line with // TODO full name after pasting.`);
  if (!/^[\w-]{11}$/.test(e.youtube)) p.push("YouTube should be an 11-character video id or a YouTube URL.");
  if (e.transcriptError) p.push("Transcript: " + e.transcriptError);
  let last = -1;
  for (const c of e.transcript) {
    if (typeof c.t !== "number" || !c.s || !c.x) { p.push("Transcript cues need t (seconds), s (speaker) and x (text)."); break; }
    if (c.t < last) { p.push(`Transcript cue at ${c.t}s is out of order.`); break; }
    last = c.t;
  }
  if (e.notes.chapters.some(([t, n]) => isNaN(t) || !n)) p.push("Each chapter line is a time then a title, e.g. 12:34 The middle part.");
  if (e.notes.links.some(([n, u]) => !n || !/^https?:\/\//.test(u))) p.push("Each link line is Label | https://url");
  return p;
}
function validateShow(s, editingId) {
  const p = [];
  if (!s.id) p.push("Needs an id.");
  else {
    if (!/^[a-z0-9-]+$/.test(s.id)) p.push("Id should be lowercase letters, numbers and dashes.");
    if (s.id !== editingId && SHOWS.some(x => x.id === s.id)) p.push(`A show with id "${s.id}" already exists.`);
  }
  for (const k of ["name", "color", "org", "tagline", "about"]) if (!s[k]) p.push(`Needs ${k}.`);
  if (s.color && !/^#[0-9a-fA-F]{6}$/.test(s.color)) p.push("Brand color should be a 6-digit hex like #1F2937.");
  if (s.ink && !/^#[0-9a-fA-F]{6}$/.test(s.ink)) p.push("Text color should be a 6-digit hex.");
  if (!s.hosts.length) p.push("Add at least one host.");
  return p;
}

/* ---------- form pieces ---------- */
const field = (name, label, control, hint = "") => `<label class="fld"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span>${control}</label>`;
const input = (name, v, type = "text", extra = "") => `<input name="${name}" type="${type}" value="${esc(v == null ? "" : v)}" ${extra}>`;
const area = (name, v, rows = 3, ph = "") => `<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(v == null ? "" : v)}</textarea>`;
const select = (name, v, opts) => `<select name="${name}">${opts.map(([val, lab]) => `<option value="${esc(val)}" ${val === v ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;

function adminShell({ title, sub, form, back = "#home", backLabel = "All episodes" }) {
  app.innerHTML = `<section class="ep-hero"><a class="back" href="${back}">← ${esc(backLabel)}</a><p class="eyebrow">Admin</p><h1>${esc(title)}</h1>
    <p style="max-width:62ch;color:var(--muted);margin:0">${sub}</p></section>${form}`;
  setNav(null);
}
const NOWRITE = `This form generates the code for <code>data/</code>. Nothing saves from the browser: copy the output, paste it into the file, run <code>node tools/check-data.js</code> and commit.`;

/* ---------- episode editor ---------- */
function episodeFormValues(seed) {
  // flatten an episode object (or a saved draft) into the string values the form shows
  const e = seed || {};
  const n = e.notes || {};
  return {
    id: e.id || "", show: e.show || SHOWS[0].id, format: e.format || FORMATS[0], date: e.date || new Date().toISOString().slice(0, 10),
    duration: e.duration || "", title: e.title || "", summary: e.summary || "",
    topics: (e.topics || []).join(", "), youtube: e.youtube || "",
    people: (e.people || []).map(p => `${p.n} | ${p.r}`).join("\n"),
    transcript: "",   // filled from data/transcripts/<id>.json when editing (see renderEpisodeEditor)
    takeaways: (n.takeaways || []).join("\n"),
    chapters: (n.chapters || []).map(([t, x]) => `${ts(t)} ${x}`).join("\n"),
    links: (n.links || []).map(([x, u]) => `${x} | ${u}`).join("\n")
  };
}
function episodeFromForm(v) {
  let transcript = [], notesFromPaste = null, transcriptError = "";
  if (v.transcript.trim()) {
    try {
      const j = JSON.parse(v.transcript);
      if (Array.isArray(j)) transcript = j;
      else if (j && Array.isArray(j.transcript)) { transcript = j.transcript; notesFromPaste = j.notes || null; } // whole transcribe.py file pasted
      else transcriptError = "expected a JSON array of cues, or the whole transcribe.py output";
    } catch (e) { transcriptError = "not valid JSON (" + e.message + ")"; }
  }
  const takeaways = lines(v.takeaways), chapters = lines(v.chapters).map(l => { const m = l.match(/^(\S+)\s+(.*)$/); return m ? [parseTime(m[1]), m[2].trim()] : [NaN, l]; });
  const links = lines(v.links).map(l => l.split("|").map(x => x.trim())).map(([n, u]) => [n || "", u || ""]);
  return {
    id: v.id.trim(), show: v.show, format: v.format, date: v.date.trim(), duration: Number(v.duration),
    title: v.title.trim(), summary: v.summary.trim(), topics: commaList(v.topics),
    people: lines(v.people).map(l => l.split("|").map(x => x.trim())).map(([n, r]) => ({ n: n || "", r: r || "" })),
    youtube: parseYouTube(v.youtube), transcript, transcriptError,
    notes: { takeaways, chapters, links },
    notesFromPaste
  };
}

function renderEpisodeEditor(id) {
  const existing = id ? EPISODES.find(x => x.id === id) : null;
  if (id && !existing) return renderHome(); // unknown id: same fallback as the other routes
  let v = loadDraft("episode", id) || episodeFormValues(existing);
  if (!id && !v.id) v.id = nextEpisodeId(v.show);

  adminShell({
    title: existing ? "Edit episode" : "Add episode",
    sub: NOWRITE + (existing ? ` Editing <strong>${esc(existing.title)}</strong>.` : ""),
    back: existing ? "#" + existing.id : "#home", backLabel: existing ? "Back to episode" : "All episodes",
    form: `<div class="admin">
    <form class="card admin-form" id="ep-form" autocomplete="off">
      <div class="grid2">
        ${field("show", "Show", select("show", v.show, SHOWS.map(s => [s.id, s.name])))}
        ${field("format", "Format", select("format", v.format, FORMATS.map(f => [f, f])))}
        ${field("id", "Episode id", input("id", v.id), "used in the URL, e.g. eko-013")}
        ${field("date", "Date", input("date", v.date, "date"))}
        ${field("duration", "Duration (minutes)", input("duration", v.duration, "number", 'min="1"'))}
        ${field("youtube", "YouTube video", input("youtube", v.youtube), "video id or URL")}
      </div>
      ${field("title", "Title", input("title", v.title))}
      ${field("summary", "Summary", area("summary", v.summary, 2, "One or two sentences for the episode card."))}
      ${field("topics", "Topics", input("topics", v.topics), "comma separated")}
      ${field("people", "People", area("people", v.people, 3, "Craig Moore II | Host\nMarcus Bell | Guest, franchise owner"), "one per line: Name | Role")}
      <details ${v.transcript || v.takeaways || v.chapters || v.links ? "open" : ""}><summary>Transcript and show notes</summary>
        ${field("transcript", "Transcript", area("transcript", v.transcript, 6, '[{ "t": 0, "s": "Speaker", "x": "..." }]'), "paste the JSON from tools/fetch-captions.js or tools/transcribe.py (the cue array or the whole file); it comes out as its own file below")}
        ${field("takeaways", "Takeaways", area("takeaways", v.takeaways, 3), "one per line")}
        ${field("chapters", "Chapters", area("chapters", v.chapters, 3, "00:00 Intro\n12:34 The middle part"), "one per line: time then title")}
        ${field("links", "Links", area("links", v.links, 2, "Magis | https://www.magis.ai"), "one per line: Label | URL")}
      </details>
      <div class="admin-actions"><button type="button" class="btn ghost small" id="ep-clear">Reset form</button><span class="eyebrow" id="ep-saved">Draft saves as you type</span></div>
    </form>
    <div class="admin-out">
      <div class="card admin-preview"><p class="eyebrow">Preview</p><div class="ep-list" id="ep-preview"></div></div>
      <div class="card admin-code"><div class="admin-code-head"><p class="eyebrow">Paste into data/episodes.js</p><button type="button" class="btn small" id="ep-copy">Copy</button></div>
        <ul class="problems" id="ep-problems"></ul>
        <p class="admin-where" id="ep-where"></p>
        <pre id="ep-code"></pre></div>
      <div class="card admin-code" id="tx-out" hidden><div class="admin-code-head"><p class="eyebrow" id="tx-where">Save as data/transcripts/</p><button type="button" class="btn small" id="tx-copy">Copy</button></div>
        <pre id="tx-code"></pre></div>
    </div></div>`
  });

  const form = document.getElementById("ep-form"), code = document.getElementById("ep-code"), probs = document.getElementById("ep-problems"), where = document.getElementById("ep-where"), prev = document.getElementById("ep-preview");
  const txOut = document.getElementById("tx-out"), txWhere = document.getElementById("tx-where"), txCode = document.getElementById("tx-code");
  document.getElementById("tx-copy").onclick = ev => copyText(txCode.textContent, ev.currentTarget);
  if (existing && !v.transcript && location.protocol !== "file:") {   // pull the existing transcript file into the form once
    fetch(`data/transcripts/${encodeURIComponent(existing.id)}.json`).then(r => r.ok ? r.json() : null).then(cues => {
      if (Array.isArray(cues) && cues.length && !form.transcript.value.trim()) { form.transcript.value = JSON.stringify(cues, null, 2); update(); }
    }).catch(() => {});
  }
  const values = () => Object.fromEntries(new FormData(form).entries());
  let lastShow = v.show;
  function update() {
    const vals = values();
    if (!existing && vals.show !== lastShow && vals.id === nextEpisodeId(lastShow)) { vals.id = nextEpisodeId(vals.show); form.id.value = vals.id; }
    lastShow = vals.show;
    const e = episodeFromForm(vals);
    if (e.notesFromPaste) {   // whole transcribe.py output pasted: split it into the notes fields once
      const n = e.notesFromPaste;
      form.transcript.value = JSON.stringify(e.transcript, null, 2);
      if (!vals.takeaways.trim() && n.takeaways) form.takeaways.value = n.takeaways.join("\n");
      if (!vals.chapters.trim() && n.chapters) form.chapters.value = n.chapters.map(([t, x]) => `${ts(t)} ${x}`).join("\n");
      if (!vals.links.trim() && n.links) form.links.value = n.links.map(([x, u]) => `${x} | ${u}`).join("\n");
      return update();
    }
    saveDraft("episode", id, vals);
    const problems = validateEpisode(e, id);
    probs.innerHTML = problems.map(p => `<li>${esc(p)}</li>`).join("");
    probs.hidden = !problems.length;
    where.textContent = existing
      ? `Replace the object with id "${id}" in data/episodes.js with this.`
      : `Add this right after "const EPISODES = [" at the top of data/episodes.js.`;
    code.textContent = episodeSource(e);
    txOut.hidden = !e.transcript.length;
    if (e.transcript.length) { txWhere.textContent = `Save as data/transcripts/${e.id || "<episode id>"}.json`; txCode.textContent = transcriptSource(e); }
    try { prev.innerHTML = showById(e.show) ? episodeRow({ ...e, title: e.title || "Untitled episode", summary: e.summary || "", topics: e.topics, people: e.people.filter(p => p.n) }) : ""; } catch (err) { prev.innerHTML = ""; }
    prev.querySelectorAll("a").forEach(a => a.removeAttribute("href"));
  }
  form.oninput = update;
  form.onchange = update;
  form.onsubmit = ev => ev.preventDefault();
  document.getElementById("ep-copy").onclick = ev => copyText(code.textContent, ev.currentTarget);
  document.getElementById("ep-clear").onclick = () => { clearDraft("episode", id); renderEpisodeEditor(id); };
  update();
}

/* ---------- show editor and branding ---------- */
// Brand color is a hex value per show (see data/shows.js). Ink is the text color that reads on top of it.
// The logo is uploaded here only to preview and to download a correctly named file; nothing is written
// until the backend exists (claude/known-issues.md, Planned step 3). When it does, Save and logo upload
// wire into prepareLogo() and showSource() below.
const LOGO_MAX_PX = 512;            // raster logos are scaled so the longer side is at most this
const LOGO_DRAFT_MAX = 1024 * 1024; // data URLs bigger than this stay in memory and are not saved to the draft
const LOGO_TYPES = { "image/png": "png", "image/svg+xml": "svg", "image/jpeg": "jpg", "image/webp": "webp" };

const hexOk = h => /^#[0-9a-fA-F]{6}$/.test(h || "");
function luminance(hex) {   // WCAG relative luminance, 0 (black) to 1 (white)
  const n = parseInt(hex.slice(1), 16), ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const suggestInk = hex => hexOk(hex) && luminance(hex) > 0.4 ? "#292929" : "#FFFFFF";
const logoExt = path => ((path || "").match(/\.(png|svg|jpg|webp)$/) || [])[1] || "png";

// Reads a logo file from the admin's computer and returns { ext, dataUrl, bytes }.
// SVG passes through untouched. Raster images are scaled to LOGO_MAX_PX on the longer side;
// PNG and WebP come out as PNG (keeps transparency), JPEG stays JPEG.
function prepareLogo(file) {
  return new Promise((resolve, reject) => {
    const ext = LOGO_TYPES[file.type];
    if (!ext) return reject(new Error("Use a PNG, SVG, JPG or WebP file."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    if (ext === "svg") {
      reader.onload = () => resolve({ ext, dataUrl: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(reader.result))), bytes: file.size });
      return reader.readAsText(file);
    }
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That image couldn't be decoded."));
      img.onload = () => {
        const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        const outExt = ext === "jpg" ? "jpg" : "png";
        const dataUrl = c.toDataURL(outExt === "jpg" ? "image/jpeg" : "image/png", 0.9);
        resolve({ ext: outExt, dataUrl, bytes: Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4), width: w, height: h, from: [img.naturalWidth, img.naturalHeight] });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Mock-ups of every place the site shows a logo or brand color, rendered with the draft show.
function brandPreview(s, logoSrc) {
  const p = { ...s, logo: logoSrc || s.logo };
  const sample = EPISODES.find(e => e.show === s.id) || EPISODES[0] || { id: "x", youtube: "", format: "Interview", date: new Date().toISOString().slice(0, 10), duration: 42, title: "Episode title goes here", summary: "A one-line summary of the episode, as it appears on the home page.", topics: ["Topic", "Another"], people: [{ n: s.hosts[0] || "Host", r: "Host" }] };
  const ep = episodeRow({ ...sample, show: s.id, people: sample.people.slice(0, 2) }, "", p).replace(/href="[^"]*"/g, "");
  return `
    <div class="mock-side" style="${showVars(p)}"><span class="label">Sidebar</span><a>${showLogo(p, "xs")}<span class="txt">${esc(s.name || "Show name")}</span></a></div>
    <div><span class="label">Show list</span><div class="show-row card" style="${showVars(p)}">${showLogo(p, "sm")}<span><strong>${esc(s.name || "Show name")}</strong><span>${esc(s.tagline || "Tagline")}</span></span><span class="count">${EPISODES.filter(e => e.show === s.id).length} ep</span></div></div>
    <div><span class="label">Show page</span><section class="show-band card" style="${showVars(p)}">${showLogo(p, "lg")}<div><p class="eyebrow">${esc(s.org || "Organization")}</p><h1>${esc(s.name || "Show name")}</h1><p class="tag">${esc(s.tagline || "Tagline")}</p><div class="line"><span>Hosted by ${esc(s.hosts.join(", ") || "Host")}</span></div></div></section></div>
    <div><span class="label">Episode card</span><div class="ep-list">${ep}</div></div>`;
}

function renderShowEditor(id) {
  const existing = id ? showById(id) : null;
  if (id && !existing) return renderHome();
  const draft = loadDraft("show", id);
  const seed = draft || (existing ? { ...existing, hosts: existing.hosts.join("\n"), inkauto: existing.ink === suggestInk(existing.color) } : { id: "", name: "", color: "#1F2937", ink: "#FFFFFF", inkauto: true, logo: "", org: "", tagline: "", hosts: "", about: "" });
  let logoData = draft && draft.logoData ? draft.logoData : null;   // { ext, dataUrl, bytes } from an upload this session or a saved draft
  const inkauto = seed.inkauto !== false && seed.inkauto !== "";

  adminShell({
    title: existing ? "Edit show" : "Add show",
    sub: NOWRITE + (existing ? ` Editing <strong>${esc(existing.name)}</strong>.` : "") + ` Brand color, text color and logo preview below exactly as the site renders them.`,
    back: existing ? "#show-" + existing.id : "#admin-shows", backLabel: existing ? "Back to show" : "All shows",
    form: `<div class="admin">
    <form class="card admin-form" id="show-form" autocomplete="off">
      <div class="grid2">
        ${field("name", "Show name", input("name", seed.name))}
        ${field("id", "Show id", input("id", seed.id, "text", existing ? "readonly" : ""), existing ? "episodes reference this, so it can't change here" : "lowercase, e.g. sessions")}
        ${field("org", "Organization", input("org", seed.org))}
        ${field("tagline", "Tagline", input("tagline", seed.tagline))}
      </div>
      <fieldset class="brand"><legend>Branding</legend>
        <div class="grid2">
          <label class="fld"><span>Brand color<small>stripes, tiles, show band</small></span><span class="colorrow"><input type="color" name="colorpick" value="${esc(hexOk(seed.color) ? seed.color : "#1F2937")}" aria-label="Pick brand color"><input name="color" value="${esc(seed.color || "")}" placeholder="#1F2937" maxlength="7"></span></label>
          <label class="fld"><span>Text on brand color<small>suggested from the color's brightness</small></span><span class="colorrow"><input type="color" name="inkpick" value="${esc(hexOk(seed.ink) ? seed.ink : "#FFFFFF")}" aria-label="Pick text color" ${inkauto ? "disabled" : ""}><input name="ink" value="${esc(seed.ink || "")}" placeholder="#FFFFFF" maxlength="7" ${inkauto ? "readonly" : ""}><label class="chk"><input type="checkbox" name="inkauto" ${inkauto ? "checked" : ""}>Auto</label></span></label>
        </div>
        <label class="fld"><span>Logo<small>PNG, SVG, JPG or WebP. Square or wide, transparent background works best. Rasters are scaled to ${LOGO_MAX_PX}px.</small></span>
          <span class="logorow"><input type="file" name="logofile" accept="image/png,image/svg+xml,image/jpeg,image/webp"><span class="logo-meta" id="logo-meta"></span><button type="button" class="btn ghost small" id="logo-clear" hidden>Remove upload</button></span></label>
        <p class="admin-where" id="logo-path"></p>
      </fieldset>
      ${field("hosts", "Hosts", area("hosts", seed.hosts, 3), "one per line")}
      ${field("about", "About", area("about", seed.about, 3))}
      <div class="admin-actions"><button type="button" class="btn ghost small" id="show-clear">Reset form</button><span class="eyebrow">Draft saves as you type</span></div>
    </form>
    <div class="admin-out">
      <div class="card admin-preview brand-preview" id="brand-preview"></div>
      <div class="card admin-code"><div class="admin-code-head"><p class="eyebrow">Paste into data/shows.js</p><span class="btnrow"><a class="btn ghost small" id="logo-download" hidden download>Download logo</a><button type="button" class="btn small" id="show-copy">Copy</button></span></div>
        <ul class="problems" id="show-problems"></ul>
        <p class="admin-where" id="show-where"></p>
        <pre id="show-code"></pre></div>
    </div></div>`
  });

  const form = document.getElementById("show-form"), code = document.getElementById("show-code"), probs = document.getElementById("show-problems"), where = document.getElementById("show-where");
  const preview = document.getElementById("brand-preview"), logoMeta = document.getElementById("logo-meta"), logoPath = document.getElementById("logo-path"), logoClear = document.getElementById("logo-clear"), logoDownload = document.getElementById("logo-download");
  let logoError = "";

  function currentShow() {
    const vals = Object.fromEntries(new FormData(form).entries());
    const sid = (vals.id || "").trim().toLowerCase();
    const color = (vals.color || "").trim();
    const ink = form.inkauto.checked ? suggestInk(color) : (vals.ink || "").trim();
    const ext = logoData ? logoData.ext : logoExt(existing && existing.id === sid ? existing.logo : "");
    return { vals, s: { id: sid, name: vals.name.trim(), color, ink, logo: sid ? `assets/shows/${sid}.${ext}` : "", org: vals.org.trim(), tagline: vals.tagline.trim(), hosts: lines(vals.hosts), about: vals.about.trim() } };
  }
  function update() {
    const { vals, s } = currentShow();
    // keep the two color controls in step
    if (hexOk(s.color)) form.colorpick.value = s.color;
    if (form.inkauto.checked) { form.ink.value = s.ink; form.ink.readOnly = true; form.inkpick.disabled = true; } else { form.ink.readOnly = false; form.inkpick.disabled = false; }
    if (hexOk(s.ink)) form.inkpick.value = s.ink;
    saveDraft("show", id, { ...vals, color: s.color, ink: s.ink, inkauto: form.inkauto.checked, hosts: vals.hosts, logoData: logoData && logoData.bytes <= LOGO_DRAFT_MAX ? logoData : null });
    const problems = validateShow(s, id);
    if (logoError) problems.push("Logo: " + logoError);
    if (s.logo && !/^assets\/shows\/[a-z0-9-]+\.(png|svg|jpg|webp)$/.test(s.logo)) problems.push("Logo path should be assets/shows/<id>.<png|svg|jpg|webp>.");
    probs.innerHTML = problems.map(p => `<li>${esc(p)}</li>`).join("");
    probs.hidden = !problems.length;
    const file = s.logo ? s.logo.split("/").pop() : "<id>.png";
    where.textContent = (existing ? `Replace the object with id "${id}" in data/shows.js with this.` : `Add this inside the SHOWS array in data/shows.js.`) + (logoData ? ` Put the downloaded ${file} in assets/shows/, then run node tools/check-data.js and commit.` : ` Put the logo at ${s.logo || "assets/shows/<id>.png"}, then run node tools/check-data.js and commit.`);
    code.textContent = showSource(s);
    logoPath.textContent = s.logo ? `Saved as ${s.logo}` + (logoData ? "" : existing && existing.logo === s.logo ? " (current file)" : " (file not uploaded yet; the site shows a monogram until it exists)") : "Enter a show id to set the logo path.";
    logoMeta.textContent = logoData ? `${logoData.ext.toUpperCase()}${logoData.width ? `, ${logoData.width}×${logoData.height}px` : ""}${logoData.from && (logoData.from[0] !== logoData.width || logoData.from[1] !== logoData.height) ? ` (scaled from ${logoData.from[0]}×${logoData.from[1]})` : ""}, ${logoData.bytes < 1024 ? "under 1" : Math.round(logoData.bytes / 1024)} KB${logoData.bytes > LOGO_DRAFT_MAX ? ", too big to keep in the draft" : ""}` : "";
    logoClear.hidden = !logoData;
    logoDownload.hidden = !logoData;
    if (logoData) { logoDownload.href = logoData.dataUrl; logoDownload.download = file; }
    preview.innerHTML = brandPreview(s, logoData ? logoData.dataUrl : null);
  }
  form.oninput = ev => {
    if (ev.target.name === "colorpick") form.color.value = ev.target.value.toUpperCase();
    if (ev.target.name === "inkpick") form.ink.value = ev.target.value.toUpperCase();
    if (ev.target.name === "color" && hexOk(form.color.value)) form.color.value = form.color.value.toUpperCase();
    update();
  };
  form.onchange = ev => {
    if (ev.target.name === "logofile" && ev.target.files[0]) {
      logoError = "";
      prepareLogo(ev.target.files[0]).then(d => { logoData = d; update(); }).catch(err => { logoError = err.message; logoData = null; update(); });
      return;
    }
    update();
  };
  form.onsubmit = ev => ev.preventDefault();
  logoClear.onclick = () => { logoData = null; logoError = ""; form.logofile.value = ""; update(); };
  document.getElementById("show-copy").onclick = ev => copyText(code.textContent, ev.currentTarget);
  document.getElementById("show-clear").onclick = () => { clearDraft("show", id); renderShowEditor(id); };
  update();
}

/* ---------- shows list ---------- */
function renderShowsAdmin() {
  adminShell({
    title: "Shows", sub: NOWRITE,
    form: `<div class="ep-list admin-shows">${SHOWS.map(s => `<div class="ep card" style="--show:${s.color}"><span class="stripe"></span>
      <div class="ep-meta"><span class="showname">${esc(s.org)}</span><span>${EPISODES.filter(e => e.show === s.id).length} episodes</span></div>
      <div class="ep-main"><h3 class="ep-title">${esc(s.name)}</h3><p class="ep-sum">${esc(s.tagline)}</p></div>
      <div><a class="editbtn" href="#admin-edit-show-${s.id}">Edit show</a></div></div>`).join("")}
      <div><a class="btn ghost small" href="#admin-new-show">Add a show</a></div></div>`
  });
}

/* ---------- transcripts status (read only) ---------- */
// Transcripts are fetched on GitHub by tools/fetch-transcripts.js whenever data/episodes.js changes on main.
// This page only reads data/transcript-status.json; nothing here calls the transcript API.
function renderTranscriptsAdmin() {
  adminShell({
    title: "Transcripts",
    sub: `Fetching runs on GitHub (the Transcripts workflow) when <code>data/episodes.js</code> changes on main, or from the Run workflow button. Nothing on this page calls the API. Episodes that already have a file are never fetched again.`,
    form: `<div class="admin-stats" id="tx-stats"><span class="eyebrow">Loading status…</span></div><div class="card admin-table"><table id="tx-table"><thead><tr><th>Episode</th><th>Status</th><th>Checked</th><th>Credits</th></tr></thead><tbody></tbody></table></div>`
  });
  const stats = document.getElementById("tx-stats"), body = document.querySelector("#tx-table tbody");
  const label = { ok: "ok", no_captions: "no captions", credits_exhausted: "credits exhausted", error: "error" };
  const fmt = iso => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  (location.protocol === "file:" ? Promise.resolve(null) : transcriptStatus()).then(st => {
    const eps = (st && st.episodes) || {};
    const rows = sorted().map(e => ({ e, s: eps[e.id] }));
    const count = k => rows.filter(r => r.s && r.s.status === k).length;
    const notFetched = rows.filter(r => !r.s).length;
    stats.innerHTML = [["ok", count("ok")], ["no captions", count("no_captions")], ["errors", count("error") + count("credits_exhausted")], ["not fetched", notFetched], ["credits used", st ? st.credits_used_total || 0 : 0]]
      .map(([k, v]) => `<div class="stat card"><b>${v}</b><span>${esc(k)}</span></div>`).join("") + `<p class="admin-where">${st && st.last_run ? "Last run " + esc(fmt(st.last_run)) : "No run recorded yet; data/transcript-status.json is missing or empty."}</p>`;
    body.innerHTML = rows.map(({ e, s }) => `<tr class="${s ? "st-" + esc(s.status) : "st-none"}"><td><a href="#${e.id}">${esc(e.title)}</a><small>${esc(e.id)} · ${fmtDate(e.date)}</small></td><td>${s ? esc(label[s.status] || s.status) : "not fetched"}</td><td>${s ? esc(fmt(s.checked)) : ""}</td><td>${s ? s.credits_used : ""}</td></tr>`).join("");
  });
  setNav(null);
}

/* ---------- entry point ---------- */
function renderAdmin(kind, id) {
  if (!isAdmin()) return renderLogin(location.hash);
  if (kind === "episode") return renderEpisodeEditor(id);
  if (kind === "show") return renderShowEditor(id);
  if (kind === "transcripts") return renderTranscriptsAdmin();
  return renderShowsAdmin();
}
