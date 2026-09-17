/**
 * The ten levels a game climbs through, and what each one is.
 *
 * Difficulty used to be two ramps keyed to the score: balloons shrank by
 * 1/ratioDecrease and sped up by 1/speedIncrease per balloon popped. Four
 * numbers nobody could picture, spread across four levels, and no way to answer
 * "what does minute three feel like?" except by playing it.
 *
 * A ladder is the same idea made legible. Ten rows you can read, tune and test,
 * climbed on time rather than on score, with everything a level is in one
 * place. The features of v2 arrive as more columns: a level says whether it has
 * reinforced balloons, whether birds cross it, whether the boss can appear.
 *
 * WHAT THE NUMBERS MEAN
 *
 * `speed` is the fastest a balloon rises at, before the height scaling that
 * keeps the crossing time the same on any shaped window.
 *
 * `frequency` is the chance per step that another balloon is released, before
 * the throttle that slows spawning as the sky fills (SPEED_MODIFIER). The rate
 * it works out to at a full sky is `demand` below, in balloons a second.
 *
 * `size` multiplies the balloon radius, floored so a balloon never falls under
 * the touch minimum however far the ladder climbs.
 *
 * THE ARITHMETIC THAT MATTERS
 *
 * A player supplies about 2.1 taps a second: the bot clicks 3.6 times a second
 * and lands 58% of them, and a good human is faster but not by much. Demand
 * rises past that somewhere around level 5, which is the design: an arcade game
 * ends because the game eventually outruns you, and where it outruns you is
 * your score. What this table must never do is cross that line at level 2, or
 * fail to cross it at all.
 */

"use strict";

var Ladder = {};

/**
 * How the sky is drawn from the level the player has climbed to.
 *
 * `reinforced` and `armoured` are the share of balloons that take two and three
 * taps. They start at rung 4 and 7, so a player meets one new thing at a time
 * with room to learn it.
 *
 * The spawn rate FALLS where they arrive — 0.090 at rung 3, 0.088 at rung 4 —
 * and that is not a mistake. A three-tap balloon costs three of the two taps a
 * second anyone has, so the sky has to thin out as the balloons in it get
 * heavier. Fewer balloons, more work each. The frequencies below were solved
 * from the demand curve and the mix rather than picked and hoped over.
 */
Ladder.LEVELS = [
    { level: 1, speed: 4.0, frequency: 0.0700, size: 1.00, reinforced: 0, armoured: 0 },
    { level: 2, speed: 4.6, frequency: 0.0800, size: 0.97, reinforced: 0, armoured: 0 },
    { level: 3, speed: 5.2, frequency: 0.0900, size: 0.93, reinforced: 0, armoured: 0 },
    { level: 4, speed: 5.8, frequency: 0.0883, size: 0.89, reinforced: 0.15, armoured: 0 },
    { level: 5, speed: 6.4, frequency: 0.0893, size: 0.84, reinforced: 0.18, armoured: 0 },
    { level: 6, speed: 7.0, frequency: 0.0908, size: 0.79, reinforced: 0.20, armoured: 0 },
    { level: 7, speed: 7.8, frequency: 0.0888, size: 0.73, reinforced: 0.20, armoured: 0.08 },
    { level: 8, speed: 8.6, frequency: 0.0913, size: 0.67, reinforced: 0.22, armoured: 0.10 },
    { level: 9, speed: 9.4, frequency: 0.0947, size: 0.61, reinforced: 0.22, armoured: 0.14 },
    { level: 10, speed: 10.4, frequency: 0.0982, size: 0.55, reinforced: 0.25, armoured: 0.16 }
];

/**
 * What a balloon is like when it has more than one skin.
 *
 * Bigger, because a heavier balloon should look heavier, and because three taps
 * on a small target is unfair. Slower, because the taps have to fit somewhere:
 * a balloon that rises at half speed gives roughly twice as long to spend them.
 * Worth more, because a three-tap balloon that scores one point is a bad deal
 * and a player who works that out will start ignoring them, which turns the
 * whole feature into a penalty.
 */
Ladder.SKINS = [
    { skin: 1, size: 1.00, speed: 1.00, points: 1, rim: 0 },
    { skin: 2, size: 1.15, speed: 0.72, points: 3, rim: 0.055 },
    { skin: 3, size: 1.30, speed: 0.55, points: 6, rim: 0.085 }
];

Ladder.skin = function (n) {
    return Ladder.SKINS[Math.max(1, Math.min(Ladder.SKINS.length, n)) - 1];
};

/** Picks how many skins the next balloon has, from the rung's mix. */
Ladder.rollSkin = function (row) {
    var roll = Math.random();
    if (roll < (row.armoured || 0)) {
        return 3;
    }
    if (roll < (row.armoured || 0) + (row.reinforced || 0)) {
        return 2;
    }
    return 1;
};

Ladder.MAX = Ladder.LEVELS.length;

/**
 * Seconds of play before the next rung.
 *
 * One pace for everybody. Four difficulties climbing at four speeds meant four
 * leaderboards that could not be compared with each other; one ladder at one
 * pace means every score on the board was earned the same way.
 */
Ladder.CLIMB_SECONDS = 25;

/** The row for a level, clamped at both ends. */
Ladder.at = function (level) {
    var n = Math.max(1, Math.min(Ladder.MAX, Math.round(level || 1)));
    return Ladder.LEVELS[n - 1];
};

/** Balloons a second a level releases, once the sky is full. */
Ladder.arrivals = function (row) {
    var perStep = row.frequency - SPEED_MODIFIER * MAX_BALLOONS;
    return Math.max(0, perStep) * (1000 / Game.STEP_MS);
};

/** Taps the average balloon on this rung costs. */
Ladder.meanTaps = function (row) {
    return 1 + (row.reinforced || 0) + 2 * (row.armoured || 0);
};

/**
 * TAPS a second a level asks for, once the sky is full.
 *
 * This is the number the whole table is checked against, so it is worked out
 * from the row rather than written down beside it and left to drift. Counting
 * balloons stopped being enough the moment one of them could take three taps:
 * a sky with fewer, heavier balloons in it asks for more, not less.
 */
Ladder.demand = function (row) {
    return Ladder.arrivals(row) * Ladder.meanTaps(row);
};
