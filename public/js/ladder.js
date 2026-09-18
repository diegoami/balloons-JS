/**
 * The twenty levels a game climbs through, and what each one is.
 *
 * Difficulty used to be two ramps keyed to the score: balloons shrank by
 * 1/ratioDecrease and sped up by 1/speedIncrease per balloon popped. Four
 * numbers nobody could picture, spread across four levels, and no way to answer
 * "what does minute three feel like?" except by playing it.
 *
 * A ladder is the same idea made legible. Twenty rows you can read, tune and
 * test, climbed on time rather than on score, with everything a level is in one
 * place. The features of v2 arrive as more columns: a level says whether it has
 * reinforced balloons, whether birds cross it, whether the boss can appear.
 *
 * WHAT THE NUMBERS MEAN
 *
 * `speed` is the fastest a balloon rises at, before the height scaling that
 * keeps the crossing time the same on any shaped window.
 *
 * `frequency` is the chance per step that another balloon is released, before
 * the throttle that slows spawning as the sky fills (SPEED_MODIFIER).
 *
 * `size` multiplies the balloon radius, floored so a balloon never falls under
 * the touch minimum however far the ladder climbs.
 *
 * `life` is a life awarded on arriving at that level.
 *
 * `bossAt` is how few balloons have to be up before a saucer arrives, and
 * `bossEvery` the steps that must pass since the last one settled. Both from
 * level 6. The threshold RISES as the ladder climbs: clearing down to one
 * balloon is a real feat at level 6 and impossible by level 12, so a fixed
 * number would mean one boss per game and never another. The cooldown falls,
 * so they come more often at the top. Without it the moment after a boss dies
 * is the emptiest the sky ever gets — which is the trigger condition — and you
 * would fight two back to back.
 *
 * `janky` is the share of balloons that wander sideways as they rise. They
 * cost no extra taps, so they do not move the demand sum -- what they cost is
 * hit rate, which is the supply side. How far one may wander in a reaction
 * window is bounded by its own radius; see gameballoons.js.
 *
 * `fireflies` is how many hover at that level. They are never removed and
 * never reach the top, so this is a population rather than a rate: the
 * spawner tops it up and that is all. They cost no lives and no taps of
 * their own, so they do not move the demand sum either -- what they cost is
 * the taps you aim near one and lose.
 *
 * `birds` is the chance per step that a bird enters. A bird costs no taps —
 * you are meant to leave it alone — so it does not move the demand sum at all.
 * What it costs is attention, and a life if you get it wrong.
 *
 * `news` is a headline and a line of explanation for the thing this level
 * brings, and setting it is what makes the game BREAK before the level starts
 * (screens.js). Only the levels whose feature exists carry one: announcing
 * fading balloons at 14 before they exist would be a lie, so 14 and 18 get
 * theirs when their phase lands. Eight breaks in a winning run is
 * the intent; six of them work today.
 *
 * THE ARITHMETIC THAT MATTERS
 *
 * A player supplies about 2.1 taps a second: the bot clicks 3.6 times a second
 * and lands 58% of them, and a good human is faster but not by much.
 *
 * A game that can be WON cannot simply outrun that. The old ten-rung table was
 * an arcade curve — demand crossed 2.1 at level 5 and reached 3.2 by level 10,
 * so the game always won and where it beat you was your score. Extending that
 * slope to twenty would ask for six taps a second at the top, and nobody would
 * ever see the end of it.
 *
 * So demand climbs to the ceiling and then STOPS. It rises to about 2.16 at
 * level 10 and falls away again through the back half. That is not a mistake
 * and not softness: levels 11 to 20 are meant to get harder by taking taps
 * AWAY rather than asking for more of them — a balloon that jinks lowers your
 * hit rate, one that fades costs you time to find it, a firefly eats whole
 * taps, a boss takes a burst. None of those are built yet, which is why the
 * top of this table is currently gentler than it will feel. The sky thins out
 * to pay for them, exactly as it already thins where thick balloons arrive.
 *
 * The budget is small enough to write down. Five lives, ten rungs and about
 * 1.5 taps per balloon means the whole back half can afford some seven and a
 * half taps more than a player supplies, across 200 seconds — a net pressure
 * of 0.04 taps a second. That is why a life is awarded at 12, 15 and 18.
 */

"use strict";

var Ladder = {};

