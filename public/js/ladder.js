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
 * `bossMark` is which saucer turns up: the one from level 6, or the mark II
 * from 18. What each is made of lives in Ladder.SAUCERS.
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
 * `janky` is the share of balloons that wander sideways as they rise, and
 * `fading` the share that thin out as they go. Neither costs extra taps, so
 * neither moves the demand sum -- what they cost is hit rate and search time,
 * which are both the supply side. Both are bounded by what a person can
 * actually deal with rather than by taste: how far one may wander inside a
 * reaction window, and how faint one may get against the sky behind it. See
 * gameballoons.js for both.
 *
 * They are EXCLUSIVE. A balloon is awkward in one way or the other, never
 * both, so what each costs stays separately measurable -- and so the share of
 * the sky that is awkward at all is the sum of the two columns rather than
 * something you have to work out.
 *
 * `fireflies` is how many hover at that level. They are never removed and
 * never reach the top, so this is a population rather than a rate: the
 * spawner tops it up and that is all. They ask for no taps of their own, so
 * they do not move the demand sum -- what they cost is the taps you aim near
 * one and lose, and now a life with each of them.
 *
 * `birds` is the chance per step that a bird enters. A bird costs no taps —
 * you are meant to leave it alone — so it does not move the demand sum at all.
 * What it costs is attention, and a life if you get it wrong.
 *
 * `news` is a headline and a line of explanation for the thing this level
 * brings, and setting it is what makes the game BREAK before the level starts
 * (screens.js). Every level that brings something now carries one: eight
 * breaks in a winning run, which was the intent.
 *
 * THE ARITHMETIC THAT MATTERS
 *
 * A player supplies about 2.29 TAPS a second, measured: the bot clicks 3.6
 * times a second and 2.29 of those land on a balloon or a saucer.
 *
 * That number was 2.1 here for a long time and it was wrong twice over, in a
 * way worth writing down because it is the easiest mistake to make again.
 *
 * It was measured as hits over clicks -- and the harness counts a hit when the
 * SCORE goes up, which happens when a balloon POPS. Demand below is in TAPS: a
 * balloon costs `1 + reinforced + 2 * armoured` of them, so an armoured one
 * takes three taps and pops once. The two sides of the comparison this whole
 * table rests on were in different units, and the supply side was the smaller
 * one. The harness counts taps that land now, separately from pops.
 *
 * And it was taken before the bot could aim. Its accuracy went from 58% to 67%
 * when its targeting was fixed, so even the pops figure had moved.
 *
 * WHAT THE CURVE ACTUALLY DOES
 *
 *   level    1     5     8    10    12    15    18    20
 *   demand  1.49  2.13  2.43  2.54  2.72  2.48  2.40  2.31
 *
 * It crosses supply around level 8 -- later than it used to, because 2.2 asks
 * more of the opening and less of the back half -- peaks about a sixth over at
 * level 12, and eases to just over supply by 20. The old text here claimed it
 * climbed to 2.16 and stopped below a supply of 2.1 -- that the game never asks
 * for more than you have. It does, from level 8 onwards.
 *
 * THAT IS NOT A BUG, AND IT IS WHY THERE ARE LIVES
 *
 * Asking for more taps than a player has does not mean losing. It means some
 * balloons get away, and the question the back half asks is how many you can
 * afford — which is exactly what an allowance of lives is for, and why one is
 * handed out at 12, 15 and 18, either side of the peak. A curve that stayed
 * under supply would be a game you could play perfectly, and a twenty-rung
 * ladder nobody could ever lose is not a ladder.
 *
 * The SHAPE is unchanged: up, a plateau, then easing off. The height is what
 * 2.2 rebalanced. Levels 11 to 20 still get harder by taking taps AWAY
 * rather than asking for more — a balloon that jinks lowers your hit rate, one
 * that fades costs you time to find it, a firefly eats whole taps and a life,
 * a saucer takes a burst. The sky thins out to pay for them, exactly as it
 * already thins where thick balloons arrive, and levels 18 to 20 thin again
 * for the mark II saucer, which asks for eight taps where the first asked
 * five.
 *
 * The budget, now that both sides are in taps. The back half averages about
 * 2.45 taps a second against a supply of 2.29 -- some 0.16 a second more, or
 * about thirty taps, twenty balloons, over its 200 seconds. Three lives are
 * handed out over the same stretch and a run arrives with five: eight lives
 * against twenty balloons is not meant to be survivable by clearing the sky.
 * It is meant to be survivable by choosing which ones to let go, which is the
 * game the back half is actually asking you to play.
 *
 * MEASURED, NOT SOLVED. These figures are what the game does, taken from the
 * harness, and the owner has looked at the outcomes they produce and called
 * the tuning right. Do not re-solve the frequency column against this comment:
 * the comment describes the table, not the other way round.
 */

