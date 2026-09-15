# balloons

Simple JavaScript / HTML5 game. Pop the balloons before too many escape.

Play by clicking or tapping balloons. Pick a difficulty by tapping one of the
boxes on the title screen, or by pressing `E`, `S`, `H` or `V`. Space or Enter
restarts at the current difficulty.

## Layout

```
public/               everything served to the browser
  index.html
  css/styles.css
  images/sky_3.jpeg
  js/game.js          game loop, input, scoring, screen drawing
  js/gameballoons.js  balloon entity: position, drift, collision
  js/htmlballoons.js  draws a balloon on a canvas with bezier curves
  js/color.js         lighten/darken helpers and the gradient palette
  js/layout.js        grid, type scale and every on-screen position
netlify/functions/
  scores.mts          high-score API, backed by Netlify Blobs
test/                 test suite (see below)
netlify.toml          publish directory and headers
```

There is no build step and no runtime dependencies in the browser: the page
loads four plain scripts and nothing else.

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

## Deploying

The site is a Netlify project. `netlify.toml` publishes `public/` and picks up
the function in `netlify/functions/`, so a push to the tracked branch deploys
both the game and its score API together.

## High scores

`netlify/functions/scores.mts` serves the leaderboard from the same origin as
the game:

- `GET /api/scores/:difficulty` returns the board, highest first.
- `POST /api/scores/:difficulty` with `{"name": "...", "score": 123}` adds an entry.

`:difficulty` is one of `e`, `s`, `h`, `v`. Boards keep the top 10; the game
draws the top 3.

Scores live in [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/),
which needs no configuration or provisioning. Production writes to a global
store; deploy previews and branch deploys get their own store, so testing never
touches the real leaderboard.

This replaces the Redis + Node scoreboard service that used to run in a sibling
Docker container on port 5000. That service, the `Dockerfile`, the `nginx.conf`
and the `docker-compose.yml` are no longer part of this project.
