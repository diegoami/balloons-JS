"use strict";

var ESCAPE_COORDS = -10;

/** How long a tap that did not pop a balloon stays visible, in steps. */
var HIT_FLASH_STEPS = 5;

/**
 * How far a janky balloon may get from where you aimed, in its own radii,
 * while you are deciding: see REACTION_STEPS in entities.js. Half a radius is
 * the room that leaves.
 */
var JANKY_REACH = 0.5;

/** Steps between one sideways drift and the next. */
var JANKY_TURN_STEPS = 22;

/**
 * The slowest a balloon may rise, as a share of its rung's speed.
 *
 * It used to be an absolute 0.25 pixels a step added to a random share of the
 * rung -- so the ladder's `speed` column set only the FASTEST a balloon went,
 * and the slowest balloon in the game was the same crawl at level 20 as at
 * level 1. Measured, that put a quarter of level 1's balloons over twenty
 * seconds and four in a hundred over a minute, on a screen where a level
 * lasts twenty seconds. It cost twice over, because the spawn throttle counts
 * balloons: one ninety-six-second loiterer holds a slot for five levels and
 * suppresses the arrivals that would have made the sky feel alive.
 *
 * So the floor is a share of the rung, and the share comes from the ladder's
 * own pace: A BALLOON SHOULD NOT OUTLIVE THE LEVEL IT WAS BORN IN. Crossing
 * the reference screen takes REFERENCE_HEIGHT / (speed * share * 30) seconds,
 * and setting that to CLIMB_SECONDS at the gentlest rung gives
 * 720 / (4 * 30 * 20) = 0.3. A test keeps it honest if either number moves.
 */
var BALLOON_SLOWEST = 0.3;

/** How much bigger a janky balloon is than a steady one of the same skin. */
var JANKY_SIZE = 1.18;

/**
 * How much of its climb a fading balloon spends at full strength.
 *
 * Half, and the half is not a taste call either. A balloon may only fade where
 * it can go fainter and still be found, and the bottom of the sky is not such
 * a place: at dusk the horizon is a bright orange band, so a colour pale
 * enough to clear 3:1 against the near-black top of that sky is nearly the
 * same brightness as the bottom of it. Starting the fade lower down did not
 * make balloons fade more, it made them ineligible -- at a third of the climb
 * only about one colour in five hundred could be faded at level 14 at all.
 *
 * It also reads better, which is a happy accident rather than the reason: a
 * balloon is solid for the whole lower half of the screen, so every one of
 * them gives you a clear look on the way in, and only the ones you let get
 * high become work to find.
 */
var FADE_HOLD = 0.5;

/** Heights the floor is checked at, across the part of the climb that fades. */
var FADE_SAMPLES = 6;

/**
 * The faintest a fading balloon is allowed to get, worked out per balloon.
 *
 * NOT A CHOSEN OPACITY. A balloon is a graphical object you have to be able to
 * make out in order to play at all, and WCAG puts those at 3:1 against their
 * background (SC 1.4.11) -- so the floor is whatever opacity still clears 3:1
 * against the sky that is actually behind this balloon, and it is a different
 * number for every balloon and every level.
 *
 * Three things decide which sky it is compared against, and getting any of
 * them wrong quietly kills the feature.
 *
 * BOTH ENDS OF THE GRADIENT, not the base colour. The dark stop covers most of
 * the shape and is the end that disappears first into a night sky.
 *
 * AT THE OPACITY THE FADE HAS THERE, not at the floor. Checking every height
 * at the floor's opacity was the first version of this, and it is simply the
 * wrong sum: it asks a balloon to survive the top of the sky while it is still
 * down in the middle of it, nearly solid. Under that rule two fading balloons
 * in a thousand were allowed to fade at level 14 and the feature did not
 * exist. The fade is a straight line from 1 at the hold line to the floor at
 * the top, so `gone` of the way along it the opacity is `1 - gone * (1 -
 * floor)`; wanting that to be at least `need` rearranges to
 * `floor >= 1 - (1 - need) / gone`, and the floor is the strictest of those.
 *
 * ALONG THE PATH IT WILL FLY, not down the column it spawned in. A balloon
 * drifts up to half a pixel a step sideways, eighty by the top of a tall
 * window, and eighty pixels of dusk sky is 1.38 times as bright — enough on
 * its own to land a balloon derived at 3:1 down at 2.2 by the time it arrives.
 * It knows both its velocities when it is made and neither ever changes, so
 * where it will be when it is faintest is not a guess.
 *
 * A colour that cannot clear 3:1 at full opacity anywhere along that stretch
 * gets 1 back and does not fade. The promise is that a fading balloon clears
 * 3:1 the whole way up, not merely that fading was not what took it under.
 */