"use strict";

var Ladder = {};

/**
 * One new thing every other level, from 4 to 18.
 *
 * `reinforced` and `armoured` are the share of balloons that take two and three
 * taps; they arrive at 4 and 10. Between them sit the boss at 6 and birds at 8,
 * and above them janky balloons at 12, fading ones at 14, fireflies at 16 and
 * the mark II saucer at 18 — each its own column. Levels 1 to 3
 * teach the game, the odd levels tighten what you already have, and 19 and 20
 * add nothing new. They are the exam.
 *
 * `janky` FALLS BACK at 14, where `fading` starts, and keeps falling. The
 * ceiling belongs to the two of them together: a sky where two balloons in
 * three are awkward in one way or another stops reading as "some of these are
 * awkward" and starts reading as the game being unsteady. Their sum runs from
 * 0.20 at 12 to 0.56 at the top, and the split between them moved toward
 * fading after a playtest: at the two to four balloons the sky actually holds,
 * one fading balloon in eight meant whole levels went by without one being on
 * screen at all, and the feature read as not being there.
 *
 * The spawn rate FALLS where a heavier balloon arrives — 0.0630 at 3, 0.0596 at
 * 4 — and that is not a mistake. A three-tap balloon costs three of the two
 * taps a second anyone has, so the sky has to thin out as the balloons in it
 * get heavier. Fewer balloons, more work each. Every frequency below was solved
 * from the demand curve and the mix rather than picked and hoped over.
 */
