// Shows. Each episode in data/episodes.js references a show by its id.
// Colors are CSS variables defined in css/site.css.
const SHOWS = [
  { id: "eko", name: "The EKO System", color: "var(--eko)", org: "Black Excellence Inc.",
    tagline: "Build the system that builds you. No fluff. Just game.",
    hosts: ["Craig Moore II", "Craig Smith", "Erica Taylor-Murff"],
    about: "Entrepreneurship, investing and building wealth outside the 9 to 5, for Black professionals in the KC metro." },
  { id: "court", name: "Court Ordered", color: "var(--court)", org: "Magis",
    tagline: "What actually happens inside treatment courts, and how to fix it.",
    hosts: ["Judge Courtney Wachal"],
    about: "A sitting municipal judge on treatment courts, recidivism, court funding and the data that could change all three." },
  { id: "sessions", name: "Keystone Sessions", color: "var(--sessions)", org: "Keystone CoLAB",
    tagline: "Wednesday night talks from the people building Kansas City.",
    hosts: ["Keystone CoLAB"],
    about: "Recorded live at Keystone CoLAB every Wednesday: three talks at 5, 6 and 7 pm from founders, builders and operators." }
];
