"use strict";

/**
 * The boss: a saucer that arrives when the sky goes quiet and shoots if you
 * are too slow.
 *
 * It is the first thing in the game with a CLOCK. A balloon gives you as long
 * as it takes to rise; a bird gives you as long as it takes to cross; both are
 * patient. The boss sets a deadline and keeps it, which is the one kind of
 * pressure twenty levels of balloons cannot supply — and the reason the plan
 * puts it here rather than adding another thing to pop.
 *
 * WHY IT IS NOT TRIGGERED BY AN EMPTY SKY
 *
 * The obvious rule is "arrives when the sky is cleared". Measured, the sky is
 * never cleared: balloons arrive about as fast as anyone pops them, so the
 * count hovers near its cap and touches zero roughly never. A boss on that
 * trigger would be a feature almost nobody met. It arrives when the sky gets
 * SCARCE instead, and what counts as scarce is a ladder column that grows as
 * the game does — one balloon at level 6, where clearing down that far is a
 * real feat, and more by the top, where the sky never really empties.
 *
 * THE SHOT IS TELEGRAPHED, AND THAT IS NOT DECORATION
 *
 * The charge runs for the last CHARGE_STEPS of the fuse and is unmissable: the
 * hull lights up, a beam forms beneath it, and the ring around it closes. A
 * player who loses a life should have watched it coming. Anything shorter than
 * a reaction time plus an aim is unfair by construction, so the charge is
 * bounded below by 600ms and the test says so.
 *
 * THERE ARE TWO OF THEM
 *
 * What a saucer is made of comes out of Ladder.SAUCERS rather than out of
 * constants here: the one from level 6, and the mark II from 18, which is
 * bigger, takes eight taps instead of five, wanders in both directions instead
 * of sliding across, and gets proportionally longer to be dealt with. This
 * file knows how a saucer behaves; the ladder knows which one turns up.
 */

/** Steps of unmistakable charge before the shot. 600ms is the floor. */
var BOSS_CHARGE_STEPS = 24;

/** Where the fuse ring is drawn, in radii. It is the outermost thing a saucer
 * has, so it is what has to fit on the screen. */
var RING_RADII = 1.25;

/** Radius before scaling, and the floor that keeps it a real target. */
var BOSS_BASE_SIZE = 46;
var BOSS_MIN_RADIUS = 30;

/**
 * The band a wandering saucer stays inside, as a share of its own height above
 * and below where it arrived. It moves so the fight is an aiming problem
 * rather than a rhythm test; it stays in a band so the fight stays where the
 * player is looking, above the balloons and clear of the HUD.
 */
var BOSS_BAND = 2.2;

