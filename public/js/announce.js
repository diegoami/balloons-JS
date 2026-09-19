/**
 * What the game says to anyone who cannot see it.
 *
 * The whole game is one canvas. To a screen reader that is a single element
 * with nothing in it, so everything the picture says — which screen is up,
 * which level it has climbed to, that a balloon got away, what the final score
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

/**
 * The title screen: what this is, who is playing, and how to start.
 *
 * The screen behind these words is the game playing itself, which a screen
 * reader cannot convey at all — so this says what the footage is showing.
 */
Announce.title = function (game) {
    Announce.say(
        "Balloons. " + Layout.DESCRIPTION.join(" ") +
        " Playing as " + game.name + ". Tap anywhere to play."
    );
};

/**
 * The level chip moved.
 *
 * The warning is repeated every time rather than said once, because the chip
 * cycles and a player who cannot see it needs to know what the current choice
 * costs, not what the last one did.
 */
Announce.startLevel = function (game) {
    Announce.say(
        game.isPractice()
            ? "Starting at level " + game.startLevel +
              ". Practice run: this score will not be saved."
            : "Starting at level 1. Scores count."
    );
};

/** The About screen, read out in full: it is all text, so all of it goes. */
Announce.about = function (game) {
    var said = [Layout.ABOUT_TITLE];
    Layout.about().forEach(function (section) {
        said.push(section.heading + ".");
        section.lines.forEach(function (line) { said.push(line); });
    });
    said.push("Escape to go back.");
    Announce.say(said.join(" "));
};

Announce.name = function () {
    Announce.say("Your name. Type a name, then Enter to save or Escape to cancel.");
};

Announce.starting = function (game) {
    Announce.say(
        "Get ready. Level " + game.startLevel + ", and " +
        Announce.lives(Game.LIVES) + " to lose." +
        (game.isPractice() ? " Practice run: this score will not be saved." : "")
    );
};

/**
 * A tab that was away, said out loud.
 *
 * The screen says this too, but a reader cannot see the sky hanging frozen, so
 * it also says the game is waiting rather than over.
 */
Announce.paused = function (game) {
    Announce.say(
        "Paused at level " + game.level + ". " + game.score + " points. " +
        (game.askedToPause
            ? game.pausesLeft + " pauses left. Resuming in " +
              Game.PAUSE_SECONDS + " seconds, or press space to carry on now."
            : "Press space to carry on.")
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
Announce.level = function (game, awarded) {
    var life = awarded > 0
        ? " Extra life. " + Announce.lives(game.allowance - game.livesLost) +
          " left to lose."
        : "";
    Announce.say("Level " + game.level + "." + Announce.arrivals(game) + life);
};

/**
 * What a rung brought that the one below it did not. Said once, when it
 * arrives: a balloon that does not pop is the kind of surprise a player who
 * cannot see the rim deserves to be told about.
 */
Announce.arrivals = function (game) {
    var rung = Ladder.at(game.level);
    var under = Ladder.at(game.level - 1);
    var news = "";

    if ((rung.bossMark || 1) > (under.bossMark || 1)) {
        return " A bigger saucer: eight taps, and it moves.";
    }
    if (rung.fading > 0 && !(under.fading > 0)) {
        return " Fading balloons: they thin out as they rise.";
    }
    if (rung.janky > 0 && !(under.janky > 0)) {
        return " Janky balloons: some of them wander.";
    }
    if (rung.fireflies > 0 && !(under.fireflies > 0)) {
        return " Fireflies: do not touch them either.";
    }
    if (rung.birds > 0 && !(under.birds > 0)) {
        return " Birds: do not touch them.";
    }
    if (rung.armoured > 0 && !(under.armoured > 0)) {
        news += " Armoured balloons: three taps.";
    } else if (rung.reinforced > 0 && !(under.reinforced > 0)) {
        news += " Reinforced balloons: two taps.";
    }
    return news;
};

/**
 * The boss, all three moments of it.
 *
 * A mechanic that punishes you silently is one a player who cannot see the
 * canvas can only learn about by losing to it — and this one has a clock, so
 * "it is here" and "it is charging" are the whole interface for them.
 */
Announce.bossArrived = function (game) {
    var kind = Ladder.saucer(Ladder.at(game.level).bossMark);
    Announce.say(
        (kind.mark > 1 ? "A bigger saucer. " : "A saucer. ") +
        "Tap it down, quickly: " + kind.taps + " taps."
    );
};

Announce.bossDestroyed = function (game) {
    Announce.say("Saucer destroyed. " + game.score + " points.");
};

Announce.bossFired = function (game) {
    Announce.say(
        "The saucer fired. " + game.livesLost + " of " + game.allowance + " lost."
    );
};

/**
 * A bird was touched.
 *
 * Said every time, unlike most things in a round, because the cost is a life
 * and the cause is a rule the player may not have absorbed yet. A silent
 * penalty is a penalty nobody learns from.
 */
Announce.touchedBird = function (game) {
    Announce.say(
        "You touched a bird. " + game.livesLost + " of " + game.allowance +
        " lost."
    );
};

/**
 * A firefly was touched.
 *
 * Said every time, like a bird, and for the same reason: the cost is a life
 * and the cause is a rule the player may not have absorbed yet.
 */
Announce.touchedFirefly = function (game) {
    Announce.say(
        "You touched a firefly. " + game.livesLost + " of " + game.allowance +
        " lost."
    );
};

/** A balloon got away, which is the only thing in a round worth interrupting for. */
Announce.lost = function (game) {
    Announce.say(
        game.livesLost + " of " + game.allowance + " lost, " +
        game.score + " points."
    );
};

Announce.gameover = function (game) {
    Announce.say(
        (game.won
            ? "You win. Level " + Ladder.MAX + " survived. "
            : "Game over. ") +
        game.score + " points in " + game.end_time + " seconds. " +
        (game.isPractice()
            ? "Practice run: not saved. "
            : "") +
        "Press space to play again."
    );
};

/** "one balloon" reads better than "1 balloons" in the middle of a sentence. */
Announce.lives = function (count) {
    return count === 1 ? "one balloon" : count + " balloons";
};
