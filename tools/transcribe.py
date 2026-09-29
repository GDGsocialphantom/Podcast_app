"""
transcribe.py — turn an episode's audio or video into the transcript + show notes
the podcast hub reads.

Usage:
    export OPENAI_API_KEY=sk-...
    python tools/transcribe.py episode.mp3      # writes episode.transcript.json
    python tools/transcribe.py episode.mp4 --notes  # also drafts takeaways + chapters

Paste the JSON output into the matching episode in the DATA block of data/episodes.js
(`transcript: [...]` and `notes: {...}`).

Requires:  pip install openai
Files over 25 MB: run  ffmpeg -i episode.mp4 -vn -ac 1 -ar 16000 -b:a 48k episode.mp3  first.
"""
import argparse, json, os, sys
from pathlib import Path

try:
    from openai import OpenAI
except ImportError:
    sys.exit("pip install openai")

def transcribe(path: Path) -> list[dict]:
    client = OpenAI()  # reads OPENAI_API_KEY
    with open(path, "rb") as f:
        r = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    cues, current = [], None
    # merge Whisper's short segments into ~20-second cues so the page isn't a wall of one-liners
    for seg in r.segments:
        start, text = int(seg.start), seg.text.strip()
        if current and start - current["t"] < 20:
            current["x"] += " " + text
        else:
            if current:
                cues.append(current)
            current = {"t": start, "s": "Speaker", "x": text}
    if current:
        cues.append(current)
    return cues

def draft_notes(cues: list[dict]) -> dict:
    client = OpenAI()
    text = "\n".join(f"[{c['t']}s] {c['x']}" for c in cues)
    prompt = (
        "You are writing show notes for a podcast episode. From this timestamped transcript return JSON with:\n"
        '"takeaways": 3 to 5 short sentences, "chapters": list of [seconds, short title] (5 to 8 chapters, '
        'use the transcript timestamps), "links": []. Plain language, no hype.\n\n' + text[:60000]
    )
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    return json.loads(r.choices[0].message.content)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--notes", action="store_true", help="also draft takeaways and chapters")
    args = ap.parse_args()
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("Set OPENAI_API_KEY first.")
    src = Path(args.file)
    out = {"transcript": transcribe(src)}
    if args.notes:
        out["notes"] = draft_notes(out["transcript"])
    dest = src.with_suffix(".transcript.json")
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"Wrote {dest}  ({len(out['transcript'])} cues). Fill in speaker names, then paste into podcast-hub.html.")
