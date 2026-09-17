/**
 * What kinds of thing the sky can hold, and the contract every one of them
 * keeps.
 *
 * The game knew exactly one noun. `Game.balloons` was an array, one constructor
 * made the only kind of member, and three places assumed every member was a
 * balloon: the step that moved them, the tap that popped the first one hit, and
 * the paint routine that drew them all. v2 needs birds that must not be touched
 * and a boss that shoots back, so the list has to hold several kinds of thing
 * and every one of them has to answer the same questions.
 *
 * An entity is a plain object with:
 *
 *   kind               what it is, for the things that care ("balloon")
 *   layer              draw order; a higher layer is drawn over a lower one
 *   step(game, leave)  one fixed step of movement. `leave` is set once a round
 *                      is over and everything left in the sky should clear off
 *   draw(game)         paints itself, from its own painter, built once
 *   hits(point)        whether a tap at this point lands on it
 *   tapped(game)       what being tapped means. Returns true if that removes it
 *   gone(game)         why it should be removed now, or null: "escaped" counts
 *                      against the player, "left" is free
 *   resized(game)      optional; the viewport changed shape
 *
 * Nothing here decides anything about the game. A kind describes itself, and
 * Game keeps the list.
 */

"use strict";

var Entities = {};

/**
 * Draw order. The numbers are spaced so a new kind can slot between two
 * existing ones without renumbering the rest, and named here rather than left
 * as magic numbers in four different files.
 */
Entities.LAYERS = {
    balloon: 10,
    bird: 20,
    boss: 30,
    shot: 40
};

/**
 * Where an entity belongs in the list: before the first thing drawn above it.
 *
 * Kept sorted on the way in rather than sorted on the way out, because the list
 * is drawn thirty times a second and added to about three times a second.
 */
Entities.insertionPoint = function (list, entity) {
    for (var i = 0; i < list.length; i++) {
        if (list[i].layer > entity.layer) {
            return i;
        }
    }
    return list.length;
};

/**
 * The entity a tap at this point meant.
 *
 * "First one hit, walking the list backwards" was fine while everything in the
 * sky was a balloon and popping any of them was the same thing. It stops being
 * fine the moment a bird can overlap a balloon: which one you meant would be
 * decided by the order things happened to be in. Nearest centre is what the
 * menu already does with overlapping touch targets, and it is what a
 * person means by aiming at something.
 */
Entities.pick = function (list, point) {
    var best = null;
    var bestDistance = Infinity;

    for (var i = 0; i < list.length; i++) {
        if (!list[i].hits(point)) {
            continue;
        }
        var dx = point.x - list[i].xcoord;
        var dy = point.y - list[i].ycoord;
        var distance = dx * dx + dy * dy;

        if (distance < bestDistance) {
            bestDistance = distance;
            best = list[i];
        }
    }
    return best;
};
