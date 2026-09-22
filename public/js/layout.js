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
 * about 2.29 taps a second from ONE pointer, and a touchscreen lets you use two
 * thumbs. Measured, that is the difference between dying around level 10 and
 * usually finishing — which is why the board records which was used.
 */
Layout.DESCRIPTION = [
    "Pop up the balloons, repel the saucers, save the birds and the fireflies.",
    "Twenty levels, twenty seconds each, five lives. It can be won.",
    "Best played on a tablet."
];

/**
 * What the game is, at length, for anyone who wants it.
 *
 * The title screen says the rules in four icons and the countdown says nothing
 * at all, which is right for the ninety-nine times out of a hundred that
 * somebody wants to play rather than read. This is the hundredth.
 *
 * Every number in here is read from the tables that decide it rather than
 * written out, because a rules page that goes stale is worse than no rules
 * page: it is a rules page that lies.
 */
// A question mark rather than the word: it is an icon, and it has to fit on
// the same row as a name and a level chip on a 240px screen.
Layout.ABOUT_TEXT = "?";
Layout.ABOUT_TITLE = "About this game";
Layout.BACK_TEXT = "Back";

Layout.about = function () {
    var top = Ladder.at(Ladder.MAX);
    var boss = Ladder.saucer(1);
    var mark2 = Ladder.saucer(2);
    var lives = Game.LIVES + Ladder.livesBy(Ladder.MAX);

    return [
        { heading: "What you are doing", lines: [
            "Pop the balloons before they reach the top. One that gets away " +
                "costs a life.",
            "Some balloons are reinforced and take two taps, some are " +
                "armoured and take three. They rise more slowly and are worth " +
                "more: " + Ladder.skin(3).points + " points against " +
                Ladder.skin(1).points + "."
        ] },
        { heading: "What to leave alone", lines: [
            "Birds and fireflies both cost a life if you touch them. A bird " +
                "crosses and is gone; a firefly hovers, and will sit in front " +
                "of the balloon you were aiming at.",
            "A tap that lands on a firefly is gone, and so is the life."
        ] },
        { heading: "The saucers", lines: [
            "A saucer arrives when the sky goes quiet and fires after " +
                Math.round(boss.fuse / 30) + " seconds. " + boss.taps +
                " taps bring it down.",
            "From level 18 a bigger one comes instead: " + mark2.taps +
                " taps in " + (mark2.fuse / 30).toFixed(1) + " seconds, and it " +
                "will not hold still."
        ] },
        { heading: "A run", lines: [
            Ladder.MAX + " levels of " + Ladder.CLIMB_SECONDS + " seconds. " +
                Game.LIVES + " lives, and one more at 12, 15 and 18, so " +
                lives + " in all if you get there.",
            "From level 12 some balloons wander as they rise. From 14 some " +
                "thin out the higher they go — never so far that you cannot " +
                "find them, but far enough to make you look.",
            "You get " + Game.PAUSES + " pauses. Each one gives itself back " +
                "after " + Game.PAUSE_SECONDS + " seconds."
        ] },
        { heading: "Where it came from", lines: [
            "Written in December 2012 as an experiment with the HTML5 canvas: " +
                "balloons, four difficulty settings and a photograph of a sky.",
            "Rebuilt in 2026. The sky is drawn rather than photographed and " +
                "runs from morning to night as you climb; the difficulties " +
                "became one ladder of " + Ladder.MAX + " levels, so that every " +
                "score on the board was earned the same way.",
            "It can be won. Surviving level " + Ladder.MAX + " is the end of it."
        ] }
    ];
};

// The button is the way in now, not a signpost: the title screen no longer
// starts a game on a tap anywhere, so there is no "or tap anywhere" line.
Layout.RESUME_TEXT = "Resume";

