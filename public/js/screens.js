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
 *   menuLive(game)      whether pressing a menu button does anything.
 */

"use strict";
var Screens = {};

Screens.title = {
    // The game plays itself here, so the loop runs — unless the viewer has
    // asked for less movement, in which case the footage holds on one frame.
    animated: !Attract.reducedMotion(),

    enter: function (game) {
        Scores.load(game);
        Announce.title(game);
        Attract.begin(game);
    },

    bind: function (game, signal) {
        Input.menu(game, signal);
    },

    update: function (game) {
        Attract.step(game);
    },

    /**
     * Sky, then the footage, then a short panel with the words on it.
     *
     * The high scores are not here any more. The full panel reaches the bottom
     * of the score table, which covered almost the whole window — so the
     * footage this screen exists to show was behind it, dimmed to nothing. The
     * board is drawn on the game-over screen, which is where you have just
     * earned a place on it and where it is worth reading.
     */
    draw: function (game) {
        Paint.sky(game);
        Paint.entities(game);
        Paint.panel(game, game.layout.splash);
        Paint.intro(game, Layout.INTRO_TEXT);
        Paint.description(game);
        Paint.menu(game);
        Paint.player(game);
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
        Announce.name();
        NameField.show(game, game.name);
    },

    exit: function (game) {
        NameField.hide(game);
    },

    bind: function (game, signal) {
        Input.name(game, signal);
    },

    draw: function (game) {
        Paint.sky(game);
        Paint.panel(game);
        Paint.nameScreen(game);
    },

    menuLive: function () {
        return false;
    }
};

/**
 * The countdown. It exists because starting used to be instant: the tap that
 * started a game was also the first frame of play, on a screen that had shown
 * nothing since.
 */
Screens.starting = {
    animated: true,

    enter: function (game) {
        game.state.endsAt = Date.now() + Game.COUNTDOWN_MS;
        game.resetRound();
        Announce.starting(game);
    },

    bind: function (game, signal) {
        Input.popping(game, signal);
    },

    update: function (game) {
        if (Date.now() >= game.state.endsAt) {
            game.enter("playing");
        }
    },

    draw: function (game) {
        Paint.sky(game);
        Paint.menu(game);
        Paint.countdown(game, game.state.endsAt - Date.now());
    },

    menuLive: function () {
        return false;
    }
};

Screens.playing = {
    animated: true,

    enter: function (game) {
        game.ticks = 0;
        Announce.playing();
    },

    bind: function (game, signal) {
        Input.popping(game, signal);
    },

    update: function (game) {
        game.ticks++;

        var climbed = game.levelFor(game.ticks);
        if (climbed !== game.level) {
            // The sky belongs to the rung: it goes from morning to night as
            // the ladder climbs, so how far up you are is visible without
            // reading anything.
            game.applyLevel(climbed);
            Announce.level(game, game.awardLife(climbed));
        }

        var escaped = game.reap();
        if (escaped > 0) {
            game.lostBalloons += escaped;
            Announce.lost(game);
        }

        game.spawnBalloon();
        game.step(false);

        // Surviving the last level is the win, so the check comes before the
        // one that ends a run: a player who clears level 20 on the same step
        // their last life goes has still finished it.
        if (game.finished()) {
            game.won = true;
            game.enter("gameover");
        } else if (game.lostBalloons >= game.allowance) {
            game.enter("gameover");
        }
    },

    draw: function (game) {
        Paint.sky(game);
        Paint.entities(game);
        Paint.hud(game);
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

        Scores.submit(game, game.score);
        Scores.load(game);
        Announce.gameover(game);
    },

    bind: function (game, signal) {
        Input.menu(game, signal);
    },

    // Nothing spawns any more; the balloons still in the air accelerate and
    // leave, which is how the board clears itself behind the text.
    update: function (game) {
        game.reap();
        game.step(true);
    },

    draw: function (game) {
        Paint.sky(game);
        Paint.panel(game);
        Paint.intro(
            game,
            (game.won ? "You win! Score: " : "Game Over. Score: ") +
                game.score + ", Time: " + game.end_time
        );
        Paint.menu(game);
        Paint.scores(game);
        Paint.player(game);
        Paint.entities(game);
    },

    menuLive: function (game) {
        return Date.now() >= game.state.liveAt;
    }
};
