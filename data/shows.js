// Shows. Each episode in data/episodes.js references a show by its id.
// Branding per show:
//   color  the show's brand color (hex). Used for stripes, avatars, the show page band and the sidebar dot.
//   ink    text color that reads on top of `color` (white or near-black).
//   logo   path to the show's logo, square or wide, PNG or SVG with transparency. Drop the file in assets/shows/.
//          If the file is missing the site shows a monogram tile in the brand color instead, so nothing breaks.
//   youtube  { playlist, autoImport }: the playlist the daily importer reads for new episodes (a channel's uploads playlist
//            UU... or a named playlist PL...); autoImport false, or an empty playlist, means the importer skips the show.
const SHOWS = [
  { id: "disruption", name: "The Disruption Lab", color: "#181B41", ink: "#FFFFFF", logo: "assets/shows/disruption.png", org: "Keystone Innovation District",
    tagline: "Disruption isn't a trend, it's a mindset.",
    hosts: ["Kevin McGinnis"],
    about: "Founders, thinkers and change-makers on how they're shaking up industries, improving communities and building what's next. Unscripted, unfiltered, and often recorded live at Keystone Sessions.",
    youtube: { playlist: "PL79s92JUJmRMr-oTVX0SSH10CoYGmTsyU", autoImport: true } },
  { id: "eko", name: "The EKO System", color: "#BFD730", ink: "#1F2A00", logo: "assets/shows/eko.png", org: "Black Excellence Inc.",
    tagline: "Build the system that builds you. No fluff. Just game.",
    hosts: ["Craig Moore II", "Craig Smith", "Erica Taylor-Murff"],
    about: "Entrepreneurship, investing and building wealth outside the 9 to 5, for Black professionals in the KC metro.",
    youtube: { playlist: "UUe5jHdr7RCKLD5h7UFd_GYA", autoImport: true } },
  { id: "court", name: "Court Ordered", color: "#1E3A5F", ink: "#FFFFFF", logo: "assets/shows/court.png", org: "Magis",
    tagline: "What actually happens inside treatment courts, and how to fix it.",
    hosts: ["Judge Courtney Wachal"],
    about: "A sitting municipal judge on treatment courts, recidivism, court funding and the data that could change all three.",
    youtube: { playlist: "", autoImport: false } },
  { id: "sessions", name: "Keystone Sessions", color: "#76CED9", ink: "#0F2F33", logo: "assets/shows/sessions.png", org: "Keystone CoLAB",
    tagline: "Wednesday night talks from the people building Kansas City.",
    hosts: ["Keystone CoLAB"],
    about: "Recorded live at Keystone CoLAB every Wednesday: three talks at 5, 6 and 7 pm from founders, builders and operators.",
    youtube: { playlist: "UUW6FhzluqAlvkWrObXiWpcA", autoImport: true } },
];
