"use strict";

var BALLOON_FREQUENCY = 0.1;
var BALLOON_SPEED = 5.5;

/** Balloon radius before any scaling: a base plus a random spread. */
var BALLOON_BASE_SIZE = 24;
var BALLOON_SIZE_SPREAD = 50;

/**
 * Balloon speed is expressed for a screen this tall and scaled from there.
 *
 * Speed was absolute pixels per tick while the distance a balloon had to cross
 * was the screen height, so the time available to react was set by how tall
 * your window happened to be. Measured with the playtest harness, a 1920x400
 * window gave 2.4 seconds of median reaction time against a phone's 4.2, and
 * it was the only viewport where the bot lost a game.
 */
var REFERENCE_HEIGHT = 720;
var MAX_BALLOONS = 20;
var RATIO_SIZE = 1;

/**
 * Balloons shrink as the score climbs. Without a floor that shrink ran past
 * zero and turned negative: at RATIO_DECREASE balloons popped the radius hits
 * 0, and `check_hit` compares against it, so no point on the screen can pop
 * one. Every long game ended the same way, with an unwinnable board that
 * looked like difficulty. On VHard that was about 300 balloons, roughly two
 * and a half minutes in.
 *
 * 0.4 keeps the escalation visible while leaving the balloon hittable forever.
 */
var MIN_RATIO_SIZE = 0.4;
var SPEED_MODIFIER = 0.0015;

/**
 * What this file is not: where the screen is laid out (layout.js), what the
 * game is being at any moment (screens.js), what it draws (paint.js), what it
 * listens to (input.js), the leaderboard (scores.js) or the one DOM element in
 * the whole game (namefield.js). What is left here is the game itself: the
 * loop, the canvas, the screen it is on, and the balloons.
 */

