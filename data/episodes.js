// Episodes. Copy any object to add one; the site sorts by date.
// Transcripts and notes come from tools/transcribe.py. Run `node tools/check-data.js` before committing.
const EPISODES = [
  { id: "eko-012", show: "eko", format: "Panel", date: "2026-09-25", duration: 54,
    title: "The Side Business Tax Playbook Nobody Gave You",
    summary: "The three hosts walk through entity choice, quarterly estimates and the write-offs first-time owners leave on the table.",
    topics: ["Side business", "Taxes", "Entity setup", "Cash flow"],
    people: [{ n: "Craig Moore II", r: "Host" }, { n: "Craig Smith", r: "Co-host" }, { n: "Erica Taylor-Murff", r: "Co-host" }],
    youtube: "dQw4w9WgXcQ",
    transcript: [
      { t: 0, s: "Craig Moore II", x: "Welcome back to The EKO System. Today is the tax episode, and I know half of you just groaned, but this is the one that pays for itself." },
      { t: 41, s: "Erica Taylor-Murff", x: "The number one question I get from people starting a side business is LLC or not. And the answer is it depends on what you are protecting." },
      { t: 118, s: "Craig Smith", x: "Let's talk quarterly estimates, because the first year is where people get the surprise bill in April." },
      { t: 402, s: "Craig Moore II", x: "Here is the list. Home office, mileage, that laptop, the software you already pay for. Write it down, keep the receipt, move on." },
      { t: 1560, s: "Erica Taylor-Murff", x: "If you take one thing from this episode: open a separate bank account this week. Everything else gets easier." },
      { t: 3100, s: "Craig Moore II", x: "That's the game. Full checklist is on Patreon. See you in two weeks." }
    ],
    notes: {
      takeaways: ["Separate business banking is the first move, before any entity paperwork", "Quarterly estimates matter from year one, not once you are profitable", "The common write-offs most first-time owners miss"],
      chapters: [[0, "Why the tax episode"], [41, "LLC or sole prop"], [118, "Quarterly estimates"], [402, "Write-offs checklist"], [1560, "One thing to do this week"]],
      links: [["Patreon: full tax checklist", "https://www.patreon.com"], ["Missouri LLC filing", "https://www.sos.mo.gov"]]
    } },
  { id: "eko-011", show: "eko", format: "Interview", date: "2026-09-11", duration: 38,
    title: "From Corporate Sales to Three Franchise Locations",
    summary: "A Johnson County franchise owner on the year he kept his day job, how he financed location one, and what he would skip.",
    topics: ["Franchising", "Financing", "Leaving corporate", "Johnson County"],
    people: [{ n: "Craig Moore II", r: "Host" }, { n: "Marcus Bell", r: "Guest · franchise owner (sample)" }],
    youtube: "dQw4w9WgXcQ",
    transcript: [
      { t: 0, s: "Craig Moore II", x: "This is a solo host episode, and my guest today ran enterprise sales for nine years before buying his first franchise." },
      { t: 95, s: "Marcus Bell", x: "I kept the job for fourteen months after signing. People think that is cheating. It is how I slept at night." },
      { t: 620, s: "Marcus Bell", x: "SBA 7(a) covered about seventy percent. The rest was savings and one uncomfortable family conversation." },
      { t: 1900, s: "Craig Moore II", x: "What would you skip if you did it again?" },
      { t: 1912, s: "Marcus Bell", x: "The second location came too fast. I would have waited another year and hired a GM first." }
    ],
    notes: {
      takeaways: ["Keeping a salary through the first year of a franchise is a strategy, not a failure", "SBA 7(a) loans and what they do and don't cover", "Hire a general manager before opening location two"],
      chapters: [[0, "Nine years in sales"], [95, "Keeping the day job"], [620, "How location one was financed"], [1900, "What to skip"]],
      links: [["SBA 7(a) loan overview", "https://www.sba.gov"]]
    } },
  { id: "eko-010", show: "eko", format: "Panel", date: "2026-08-28", duration: 61,
    title: "Index Funds, Real Estate or Your Own Business: Where the First $10K Goes",
    summary: "The hosts disagree on purpose. A full-group episode on the first real investing decision for people earning $60K to $150K.",
    topics: ["Investing", "Real estate", "Index funds", "Wealth building"],
    people: [{ n: "Craig Moore II", r: "Host" }, { n: "Craig Smith", r: "Co-host" }, { n: "Erica Taylor-Murff", r: "Co-host" }],
    youtube: "dQw4w9WgXcQ",
    transcript: [
      { t: 0, s: "Craig Moore II", x: "We are going to argue today. That's the format. First ten thousand dollars, where does it go." },
      { t: 210, s: "Craig Smith", x: "Boring answer wins. Max the match, then a total market fund. You can get creative after that." },
      { t: 880, s: "Erica Taylor-Murff", x: "I'm the real estate person on this panel and even I am saying: not with your first ten." }
    ],
    notes: {
      takeaways: ["Employer match first, every time", "Real estate needs a bigger cushion than most first-timers think", "Investing in your own business is a bet on your time, so price it that way"],
      chapters: [[0, "The setup"], [210, "The boring answer"], [880, "Real estate, honestly"]],
      links: []
    } },

  { id: "court-006", show: "court", format: "Interview", date: "2026-09-22", duration: 47,
    title: "What a Treatment Court Costs, and What It Saves",
    summary: "A court administrator breaks down the real per-participant cost of a drug court against the cost of a jail bed, and why the numbers rarely reach the people who set budgets.",
    topics: ["Treatment courts", "Court funding", "Recidivism", "Public data"],
    people: [{ n: "Judge Courtney Wachal", r: "Host" }, { n: "Dana Okafor", r: "Guest · court administrator (sample)" }],
    youtube: "dQw4w9WgXcQ",
    transcript: [
      { t: 0, s: "Courtney Wachal", x: "I sit in a domestic violence court every week and I still could not tell you, to the dollar, what one participant costs us. That's the problem this show exists to fix." },
      { t: 130, s: "Dana Okafor", x: "Nationally the range is roughly four to eight thousand a year per participant. A jail bed in most Missouri counties is north of thirty." },
      { t: 990, s: "Dana Okafor", x: "The savings show up in a different department's budget three years later. Nobody claims them, so nobody funds the program." },
      { t: 2400, s: "Courtney Wachal", x: "So the fix is not more money. It is being able to show the money." }
    ],
    notes: {
      takeaways: ["Per-participant cost versus incarceration cost, with the ranges actually used in budget conversations", "Why savings land in a different budget than the spend", "What a court would need to track to make the case itself"],
      chapters: [[0, "Why the numbers are invisible"], [130, "Cost per participant"], [990, "Where the savings go"], [2400, "Showing the money"]],
      links: [["Magis", "https://www.magis.ai"], ["NADCP treatment court standards", "https://allrise.org"]]
    } },
  { id: "court-005", show: "court", format: "Solo", date: "2026-09-08", duration: 22,
    title: "Five Things I Wish Every First-Time Participant Knew",
    summary: "A short solo episode for people about to enter a treatment court program, and for the families walking in with them.",
    topics: ["Treatment courts", "Participants", "Families", "Court process"],
    people: [{ n: "Judge Courtney Wachal", r: "Host" }],
    youtube: "dQw4w9WgXcQ",
    transcript: [
      { t: 0, s: "Courtney Wachal", x: "Short one today. No guest. Five things I say from the bench that I wish people had heard before they walked in." },
      { t: 60, s: "Courtney Wachal", x: "One. Showing up is most of it. I mean that literally. Attendance is the strongest predictor we have." },
      { t: 700, s: "Courtney Wachal", x: "Five. Bring someone. The people who graduate almost always had one person in the gallery." }
    ],
    notes: {
      takeaways: ["Attendance predicts completion more than anything else", "Sanctions are structured, not personal", "Bring a support person to hearings"],
      chapters: [[0, "Why this episode"], [60, "Showing up"], [700, "Bring someone"]],
      links: []
    } },
  { id: "court-004", show: "court", format: "Interview", date: "2026-08-25", duration: 55,
    title: "Can a Dashboard Change a Sentence? Data Inside the Courtroom",
    summary: "Magis co-founder Thaddeus Diamond on what courts currently record, what they throw away, and what a judge could see at the bench if the data were there.",
    topics: ["Court data", "AI in courts", "Recidivism", "Technology"],
    people: [{ n: "Judge Courtney Wachal", r: "Host" }, { n: "Thaddeus Diamond", r: "Guest · Magis co-founder" }],
    youtube: "dQw4w9WgXcQ",
    transcript: [
      { t: 0, s: "Courtney Wachal", x: "My co-founder is on today, which means we are going to disagree in public." },
      { t: 300, s: "Thaddeus Diamond", x: "Most courts already collect what they need. It is in three systems that do not talk to each other and one filing cabinet." },
      { t: 1500, s: "Thaddeus Diamond", x: "The goal is not for a model to recommend a sentence. It is for a judge to see one screen instead of six." }
    ],
    notes: {
      takeaways: ["Courts collect more than they can use", "The realistic role of software at the bench", "What pilot courts are asking for first"],
      chapters: [[0, "Disagreeing in public"], [300, "What courts already record"], [1500, "One screen, not six"]],
      links: [["Magis", "https://www.magis.ai"]]
    } },

  { id: "sess-0923", show: "sessions", format: "Talk", date: "2026-09-23", duration: 48,
    title: "How JE Dunn Builds a Building Before It Exists",
    summary: "JE Dunn's Evan Fox and Dylan Lowder on virtual design and construction: the digital twin, clash detection, and what changes when the whole crew can see the model on site.",
    topics: ["Construction tech", "Virtual design", "Architecture", "Kansas City"],
    people: [{ n: "Evan Fox", r: "Principal Architect, JE Dunn" }, { n: "Dylan Lowder", r: "VDC Director, JE Dunn" }],
    youtube: "dQw4w9WgXcQ",
    transcript: [
      { t: 0, s: "Evan Fox", x: "Thanks for having us. Dylan is going to show you a building we finished last year, and then the version of it we built first, on a screen." },
      { t: 420, s: "Dylan Lowder", x: "Clash detection sounds boring until you realize every clash we catch here is a change order we do not write later." },
      { t: 1800, s: "Evan Fox", x: "The model on a tablet in a foreman's hand changed more about our job sites than any tool in the last twenty years." }
    ],
    notes: {
      takeaways: ["Why the digital model gets built before the physical one", "Clash detection as change-order prevention", "Field crews using the model on site"],
      chapters: [[0, "Intro"], [420, "Clash detection"], [1800, "The model in the field"]],
      links: [["JE Dunn", "https://www.jedunn.com"], ["Keystone Sessions schedule", "https://www.keystonekc.org"]]
    } },
  { id: "sess-0812", show: "sessions", format: "Talk", date: "2026-08-12", duration: 41,
    title: "John Austin on Building Companies People Actually Want to Work For",
    summary: "A 5 pm Session on culture as an operating system: hiring, the first ten employees, and the rituals that survive growth.",
    topics: ["Leadership", "Hiring", "Company culture", "Startups"],
    people: [{ n: "John Austin", r: "Speaker" }],
    youtube: "dQw4w9WgXcQ",
    transcript: [
      { t: 0, s: "John Austin", x: "Every founder says culture matters. Almost none of them can tell me what their culture does on a Tuesday." },
      { t: 900, s: "John Austin", x: "The first ten hires are your culture. Everyone after that is inheriting it." }
    ],
    notes: {
      takeaways: ["Culture is what your company does on an ordinary day", "The first ten hires set it", "Rituals that survive from 10 to 100 people"],
      chapters: [[0, "What culture does on a Tuesday"], [900, "The first ten hires"]],
      links: []
    } },
  { id: "sess-0909", show: "sessions", format: "Talk", date: "2026-09-09", duration: 36,
    title: "Shipping an AI Product With a Team of Two",
    summary: "A Keystone CoFoundry member walks through the stack, the costs and the mistakes behind getting an AI product to its first fifty paying customers.",
    topics: ["AI", "Startups", "Product", "CoFoundry"],
    people: [{ n: "Priya Natarajan", r: "Founder, CoFoundry member (sample)" }],
    youtube: "dQw4w9WgXcQ",
    transcript: [
      { t: 0, s: "Priya Natarajan", x: "We are two people. Here is exactly what we pay every month and what we would cut first." },
      { t: 1100, s: "Priya Natarajan", x: "Our first fifty customers came from nine conversations at this building. That is the whole growth strategy." }
    ],
    notes: {
      takeaways: ["A real monthly cost breakdown for a two-person AI product", "Where the first fifty customers came from", "What to cut when runway gets short"],
      chapters: [[0, "The stack and the bill"], [1100, "First fifty customers"]],
      links: [["CoFoundry", "https://www.keystonekc.org"]]
    } }
];
