"use strict";

var ESCAPE_COORDS = -10;

/** How long a tap that did not pop a balloon stays visible, in steps. */
var HIT_FLASH_STEPS = 5;

/**
 * A person's reaction, in steps: 250ms at thirty steps a second.
 *
 * This is the window a janky balloon's drift is measured against. It is the
 * same number the playtest harness uses for the bot, and the same one the
 * fairness argument for birds rests on.
 */
var JANKY_REACTION_STEPS = 7.5;

/** Steps between one sideways drift and the next. */
var JANKY_TURN_STEPS = 22;

/** How much bigger a janky balloon is than a steady one of the same skin. */
var JANKY_SIZE = 1.18;

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
var balloonConstructor = function(xcoord, ycoord, size, color, xmax, speed, speedScale, skin, janky) {
    var that;
    that = {};
    that.kind = "balloon";
    that.layer = Entities.LAYERS.balloon;
    that.xcoord = xcoord ;
    that.ycoord = ycoord ;
    that.skin = Math.max(1, skin || 1);

    /** Whether this one wanders sideways as it rises. */
    that.janky = janky === true;

    /** What popping it is worth, fixed at what it took to pop. */
    that.points = Ladder.skin(that.skin).points;

    // A moving target and a small target are the same tax charged twice, so a
    // janky balloon is bigger for the same reason a thick one is.
    that.size = size * Ladder.skin(that.skin).size * (that.janky ? JANKY_SIZE : 1);
    that.color = color;
    // speedScale makes the rise proportional to screen height, so the time a
    // balloon takes to cross does not depend on how tall the window is. A
    // thicker balloon rises more slowly: the taps it costs have to fit
    // somewhere, and that somewhere is the time it is on screen.
    that.delta = -1 * ((Math.random()*speed)+0.25) * (speedScale || 1)
        * Ladder.skin(that.skin).speed;
    that.xdelta = -.5+ Math.random();
    that.xmax = xmax;

    /**
     * The fastest this one may wander sideways, in pixels per step.
     *
     * Derived, not chosen. A person needs about 250ms between seeing and
     * tapping — seven and a half steps. If the balloon leaves where you aimed
     * inside that window, the tap was never yours to land and the balloon
     * reads as cheating rather than as difficult. Half a radius is the room
     * that leaves, so the bound is `radius / 2 / 7.5` — and it scales with the
     * balloon, because a bigger target honestly tolerates more movement.
     *
     * At the 22px touch floor that is 1.5px a step, about 44 a second: on a
     * 390px phone, a tenth of the screen's width per second. Visibly
     * squirrelly, still hittable.
     */
    that.jinkMax = that.size * 0.5 / JANKY_REACTION_STEPS;

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
            that.size = size * left.size;
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

    /** The width it bounces off is the width of the window. */
    that.resized = function (game) {
        that.xmax = game.width;
    };

    return that;
};
