# Tutorial videos

The narrated "How to use Scripture Study" videos in Settings (`src/views/Tutorials.tsx`). They are recorded from the
real app on a phone-sized screen, and Michael (Kokoro, the same voice as the audio Bible) narrates.

To remake them after changing the app or the words in `narration.json`:

```bash
python3 tutorial/tts.py          # 1. Michael reads every scene  -> tutorial/.build/audio, durations.json
node tutorial/record.cjs          # 2. record the app in time with it -> tutorial/.build/frames, timeline.json
python3 tutorial/build.py         # 3. picture + narration          -> public/audio/tutorial/*.mp4, .vtt, .jpg, index.json
```

- `record.cjs` uses the live site by default; `--url http://localhost:4173/` records a local build (`npm run build`
  and `npx vite preview --port 4173`), with the sermons and Michael's recordings fetched from the live site.
  `--only 3-listening` re-records one chapter.
- Each scene in `narration.json` is matched by its `id` to the taps and scrolling in `record.cjs`; a scene lasts as
  long as its narration (plus a breath), or longer if its actions need it.
- Needs: `pip install kokoro-onnx soundfile`, Playwright with Chromium, and ffmpeg. `tts.py` downloads the Kokoro
  model and voices once into `.voice-model-cache/`.
- The videos are served from `/audio/tutorial/` through the Worker, which answers the Range requests that iPhones
  need to play video. `tutorial/.build/scripture-study-tutorial.mp4` has all chapters in one file.
