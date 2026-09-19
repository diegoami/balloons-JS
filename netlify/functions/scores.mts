import { getDeployStore, getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

/**
 * The high-score board.
 *
 * Replaces the old Redis + Node scoreboard service (DA_redis_nodejs_Scoreboard)
 * that used to run in a sibling Docker container on port 5000. Same shape of
 * data, but served from the same origin as the game, so there is no mixed
 * content and no CORS to configure.
 */

type ScoreEntry = {
  name: string;
  score: number;
  score_day: string;
  /**
   * How far up the ladder the run got, and whether it finished.
   *
   * Both optional, because every row written before this existed has neither
   * and nothing here rewrites history: the game draws a dash for a row with no
   * level rather than inventing one.
   */
  level?: number;
  won?: boolean;
  /**
   * What the run was played with: "touch", "mouse" or "mixed".
   *
   * The ladder is calibrated against roughly 2.1 taps a second from ONE
   * pointer. A touchscreen lets you use two thumbs, which measured is the
   * difference between dying around level 8 and finishing every run -- so a
   * score set that way is not the same achievement as one set with a mouse,
   * and the board says which rather than quietly mixing them.
   *
   * Optional, like `level`: rows written before this existed have none, and an
   * old browser that reports no pointer type sends none.
   */
  pointer?: "touch" | "mouse" | "mixed";
};

const STORE_NAME = "highscores";
/**
 * One board, under one key.
 *
 * There were four, one per difficulty, and they could not be compared with
 * each other: a score on Easy and a score on VHard were different games. One
 * game means one board, and every row on it was earned the same way. The four
 * old lists are still in the store under their own keys, unread; nothing here
 * deletes them.
 */
const BOARD = "all";

/** How many entries we keep. The game only draws the top 3. */
const MAX_SCORES = 10;

const MAX_NAME_LENGTH = 24;
const MAX_SCORE = 1_000_000;

/** The top of the ladder. A level outside 1..MAX_LEVEL is not recorded. */
const MAX_LEVEL = 20;

/**
 * Production writes to the global store; previews and branch deploys get their
 * own deploy-scoped store, so test scores never land on the real leaderboard.
 *
 * Strong consistency matters here: the game posts a score and then immediately
 * re-reads the board to display it. With the default eventual consistency that
 * read could miss the write for up to a minute.
 */
function getScoreStore(context: Context) {
  const options = { name: STORE_NAME, consistency: "strong" as const };
  return context.deploy?.context === "production"
    ? getStore(options)
    : getDeployStore(options);
}

/** Strip control characters and cap the length. Names come straight from a prompt(). */
function cleanName(value: unknown): string {
  if (typeof value !== "string") return "anonymous";
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return cleaned.slice(0, MAX_NAME_LENGTH) || "anonymous";
}

function cleanScore(value: unknown): number | null {
  // Guard the type before coercing: JSON.stringify turns NaN and Infinity into
  // null, and Number(null) is 0, so a bad score would otherwise post as a real
  // zero. Number("") and Number(false) are 0 for the same reason.
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
  return score;
}

/**
 * The level reached, or undefined.
 *
 * Undefined rather than a fallback: a level we cannot trust is a level we do
 * not have, and the board already knows how to draw that.
 */
function cleanLevel(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 1 || value > MAX_LEVEL) return undefined;
  return value;
}

const POINTERS = ["touch", "mouse", "mixed"] as const;

/** One of the three, or undefined. Anything else is a client we do not know. */
function cleanPointer(value: unknown): ScoreEntry["pointer"] {
  return (POINTERS as readonly unknown[]).includes(value)
    ? (value as ScoreEntry["pointer"])
    : undefined;
}

function byScoreDescending(a: ScoreEntry, b: ScoreEntry): number {
  return b.score - a.score;
}

/**
 * Headers that let something other than the website talk to this.
 *
 * The game and this function share an origin, so the browser never needed
 * these. An Android build that bundles its assets does not share an origin
 * with anything -- it is loaded from the device -- so without them the app
 * could not read the board or post to it.
 *
 * `*`, and it costs nothing, because CORS IS NOT A LOCK. It is a rule browsers
 * apply to each other; it has never stopped curl, and this endpoint has always
 * been open to anything that can make an HTTP request. What actually guards
 * the board is that every field is validated and clamped above: a score has to
 * be an integer inside MAX_SCORE, a level inside the ladder, a win only at the
 * top of it, and a name is cleaned. Opening it to other origins does not make
 * it one bit more forgeable than it already was.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...CORS,
    },
  });
}

export default async (req: Request, context: Context) => {
  // The preflight, which a cross-origin POST of JSON always makes first. It is
  // answered before the store is touched: it is a question about permission,
  // not about scores.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const store = getScoreStore(context);
  const existing =
    ((await store.get(BOARD, { type: "json" })) as ScoreEntry[] | null) ?? [];

  if (req.method === "GET") {
    return json(existing);
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "body must be JSON" }, 400);
  }

  const { name, score, level, won, pointer } =
    (payload ?? {}) as Record<string, unknown>;
  const cleanedScore = cleanScore(score);

  if (cleanedScore === null) {
    return json({ error: "score must be a non-negative integer" }, 400);
  }

  const entry: ScoreEntry = {
    name: cleanName(name),
    score: cleanedScore,
    score_day: new Date().toISOString().slice(0, 10),
  };

  const cleanedLevel = cleanLevel(level);
  if (cleanedLevel !== undefined) {
    entry.level = cleanedLevel;
  }
  // A win is only a win at the top of the ladder. Anything else claiming one
  // is a client that disagrees with this function about what winning is.
  if (won === true && cleanedLevel === MAX_LEVEL) {
    entry.won = true;
  }

  const cleanedPointer = cleanPointer(pointer);
  if (cleanedPointer !== undefined) {
    entry.pointer = cleanedPointer;
  }

  // Read-modify-write. Netlify Blobs has no compare-and-swap, so two scores
  // landing in the same instant can drop one of them. For a leaderboard on a
  // toy game that is an acceptable trade against pulling in a real database.
  const updated = [...existing, entry].sort(byScoreDescending).slice(0, MAX_SCORES);
  await store.setJSON(BOARD, updated);

  return json(updated);
};

export const config: Config = {
  path: "/api/scores",
};
