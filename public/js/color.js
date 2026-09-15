/**
 * Minimal replacement for the browserified `color` npm package that used to
 * live here as a 1,220-line vendored bundle (with its own `require` shim).
 *
 * The game only ever needed three things from it: lighten, darken and
 * rgbString. Both operations work in HSL and adjust lightness by a ratio of
 * itself, which is what the original did, so balloons render identically.
 */

/** CSS colour names with a blue channel below 200, used for the title gradient. */
var GRADIENT_COLORS = [
    "bisque", "black", "brown", "burlywood", "cadetblue", "chartreuse",
    "chocolate", "coral", "crimson", "darkblue", "darkcyan", "darkgoldenrod",
    "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta",
    "darkolivegreen", "darkorange", "darkred", "darksalmon", "darkseagreen",
    "darkslateblue", "darkslategray", "darkslategrey", "deeppink", "dimgray",
    "dimgrey", "firebrick", "forestgreen", "gold", "goldenrod", "gray", "green",
    "greenyellow", "grey", "hotpink", "indianred", "indigo", "khaki",
    "lawngreen", "lightcoral", "lightgreen", "lightpink", "lightsalmon",
    "lightseagreen", "lightslategray", "lightslategrey", "lime", "limegreen",
    "maroon", "mediumaquamarine", "mediumseagreen", "mediumspringgreen",
    "mediumvioletred", "midnightblue", "moccasin", "navajowhite", "navy",
    "olive", "olivedrab", "orange", "orangered", "palegoldenrod", "palegreen",
    "palevioletred", "peachpuff", "peru", "purple", "red", "rosybrown",
    "saddlebrown", "salmon", "sandybrown", "seagreen", "sienna", "silver",
    "slategray", "slategrey", "springgreen", "steelblue", "tan", "teal",
    "tomato", "wheat", "yellow", "yellowgreen"
];

function getRandomCssColor() {
    return GRADIENT_COLORS[Math.floor(Math.random() * GRADIENT_COLORS.length)];
}

/** Returns [hue 0-360, saturation 0-100, lightness 0-100]. */
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    var min = Math.min(r, g, b);
    var max = Math.max(r, g, b);
    var delta = max - min;
    var h = 0;

    if (max !== min) {
        if (r === max) {
            h = (g - b) / delta;
        } else if (g === max) {
            h = 2 + (b - r) / delta;
        } else {
            h = 4 + (r - g) / delta;
        }
    }

    h = Math.min(h * 60, 360);
    if (h < 0) {
        h += 360;
    }

    var l = (min + max) / 2;
    var s;

    if (max === min) {
        s = 0;
    } else if (l <= 0.5) {
        s = delta / (max + min);
    } else {
        s = delta / (2 - max - min);
    }

    return [h, s * 100, l * 100];
}

/** Lightness may run outside 0-100 after lighten/darken; channels are clamped. */
function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;

    if (s === 0) {
        var grey = clampChannel(l * 255);
        return [grey, grey, grey];
    }

    var t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var t1 = 2 * l - t2;
    var rgb = [0, 0, 0];

    for (var i = 0; i < 3; i++) {
        var t3 = h + (1 / 3) * -(i - 1);
        if (t3 < 0) t3++;
        if (t3 > 1) t3--;

        var val;
        if (6 * t3 < 1) {
            val = t1 + (t2 - t1) * 6 * t3;
        } else if (2 * t3 < 1) {
            val = t2;
        } else if (3 * t3 < 2) {
            val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
        } else {
            val = t1;
        }

        rgb[i] = clampChannel(val * 255);
    }

    return rgb;
}

function clampChannel(value) {
    return Math.round(Math.max(0, Math.min(255, value)));
}

/**
 * @param {{r: number, g: number, b: number}} rgb
 */
function Color(rgb) {
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    // The original library rounded every derived colour space on construction,
    // so lighten/darken operated on an integer lightness. Rounding here too
    // keeps the rendered colours bit-for-bit identical to the old build.
    this.hsl = [
        Math.round(Math.max(0, Math.min(360, hsl[0]))),
        Math.round(Math.max(0, Math.min(100, hsl[1]))),
        Math.round(Math.max(0, Math.min(100, hsl[2])))
    ];
    this.rgb = [clampChannel(rgb.r), clampChannel(rgb.g), clampChannel(rgb.b)];
}

/** Mutates and returns this, matching the original library's chaining. */
Color.prototype.lighten = function (ratio) {
    this.hsl[2] += this.hsl[2] * ratio;
    this.rgb = hslToRgb(this.hsl[0], this.hsl[1], this.hsl[2]);
    return this;
};

Color.prototype.darken = function (ratio) {
    this.hsl[2] -= this.hsl[2] * ratio;
    this.rgb = hslToRgb(this.hsl[0], this.hsl[1], this.hsl[2]);
    return this;
};

Color.prototype.rgbString = function () {
    return "rgb(" + this.rgb[0] + ", " + this.rgb[1] + ", " + this.rgb[2] + ")";
};
