# Keystone Listens

Podcast hub for The EKO System, Court Ordered and Keystone Sessions. One static page, no build step.

- `index.html` is the whole site. Shows and episodes live in the DATA block at the top of the `<script>`.
- `transcribe.py` turns an episode's audio into transcript JSON for that block (needs `OPENAI_API_KEY`, `pip install openai`).

## Add an episode
1. Copy any episode object in `EPISODES` and fill in title, date, duration (minutes), people, topics, summary and the YouTube video id.
2. Run `python transcribe.py episode.mp3 --notes` and paste the output into `transcript` and `notes`.
3. Commit to `main`. GitHub Pages redeploys in about a minute.

## Hosting
Served by GitHub Pages from the `main` branch root. Thumbnails come from YouTube's og image for each video id; the episode page embeds the YouTube player.
