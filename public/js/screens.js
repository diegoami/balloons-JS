/**
 * What the game is currently being.
 *
 * The game always had four states, and never quite said so. `screen` held a
 * string, but the things that actually made a state a state were scattered:
 * `isrestart`, a boolean that shadowed the game-over screen and was read in
 * five unrelated places; `showscores`, only ever true on that same screen; two
 * deadlines kept as permanent fields on the game; a setTimeout that rebound
 * input 1.2 seconds after a game ended; and three separate pieces of code that
 * had to agree on whether the menu was live.
 *
 * A screen here owns all of that: what it sets up on arrival, what input means
 * while it is up, what moves on each frame, and what gets painted. Game.enter
 * is the only way to change state, so a transition cannot half-happen.
 *
 *   enter(game)         once, on arrival. game.state is a fresh object that
 *                       belongs to this screen for as long as it is up.
 *   exit(game)          once, on the way out, for anything a screen put on the
 *                       page rather than on the canvas.
 *   bind(game, signal)  attaches input. The signal is aborted on the way out,
 *                       so no screen can leave a listener behind.
 *   update(game)        one frame of whatever moves. Absent on static screens.
 *   draw(game)          paints the whole screen, from the sky up.
 *   animated            whether the frame loop runs while this screen is up.
 *   menuLive(game)      whether pressing a difficulty button does anything.
 */

var Screens = {};

Screens.title = {
    animated: false,

    enter: function (game) {
        game.loadScores();
    },

    bind: function (game, signal) {
        game.bindMenu(signal);
    },

    draw: function (game) {
        game.clear();
        game.drawIntro(Layout.INTRO_TEXT);
        game.drawMenu();
        game.drawScores();
        game.drawPlayer();
    },

    menuLive: function () {
        return true;
    }
};

/**
 * Entering a name.
 *
 * On a first visit this is where the game opens, and the title screen's name
 * line comes back here any time after that. It replaces a window.prompt(),
 * which asked once over a blank page and then never again.
 */
Screens.name = {
    animated: false,

    enter: function (game) {
        game.pressed = null;
        game.showNameField(game.name);
    },

    exit: function (game) {
        game.hideNameField();
    },

    bind: function (game, signal) {
        var save = function () {
            game.setName(game.nameField.value);
            game.enter("title");
        };

        // The field is a real input, so Enter is how a keyboard finishes and
        // Go/Done is how a phone does. Escape leaves the name as it was.
        game.nameField.addEventListener("keydown", function (event) {
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
            var point = game.getCanvasPoint(event);
            game.pressed = Layout.hitRect(game.layout.name.save, point) ? "save" : null;
            game.paint();
        }, { signal: signal });

        game.canvas.addEventListener("click", function (event) {
            var point = game.getCanvasPoint(event);
            game.pressed = null;
            if (Layout.hitRect(game.layout.name.save, point)) {
                save();
            } else {
                game.paint();
            }
        }, { signal: signal });
    },

    draw: function (game) {
        game.clear();
        game.drawNameScreen();
    },

    menuLive: function () {
        return false;
    }
};

/**
 * The countdown. It exists because starting used to be instant: the tap that
 * chose a difficulty was also the first frame of play, on a screen that had
 * shown nothing since.
 */
Screens.starting = {
    animated: true,

    enter: function (game) {
        game.state.endsAt = Date.now() + Game.COUNTDOWN_MS;
        game.resetRound();
    },

    bind: function (game, signal) {
        game.bindPopping(signal);
    },

    update: function (game) {
        if (Date.now() >= game.state.endsAt) {
            game.enter("playing");
        }
    },

    draw: function (game) {
        game.clear();
        game.drawMenu();
        game.drawCountdown(game.state.endsAt - Date.now());
    },

    menuLive: function () {
        return false;
    }
};

Screens.playing = {
    animated: true,

    enter: function (game) {
        game.start = Date.now();
    },

    bind: function (game, signal) {
        game.bindPopping(signal);
    },

    update: function (game) {
        game.lostBalloons += game.removeEscaped();
        game.spawnBalloon();
        game.moveBalloons(false);

        if (game.lostBalloons >= game.difficulty.maxLost) {
            game.enter("gameover");
        }
    },

    draw: function (game) {
        game.clear();
        game.drawBalloons();
        game.drawHud();
    },

    menuLive: function () {
        return false;
    }
};

Screens.gameover = {
    animated: true,

    enter: function (game) {
        game.end_time = game.elapsed();
        game.pressed = null;

        // Long enough that the tap which popped the last balloon cannot also
        // restart the game, short enough to read as deliberate. The menu is
        // drawn as disabled for exactly this long, rather than looking ready
        // while nothing is listening.
        game.state.liveAt = Date.now() + Game.MENU_LOCKOUT_MS;

        game.submitScore(game.balloons_caught);
        game.loadScores();
    },

    bind: function (game, signal) {
        game.bindMenu(signal);
    },

    // Nothing spawns any more; the balloons still in the air accelerate and
    // leave, which is how the board clears itself behind the text.
    update: function (game) {
        game.removeEscaped();
        game.moveBalloons(true);
    },

    draw: function (game) {
        game.clear();
        game.drawIntro(
            "Game Over. Score: " + game.balloons_caught + ", Time: " + game.end_time
        );
        game.drawMenu();
        game.drawScores();
        game.drawPlayer();
        game.drawBalloons();
    },

    menuLive: function (game) {
        return Date.now() >= game.state.liveAt;
    }
};
