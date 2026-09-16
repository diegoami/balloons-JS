"use strict";

var ESCAPE_COORDS = -10;

var balloonConstructor = function(xcoord, ycoord, size, color, xmax, speed, speedScale) {
    var that;
    that = {};
    that.xcoord = xcoord ;
    that.ycoord = ycoord ;
    that.size = size;
    that.color = color;
    // speedScale makes the rise proportional to screen height, so the time a
    // balloon takes to cross does not depend on how tall the window is.
    that.delta = -1 * ((Math.random()*speed)+0.25) * (speedScale || 1);
    that.xdelta = -.5+ Math.random();
    that.xmax = xmax;

    that.tick = function(accelerate) {
        if (accelerate) {
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

    that.draw = function() {
        if (that.ycoord > ESCAPE_COORDS) {
            place().draw();
        }
    };

    that.collision = function(x,y) {
        return place().check_hit(x,y);
    };
    return that;
};