var fadeFloor = function (light, dark, skyFor) {
    // Aimed a little above 3:1, because the sky here is a sampled point and a
    // balloon covers a patch of it.
    var wanted = Sky.MIN_OBJECT_CONTRAST * Sky.SAMPLING_MARGIN;
    var floor = 0;

    for (var i = 0; i < FADE_SAMPLES; i++) {
        var gone = i / (FADE_SAMPLES - 1);
        var climbed = FADE_HOLD + (1 - FADE_HOLD) * gone;
        var sky = skyFor(climbed);
        var need = Math.max(
            Sky.faintestOver(light, sky, wanted),
            Sky.faintestOver(dark, sky, wanted));

        // Giving up the moment a colour is ruled out is what makes trying four
        // hundred of them cost nothing: most fail on the first sample.
        if (need >= 1) {
            return 1;
        }
        if (gone > 0) {
            floor = Math.max(floor, 1 - (1 - need) / gone);
        }
    }

    return Math.max(0, Math.min(1, floor));
};

/** Where a balloon really is, once the walls it bounces off are accounted for. */
var bounced = function (x, max) {
    if (!(max > 0)) {
        return 0;
    }
    var span = 2 * max;
    var wrapped = ((x % span) + span) % span;
    return wrapped > max ? span - wrapped : wrapped;
};

/**
 * How many colours are tried before giving up on fading one balloon.
 *
 * Not a round number for its own sake. Level 14 is the hardest sky in the game
 * to fade against — dusk puts a near-black top over a bright orange horizon,
 * so one colour has to clear 3:1 against both — and barely one random colour
 * in a hundred qualifies there. The level that ANNOUNCES fading balloons is
 * the one that can least afford to be short of them, and it is what sets this
 * number: forty tries delivered two thirds of the share its row asks for, a
 * hundred and sixty delivered five sixths, four hundred delivered all of it
 * while the row asked for one balloon in eight -- and then the row was raised
 * to one in four after a playtest found the feature too rare to notice, and
 * four hundred dropped back to 78%. The search has to be as deep as the share
 * is wide.
 *
 * Brute force is the right tool here. Colours are free, and a try that is
 * going to fail costs two contrast comparisons before it gives up.
 */
var FADE_TRIES = 1500;

/** The colour an ordinary balloon gets: any of them, with no thought at all. */
var randomBalloonColour = function () {
    var channel = function () { return Math.floor(Math.random() * 255); };
    return { r: channel(), g: channel(), b: channel() };
};

/**
 * A colour that can afford to fade, and the floor that goes with it.
 *
 * Balloon colours are drawn at random with no regard for the sky at all, which
 * is fine for a balloon that stays solid and useless for one that is meant to
 * thin out: measured against the real skies, barely one random colour in a
 * hundred at level 14 has anywhere to fade TO before it hits 3:1. Rolling the
 * quirk and then throwing away almost every balloon it lands on is a feature
 * that does not happen, which is what the first measurement of this showed.
 *
 * So a balloon that is going to fade keeps drawing colours until it finds one
 * that can, and the sky it is being drawn against decides which those are. If
 * none of them work it stays an ordinary balloon, rather than a fading one
 * that does not fade.
 */
var fadeableColour = function (colour, skyFor) {
    var tried = colour;

    for (var i = 0; i < FADE_TRIES; i++) {
        var floor = fadeFloor(
            (new Color(tried)).lighten(CANVASBALLOON.GRADIENT_FACTOR).rgb,
            (new Color(tried)).darken(CANVASBALLOON.GRADIENT_FACTOR).rgb,
            skyFor
        );
        if (floor < 1) {
            return { colour: tried, floor: floor };
        }
        tried = randomBalloonColour();
    }

    return { colour: colour, floor: 1 };
};

