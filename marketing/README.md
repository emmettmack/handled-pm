# marketing/

Everything in here is a draft. Nothing posts, sends, or publishes from this
folder. Emmett reviews every pack before it goes anywhere.

## Layout
- `brand-kit.md` - voice, allowed/forbidden claims, colors, fonts, hashtags.
  The marketing agent reads this first.
- `templates/` - blank SVG post templates in Instagram sizes. The agent copies
  one and fills in the text.
- `render.sh` - converts SVGs to PNGs at exact pixel size (uses Chrome headless;
  works on macOS with Chrome installed). Usage: `marketing/render.sh path/to/card.svg`
- `packs/<date>-<slug>/` - one folder per batch of content, one subfolder per
  post. Each post has a `post.md` (or `script.md` for Reels) with the caption,
  on-image text, alt text, hashtags, and a note on what to check before posting.
- `packs/2026-11-06-first-three/` - a finished example pack. Look at it to see
  what "done" looks like.

## How to get content
In Claude Code, ask for the marketing agent, e.g.:
- "Use the marketing agent to make a carousel about the approval queue."
- "Use the marketing agent to plan two weeks of posts." (it will pitch ideas first)
- "Use the marketing agent to write a Reel script about emergencies."

## What the agent can and can't do
- It writes everything: ideas, captions, carousel copy, Reel scripts, Story
  sequences, alt text, hashtags.
- It makes text-and-diagram visuals itself as SVG cards, rendered to PNG with
  render.sh (or import the SVG into Figma/Canva, both free).
- For photo-style images it writes a ready-to-paste prompt for an image tool
  (or hand the prompt to Instinct, which can generate the image).
- For Reels it writes the script and shot list; the footage is Emmett's phone
  plus screen recordings of the public demo (macalisto.com, Live demo tab).
- It never posts, schedules, boosts, or creates accounts. Posting is Emmett
  (or a tool he explicitly connects later).