Ladder.LEVELS = [
    { level: 1 , speed:  4.0, frequency: 0.0509, size: 1.00, reinforced: 0.00, armoured: 0.00 },
    { level: 2 , speed:  4.4, frequency: 0.0572, size: 0.97, reinforced: 0.00, armoured: 0.00 },
    { level: 3 , speed:  4.8, frequency: 0.0630, size: 0.95, reinforced: 0.00, armoured: 0.00 },
    { level: 4 , speed:  5.2, frequency: 0.0596, size: 0.92, reinforced: 0.15, armoured: 0.00,
      news: ["Reinforced balloons", "Two taps, and they rise slower."] },
    { level: 5 , speed:  5.6, frequency: 0.0629, size: 0.90, reinforced: 0.16, armoured: 0.00 },
    { level: 6 , speed:  6.0, frequency: 0.0617, size: 0.88, reinforced: 0.17, armoured: 0.00, bossAt: 1, bossEvery: 540,
      news: ["A saucer", "Tap it down before it shoots. Five taps, three seconds."] },
    { level: 7 , speed:  6.4, frequency: 0.0662, size: 0.86, reinforced: 0.18, armoured: 0.00, bossAt: 1, bossEvery: 520 },
    { level: 8 , speed:  6.9, frequency: 0.0702, size: 0.84, reinforced: 0.20, armoured: 0.00, birds: 0.004,
      news: ["Birds", "Do not touch them. They cost a life."], bossAt: 2, bossEvery: 500 },
    { level: 9 , speed:  7.4, frequency: 0.0746, size: 0.82, reinforced: 0.22, armoured: 0.00, birds: 0.005, bossAt: 2, bossEvery: 480 },
    { level: 10, speed:  7.5, frequency: 0.0704, size: 0.80, reinforced: 0.18, armoured: 0.06,
      news: ["Armoured balloons", "Three taps. Worth six points."], birds: 0.005, bossAt: 3, bossEvery: 460 },
    { level: 11, speed:  7.6, frequency: 0.0717, size: 0.78, reinforced: 0.18, armoured: 0.075, birds: 0.006, bossAt: 3, bossEvery: 440 },
    { level: 12, speed:  7.7, frequency: 0.0707, size: 0.76, reinforced: 0.18, armoured: 0.09, life: 1, birds: 0.006, bossAt: 4, bossEvery: 420, janky: 0.20,
      news: ["Janky balloons", "Some of them wander as they rise. They are bigger, too."] },
    { level: 13, speed:  7.8, frequency: 0.0687, size: 0.74, reinforced: 0.19, armoured: 0.095, birds: 0.007, bossAt: 4, bossEvery: 400, janky: 0.24 },
    { level: 14, speed:  7.9, frequency: 0.0655, size: 0.72, reinforced: 0.20, armoured: 0.10, birds: 0.007, bossAt: 4, bossEvery: 390, janky: 0.18, fading: 0.24,
      news: ["Fading balloons", "Some of them thin out as they rise. Take them early."] },
    { level: 15, speed:  8.0, frequency: 0.0621, size: 0.70, reinforced: 0.20, armoured: 0.11, life: 1, birds: 0.008, bossAt: 5, bossEvery: 380, janky: 0.19, fading: 0.26 },
    { level: 16, speed:  8.2, frequency: 0.0602, size: 0.68, reinforced: 0.21, armoured: 0.115, birds: 0.008, bossAt: 5, bossEvery: 370, fireflies: 2,
      news: ["Fireflies", "Pretty, and in the way. Touching one costs a life."], janky: 0.19, fading: 0.28 },
    { level: 17, speed:  8.3, frequency: 0.0600, size: 0.66, reinforced: 0.22, armoured: 0.12, birds: 0.009, bossAt: 5, bossEvery: 360, fireflies: 3, janky: 0.20, fading: 0.30 },
    { level: 18, speed:  8.4, frequency: 0.0581, size: 0.64, reinforced: 0.22, armoured: 0.13, life: 1, birds: 0.009, bossAt: 6, bossEvery: 300, bossMark: 2, fireflies: 3, janky: 0.21, fading: 0.31,
      news: ["A bigger saucer", "Eight taps, and it will not hold still."] },
    { level: 19, speed:  8.6, frequency: 0.0554, size: 0.62, reinforced: 0.23, armoured: 0.135, birds: 0.010, bossAt: 6, bossEvery: 285, bossMark: 2, fireflies: 4, janky: 0.21, fading: 0.33 },
    { level: 20, speed:  8.8, frequency: 0.0543, size: 0.60, reinforced: 0.24, armoured: 0.14, birds: 0.010, bossAt: 6, bossEvery: 270, bossMark: 2, fireflies: 4, janky: 0.22, fading: 0.34 }
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

/**
 * The two saucers.
 *
 * `taps` and `fuse` are the fight. They move TOGETHER on purpose: 5 taps in 3
 * seconds and 8 in 4.8 both ask for 1.67 taps a second, against the 2.29 a
 * player supplies. The mark II is not harder per second -- a fight that asked
 * for more than a person can produce would not be a fight -- it is harder
 * because it is longer, because it moves, and because every one of those 4.8
 * seconds is a second the sky is going unwatched.
 *
 * `points` keeps the rate honest: 2.4 a tap for both, the same deal an
 * armoured balloon offers. A tougher boss worth the same as an easier one is
 * a thing players learn to walk away from.
 *
 * `reach` is how far it may get from where you aimed while you are deciding,
 * in its own radii, and it is the same bound a janky balloon lives under. Half
 * a radius is the limit of what is fair; the first saucer's existing drift
 * works out at about a quarter, so it keeps that and the mark II takes the
 * whole allowance. `turns` is how often it picks a fresh heading -- never, for
 * the first one, which only turns when it meets a wall.
 *
 * `size` and `wander` are what makes it read as a different machine: bigger,
 * and free to move up and down as well as across.
 */
Ladder.SAUCERS = [
    { mark: 1, taps: 5, fuse: 90,  points: 12, reach: 0.25, turns: 0,  size: 1.00, wander: 0.00 },
    { mark: 2, taps: 8, fuse: 144, points: 20, reach: 0.50, turns: 15, size: 1.25, wander: 0.55 }
];

/** The saucer a level sends, clamped so an unset column means the first one. */
Ladder.saucer = function (mark) {
    return Ladder.SAUCERS[Math.max(1, Math.min(Ladder.SAUCERS.length, mark || 1)) - 1];
};

Ladder.skin = function (n) {
    return Ladder.SKINS[Math.max(1, Math.min(Ladder.SKINS.length, n)) - 1];
};

/**
 * Whether the next balloon is awkward, and in which of the two ways.
 *
 * ONE roll for both columns rather than one each, so they cannot land on the
 * same balloon. Two independent rolls would give balloons that wander AND
 * fade -- two taxes at once on a sky meant to charge one at a time -- and
 * would make each column's measured cost depend on the other's share.
 */
Ladder.rollQuirk = function (row) {
    var roll = Math.random();
    if (roll < (row.janky || 0)) {
        return "janky";
    }
    if (roll < (row.janky || 0) + (row.fading || 0)) {
        return "fading";
    }
    return null;
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

/**
 * Lives a run has been handed by the time it is playing a level.
 *
 * Only the levels BELOW it plus itself, because a life is awarded on arriving
 * and arriving is what a practice run skips. A run that opens at 18 is meant
 * to be level 18 as level 18 is played, and level 18 as it is played has
 * collected three extra lives on the way -- so practising it with five was
 * practising a level the game does not contain.
 */
Ladder.livesBy = function (level) {
    var n = Math.max(1, Math.min(Ladder.MAX, Math.round(level || 1)));
    var given = 0;
    for (var i = 0; i < n; i++) {
        given += Ladder.LEVELS[i].life || 0;
    }
    return given;
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
 * under twenty. The throttle is a negative feedback loop -- fewer balloons up
 * means less throttling means more arrivals -- so the emptier the sky, the
 * harder the game pushes.
 *
 * MEASURED, NOT ASSUMED, AND RE-MEASURED FOR 2.2. The values below are the
 * pooled per-level means of ten full-cap runs at a careful mouse (1280x720,
 * two batches of five runs, 250ms reaction, 12px aim) -- the strong-player
 * configuration this column is meant to describe. An earlier version of this
 * column said 5 to 11 balloons across the middle and understated every demand
 * figure by 20 to 25%, which is how a table documented as peaking at 2.16 taps
 * a second was really peaking at 2.82.
 *
 * THE SPREAD IS LARGE AND IS NOT A TUNING SIGNAL. Within a level the count
 * swings by about a standard deviation as balloons arrive and pop; more to the
 * point, the batch-to-batch spread is real and largest late -- level 20 read
 * 3.3 in one batch and 1.5 in the other. So these are honest means, not
 * precise ones, and nothing should be asserted adjacent-level about them.
 *
 * OCCUPANCY IS NOT A PROPERTY OF THE LADDER. It is a property of the ladder
 * AND the player: what is left in the sky is what you did not get to, so the
 * same levels sit far fuller under a thumb's aim than under a careful mouse.
 * These are the strong-player numbers, which is the honest choice for a column
 * whose job is to say how hard the game pushes when it is being played well.
 *
 * They are documentation, and one dial. `demand` reads them, and so does the
 * title screen's footage, which fills the sky to whatever this says a level
 * holds -- so a wrong number here made the demo look like a fuller game than
 * the one behind it. Nothing in a round reads them: the spawner throttles on
 * the live count.
 */
Ladder.SKY = [
    0.80, 0.80, 1.10, 1.05, 1.10, 1.50, 1.65, 1.85, 2.70, 3.50,
    2.50, 2.65, 2.85, 2.35, 2.65, 2.60, 2.40, 2.75, 3.75, 2.40
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
