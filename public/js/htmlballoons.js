/**
 * @namespace Core namespace
 */

"use strict";
var CANVASBALLOON = {};

// Constants
CANVASBALLOON.KAPPA = (4 * (Math.sqrt(2) - 1))/3;
CANVASBALLOON.WIDTH_FACTOR = 0.0333;
CANVASBALLOON.HEIGHT_FACTOR = 0.4;
CANVASBALLOON.TIE_WIDTH_FACTOR = 0.12;
CANVASBALLOON.TIE_HEIGHT_FACTOR = 0.10;
CANVASBALLOON.TIE_CURVE_FACTOR = 0.13;
CANVASBALLOON.GRADIENT_FACTOR = 0.3;
CANVASBALLOON.GRADIENT_CIRCLE_RADIUS = 3;

/**
 * Creates a new Balloon
 * @class	Represents a balloon displayed on a HTML5 canvas
 * @param	{String}	canvasElementID		Unique ID of the canvas element displaying the balloon
 * @param	{Number}	centerX				X-coordinate of the balloon's center
 * @param	{Number}	centerY				Y-coordinate of the balloon's center
 * @param	{Number}	radius				Radius of the balloon
 * @param	{String}	color				String representing the balloon's base color
 */
CANVASBALLOON.Balloon = function(canvasElementID, centerX, centerY, radius, color) {
    var canvas = document.getElementById(canvasElementID);

    if(!canvas.getContext)
    {
        return;
    }

    this.gfxContext = canvas.getContext('2d');
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.rgb = color;
    this.baseColor = new Color(color);
    this.darkColor = (new Color(color)).darken(CANVASBALLOON.GRADIENT_FACTOR);
    this.lightColor = (new Color(color)).lighten(CANVASBALLOON.GRADIENT_FACTOR);

    // The gradient is rebuilt every frame because it moves with the balloon,
    // but its two colours only change when the balloon is hit, so they are
    // worked out here and again on a hit rather than on every frame.
    this.darkString = this.darkColor.rgbString();
    this.lightString = this.lightColor.rgbString();

    // A balloon with more than one skin wears a rim. Nothing draws one unless
    // it is set, so an ordinary balloon is untouched.
    this.rimWidth = 0;
    this.rimColor = "rgba(0, 0, 0, 0.45)";
};

/**
 * Re-mixes the gradient, for a balloon that has been hit and is thinning.
 * Lightening towards the sky is what makes a skin coming off legible without a
 * meter: the balloon looks progressively emptier.
 */
CANVASBALLOON.Balloon.prototype.thin = function (amount) {
    this.darkString = (new Color(this.rgb))
        .darken(Math.max(0, CANVASBALLOON.GRADIENT_FACTOR - amount)).rgbString();
    this.lightString = (new Color(this.rgb))
        .lighten(CANVASBALLOON.GRADIENT_FACTOR + amount).rgbString();
};

CANVASBALLOON.Balloon.prototype.check_hit = function(last_x, last_y) {
    var centerX = this.centerX;
    var centerY = this.centerY;
    var radius = this.radius;

    var handleLength = CANVASBALLOON.KAPPA * radius;

    var widthDiff = (radius * CANVASBALLOON.WIDTH_FACTOR);
    var heightDiff = (radius * CANVASBALLOON.HEIGHT_FACTOR);

    var balloonBottomY = centerY + radius + heightDiff;

    var collision = Math.abs(last_x - centerX) <= radius
        && (
            ((last_y <= centerY) && (centerY - last_y <= radius)) ||
            ((centerY <= last_y) && (centerY - last_y <= radius + heightDiff))
        );

    return collision;
};

/**
 * Draws the balloon on the canvas
 */
