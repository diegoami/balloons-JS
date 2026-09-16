/**
 * The leaderboard client.
 *
 * One board is in play at a time — the one for the difficulty being shown — so
 * the cache, the request in flight and the submission still settling are three
 * fields here rather than five more on the game.
 *
 * The board is asked for on every frame the game-over screen draws. Asking used
 * to mean fetching: until the first response came back, the game issued thirty
 * requests a second. The promise in flight is the lock that stops that.
 */

"use strict";
var Scores = {};

Scores.URL = "/api/scores/";

/** What has arrived, or null. */
Scores.board = null;

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
            return fetch(Scores.URL + game.difficulty.level.toLowerCase());
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

            if (!Screens[game.screen].animated) {
                game.paint();
            }
        })
        .catch(function () {
            /* The leaderboard is a nicety; the game plays fine without it. */
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

    Scores.submitted = fetch(Scores.URL + game.difficulty.level.toLowerCase(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score: score, name: game.name })
    }).catch(function () {
        /* Ignore: a failed submission shouldn't block the game-over screen. */
    });
};
