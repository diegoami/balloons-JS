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

/** How the sky is drawn from the level the player has climbed to. */
Ladder.LEVELS = [
    { level: 1, speed: 4.0, frequency: 0.07, size: 1.00 },
    { level: 2, speed: 4.6, frequency: 0.08, size: 0.97 },
    { level: 3, speed: 5.2, frequency: 0.09, size: 0.93 },
    { level: 4, speed: 5.8, frequency: 0.097, size: 0.89 },
    { level: 5, speed: 6.4, frequency: 0.10, size: 0.84 },
    { level: 6, speed: 7.0, frequency: 0.103, size: 0.79 },
    { level: 7, speed: 7.8, frequency: 0.11, size: 0.73 },
    { level: 8, speed: 8.6, frequency: 0.117, size: 0.67 },
    { level: 9, speed: 9.4, frequency: 0.127, size: 0.61 },
    { level: 10, speed: 10.4, frequency: 0.137, size: 0.55 }
];

Ladder.MAX = Ladder.LEVELS.length;

/** The row for a level, clamped at both ends. */
Ladder.at = function (level) {
    var n = Math.max(1, Math.min(Ladder.MAX, Math.round(level || 1)));
    return Ladder.LEVELS[n - 1];
};

/**
 * Balloons a second a level asks for, once the sky is full.
 *
 * This is the number the whole table is checked against, so it is worked out
 * from the row rather than written down beside it and left to drift.
 */
Ladder.demand = function (row) {
    var perStep = row.frequency - SPEED_MODIFIER * MAX_BALLOONS;
    return Math.max(0, perStep) * (1000 / Game.STEP_MS);
};
