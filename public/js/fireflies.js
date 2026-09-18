"use strict";

/**
 * Fireflies: pretty, harmless, and standing exactly where you wanted to tap.
 *
 * Every other hazard in this game is a thing to recognise. A bird must not be
 * touched, a saucer must be shot down, a heavy balloon must be hit again —
 * each is a decision you make once you have seen it. A firefly asks nothing.
 * You are meant to see it, understand it immediately, and then lose taps to it
 * anyway, because it is drifting through the space your finger is aiming at.
 *
 * WHAT IT COSTS IS PRECISION, NOT RECOGNITION
 *
 * It is a valid tap target that does nothing: taps land on it and are gone. The
 * nearest-centre dispatch built in phase 1 means a firefly hovering beside a
 * balloon quietly takes every sloppy tap aimed at that balloon. So the tax
 * falls on aim — the one part of the supply side nothing else in the game
 * touches. It is emphatically NOT a disguise: making it look like a balloon
 * would be a trick, and a trick is only clever once.
 *
 * AND UNLIKE A BIRD, THEY STAY
 *
 * A bird crosses and is gone in a couple of seconds. Fireflies arrive, hover,
 * drift, and cannot be waited out — which is what makes them a tax rather than
 * an event. They are part of the sky you are working in, not something that
 * happens to you. There are several, and more of them the higher you climb.
 */

/** Body radius before scaling, and the floor that keeps it worth avoiding. */
var FIREFLY_BASE_SIZE = 16;
var FIREFLY_MIN_RADIUS = 13;

/** How far the glow reaches past the body, as a multiple of the radius. */
var FIREFLY_GLOW = 2.2;

/** Steps per pulse. Slow enough to read as breathing rather than blinking. */
var FIREFLY_PULSE_STEPS = 34;

/** How fast it wanders, before scaling. Slower than anything else in the sky. */
var FIREFLY_DRIFT = 0.55;

/** Steps between changes of heading. A straight line does not read as alive. */
var FIREFLY_TURN_STEPS = 45;

var fireflyConstructor = function (xcoord, ycoord, radius, drift, xmax, ymax) {
    var that = {};
    that.kind = "firefly";
    that.layer = Entities.LAYERS.firefly;
    that.xcoord = xcoord;
    that.ycoord = ycoord;
    that.radius = Math.max(FIREFLY_MIN_RADIUS, radius);
    that.xmax = xmax;
    that.ymax = ymax;

    var speed = drift;
    var heading = Math.random() * Math.PI * 2;
    var steps = Math.floor(Math.random() * FIREFLY_PULSE_STEPS);
    var turnIn = Math.floor(Math.random() * FIREFLY_TURN_STEPS);

    /** Steps left of the flinch that answers a tap. */
    var flinch = 0;

    /** Set when a round ends; it drifts up and out like everything else. */
    var leaving = false;

    that.step = function (game, leave) {
        steps++;
        if (flinch > 0) {
            flinch--;
        }

        if (leaving || leave) {
            leaving = true;
            that.ycoord -= speed * 6;
            return;
        }

        turnIn--;
        if (turnIn <= 0) {
            // A new heading rather than a nudge: a wander made of small
            // corrections averages out into a straight line.
            heading = Math.random() * Math.PI * 2;
            turnIn = FIREFLY_TURN_STEPS;
        }

        that.xcoord += Math.cos(heading) * speed;
        that.ycoord += Math.sin(heading) * speed;

        // It stays in the sky rather than wandering off it. Turning at the
        // edge is what makes it something you have to work around instead of
        // something you can wait out.
        var edge = that.radius * FIREFLY_GLOW;
        if (that.xcoord < edge || that.xcoord > that.xmax - edge) {
            heading = Math.PI - heading;
            that.xcoord = Math.min(Math.max(that.xcoord, edge), that.xmax - edge);
        }
        if (that.ycoord < edge || that.ycoord > that.ymax - edge) {
            heading = -heading;
            that.ycoord = Math.min(Math.max(that.ycoord, edge), that.ymax - edge);
        }
    };

    /**
     * A soft mote with a glow around it, breathing.
     *
     * Deliberately nothing like a balloon: no teardrop, no tie, no gradient
     * shading — it gives off light instead of catching it. A player has about
     * 200ms to classify a shape in a full sky, and "glowing blob" against
     * "shiny teardrop" is a distinction that survives that, colour-blindness,
     * and a phone screen in daylight.
     */
    that.draw = function (game) {
        var ctx = game.ctx;
        var palette = game.palette;
        var pulse = 0.78 + 0.22 * Math.sin(steps / FIREFLY_PULSE_STEPS * Math.PI * 2);
        var r = that.radius * pulse * (flinch > 0 ? 1.25 : 1);
        var reach = r * FIREFLY_GLOW;

        ctx.save();
        ctx.translate(that.xcoord, that.ycoord);

        var glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, reach);
        glow.addColorStop(0, palette.fireflyCore);
        glow.addColorStop(0.35, palette.fireflyGlow);
        glow.addColorStop(1, Sky.transparent(palette.fireflyGlow));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, reach, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = palette.fireflyCore;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    };

    /**
     * The body and a little of the glow.
     *
     * Near balloon-sized on purpose. A firefly smaller than the balloons around
     * it would steal no taps at all, and a hazard that costs nothing is not a
     * hazard — it is decoration with a rule attached.
     */
    that.hits = function (point) {
        var dx = point.x - that.xcoord;
        var dy = point.y - that.ycoord;
        var reach = that.radius * 1.15;
        return dx * dx + dy * dy <= reach * reach;
    };

    /**
     * Tapped. That is the whole cost: the tap.
     *
     * No life. The bird punishes touching and the firefly punishes carelessness,
     * and if both cost a life the second one is not a new idea. It flinches so
     * the rule is legible the first time it happens — a tap that produced no
     * response at all would read as the game having missed the input.
     */
    that.tapped = function (game) {
        flinch = 6;
        return false;
    };

    /** Only when the round is over. Otherwise it is here to stay. */
    that.gone = function (game) {
        return that.ycoord < -that.radius * FIREFLY_GLOW * 2 ? "left" : null;
    };

    that.resized = function (game) {
        that.xmax = game.width;
        that.ymax = game.height;
        var edge = that.radius * FIREFLY_GLOW;
        that.xcoord = Math.min(that.xcoord, Math.max(edge, game.width - edge));
        that.ycoord = Math.min(that.ycoord, Math.max(edge, game.height - edge));
    };

    return that;
};