CANVASBALLOON.Balloon.prototype.draw = function() {

    // Prepare constants

    var gfxContext = this.gfxContext;
    var centerX = this.centerX;
    var centerY = this.centerY;
    var radius = this.radius;

    var handleLength = CANVASBALLOON.KAPPA * radius;

    var widthDiff = (radius * CANVASBALLOON.WIDTH_FACTOR);
    var heightDiff = (radius * CANVASBALLOON.HEIGHT_FACTOR);

    var balloonBottomY = centerY + radius + heightDiff;

    // Begin balloon path

    gfxContext.beginPath();

    // Top Left Curve

    var topLeftCurveStartX = centerX - radius;
    var topLeftCurveStartY = centerY;

    var topLeftCurveEndX = centerX;
    var topLeftCurveEndY = centerY - radius;


    gfxContext.moveTo(topLeftCurveStartX, topLeftCurveStartY);
    gfxContext.bezierCurveTo(topLeftCurveStartX, topLeftCurveStartY - handleLength - widthDiff,
        topLeftCurveEndX - handleLength, topLeftCurveEndY,
        topLeftCurveEndX, topLeftCurveEndY);

    // Top Right Curve

    var topRightCurveStartX = centerX;
    var topRightCurveStartY = centerY - radius;

    var topRightCurveEndX = centerX + radius;
    var topRightCurveEndY = centerY;


    gfxContext.bezierCurveTo(topRightCurveStartX + handleLength + widthDiff, topRightCurveStartY,
        topRightCurveEndX, topRightCurveEndY - handleLength,
        topRightCurveEndX, topRightCurveEndY);

    // Bottom Right Curve

    var bottomRightCurveStartX = centerX + radius;
    var bottomRightCurveStartY = centerY;

    var bottomRightCurveEndX = centerX;
    var bottomRightCurveEndY = balloonBottomY;


    gfxContext.bezierCurveTo(bottomRightCurveStartX, bottomRightCurveStartY + handleLength,
        bottomRightCurveEndX + handleLength, bottomRightCurveEndY,
        bottomRightCurveEndX, bottomRightCurveEndY);

    // Bottom Left Curve

    var bottomLeftCurveStartX = centerX;
    var bottomLeftCurveStartY = balloonBottomY;

    var bottomLeftCurveEndX = centerX - radius;
    var bottomLeftCurveEndY = centerY;

    gfxContext.bezierCurveTo(bottomLeftCurveStartX - handleLength, bottomLeftCurveStartY,
        bottomLeftCurveEndX, bottomLeftCurveEndY + handleLength,
        bottomLeftCurveEndX, bottomLeftCurveEndY);

    // Create balloon gradient

    var gradientOffset = (radius/3);

    var balloonGradient =
        gfxContext.createRadialGradient(centerX + gradientOffset, centerY - gradientOffset,
            CANVASBALLOON.GRADIENT_CIRCLE_RADIUS,
            centerX, centerY, radius + heightDiff);
    balloonGradient.addColorStop(0, this.lightString);
    balloonGradient.addColorStop(0.7, this.darkString);

    gfxContext.fillStyle = balloonGradient;
    gfxContext.fill();

    // The rim, for a balloon that takes more than one tap. Drawn on the path
    // that is already traced, so it costs a stroke and nothing else.
    if (this.rimWidth > 0) {
        gfxContext.lineWidth = this.rimWidth;
        gfxContext.strokeStyle = this.rimColor;
        gfxContext.stroke();
    }

    // End balloon path

    // Create balloon tie

    var halfTieWidth = (radius * CANVASBALLOON.TIE_WIDTH_FACTOR)/2;
    var tieHeight = (radius * CANVASBALLOON.TIE_HEIGHT_FACTOR);
    var tieCurveHeight = (radius * CANVASBALLOON.TIE_CURVE_FACTOR);

    gfxContext.beginPath();
    gfxContext.moveTo(centerX - 1, balloonBottomY);
    gfxContext.lineTo(centerX - halfTieWidth, balloonBottomY + tieHeight);
    gfxContext.quadraticCurveTo(centerX, balloonBottomY + tieCurveHeight,
        centerX + halfTieWidth, balloonBottomY + tieHeight);
    gfxContext.lineTo(centerX + 1, balloonBottomY);
    gfxContext.fill();

};
