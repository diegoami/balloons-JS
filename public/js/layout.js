/**
 * Where everything on the screen goes.
 *
 * The screen used to be positioned by seventeen independent fractions spread
 * across game.js. Horizontal ones were fractions of canvas width, which is
 * consistent because the font also scales with width. The vertical ones were
 * fractions of canvas *height*, which is not: on a tall phone that produced
 * 12px text spread across 800px of screen, and on a short window it produced
 * lines closer together than the text was tall.
 *
 * Here the horizontal axis stays in width fractions and the vertical axis is
 * a rhythm measured in line heights, so the two axes derive from the same type
 * scale and the composition holds at any aspect ratio.
 */

"use strict";
var Layout = {};

Layout.HINT_TEXT = "Press E S H V to choose, space to replay";

Layout.INTRO_TEXT = "Stop the balloons, before it is too late !!";
Layout.HIGH_SCORES_TEXT = "High Scores - ";

/** The name line along the bottom, and the screen it opens. */
Layout.PLAYER_PREFIX = "Playing as ";
Layout.NAME_TEXT = "Who is playing?";
Layout.NAME_HINT = "Enter to save, Escape to cancel";
Layout.SAVE_TEXT = "Save";

Layout.GRID = {
    /** Fractions of canvas width. */
    columns: {
        margin: 0.05,
        scoresHeading: 0.28,
        scoreDate: 0.05,
        scoreName: 0.5,
        scoreValue: 0.8,
        hudCaught: 0.1,
        hudLevel: 0.45,
        hudTime: 0.8
    },

    /** Baselines, in line heights from the top of the canvas. */
    rows: {
        hud: 1.5,
        intro: 1.5,
        menu: 3.5,
        scoresHeading: 6,
        firstScore: 8.5
    },

    scoreRowStep: 2.5,
    scoreRowCount: 3,

    /** Button padding and spacing, in line heights. */
    button: { padX: 0.55, padY: 0.28, gap: 0.34, radius: 0.28 },

    /** Gaps in the vertical flow, in line heights. */
    gaps: { afterMenu: 0.95, afterHint: 1.5, beforeScores: 1.7 },

    /**
     * The name line, anchored to the bottom edge rather than placed in the
     * flow, so adding it cannot push the composition off a short screen.
     *
     * It is a chip rather than plain text for two reasons: it sits on the
     * brightest part of the sky, where pale ink alone is hard to read, and a
     * thing you can tap should look like one. Height is a line and a half,
     * floored at the touch minimum and capped so a large window does not get
     * an enormous footer. Everything but maxHeight is in line heights.
     */
    footer: { padX: 0.5, height: 1.5, maxHeight: 64, inset: 0.4, radius: 0.28 },

    /** The name field is capped, because a name is not screen-width long. */
    fieldMax: 16,

    /** A line height, as a multiple of the advance width of a capital M. */
    lineRatio: 1.3,

    /** Balloons spawn within this band of the width. */
    spawn: { inset: 0.05, spread: 0.9 },

    baseFontSize: 30,
    minFontSize: 12,

    /**
     * Type scale, as multiples of the base size. Positions stay on the base
     * line rhythm; only the glyphs change size, so hierarchy does not disturb
     * the composition.
     */
    type: {
        intro: 1.15,
        menu: 1,
        label: 0.82,
        score: 1,
        hud: 0.92,
        countdown: 2.4
    },

    /**
     * Smallest thing worth asking a finger to hit, in CSS pixels. Apple asks
     * for 44, Material for 48. At phone sizes the difficulty boxes came out
     * 17px tall, which is under a third of a fingertip, so aiming at one
     * missed roughly one tap in seven even with a generous error model.
     */
    minTouchTarget: 44,

    /**
     * Font size is capped so the deepest row still lands on screen: the
     * deepest baseline sits at about 15.6x the font size, so 19 leaves the
     * composition occupying roughly 82% of the height it is given.
     *
     * What it is given is the height less the name line, which sits on the
     * bottom edge outside the flow and takes a touch target plus a little air.
     * Without that reservation the flow ran into the footer on a letterboxed
     * window: at 1920x400 the last score row landed 5px below the name line.
     */
    heightDivisor: 19,
    footerReserve: 56
};

