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

/**
 * What the title screen says.
 *
 * It used to say "Press space to play", which told a phone nothing and told
 * everyone else the least interesting true fact about the game. Behind this
 * text the game is now playing itself (attract.js), so the words only have to
 * do what the footage cannot: say what a run is, and that it can be finished.
 */
Layout.INTRO_TEXT = "Pop the balloons before they get away";

/**
 * The rules, in one line, what a run is in another, and how to play it best.
 *
 * The first line replaces the break between levels. That screen stopped the
 * game every time something new arrived to explain it, which was the right
 * instinct and the wrong place: four verbs cover every object in the game, and
 * a player who has read them once does not need the game to stop and say them
 * again. "Save" does the work of two rules at once — a bird and a firefly are
 * both things you leave alone, and since this phase both of them cost a life,
 * it is now literally true rather than a shorthand.
 *
 * The same sentence greets the countdown, because the countdown is the other
 * moment a new player is looking at nothing else.
 *
 * The third line is advice and it is earned: the ladder is calibrated against
 * about 2.1 taps a second from ONE pointer, and a touchscreen lets you use two
 * thumbs. Measured, that is the difference between dying around level 8 and
 * finishing every run — which is why the board records which was used.
 */
Layout.DESCRIPTION = [
    "Pop up the balloons, repel the saucers, save the birds and the fireflies.",
    "Twenty levels, twenty seconds each, five lives. It can be won.",
    "Best played on a tablet."
];

/** How much of the width the countdown's line of instruction may use. */
Layout.COUNTDOWN_WIDTH = 0.86;

Layout.START_TEXT = "Tap anywhere to play";
Layout.RESUME_TEXT = "Resume";

/** The level chip, and what it warns when it is not on level 1. */
Layout.START_FROM_ONE = "From level 1";
Layout.START_PREFIX = "From level ";
Layout.PRACTICE_WARNING = "Practice run — this score will not be saved.";
Layout.PLAY_INSTRUCTION = Layout.DESCRIPTION[0];
Layout.PAUSED_TEXT = "Paused";
Layout.PAUSED_HINT = "You looked away, so the game waited.";
Layout.HIGH_SCORES_TEXT = "High Scores";

/** The name line along the bottom, and the screen it opens. */
Layout.PLAYER_PREFIX = "Playing as ";
Layout.NAME_TEXT = "Who is playing?";
Layout.NAME_HINT = "Enter to save, Escape to cancel";
Layout.SAVE_TEXT = "Save";
Layout.PLAY_TEXT = "Play";

/**
 * The face everything is drawn in, and what to fall back to.
 *
 * Verdana was the browser's, chosen for being everywhere rather than for being
 * right: a screen font from 1996 designed to survive 96dpi CRTs, which is a
 * thing no phone has been since. Fredoka is rounded, has the weight to sit on
 * a sky without a heavy scrim behind every word, and its digits are unmistakable
 * at the size the countdown uses them.
 *
 * It is bundled rather than linked, because a request to a third party on load
 * is a request that fails offline and inside an Android wrapper -- and because
 * the canvas has to MEASURE this font before it can lay anything out, so a file
 * that arrives late is a composition laid out to the wrong metrics.
 *
 * The fallback is deliberately Verdana: if the file ever fails to arrive the
 * game is laid out in the face it was tuned for right up until this change,
 * rather than in whatever the platform's default happens to be.
 */
Layout.FONT = "Fredoka, Verdana, sans-serif";

