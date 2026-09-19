"use strict";

/**
 * The things in the sky, drawn small enough to put in a sentence.
 *
 * NOT ARTWORK. Every icon here is the game's own painter, run at legend size
 * against the same palette — a balloon icon is a balloon, a bird icon is a
 * bird. Icon sets drift: somebody changes the saucer and the picture of the
 * saucer on the title screen goes on showing last month's saucer, and the
 * screen that is supposed to teach the game starts lying about it. This cannot
 * drift, because there is only one drawing of each thing.
 *
 * ONE OF EACH, BUILT ONCE AND MOVED. The first version of this built a fresh
 * entity per icon per frame, which the HUD turned into two hundred balloons a
 * second for the row of lives -- and there is a test from milestone 1 that
 * exists to catch precisely that, because balloons in the sky used to do it.
 * Nothing here is ever stepped, so one of each kind can be moved and resized
 * to wherever it is needed.
 */

var Icons = {};

/**
 * How much room each kind needs around its centre, in icon radii.
 *
 * They are not the same shape: a balloon hangs its tail below the circle it is
 * measured by, a firefly throws a glow well past its body, and a saucer wears
 * a fuse ring outside its hull. Laying them out on their nominal radius put
 * them at visibly different sizes and at visibly different heights.
 */
Icons.REACH = {
    balloon: 1.4,
    // A bird is drawn asymmetrically about its own centre — the head reaches a
    // radius and a half forward of it — so it needs more room per radius than
    // its wingspan alone suggests, or it walks out of the legend sideways.
    bird: 1.9,
    boss: 1.25,
    firefly: FIREFLY_GLOW
};

/** The radius to build a kind at, so all four end up the same size on screen. */
Icons.radiusFor = function (kind, box) {
    return box / (Icons.REACH[kind] || 1);
};

/** The one of each, made on first use and kept. */
Icons.kept = {};

/** The colour a legend balloon is. Fixed, because a legend is not a lottery. */
Icons.BALLOON_COLOUR = { r: 226, g: 74, b: 92 };

Icons.build = function (game, kind) {
    if (kind === "balloon") {
        return new CANVASBALLOON.Balloon(
            "balloon_canvas", 0, 0, 1, Icons.BALLOON_COLOUR);
    }
    if (kind === "bird") {
        return birdConstructor(0, 0, 1, 0, true);
    }
    if (kind === "firefly") {
        return fireflyConstructor(0, 0, 1, 0, game.width, game.height);
    }
    // Mark I, and a ceiling of zero so it sits where it is put rather than
    // pushing itself down to keep a fuse ring on a screen it is not on.
    return bossConstructor(0, 0, 1, game.width, 1, 0);
};

/**
 * One thing from the sky, centred on a point and fitting inside `box`.
 *
 * Nothing here is stepped, so nothing wanders, bobs, pulses or counts down: it
 * is the pose each kind arrives in, moved to where it is wanted.
 */
Icons.draw = function (game, kind, x, y, box) {
    var r = Icons.radiusFor(kind, box);
    var it = Icons.kept[kind] || (Icons.kept[kind] = Icons.build(game, kind));

    if (kind === "balloon") {
        it.centerX = x;
        it.centerY = y - r * 0.2;
        it.radius = r;
        it.draw();
        return;
    }

    it.xcoord = x;
    it.ycoord = y;
    it.radius = r;
    it.draw(game);
};

/**
 * The verdict beside it: pop this, leave that alone.
 *
 * Drawn as strokes rather than set as ✓ and ✗, because a glyph is only there
 * if the face has it. The whole point of bundling a font was that every
 * machine lays out the same, and reaching for a character outside the latin
 * subset would hand that guarantee straight back.
 */
Icons.verdict = function (game, wanted, x, y, box) {
    var ctx = game.ctx;
    var r = box * 0.5;

    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, box * 0.16);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = wanted ? game.palette.accent : game.palette.ink;

    ctx.beginPath();
    if (wanted) {
        // A tick: pop it.
        ctx.moveTo(-r * 0.75, r * 0.05);
        ctx.lineTo(-r * 0.2, r * 0.6);
        ctx.lineTo(r * 0.8, -r * 0.6);
    } else {
        // A cross: hands off.
        ctx.moveTo(-r * 0.6, -r * 0.6);
        ctx.lineTo(r * 0.6, r * 0.6);
        ctx.moveTo(r * 0.6, -r * 0.6);
        ctx.lineTo(-r * 0.6, r * 0.6);
    }
    ctx.stroke();
    ctx.restore();
};

/**
 * What the legend says, in order, and what it means.
 *
 * `wanted` is whether a tap on it is a good idea. It is the only rule in the
 * game and this is the whole of it — the sentence in Layout.DESCRIPTION says
 * the same thing in words, for the screen reader and for anyone who would
 * rather read it.
 */
Icons.RULES = [
    { kind: "balloon", wanted: true },
    { kind: "boss", wanted: true },
    { kind: "bird", wanted: false },
    { kind: "firefly", wanted: false }
];
