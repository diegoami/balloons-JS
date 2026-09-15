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
 * each difficulty gets its own time of day.
 */

var Sky = {};

/**
 * One palette per difficulty. Each defines the sky itself and the ink drawn on
 * it, so text colour is never picked independently of its background.
 */
Sky.PALETTES = {
    E: {
        name: "clear morning",
        top: "#1E6FB4", mid: "#6FB6E4", horizon: "#D7EDF8",
        sun: { x: 0.78, y: 0.16, radius: 0.42, color: "#FFF4D6" },
        scrim: "rgba(8, 26, 48, 0.42)",
        ink: "#FFFFFF",
        inkSoft: "rgba(255, 255, 255, 0.78)",
        accent: "#FFD98A",
        stars: 0
    },
    S: {
        name: "afternoon",
        top: "#1B5FA8", mid: "#63A8DC", horizon: "#EBDFC9",
        sun: { x: 0.82, y: 0.22, radius: 0.46, color: "#FFE2A8" },
        scrim: "rgba(8, 24, 46, 0.44)",
        ink: "#FFFFFF",
        inkSoft: "rgba(255, 255, 255, 0.78)",
        accent: "#FFCE73",
        stars: 0
    },
    H: {
        name: "dusk",
        top: "#16294F", mid: "#6B4A7A", horizon: "#E3885F",
        sun: { x: 0.24, y: 0.72, radius: 0.5, color: "#FF9E5E" },
        scrim: "rgba(6, 12, 30, 0.46)",
        ink: "#FFFFFF",
        inkSoft: "rgba(255, 255, 255, 0.76)",
        accent: "#FFB870",
        stars: 0
    },
    V: {
        name: "night",
        top: "#070F22", mid: "#16233F", horizon: "#34405C",
        sun: null,
        scrim: "rgba(2, 6, 18, 0.34)",
        ink: "#EAF0FF",
        inkSoft: "rgba(234, 240, 255, 0.72)",
        accent: "#8FB6FF",
        stars: 90
    }
};

/** How far down the screen the legibility scrim fades out. */
Sky.SCRIM_DEPTH = 0.55;

Sky.paletteFor = function (level) {
    return Sky.PALETTES[level] || Sky.PALETTES.S;
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
    var key = width + "x" + height + "@" + dpr + ":" + level;

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
