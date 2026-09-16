"use strict";

var ESCAPE_COORDS = -10;

/**
 * A balloon: the one thing in the sky that is worth points.
 *
 * It answers the entity contract in entities.js, so the list that holds it can
 * hold birds and a boss alongside it without knowing what any of them are.
 */
var balloonConstructor = function(xcoord, ycoord, size, color, xmax, speed, speedScale) {
    var that;
    that = {};
    that.kind = "balloon";
    that.layer = Entities.LAYERS.balloon;
    that.xcoord = xcoord ;
    that.ycoord = ycoord ;
    that.size = size;
    that.color = color;
    // speedScale makes the rise proportional to screen height, so the time a
    // balloon takes to cross does not depend on how tall the window is.
    that.delta = -1 * ((Math.random()*speed)+0.25) * (speedScale || 1);
    that.xdelta = -.5+ Math.random();
    that.xmax = xmax;

    that.step = function(game, leave) {
        if (leave) {
            that.delta *= 1.01
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
    var painter = new CANVASBALLOON.Balloon('balloon_canvas', xcoord, ycoord, size, color);

    var place = function () {
        painter.centerX = that.xcoord;
        painter.centerY = that.ycoord;
        return painter;
    };

    that.draw = function(game) {
        if (that.ycoord > ESCAPE_COORDS) {
            place().draw();
        }
    };

    that.hits = function (point) {
        return place().check_hit(point.x, point.y);
    };

    /** Popped, and worth a point. Nothing here yet takes more than one tap. */
    that.tapped = function (game) {
        game.balloons_caught++;
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
