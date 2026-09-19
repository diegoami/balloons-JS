"use strict";

/**
 * A bird: the first thing in the sky you are meant to leave alone.
 *
 * Everything before it rewarded a tap. A bird punishes one, which makes it the
 * first entity whose whole job is to be recognised and avoided — and that
 * inverts two rules the game had settled into.
 *
 * THE HITBOX IS SMALLER THAN THE DRAWING, ON PURPOSE
 *
 * A balloon's hit shape matches its outline, because a tap aimed at a balloon
 * should land. A bird is the opposite case: touching it is the mistake, so
 * every pixel of doubt should go to the player. The hit shape here is an
 * ellipse over the body, inside the drawn silhouette — the wingtips are a few
 * pixels of taper, and losing a life to one of them would be a penalty for
 * pixel-hunting rather than for carelessness.
 *
 * IT ENTERS FROM OFF SCREEN, ALWAYS
 *
 * A bird that appeared in the crowded middle could cross the exact point a
 * player had already committed to, in the 250ms between deciding and tapping.
 * That is a penalty for something nobody could avoid. So a bird starts a full
 * wingspan outside the canvas and flies in, which guarantees it is visible for
 * a beat before it reaches anything.
 */

/** Wingspan as a multiple of the body's radius. */
var BIRD_SPAN = 2.6;

/**
 * The smallest a bird is ever drawn, in pixels of body radius.
 *
 * Balloons have a floor because a target below it is not tappable. A bird has
 * one for the opposite reason: something you are being asked to recognise and
 * avoid has to be recognisable first. The floor is on the DRAWING; the hit
 * shape stays inside it.
 */
var BIRD_MIN_RADIUS = 9;

/** How far a bird bobs as it flies, as a multiple of its radius. */
var BIRD_BOB = 0.45;

/** Steps per full bob cycle. Slow enough to read as flight, not as a wobble. */
var BIRD_BOB_STEPS = 26;

var birdConstructor = function (xcoord, ycoord, radius, speed, fromLeft) {
    var that = {};
    that.kind = "bird";
    that.layer = Entities.LAYERS.bird;
    that.xcoord = xcoord;
    that.ycoord = ycoord;
    that.radius = Math.max(BIRD_MIN_RADIUS, radius);
    that.fromLeft = fromLeft;
    that.xdelta = fromLeft ? speed : -speed;

    /** Where the bob started, so it reads as flight rather than a reset. */
    var phase = Math.random() * BIRD_BOB_STEPS;
    var steps = 0;
    var baseY = ycoord;

    /** Set once it has been touched, so it leaves rather than lingering. */
    var startled = false;

    that.step = function (game, leave) {
        steps++;
        that.xcoord += that.xdelta;

        if (startled || leave) {
            // Away and upward: a bird that has been touched should visibly
            // clear off rather than carry on across the sky as if nothing
            // happened, and one left at the end of a round should go too.
            that.ycoord -= Math.abs(that.xdelta) * 0.6;
            return;
        }

        that.ycoord = baseY +
            Math.sin((steps + phase) / BIRD_BOB_STEPS * Math.PI * 2) *
            that.radius * BIRD_BOB;
    };

    /**
     * The silhouette: a body, a head, and two swept wings.
     *
     * Drawn as a filled shape rather than an outline so it reads at speed and
     * at small sizes, and in one flat dark colour rather than the balloons'
     * gradient — a bird is a shape to recognise, not an object to inspect, and
     * flat-against-sky is how a bird actually looks from below.
     */
    that.draw = function (game) {
        var ctx = game.ctx;
        var r = that.radius;
        var facing = that.fromLeft ? 1 : -1;
        var span = r * BIRD_SPAN;

        // Wings beat with the bob, so the two read as one motion.
        var beat = Math.sin((steps + phase) / BIRD_BOB_STEPS * Math.PI * 2);
        var lift = span * 0.55 * beat;

        ctx.save();
        ctx.translate(that.xcoord, that.ycoord);
        ctx.scale(facing, 1);
        ctx.fillStyle = game.palette.birdInk;

        // Wings first, so the body sits over where they join it.
        //
        // Each wing is a filled shape with real area: a leading edge sweeping
        // out and slightly forward to the tip, and a trailing edge coming back
        // towards the tail. An earlier version ran both edges along nearly the
        // same curve, which drew two thin spikes and read as a dart.
        [1, -1].forEach(function (side) {
            var tipX = -span * 0.32;
            var tipY = side * (span * 0.72 + lift * 0.5);

            ctx.beginPath();
            ctx.moveTo(r * 0.35, side * r * 0.1);
            ctx.quadraticCurveTo(-span * 0.02, tipY * 0.62, tipX, tipY);
            ctx.quadraticCurveTo(-span * 0.34, tipY * 0.34, -r * 1.15, side * r * 0.2);
            ctx.closePath();
            ctx.fill();
        });

        // Body and head, along the direction of travel.
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.05, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * 1.05, -r * 0.12, r * 0.38, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    };

    /**
     * Whether a tap touched the bird.
     *
     * The body and the head, from the same numbers that draw them, and not the
     * wings. An earlier version used one ellipse a bit bigger than the body,
     * which reached into the blank sky in the notch between the wings — a
     * thousand pixels of nothing that would have cost a life. A test walks
     * every pixel of the bounding box and fails if any tappable one is unpainted.
     */
    that.hits = function (point) {
        var r = that.radius;
        var facing = that.fromLeft ? 1 : -1;
        var dx = (point.x - that.xcoord) * facing;
        var dy = point.y - that.ycoord;

        var bodyX = dx / (r * 1.05);
        var bodyY = dy / (r * 0.5);
        if (bodyX * bodyX + bodyY * bodyY <= 1) {
            return true;
        }

        var headX = dx - r * 1.05;
        var headY = dy + r * 0.12;
        return headX * headX + headY * headY <= (r * 0.38) * (r * 0.38);
    };

    /**
     * Touched. That costs a life, and the bird clears off.
     *
     * Returns false rather than true: the bird is not removed on the spot,
     * because a bird that vanished under the finger would look like it popped,
     * which is the one thing it must never look like. It flies off instead,
     * and `gone` takes it when it is away.
     */
    that.tapped = function (game) {
        if (!startled) {
            startled = true;
            game.livesLost++;
            Announce.touchedBird(game);
        }
        return false;
    };

    /**
     * Off the side, or above the top once startled.
     *
     * "left" rather than "escaped": a bird crossing the sky and going on its
     * way costs nothing. Escaping is what a balloon does, and it is the only
     * thing the counter is for.
     */
    that.gone = function (game) {
        var span = that.radius * BIRD_SPAN;
        if (that.ycoord < -span) {
            return "left";
        }
        return (that.xcoord < -span * 1.5 || that.xcoord > game.width + span * 1.5)
            ? "left"
            : null;
    };

    that.resized = function (game, scale) {
        that.xmax = game.width;

        // A bird IS re-anchored, unlike the note that used to be here.
        //
        // That note was about a window nudged a few pixels, where moving a
        // bird under the player's finger is worse than letting it fly a little
        // high. A phone turned upright is not a nudge: it more than doubles
        // the height and halves the width, and a bird left in place is either
        // off the side entirely or somewhere no part of the sky corresponds
        // to. Keeping its share of the window is the smaller lie.
        if (scale) {
            that.xcoord *= scale.x;
            that.ycoord *= scale.y;
        }
    };

    return that;
};
