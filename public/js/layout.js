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

var Layout = {};

Layout.MENU_PREFIX = "Tap ";

/** The difficulty menu. Offsets into the drawn string are derived, not counted. */
Layout.MENU_ITEMS = [
    { level: "E", label: "E: Easy" },
    { level: "S", label: "S: Standard" },
    { level: "H", label: "H: Hard" },
    { level: "V", label: "V: VHard" }
];

Layout.INTRO_TEXT = "Stop the balloons, before it is too late !!";
Layout.HIGH_SCORES_TEXT = "High Scores - ";

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

    /** A line height, as a multiple of the advance width of a capital M. */
    lineRatio: 1.3,

    /** Balloons spawn within this band of the width. */
    spawn: { inset: 0.05, spread: 0.9 },

    baseFontSize: 30,
    minFontSize: 12,

    /**
     * Smallest thing worth asking a finger to hit, in CSS pixels. Apple asks
     * for 44, Material for 48. At phone sizes the difficulty boxes came out
     * 17px tall, which is under a third of a fingertip, so aiming at one
     * missed roughly one tap in seven even with a generous error model.
     */
    minTouchTarget: 44,

    /**
     * Font size is capped at height/heightDivisor so the deepest row still
     * lands on screen. The deepest baseline sits at about 15.6x the font size,
     * so 19 leaves the composition occupying roughly 82% of the height.
     */
    heightDivisor: 19
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

/** The drawn menu string, plus where each label starts within it. */
(function buildMenu() {
    var text = Layout.MENU_PREFIX;
    var items = [];

    for (var i = 0; i < Layout.MENU_ITEMS.length; i++) {
        if (i > 0) {
            text += ", ";
        }
        items.push({
            level: Layout.MENU_ITEMS[i].level,
            offset: text.length,
            length: Layout.MENU_ITEMS[i].label.length
        });
        text += Layout.MENU_ITEMS[i].label;
    }

    Layout.MENU_TEXT = text;
    Layout.MENU_SLOTS = items;
}());

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
        Math.min(G.baseFontSize * (width / 1000), height / G.heightDivisor)
    );

    size = Math.round(size);
    ctx.font = size + "px Verdana";

    var available = width * (1 - 2 * G.columns.margin);
    var menuWidth = ctx.measureText(Layout.MENU_TEXT).width;

    if (menuWidth > available) {
        size = Math.max(1, Math.floor(size * (available / menuWidth)));
        ctx.font = size + "px Verdana";
    }

    return size;
};

/**
 * Every position the game draws or hit-tests, computed once per resize.
 * Regions that are both drawn and clicked return a single rect, so the two can
 * never drift apart the way the difficulty boxes used to.
 */
Layout.compute = function (ctx, width, height) {
    var G = Layout.GRID;
    var line = ctx.measureText("M").width * G.lineRatio;
    var unit = ctx.measureText(Layout.MENU_TEXT).width / Layout.MENU_TEXT.length;
    var left = width * G.columns.margin;

    var menuY = line * G.rows.menu;
    var headingY = line * G.rows.scoresHeading;

    // The box drawn around each label is grown to the touch minimum and
    // recentred on the text, so what is drawn is what can be hit. Only the
    // width is allowed to differ: widening the boxes would overlap them, since
    // they bracket substrings of one drawn string. Milestone 3 turns these into
    // laid-out buttons and that exception goes away.
    var naturalHeight = line * 1.25;
    var menuHeight = Math.max(naturalHeight, G.minTouchTarget);
    var menuTop = (menuY - line * 0.75) + naturalHeight / 2 - menuHeight / 2;

    var boxes = [];
    for (var i = 0; i < Layout.MENU_SLOTS.length; i++) {
        var slot = Layout.MENU_SLOTS[i];
        var box = {
            level: slot.level,
            x: left + unit * (slot.offset - 0.5),
            width: unit * (slot.length + 0.5)
        };
        box.hit = atLeastTouchSize({
            x: box.x, y: menuTop, width: box.width, height: menuHeight
        });
        boxes.push(box);
    }

    var rows = [];
    for (var r = 0; r < G.scoreRowCount; r++) {
        rows.push(line * (G.rows.firstScore + r * G.scoreRowStep));
    }

    var scoresHit = atLeastTouchSize({
        x: width * G.columns.scoresHeading,
        y: headingY - line / 2,
        width: unit * (Layout.HIGH_SCORES_TEXT.length + 4),
        height: line
    });

    var targets = boxes.map(function (box) {
        return { level: box.level, hit: box.hit };
    });
    targets.push({ level: null, hit: scoresHit });

    return {
        line: line,
        unit: unit,

        intro: { x: left, y: line * G.rows.intro },

        menu: {
            x: left,
            y: menuY,
            top: menuTop,
            height: menuHeight,
            boxes: boxes
        },

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

        /** Everything tappable on the title and game-over screens. */
        targets: targets
    };
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
