# Reddit post, v0 — "here's my idea"

Status: draft for the first public post. Media: lead with
`media/rugtown-trailer.mp4` (43 s, captioned: build it → wind it up → watch it
run, then the pitch cards) as a native video post; `media/rugtown-crossing.gif`
(the 14-second loop) is the fallback for subs that prefer GIFs or for the
comments. No brand names anywhere in the post or the comments (DESIGN.md
§3); "the wooden train set," "the road rug," "pull-back cars" are the words.

## Title (pick one)

1. The floor was the first open world. I'm making a toy about it. (very early)
2. Remember the road rug with the yellow dashes? I'm building a cozy toy where
   you get down on the carpet and watch your wooden trains run — weeks-old
   prototype, first thing that works
3. A building toy, not a game: wooden rails on the living-room rug, wind it up,
   watch the crossing gate drop. Early prototype, would love your floor stories

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

This clip is the first thing that works — a few weeks of prototype: one
snapped oval, one wind-up engine, and one crossing where the gate drops, the
bell swings, and a pull-back car waits its turn. Placeholder art (everything
you see is drawn in code), no sound yet — the plan is that the whole layout
is a music box, where every switch and crossing strikes a note.

For the skeptics, the plan is: pay once, own it. No ads, no accounts, no
energy meters, no season pass. Tablet first, because a tablet on a carpet
*is* the rug; a free web version so shared layouts open for anyone.

What I'd actually love from this thread: **what do you remember from your
floor?** Which piece was the one you fought your sibling for?

## Where to post (check each sub's self-promo rules the day you post)

- **r/IndieDev** — WIP-friendly, GIF-first, used to "very early" posts; the
  honest "weeks-old prototype" framing lands well there.
- **r/CozyGamers** — the actual audience. Stricter about promotion: post as a
  person sharing a thing they're making and lead with the question, not the
  pitch; read the pinned rules first.
- **r/gamedevscreens** — built for exactly this: a short clip and a paragraph.
  Lower reach, near-zero risk, a good first outing to test the GIF and the
  title before the bigger subs.

## Before posting

- Watch the trailer with sound once yourself. The toy sounds are synthesized
  from the sim's own events (say so if anyone asks). It's captioned, not
  narrated — if you want a voice on it, record the eight lines in
  `trailer.js` yourself as `narration/line-0.wav` … `line-7.wav` and re-run
  `mix-trailer.mjs`; your own voice will beat any TTS for this.
- The DIY name check in DESIGN.md §10 Q1 — if it flagged a collision, decide
  on the name before the post, not after.
- Reply to every "what did you build on your floor" answer; that thread is
  the research.
- Do not promise dates. "Weeks-old prototype" is the whole status.
