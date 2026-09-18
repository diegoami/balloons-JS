/**
 * The sky the game is played against, drawn rather than photographed.
 *
 * It used to be sky_3.jpeg set as a CSS background with `cover`. That had
 * three problems. Text was drawn over an image containing both bright cloud
 * and mid blue, so no colour was legible everywhere on it. The crop moved with
 * the aspect ratio, so the composition landed on a different backdrop at every
 * size. And it was a fixed raster upscaled on a 2x or 3x display, the same
 * softness that milestone 1 fixed for text.
 *
 * Drawing it instead means the ground and the text are chosen together, so
 * contrast is guaranteed rather than hoped for, and the sky can carry state:
 * the time of day climbs with the ladder, morning to night.
 */

"use strict";
var Sky = {};

/**
 * Four times of day. Each defines the sky itself and the ink drawn on it, so
 * text colour is never picked independently of its background.
 *
 * `scrim` darkens the top of the sky; `panel` is the stronger version drawn
 * behind the text block itself. The scrim alone was sized for a composition
 * that sat in the top half of the screen, and once the leaderboard moved below
 * it white rows were landing on a near-white horizon at 1.4:1 — text you could
 * not read rather than text that merely failed a guideline.
 */
Sky.PALETTES = {
    morning: {
        name: "clear morning",
        top: "#1E6FB4", mid: "#6FB6E4", horizon: "#D7EDF8",
        sun: { x: 0.78, y: 0.16, radius: 0.42, color: "#FFF4D6" },
        scrim: "rgba(8, 26, 48, 0.42)",
        panel: "rgba(8, 26, 48, 0.72)",
        ink: "#FFFFFF",
        inkSoft: "rgba(255, 255, 255, 0.78)",
        accent: "#FFD98A",
        onAccent: "#0B2438",
        buttonFill: "rgba(255, 255, 255, 0.18)",
        buttonBorder: "rgba(255, 255, 255, 0.60)",
        buttonPressOverlay: "rgba(255, 255, 255, 0.22)",
        buttonDisabledFill: "rgba(255, 255, 255, 0.05)",
        buttonDisabledBorder: "rgba(255, 255, 255, 0.16)",
        inkDisabled: "rgba(255, 255, 255, 0.34)",
        bossHull: "#3A4A5E",
        bossDome: "#6E7C90",
        bossLight: "#FFD98A",
        bossBeam: "rgba(255, 120, 60, 0.75)",
        bossHot: "#C4543A",
        birdInk: "#16324A",
        stars: 0
    },
    afternoon: {
        name: "afternoon",
        top: "#1B5FA8", mid: "#63A8DC", horizon: "#EBDFC9",
        sun: { x: 0.82, y: 0.22, radius: 0.46, color: "#FFE2A8" },
        scrim: "rgba(8, 24, 46, 0.44)",
        panel: "rgba(8, 24, 46, 0.72)",
        ink: "#FFFFFF",
        inkSoft: "rgba(255, 255, 255, 0.78)",
        accent: "#FFCE73",
        onAccent: "#2A1E08",
        buttonFill: "rgba(255, 255, 255, 0.18)",
        buttonBorder: "rgba(255, 255, 255, 0.60)",
        buttonPressOverlay: "rgba(255, 255, 255, 0.22)",
        buttonDisabledFill: "rgba(255, 255, 255, 0.05)",
        buttonDisabledBorder: "rgba(255, 255, 255, 0.16)",
        inkDisabled: "rgba(255, 255, 255, 0.34)",
        bossHull: "#3B4759",
        bossDome: "#6D788B",
        bossLight: "#FFCE73",
        bossBeam: "rgba(255, 120, 60, 0.75)",
        bossHot: "#C4543A",
        birdInk: "#17304C",
        stars: 0
    },
    dusk: {
        name: "dusk",
        top: "#16294F", mid: "#6B4A7A", horizon: "#E3885F",
        sun: { x: 0.24, y: 0.72, radius: 0.5, color: "#FF9E5E" },
        scrim: "rgba(6, 12, 30, 0.46)",
        panel: "rgba(6, 12, 30, 0.68)",
        ink: "#FFFFFF",
        inkSoft: "rgba(255, 255, 255, 0.76)",
        accent: "#FFB870",
        onAccent: "#2A1206",
        buttonFill: "rgba(255, 255, 255, 0.18)",
        buttonBorder: "rgba(255, 255, 255, 0.60)",
        buttonPressOverlay: "rgba(255, 255, 255, 0.22)",
        buttonDisabledFill: "rgba(255, 255, 255, 0.05)",
        buttonDisabledBorder: "rgba(255, 255, 255, 0.16)",
        inkDisabled: "rgba(255, 255, 255, 0.34)",
        bossHull: "#2F2338",
        bossDome: "#5A4668",
        bossLight: "#FFB870",
        bossBeam: "rgba(255, 150, 90, 0.8)",
        bossHot: "#D4603C",
        birdInk: "#2A1A33",
        stars: 0
    },
    night: {
        name: "night",
        top: "#070F22", mid: "#16233F", horizon: "#34405C",
        sun: null,
        scrim: "rgba(2, 6, 18, 0.34)",
        panel: "rgba(2, 6, 18, 0.60)",
        ink: "#EAF0FF",
        inkSoft: "rgba(234, 240, 255, 0.72)",
        accent: "#8FB6FF",
        onAccent: "#081226",
        buttonFill: "rgba(255, 255, 255, 0.18)",
        buttonBorder: "rgba(255, 255, 255, 0.60)",
        buttonPressOverlay: "rgba(255, 255, 255, 0.22)",
        buttonDisabledFill: "rgba(255, 255, 255, 0.05)",
        buttonDisabledBorder: "rgba(255, 255, 255, 0.16)",
        inkDisabled: "rgba(255, 255, 255, 0.34)",
        bossHull: "#3A4566",
        bossDome: "#66739B",
        bossLight: "#8FB6FF",
        bossBeam: "rgba(150, 190, 255, 0.8)",
        bossHot: "#6E86C8",
        birdInk: "#8FA4CC",
        stars: 90
    }
};

