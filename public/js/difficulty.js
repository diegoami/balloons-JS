/**
 * What each difficulty level is.
 *
 * Choosing a difficulty used to mean reassigning four module-level globals in
 * a twenty-line if/else chain inside restart(). There was no object anywhere
 * representing "Hard": the difficulty *was* the global state, so the game could
 * only ever hold one, nothing could be compared or previewed, and tests could
 * not exercise two levels in the same process because the globals persisted
 * between them.
 *
 * The labels lived somewhere else again — layout.js carried "Easy" for the
 * button while game.js carried "EASY" for the HUD — so a level was described
 * in two files that had no way of disagreeing safely.
 *
 * Sky palettes stay in sky.js, keyed by the same level letter: what a level is
 * and how it looks are different concerns.
 *
 * Two of the five numbers that decide how hard a level is used to sit outside
 * this table as globals, which meant a level could not set its own opening:
 * every difficulty began with the same balloon speed and the same spawn rate,
 * and they diverged only as the score climbed. Played by a bot with fixed
 * reflexes, Easy and Standard were the same game — 185 and 187 popped in
 * ninety seconds, both surviving — and the only difference between them was a
 * lives budget that a competent player never spends.
 */

"use strict";
var Difficulty = {};

Difficulty.LEVELS = {
    E: {
        level: "E",
        label: "Easy",
        name: "EASY",
        /** Escaped balloons allowed before the game ends. */
        maxLost: 15,
        /** The fastest a balloon rises at the start, before any ramp. */
        speed: 4,
        /** Chance per step that another balloon is released. */
        frequency: 0.08,
        /** Balloons shrink by 1/this per balloon popped. */
        ratioDecrease: 2000,
        /** Balloons speed up by 1/this per balloon popped. */
        speedIncrease: 500
    },
    S: {
        level: "S", label: "Standard", name: "STANDARD",
        maxLost: 7, speed: 5.5, frequency: 0.1,
        ratioDecrease: 1200, speedIncrease: 200
    },
    H: {
        level: "H", label: "Hard", name: "HARD",
        maxLost: 3, speed: 7, frequency: 0.1,
        ratioDecrease: 700, speedIncrease: 120
    },
    V: {
        level: "V", label: "VHard", name: "VHARD",
        maxLost: 1, speed: 9, frequency: 0.1,
        ratioDecrease: 300, speedIncrease: 80
    }
};

/** Menu order, easiest first. */
Difficulty.ORDER = ["E", "S", "H", "V"];

Difficulty.DEFAULT = "S";

/** Always returns a level, falling back to the default for anything unknown. */
Difficulty.get = function (level) {
    return Difficulty.LEVELS[level] || Difficulty.LEVELS[Difficulty.DEFAULT];
};

Difficulty.all = function () {
    return Difficulty.ORDER.map(Difficulty.get);
};
