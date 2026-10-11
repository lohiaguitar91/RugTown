# Reddit post — r/SoloDevelopment

Status: ready to paste once the checklist below is done. This is the
r/SoloDevelopment cut of `reddit-v0.md`: same story, but the audience is
other solo devs, so the body earns its place with *how it's built*, not just
what it is. Media: `media/rugtown-trailer.mp4` (43 s, 1280×720, captioned,
44.1 kHz stereo audio) as a native Reddit video upload — not a YouTube link.
No brand names anywhere in the post or the comments (DESIGN.md §3).

## Checklist — 60 seconds on the sub before posting

The sub's rules and flairs could not be fetched from the dev environment, so
confirm these on reddit.com/r/SoloDevelopment the day you post:

1. **Solo rule.** The sub is for projects where one person does the core
   development; outside help (assets, tools, contractors) is fine. If that's
   you, say so in one line — it's the credential there.
2. **Flair.** Pick the flair the sidebar uses for showing your own game
   (usually "Game"; if there's a "Marketing"/"Trailer" flair, that's the
   one for a trailer). Never post flairless — those get auto-removed.
3. **Promotion limits.** Check the rules for a frequency limit or a weekly
   share thread; if trailers belong in a thread, post there and skip the
   front page.
4. **AI policy.** Many gamedev subs now have an AI-content rule. Everything
   on screen is drawn in code (no generated images), but an AI coding
   assistant wrote a lot of the code. Read the rule, then decide on the
   disclosure line below. Don't guess.
5. **Video + body.** On new Reddit a video post can carry body text; on old
   Reddit it can't. If the body field isn't there, post the video with the
   title and put the body as your own first comment, immediately.
6. **Thumbnail.** Reddit lets you pick a frame: use the crossing (~20 s)
   or the title card (~38 s), not the empty rug at 0 s.

## Title (pick one)

1. Before any of us had a console, we had a rug. Solo prototype of a cozy
   building toy about the living-room floor — the first thing that runs
2. Solo dev, weeks-old prototype: wooden rails on the road rug, wind the
   engine up, watch the crossing gate drop. Vanilla JS, one canvas, no engine
3. I'm making a toy, not a game: the 90s living-room floor as a miniature
   world. First trailer, placeholder art, honest about how early it is

## Body

Before any of us had a console, we had a rug. The rug had roads, the roads
went somewhere, and the wooden track clicked together in exactly one
satisfying way. An afternoon disappeared at carpet level.

**Rug Town** is a building toy about that — the living-room floor of a 90s
house as a miniature world. Peg-and-hole rails, the road rug with the yellow
dashes, pull-back cars, couch-cushion mountains, book tunnels. You build it,
wind it up, then get down to carpet level and watch it run. It's a toy, not a
game: no timer, no score, nothing to lose. The best ending to a session is a
little diorama that runs without you.

This trailer is the first thing that works — a weeks-old prototype: one
snapped oval, one wind-up engine, one road, and one crossing where the gate
drops, the bell swings, and a pull-back car waits its turn. Everything you
see is placeholder art drawn in code.

For the solo devs, the how: it's vanilla JS, one canvas, zero dependencies,
no build step. The engine and car are billboard sprites baked at load from
little procedural models — 16 rotation frames — which was the whole first
spike: does 2.5D hold up at a cheek-on-the-rug follow cam, or do I need real
3D for the movers? (It holds, mostly; the F key cycles 8/16/32/64 frames so I
could feel the difference.) The sim is fixed-step and deterministic, so a
shared layout replays the exact same show for whoever opens it — and that's
also how the trailer was made: every frame is the sim seeked to a time and
screenshotted through headless Chromium, and every toy sound is synthesized
from the sim's own events. No samples, no engine, no footage of anything
that didn't actually happen in the toy.

The plan is pay once, own it. No ads, no accounts, no energy meters. Tablet
first, because a tablet on a carpet *is* the rug; a free web version so
shared layouts open for anyone.

Two things I'd love from this thread: **what do you remember from your
floor** — which piece was the one you fought your sibling for? And from the
solo devs: how early do you show a thing? Did it help, or did it just cost
you a week of comments?

## Optional disclosure line (decide after reading the sub's AI rule)

> Solo, with an AI coding assistant doing a lot of the typing — the design,
> the calls, and the mistakes are mine. No generated art; everything on
> screen is drawn by code.

Put it at the end of the "how" paragraph if you include it. If the sub
requires disclosure, it's not optional. If it forbids AI-assisted projects
outright, this is the wrong sub for this post — don't argue it in comments.

## Replies to have ready

- **"What engine?"** None. Vanilla JS on a 2D canvas; the 3D is a few
  hundred lines of projection and a near-plane clip. The pitch for that:
  three products on one tiny stack, no build step, ships as a static page.
- **"Platforms / when?"** iOS + Android, tablet first, free web demo. No
  date — "weeks-old prototype" is the entire status. Don't be talked into
  one.
- **"Price?"** Pay once; the number isn't final and isn't the point yet.
- **"Why not just use [the famous wooden-rail brand]?"** Because it's a
  category, not a brand — dozens of makers for decades — and the toy is
  about the floor you remember, not any catalog. Don't name the brand in
  the reply either.
- **"Is this AI?"** Answer plainly with whatever you decided above. Never
  hedge; the sub can smell it.
- **"Where's the music box?"** Specced, not built: every switch and crossing
  strikes a note, the layout composes its own tune. It's the next spike.
- **"Can I try it?"** Not yet — no build is public. If you want to offer
  one, it's a ten-minute static deploy of the spike page, but decide that
  before posting, not under pressure in the thread.

## After posting

- Stay for the first two hours and reply to everything; the floor stories
  are the research, and the sub rewards authors who show up.
- Don't crosspost the same trailer to other subs the same day. Give this
  one its day, then r/IndieDev or r/CozyGamers with its own framing.
- Copy the good floor memories into `marketing/floor-stories.md` — they're
  the Postcard prompts and the store-page copy, eventually.