/** How far down the screen the legibility scrim fades out. */
Sky.SCRIM_DEPTH = 0.55;

/**
 * Which sky a level is played under.
 *
 * The palettes used to be keyed to the four difficulties, one time of day per
 * choice. With one game and one ladder they carry the climb instead.
 *
 * They are KEYFRAMES rather than bands. Four bands over twenty levels meant the
 * sky changed four times and sat still in between, and the change landed as a
 * jump: one level you are in the afternoon, the next it is dusk. Placing the
 * four at levels 1, 7, 14 and 20 and mixing between them gives every level its
 * own sky, so the day runs down continuously across a whole run and a player
 * can see the light going without being able to point at when it went.
 */
Sky.KEYFRAMES = [
    { at: 1, palette: "morning" },
    { at: 7, palette: "afternoon" },
    { at: 14, palette: "dusk" },
    { at: 20, palette: "night" }
];

function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Pulls the four channels out of `#RRGGBB`, `rgb(...)` or `rgba(...)`. */
function channels(css) {
    var hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css);
    if (hex) {
        return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), 1];
    }
    var parts = css.match(/rgba?\(([^)]+)\)/);
    if (!parts) {
        return [0, 0, 0, 1];
    }
    var values = parts[1].split(",").map(function (n) { return parseFloat(n); });
    return [values[0], values[1], values[2], values.length > 3 ? values[3] : 1];
}

/** One colour a fraction of the way to another, alpha included. */
function mixColour(from, to, t) {
    var a = channels(from);
    var b = channels(to);
    return "rgba(" +
        Math.round(lerp(a[0], b[0], t)) + ", " +
        Math.round(lerp(a[1], b[1], t)) + ", " +
        Math.round(lerp(a[2], b[2], t)) + ", " +
        Math.round(lerp(a[3], b[3], t) * 1000) / 1000 + ")";
}

/**
 * The sun between two palettes.
 *
 * Night has no sun at all. Mixing to `null` would make it vanish on one frame,
 * so it is treated as the same sun with nothing left of it: the disc shrinks
 * and fades out over the levels rather than being switched off.
 */
function mixSun(from, to, t) {
    if (!from && !to) {
        return null;
    }
    var a = from || { x: to.x, y: to.y, radius: 0, color: Sky.transparent(mixColour(to.color, to.color, 0)) };
    var b = to || { x: from.x, y: from.y, radius: 0, color: Sky.transparent(mixColour(from.color, from.color, 0)) };
    return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        radius: lerp(a.radius, b.radius, t),
        color: mixColour(a.color, b.color, t)
    };
}

var MIXED_COLOURS = [
    "top", "mid", "horizon", "scrim", "panel", "ink", "inkSoft", "accent",
    "onAccent", "buttonFill", "buttonBorder", "buttonPressOverlay",
    "buttonDisabledFill", "buttonDisabledBorder", "inkDisabled", "birdInk",
    "bossHull", "bossDome", "bossLight", "bossBeam", "bossHot"
];

/** One palette a fraction of the way to another. */
Sky.mix = function (from, to, t) {
    var mixed = {
        // The name is the nearer of the two, because it is read aloud and
        // "three-fifths of the way from afternoon to dusk" is not a time of day.
        name: t < 0.5 ? from.name : to.name,
        sun: mixSun(from.sun, to.sun, t),
        stars: Math.round(lerp(from.stars, to.stars, t))
    };
    MIXED_COLOURS.forEach(function (key) {
        mixed[key] = mixColour(from[key], to[key], t);
    });
    return mixed;
};