/** Grows a rect about its own centre until it meets the touch minimum. */
function atLeastTouchSize(rect) {
    var min = Layout.GRID.minTouchTarget;
    var width = Math.max(rect.width, min);
    var height = Math.max(rect.height, min);

    return {
        x: rect.x + rect.width / 2 - width / 2,
        y: rect.y + rect.height / 2 - height / 2,
        width: width,
        height: height
    };
}

/**
 * Picks a font size for the viewport and sets it on the context.
 *
 * Bounded by width (so the composition scales), by height (so the bottom row
 * stays on screen) and finally by an actual measurement of the menu string,
 * which is the widest thing drawn — that last pass is what guarantees the menu
 * fits rather than merely tending to.
 */
Layout.applyFont = function (ctx, width, height) {
    var G = Layout.GRID;
    var size = Math.max(
        G.minFontSize,
        Math.min(
            G.baseFontSize * (width / 1000),
            (height - G.footerReserve) / G.heightDivisor
        )
    );

    size = Math.round(size);
    ctx.font = size + "px Verdana";

    // The hint line is the longest single run of text drawn, so it is what
    // decides whether the composition fits the width.
    var available = width * (1 - 2 * G.columns.margin);
    var longest = ctx.measureText(Layout.HINT_TEXT).width;

    if (longest > available) {
        size = Math.max(1, Math.floor(size * (available / longest)));
        ctx.font = size + "px Verdana";
    }

    return size;
};

/**
 * Every position the game draws or hit-tests, computed once per resize.
 * Regions that are both drawn and clicked return a single rect, so the two can
 * never drift apart the way the difficulty boxes used to.
 */
