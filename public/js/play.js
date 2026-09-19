"use strict";

/**
 * The Play button, which drifts about the sky and will not be missed.
 *
 * The title screen used to say "Tap anywhere to play" and mean it: a tap
 * anywhere did start a game, and that is still true. Played by somebody who
 * had not built it, the line went unread -- which is what a line of text on a
 * screen full of moving balloons does. People look for a button.
 *
 * So there is a button. It is deliberately NOT the only way in: tapping the
 * sky still works, because that was a good idea and the button is a signpost
 * rather than a gate. What it has to do is be impossible to miss, which is
 * why it moves and why it changes colour.
 *
 * WHERE IT MAY GO
 *
 * It drifts inside a band that clears the words at the top and the chips along
 * the bottom, so it can never sit on the name, the level chip or the About
 * mark -- all three of which do something else when tapped. A button that
 * wanders over another button is a button that steals taps.
 */

var Play = {};

/** How big it is, in line heights, and the air inside it. */
Play.SIZE = { width: 5.6, height: 2.2, radius: 0.55 };

/**
 * How fast it drifts, in fractions of the screen per second.
 *
 * Slow. It is a target the player is meant to hit, not a thing to chase: at
 * this speed it crosses the band in about twenty seconds and moves well under
 * its own width inside a reaction time.
 */
Play.DRIFT = 0.055;

/** Seconds to work through the whole set of colours. */
Play.COLOUR_SECONDS = 6;

/**
 * The colours it cycles, and the ink that goes on each.
 *
 * Balloon colours, because that is what the game is made of. Each is paired
 * with its own label colour rather than a single ink for all of them, so every
 * frame of the cycle clears 4.5:1 -- a button that is only legible for four
 * seconds in six is not legible.
 */
Play.COLOURS = [
    { fill: "#E24A5C", ink: "#2A0207" },
    { fill: "#F2A33C", ink: "#2E1900" },
    { fill: "#49B265", ink: "#04210E" },
    { fill: "#3E9BD8", ink: "#03192B" },
    { fill: "#A76BD0", ink: "#20073A" }
];

/** Where it is, as a share of the band it drifts in. Reset per visit. */
Play.begin = function (game) {
    Play.at = { x: 0.5, y: 0.5 };
    Play.heading = Math.random() * Math.PI * 2;
    Play.steps = 0;
};

/** One step of drift, bouncing off the edges of its band. */
Play.step = function (game) {
    if (!Play.at) {
        Play.begin(game);
    }
    Play.steps++;

    var per = Play.DRIFT / (1000 / Game.STEP_MS);
    Play.at.x += Math.cos(Play.heading) * per;
    Play.at.y += Math.sin(Play.heading) * per;

    if (Play.at.x < 0 || Play.at.x > 1) {
        Play.heading = Math.PI - Play.heading;
        Play.at.x = Math.min(Math.max(Play.at.x, 0), 1);
    }
    if (Play.at.y < 0 || Play.at.y > 1) {
        Play.heading = -Play.heading;
        Play.at.y = Math.min(Math.max(Play.at.y, 0), 1);
    }
};

/** Which colour it is wearing right now. */
Play.colour = function () {
    var per = Play.COLOUR_SECONDS * (1000 / Game.STEP_MS) / Play.COLOURS.length;
    var i = Math.floor((Play.steps || 0) / per) % Play.COLOURS.length;
    return Play.COLOURS[i];
};

/**
 * Where it is on screen, in pixels.
 *
 * Computed rather than stored, so a resize moves it with the window: it lives
 * at a fraction of a band, and the band is worked out from the layout every
 * time it is asked for.
 */
Play.rect = function (game) {
    var line = game.layout.line;
    var width = Math.min(line * Play.SIZE.width, game.width * 0.7);
    var height = Math.max(line * Play.SIZE.height, Layout.GRID.minTouchTarget);

    if (!Play.at) {
        Play.begin(game);
    }

    // The band: under the words, over the chips, and never off an edge.
    var top = game.layout.splash.y + game.layout.splash.height + line * 0.4;
    var bottom = game.layout.player.y - line * 0.6 - height;
    var left = game.width * Layout.GRID.columns.margin;
    var right = game.width - left - width;

    if (bottom < top) {
        bottom = top;
    }

    return {
        x: left + (right - left) * Play.at.x,
        y: top + (bottom - top) * Play.at.y,
        width: width,
        height: height,
        radius: line * Play.SIZE.radius
    };
};
