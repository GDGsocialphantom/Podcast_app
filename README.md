# Keystone Listens

Podcast hub for The Disruption Lab, The EKO System, Court Ordered and Keystone Sessions. A static site, no build step.

```
index.html            page shell (header, main, footer) and the script/style tags
css/site.css          site styles
css/admin.css         admin editor styles
js/app.js             rendering, routing and the "find something to listen to" matcher
js/admin.js           admin editor: episode and show forms that generate code for data/ (nothing saves from the browser)
data/shows.js         the four shows
data/episodes.js      every episode, with transcript and show notes
auth/                 login, sessions, admin role and the user store (see auth/README.md)
tools/transcribe.py   turns an episode's audio into transcript JSON
tools/check-data.js   validates the data files; runs on every push via GitHub Actions
```

Where to look when something breaks:
- Page is blank or an episode is missing: `data/` and `node tools/check-data.js`
- Layout or styling: `css/site.css`
- Login, log out, admin bar, edit buttons: `auth/`
- Add episode / Edit show forms: `js/admin.js`
- Anything else on the page: `js/app.js`

## Add an episode
1. Log in as admin and open Add episode. Fill in the form; it generates the episode object and checks it as you type. Copy the output and paste it at the top of the `EPISODES` array in `data/episodes.js`. (Or copy any episode object in the file by hand.)
2. Run `python tools/transcribe.py episode.mp3 --notes` (needs `OPENAI_API_KEY`, `pip install openai`) and paste the output JSON into the form's Transcript field; it fills the notes fields too.
3. Run `node tools/check-data.js`. It catches missing fields, bad dates, unknown show ids and out-of-order transcript cues.
4. Commit to `main`. GitHub Pages redeploys in about a minute.

## Test locally
Run `python -m http.server` in the repo folder and open http://localhost:8000. Errors show up in the browser console with the file and line. Development login accounts are listed on the login page and in `auth/users.js`.

## Hosting
Served by GitHub Pages from the `main` branch root. Thumbnails come from YouTube's og image for each video id; the episode page embeds the YouTube player.
