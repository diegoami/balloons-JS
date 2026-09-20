# balloons

Simple JavaScript / HTML5 game. Pop the balloons before too many escape.

Working on it with an AI assistant: see [CLAUDE.md](CLAUDE.md).

Play by clicking or tapping balloons. There is one game: press space, or the
Play button, and you start at level 1. The level climbs every 20 seconds of
play, up to 20 — a winning run is 6:40 — and everything gets faster, denser
and smaller as it does. Five balloons may escape to begin with, and three more
lives are earned on the way up, at 12, 15 and 18.

From level 4 some balloons are reinforced and take two taps; from level 10
some are armoured and take three. They are bigger, slower and worth more, and
they thin visibly as the skins come off. The sky climbs with the ladder too —
morning, afternoon, dusk, night — so how far up you are is visible without
reading anything.

Your name is asked for once, on the page rather than in a browser dialog, and
can be changed any time from the `Playing as ...` chip along the bottom.

## Layout

```
public/               everything served to the browser
  index.html
  css/styles.css
  js/game.js          the game: the loop, the canvas, the balloons
  js/screens.js       what it is being: name, title, countdown, play, game over
  js/paint.js         what it draws
  js/input.js         what it listens to
  js/scores.js        the leaderboard client
  js/announce.js      what the game says to a screen reader
  js/namefield.js     the one DOM element in the game
  js/layout.js        grid, type scale and every on-screen position
  js/sky.js           the drawn sky: one palette per time of day
  js/ladder.js        the ten levels, and what a balloon is like on each
  js/entities.js      what the sky can hold, and the contract each kind keeps
  js/gameballoons.js  balloon entity: position, drift, collision
  js/htmlballoons.js  draws a balloon on a canvas with bezier curves
  js/color.js         lighten/darken helpers and the gradient palette
  favicon.svg         the tab icon; the .ico and touch icon are built from it
netlify/functions/
  scores.mts          high-score API, backed by Netlify Blobs
test/                 test suite (see below)
netlify.toml          publish directory and headers
```

There is no build step and no runtime dependencies in the browser: the page
loads twelve plain scripts and nothing else. Each one defines a namespace and
touches nothing at parse time, so the order they load in does not matter. The
sky is drawn, not an image, so apart from the tab icon the game ships no images
at all.

## How it runs

The game takes fixed steps of 1/30s, driven by `requestAnimationFrame`. A
frame catches the simulation up to the moment it was called and then paints, so
the game plays at the same speed on a 30Hz display and a 144Hz one — balloon
speed and the ladder's ramps are expressed per step, not per second. A frame
may catch up on at most 250ms, so a tab that was hidden for a minute resumes
rather than replaying the minute. The round clock counts steps too: the time on
the leaderboard is time played, not time elapsed.

## Getting there without seeing it

The game is one canvas, which to anything but a pair of eyes is a single empty
element. What the picture says is also said in a live region: which screen is
up, which level it has climbed to, that a balloon got away, and the final
score. The canvas is focusable and described, and space starts a game from
anywhere. Popping still needs a pointer.

Every colour the game draws text in is checked against what is actually behind
it, on all four palettes, at WCAG AA (4.5:1) — the test renders the ground and
measures it rather than trusting the palette. That is how the leaderboard was
found sitting at 1.4:1 on a bright horizon, which is not low contrast so much
as invisible.

## Running locally

```bash
npm install
npm run dev      # netlify dev, serves the site and the score function
```

## Tests

```bash
npm test            # syntax check, then both suites
npm run test:scores # score function, against an in-memory blob store
npm run test:browser # the game itself, driven in headless Chromium
```

The browser suite serves `public/` with a stub of the score API and drives the
real game: rendering, input, scoring, the game-over round trip, device pixel
ratios of 1x/2x/3x, resizing and rotation. It needs a Chromium; `npm install`
fetches one, and `CHROMIUM_PATH` overrides which binary is used.

## Playtesting

```bash
npm run playtest
npm run playtest -- --runs=5 --cap=120 --reaction=200 --levels=H,V
```

`tools/playtest.mjs` plays the game with a bot under human limits — a reaction
delay, aim error and a realistic click rate — and reports how far up the ladder
each run got. It asserts nothing and is not part of `npm test`; it exists to answer
questions about tuning that reading the code does not. Because the player is
held constant, any difference between levels is the game's.

It aims where a balloon *was* one reaction-time ago, which is the error a person
makes against a rising target.

## Icons

`public/favicon.svg` is the icon; `favicon.ico` and `apple-touch-icon.png` are
built from it and committed:

```bash
node tools/make-favicon.mjs
```

The .ico exists for Safari before 16 and for anything that asks for
`/favicon.ico` without reading the page. It used to be a 184KB file holding
nine sizes, eight of them uncompressed bitmaps, which was more than three times
the size of the entire game.

## Deploying

The site is a Netlify project. `netlify.toml` publishes `public/` and picks up
the function in `netlify/functions/`, so a push to the tracked branch deploys
both the game and its score API together.

## High scores

`netlify/functions/scores.mts` serves the leaderboard from the same origin as
the game:

- `GET /api/scores` returns the board, highest first.
- `POST /api/scores` with `{"name": "...", "score": 123}` adds an entry.

One board, because one game: it keeps the top 10 and the game draws the top 3.
There used to be four, one per difficulty, and they could not be compared with
each other. The old four are still in the store under their own keys, unread.

Scores live in [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/),
which needs no configuration or provisioning. Production writes to a global
store; deploy previews and branch deploys get their own store, so testing never
touches the real leaderboard.

This replaces the Redis + Node scoreboard service that used to run in a sibling
Docker container on port 5000. That service, the `Dockerfile`, the `nginx.conf`
and the `docker-compose.yml` are no longer part of this project.