var bossConstructor = function (xcoord, ycoord, radius, xmax, mark, ceiling) {
    var that = {};
    var kind = Ladder.saucer(mark);

    that.kind = "boss";
    that.mark = kind.mark;
    that.layer = Entities.LAYERS.boss;
    that.xcoord = xcoord;
    that.ycoord = ycoord;
    // The floor first, THEN the mark's own size: a minimum is there so a
    // saucer stays a real target on a phone, not so that both saucers collapse
    // onto it. Applied the other way round the mark II was exactly as big as
    // the one it replaces on a 390px screen, which is the one place its being
    // bigger matters most.
    that.radius = Math.max(BOSS_MIN_RADIUS, radius) * kind.size;
    that.xmax = xmax;

    /**
     * The fastest it may travel, in pixels a step.
     *
     * Derived, not chosen, and derived the same way a janky balloon's wander
     * is: whatever it does, it may not have left where you aimed by the time
     * you get there. `reach` is how much of its own radius it is allowed to
     * cross inside a reaction window, and half a radius is the room that
     * leaves. Scaling it by the radius also makes the fight the same fight on
     * a phone as on a desktop, which drifting at a fixed fraction of the
     * window width never did.
     */
    that.speed = that.radius * kind.reach / REACTION_STEPS;

    /**
     * How far up and down it may get from where it arrived — and, if that
     * band would take its gauge somewhere it cannot be read, the height it
     * arrives at instead.
     *
     * Whoever spawns it picks a height that suits the balloons and a ceiling
     * the fuse ring has to stay under; fitting between the two is this file's
     * business. The ring IS the deadline, so a saucer that parks the top of it
     * behind the HUD has taken the clock away from the player it is timing.
     */
    var band = that.radius * BOSS_BAND * kind.wander;
    var home = Math.max(ycoord, (ceiling || 0) + band + that.radius * RING_RADII);
    that.ycoord = home;

    that.xdelta = that.speed * (Math.random() < 0.5 ? 1 : -1);
    that.ydelta = 0;

    /** Steps until it picks a fresh heading, for the one that does. */
    var turnIn = kind.turns;

    /**
     * Taps left before it is destroyed.
     *
     * `taps`, not `hits`: the entity contract already spends that name on
     * `hits(point)`, and an earlier draft of this file had the counter
     * shadowing the method, which would have made the boss untappable in a
     * way no test of the fight would have explained.
     */
    that.taps = kind.taps;

    /** Steps until it fires. Counted down, like everything else here. */
    that.fuse = kind.fuse;

    /** Set once it has fired or been destroyed; it then clears off upward. */
    var leaving = false;

    /** Steps of squash left from a tap that landed but did not finish it. */
    var flash = 0;

    /** Whether the shot is charging: the last stretch of the fuse. */
    that.charging = function () {
        return !leaving && that.fuse <= BOSS_CHARGE_STEPS;
    };

    /**
     * A fresh heading, at the one speed it is allowed.
     *
     * A fresh one rather than a nudge, for the reason a janky balloon picks a
     * fresh drift: a path made of small corrections averages out into a
     * straight line, which is the thing this is not supposed to be. The speed
     * is fixed and only the direction is drawn, so wandering can never turn
     * into going faster than the bound.
     */
    var turn = function () {
        var angle = Math.random() * Math.PI * 2;
        that.xdelta = Math.cos(angle) * that.speed;
        that.ydelta = Math.sin(angle) * that.speed * (band > 0 ? 1 : 0);
    };

    that.step = function (game, leave) {
        if (flash > 0) {
            flash--;
        }

        if (leaving || leave) {
            leaving = true;
            that.ycoord -= Math.abs(that.xdelta) * 3;
            return;
        }

        if (turnIn > 0) {
            turnIn--;
            if (turnIn === 0) {
                turn();
                turnIn = kind.turns;
            }
        }

        that.xcoord += that.xdelta;
        // Bounce off the sides rather than leaving: the fight is meant to end
        // with a result, not with the boss wandering off the edge.
        if (that.xcoord < that.radius || that.xcoord > that.xmax - that.radius) {
            that.xdelta *= -1;
            that.xcoord = Math.min(Math.max(that.xcoord, that.radius), that.xmax - that.radius);
        }

        that.ycoord += that.ydelta;
        if (that.ycoord < home - band || that.ycoord > home + band) {
            that.ydelta *= -1;
            that.ycoord = Math.min(Math.max(that.ycoord, home - band), home + band);
        }

        that.fuse--;
        if (that.fuse <= 0) {
            leaving = true;
            game.livesLost++;
            game.bossSettled(game);
            Announce.bossFired(game);
        }
    };

    /**
     * A saucer: a hull, a dome, lights, and the charge when it is winding up.
     *
     * The ring around it is the fuse draining — the same idea as the bar under
     * the Resume button, because a deadline the player cannot see is a
     * deadline they can only learn about by losing to it.
     */
    that.draw = function (game) {
        var ctx = game.ctx;
        var palette = game.palette;
        var r = that.radius * (flash > 0 ? 0.92 : 1);
        var charging = that.charging();

        ctx.save();
        ctx.translate(that.xcoord, that.ycoord);

        // The beam, forming under the hull through the charge. Drawn first so
        // the saucer sits over it.
        if (charging) {
            var grown = 1 - (that.fuse / BOSS_CHARGE_STEPS);
            var beam = ctx.createLinearGradient(0, 0, 0, r * 6 * grown);
            beam.addColorStop(0, palette.bossBeam);
            beam.addColorStop(1, Sky.transparent(palette.bossBeam));
            ctx.fillStyle = beam;
            ctx.beginPath();
            ctx.moveTo(-r * 0.3, 0);
            ctx.lineTo(r * 0.3, 0);
            ctx.lineTo(r * 1.5 * grown, r * 6 * grown);
            ctx.lineTo(-r * 1.5 * grown, r * 6 * grown);
            ctx.closePath();
            ctx.fill();
        }

        // Hull.
        ctx.fillStyle = charging ? palette.bossHot : palette.bossHull;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();

        // Dome.
        ctx.fillStyle = palette.bossDome;
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.16, r * 0.52, r * 0.44, 0, Math.PI, Math.PI * 2);
        ctx.fill();

        // The mark II wears a second hull ring, so which one you are fighting
        // is legible from across the screen rather than only from the count of
        // taps it is not dying to.
        if (kind.mark > 1) {
            ctx.strokeStyle = palette.bossDome;
            ctx.lineWidth = Math.max(2, r * 0.06);
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 0.78, r * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Lights around the rim, brighter as the fuse runs down.
        var lit = 1 - (that.fuse / kind.fuse);
        ctx.fillStyle = palette.bossLight;
        ctx.globalAlpha = 0.35 + 0.65 * lit;
        [-0.66, -0.33, 0, 0.33, 0.66].forEach(function (at) {
            ctx.beginPath();
            ctx.arc(r * at, r * 0.16, r * 0.075, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // The fuse, as a ring closing round the saucer.
        if (!leaving) {
            ctx.strokeStyle = charging ? palette.bossBeam : palette.bossLight;
            ctx.lineWidth = Math.max(2, r * 0.07);
            ctx.beginPath();
            ctx.arc(
                0, 0, r * RING_RADII,
                -Math.PI / 2,
                -Math.PI / 2 + Math.PI * 2 * (that.fuse / kind.fuse)
            );
            ctx.stroke();
        }

        ctx.restore();
    };

    /**
     * The hull and the dome: what is drawn solid.
     *
     * Generous, unlike a bird's. This is a target under a three-second clock,
     * so a tap that is nearly on it should count — the difficulty is meant to
     * be the deadline, not the pixels.
     */
    that.hits = function (point) {
        var dx = (point.x - that.xcoord) / that.radius;
        var dy = (point.y - that.ycoord) / (that.radius * 0.38);
        if (dx * dx + dy * dy <= 1) {
            return true;
        }

        var domeX = (point.x - that.xcoord) / (that.radius * 0.52);
        var domeY = (point.y - (that.ycoord - that.radius * 0.16)) / (that.radius * 0.44);
        return domeX * domeX + domeY * domeY <= 1;
    };

    that.tapped = function (game) {
        if (leaving) {
            return false;
        }
        flash = 4;
        that.taps--;

        if (that.taps > 0) {
            return false;
        }

        leaving = true;
        game.score += kind.points;
        game.bossSettled(game);
        Announce.bossDestroyed(game);
        // False, not true: it is not removed on the spot. It lifts out of the
        // sky over the next few steps so the player sees the thing they beat
        // go, rather than having it blink out under their finger.
        return false;
    };

    that.gone = function (game) {
        // "left", never "escaped": a boss that fired has already taken its
        // life, and one that was destroyed cost nothing. Neither should be
        // charged again by the reaper.
        return that.ycoord < -that.radius * 8 ? "left" : null;
    };

    that.resized = function (game) {
        that.xmax = game.width;
        that.xcoord = Math.min(that.xcoord, Math.max(that.radius, game.width - that.radius));
    };

    return that;
};