Layout.compute = function (ctx, width, height, fontSize, playerLabel) {
    var G = Layout.GRID;
    var line = ctx.measureText("M").width * G.lineRatio;
    var left = width * G.columns.margin;
    var available = width * (1 - 2 * G.columns.margin);

    var fonts = {};
    for (var role in G.type) {
        if (Object.prototype.hasOwnProperty.call(G.type, role)) {
            fonts[role] = Math.max(1, Math.round(fontSize * G.type[role])) + "px Verdana";
        }
    }

    // --- difficulty buttons, flowed left to right and wrapped if they overrun

    var padX = line * G.button.padX;
    var padY = line * G.button.padY;
    var gap = line * G.button.gap;
    var buttonHeight = Math.max(line + padY * 2, G.minTouchTarget);

    // Read from the difficulty table each time rather than captured at parse
    // time, so there is no load-order dependency between the two files.
    var items = Difficulty.all();

    ctx.font = fonts.menu;
    var widths = items.map(function (item) {
        return Math.max(ctx.measureText(item.label).width + padX * 2, G.minTouchTarget);
    });
    ctx.font = fonts.score;

    var buttons = [];
    var rowTop = line * G.rows.menu;
    var x = left;
    var rowCount = 1;

    for (var i = 0; i < items.length; i++) {
        if (i > 0 && x + widths[i] - left > available) {
            x = left;
            rowTop += buttonHeight + gap;
            rowCount++;
        }
        buttons.push({
            level: items[i].level,
            label: items[i].label,
            x: x,
            y: rowTop,
            width: widths[i],
            height: buttonHeight,
            radius: line * G.button.radius
        });
        x += widths[i] + gap;
    }

    var menuTop = line * G.rows.menu;
    var menuBottom = rowTop + buttonHeight;

    // Drawn rect and hit rect are the same object now: buttons are laid out
    // rather than bracketing substrings, so both directions can meet the touch
    // minimum. The milestone 2 width exception is gone.
    for (var b = 0; b < buttons.length; b++) {
        buttons[b].hit = {
            x: buttons[b].x, y: buttons[b].y,
            width: buttons[b].width, height: buttons[b].height
        };
    }

    // --- everything below the menu flows from its actual bottom edge

    var hintY = menuBottom + line * G.gaps.afterMenu;
    var headingY = hintY + line * G.gaps.afterHint;
    var firstRowY = headingY + line * G.gaps.beforeScores;

    var rows = [];
    for (var r = 0; r < G.scoreRowCount; r++) {
        rows.push(firstRowY + line * r * G.scoreRowStep);
    }

    var scoresHit = atLeastTouchSize({
        x: width * G.columns.scoresHeading,
        y: headingY - line / 2,
        width: ctx.measureText(Layout.HIGH_SCORES_TEXT + "S").width,
        height: line
    });

    // --- the name line, anchored to the bottom edge rather than to the flow

    ctx.font = fonts.label;
    var footerHeight = Math.max(
        Math.min(line * G.footer.height, G.footer.maxHeight),
        G.minTouchTarget
    );
    var player = {
        x: left,
        y: Math.max(0, height - footerHeight - line * G.footer.inset),
        width: Math.max(
            ctx.measureText(playerLabel || "").width + line * G.footer.padX * 2,
            G.minTouchTarget
        ),
        height: footerHeight,
        radius: line * G.footer.radius,
        label: playerLabel || ""
    };

    // --- the name screen, on the row the difficulty buttons occupy elsewhere

    ctx.font = fonts.menu;
    var saveWidth = Math.max(ctx.measureText(Layout.SAVE_TEXT).width + padX * 2, G.minTouchTarget);
    ctx.font = fonts.score;

    var field = {
        x: left,
        y: menuTop,
        width: Math.max(
            Math.min(available - saveWidth - gap, line * G.fieldMax),
            G.minTouchTarget
        ),
        height: buttonHeight
    };
    var save = {
        x: left + field.width + gap,
        y: menuTop,
        width: saveWidth,
        height: buttonHeight,
        radius: line * G.button.radius,
        label: Layout.SAVE_TEXT
    };

    // Every tappable thing carries an id, because two of them have no
    // difficulty of their own: the high-score line replays whatever is
    // selected, and the name line opens the name screen.
    var targets = buttons.map(function (button) {
        return { id: button.level, level: button.level, hit: button.hit };
    });
    targets.push({ id: "replay", level: null, hit: scoresHit });
    targets.push({ id: "player", level: null, hit: player });

    return {
        line: line,
        fonts: fonts,

        intro: { x: left, y: line * G.rows.intro },

        menu: {
            x: left,
            top: menuTop,
            bottom: menuBottom,
            height: menuBottom - menuTop,
            rows: rowCount,
            buttons: buttons
        },

        hint: { x: left, y: hintY },

        player: player,

        name: { field: field, save: save },

        countdown: { x: width / 2, y: headingY + line * 1.4 },

        scores: {
            heading: { x: width * G.columns.scoresHeading, y: headingY },
            hit: scoresHit,
            columns: {
                date: width * G.columns.scoreDate,
                name: width * G.columns.scoreName,
                value: width * G.columns.scoreValue
            },
            rows: rows
        },

        hud: {
            y: line * G.rows.hud,
            caught: width * G.columns.hudCaught,
            level: width * G.columns.hudLevel,
            time: width * G.columns.hudTime
        },

        spawn: {
            min: width * G.spawn.inset,
            width: width * G.spawn.spread
        },

        targets: targets
    };
};

/** Traces a rounded rectangle. Path2D.roundRect is too new to rely on. */
Layout.roundedRect = function (ctx, rect, radius) {
    var r = Math.min(radius, rect.width / 2, rect.height / 2);
    ctx.beginPath();
    ctx.moveTo(rect.x + r, rect.y);
    ctx.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, r);
    ctx.arcTo(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, r);
    ctx.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, r);
    ctx.arcTo(rect.x, rect.y, rect.x + rect.width, rect.y, r);
    ctx.closePath();
};

/**
 * Picks the target a tap meant. Grown targets can overlap each other, so a
 * point inside more than one resolves to the nearest centre rather than to
 * whichever happens to come first in the list.
 */
Layout.pick = function (targets, point) {
    var best = null;
    var bestDistance = Infinity;

    for (var i = 0; i < targets.length; i++) {
        if (!Layout.hitRect(targets[i].hit, point)) {
            continue;
        }
        var centreX = targets[i].hit.x + targets[i].hit.width / 2;
        var centreY = targets[i].hit.y + targets[i].hit.height / 2;
        var distance = Math.pow(point.x - centreX, 2) + Math.pow(point.y - centreY, 2);

        if (distance < bestDistance) {
            bestDistance = distance;
            best = targets[i];
        }
    }
    return best;
};

/** Whether a point falls inside a rect. */
Layout.hitRect = function (rect, point) {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height;
};