/** The level chip, and what it warns when it is not on level 1. */
Layout.START_FROM_ONE = "From level 1";
Layout.START_PREFIX = "From level ";
Layout.PRACTICE_WARNING = "Practice run — this score will not be saved.";
Layout.PAUSED_TEXT = "Paused";
Layout.QUIT_TEXT = "Give up?";
Layout.QUIT_HINT = "Your run ends here, and the score you have goes to the board.";
Layout.QUIT_YES = "Give up";
Layout.QUIT_NO = "Keep playing";
Layout.PAUSES_LEFT = " pauses left";
Layout.ONE_PAUSE_LEFT = "1 pause left";
Layout.NO_PAUSES_LEFT = "That was your last pause";
Layout.RESUMING_IN = "Resuming in ";
Layout.PAUSED_HINT = "You looked away, so the game waited.";
/** The Scores chip, the screen behind it, and the breakdown it explains. */
Layout.BOARD_TEXT = "\u2605";
Layout.BOARD_TITLE = "High Scores";
Layout.MINE_TEXT = "Just mine";
Layout.ALL_TEXT = "Everyone";
Layout.NO_SCORES_TEXT = "No scores yet.";
Layout.BOARD_OFFLINE_TEXT = "Board unavailable \u2014 showing your runs.";
Layout.BOARD_LEGEND = "B/R/A/S points \u00b7 E/S/Bi/F lost";
Layout.PERSONAL_BEST_TEXT = "New personal best!";
Layout.POINTS_LABEL = "Points";
Layout.LOSSES_LABEL = "Lives lost";
Layout.BREAKDOWN_POINTS = [
    { key: "ordinary", label: "Balloons" },
    { key: "reinforced", label: "Reinforced" },
    { key: "armoured", label: "Armoured" },
    { key: "saucer1", label: "Saucers" },
    { key: "saucer2", label: "Big saucers" }
];
Layout.BREAKDOWN_LOSSES = [
    { key: "escapes", label: "Escaped" },
    { key: "saucers", label: "Saucers fired" },
    { key: "birds", label: "Birds" },
    { key: "fireflies", label: "Fireflies" }
];

