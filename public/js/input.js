/**
 * Everything the game listens to.
 *
 * Each screen binds its own input and is handed an AbortSignal that is fired
 * on the way out, so a listener cannot outlive the screen that wanted it. That
 * replaced jQuery's .unbind(), which removed every handler on document as a
 * way to reset input; keeping all the binding in one file is what makes it
 * possible to see, in one place, what is listening at any moment.
 */

"use strict";
var Input = {};

/** Maps a pointer event onto canvas coordinates, accounting for CSS scaling. */
Input.point = function (game, event) {
    var rect = game.canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (game.width / rect.width),
        y: (event.clientY - rect.top) * (game.height / rect.height)
    };
};

/**
 * Tapping the sky: bound while a round is counting down or being played.
 *
 * One tap reaches at most one thing, and which thing is decided by aim rather
 * than by list order — see Entities.pick. What the tap then means belongs to
 * whatever was hit: a balloon pops and scores, and the kinds that come later
 * will answer differently.
 */
Input.popping = function (game, signal) {
    game.canvas.addEventListener("click", function (event) {
        var hit = Entities.pick(game.entities, Input.point(game, event));
        if (!hit) {
            return;
        }
        if (hit.tapped(game)) {
            game.entities.splice(game.entities.indexOf(hit), 1);
        }
    }, { signal: signal });
};

/**
 * The menu: bound on the screens that show it.
 *
 * A locked menu is a live binding that declines, rather than the old absence
 * of any binding at all — so the lockout is one condition, checked in the same
 * place that decides how the buttons are drawn.
 */
Input.menu = function (game, signal) {
    // Animated screens are repainted by the loop; a static one has to be told.
    var repaintIfStatic = function () {
        if (!Screens[game.screen].animated) {
            game.paint();
        }
    };

    game.canvas.addEventListener("pointerdown", function (event) {
        if (!game.isMenuLive()) {
            return;
        }
        var target = Layout.pick(game.layout.targets, Input.point(game, event));
        game.pressed = target ? target.id : null;
        repaintIfStatic();
    }, { signal: signal });

    var releasePress = function () {
        if (game.pressed !== null) {
            game.pressed = null;
            repaintIfStatic();
        }
    };
    game.canvas.addEventListener("pointerup", releasePress, { signal: signal });
    game.canvas.addEventListener("pointercancel", releasePress, { signal: signal });
    game.canvas.addEventListener("pointerleave", releasePress, { signal: signal });

    game.canvas.addEventListener("click", function (event) {
        game.pressed = null;
        if (!game.isMenuLive()) {
            return;
        }

        // A tap anywhere starts a game. There is one game to start and the
        // screen behind this is already showing it being played, so asking
        // someone to find a button first is a step for its own sake. The two
        // chips along the bottom are the things that mean something else.
        var target = Layout.pick(game.layout.targets, Input.point(game, event));
        if (target && target.id === "player") {
            game.enter("name");
        } else if (target && target.id === "start") {
            game.cycleStartLevel();
        } else {
            game.restart();
        }
    }, { signal: signal });

    document.addEventListener("keydown", function (event) {
        if (!game.isMenuLive()) {
            return;
        }
        if (event.key === " " || event.key === "Enter") {
            game.restart();
        }
    }, { signal: signal });
};

/**
 * The break between levels: one button, which skips the wait.
 *
 * A tap anywhere would do here too, but this is the one screen where a tap is
 * ambiguous — the sky behind it is full of frozen balloons the player was
 * about to pop, and a stray tap on one of those should not be read as "get on
 * with it". So it is the button, or the keys, or nothing.
 */
Input.resume = function (game, signal) {
    var resume = function () {
        game.enter("playing");
    };

    // The paused screen is reached by looking away, so it can be arrived at
    // with the pointer already down on the button. Ignore a release that had
    // no press behind it on this screen.
    game.canvas.addEventListener("pointerdown", function (event) {
        var hit = Layout.hitRect(game.layout.resume.hit, Input.point(game, event));
        game.pressed = hit ? "resume" : null;
    }, { signal: signal });

    game.canvas.addEventListener("click", function (event) {
        game.pressed = null;
        if (Layout.hitRect(game.layout.resume.hit, Input.point(game, event))) {
            resume();
        }
    }, { signal: signal });

    document.addEventListener("keydown", function (event) {
        if (event.key === " " || event.key === "Enter") {
            resume();
        }
    }, { signal: signal });
};

/**
 * The name screen: a text field, a Save button drawn on the canvas, and the
 * two keys that finish.
 */
Input.name = function (game, signal) {
    var save = function () {
        game.setName(NameField.element.value);
        game.enter("title");
    };

    // The field is a real input, so Enter is how a keyboard finishes and
    // Go/Done is how a phone does. Escape leaves the name as it was.
    NameField.element.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== "Escape") {
            return;
        }
        event.preventDefault();

        // The screen we are about to enter binds a document keydown, and
        // this event is still on its way up: without this it would arrive
        // at the title screen as a keypress and start a game.
        event.stopPropagation();

        if (event.key === "Enter") {
            save();
        } else {
            game.enter("title");
        }
    }, { signal: signal });

    game.canvas.addEventListener("pointerdown", function (event) {
        var point = Input.point(game, event);
        game.pressed = Layout.hitRect(game.layout.name.save, point) ? "save" : null;
        game.paint();
    }, { signal: signal });

    game.canvas.addEventListener("click", function (event) {
        var point = Input.point(game, event);
        game.pressed = null;
        if (Layout.hitRect(game.layout.name.save, point)) {
            save();
        } else {
            game.paint();
        }
    }, { signal: signal });
};