Layout.GRID = {
    /** Fractions of canvas width. */
    columns: {
        margin: 0.05,
        scoresHeading: 0.28,
        scoreDate: 0.05,
        scoreName: 0.38,
        scoreLevel: 0.62,
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

    /** Line spacing for the description block, in line heights. */
    descriptionStep: 1.35,

    /**
     * Button padding and spacing, in line heights, and a floor on the width as
     * a fraction of the composition. Four difficulty buttons filled their row
     * between them; the one button that replaced them looked apologetic at the
     * width of its own label, so it gets a minimum.
     */
    button: { padX: 0.55, padY: 0.28, gap: 0.34, radius: 0.28, minWidth: 0.22 },

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

    /** Air between the text block and the edge of the panel behind it. */
    panelPad: 0.7,

    /**
     * The ground under each run of HUD text, in line heights.
     *
     * It used to be one bar across the whole width, and the whole width is the
     * problem: the HUD is drawn OVER the play area, so a lid of scrim across
     * the top of the screen is a lid across the top of the game. A balloon
     * behind it sat at about 1.4:1 against the sky -- under the 3:1 anything
     * you have to find is meant to clear -- so balloons were escaping through
     * a strip nobody could see into. The text needs a ground; the empty space
     * either side of it does not.
     */
    hudPlate: { padX: 0.5, top: 0.78, height: 1.15, radius: 0.28 },

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
     * for 44, Material for 48. At phone sizes the menu boxes came out
     * 17px tall, which is under a third of a fingertip, so aiming at one
     * missed roughly one tap in seven even with a generous error model.
     */
    minTouchTarget: 44,

    /**
     * Font size is capped so the deepest row still lands on screen. Measured
     * across every viewport the tests cover, the deepest baseline sits at
     * 18.7x the font size on a wide window and 21.7x on a phone, where the
     * description wraps to five lines — so this leaves the composition about
     * 88% of the height it is given.
     *
     * It was 19, from a deepest baseline of 15.6x, and a third line of
     * description moved that: at 1280x720 the last score row landed 9px BELOW
     * the name line, and at 2560x1440 it was 24px. The number is measured
     * rather than reasoned, because the description wraps and how many lines
     * that comes to depends on the width, the font and which machine is
     * rendering it.
     *
     * What it is given is the height less the name line, which sits on the
     * bottom edge outside the flow and takes a touch target plus a little air.
     * Without that reservation the flow ran into the footer on a letterboxed
     * window: at 1920x400 the last score row landed 5px below the name line.
     */
    heightDivisor: 21,
    footerReserve: 56
};

/**
 * Breaks one sentence into lines that fit a width, at the context's font.
 *
 * Greedy and word-based, which is all the two sentences on the title screen
 * need. A word longer than the whole width gets a line to itself and overflows
 * rather than being cut in half: there is no such word here, and a hyphenated
 * fragment would read worse than a line that is slightly too long.
 */
Layout.wrap = function (ctx, sentence, available) {
    var words = String(sentence).split(" ");
    var lines = [];
    var current = "";

    words.forEach(function (word) {
        var candidate = current ? current + " " + word : word;
        if (current && ctx.measureText(candidate).width > available) {
            lines.push(current);
            current = word;
            return;
        }
        current = candidate;
    });

    if (current) {
        lines.push(current);
    }
    return lines;
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
    ctx.font = size + "px " + Layout.FONT;

    // Only the lines that CANNOT wrap decide whether the composition fits.
    //
    // The description used to be measured here too, and on a 320px phone its
    // second line came out eight pixels over — 3% — which scaled the entire
    // type scale down past `minFontSize` and made a floor that is documented
    // as a floor into a suggestion. One long sentence should cost itself a
    // second line, not cost every other word on the screen a point of size.
    // It wraps in `compute` instead.
    //
    // That only showed up on Windows, back when the face was whatever the
    // browser had: the Linux boxes this was built on substituted something
    // narrower and the same string fitted. A bundled font is the fix for that
    // class of bug — every machine now lays out against the same metrics.
    var available = width * (1 - 2 * G.columns.margin);
    var longest = 0;
    [Layout.INTRO_TEXT, Layout.START_TEXT].forEach(function (text) {
        longest = Math.max(longest, ctx.measureText(text).width);
    });

    if (longest > available) {
        size = Math.max(1, Math.floor(size * (available / longest)));
        ctx.font = size + "px " + Layout.FONT;
    }

    return size;
};

/**
 * Every position the game draws or hit-tests, computed once per resize.
 * Regions that are both drawn and clicked return a single rect, so the two can
 * never drift apart the way the menu boxes used to.
 */
/** What the level chip says. Level 1 is the real game, so it says so. */
Layout.startLabel = function (level) {
    return (level > 1)
        ? Layout.START_PREFIX + level
        : Layout.START_FROM_ONE;
};

Layout.compute = function (ctx, width, height, fontSize, playerLabel, startLevel) {
    var G = Layout.GRID;
    var line = ctx.measureText("M").width * G.lineRatio;
    var left = width * G.columns.margin;
    var available = width * (1 - 2 * G.columns.margin);

    var fonts = {};
    for (var role in G.type) {
        if (Object.prototype.hasOwnProperty.call(G.type, role)) {
            fonts[role] = Math.max(1, Math.round(fontSize * G.type[role])) +
                "px " + Layout.FONT;
        }
    }

    // --- menu buttons, flowed left to right and wrapped if they overrun

    var padX = line * G.button.padX;
    var padY = line * G.button.padY;
    var gap = line * G.button.gap;
    var buttonHeight = Math.max(line + padY * 2, G.minTouchTarget);

    // No buttons. A tap anywhere on the sky starts a game, so a button would
    // be a smaller target for the same thing — and it would sit on top of the
    // footage it was competing with. The flow below is kept because it still
    // wraps, still grows to the touch minimum, and the name screen's Save
    // button and whatever comes next go through the same machinery.
    var items = [];

    ctx.font = fonts.menu;
    var widths = items.map(function (item) {
        return Math.max(
            ctx.measureText(item.label).width + padX * 2,
            available * G.button.minWidth,
            G.minTouchTarget
        );
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
            id: items[i].id,
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

    // With no buttons, the row the menu used to occupy carries the description
    // instead, and what follows flows from the bottom of THAT rather than from
    // the height of a button that is no longer drawn.
    //
    // Each sentence is wrapped to the width available, so a narrow screen gets
    // more lines rather than smaller type. Every line carries its own text,
    // because after wrapping there is no longer one line per entry in
    // Layout.DESCRIPTION for a painter to index into.
    ctx.font = fonts.label;
    var wrapped = [];
    Layout.DESCRIPTION.forEach(function (sentence) {
        Layout.wrap(ctx, sentence, available).forEach(function (text) {
            wrapped.push(text);
        });
    });
    ctx.font = fonts.score;

    var description = wrapped.map(function (text, d) {
        return { x: left, y: menuTop + line * (1 + d * G.descriptionStep), text: text };
    });
    var menuBottom = buttons.length
        ? rowTop + buttonHeight
        : menuTop + line * (description.length * G.descriptionStep + 0.4);

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

    // The ground the text block stands on: from above the headline to below
    // the last score row, with a margin of air. Everything drawn on a static
    // screen sits inside it, which is what makes one ink colour legible on
    // every palette.
    var panelPad = line * G.panelPad;
    var panelTop = line * G.rows.intro - line;
    var panel = {
        x: left - panelPad,
        y: Math.max(0, panelTop - panelPad),
        width: Math.min(width - (left - panelPad) * 2, width),
        height: 0,
        radius: line * G.button.radius * 2
    };

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

    // --- the level chip, beside the name and anchored to the same edge
    //
    // Down here rather than up in the text block on purpose: it is a thing you
    // touch, and everything in the block above is a thing you read, on a
    // screen where touching anything else starts a game.
    var startLabel = Layout.startLabel(startLevel);
    var start = {
        x: left + player.width + line * G.footer.padX,
        y: player.y,
        width: Math.max(
            ctx.measureText(startLabel).width + line * G.footer.padX * 2,
            G.minTouchTarget
        ),
        height: footerHeight,
        radius: line * G.footer.radius,
        label: startLabel
    };

    // The warning sits above both chips, because a score that will not be
    // saved is not a detail to discover afterwards.
    var practice = {
        x: left,
        y: player.y - line * 0.7
    };

    // --- the name screen, on the row the menu button occupies elsewhere

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

    // --- the break between levels, on the row below its explanation

    ctx.font = fonts.menu;
    var resumeWidth = Math.max(
        ctx.measureText(Layout.RESUME_TEXT).width + padX * 2,
        available * G.button.minWidth,
        G.minTouchTarget
    );
    ctx.font = fonts.score;
    var resume = {
        x: left,
        // Under two lines of explanation rather than on the hint row, which is
        // positioned for a screen with a score table under it and left the
        // button stranded halfway down an empty sky.
        //
        // Two, fixed, rather than however many lines the title screen's
        // description wrapped to: the break has its own two lines, and hanging
        // its button off an unrelated screen's text was a coupling waiting to
        // move the button on a narrow phone.
        y: menuTop + line * (1 + 2 * G.descriptionStep) + line * 1.1,
        width: resumeWidth,
        height: buttonHeight,
        radius: line * G.button.radius,
        label: Layout.RESUME_TEXT
    };
    resume.hit = {
        x: resume.x, y: resume.y, width: resume.width, height: resume.height
    };
    // And the panel behind the break, which has to reach past its button.
    // Declared here rather than beside the others so it comes after the
    // button it is measured from: `var` hoisting made an earlier version of
    // this assign into an undefined object.
    var breakPanel = {
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: resume.y + resume.height - panel.y + panelPad * 2
    };

    // Every tappable thing carries an id: the button starts a game, so does
    // the high-score line, and the name line opens the name screen.
    var targets = buttons.map(function (button) {
        return { id: button.id, hit: button.hit };
    });
    targets.push({ id: "replay", hit: scoresHit });
    targets.push({ id: "player", hit: player });
    targets.push({ id: "start", hit: start });

    panel.height = rows[rows.length - 1] + line - panel.y + panelPad;

    // A shorter panel for the title screen, which has the game playing behind
    // it. The full one reaches the bottom of the score table and so covers
    // almost the whole window — which was fine when there was nothing under it
    // and hides the footage now. This one stops under the start prompt.
    var splash = {
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: hintY + line - panel.y + panelPad
    };


    return {
        line: line,
        fonts: fonts,

        panel: panel,
        splash: splash,
        breakPanel: breakPanel,

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
        description: description,

        player: player,
        start: start,
        practice: practice,

        name: { field: field, save: save },
        resume: resume,

        countdown: { x: width / 2, y: headingY + line * 1.4 },

        scores: {
            heading: { x: width * G.columns.scoresHeading, y: headingY },
            hit: scoresHit,
            columns: {
                date: width * G.columns.scoreDate,
                name: width * G.columns.scoreName,
                level: width * G.columns.scoreLevel,
                value: width * G.columns.scoreValue
            },
            rows: rows
        },

        hud: {
            y: line * G.rows.hud,

            // The HUD is the only text drawn during play, and it is drawn over
            // whatever the sky is doing. Each run of it gets a chip of ground
            // the size of the words, rather than the whole row getting a lid.
            plate: {
                padX: line * G.hudPlate.padX,
                y: line * G.rows.hud - line * G.hudPlate.top,
                height: line * G.hudPlate.height,
                radius: line * G.hudPlate.radius
            },

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
