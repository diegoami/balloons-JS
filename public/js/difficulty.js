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
 * What a difficulty *is* changed with the ladder. It used to carry the numbers
 * that describe the sky: balloon speed, spawn rate, and two ramps keyed to the
 * score. Those live in ladder.js now, one row per level, and a difficulty says
 * only where on that ladder you start, how fast you climb it, and how many
 * mistakes you are allowed.
 *
 * That is what makes the choice mean something from the first second. VHard
 * opening at level 5 is a different game immediately, rather than four minutes
 * of climbing before it becomes one.
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
        /** Where on the ladder the game opens. */
        startLevel: 1,
        /** Seconds of play before the next level. */
        climbEvery: 40
    },
    S: {
        level: "S", label: "Standard", name: "STANDARD",
        maxLost: 7, startLevel: 1, climbEvery: 25
    },
    H: {
        level: "H", label: "Hard", name: "HARD",
        maxLost: 3, startLevel: 3, climbEvery: 22
    },
    V: {
        level: "V", label: "VHard", name: "VHARD",
        maxLost: 1, startLevel: 5, climbEvery: 18
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
