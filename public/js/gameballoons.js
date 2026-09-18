"use strict";

var ESCAPE_COORDS = -10;

/** How long a tap that did not pop a balloon stays visible, in steps. */
var HIT_FLASH_STEPS = 5;

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
var balloonConstructor = function(xcoord, ycoord, size, color, xmax, speed, speedScale, skin) {
    var that;
    that = {};
    that.kind = "balloon";
    that.layer = Entities.LAYERS.balloon;
    that.xcoord = xcoord ;
    that.ycoord = ycoord ;
    that.skin = Math.max(1, skin || 1);

    /** What popping it is worth, fixed at what it took to pop. */
    that.points = Ladder.skin(that.skin).points;

    that.size = size * Ladder.skin(that.skin).size;
    that.color = color;
    // speedScale makes the rise proportional to screen height, so the time a
    // balloon takes to cross does not depend on how tall the window is. A
    // thicker balloon rises more slowly: the taps it costs have to fit
    // somewhere, and that somewhere is the time it is on screen.
    that.delta = -1 * ((Math.random()*speed)+0.25) * (speedScale || 1)
        * Ladder.skin(that.skin).speed;
    that.xdelta = -.5+ Math.random();
    that.xmax = xmax;

    /** Steps left of the squash that says a tap landed. */
    var flash = 0;

    that.step = function(game, leave) {
        if (leave) {
            that.delta *= 1.01
        }
        if (flash > 0) {
            flash--;
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