/**
 * A balloon: the one thing in the sky that is worth points.
 *
 * It answers the entity contract in entities.js, so the list that holds it can
 * hold birds and a boss alongside it without knowing what any of them are.
 *
 * A balloon has `skin` layers. Most have one and pop on a tap. From rung four
 * some arrive reinforced and from rung seven armoured, and those take two or
 * three taps, thinning visibly as the skins come off.
 */
var balloonConstructor = function(xcoord, ycoord, size, color, xmax, speed, speedScale, skin, quirk, skyAt) {
    var that;
    that = {};
    that.kind = "balloon";
    that.layer = Entities.LAYERS.balloon;
    that.xcoord = xcoord ;
    that.ycoord = ycoord ;
    that.skin = Math.max(1, skin || 1);

    /**
     * Which of the two awkward kinds this one is, if either. They are rolled
     * together in the ladder so they are never both true.
     */
    that.janky = quirk === "janky";
    that.fading = quirk === "fading" && !!skyAt;

    /** What popping it is worth, fixed at what it took to pop. */
    that.points = Ladder.skin(that.skin).points;

    // A moving target and a small target are the same tax charged twice, so a
    // janky balloon is bigger for the same reason a thick one is.
    that.size = size * Ladder.skin(that.skin).size * (that.janky ? JANKY_SIZE : 1);
    // speedScale makes the rise proportional to screen height, so the time a
    // balloon takes to cross does not depend on how tall the window is. A
    // thicker balloon rises more slowly: the taps it costs have to fit
    // somewhere, and that somewhere is the time it is on screen.
    that.delta = -1 * speed * (BALLOON_SLOWEST + (1 - BALLOON_SLOWEST) * Math.random())
        * (speedScale || 1) * Ladder.skin(that.skin).speed;
    that.xdelta = -.5+ Math.random();
    that.xmax = xmax;

    /**
     * The faintest this one is allowed to get. One for everything that does
     * not fade, so being an ordinary balloon costs nothing.
     *
     * Settled here, once the two velocities are known and before the painter
     * is built, because a fading balloon may not keep the colour it was handed
     * and where it will be when it is faintest depends on how it flies.
     */
    that.alphaFloor = 1;

    /** The sky this one will have behind it a given way up its climb. */
    var skyFor = function (climbed) {
        var steps = climbed * ycoord / Math.max(0.0001, Math.abs(that.delta));
        return skyAt(bounced(xcoord + that.xdelta * steps, xmax), 1 - climbed);
    };

    if (that.fading) {
        var afforded = fadeableColour(color, skyFor);
        color = afforded.colour;
        that.alphaFloor = afforded.floor;
        // A balloon that may not fade is not a fading balloon, and saying so
        // keeps the measured share honest.
        that.fading = afforded.floor < 1;
    }

    that.color = color;

    /**
     * The fastest this one may wander sideways, in pixels per step.
     *
     * Derived, not chosen. A person needs about 250ms between seeing and
     * tapping — seven and a half steps. If the balloon leaves where you aimed
     * inside that window, the tap was never yours to land and the balloon
     * reads as cheating rather than as difficult. Half a radius is the room
     * that leaves, so the bound is `radius * JANKY_REACH / REACTION_STEPS` —
     * and it scales with the balloon, because a bigger target honestly
     * tolerates more movement.
     *
     * At the 22px touch floor that is 1.5px a step, about 44 a second: on a
     * 390px phone, a tenth of the screen's width per second. Visibly
     * squirrelly, still hittable.
     */
    that.jinkMax = that.size * JANKY_REACH / REACTION_STEPS;

    /**
     * How faint this one is right now: 1 everywhere, unless it fades.
     *
     * The height it spawned at is its own zero, which is why nothing has to
     * tell a balloon how tall the window is.
     */
    var spawnY = ycoord;

    that.alpha = function () {
        if (!that.fading) {
            return 1;
        }
        var climbed = (spawnY - that.ycoord) / Math.max(1, spawnY);
        var through = (climbed - FADE_HOLD) / (1 - FADE_HOLD);
        var gone = Math.max(0, Math.min(1, through));
        return 1 - gone * (1 - that.alphaFloor);
    };

    /** Steps left of the squash that says a tap landed. */
    var flash = 0;

    /** Steps until this one picks a new sideways drift. */
    var turnIn = Math.floor(Math.random() * JANKY_TURN_STEPS) + 1;

    if (that.janky) {
        that.xdelta = (Math.random() * 2 - 1) * that.jinkMax;
    }

    that.step = function(game, leave) {
        if (leave) {
            that.delta *= 1.01
        }
        if (flash > 0) {
            flash--;
        }

        if (that.janky && !leave) {
            turnIn--;
            if (turnIn <= 0) {
                // A fresh drift rather than a nudge: a wander made of small
                // corrections averages out into a straight line, which is
                // exactly what this is not supposed to be.
                that.xdelta = (Math.random() * 2 - 1) * that.jinkMax;
                turnIn = JANKY_TURN_STEPS;
            }
        }

        that.ycoord = that.ycoord +that.delta;
        that.xcoord = that.xcoord +that.xdelta;
        if (that.xcoord < 0) {
            that.xdelta = -that.xdelta;
        }
        if (that.xcoord > that.xmax) {
            that.xdelta = -that.xdelta;
        }
    };

    // One painter per balloon, made once and moved, rather than one per balloon
    // per frame. Building it works out three colours in HSL and looks the canvas
    // up by id; twenty balloons at thirty frames a second was six hundred of
    // those a second for drawing, and another on every click for the hit test.
    var painter = new CANVASBALLOON.Balloon('balloon_canvas', xcoord, ycoord, that.size, color);
    painter.rimWidth = that.size * Ladder.skin(that.skin).rim;

    var place = function () {
        painter.centerX = that.xcoord;
        painter.centerY = that.ycoord;
        return painter;
    };

    that.draw = function(game) {
        if (that.ycoord <= ESCAPE_COORDS) {
            return;
        }
        var drawn = place();
        drawn.alpha = that.alpha();

        // The squash. A tap that does not pop has to answer within a frame or
        // the balloon reads as having ignored you, which is the worst thing
        // this feature could feel like.
        if (flash > 0) {
            var dip = 0.12 * (flash / HIT_FLASH_STEPS);
            drawn.radius = that.size * (1 - dip);
            drawn.rimColor = "rgba(255, 255, 255, 0.85)";
            drawn.draw();
            drawn.radius = that.size;
            drawn.rimColor = "rgba(0, 0, 0, 0.45)";
            return;
        }
        drawn.draw();
    };

    that.hits = function (point) {
        return place().check_hit(point.x, point.y);
    };

    /**
     * A tap landed. The last skin pops it and scores; the ones before that
     * take a layer off, and say so.
     */
    that.tapped = function (game) {
        flash = HIT_FLASH_STEPS;
        that.skin--;

        if (that.skin > 0) {
            var left = Ladder.skin(that.skin);
            // The janky factor belongs to the balloon, not to the skin it is
            // wearing: without it here a janky armoured balloon shrank by 18%
            // on its first tap, which is the opposite of what the extra size
            // is for.
            that.size = size * left.size * (that.janky ? JANKY_SIZE : 1);
            painter.radius = that.size;
            painter.rimWidth = that.size * left.rim;
            painter.thin(0.18 * (Ladder.SKINS.length - that.skin));
            return false;
        }

        game.score += that.points;
        return true;
    };

    /** Off the top of the screen is an escape, and escapes cost the player. */
    that.gone = function () {
        return that.ycoord <= ESCAPE_COORDS ? "escaped" : null;
    };

    /**
     * The window changed shape, so keep the share of it rather than the pixels.
     *
     * Only `xmax` used to move. Measured, turning a phone upright mid-game put
     * every balloon in the sky PAST THE RIGHT EDGE -- invisible, untappable,
     * and still costing a life each when they reached the top. And because the
     * rise was worked out for the old height, a balloon that crossed in 15.8
     * seconds took 41.2 after the turn.
     *
     * So the position scales with the window and so does the rise. A balloon
     * that was a third of the way up and a third of the way across is still
     * exactly that, and still takes the same time to reach the top -- which is
     * the promise `speedScale` makes at spawn and had no way of keeping
     * afterwards.
     */
    that.resized = function (game, scale) {
        that.xmax = game.width;

        if (!scale) {
            return;
        }

        that.xcoord *= scale.x;
        that.ycoord *= scale.y;
        that.delta *= scale.y;
        that.xdelta *= scale.x;

        // The height it spawned at is what the fade measures from, so it has
        // to travel with everything else or a balloon halfway up reads as
        // having barely started.
        spawnY *= scale.y;
    };

    return that;
};
