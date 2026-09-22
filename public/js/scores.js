/**
 * The leaderboard client.
 *
 * There is one board, so the cache, the request in flight and the submission
 * still settling are three fields here rather than five more on the game.
 *
 * The board is asked for on every frame the game-over screen draws. Asking used
 * to mean fetching: until the first response came back, the game issued thirty
 * requests a second. The promise in flight is the lock that stops that.
 */

"use strict";
var Scores = {};

/**
 * Where the board lives.
 *
 * Relative, because the function is served from the same origin as the game --
 * no CORS, no mixed content, and it follows the site to whatever domain or
 * branch deploy it is on without being told.
 *
 * A build that does NOT share an origin with it -- an Android app with the
 * game bundled on the device, which is the point of bundling it -- sets
 * window.BALLOONS_SCORES_URL to the absolute address before this file loads.
 * One override, in one place, rather than a build step that rewrites a string.
 */
Scores.URL = window.BALLOONS_SCORES_URL || "/api/scores";

/** What has arrived, or null. */
Scores.board = null;

/** Whether the last fetch failed, so the board can fall back to local runs. */
Scores.failed = false;

/** The request in flight, or null. Also the token that says it is still wanted. */
Scores.pending = null;

/** A score still being submitted. The next read waits for it. */
Scores.submitted = null;

/**
 * Fetches the board, once, and repaints when it lands if the screen up at that
 * moment is a static one — an animated screen is about to repaint anyway, and
 * drawing the rows straight onto the canvas used to put the leaderboard over a
 * game in progress.
 */
Scores.load = function (game) {
    if (Scores.board || Scores.pending) {
        return;
    }

    // Wait on any score still being submitted, so the board we draw includes it.
    var mine = (Scores.submitted || Promise.resolve())
        .then(function () {
            return fetch(Scores.URL);
        })
        .then(function (response) {
            return response.ok ? response.json() : [];
        })
        .then(function (data) {
            // A score submitted while this was in flight supersedes it: the
            // board on its way is already out of date.
            if (Scores.pending !== mine) {
                return;
            }
            Scores.pending = null;
            Scores.board = data;
            Scores.failed = false;

            if (!Screens[game.screen].animated) {
                game.paint();
            }
        })
        .catch(function () {
            /* The leaderboard is a nicety; the game plays fine without it. The
               board screen falls back to the local history and says so. */
            Scores.failed = true;
            if (Scores.pending === mine) {
                Scores.pending = null;
            }
        });

    Scores.pending = mine;
};

Scores.submit = function (game, score) {
    // The board on screen predates this score, and so does any request for it.
    Scores.board = null;
    Scores.pending = null;

    Scores.submitted = fetch(Scores.URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The level and the outcome go with the score. 380 points means one
        // thing if you died on level 7 and another if you survived to 20, and
        // the board could not tell you which.
        body: JSON.stringify({
            score: score,
            name: game.name,
            level: game.level,
            won: game.won === true,
            // What it was played with. The ladder assumes one pointer at about
            // 2.29 taps a second; two thumbs on a touchscreen doubles that, and
            // the board should not pretend the two are the same achievement.
            pointer: game.pointerKind(),
            // Where the points and the lives went. Optional on the server, and
            // there only to explain the score.
            breakdown: game.breakdown
        })
    }).catch(function () {
        /* Ignore: a failed submission shouldn't block the game-over screen. */
    });
};

/**
 * Where the player's own runs are kept, separate from the public board.
 *
 * The "just mine" view is local history, not a server query: it works offline,
 * it needs no per-player endpoint, and it is the only thing that can say
 * "new personal best" the moment a run ends. The public board is still the
 * server's; this is a personal tally beside it.
 */
Scores.HISTORY_KEY = "balloons_runs";

/** How many of them. Small: this is a personal tally, not an archive. */
Scores.HISTORY_MAX = 20;

/** The player's own runs, newest first. Never throws. */
Scores.history = function () {
    try {
        var raw = window.localStorage.getItem(Scores.HISTORY_KEY);
        var list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
};

/**
 * Records a finished run in the local history.
 *
 * A practice run is not recorded at all: it is not posted either, and a
 * personal best set by skipping the climb would be the same lie in a smaller
 * place.
 */
Scores.remember = function (game) {
    if (game.isPractice()) {
        return;
    }
    var entry = {
        name: game.name,
        score: game.score,
        level: game.level,
        won: game.won === true,
        time: game.end_time,
        pointer: game.pointerKind(),
        breakdown: game.breakdown,
        at: Date.now()
    };
    var list = [entry].concat(Scores.history()).slice(0, Scores.HISTORY_MAX);
    try {
        window.localStorage.setItem(Scores.HISTORY_KEY, JSON.stringify(list));
    } catch (e) {
        /* Storage blocked or full; the board still works. */
    }
};

/** The best score this player has recorded locally, or null. */
Scores.personalBest = function (name) {
    var best = null;
    Scores.history().forEach(function (run) {
        if (run && run.name === name && (best === null || run.score > best)) {
            best = run.score;
        }
    });
    return best;
};
