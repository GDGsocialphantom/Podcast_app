// App logic: rendering, routing and the episode matcher.
// Data lives in data/, auth lives in auth/, the admin editor in js/admin.js. This file only reads session state through isAdmin() and session, and calls refreshSession() once on load.
const SELF_HOSTED = true; // true when this file is on your own domain: the episode page then embeds the YouTube player directly

const app = document.getElementById("app");

const showById = id => SHOWS.find(s => s.id === id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtDur = m => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
const ts = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0"); };
const hms = s => [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(x => String(x).padStart(2, "0")).join(":");
const initials = n => n.replace(/^(Judge|Dr\.)\s+/, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const yt = (id, t) => `https://www.youtube.com/watch?v=${id}${t ? "&t=" + t + "s" : ""}`;
const ytThumb = id => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`; // YouTube's og:image; hqdefault.jpg is the fallback if the video has no HD thumbnail
const sorted = () => [...EPISODES].sort((a, b) => b.date.localeCompare(a.date));

// Show logo tile: the real logo when assets/shows/<id>.png exists, otherwise a monogram in the brand color.
const showVars = s => `--show:${s.color};--show-ink:${s.ink || "#fff"}`;
function showLogo(s, cls = "") {
  return `<span class="slogo ${cls}" style="${showVars(s)}"><img src="${esc(s.logo || "")}" alt="" onerror="this.parentNode.classList.add('nologo');this.remove()"><b>${esc(initials(s.name.replace(/^The\s+/, "")))}</b></span>`;
}
// `link` false renders a span, for use inside another <a> (cards), since anchors cannot nest.
const showChip = (s, link = true) => link ? `<a class="chip show" href="#show-${s.id}" style="${showVars(s)}">${esc(s.name)}</a>` : `<span class="chip show" style="${showVars(s)}">${esc(s.name)}</span>`;
const thumbImg = (id, size = "mqdefault") => `<img src="https://i.ytimg.com/vi/${esc(id)}/${size}.jpg" alt="" loading="lazy" onerror="this.remove()">`;
function personHTML(p, show) {
  return `<div class="p"><span class="avatar" style="${showVars(show)}">${esc(initials(p.n))}</span><span>${esc(p.n)}<small>${esc(p.r)}</small></span></div>`;
}
// Episode card for the grids. `extra` is an optional line under the title (match reasons on Find).
function epCard(e, extra = "", show = null) {
  const s = show || showById(e.show);
  return `<a class="epc" href="#${e.id}" style="${showVars(s)}">
    <span class="thumb">${thumbImg(e.youtube)}</span>
    <div class="meta">${showChip(s, false)}<span>${fmtDate(e.date)}</span><span class="dur">${fmtDur(e.duration)}</span></div>
    <h3>${esc(e.title)}</h3>
    ${extra ? `<span class="match">${extra}</span>` : ""}
    <div class="tags">${e.topics.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>
  </a>`;
}
// Row layout, kept for the admin editor's previews and show list (js/admin.js passes a draft show).
function episodeRow(e, extra = "", show = null) {
  const s = show || showById(e.show);
  return `<a class="ep" href="#${e.id}" style="${showVars(s)}">
    <span class="stripe"></span>
    <span class="ep-thumb">${thumbImg(e.youtube)}</span>
    <div class="ep-main"><div class="ep-meta">${showLogo(s, "xs")}<span class="showname">${esc(s.name)}</span><span>${esc(e.format)} · ${fmtDate(e.date)}</span><span class="dur">${fmtDur(e.duration)}</span>${extra}</div>
      <h3 class="ep-title">${esc(e.title)}</h3><p class="ep-sum">${esc(e.summary)}</p>
      <div class="topics">${e.topics.map(t => `<span>${esc(t)}</span>`).join("")}</div></div>
    <div class="people">${e.people.map(p => personHTML(p, s)).join("")}</div>
  </a>`;
}
// Listening platforms. YouTube always; Apple Podcasts and Spotify appear when a show carries `apple` / `spotify` URLs in data/shows.js.
const ICONS = {
  youtube: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>`,
  apple: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.3 19.4l.5-2.4A7.6 7.6 0 1 1 14.8 19l.5 2.4A10 10 0 0 0 12 2zm0 5.2a4.8 4.8 0 0 0-2.3 9l.4-2A2.8 2.8 0 1 1 14 14.2l.4 2a4.8 4.8 0 0 0-2.4-9zm0 4.3a1.7 1.7 0 0 0-1.7 1.8c0 .3 0 .5.1.7l.9 7.5c.1.4.3.5.7.5s.6-.1.7-.5l.9-7.5c.1-.2.1-.4.1-.7A1.7 1.7 0 0 0 12 11.5z"/></svg>`,
  spotify: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.9.2c-2.4-1.5-5.4-1.8-9-1a.6.6 0 1 1-.3-1.2c3.9-.9 7.3-.5 10 1.1.3.2.4.6.2.9zm1.2-2.7a.8.8 0 0 1-1.1.3c-2.7-1.7-6.9-2.2-10.1-1.2a.8.8 0 1 1-.5-1.5c3.7-1.1 8.3-.6 11.4 1.3.4.2.5.7.3 1.1zm.1-2.8c-3.3-2-8.7-2.1-11.8-1.2a.9.9 0 1 1-.5-1.8c3.6-1.1 9.6-.9 13.3 1.4a.9.9 0 1 1-1 1.6z"/></svg>`
};
function platformPills(show, episode) {
  const out = [`<a class="pill" href="${episode ? yt(episode.youtube) : esc(show.youtube || "https://www.youtube.com")}" target="_blank" rel="noopener">${ICONS.youtube} YouTube</a>`];
  if (show.apple) out.push(`<a class="pill light" href="${esc(show.apple)}" target="_blank" rel="noopener">${ICONS.apple} Apple Podcasts</a>`);
  if (show.spotify) out.push(`<a class="pill light" href="${esc(show.spotify)}" target="_blank" rel="noopener">${ICONS.spotify} Spotify</a>`);
  return `<div class="platforms">${out.join("")}</div>`;
}
// Topic tiles: the TOPIC_MAP families with the most episodes. Icons are a small line set keyed by family name.
const TILE_ICONS = {
  "Entrepreneurship": `<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>`,
  "Investing": `<path d="M3 17l6-6 4 4 8-8M14 7h7v7"/>`,
  "Real estate": `<path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M10 21v-6h4v6"/>`,
  "Leadership": `<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
  "Hiring": `<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M17 11h5M19.5 8.5v5"/>`,
  "AI": `<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9zM2 10h2M2 14h2M20 10h2M20 14h2M10 2v2M14 2v2M10 20v2M14 20v2"/>`,
  "Startups": `<path d="M12 2c3 3 4 7 4 11l-4 4-4-4c0-4 1-8 4-11zM8 13l-3 2 1 4 3-1M16 13l3 2-1 4-3-1"/><circle cx="12" cy="9" r="1.5"/>`,
  "Community": `<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0"/>`,
  "Social impact": `<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"/>`,
  "Climate": `<path d="M12 3a9 9 0 1 0 9 9c-4 0-7-3-7-7 0-.7.1-1.4.3-2M3 12h4M12 17v4"/>`,
  "Healthcare": `<path d="M12 4v16M4 12h16"/><rect x="3" y="3" width="18" height="18" rx="4"/>`,
  "Government": `<path d="M3 21h18M4 10h16M6 10v9M10 10v9M14 10v9M18 10v9M12 3 3 8h18z"/>`,
  "Education": `<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6"/>`,
  "Treatment courts": `<path d="M12 3v18M5 7l7-4 7 4M3 13l2-6 2 6a2 2 0 0 1-4 0zM17 13l2-6 2 6a2 2 0 0 1-4 0zM8 21h8"/>`,
  "Marketing": `<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/>`,
  "Kansas City": `<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>`
};
const tileIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TILE_ICONS[name] || `<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`}</svg>`;
function topTopics(n) {
  return Object.keys(TOPIC_MAP).map(k => {
    const set = new Set(TOPIC_MAP[k]);
    return { k, count: EPISODES.filter(e => e.topics.some(t => set.has(t))).length };
  }).filter(x => x.count).sort((a, b) => b.count - a.count || a.k.localeCompare(b.k)).slice(0, n);
}
const heroCover = `<div class="cover"><div class="cover-mark"><span class="wm">Keystone<br>Listens</span><small>Kansas City</small></div></div>`;

/* ---------- home ---------- */
let filter = "all";
const HOME_PAGE = 15;      // episodes shown in the All episodes list before "Show more"
let homeLimit = HOME_PAGE;
let revealAll = false;     // the All episodes list opens after "Discover all episodes" (or #all-episodes)
function renderHome() {
  const all = sorted();
  const latest = all[0];
  const flagged = all.filter(e => e.featured === true);
  const featured = (flagged.length ? flagged : all.filter(e => e !== latest)).slice(0, 3);
  const recent = all.slice(0, 8);
  const list = all.filter(e => filter === "all" || e.show === filter);
  const shown = list.slice(0, homeLimit);
  const tiles = topTopics(8);
  const first = SHOWS[0] || {};
  app.innerHTML = `
  <section class="hero">
    ${heroCover}
    <div><h1>Keystone Listens</h1>
      <p class="blurb">Conversations with the founders, builders and civic leaders shaping Kansas City, from the Keystone Innovation District and the shows recorded there.</p>
      <p class="sub">New episodes weekly across four shows</p>
      ${platformPills({ youtube: first.youtube, apple: first.apple, spotify: first.spotify })}</div>
  </section>
  <section class="section search"><h2>Looking for something specific?</h2>
    <form class="searchbar" id="home-search" role="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input type="search" name="q" placeholder="Search episodes by topic, guest or keyword" aria-label="Search episodes"><button class="btn" type="submit">Search</button></form></section>
  <section class="section"><div class="section-head"><h2>Browse by topic</h2><a class="pill" href="#find">Explore all topics</a></div>
    <div class="tiles">${tiles.map(t => `<a class="tile" href="#find" data-topic="${esc(t.k)}">${tileIcon(t.k)}<span><b>${esc(t.k)}</b><small>${t.count} episode${t.count === 1 ? "" : "s"}</small></span></a>`).join("")}</div></section>
  ${latest ? `<section class="section"><div class="section-head"><h2>Latest episode</h2></div>
    <a class="latest" href="#${latest.id}" style="${showVars(showById(latest.show))}"><span class="thumb">${thumbImg(latest.youtube, "maxresdefault")}</span>
      <div><div class="meta">${showChip(showById(latest.show), false)}<span>${fmtDate(latest.date)}</span><span class="dur">${fmtDur(latest.duration)}</span></div>
        <h3>${esc(latest.title)}</h3><p class="sum">${esc(latest.summary)}</p><span class="pill">Watch now</span></div></a></section>` : ""}
  ${featured.length ? `<section class="section"><div class="section-head"><h2>Featured episodes</h2></div><div class="grid c3">${featured.map(e => epCard(e)).join("")}</div></section>` : ""}
  <section class="section"><div class="section-head"><h2>Recent episodes</h2></div>
    ${recent.length ? `<div class="grid c4">${recent.map(e => epCard(e)).join("")}</div>` : `<p class="empty">No episodes yet. The first one is coming soon.</p>`}
    <div class="section-foot" id="discover-row" ${revealAll ? "hidden" : ""}><button class="pill" id="discover" type="button">Discover all episodes</button></div></section>
  <section class="section" id="all-episodes" ${revealAll ? "" : "hidden"}>
    <div class="section-head"><h2>All episodes</h2>
      <div class="filters">${[["all", "All shows"], ...SHOWS.map(s => [s.id, s.name])].map(([id, n]) => `<button class="chip" data-filter="${id}" aria-pressed="${filter === id}">${esc(n)}</button>`).join("")}</div></div>
    <div class="grid c4" id="home-list">${list.length ? shown.map(e => epCard(e)).join("") : `<p class="empty">No episodes yet for ${esc((showById(filter) || { name: "this show" }).name)}. First one is coming soon.</p>`}</div>
    ${list.length > shown.length ? `<div class="more-row"><button class="btn ghost" id="home-more">Show more</button><span class="eyebrow">${shown.length} of ${list.length} episodes</span></div>` : ""}
  </section>`;
  document.getElementById("home-search").onsubmit = ev => { ev.preventDefault(); openFind(ev.target.q.value.trim()); };
  app.querySelectorAll(".tile[data-topic]").forEach(t => t.onclick = ev => { ev.preventDefault(); openFind("", [t.dataset.topic]); });
  const disc = document.getElementById("discover");
  if (disc) disc.onclick = () => { revealAll = true; document.getElementById("discover-row").hidden = true; const sec = document.getElementById("all-episodes"); sec.hidden = false; sec.scrollIntoView({ behavior: "smooth", block: "start" }); };
  app.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { filter = b.dataset.filter; homeLimit = HOME_PAGE; revealAll = true; renderHome(); document.getElementById("all-episodes").scrollIntoView({ block: "start" }); });
  const more = document.getElementById("home-more");
  if (more) more.onclick = () => {   // append the next page in place so the scroll position holds
    const next = list.slice(homeLimit, homeLimit + HOME_PAGE);
    homeLimit += HOME_PAGE;
    document.getElementById("home-list").insertAdjacentHTML("beforeend", next.map(e => epCard(e)).join(""));
    const row = more.parentNode;
    if (homeLimit >= list.length) row.remove(); else row.querySelector(".eyebrow").textContent = `${Math.min(homeLimit, list.length)} of ${list.length} episodes`;
  };
  setNav("#home");
}
// Open Find with a query and/or topics prefilled; runs the match when there is anything to match on.
let findAuto = false;
function openFind(q, topics) {
  prefs = { ...prefs, free: q || "", topics: topics || [] };
  findAuto = !!(q || (topics && topics.length));
  if (location.hash === "#find") { renderFind(findAuto); findAuto = false; } else location.hash = "#find";
}

/* ---------- find (form + results) ---------- */
// Checkbox list for the Find form: the TOPIC_MAP families first, then any episode tag with 3 or more episodes
// that no family covers, by episode count. An uncovered tag maps to itself in the matcher.
const TOPIC_MIN = 3;
function buildTopics() {
  const covered = new Set(Object.values(TOPIC_MAP).flat());
  const counts = {};
  EPISODES.forEach(e => e.topics.forEach(t => { if (!covered.has(t)) counts[t] = (counts[t] || 0) + 1; }));
  const extra = Object.keys(counts).filter(t => counts[t] >= TOPIC_MIN && !(t in TOPIC_MAP)).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  return Object.keys(TOPIC_MAP).concat(extra);
}
const TOPIC_MAP = {
  "Entrepreneurship": ["Side business", "Franchising", "Startups", "Product", "Leaving corporate", "Wealth building", "Entrepreneurship", "Founder stories", "Founder mindset", "Founder advice", "Founder lessons", "Small business", "Immigrant founders", "Women founders", "Black entrepreneurship", "Scaling", "Building in public", "Resilience"],
  "Investing": ["Investing", "Index funds", "Real estate", "Wealth building", "Financing", "Venture capital", "Raising capital", "Startup funding", "Impact investing", "Capital", "Angel investing"],
  "Real estate": ["Real estate", "Affordable housing", "Urban development", "Community development", "Gentrification", "Sustainable building"],
  "Leadership": ["Leadership", "Company culture", "Communication", "Creative leadership", "Corporate innovation", "Corporate responsibility", "Mentorship", "Decision making", "Women in leadership", "Civic leadership"],
  "Hiring": ["Hiring", "Company culture", "Workforce", "Talent", "Gen Z", "Diversity and inclusion", "Black professionals", "Workplace", "Representation", "Diversity", "Equity", "Gender equity", "Women in tech"],
  "AI": ["AI", "AI in courts", "Technology", "Court data", "AI infrastructure", "Data centers", "Robotics", "Future of work", "Emerging tech", "Data analytics", "Data visualization", "Business analytics", "Data privacy", "Blockchain", "Web3", "VR", "Digital divide", "Digital equity", "Technology access"],
  "Startups": ["Startups", "Product", "CoFoundry", "Side business", "Startup ecosystem", "Ecosystem building", "Innovation economy", "Accelerators", "Startup programs", "Social Venture Studio", "Founder stories"],
  "Community": ["Community", "Community development", "Black community", "Food access", "Social Venture Studio", "Creative economy", "Music", "Arts", "Collaboration", "Nonprofits"],
  "Social impact": ["Social impact", "Social entrepreneurship", "Social enterprise", "Social Venture Studio", "Affordable housing", "Homelessness", "Food access", "Mental health access", "Disability", "Accessibility", "Justice reform", "Impact investing"],
  "Climate": ["Climate", "Climate tech", "Refrigerants", "Nuclear energy", "Energy", "Sustainable fashion", "Circular economy", "Sustainability", "Sustainable infrastructure", "Sustainable building", "Electric vehicles"],
  "Healthcare": ["Healthcare", "Medical devices", "Clinical trials", "Medical records", "Digital health", "Animal health", "Autism", "Aging in place", "Health innovation", "Biotech", "Pediatric innovation"],
  "Government": ["Government", "Civic tech", "Civic innovation", "Smart cities", "GovTech", "Democracy", "Policy", "Entrepreneurship policy", "National security", "Missouri"],
  "Education": ["Education", "Tech education", "STEM education", "Youth", "Workforce", "Music", "Design thinking", "Research commercialization"],
  "Treatment courts": ["Treatment courts", "Recidivism", "Court funding", "Participants", "Families", "Court process", "Justice reform", "Court data", "Crime prevention", "Mass incarceration"],
  "Marketing": ["Marketing", "Brand", "B2B marketing", "Influencer marketing", "Social media", "TikTok", "Digital marketing", "Content", "Creative leadership"],
  "Kansas City": ["Kansas City", "Johnson County", "CoFoundry", "Logistics", "Economic development", "Sports", "Midwest", "Women in sports", "Supply chain", "Logistics"]
};
const TOPICS = buildTopics();
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
  const tile = v => `<label class="tile"><input type="checkbox" name="topics" value="${esc(v)}" id="topics-${v.replace(/\W/g, "")}" ${prefs.topics.includes(v) ? "checked" : ""}>${tileIcon(v)}<b>${esc(v)}</b></label>`;
  let results = "";
  if (showResults) {
    const ranked = EPISODES.map(e => ({ e, ...score(e) })).filter(r => r.pts > 0).sort((a, b) => b.pts - a.pts || b.e.date.localeCompare(a.e.date)).slice(0, 6);
    results = `<section id="results"><div class="results-head"><h2>${ranked.length ? "Your picks" : "Nothing matched everything"}</h2><span class="eyebrow">${ranked.length} episode${ranked.length === 1 ? "" : "s"}</span></div>
      ${ranked.length ? `<div class="grid c3">${ranked.map(r => epCard(r.e, "Match: " + (r.why.join(" · ") || "recent"))).join("")}</div>` : `<p class="empty">Try fewer topics or set the time window to "Any length".</p>`}</section>`;
  }
  app.innerHTML = `<div class="findpage">
  <header><h1>Find an episode</h1><p>Tell us what you want to hear and we will pick from every show.</p></header>
  <form class="form-card" id="find-form">
    <div class="searchbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input type="search" name="free" id="free" value="${esc(prefs.free)}" placeholder="Search by topic, guest or keyword" aria-label="Search"><button class="btn" type="submit">Search</button></div>
    <fieldset><legend>Topics you're interested in</legend><div class="choices tiles">${TOPICS.map(tile).join("")}</div></fieldset>
    <fieldset><legend>How much time do you have?</legend><div class="choices">${[["any", "Any length"], ["short", "Under 25 min"], ["medium", "25 to 50 min"], ["long", "Over 50 min"]].map(([v, l]) => chk("time", v, l)).join("")}</div></fieldset>
    <fieldset><legend>How do you like to listen?</legend><div class="choices">${[["any", "Doesn't matter"], ["Interview", "One-on-one interview"], ["Panel", "Group conversation"], ["Solo", "Solo host"], ["Talk", "Live talk"]].map(([v, l]) => chk("format", v, l)).join("")}</div></fieldset>
    <fieldset><legend>Any particular show?</legend><div class="choices">${[["any", "Any show"], ...SHOWS.map(s => [s.id, s.name])].map(([v, l]) => chk("show", v, l)).join("")}</div></fieldset>
    <div><button class="btn" type="submit">Show me episodes</button></div>
  </form>
  ${results}</div>`;
  const form = document.getElementById("find-form");
  form.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    prefs = { topics: fd.getAll("topics"), time: fd.get("time"), format: fd.get("format"), show: fd.get("show"), free: fd.get("free") || "" };
    renderFind(true);
    document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (showResults && document.getElementById("results") && findAuto) document.getElementById("results").scrollIntoView({ block: "start" });
  setNav("#find");
}

/* ---------- show page ---------- */
const SHOW_PAGE = 12;
let showLimit = SHOW_PAGE;
function renderShow(id) {
  const s = showById(id); if (!s) return renderHome();
  const list = sorted().filter(e => e.show === id);
  const shown = list.slice(0, showLimit);
  app.innerHTML = `
  <section class="hero showhero" style="${showVars(s)}">
    <div class="cover">${showLogo(s, "lg")}</div>
    <div><div class="chipline">${showChip(s)}<span class="chip type">${esc(s.org)}</span>${isAdmin() ? `<a class="editbtn" href="#admin-edit-show-${s.id}">Edit show</a>` : ""}</div>
      <h1>${esc(s.name)}</h1>
      <p class="blurb">${esc(s.tagline)}</p>
      <p class="sub">${esc(s.about)}</p>
      ${platformPills(s)}
      <p class="hosts">Hosted by ${esc(s.hosts.join(", "))} · ${list.length} episode${list.length === 1 ? "" : "s"}</p></div>
  </section>
  <section class="section"><div class="section-head"><h2>Recent episodes</h2></div>
    ${list.length ? `<div class="grid c4" id="show-list">${shown.map(e => epCard(e)).join("")}</div>` : `<p class="empty">No episodes yet. The first one is coming soon.</p>`}
    ${list.length > shown.length ? `<div class="more-row"><button class="btn ghost" id="show-more">Show more</button><span class="eyebrow">${shown.length} of ${list.length} episodes</span></div>` : ""}
  </section>`;
  const more = document.getElementById("show-more");
  if (more) more.onclick = () => {
    const next = list.slice(showLimit, showLimit + SHOW_PAGE);
    showLimit += SHOW_PAGE;
    document.getElementById("show-list").insertAdjacentHTML("beforeend", next.map(e => epCard(e)).join(""));
    const row = more.parentNode;
    if (showLimit >= list.length) row.remove(); else row.querySelector(".eyebrow").textContent = `${Math.min(showLimit, list.length)} of ${list.length} episodes`;
  };
  setNav("#show-" + id);
}

/* ---------- about ---------- */
function renderAbout() {
  app.innerHTML = `<div class="about">
    <h1>About Keystone Listens</h1>
    <p>Keystone Listens is the home for every podcast recorded at or with the Keystone Innovation District in Kansas City: one place to watch the latest episode, search across shows, and find something to listen to by topic.</p>
    <p>Episodes are published on YouTube first. Transcripts and show notes are added as they become available.</p>
    <h2>The shows</h2>
    <div class="showlist">${SHOWS.map(s => `<a href="#show-${s.id}" style="${showVars(s)}">${showLogo(s, "sm")}<span><b>${esc(s.name)}</b><small>${esc(s.tagline)}</small></span></a>`).join("")}</div>
    <p>Keystone Innovation District · 800 E 18th St, Kansas City, MO</p>
  </div>`;
  setNav("#about");
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
    : `<a class="video" href="${yt(e.youtube)}" target="_blank" rel="noopener"><img class="thumb" src="${ytThumb(e.youtube)}" alt="" onerror="if(!this.dataset.hq){this.dataset.hq=1;this.src='https://i.ytimg.com/vi/${e.youtube}/hqdefault.jpg'}else{this.remove()}"><span class="pb"><svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></span><span class="cap">Watch on YouTube · ${fmtDur(e.duration)}</span></a>`;
  const n = e.notes || {}, has = a => Array.isArray(a) && a.length > 0; // notes and each section are optional (see tools/check-data.js)
  const cueHTML = c => `<div class="cue" data-text="${esc(c.x.toLowerCase())}"><a class="t" href="${yt(e.youtube, c.t)}" target="_blank" rel="noopener" title="Open the video at ${ts(c.t)}">${ts(c.t)}</a><span class="sp">${esc(c.s)}</span><p>${esc(c.x)}</p></div>`;
  app.innerHTML = `<article class="epage" style="${showVars(s)}">
    <a class="back" href="#show-${s.id}">← ${esc(s.name)}</a>
    <div class="meta">${showChip(s)}<span class="chip type">${esc(e.format)}</span><span>${fmtDate(e.date)}</span><span class="dur">${fmtDur(e.duration)}</span></div>
    <div class="ep-title-row"><h1>${esc(e.title)}</h1>${isAdmin() ? `<a class="editbtn" href="#admin-edit-${e.id}">Edit episode</a>` : ""}</div>
    <div class="player">${video}</div>
    ${platformPills(s, e)}
    <div class="tabs" role="tablist">
      <button type="button" role="tab" aria-selected="true" data-tab="notes">Show Notes</button>
      <button type="button" role="tab" aria-selected="false" data-tab="chapters">Timestamps</button>
      <button type="button" role="tab" aria-selected="false" data-tab="transcript">Transcript</button></div>
    <section class="panel" id="panel-notes">
      <div><p class="sum">${esc(e.summary)}</p></div>
      ${has(n.takeaways) ? `<div><h2>Takeaways</h2><ul>${n.takeaways.map(t => `<li>${esc(t)}</li>`).join("")}</ul>${n.generated === true ? `<p class="gen">Generated from the transcript</p>` : ""}</div>` : ""}
      ${has(n.links) ? `<div><h2>Links</h2><ul>${n.links.map(([x, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(x)}</a></li>`).join("")}</ul></div>` : ""}
      <div><h2>In this episode</h2><div class="people-list">${e.people.map(p => personHTML(p, s)).join("")}</div></div>
      ${e.topics.length ? `<div><h2>Topics</h2><div class="tags">${e.topics.map(t => `<span class="tag">${esc(t)}</span>`).join(" ")}</div></div>` : ""}
    </section>
    <section class="panel" id="panel-chapters" hidden>
      ${has(n.chapters) ? `<div class="chapters">${n.chapters.map(([t, x]) => `<div class="chap"><a href="${yt(e.youtube, t)}" target="_blank" rel="noopener">${hms(t)}</a><span>${esc(x)}</span></div>`).join("")}</div>` : `<p class="tx-empty">No timestamps for this episode yet.</p>`}
    </section>
    <section class="panel" id="panel-transcript" hidden>
      <div><div class="tx-head"><h2>Transcript</h2><input class="tx-search" id="tx-search" type="search" placeholder="Search this transcript"></div>
      <div class="tx" id="tx"><p class="tx-empty">Transcript coming soon.</p></div></div>
    </section>
    <section class="keep"><h2>Keep listening</h2><p class="lead">More on ${e.topics.slice(0, 2).map(esc).join(" and ")}, across all shows</p>
      <div class="grid c3">${pick.slice(0, 3).map(r => epCard(r.x, (r.x.show !== e.show ? "Different show · " : "") + (r.shared.length ? "also covers " + r.shared.slice(0, 2).join(", ") : "related: " + r.famShared.slice(0, 2).join(", ")))).join("")}</div></section>
  </article>`;
  app.querySelectorAll(".tabs [data-tab]").forEach(btn => btn.onclick = () => {
    app.querySelectorAll(".tabs [data-tab]").forEach(b => b.setAttribute("aria-selected", b === btn));
    app.querySelectorAll(".panel").forEach(p => p.hidden = p.id !== "panel-" + btn.dataset.tab);
  });
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
  // Both fetches revalidate (cache: "no-cache") because GitHub Pages caches files for 10 minutes; a 304 is cheap and new transcripts show up on the next visit.
  // Transcripts are fetched on GitHub by tools/fetch-transcripts.js, never from the browser. data/transcript-status.json
  // says which episodes have been checked and found to have no captions, so the page can say so instead of "coming soon".
  const txUrl = `data/transcripts/${encodeURIComponent(e.id)}.json`;
  if (location.protocol !== "file:") fetch(txUrl, { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(cues => {
    if (location.hash.slice(1) !== e.id) return; // user already navigated away
    if (Array.isArray(cues) && cues.length) { tx.innerHTML = cues.map(cueHTML).join(""); if (search.value) search.oninput(); return; }
    return transcriptStatus().then(st => {
      const mine = st && st.episodes && st.episodes[e.id];
      if (mine && (mine.status === "no_captions" || mine.status === "credits_exhausted") && location.hash.slice(1) === e.id) tx.innerHTML = `<p class="tx-empty">No transcript available for this episode.</p>`;
    });
  }).catch(err => console.warn("transcript: could not load " + txUrl, err));
  setNav(null);
  window.scrollTo({ top: 0 });
}

let txStatusCache = null;
function transcriptStatus() {   // data/transcript-status.json, fetched once per page load
  if (!txStatusCache) txStatusCache = fetch("data/transcript-status.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
  return txStatusCache;
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
  if (h === "admin-transcripts") return renderAdmin("transcripts");
  if (h.startsWith("admin-edit-show-")) return renderAdmin("show", h.slice(16));
  if (h.startsWith("admin-edit-")) return renderAdmin("episode", h.slice(11));
  if (h === "home" || h === "") return renderHome();
  if (h === "find") { const auto = findAuto; findAuto = false; return renderFind(auto); }
  if (h === "about") return renderAbout();
  if (h === "all-episodes") { revealAll = true; renderHome(); document.getElementById("all-episodes").scrollIntoView(); return; }
  if (h === "shows") return renderAbout();
  if (h.startsWith("show-")) { showLimit = SHOW_PAGE; return renderShow(h.slice(5)); }
  const e = EPISODES.find(x => x.id === h);
  if (e) return renderEpisode(e);
  renderHome();
}
window.addEventListener("hashchange", () => { window.scrollTo({ top: 0 }); route(); });
renderChrome();
route();
refreshSession();   // confirm the cached session with the backend; re-renders if it changed (login, logout elsewhere, expiry)