/** The name line along the bottom, and the screen it opens. */
Layout.NAME_TEXT = "Who is playing?";
Layout.NAME_HINT = "Enter to save, Escape to cancel";
Layout.SAVE_TEXT = "Save";
Layout.PLAY_TEXT = "Play";
Layout.OKAY_TEXT = "OK";

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
     * The legend that replaces the rules sentence, in line heights.
     *
     * `icon` is how big each thing from the sky is drawn, `gap` the air
     * between an icon and its verdict, and `pair` the air between one pair and
     * the next -- which is the wider of the two on purpose, because "balloon,
     * tick" has to read as one thing and not as "tick, saucer".
     */
    legend: { icon: 1.15, gap: 0.5, pair: 1.25 },

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
     * rendering it. It went up again when the rules sentence became a row of
     * icons: a legend is two line heights tall where the line it replaced was
     * one, and the tightest window was down to 18px of clearance.
     *
     * What it is given is the height less the name line, which sits on the
     * bottom edge outside the flow and takes a touch target plus a little air.
     * Without that reservation the flow ran into the footer on a letterboxed
     * window: at 1920x400 the last score row landed 5px below the name line.
     */
    heightDivisor: 22,
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
    var longest = ctx.measureText(Layout.INTRO_TEXT).width;

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

    // Nothing flows here. The Play button is laid out and drawn on its own,
    // and the footer chips are anchored rather than flowed — but the flow
    // below is kept because it still wraps, still grows to the touch minimum,
    // and the name screen's Save button and whatever comes next go through the
    // same machinery.
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
    // The rules sentence is not among these any more: it is the legend below,
    // drawn in the things it used to name. It stays in Layout.DESCRIPTION
    // because that is what the screen reader is given, and a row of pictures
    // says nothing at all to one.
    var wrapped = [];
    Layout.DESCRIPTION.slice(1).forEach(function (sentence) {
        Layout.wrap(ctx, sentence, available).forEach(function (text) {
            wrapped.push(text);
        });
    });
    ctx.font = fonts.score;

    // The legend stands where that sentence stood, and the rest flows under
    // it on the same rhythm.
    var legend = Layout.legendRow(ctx, width, line, fontSize);
    var legendTop = menuTop + line * 0.3;
    legend.y = legendTop + legend.height / 2;
    legend.chip.y = legendTop - line * 0.25;
    legend.chip.height = legend.height + line * 0.5;

    var textTop = legendTop + legend.height + line * 1.35;
    var description = wrapped.map(function (text, d) {
        return { x: left, y: textTop + line * (d * G.descriptionStep), text: text };
    });
    var menuBottom = buttons.length
        ? rowTop + buttonHeight
        : textTop + line * ((description.length - 1) * G.descriptionStep + 0.6);

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

    // The ground the text block stands on. Everything drawn on a static screen
    // sits inside it, which is what makes one ink colour legible on every
    // palette.
    var panelPad = line * G.panelPad;
    var panelTop = line * G.rows.intro - line;
    var panel = {
        x: left - panelPad,
        y: Math.max(0, panelTop - panelPad),
        width: Math.min(width - (left - panelPad) * 2, width),
        height: 0,
        radius: line * G.button.radius * 2
    };

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
    // The About chip, bottom right, mirroring the name chip on the left — or
    // the row above it when the bottom row is already full. On a 240px screen
    // the name and the level chip reach past the middle, and a third chip at
    // the right edge landed on top of the level one.
    var aboutWidth = Math.max(
        G.minTouchTarget,
        ctx.measureText(Layout.ABOUT_TEXT).width + line * G.footer.padX * 2
    );
    var about = {
        x: width - width * G.columns.margin - aboutWidth,
        y: player.y,
        width: aboutWidth,
        height: player.height,
        radius: player.radius
    };

    if (about.x < start.x + start.width + line * G.footer.padX) {
        about.y = player.y - footerHeight - line * G.footer.inset;
    }

    // The Scores chip, sized like About and sitting beside it. On a screen too
    // narrow for both, it stacks above, where About already went.
    var boardWidth = Math.max(
        G.minTouchTarget,
        ctx.measureText(Layout.BOARD_TEXT).width + line * G.footer.padX * 2
    );
    var board = {
        x: about.x - boardWidth - line * G.footer.padX,
        y: about.y,
        width: boardWidth,
        height: player.height,
        radius: player.radius
    };
    if (board.x < player.x + player.width + line * G.footer.padX) {
        board.x = width - width * G.columns.margin - boardWidth;
        board.y = about.y - footerHeight - line * G.footer.inset;
    }

    // The way out of the About screen is a word, not a mark, and a chip sized
    // for one character is not a chip sized for "Back".
    var backWidth = Math.max(
        G.minTouchTarget,
        ctx.measureText(Layout.BACK_TEXT).width + line * G.footer.padX * 2
    );
    var back = {
        x: width - width * G.columns.margin - backWidth,
        y: player.y,
        width: backWidth,
        height: footerHeight,
        radius: line * G.footer.radius
    };

    targets.push({ id: "about", hit: about });
    targets.push({ id: "board", hit: board });
    targets.push({ id: "player", hit: player });

    // The level chip is gone from the screen, so it is gone from the targets.
    // Game.startLevel and everything behind it stays: the playtest harness
    // sets it directly to measure the top of the ladder, which is the only
    // thing that ever really needed a way in.

    // The OK button sits just above the name chip, and the panel reaches below
    // it: the breakdown columns fill the space between the intro and the
    // button. Pinning the button to the title's text flow put it in the middle
    // of the columns, which is where it was seen overlapping them.
    var okayHeight = Math.max(G.minTouchTarget, line * 1.5);
    var okayY = player.y - line * 0.6 - okayHeight;
    panel.height = Math.max(0, okayY + okayHeight - panel.y + panelPad);

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

    // --- the Scores screen
    //
    // A full panel of rows drawn smaller and tighter than the title's board
    // ever was, two lines to an entry: the run on the first, where its points
    // and lives went on the second. How many fit depends on the screen, so the
    // count is measured rather than fixed.
    var toggleHeight = Math.max(G.minTouchTarget, line * 1.5);
    var toggleWidth = Math.max(
        G.minTouchTarget * 1.6,
        ctx.measureText(Layout.MINE_TEXT + " / " + Layout.ALL_TEXT).width +
            line * G.footer.padX * 2
    );
    var boardFootY = Math.max(0, height - toggleHeight - line * G.footer.inset);
    var boardTop = line * (G.rows.scoresHeading + 2.2);
    var entryStep = line * 2.0;
    var boardRoom = boardFootY - line * 0.7 - boardTop;
    var boardMax = Math.min(10, Math.max(1, Math.floor(boardRoom / entryStep)));
    var boardRows = [];
    for (var br = 0; br < boardMax; br++) {
        boardRows.push(boardTop + line * br * 2.0);
    }
    var boardScreen = {
        heading: { x: left, y: line * G.rows.scoresHeading },
        columns: {
            date: width * G.columns.scoreDate,
            name: width * G.columns.scoreName,
            level: width * G.columns.scoreLevel,
            value: width * G.columns.scoreValue
        },
        rows: boardRows,
        step: entryStep,
        bodySize: Math.max(1, Math.round(fontSize * 0.62)) + "px " + Layout.FONT,
        tinySize: Math.max(1, Math.round(fontSize * 0.5)) + "px " + Layout.FONT,
        toggle: {
            x: left,
            y: boardFootY,
            width: toggleWidth,
            height: toggleHeight,
            radius: line * G.footer.radius
        },
        back: {
            x: width - width * G.columns.margin - Math.max(G.minTouchTarget, line * 1.5),
            y: boardFootY,
            width: Math.max(G.minTouchTarget, line * 1.5),
            height: toggleHeight,
            radius: line * G.footer.radius
        }
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

        legend: legend,

        // The way off the game-over screen, anchored above the name chip rather
        // than to the title's text flow: the breakdown columns own the middle
        // of this screen now, and a button placed by the title's metrics lands
        // in the middle of them.
        okay: {
            x: width * G.columns.margin,
            y: okayY,
            width: Math.max(G.minTouchTarget * 2, line * 3.2),
            height: okayHeight,
            radius: line * G.footer.radius
        },

        quitYes: {
            x: width * G.columns.margin,
            y: resume.y,
            width: resume.width,
            height: resume.height,
            radius: resume.radius
        },
        quitNo: {
            x: width * G.columns.margin + resume.width + line * 0.6,
            y: resume.y,
            width: resume.width,
            height: resume.height,
            radius: resume.radius
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

            // Small enough to sit inside the chip, big enough to read as a
            // balloon rather than a dot.
            life: line * 0.3,

            // Pause and quit, on the right of the row where the clock is.
            // Touch targets rather than glyphs: they are the only things in
            // the game you press while playing that are not a balloon.
            //
            // Quit is the OUTER one, furthest from the middle of the screen
            // and hardest to hit by accident, because pausing costs you a
            // pause and quitting costs you the run.
            pause: {
                x: width - width * G.columns.margin -
                    Math.max(G.minTouchTarget, line * 1.5) * 2 - line * 0.3,
                y: line * G.rows.hud - line * G.hudPlate.top,
                width: Math.max(G.minTouchTarget, line * 1.5),
                height: Math.max(G.minTouchTarget, line * G.hudPlate.height),
                radius: line * G.hudPlate.radius
            },

            quit: {
                x: width - width * G.columns.margin - Math.max(G.minTouchTarget, line * 1.5),
                y: line * G.rows.hud - line * G.hudPlate.top,
                width: Math.max(G.minTouchTarget, line * 1.5),
                height: Math.max(G.minTouchTarget, line * G.hudPlate.height),
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

        about: about,
        back: back,
        board: board,
        boardScreen: boardScreen,
        targets: targets
    };
};

/**
 * Where each icon and each verdict sits, centred as one row.
 *
 * Measured rather than spaced by eye, because the four pairs are a single
 * object as far as the composition is concerned: it is centred as a whole, so
 * the row has to be laid out before anybody knows where it starts.
 *
 * It shrinks to fit rather than wrapping. A legend that breaks over two lines
 * stops reading as one sentence, and four pairs on a phone is the narrowest
 * case there is -- so on a screen too tight for them at full size the icons
 * get smaller together.
 */
Layout.legendRow = function (ctx, width, line, fontSize) {
    var G = Layout.GRID;
    var available = width * (1 - 2 * G.columns.margin);
    var icon = line * G.legend.icon;
    var gap = line * G.legend.gap;
    var pair = line * G.legend.pair;

    // Per pair: the icon's own box either side of its centre, the gap, and a
    // slot for the verdict. This counted the verdict's slot out and the chip
    // came up an icon short for every pair in the row.
    var each = icon * 3 + gap;
    var wide = Icons.RULES.length * each + (Icons.RULES.length - 1) * pair;

    if (wide > available) {
        var squeeze = available / wide;
        icon *= squeeze;
        gap *= squeeze;
        pair *= squeeze;
        wide = available;
    }

    // Left, with everything else. Centred, it floated away from the block it
    // belongs to and read as decoration rather than as the line it replaced.
    var x = width * G.columns.margin;
    var row = {
        icon: icon,
        height: icon * 2,
        items: [],
        chip: { x: x - icon * 0.6, y: 0, width: wide + icon * 1.2, height: 0,
                radius: line * G.footer.radius }
    };

    Icons.RULES.forEach(function (rule) {
        row.items.push({
            kind: rule.kind,
            wanted: rule.wanted,
            iconX: x + icon,
            verdictX: x + icon * 2 + gap + icon * 0.5
        });
        x += icon * 2 + gap + icon + pair;
    });

    return row;
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
