# QA

A film is done when the checks pass and a full review pass finds nothing to fix. Look at the frames yourself; the checks only prove the film is deterministic.

## Automatic checks

```bash
node ${CLAUDE_SKILL_DIR}/scripts/check.mjs film/src/index.html [--dist film/dist/name.html] [--no-loop] [--step 0.05]
```

| Check | Fails when | Usual cause |
|---|---|---|
| no clock, timer, randomness or CSS animation in the film's files | the source has `Math.random`, `Date.now`, `new Date()`, `setTimeout`, `requestAnimationFrame`, a `transition` or an `animation` (`main.js`, the preview player, is not read) | a quick effect written the web way; compute it from `t` instead |
| no page errors on any frame (every 0.05 s) | a frame throws | a key missing from `$`, a missing symbol, `undefined` math before a scene starts |
| the loop closes (the frame after the last equals the first) | the loop has a seam | a motion still running on the last frame; an end state that differs from the start (a leftover row, a camera drift) |
| same frame whatever the seek order | state carries between frames; it prints the times that differ | counters, caches keyed on anything but the value they mirror, a property set in one branch and never reset, an image still decoding, type resting at a fractional pixel position |
| `--dist` matches the sources | the single file differs | a file `build_single.py` could not inline (a CSS `url()`, an `<img>` built in JS from a path instead of `ASSETS`) |

To find a frame that breaks determinism, compare stills of the same time taken after seeking from different places.

## Review routine

```bash
node ${CLAUDE_SKILL_DIR}/scripts/render.mjs sheet film/src/index.html out/qa/all.png 0 46.5 0.5       # overview
node ${CLAUDE_SKILL_DIR}/scripts/render.mjs sheet film/src/index.html out/qa/t12.png 11.8 13.4 0.05  # one transition
node ${CLAUDE_SKILL_DIR}/scripts/render.mjs stills film/src/index.html out/qa/stills 8.2,15.0 --scale 2  # readability
```

Sheets label each tile with its time and beat. Read them with the Read tool.

1. **Overview** every 0.5 s: does the story read? Is the phone always there once it forms? Is every result held long enough to read? Give each line that has to be read half a second, plus a third of a second for every word, once its last word has landed and stopped moving.
2. **Every transition** at 0.05 s, from 0.3 s before to 0.3 s after: flashes, pops, overlaps, mask edges.
3. **Every screen with text** at full size (`--scale 2`, view at 100 %): truncation, clipped descenders, text size, alignment against the app.
4. Fix, then re-run the checks and re-look at what you changed and its neighbours. Repeat until a pass finds nothing.
5. **Fresh eyes** on the finished render: play it once to someone new to the app, or imagine you are: can they name the app, the job it does, the person it does it for, and where to find it? Is frame 0 (the thumbnail most players and feeds show) a finished frame you'd post? If not, fix the story or the opening, not the polish.

## Failure catalogue

| You see | Fix |
|---|---|
| A label cut short ("Savi", "Uncategori…") | reframe or scroll so it fits, or pick data that fits; never ship a cut word |
| Descenders cut at the bottom of a mask | mask height at least 1.3 × font size (`line-height: 1.3`) |
| Text crossed by a moving element | reorder layers or move the element's path; pause text until it passes |
| One-frame flash of a layer in its end position | show it at the same `t` its motion starts |
| A layer popping in or out without motion | give it an entry (`rise`, spring, clip) or tie it to something that moves |
| Content visible while the screen opens | start content after the rect morph ends |
| Text too small to read | a closer camera (`s ≥ 1.55` for 13 pt) |
| Caption or speech overlapping the phone | move the camera first, bring the caption in after it lands, take it out before the camera returns |
| Tiny text shimmering during slow moves | render with `--scale 2` |
| The phone missing its frame or island in a close-up | keep both side edges in frame; never crop the status bar away when it is the only sign of a phone |
| An action happening between beats | put it on `B(n)`; offsets inside a beat are for secondary motion only |
| Drift making a held screen crawl sideways | drift scales around the stage centre; frame the shot so the centre is where the eye is |

## Deliverables to render

- `out/<name>.mp4`: H.264, `yuv420p`, CRF 14, with the music (or the voiceover mix).
- `out/<name>-loop.mp4`: the same picture without sound, for autoplaying muted on sites and in feeds: `ffmpeg -i out/<name>.mp4 -an -c:v copy out/<name>-loop.mp4`.
- `out/<name>-poster.png`: the hero frame (usually the drop): `render.mjs stills <page> out/poster <t> --scale 2`.
- `out/<name>-1080.mp4` when a platform or a phone needs a smaller file: `ffmpeg -i out/<name>.mp4 -vf scale=1080:-2:flags=lanczos -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy out/<name>-1080.mp4`.

## Render verification

```bash
ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames,width,height,r_frame_rate -of csv=p=0 out/name.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 out/name.mp4
```

- Frame count equals `FILM_INFO.frames`, size equals `W × H`, duration equals `frames / FPS` (audio included).
- Extract the first and the last frame (`ffmpeg -i out/name.mp4 -vf "select=eq(n\,0)" -frames:v 1 first.png`, and `n\,frames-1`) and compare: nearly identical for a still ending (compression differs slightly), one frame of ambient motion apart otherwise.
- Extract a frame from the middle and compare with `render.mjs stills ... --scale 2` at the same time: the same picture.
- Watch it once with sound: every cut and tap on the beat, the drop on the reveal.
