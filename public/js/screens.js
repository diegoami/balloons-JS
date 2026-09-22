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
        Play.begin(game);
    },

    bind: function (game, signal) {
        Input.menu(game, signal);
    },

    update: function (game) {
        Attract.step(game);
        Play.step(game);
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
        Paint.legend(game);
        Paint.description(game);
        Paint.aboutChip(game);
        Paint.boardChip(game);
        Paint.playButton(game);
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

    /**
     * The clock is NOT reset here.
     *
     * It used to be, which was harmless while a round entered this screen
     * exactly once. A break between levels leaves and comes back, and resetting
     * the clock on the way back would put the player at level 1 again, for
     * ever. resetRound owns the clock; this screen only reads it.
     */
    enter: function (game) {
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
            game.livesLost += escaped;
            game.breakdown.losses.escapes += escaped;
            Announce.lost(game);
        }

        game.spawnBalloon();
        game.spawnBird();
        game.spawnBoss();
        game.spawnFireflies();
        game.step(false);

        // Surviving the last level is the win, so the check comes before the
        // one that ends a run: a player who clears level 20 on the same step
        // their last life goes has still finished it.
        if (game.finished()) {
            game.won = true;
            game.enter("gameover");
        } else if (game.livesLost >= game.allowance) {
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

/**
 * A tab that was away.
 *
 * Backgrounding a tab already stopped the game and always will: rAF stops
 * firing, and time played is counted in simulation steps, so the clock and the
 * level stop with it. This screen does not add a pause — it makes the one that
 * already existed visible, so a player who looks away comes back to a game
 * that is plainly waiting rather than to one that restarts under them.
 *
 * It is not on a timer. A break between levels resumes itself because the
 * player is there; this one is up precisely because they were not.
 */
/**
 * The rules at length, reached from the title screen and nowhere else.
 *
 * Not animated: the footage is stopped behind it, because this is a screen for
 * reading and balloons drifting past text is the enemy of that.
 */
Screens.about = {
    animated: false,

    enter: function (game) {
        game.pressed = null;
        Announce.about(game);
    },

    bind: function (game, signal) {
        Input.about(game, signal);
    },

    draw: function (game) {
        Paint.sky(game);
        // The whole screen, not the title screen's panel. This is the only
        // screen whose text reaches the bottom of a phone, and the panel that
        // is sized for a leaderboard fades out well above that — which left
        // the last paragraph on a lit horizon.
        Paint.panel(game, { y: 0, height: game.height });
        Paint.about(game);
    },

    menuLive: function () {
        return true;
    }
};

/**
 * The board, and the player's own runs.
 *
 * A static screen, like About: reading it is the point, and a sky drifting
 * behind text is the enemy of that. Everyone's board comes from the server;
 * "just mine" is the local history, so it works offline.
 */
Screens.board = {
    animated: false,

    enter: function (game) {
        game.pressed = null;
        game.state.mine = false;
        Scores.load(game);
        Announce.board(game);
    },

    bind: function (game, signal) {
        Input.board(game, signal);
    },

    draw: function (game) {
        Paint.sky(game);
        Paint.panel(game, { y: 0, height: game.height });
        Paint.board(game);
    },

    menuLive: function () {
        return true;
    }
};

/**
 * Asking whether you meant to end the run.
 *
 * Its own screen rather than a flag on the paused one, because the two answer
 * different questions and the paused screen already counts down. It costs no
 * pause: being asked is not a pause you chose to take.
 *
 * The sky is not drawn, for the same reason it is not drawn while paused -- a
 * confirmation you can sit in while reading the sky is a free look at it.
 */
Screens.confirmQuit = {
    animated: false,

    enter: function (game) {
        game.pressed = null;
        Announce.confirmQuit(game);
    },

    bind: function (game, signal) {
        Input.confirmQuit(game, signal);
    },

    draw: function (game) {
        Paint.sky(game);
        Paint.panel(game, game.layout.breakPanel);
        Paint.confirmQuit(game);
    },

    menuLive: function () {
        return false;
    }
};

Screens.paused = {
    // Animated, unlike the pause that only ever came from looking away: a
    // pause the player asked for is counting down, and a clock that does not
    // move is not a clock.
    animated: true,

    enter: function (game) {
        game.pressed = null;
        game.pauseSteps = game.askedToPause ? Game.PAUSE_STEPS : 0;
        Announce.paused(game);
    },

    update: function (game) {
        if (!game.askedToPause) {
            return;
        }
        game.pauseSteps--;
        if (game.pauseSteps <= 0) {
            game.enter("playing");
        }
    },

    bind: function (game, signal) {
        Input.resume(game, signal);
    },

    draw: function (game) {
        Paint.sky(game);
        // The entities are NOT drawn. A pause that leaves the sky up is a free
        // look at where everything is, which is worth more than the pause —
        // and no limit on how often you may take one limits what you get.
        Paint.panel(game, game.layout.breakPanel);
        Paint.paused(game);
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

        // And it does not sit here for ever. Left alone, the game goes back to
        // the title and starts playing itself again — which is what the
        // attract screen is for, and what a machine nobody is sitting at
        // should be showing.
        game.state.stepsHome = Game.GAMEOVER_STEPS;

        // A practice run is not submitted at all. A board mixing runs that
        // skipped the climb with runs that did it is worse than no board, and
        // the honest way to keep them apart is to not post one of them.
        if (!game.isPractice()) {
            Scores.submit(game, game.score);
        }
        // The personal tally, which is where "new personal best" comes from.
        // Remembered before reading the best, so a first run is its own best.
        var previousBest = Scores.personalBest(game.name);
        Scores.remember(game);
        game.state.isBest = !game.isPractice() &&
            previousBest !== null && game.score > previousBest;
        // No board fetch here: this screen shows the run's own breakdown, and
        // the board has a screen of its own to fetch and draw it.
        Announce.gameover(game);
    },

    bind: function (game, signal) {
        Input.gameover(game, signal);
    },

    // Nothing spawns any more; the balloons still in the air accelerate and
    // leave, which is how the board clears itself behind the text.
    update: function (game) {
        game.reap();
        game.step(true);

        game.state.stepsHome--;
        if (game.state.stepsHome <= 0) {
            game.enter("title");
        }
    },

    draw: function (game) {
        Paint.sky(game);
        Paint.panel(game);
        Paint.intro(
            game,
            (game.won ? "You win! Score: " : "Game Over. Score: ") +
                game.score + ", Time: " + game.end_time +
                (game.isPractice() ? " (practice, not saved)" : "")
        );
        Paint.okayButton(game);
        Paint.runBreakdown(game);
        Paint.player(game);
        Paint.entities(game);
    },

    menuLive: function (game) {
        return Date.now() >= game.state.liveAt;
    }
};
