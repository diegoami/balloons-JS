/**
 * The title screen plays the game to itself.
 *
 * It used to be a still: a gradient, a headline, a Play button and three high
 * scores. A still cannot tell you that balloons rise, that heavy ones take
 * more than one tap, or that the sky goes dark as you climb — so the screen
 * that is supposed to sell the game was the one place the game was invisible.
 *
 * This runs the real simulation. Not a recording and not a special case: the
 * same ladder, the same spawner, the same entities, popped by something that
 * taps at about the rate a person does. What you watch is what you get.
 *
 * It shows CLIPS rather than one continuous run, because a single level would
 * only ever show one sky. Each clip picks a level, fills the sky at that
 * level's rate, plays for a few seconds and cuts to the next — morning to
 * night across four of them, which is the whole arc of a run in half a minute.
 */

"use strict";
var Attract = {};

/**
 * The levels the footage is cut from, low to high.
 *
 * Evenly spread so the four clips walk the whole sky from morning to night,
 * and high enough up that each one has something in it: the first three levels
 * release barely a balloon a second on purpose, which is correct for a game
 * that has just started and dull to watch. Level 20 closes on a handful of
 * heavy balloons under the stars, which is what the top of the ladder is.
 */
Attract.CLIPS = [5, 10, 15, 20];

/** How long one clip holds before cutting to the next. */
Attract.CLIP_MS = 6500;

/** How far up the screen a clip's opening sky is scattered. */
Attract.FILL_DEPTH = 0.5;

/**
 * How hard the demo player works, as a share of what the level is releasing.
 *
 * Not a fixed tap rate. A person supplies about 2.29 taps a second, which is
 * more than the lower levels release — so a demo tapping at a person's rate
 * empties the sky and the footage shows three balloons and a lot of blue.
 * Popping most of what arrives instead keeps the sky at the level's own
 * occupancy, which is what the game actually looks like there, and lets a few
 * get away, which is what makes it read as someone playing rather than a video.
 */
Attract.KEEP_UP = 0.85;

/**
 * How often the demo player misses.
 *
 * A demo that pops everything is a video. A few balloons getting away is what
 * makes it read as someone playing, and it is honest: they get away in a real
 * game too.
 */
Attract.MISS_CHANCE = 0.18;

/** Whether the viewer has asked for less movement. */
Attract.reducedMotion = function () {
    return typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

/**
 * Starts the footage. Fresh state, and the first clip is cut immediately so
 * the screen is never seen empty.
 */
Attract.begin = function (game) {
    game.resetRound();
    game.state.clip = -1;
    game.state.steps = 0;
    game.state.endsAt = 0;
    Attract.cut(game);
};

/** Moves to the next clip: a new level, a fresh sky, already filled. */
Attract.cut = function (game) {
    var state = game.state;
    state.clip = (state.clip + 1) % Attract.CLIPS.length;
    state.endsAt = Date.now() + Attract.CLIP_MS;
    state.steps = 0;

    var level = Attract.CLIPS[state.clip];
    game.entities = [];
    game.applyLevel(level);

    // Steps between taps, from what this level actually releases. Ladder.SKY
    // and Ladder.arrivals are the measured numbers the ladder is tuned on, so
    // the demo works at the level's own pace rather than at a fixed one.
    var arrivals = Ladder.arrivals(Ladder.at(level)) * Attract.KEEP_UP;
    state.tapEvery = Math.max(6, Math.round((1000 / Game.STEP_MS) / arrivals));

    Attract.fill(game, Math.round(Ladder.skyAt(level)));
};

/**
 * Opens a clip on a sky that is already busy.
 *
 * Waiting for it to fill would take most of a minute at the rate these levels
 * release, and the first thing anyone sees would be an empty screen. So the
 * balloons are created the usual way and then scattered up the screen, which
 * is what the sky looks like a minute into a real game at that level.
 */
Attract.fill = function (game, count) {
    for (var i = 0; i < count; i++) {
        var balloon = game.randomBalloon();
        // Spread over the lower half only. Four-fifths looked like more of the
        // screen in use, but a balloon placed a fifth from the top has under a
        // second before it leaves — so a cut was followed by the sky visibly
        // draining, and the clip was thinnest exactly when it was newest.
        balloon.ycoord -= Math.random() * game.height * Attract.FILL_DEPTH;
        game.add(balloon);
    }
};

/**
 * One tap from the demo player.
 *
 * It goes for whatever is closest to getting away, which is what a person does
 * and what the bot harness does, and it goes through the entity's own `tapped`
 * — so a reinforced balloon takes two of these and an armoured one takes
 * three, on screen, where a viewer can see it happen.
 */
Attract.tap = function (game) {
    if (Math.random() < Attract.MISS_CHANCE) {
        return;
    }

    var best = null;
    for (var i = 0; i < game.entities.length; i++) {
        var entity = game.entities[i];
        if (entity.kind !== "balloon") {
            continue;
        }
        if (!best || entity.ycoord < best.ycoord) {
            best = entity;
        }
    }

    if (best && best.tapped(game)) {
        game.entities.splice(game.entities.indexOf(best), 1);
    }
};

/** One frame of footage. */
Attract.step = function (game) {
    if (Date.now() >= game.state.endsAt) {
        Attract.cut(game);
        return;
    }

    game.state.steps++;
    game.reap();
    game.spawnBalloon();
    game.step(false);

    if (game.state.steps % game.state.tapEvery === 0) {
        Attract.tap(game);
    }
};
