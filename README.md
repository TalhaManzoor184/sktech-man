# Sketch Man Shorts

A daily YouTube Shorts meme pipeline for **Sketch Man**, a hand-drawn cartoon (and his friend **Bro**).

```
Gemini + Google Search finds this week's trends ─► Gemini writes a POV meme skit
   ─► Gemini TTS voices each character ─► Rhubarb makes mouth shapes ─► ffmpeg makes the sound effects
   ─► Remotion renders a 1080×1920 hand-drawn MP4 ─► YouTube API uploads it
```

Sketch Man and Bro are drawn in code (`src/remotion/sketch/SketchMan.tsx`) from the concept sheet,
so they look the same in every episode. A "boil" filter re-wobbles the lines every 3 frames so it
looks hand-animated. Sound effects (boom, whoosh, ding, pop, sad trombone, drumroll) are synthesised,
so there is nothing to license.

## Project layout

| Path | What it does |
| --- | --- |
| `character/bible.md` | Who the characters are, the humour, the rules, sets and moves. Sent to the writer every run. Edit it to steer the show. |
| `src/remotion/sketch/SketchMan.tsx` | The two character rigs: 8 faces, IK arms, props (phone, laptop, book, pencil). |
| `src/remotion/scenes/Scenes.tsx` | Sets: classroom, bedroom, street, kitchen, paper. |
| `src/remotion/Episode.tsx` | The video: POV banner, captions, camera punch-ins, the "boom" face zoom. |
| `src/pipeline/trends.ts` | Asks Gemini with Google Search what's trending this week. Never fails the run. |
| `src/pipeline/script.ts` | Writes the skit (Gemini default, or Claude). |
| `src/pipeline/tts.ts` | Voices: one Gemini request per character, cut at the pauses. |
| `src/pipeline/sfx.ts` | Synthesised meme sound effects. |
| `data/history.json` | Past episodes so themes don't repeat. Committed back by the workflow. |
| `data/sample-episode.json` | A hand-written episode for testing without keys. |

## Run it locally

Needs Node 22, `ffmpeg`, `espeak-ng` (test voice) and [Rhubarb Lip Sync 1.13](https://github.com/DanielSWolf/rhubarb-lip-sync/releases).

```bash
npm install
cp .env.example .env
npm run episode:sample            # sample script + robot voices, no keys, no upload
npm run studio                    # Remotion Studio to tweak the animation
npm run episode -- --no-upload    # real run, skip YouTube
npm run episode                   # full run
```

## One-time setup

1. **Gemini key** from aistudio.google.com → `GEMINI_API_KEY`. The same key does trends, script and voices.
2. **YouTube** (same steps as the Sunny channel, but authorise the *Sketch Man* channel):
   Google Cloud project → enable YouTube Data API v3 → OAuth consent screen (External, publish the app) →
   Desktop OAuth client → `npm run auth:youtube` on your computer, pick the Sketch Man channel →
   copy `YOUTUBE_REFRESH_TOKEN`. You can reuse the Sunny Google Cloud project and client; you only
   need a new refresh token for the new channel. Until the project passes the YouTube API audit,
   API uploads stay private.
3. **GitHub** → Settings → Secrets and variables → Actions:
   - Secrets: `GEMINI_API_KEY`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`
   - Variables (optional): `CONTENT_LANGUAGE`, `TTS_LANGUAGE`, `SKETCH_VOICE`, `BRO_VOICE`,
     `PUBLISH_TIME`, `PUBLISH_DELAY_DAYS`, `WATERMARK`, `TRENDS`,
     `TARGET_WPS` (speaking pace in words/second: 2.2 slow, 2.5 default, 3.0 normal chat), `BEAT_GAP` (pause between lines, default 0.6 s)
4. Actions → **Daily Sketch Man meme** → Run workflow: `test` first, then `no-upload`, then `full`.

## Daily schedule

Runs at **5:13 PM Pakistan time**, uploads private, YouTube makes it public at **7:00 PM PKT**
(10 AM New York, 3 PM London). Watch it in YouTube Studio → Content → Scheduled before then; set
`PUBLISH_DELAY_DAYS=1` for a full day to review.

## Desi version

Set `CONTENT_LANGUAGE=Hinglish (Roman Urdu/Hindi mixed with English)`, `TTS_LANGUAGE=hi-IN`
(or `ur-PK`), `VIDEO_LANGUAGE=hi`, and add Pakistani/Indian situations to the theme list in
`character/bible.md`.

## Things that decide whether this grows

- **Views are not guaranteed.** The pipeline gives you a daily, on-brand, trend-aware Short. Whether
  one hits a million depends on the joke. Check YouTube Analytics weekly (swipe-away rate, average
  view %), keep the formats that work and write them into the bible.
- **Inauthentic / mass-produced content.** YouTube can demonetise channels that look template-made.
  Use the review window, cut weak episodes, and every week make one special by hand with
  `--script=my-episode.json`.
- **Trending audio** from TikTok or Reels is copyrighted; this pipeline doesn't use it. Only add
  music you have a licence for (YouTube Audio Library) to `assets/music/`.
- The channel is set **not made for kids** (`MADE_FOR_KIDS=false`), which matches the bible.
