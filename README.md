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
netlify/functions/
  scores.mts          high-score API, backed by Netlify Blobs
netlify.toml          publish directory and headers
```

There is no build step and no runtime dependencies in the browser: the page
loads four plain scripts and nothing else.

## Running locally

```bash
npm install
npm run dev      # netlify dev, serves the site and the score function
```

`npm run check` syntax-checks the browser scripts.

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