/** Which two keyframes a level sits between, and how far along it is. */
Sky.blendAt = function (level) {
    var rung = Math.max(1, Math.min(Sky.KEYFRAMES[Sky.KEYFRAMES.length - 1].at, level || 1));
    for (var i = Sky.KEYFRAMES.length - 1; i > 0; i--) {
        var from = Sky.KEYFRAMES[i - 1];
        var to = Sky.KEYFRAMES[i];
        if (rung >= from.at) {
            return { from: from, to: to, t: (rung - from.at) / (to.at - from.at) };
        }
    }
    return { from: Sky.KEYFRAMES[0], to: Sky.KEYFRAMES[1], t: 0 };
};

/** The time of day a level reads as, for anything that says it out loud. */
Sky.nameFor = function (level) {
    var blend = Sky.blendAt(level);
    return blend.t < 0.5 ? blend.from.palette : blend.to.palette;
};

Sky.paletteFor = function (level) {
    var blend = Sky.blendAt(level);
    if (blend.t === 0) {
        return Sky.PALETTES[blend.from.palette];
    }
    if (blend.t === 1) {
        return Sky.PALETTES[blend.to.palette];
    }
    return Sky.mix(
        Sky.PALETTES[blend.from.palette],
        Sky.PALETTES[blend.to.palette],
        blend.t
    );
};

/**
 * Stars are placed from a fixed seed so they stay put between redraws instead
 * of twinkling around the sky every time the canvas is resized.
 */
function seededRandom(seed) {
    var value = seed;
    return function () {
        value = (value * 1664525 + 1013904223) % 4294967296;
        return value / 4294967296;
    };
}

function paintStars(ctx, width, height, count) {
    var random = seededRandom(20200301);

    for (var i = 0; i < count; i++) {
        var x = random() * width;
        // Denser high up, where the sky is darkest.
        var y = Math.pow(random(), 1.6) * height * 0.8;
        var radius = random() * 1.1 + 0.3;

        ctx.globalAlpha = 0.25 + random() * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

/**
 * Paints one sky into a context sized in CSS pixels.
 * Kept separate from the caching in render() so it can be drawn anywhere.
 */
/**
 * The same colour with nothing left of it, for the far end of a fade. Kept
 * here because this is the file that decides what a palette colour is.
 */
Sky.transparent = function (css) {
    var parts = css.match(/rgba?\(([^)]+)\)/);
    if (!parts) {
        return "rgba(0, 0, 0, 0)";
    }
    var channels = parts[1].split(",").slice(0, 3).join(",");
    return "rgba(" + channels + ", 0)";
};

Sky.paint = function (ctx, width, height, palette) {
    var gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(0.55, palette.mid);
    gradient.addColorStop(1, palette.horizon);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (palette.stars) {
        ctx.fillStyle = "#FFFFFF";
        paintStars(ctx, width, height, palette.stars);
    }

    if (palette.sun) {
        var reach = Math.max(width, height) * palette.sun.radius;
        var glow = ctx.createRadialGradient(
            width * palette.sun.x, height * palette.sun.y, 0,
            width * palette.sun.x, height * palette.sun.y, reach
        );
        glow.addColorStop(0, palette.sun.color);
        glow.addColorStop(0.18, palette.sun.color);
        glow.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
    }

    // The text block sits in the top of the screen, where the sky is darkest
    // in some palettes and brightest in others. This scrim gives it one
    // predictable ground, so a single ink colour reads on every palette.
    var scrim = ctx.createLinearGradient(0, 0, 0, height * Sky.SCRIM_DEPTH);
    scrim.addColorStop(0, palette.scrim);
    scrim.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, width, height * Sky.SCRIM_DEPTH);
};

/**
 * Renders the sky once to an offscreen canvas and reuses it. The game clears
 * to this image every frame, so repainting the gradients each time would be
 * thirty needless repaints a second.
 *
 * The buffer is sized in device pixels so it stays sharp when the caller draws
 * it into a context already scaled by devicePixelRatio.
 */
Sky.render = function (width, height, dpr, level) {
    var palette = Sky.paletteFor(level);
    // Keyed on the level, not the time of day: every level has its own sky
    // now, so two levels sharing a name no longer share an image.
    var key = width + "x" + height + "@" + dpr + ":L" + Math.round(level || 1);

    if (Sky.cache && Sky.cache.key === key) {
        return Sky.cache.canvas;
    }

    var canvas = (Sky.cache && Sky.cache.canvas) || document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));

    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Sky.paint(ctx, width, height, palette);

    Sky.cache = { key: key, canvas: canvas };
    return canvas;
};
