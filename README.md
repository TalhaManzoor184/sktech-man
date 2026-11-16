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
| `src/pipeline/tts.ts` | Voices: the whole skit as one two-voice Gemini conversation with an emotion per line, cut at the pauses and paced to `TARGET_WPS`. Falls back to one take per character. |
| `src/pipeline/sfx.ts` | Synthesised meme sound effects. |
| `src/pipeline/facebook.ts` | Facebook Page: Reel (same time as YouTube), meme photo, and a teaser Story. |
| `src/remotion/StoryTeaser.tsx` | The Story image: the hook frame with a "new meme" card. |
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
   `private-upload` uploads a real episode as private (it never goes public on its own), handy for checking voices in YouTube Studio.

## Facebook Page: Reel + photo + Story

After the YouTube upload, the Page gets three posts made from the same episode:

| Post | What | When |
| --- | --- | --- |
| Reel | the video | scheduled for the same 7 PM slot as YouTube |
| Photo | the punchline frame (POV text + reaction face), 4:5 | `FACEBOOK_PHOTO_DELAY_HOURS` after the Reel (default 3 h → 10 PM PKT) |
| Story | the hook frame with a "NEW MEME · Tonight 7 PM on Reels" card | as soon as the run finishes (the API can't schedule Stories); live 24 h |

Turn any of them off with the repository variables `FACEBOOK_REEL`, `FACEBOOK_PHOTO`,
`FACEBOOK_STORY` (`false`), or all of Facebook with `FACEBOOK_ENABLED=false`. Reels can only go to
a **Page**, not a personal profile.

Setup (once):
1. At developers.facebook.com, create an app (use case: *Manage everything on your Page*), or reuse
   the Sunny app. Add a privacy policy URL and switch the app to **Live**; in Development mode posts
   are visible only to people with a role on the app.
2. Put `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` in `.env`.
3. In Graph API Explorer, select the app, click *Get User Access Token*, tick `pages_show_list`,
   `pages_read_engagement` and `pages_manage_posts`, and approve for the **Sketch Man** Page.
4. Run `npm run auth:facebook` on your computer and paste that token; pick Sketch Man. It prints
   `FACEBOOK_PAGE_ID` and a Page token that never expires.
5. Add repository secrets `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_TOKEN`.
6. Run the workflow in `facebook-test` mode: the Reel is saved as a **draft** and the photo is
   uploaded unpublished, so nothing appears on the Page. Stories have no draft, so the test skips it.

`private-upload` and `upload-test` keep Facebook as drafts too. Reels are labelled AI-generated
(`is_ai_generated`). If any Facebook part fails, YouTube and the other parts still go out and the
run is marked failed so you get an email.

## Daily schedule

The workflow tries three times a day (3:13, 4:43 and 6:07 PM PKT) because GitHub often starts
cron jobs late or skips them. The first run that finds the next 7:00 PM PKT slot empty makes the
episode, uploads it private and schedules it for 7 PM on YouTube and Facebook; the other runs see
the slot taken in `data/history.json` and do nothing. A manual `full` run never double-books: if
today's slot is taken it schedules for the next free day. Watch it in YouTube Studio → Content →
Scheduled before then; set `PUBLISH_DELAY_DAYS=1` for a full day to review.

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
