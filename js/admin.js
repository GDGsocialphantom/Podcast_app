// Admin editor: forms for episodes and shows that GENERATE the object to paste into data/.
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
  const cues = e.transcript.map(c => `      { t: ${c.t}, s: ${q(c.s)}, x: ${q(c.x)} }`).join(",\n");
  const chapters = e.notes.chapters.map(([t, n]) => `[${t}, ${q(n)}]`).join(", ");
  const links = e.notes.links.map(([n, u]) => `[${q(n)}, ${q(u)}]`).join(", ");
  return `  { id: ${q(e.id)}, show: ${q(e.show)}, format: ${q(e.format)}, date: ${q(e.date)}, duration: ${e.duration},
    title: ${q(e.title)},
    summary: ${q(e.summary)},
    topics: [${e.topics.map(q).join(", ")}],
    people: [${people}],
    youtube: ${q(e.youtube)},
    transcript: [${cues ? "\n" + cues + "\n    " : ""}],
    notes: {
      takeaways: [${e.notes.takeaways.map(q).join(", ")}],
      chapters: [${chapters}],
      links: [${links}]
    } },`;
}
function showSource(s) {
  return `  { id: ${q(s.id)}, name: ${q(s.name)}, color: ${q(s.color)}, org: ${q(s.org)},
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
    transcript: e.transcript && e.transcript.length ? JSON.stringify(e.transcript, null, 2) : "",
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
        ${field("transcript", "Transcript", area("transcript", v.transcript, 6, '[{ "t": 0, "s": "Speaker", "x": "..." }]'), "paste the JSON from tools/transcribe.py (the cue array or the whole file)")}
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
    </div></div>`
  });

  const form = document.getElementById("ep-form"), code = document.getElementById("ep-code"), probs = document.getElementById("ep-problems"), where = document.getElementById("ep-where"), prev = document.getElementById("ep-preview");
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

/* ---------- show editor ---------- */
const COLOR_OPTIONS = [["var(--eko)", "Lime (EKO)"], ["var(--court)", "Blue (Court Ordered)"], ["var(--sessions)", "Amber (Sessions)"], ["var(--disruption)", "Violet (Disruption Lab)"]];
function renderShowEditor(id) {
  const existing = id ? showById(id) : null;
  if (id && !existing) return renderHome();
  const seed = loadDraft("show", id) || (existing ? { ...existing, hosts: existing.hosts.join("\n") } : { id: "", name: "", color: "", org: "", tagline: "", hosts: "", about: "" });
  const customColor = seed.color && !COLOR_OPTIONS.some(([c]) => c === seed.color);

  adminShell({
    title: existing ? "Edit show" : "Add show",
    sub: NOWRITE + (existing ? ` Editing <strong>${esc(existing.name)}</strong>.` : ""),
    back: existing ? "#show-" + existing.id : "#admin-shows", backLabel: existing ? "Back to show" : "All shows",
    form: `<div class="admin">
    <form class="card admin-form" id="show-form" autocomplete="off">
      <div class="grid2">
        ${field("name", "Show name", input("name", seed.name))}
        ${field("id", "Show id", input("id", seed.id, "text", existing ? "readonly" : ""), existing ? "episodes reference this, so it can't change here" : "lowercase, e.g. sessions")}
        ${field("org", "Organization", input("org", seed.org))}
        ${field("color", "Color", select("colorpick", customColor ? "custom" : seed.color, [...COLOR_OPTIONS, ["custom", "Custom hex"]]) + input("color", customColor ? seed.color : "", "text", `placeholder="#F59E0B" ${customColor ? "" : "hidden"}`), "existing show colors are variables in css/site.css")}
      </div>
      ${field("tagline", "Tagline", input("tagline", seed.tagline))}
      ${field("hosts", "Hosts", area("hosts", seed.hosts, 3), "one per line")}
      ${field("about", "About", area("about", seed.about, 3))}
      <div class="admin-actions"><button type="button" class="btn ghost small" id="show-clear">Reset form</button><span class="eyebrow">Draft saves as you type</span></div>
    </form>
    <div class="admin-out">
      <div class="card admin-code"><div class="admin-code-head"><p class="eyebrow">Paste into data/shows.js</p><button type="button" class="btn small" id="show-copy">Copy</button></div>
        <ul class="problems" id="show-problems"></ul>
        <p class="admin-where" id="show-where"></p>
        <pre id="show-code"></pre></div>
    </div></div>`
  });

  const form = document.getElementById("show-form"), code = document.getElementById("show-code"), probs = document.getElementById("show-problems"), where = document.getElementById("show-where");
  function update() {
    const vals = Object.fromEntries(new FormData(form).entries());
    form.color.hidden = vals.colorpick !== "custom";
    const color = vals.colorpick === "custom" ? (vals.color || "").trim() : vals.colorpick;
    const s = { id: (vals.id || "").trim().toLowerCase(), name: vals.name.trim(), color, org: vals.org.trim(), tagline: vals.tagline.trim(), hosts: lines(vals.hosts), about: vals.about.trim() };
    saveDraft("show", id, { ...vals, color, hosts: vals.hosts });
    const problems = validateShow(s, id);
    probs.innerHTML = problems.map(p => `<li>${esc(p)}</li>`).join("");
    probs.hidden = !problems.length;
    where.textContent = existing ? `Replace the object with id "${id}" in data/shows.js with this.` : `Add this inside the SHOWS array in data/shows.js. New shows also need a nav color: a hex value works as is.`;
    code.textContent = showSource(s);
  }
  form.oninput = update; form.onchange = update; form.onsubmit = ev => ev.preventDefault();
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

/* ---------- entry point ---------- */
function renderAdmin(kind, id) {
  if (!isAdmin()) return renderLogin(location.hash);
  if (kind === "episode") return renderEpisodeEditor(id);
  if (kind === "show") return renderShowEditor(id);
  return renderShowsAdmin();
}