/**
 * One new thing every other level, from 4 to 18.
 *
 * `reinforced` and `armoured` are the share of balloons that take two and three
 * taps; they arrive at 4 and 10. Between them sit the boss at 6 and birds at 8,
 * and above them janky balloons at 12, fading ones at 14, the firefly at 16 and
 * the second boss at 18 — each its own column as it is built. Levels 1 to 3
 * teach the game, the odd levels tighten what you already have, and 19 and 20
 * add nothing new. They are the exam.
 *
 * The spawn rate FALLS where a heavier balloon arrives — 0.0833 at 3, 0.0807 at
 * 4 — and that is not a mistake. A three-tap balloon costs three of the two
 * taps a second anyone has, so the sky has to thin out as the balloons in it
 * get heavier. Fewer balloons, more work each. Every frequency below was solved
 * from the demand curve and the mix rather than picked and hoped over.
 */
Ladder.LEVELS = [
    { level: 1 , speed:  4.0, frequency: 0.0422, size: 1.00, reinforced: 0.00, armoured: 0.00 },
    { level: 2 , speed:  4.4, frequency: 0.0502, size: 0.97, reinforced: 0.00, armoured: 0.00 },
    { level: 3 , speed:  4.8, frequency: 0.0569, size: 0.94, reinforced: 0.00, armoured: 0.00 },
    { level: 4 , speed:  5.2, frequency: 0.0556, size: 0.91, reinforced: 0.15, armoured: 0.00,
      news: ["Reinforced balloons", "Two taps, and they rise slower."] },
    { level: 5 , speed:  5.6, frequency: 0.0629, size: 0.88, reinforced: 0.18, armoured: 0.00 },
    { level: 6 , speed:  6.0, frequency: 0.0665, size: 0.85, reinforced: 0.20, armoured: 0.00, bossAt: 1, bossEvery: 540,
      news: ["A saucer", "Tap it down before it shoots. Five taps, three seconds."] },
    { level: 7 , speed:  6.4, frequency: 0.0693, size: 0.82, reinforced: 0.22, armoured: 0.00, bossAt: 1, bossEvery: 520 },
    { level: 8 , speed:  6.9, frequency: 0.0719, size: 0.79, reinforced: 0.24, armoured: 0.00, birds: 0.004,
      news: ["Birds", "Do not touch them. They cost a life."], bossAt: 2, bossEvery: 500 },
    { level: 9 , speed:  7.4, frequency: 0.0735, size: 0.76, reinforced: 0.26, armoured: 0.00, birds: 0.005, bossAt: 2, bossEvery: 480 },
    { level: 10, speed:  7.9, frequency: 0.0686, size: 0.73, reinforced: 0.25, armoured: 0.08,
      news: ["Armoured balloons", "Three taps. Worth six points."], birds: 0.005, bossAt: 3, bossEvery: 460 },
    { level: 11, speed:  8.4, frequency: 0.0680, size: 0.70, reinforced: 0.25, armoured: 0.10, birds: 0.006, bossAt: 3, bossEvery: 440 },
    { level: 12, speed:  8.9, frequency: 0.0675, size: 0.68, reinforced: 0.25, armoured: 0.12, life: 1, birds: 0.006, bossAt: 4, bossEvery: 420, janky: 0.20,
      news: ["Janky balloons", "Some of them wander as they rise. They are bigger, too."] },
    { level: 13, speed:  9.4, frequency: 0.0656, size: 0.66, reinforced: 0.26, armoured: 0.13, birds: 0.007, bossAt: 4, bossEvery: 400, janky: 0.24 },
    { level: 14, speed:  9.9, frequency: 0.0609, size: 0.64, reinforced: 0.26, armoured: 0.14, birds: 0.007, bossAt: 4, bossEvery: 390, janky: 0.28 },
    { level: 15, speed: 10.4, frequency: 0.0587, size: 0.62, reinforced: 0.27, armoured: 0.15, life: 1, birds: 0.008, bossAt: 5, bossEvery: 380, janky: 0.30 },
    { level: 16, speed: 10.9, frequency: 0.0565, size: 0.60, reinforced: 0.27, armoured: 0.16, birds: 0.008, bossAt: 5, bossEvery: 370, fireflies: 2,
      news: ["Fireflies", "Pretty, harmless, and in the way. Taps land on them."], janky: 0.32 },
    { level: 17, speed: 11.4, frequency: 0.0543, size: 0.58, reinforced: 0.28, armoured: 0.17, birds: 0.009, bossAt: 5, bossEvery: 360, fireflies: 3, janky: 0.34 },
    { level: 18, speed: 11.9, frequency: 0.0521, size: 0.56, reinforced: 0.28, armoured: 0.18, life: 1, birds: 0.009, bossAt: 6, bossEvery: 340, fireflies: 3, janky: 0.36 },
    { level: 19, speed: 12.4, frequency: 0.0500, size: 0.54, reinforced: 0.30, armoured: 0.19, birds: 0.010, bossAt: 6, bossEvery: 320, fireflies: 4, janky: 0.38 },
    { level: 20, speed: 13.0, frequency: 0.0478, size: 0.52, reinforced: 0.30, armoured: 0.20, birds: 0.010, bossAt: 6, bossEvery: 300, fireflies: 4, janky: 0.40 }
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
 *
 * Twenty levels at twenty seconds is a winning run of 6:40, and puts a new
 * thing in front of the player every forty seconds.
 */
Ladder.CLIMB_SECONDS = 20;

/**
 * The levels a practice run can open at.
 *
 * Not all twenty. Stepping one at a time to reach 18 is seventeen taps, and
 * the levels anyone wants to practise are the ones where something new
 * arrives — which the ladder already knows, because those are exactly the
 * rows carrying `news`. So the list derives itself, and grows as each phase
 * lands rather than needing to be kept in step by hand.
 *
 * One at the front because that is the real game, and the top at the back
 * because the last rung is the one worth rehearsing.
 */
Ladder.starts = function () {
    var levels = [1];
    Ladder.LEVELS.forEach(function (row) {
        if (row.news && levels.indexOf(row.level) < 0) {
            levels.push(row.level);
        }
    });
    if (levels.indexOf(Ladder.MAX) < 0) {
        levels.push(Ladder.MAX);
    }
    return levels;
};

/** The row for a level, clamped at both ends. */
Ladder.at = function (level) {
    var n = Math.max(1, Math.min(Ladder.MAX, Math.round(level || 1)));
    return Ladder.LEVELS[n - 1];
};

/**
 * How full the sky actually gets at each level, measured rather than assumed.
 *
 * THIS COLUMN EXISTS BECAUSE THE DEMAND SUM WAS WRONG. `arrivals` divided by a
 * full sky of MAX_BALLOONS, which the game never reaches: the spawn throttle
 * slows arrivals as the sky fills, so the sky settles at an equilibrium well
 * under twenty. Measured with the bot, it runs from 2 balloons at level 1 to
 * about 17 by level 10, and every demand figure computed against 20 was
 * understated by the difference — by 34% at the bottom and 24% in the middle.
 *
 * Which means the tidy curve the last three phases were tuned against never
 * existed in the running game. Real demand was nearly FLAT at 2.0 to 2.45 taps
 * a second from level 1 upward, because the throttle is a negative feedback
 * loop: fewer balloons up means less throttling means more arrivals. What
 * actually escalates as the ladder climbs is the speed, the size and the taps
 * per balloon — not the rate.
 *
 * So occupancy is a parameter now, not a constant. These are bot measurements,
 * and they are noisy above about level 15, where only a run that gets that far
 * contributes samples at all. They are documentation of where the game sits,
 * not a dial: changing one changes what `demand` reports, never what the game
 * does. The frequencies were solved against them by iteration — tune, measure,
 * damp, repeat — because the two chase each other: cutting the spawn rate
 * empties the sky, which throttles less, which feeds arrivals back.
 */
Ladder.SKY = [
    1.1, 1.2, 1.7, 2.6, 3.8, 4.2, 5.8, 8.2, 11.6, 10.2,
    10.5, 9.9, 10.2, 8.3, 6.9, 5.5, 9.1, 5.6, 5.5, 5.5
];

/** How full the sky is when a given level is being played. */
Ladder.skyAt = function (level) {
    var n = Math.max(1, Math.min(Ladder.MAX, Math.round(level || 1)));
    return Ladder.SKY[n - 1];
};

/**
 * Balloons a second a level releases, at a given sky.
 *
 * `up` defaults to the sky that level actually runs at rather than to a full
 * one, because the full-sky figure is the one that misled three phases.
 */
Ladder.arrivals = function (row, up) {
    var sky = up === undefined ? Ladder.skyAt(row.level) : up;
    var perStep = row.frequency - SPEED_MODIFIER * sky;
    return Math.max(0, perStep) * (1000 / Game.STEP_MS);
};

/** Taps the average balloon on this rung costs. */
Ladder.meanTaps = function (row) {
    return 1 + (row.reinforced || 0) + 2 * (row.armoured || 0);
};

/**
 * TAPS a second a level asks for.
 *
 * This is the number the whole table is checked against, so it is worked out
 * from the row rather than written down beside it and left to drift. Counting
 * balloons stopped being enough the moment one of them could take three taps:
 * a sky with fewer, heavier balloons in it asks for more, not less.
 *
 * Pass `up` to ask what a level would demand at some other occupancy; leaving
 * it out asks what it demands in the game as played.
 */
Ladder.demand = function (row, up) {
    return Ladder.arrivals(row, up) * Ladder.meanTaps(row);
};
