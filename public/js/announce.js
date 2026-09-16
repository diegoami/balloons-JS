/**
 * What the game says to anyone who cannot see it.
 *
 * The whole game is one canvas. To a screen reader that is a single element
 * with nothing in it, so everything the picture says — which screen is up,
 * which difficulty is selected, that a balloon got away, what the final score
 * was — has to be said somewhere it can be read. That somewhere is a live
 * region in the page, and this is everything that writes to it.
 *
 * It is deliberately quiet. A round is thirty frames a second of balloons
 * moving, none of which is worth interrupting anybody for; what gets announced
 * is arriving on a screen, losing a balloon, and the result.
 */

"use strict";

var Announce = {};

/** The element lives in the page, so the game only has to find it. */
Announce.find = function () {
    Announce.region = document.getElementById("game_status");
    Announce.last = null;
};

/**
 * Says something, unless it is what was said last.
 *
 * Writing the same string again does not re-announce it in most screen
 * readers, and writing a different one interrupts. Both are reasons to send as
 * little as possible rather than to send everything and hope.
 */
Announce.say = function (text) {
    if (!Announce.region || text === Announce.last) {
        return;
    }
    Announce.last = text;
    Announce.region.textContent = text;
};

/** The title screen: what this is, what is selected, and how to start. */
Announce.title = function (game) {
    Announce.say(
        "Balloons. Difficulty " + game.difficulty.label + ", playing as " +
        game.name + ". Press E, S, H or V to choose a difficulty and start, " +
        "or space to play."
    );
};

Announce.name = function () {
    Announce.say("Your name. Type a name, then Enter to save or Escape to cancel.");
};

Announce.starting = function (game) {
    Announce.say(
        game.difficulty.label + ", starting at level " + game.difficulty.startLevel +
        ". Get ready. " + Announce.lives(game.difficulty.maxLost) + " to lose."
    );
};

Announce.playing = function () {
    Announce.say("Go.");
};

/**
 * A level arrived. This is the only thing said during a round other than a
 * balloon getting away, and it earns that: the game just got harder and
 * nothing else on the screen announces it.
 */
Announce.level = function (game) {
    Announce.say("Level " + game.level + ".");
};

/** A balloon got away, which is the only thing in a round worth interrupting for. */
Announce.lost = function (game) {
    Announce.say(
        game.lostBalloons + " of " + game.difficulty.maxLost + " lost, " +
        game.balloons_caught + " popped."
    );
};

Announce.gameover = function (game) {
    Announce.say(
        "Game over. " + game.balloons_caught + " popped in " + game.end_time +
        " seconds. Press space to play again."
    );
};

/** "one balloon" reads better than "1 balloons" in the middle of a sentence. */
Announce.lives = function (count) {
    return count === 1 ? "one balloon" : count + " balloons";
};