/** localStorage throws when site data is blocked, so every access is guarded. */
function loadSetting(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function saveSetting(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (e) {
        /* Preferences just won't persist. Not worth interrupting the game. */
    }
}

/**
 * The same cleaning the score function applies, done here too so the name you
 * see is the name that gets stored. Control characters out, 24 characters max,
 * and an empty field means anonymous rather than a blank row on the board.
 */
var MAX_NAME_LENGTH = 24;

function cleanName(value) {
    if (typeof value !== "string") {
        return "anonymous";
    }
    var cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
    return cleaned.slice(0, MAX_NAME_LENGTH) || "anonymous";
}

var Game = {};

/**
 * One simulation step. Thirty a second, which is the rate the game was tuned
 * at, and now the rate it runs at whatever the display is doing.
 */
Game.STEP_MS = 1000 / 30;

/** The most simulation time one frame is allowed to catch up on. */
Game.MAX_CATCHUP_MS = 250;

/** How long the countdown before play runs. */
Game.COUNTDOWN_MS = 2000;

/**
 * How long the menu stays locked after a game ends. Its only job is to stop
 * the tap that popped the last balloon from immediately restarting; it used to
 * be five seconds, during which the buttons were drawn as though they worked.
 */
Game.MENU_LOCKOUT_MS = 1200;

// ------------------------------------------------------------------ screens

/**
 * Moves to a screen, which is the only way the game changes state.
 *
 * Everything a transition needed used to be spread across its caller: restart
 * set five fields and started a timer, gameover set four more and scheduled a
 * rebind 1.2 seconds out. Now each screen says what it is (screens.js) and
 * this is the machinery that swaps one for another.
 */
Game.enter = function (name) {
    var previous = Screens[this.screen];
    var screen = Screens[name];

    if (previous && previous.exit) {
        previous.exit(this);
    }

    this.screen = name;

    // Whatever the incoming screen needs to remember. Deadlines used to live
    // on the game forever, meaning something outside the screen that set them
    // could read them long after they stopped meaning anything.
    this.state = {};

    var signal = this.resetInput();

    if (screen.enter) {
        screen.enter(this);
    }
    if (screen.bind) {
        screen.bind(this, signal);
    }

    if (screen.animated) {
        this.startLoop();
    } else {
        this.stopLoop();
    }

    // Painted on arrival rather than left to the next frame, so a transition
    // is visible the moment it happens whether or not a loop is running.
    this.paint();
};

/** Paints whichever screen is up. */
Game.paint = function () {
    Screens[this.screen].draw(this);
};

/** Whether the difficulty buttons will actually do anything if pressed. */
Game.isMenuLive = function () {
    var screen = Screens[this.screen];
    return screen.menuLive ? screen.menuLive(this) : false;
};

/**
 * Starts the frame loop, if it is not already running.
 *
 * It was setInterval(frame, 1000 / 30). That asks the browser to run the game
 * on its own schedule rather than the display's, so every frame landed a
 * little before or after the moment the screen was actually redrawn and the
 * balloons juddered. It also kept running in a background tab, at whatever
 * rate the browser felt like throttling it to, which is how you could come
 * back to a tab and find the game had been played without you.
 */
Game.startLoop = function () {
    if (this.running) {
        return;
    }
    this.running = true;
    this.lastFrame = null;
    this.accumulator = 0;

    var step = function (now) {
        if (!Game.running) {
            return;
        }
        // Asked for before the work, so that a screen change during the work
        // can cancel the frame it does not want.
        Game.frameHandle = window.requestAnimationFrame(step);
        Game.advance(now);
    };
    this.frameHandle = window.requestAnimationFrame(step);
};

Game.stopLoop = function () {
    this.running = false;
    if (this.frameHandle !== null && this.frameHandle !== undefined) {
        window.cancelAnimationFrame(this.frameHandle);
        this.frameHandle = null;
    }
};

/**
 * Catches the simulation up to `now` and paints once, if anything moved.
 *
 * The game takes fixed steps of STEP_MS, however often the display asks for a
 * frame. A balloon's speed is expressed per step, so without this a 120Hz
 * display would play the game at four times the speed of a 30Hz one; the whole
 * difficulty table is calibrated against a step, not a second.
 *
 * Taking `now` as an argument rather than reading a clock is what makes the
 * loop testable: a stall can be handed to it rather than waited for.
 */
Game.advance = function (now) {
    if (this.lastFrame === null) {
        this.lastFrame = now;
    }

    // A tab that was hidden for a minute, or a long pause, must not be replayed
    // at full speed: the game would spawn a minute of balloons into one frame
    // and you would lose them all before the screen updated.
    var elapsed = Math.min(now - this.lastFrame, Game.MAX_CATCHUP_MS);
    this.lastFrame = now;
    this.accumulator += Math.max(elapsed, 0);

    var stepped = false;
    while (this.accumulator >= Game.STEP_MS) {
        this.accumulator -= Game.STEP_MS;
        stepped = true;

        // Read each time round: a step can change which screen is up. If it
        // changed to a screen that does not move, the rest of the catch-up
        // drains harmlessly.
        var screen = Screens[this.screen];
        if (screen.update) {
            screen.update(this);
        }
    }

    if (stepped) {
        this.paint();
    }
};

Game.restart = function (level) {
    saveSetting("diff_level", level);
    this.difficulty = Difficulty.get(level);
    this.palette = Sky.paletteFor(this.difficulty.level);
    this.enter("starting");
};

// ------------------------------------------------------------------- canvas

/**
 * Sizes the canvas.
 *
 * Two coordinate spaces are in play. The backing store is sized in device
 * pixels so the result is sharp on a retina display; everything the game
 * measures and draws works in CSS pixels, held in this.width / this.height,
 * and the context transform bridges the two. Previously the canvas was sized
 * to innerWidth/innerHeight once at load, so on a 2x display the browser drew
 * at 1x and upscaled, softening every glyph and balloon edge.
 *
 * Assigning canvas.width or canvas.height resets the whole 2D context, so the
 * transform, font and fill style are all re-established here afterwards.
 */
Game.applyCanvasSize = function () {
    this.dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.ratio = this.width / 1000;
    this.measureLayout();
    this.palette = Sky.paletteFor(this.difficulty.level);
};

/**
 * Works out where everything goes. Separate from sizing the canvas because the
 * player's name is drawn and tapped, so changing it moves a hit region and the
 * layout has to be measured again — without resetting the backing store.
 */
Game.measureLayout = function () {
    this.fontSize = Layout.applyFont(this.ctx, this.width, this.height);
    this.layout = Layout.compute(
        this.ctx, this.width, this.height, this.fontSize,
        Layout.PLAYER_PREFIX + this.name
    );
};

/**
 * Re-sizes and repaints after the viewport changes. Resize events arrive in
 * bursts (a drag, a phone rotating, a mobile URL bar collapsing), so the work
 * is coalesced into one frame.
 */
Game.handleResize = function () {
    var that = this;
    if (this.resizePending) {
        return;
    }
    this.resizePending = true;

    window.requestAnimationFrame(function () {
        that.resizePending = false;
        that.applyCanvasSize();
        that.watchPixelRatio();

        // Balloons captured the old width as their bounce boundary.
        for (var i = 0; i < that.balloons.length; i++) {
            that.balloons[i].xmax = that.width;
        }

        that.paint();
    });
};

Game.watchViewport = function () {
    var that = this;
    var onResize = function () { that.handleResize(); };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    this.watchPixelRatio();
};

/**
 * Dragging a window onto a display with a different pixel density changes
 * devicePixelRatio without necessarily firing a resize event. The query only
 * matches one specific ratio, so it is re-armed after each change.
 */
Game.watchPixelRatio = function () {
    var that = this;

    // Armed once per distinct ratio. Without this guard every ordinary resize
    // would leave another live MediaQueryList listener behind.
    if (!window.matchMedia || this.watchedRatio === this.dpr) {
        return;
    }
    var query = window.matchMedia("(resolution: " + this.dpr + "dppx)");
    if (!query.addEventListener) {
        return;
    }
    this.watchedRatio = this.dpr;

    query.addEventListener("change", function () {
        that.watchedRatio = null;
        that.handleResize();
    }, { once: true });
};

// -------------------------------------------------------------------- input

/**
 * Drops every listener the outgoing screen bound and returns a signal for the
 * incoming one. Replaces jQuery's .unbind(), which removed *all* handlers on
 * document as a way to reset input.
 */
Game.resetInput = function () {
    if (this.inputAbort) {
        this.inputAbort.abort();
    }
    this.inputAbort = new AbortController();
    return this.inputAbort.signal;
};

// --------------------------------------------------------------------- name

/**
 * Takes the name, everywhere it is kept. The layout is measured again because
 * the name is drawn, so its width is also the width of a tap target.
 */
Game.setName = function (value) {
    this.name = cleanName(value);
    saveSetting("name", this.name);
    this.measureLayout();
};

// -------------------------------------------------------------------- world

/**
 * How long the round has been running, as a fixed-point string.
 *
 * Counted in simulation steps rather than read off the wall clock, so the time
 * on the board is the time the game was actually played: a stall, a dropped
 * frame or a tab left in the background does not add to anybody's score.
 */
Game.elapsed = function () {
    return (this.ticks * Game.STEP_MS / 1000).toFixed(2);
};

/**
 * Clears the board for a new round. The clock is set here and again when play
 * actually begins, so nothing drawn during the countdown can read a time left
 * over from the previous game.
 */
Game.resetRound = function () {
    this.pressed = null;
    this.balloons = [];
    this.balloons_caught = 0;
    this.lostBalloons = 0;
    this.end_time = null;
    this.ticks = 0;
};

Game.randomBalloon = function () {
    var max_width = this.width;
    var max_height = this.height;
    var xcoord = Math.floor(Math.random() * this.layout.spawn.width) + this.layout.spawn.min;
    var ycoord = max_height;
    var ratioSize = Math.max(MIN_RATIO_SIZE, RATIO_SIZE - this.balloons_caught / this.difficulty.ratioDecrease);

    // A fingertip is the same size whatever the screen, but radius scaled with
    // width alone: on a 390px phone the smallest balloon was a 19px target,
    // and 7px once the shrink floor applied. MIN_RATIO_SIZE stopped the radius
    // reaching zero; it did not make the result hittable.
    //
    // The smallest balloon now never falls below the same touch minimum the
    // menu buttons respect, and the random spread rides on top of that floor,
    // so a balloon keeps some variety and a desktop game is unchanged.
    var minRadius = Layout.GRID.minTouchTarget / 2;
    var baseRadius = Math.max(BALLOON_BASE_SIZE * this.ratio * ratioSize, minRadius);
    var randomSize = baseRadius + Math.random() * BALLOON_SIZE_SPREAD * this.ratio * ratioSize;
    var getRandomRGB = function () { return Math.floor(Math.random() * 255); };
    var randomColor = { r: getRandomRGB(), g: getRandomRGB(), b: getRandomRGB() };
    var balloonSpeed = BALLOON_SPEED + this.balloons_caught / this.difficulty.speedIncrease;

    // Scaling the rise by height keeps the time to cross the screen the same
    // whatever shape the window is.
    var heightScale = this.height / REFERENCE_HEIGHT;

    return balloonConstructor(
        xcoord, ycoord, randomSize, randomColor, max_width, balloonSpeed, heightScale
    );
};

/** Maybe releases one balloon. A fuller sky releases them more slowly. */
Game.spawnBalloon = function () {
    var frequency = BALLOON_FREQUENCY - SPEED_MODIFIER * this.balloons.length;

    if (Math.random() < frequency && this.balloons.length < MAX_BALLOONS) {
        this.balloons.push(this.randomBalloon());
    }
};

/** Drops the balloons that reached the top, and says how many got away. */
Game.removeEscaped = function () {
    var escaped = 0;

    for (var i = this.balloons.length - 1; i >= 0; i--) {
        if (this.balloons[i].ycoord <= ESCAPE_COORDS) {
            this.balloons.splice(i, 1);
            escaped++;
        }
    }
    return escaped;
};

/**
 * Moves every balloon one step. Accelerating is how the board empties itself
 * once a game is over: the survivors speed up and fly off the top.
 */
Game.moveBalloons = function (accelerate) {
    for (var i = 0; i < this.balloons.length; i++) {
        this.balloons[i].tick(accelerate);
    }
};

// --------------------------------------------------------------------- boot

Game.init = function () {
    // Asked once on first visit and remembered afterwards. This used to be a
    // window.prompt(), which is a browser modal: it blocked the first paint, so
    // the question arrived over a blank page; it could not be styled, restyled
    // or reopened; some browsers suppress it outright; and once answered there
    // was no way to change the answer short of clearing the site's data.
    // Before that it prompted on every single load, and pre-filled the field
    // from a plaintext JSONP call to gd.geobytes.com.
    var stored = loadSetting("name");
    this.name = cleanName(stored);

    this.canvas = document.getElementById("balloon_canvas");
    this.ctx = this.canvas.getContext("2d");
    NameField.find();
    Announce.find();

    this.difficulty = Difficulty.get(loadSetting("diff_level"));
    this.balloons = [];
    this.pressed = null;

    this.applyCanvasSize();
    this.enter(stored ? "title" : "name");
    this.watchViewport();
};

window.addEventListener("load", function () {
    Game.init();
}, false);
