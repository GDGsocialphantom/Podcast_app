// App logic: rendering, routing and the episode matcher.
// Data lives in data/, auth lives in auth/, the admin editor in js/admin.js. This file only reads session state through isAdmin() and session.
const SELF_HOSTED = true; // true when this file is on your own domain: the episode page then embeds the YouTube player directly

const app = document.getElementById("app");

const showById = id => SHOWS.find(s => s.id === id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtDur = m => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
const ts = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0"); };
const initials = n => n.replace(/^(Judge|Dr\.)\s+/, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const yt = (id, t) => `https://www.youtube.com/watch?v=${id}${t ? "&t=" + t + "s" : ""}`;
const ytThumb = id => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`; // YouTube's og:image; hqdefault.jpg is the fallback if the video has no HD thumbnail
const sorted = () => [...EPISODES].sort((a, b) => b.date.localeCompare(a.date));

// Show logo tile: the real logo when assets/shows/<id>.png exists, otherwise a monogram in the brand color.
const showVars = s => `--show:${s.color};--show-ink:${s.ink || "#fff"}`;
function showLogo(s, cls = "") {
  return `<span class="slogo ${cls}" style="${showVars(s)}"><img src="${esc(s.logo || "")}" alt="" onerror="this.parentNode.classList.add('nologo');this.remove()"><b>${esc(initials(s.name.replace(/^The\s+/, "")))}</b></span>`;
}
function personHTML(p, show) {
  return `<div class="p"><span class="avatar" style="${showVars(show)}">${esc(initials(p.n))}</span><span>${esc(p.n)}<small>${esc(p.r)}</small></span></div>`;
}
function episodeRow(e, extra = "") {
  const s = showById(e.show);
  return `<a class="ep" href="#${e.id}" style="${showVars(s)}">
    <span class="stripe"></span>
    <span class="ep-thumb"><img src="https://i.ytimg.com/vi/${esc(e.youtube)}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()"></span>
    <div class="ep-main"><div class="ep-meta">${showLogo(s, "xs")}<span class="showname">${esc(s.name)}</span><span>${esc(e.format)} · ${fmtDate(e.date)}</span><span class="dur">${fmtDur(e.duration)}</span>${extra}</div>
      <h3 class="ep-title">${esc(e.title)}</h3><p class="ep-sum">${esc(e.summary)}</p>
      <div class="topics">${e.topics.map(t => `<span>${esc(t)}</span>`).join("")}</div></div>
    <div class="people">${e.people.map(p => personHTML(p, s)).join("")}</div>
  </a>`;
}

/* ---------- home ---------- */
let filter = "all";
function renderHome() {
  const list = sorted().filter(e => filter === "all" || e.show === filter);
  const count = id => EPISODES.filter(e => e.show === id).length;
  app.innerHTML = `
  <section class="mast">
    <div class="hero card"><p class="eyebrow">Kansas City · four shows · new episodes weekly</p>
      <h1>Every new episode, in one place.</h1>
      <p>Browse what just dropped, or tell us what you're in the mood for and we'll pick for you.</p>
      <div class="cta"><a class="btn" href="#find">Find me an episode</a><a class="btn ghost" href="#shows">Browse shows</a></div></div>
    <div class="shows" id="shows">${SHOWS.map(s => `<a class="show-row card" href="#show-${s.id}" style="${showVars(s)}">${showLogo(s, "sm")}<span><strong>${esc(s.name)}</strong><span>${esc(s.tagline)}</span></span><span class="count">${count(s.id)} ep</span></a>`).join("")}</div>
  </section>
  <section class="ask card"><div><h2>Not sure what to play?</h2><p>Answer three quick questions and get episodes matched to your topic, your time and how you like to listen.</p></div>
    <a class="btn accent" href="#find">Find me an episode</a></section>
  <section>
    <div class="section-head"><h2>New episodes</h2>
      <div class="filters">${[["all", "All shows"], ...SHOWS.map(s => [s.id, s.name])].map(([id, n]) => `<button class="chip" data-filter="${id}" aria-pressed="${filter === id}">${esc(n)}</button>`).join("")}</div></div>
    <div class="ep-list">${list.length ? list.map(e => episodeRow(e)).join("") : `<p class="tx-empty">No episodes yet for ${esc((showById(filter) || { name: "this show" }).name)}. First one is coming soon.</p>`}</div>
  </section>`;
  app.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { filter = b.dataset.filter; renderHome(); });
  setNav("#home");
}

/* ---------- find (form + results) ---------- */
const TOPICS = ["Entrepreneurship", "Investing", "Real estate", "Leadership", "Hiring", "AI", "Startups", "Community", "Social impact", "Climate", "Healthcare", "Government", "Education", "Treatment courts", "Kansas City"];
const TOPIC_MAP = {
  "Entrepreneurship": ["Side business", "Franchising", "Startups", "Product", "Leaving corporate", "Wealth building", "Entrepreneurship", "Founder stories", "Founder mindset", "Founder advice", "Founder lessons", "Small business", "Immigrant founders", "Women founders", "Black entrepreneurship", "Scaling", "Building in public", "Resilience"],
  "Investing": ["Investing", "Index funds", "Real estate", "Wealth building", "Financing", "Venture capital", "Raising capital", "Startup funding", "Impact investing", "Capital", "Angel investing"],
  "Real estate": ["Real estate", "Affordable housing", "Urban development", "Community development", "Gentrification", "Sustainable building"],
  "Leadership": ["Leadership", "Company culture", "Communication", "Creative leadership", "Corporate innovation", "Corporate responsibility", "Mentorship", "Decision making", "Women in leadership", "Civic leadership"],
  "Hiring": ["Hiring", "Company culture", "Workforce", "Talent", "Gen Z", "Diversity and inclusion"],
  "AI": ["AI", "AI in courts", "Technology", "Court data", "AI infrastructure", "Data centers", "Robotics", "Future of work", "Emerging tech", "Data analytics"],
  "Startups": ["Startups", "Product", "CoFoundry", "Side business", "Startup ecosystem", "Ecosystem building", "Innovation economy", "Accelerators", "Startup programs", "Social Venture Studio", "Founder stories"],
  "Community": ["Community", "Community development", "Black community", "Food access", "Social Venture Studio", "Creative economy", "Music", "Arts", "Collaboration", "Nonprofits"],
  "Social impact": ["Social impact", "Social entrepreneurship", "Social enterprise", "Social Venture Studio", "Affordable housing", "Homelessness", "Food access", "Mental health access", "Disability", "Accessibility", "Justice reform", "Impact investing"],
  "Climate": ["Climate", "Climate tech", "Refrigerants", "Nuclear energy", "Energy", "Sustainable fashion", "Circular economy", "Sustainability", "Sustainable infrastructure", "Sustainable building", "Electric vehicles"],
  "Healthcare": ["Healthcare", "Medical devices", "Clinical trials", "Medical records", "Digital health", "Animal health", "Autism", "Aging in place", "Health innovation", "Biotech", "Pediatric innovation"],
  "Government": ["Government", "Civic tech", "Civic innovation", "Smart cities", "GovTech", "Democracy", "Policy", "Entrepreneurship policy", "National security", "Missouri"],
  "Education": ["Education", "Tech education", "STEM education", "Youth", "Workforce", "Music", "Design thinking", "Research commercialization"],
  "Treatment courts": ["Treatment courts", "Recidivism", "Court funding", "Participants", "Families", "Court process", "Justice reform", "Court data", "Crime prevention", "Mass incarceration"],
  "Kansas City": ["Kansas City", "Johnson County", "CoFoundry", "Logistics", "Economic development", "Sports", "Midwest"]
};
let prefs = { topics: [], time: "any", format: "any", show: "any", free: "" };

function score(e) {
  let pts = 0, why = [];
  const wanted = new Set(prefs.topics.flatMap(t => TOPIC_MAP[t] || [t]));
  const hit = e.topics.filter(t => wanted.has(t));
  if (prefs.topics.length) { pts += hit.length * 3; if (hit.length) why.push("covers " + hit.slice(0, 2).join(" and ")); }
  if (prefs.time !== "any") {
    const ok = prefs.time === "short" ? e.duration <= 25 : prefs.time === "medium" ? e.duration > 25 && e.duration <= 50 : e.duration > 50;
    if (ok) { pts += 2; why.push("fits your " + { short: "quick", medium: "commute-length", long: "long" }[prefs.time] + " window"); } else pts -= 2;
  }
  if (prefs.format !== "any") { if (e.format === prefs.format) { pts += 2; why.push(e.format.toLowerCase() + " format"); } else pts -= 1; }
  if (prefs.show !== "any") { if (e.show === prefs.show) { pts += 2; } else pts -= 3; }
  const words = prefs.free.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const hay = (e.title + " " + e.summary + " " + e.topics.join(" ") + " " + e.people.map(p => p.n).join(" ")).toLowerCase();
  const fw = words.filter(w => hay.includes(w));
  if (fw.length) { pts += fw.length * 2; why.push("mentions " + fw.slice(0, 2).join(", ")); }
  return { pts, why };
}

function renderFind(showResults) {
  const chk = (name, v, label, type = "radio") => `<label><input type="${type}" name="${name}" value="${v}" id="${name}-${v.replace(/\W/g, "")}" ${type === "radio" ? (prefs[name] === v ? "checked" : "") : (prefs.topics.includes(v) ? "checked" : "")}>${esc(label)}</label>`;
  let results = "";
  if (showResults) {
    const ranked = EPISODES.map(e => ({ e, ...score(e) })).filter(r => r.pts > 0).sort((a, b) => b.pts - a.pts || b.e.date.localeCompare(a.e.date)).slice(0, 5);
    results = `<section id="results"><div class="results-head"><h2>${ranked.length ? "Your picks" : "Nothing matched everything"}</h2><span class="eyebrow">${ranked.length} episode${ranked.length === 1 ? "" : "s"}</span></div>
      ${ranked.length ? `<div class="ep-list">${ranked.map(r => episodeRow(r.e, `<span class="match">Match: ${r.why.join(" · ") || "recent"}</span>`)).join("")}</div>` : `<p class="tx-empty">Try fewer topics or set the time window to "Any length".</p>`}</section>`;
  }
  app.innerHTML = `
  <form class="form-card card" id="find-form">
    <div><p class="eyebrow">Find something to listen to</p><h1>What do you want to listen to?</h1></div>
    <fieldset><legend>Topics you're interested in</legend><div class="choices">${TOPICS.map(t => chk("topics", t, t, "checkbox")).join("")}</div></fieldset>
    <fieldset><legend>How much time do you have?</legend><div class="choices">${[["any", "Any length"], ["short", "Under 25 min"], ["medium", "25 to 50 min"], ["long", "Over 50 min"]].map(([v, l]) => chk("time", v, l)).join("")}</div></fieldset>
    <fieldset><legend>How do you like to listen?</legend><div class="choices">${[["any", "Doesn't matter"], ["Interview", "One-on-one interview"], ["Panel", "Group conversation"], ["Solo", "Solo host"], ["Talk", "Live talk"]].map(([v, l]) => chk("format", v, l)).join("")}</div></fieldset>
    <fieldset><legend>Any particular show?</legend><div class="choices">${[["any", "Any show"], ...SHOWS.map(s => [s.id, s.name])].map(([v, l]) => chk("show", v, l)).join("")}</div></fieldset>
    <fieldset><legend>Anything else? (optional)</legend><textarea id="free" name="free" placeholder="e.g. I'm thinking about buying a franchise and want to hear from someone who did it">${esc(prefs.free)}</textarea></fieldset>
    <div><button class="btn" type="submit">Show me episodes</button></div>
  </form>
  ${results}`;
  const form = document.getElementById("find-form");
  form.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    prefs = { topics: fd.getAll("topics"), time: fd.get("time"), format: fd.get("format"), show: fd.get("show"), free: fd.get("free") || "" };
    renderFind(true);
    document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  setNav("#find");
}

/* ---------- show page ---------- */
function renderShow(id) {
  const s = showById(id); if (!s) return renderHome();
  const list = sorted().filter(e => e.show === id);
  app.innerHTML = `
  <a class="back" href="#home">← All episodes</a>
  <section class="show-band card" style="${showVars(s)}">${showLogo(s, "lg")}<div>
    <p class="eyebrow">${esc(s.org)}</p><div class="ep-title-row"><h1>${esc(s.name)}</h1>${isAdmin() ? `<a class="editbtn" href="#admin-edit-show-${s.id}">Edit show</a>` : ""}</div>
    <p class="tag">${esc(s.tagline)}</p>
    <p class="about">${esc(s.about)}</p>
    <div class="line"><span>Hosted by ${esc(s.hosts.join(", "))}</span><span>${list.length} episodes</span></div></div></section>
  <div class="ep-list">${list.length ? list.map(e => episodeRow(e)).join("") : `<p class="tx-empty">No episodes yet. The first one is coming soon.</p>`}</div>`;
  setNav("#show-" + id);
}

/* ---------- episode page ---------- */
function renderEpisode(e) {
  const s = showById(e.show);
  const fam = t => Object.keys(TOPIC_MAP).filter(k => TOPIC_MAP[k].includes(t)); // topic families, so "Financing" relates to "Investing"
  const mine = new Set(e.topics), myFam = new Set(e.topics.flatMap(fam));
  const related = sorted().filter(x => x.id !== e.id).map(x => {
    const shared = x.topics.filter(t => mine.has(t));
    const famShared = x.topics.filter(t => !mine.has(t) && fam(t).some(f => myFam.has(f)));
    const other = x.show !== e.show;
    return { x, shared, famShared, pts: shared.length * 3 + famShared.length + (other ? 2 : 0) };
  }).filter(r => r.shared.length || r.famShared.length).sort((a, b) => b.pts - a.pts || b.x.date.localeCompare(a.x.date));
  // always lead with another show when one shares a topic, then fill from the rest
  const pick = [], firstOther = related.find(r => r.x.show !== e.show);
  if (firstOther) pick.push(firstOther);
  related.forEach(r => { if (pick.length < 4 && !pick.includes(r)) pick.push(r); });
  const video = SELF_HOSTED && location.protocol !== "file:" // YouTube refuses embeds on file:// pages, so opened from disk the page falls back to the thumbnail link
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${e.youtube}" title="${esc(e.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : `<a class="video" href="${yt(e.youtube)}" target="_blank" rel="noopener" style="${showVars(s)}"><img class="thumb" src="${ytThumb(e.youtube)}" alt="" onerror="if(!this.dataset.hq){this.dataset.hq=1;this.src='https://i.ytimg.com/vi/${e.youtube}/hqdefault.jpg'}else{this.remove()}"><span class="pb"><svg width="32" height="32" viewBox="0 0 24 24" fill="#0F2F33"><path d="M8 5v14l11-7z"/></svg></span><span class="cap">Watch on YouTube · ${fmtDur(e.duration)}</span></a>`;
  const n = e.notes || {}, has = a => Array.isArray(a) && a.length > 0; // notes and each section are optional (see tools/check-data.js)
  const cueHTML = c => `<div class="cue" data-text="${esc(c.x.toLowerCase())}"><a class="t" href="${yt(e.youtube, c.t)}" target="_blank" rel="noopener">${ts(c.t)}</a><span class="sp">${esc(c.s)}</span><p>${esc(c.x)}</p></div>`;
  app.innerHTML = `
  <section class="ep-hero" style="${showVars(s)}"><a class="back" href="#home">← All episodes</a>
    <p class="eyebrow showtag"><a href="#show-${s.id}">${showLogo(s, "xs")}${esc(s.name)}</a></p>
    <div class="ep-title-row"><h1>${esc(e.title)}</h1>${isAdmin() ? `<a class="editbtn" href="#admin-edit-${e.id}">Edit episode</a>` : ""}</div>
    <div class="line"><span class="badge">${esc(e.format)}</span><span>${fmtDate(e.date)}</span><span class="dur">${fmtDur(e.duration)}</span><span>${e.topics.map(esc).join(" · ")}</span></div>
    <p style="max-width:62ch;color:var(--muted);margin:0;font-size:17px">${esc(e.summary)}</p></section>
  <section class="play card" style="${showVars(s)}">${video}<div class="cast">${e.people.map(p => personHTML(p, s)).join("")}</div></section>
  <div class="two" style="${showVars(s)}">
    <section class="card"><div class="tx-head"><h2>Transcript</h2><input class="tx-search" id="tx-search" type="search" placeholder="Search this transcript"></div>
      <div class="tx" id="tx"><p class="tx-empty">Transcript coming soon.</p></div></section>
    <aside class="notes card"><h2>Show notes</h2>
      ${has(n.takeaways) ? `<div><h3>Takeaways</h3><ul>${n.takeaways.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
      ${has(n.chapters) ? `<div><h3>Chapters</h3><div style="display:grid;gap:6px">${n.chapters.map(([t, x]) => `<div class="chap"><a href="${yt(e.youtube, t)}" target="_blank" rel="noopener">${ts(t)}</a><span>${esc(x)}</span></div>`).join("")}</div></div>` : ""}
      ${has(n.links) ? `<div><h3>Links</h3><ul>${n.links.map(([x, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(x)}</a></li>`).join("")}</ul></div>` : ""}
      <div><h3>In this episode</h3><ul>${e.people.map(p => `<li>${esc(p.n)}, ${esc(p.r)}</li>`).join("")}</ul></div>
    </aside></div>
  <section class="more"><h2>Keep listening</h2><p class="eyebrow" style="margin:0 0 12px">More on ${e.topics.slice(0, 2).map(esc).join(" and ")}, across all shows</p><div class="ep-list">${pick.map(r => episodeRow(r.x, `<span class="match">${r.x.show !== e.show ? "Different show · " : ""}${r.shared.length ? "also covers " + r.shared.slice(0, 2).join(", ") : "related: " + r.famShared.slice(0, 2).join(", ")}</span>`)).join("")}</div></section>`;
  const search = document.getElementById("tx-search"), tx = document.getElementById("tx");
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    tx.querySelectorAll(".cue").forEach(c => {
      const p = c.querySelector("p"), raw = p.textContent;
      c.hidden = q && !c.dataset.text.includes(q);
      p.innerHTML = q && !c.hidden ? esc(raw).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`) : esc(raw);
    });
  };
  // Transcripts live in data/transcripts/<id>.json and load after the page renders. No file, a 404 or a blocked fetch (file://) leaves the placeholder.
  const txUrl = `data/transcripts/${encodeURIComponent(e.id)}.json`;
  if (location.protocol !== "file:") fetch(txUrl).then(r => r.ok ? r.json() : null).then(cues => {
    if (!Array.isArray(cues) || !cues.length || location.hash.slice(1) !== e.id) return; // user already navigated away
    tx.innerHTML = cues.map(cueHTML).join("");
    if (search.value) search.oninput();
  }).catch(err => console.warn("transcript: could not load " + txUrl, err));
  setNav(null);
  window.scrollTo({ top: 0 });
}

/* ---------- router ---------- */
function setNav(h) { document.querySelectorAll("#nav a, #shownav a").forEach(a => a.getAttribute("href") === h ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")); }
function route() {
  const h = (location.hash || "#home").slice(1);
  if (h === "login") return renderLogin("#home");
  if (REQUIRE_LOGIN && !session) return renderLogin(location.hash);
  if (h === "admin-new-episode") return renderAdmin("episode");
  if (h === "admin-shows") return renderAdmin("shows");
  if (h === "admin-new-show") return renderAdmin("show");
  if (h.startsWith("admin-edit-show-")) return renderAdmin("show", h.slice(16));
  if (h.startsWith("admin-edit-")) return renderAdmin("episode", h.slice(11));
  if (h === "home" || h === "") return renderHome();
  if (h === "find") return renderFind(false);
  if (h === "shows") { renderHome(); document.getElementById("shows").scrollIntoView(); return; }
  if (h.startsWith("show-")) return renderShow(h.slice(5));
  const e = EPISODES.find(x => x.id === h);
  if (e) return renderEpisode(e);
  renderHome();
}
window.addEventListener("hashchange", () => { window.scrollTo({ top: 0 }); route(); });
renderChrome();
route();
