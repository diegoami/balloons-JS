"use strict";

/** Balloon radius before any scaling: a base plus a random spread. */
var BALLOON_BASE_SIZE = 24;
var BALLOON_SIZE_SPREAD = 50;

/** A bird's body radius and its speed across the screen, before scaling. */
var BIRD_BASE_SIZE = 13;
var BIRD_SPEED = 7;

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
 * looked like difficulty. That arrived after about 300 balloons, roughly two
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

/**
 * How long the game-over screen holds before going back to the title, in
 * simulation steps.
 *
 * Long enough to read your score, watch the sky clear and find yourself on the
 * board; short enough that a machine nobody is sitting at ends up showing the
 * game playing itself rather than somebody else's result. A tap still restarts
 * immediately once the menu lockout has passed — this is only what happens if
 * nothing does.
 *
 * Steps rather than milliseconds, like everything else that measures time in
 * this game: a wall clock would run down while the tab was in the background,
 * and the player would come back to a title screen having never seen how they
 * did.
 */
Game.GAMEOVER_STEPS = Math.round(10000 / Game.STEP_MS);

/**
 * Balloons you may lose before the game ends, at the start of a run.
 *
 * One number for everyone. There were four, from fifteen down to one, and they
 * were the main thing four difficulties meant — which also meant four
 * leaderboards nobody could compare. One ladder, one lives count, one board.
 *
 * It is a starting number rather than the whole story, because five flat lives
 * cannot reach level 20. The back half of the ladder runs at break-even: five
 * lives across ten rungs buys about seven and a half taps more than a player
 * supplies, over 200 seconds. The ladder awards a life at 12, 15 and 18 — at
 * each level where a new thing arrives to take one — and `game.allowance` is
 * where those land.
 */
Game.LIVES = 5;

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

/** Whether the buttons on the screen will actually do anything if pressed. */
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
 * ladder is calibrated against a step, not a second.
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

Game.restart = function () {
    this.enter("starting");
};

/**
 * The sky belongs to the rung, so it is set wherever the rung is set rather
 * than once at boot.
 */
Game.applyLevel = function (level) {
    this.level = level;
    this.palette = Sky.paletteFor(level);
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
    this.palette = Sky.paletteFor(this.level);
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
        Layout.PLAYER_PREFIX + this.name,
        this.startLevel
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

        // Entities that care about the shape of the window are told.
        for (var i = 0; i < that.entities.length; i++) {
            if (that.entities[i].resized) {
                that.entities[i].resized(that);
            }
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
 * The level a round has climbed to, from the time it has been played.
 *
 * Time, not score: a game gets harder because you have been at it, not because
 * you have been good at it. Counted in simulation steps like everything else,
 * so a stall or a tab in the background does not advance it.
 */
Game.levelFor = function (ticks) {
    var seconds = ticks * Game.STEP_MS / 1000;
    var climbed = Math.floor(seconds / Ladder.CLIMB_SECONDS);
    return Math.min(Ladder.MAX, this.startLevel + climbed);
};

/** The row of the ladder the game is being played on right now. */
Game.rung = function () {
    return Ladder.at(this.level);
};

/**
 * Steps in a whole run: every level from where it started, played out.
 *
 * `levelFor` clamps at the top, so it cannot tell level 20 from the end of
 * level 20 — and the difference is the whole point of a finish line. You win
 * by surviving 20, not by arriving at it.
 *
 * Counted from `startLevel` rather than from 1, so a practice run that opens
 * at 16 ends after five levels rather than sitting on the top rung for four
 * minutes with nothing left to climb.
 */
Game.runTicks = function () {
    // Rounded: STEP_MS is 1000/30, so the division lands a fraction off a
    // whole number of steps and the count of something countable should not.
    var levels = Ladder.MAX - this.startLevel + 1;
    return Math.round(levels * Ladder.CLIMB_SECONDS * 1000 / Game.STEP_MS);
};

/**
 * Moves the level chip on to the next level worth practising, wrapping round.
 *
 * One target that cycles rather than a stepper with two: twenty levels is
 * seventeen taps to reach 18, and the list is short because it holds only the
 * levels where something new arrives.
 */
Game.cycleStartLevel = function () {
    var levels = Ladder.starts();
    var at = levels.indexOf(this.startLevel);
    this.startLevel = levels[(at + 1) % levels.length];

    // The chip's own width depends on what it says, so the layout has to be
    // measured again before anything is drawn on top of the old one.
    this.measureLayout();
    Announce.startLevel(this);
    this.paint();
};

/**
 * Records one tap's pointer type.
 *
 * A PointerEvent reports "mouse", "touch" or "pen", and an older browser that
 * fires the event without the field reports nothing at all — which is counted
 * as unknown rather than guessed at.
 */
Game.countPointer = function (kind) {
    if (kind === "touch" || kind === "pen") {
        this.pointers.touch++;
    } else if (kind === "mouse") {
        this.pointers.mouse++;
    }
};

/**
 * What the run was played with: "touch", "mouse", "mixed", or null.
 *
 * Null when nothing said — an old browser, or a run that ended without a tap.
 * Null is not "mouse": the board already knows how to draw a fact it does not
 * have, and inventing one here would be worse than leaving the column empty.
 *
 * "Mixed" needs a real minority rather than one stray tap, because a laptop
 * with a touchscreen registers the odd touch from a palm or a scroll.
 */
Game.pointerKind = function () {
    var touch = this.pointers.touch;
    var mouse = this.pointers.mouse;
    var total = touch + mouse;

    if (total === 0) {
        return null;
    }
    if (Math.min(touch, mouse) / total >= 0.2) {
        return "mixed";
    }
    return touch > mouse ? "touch" : "mouse";
};

/**
 * Whether this run counts.
 *
 * A run that skipped the climb is not comparable with one that did it, and a
 * board mixing the two is worse than no board. So the score is simply not
 * submitted — the run still plays, still shows its points, and still says at
 * the end that it was practice.
 */
Game.isPractice = function () {
    return this.startLevel > 1;
};

/** Whether the run has been played all the way to the end of the last level. */
Game.finished = function () {
    return this.ticks >= Game.runTicks();
};

/**
 * Takes the life a level awards, if it awards one.
 *
 * Returns how many were given, so the caller can say so: a life that arrives
 * silently is a life the player does not know they have.
 */
Game.awardLife = function (level) {
    var given = Ladder.at(level).life || 0;
    this.allowance += given;
    return given;
};

/**
 * Clears the board for a new round. The clock is set here and again when play
 * actually begins, so nothing drawn during the countdown can read a time left
 * over from the previous game.
 */
Game.resetRound = function () {
    this.pressed = null;
    this.entities = [];
    this.score = 0;
    // Lives spent, not balloons escaped. It was `lostBalloons` while a balloon
    // getting away was the only way to spend one; touching a bird costs one
    // too, and a counter named after one of the two things that fill it is the
    // kind of name this project keeps having to fix.
    this.livesLost = 0;
    this.pointers = { touch: 0, mouse: 0 };
    // Far enough back that the first boss is only waiting on the sky going
    // quiet, not on a cooldown left over from nothing.
    this.lastBoss = -Infinity;
    this.allowance = Game.LIVES;
    this.won = false;
    this.end_time = null;
    this.ticks = 0;
    this.applyLevel(this.startLevel);
};

Game.randomBalloon = function () {
    var max_width = this.width;
    var max_height = this.height;
    var xcoord = Math.floor(Math.random() * this.layout.spawn.width) + this.layout.spawn.min;
    var ycoord = max_height;
    var rung = this.rung();
    var ratioSize = Math.max(MIN_RATIO_SIZE, rung.size);

    // A fingertip is the same size whatever the screen, but radius scaled with
    // width alone: on a 390px phone the smallest balloon was a 19px target,
    // and 7px once the shrink applied. MIN_RATIO_SIZE stops the ladder's own
    // shrink reaching zero; it does not make the result hittable.
    //
    // The smallest balloon never falls below the same touch minimum the menu
    // buttons respect, and the random spread rides on top of that floor, so a
    // balloon keeps some variety at every rung.
    var minRadius = Layout.GRID.minTouchTarget / 2;
    var baseRadius = Math.max(BALLOON_BASE_SIZE * this.ratio * ratioSize, minRadius);
    var randomSize = baseRadius + Math.random() * BALLOON_SIZE_SPREAD * this.ratio * ratioSize;
    var getRandomRGB = function () { return Math.floor(Math.random() * 255); };
    var randomColor = { r: getRandomRGB(), g: getRandomRGB(), b: getRandomRGB() };
    var balloonSpeed = rung.speed;

    // Scaling the rise by height keeps the time to cross the screen the same
    // whatever shape the window is.
    var heightScale = this.height / REFERENCE_HEIGHT;

    return balloonConstructor(
        xcoord, ycoord, randomSize, randomColor, max_width, balloonSpeed, heightScale,
        Ladder.rollSkin(rung)
    );
};

/** Puts something in the sky, in the order it should be drawn. */
Game.add = function (entity) {
    this.entities.splice(Entities.insertionPoint(this.entities, entity), 0, entity);
};

/** How many of one kind are up. The spawn throttle counts balloons, not birds. */
Game.countOf = function (kind) {
    var n = 0;
    for (var i = 0; i < this.entities.length; i++) {
        if (this.entities[i].kind === kind) {
            n++;
        }
    }
    return n;
};

/** Maybe releases one balloon. A fuller sky releases them more slowly. */
Game.spawnBalloon = function () {
    var up = this.countOf("balloon");
    var frequency = this.rung().frequency - SPEED_MODIFIER * up;

    if (Math.random() < frequency && up < MAX_BALLOONS) {
        this.add(this.randomBalloon());
    }
};

/**
 * Tops the sky up to the number of fireflies this level wants.
 *
 * A population, not a rate. They are never removed and never reach the top, so
 * there is nothing to keep respawning: once the count is met this does nothing
 * for the rest of the level.
 *
 * They arrive in the middle band rather than at an edge, because unlike a bird
 * they are not passing through — and one drifting in from off screen would
 * spend its first seconds somewhere nobody is aiming.
 */
Game.spawnFireflies = function () {
    var wanted = this.rung().fireflies || 0;
    var radius = Math.max(FIREFLY_MIN_RADIUS, FIREFLY_BASE_SIZE * this.ratio);
    var edge = radius * FIREFLY_GLOW;

    while (this.countOf("firefly") < wanted) {
        this.add(fireflyConstructor(
            edge + Math.random() * Math.max(1, this.width - edge * 2),
            this.height * 0.2 + Math.random() * Math.max(1, this.height * 0.55),
            radius,
            FIREFLY_DRIFT * this.ratio,
            this.width,
            this.height
        ));
    }
};

/**
 * Maybe sends in a saucer.
 *
 * Two conditions, both from the ladder: the sky has to be down to `bossAt`
 * balloons or fewer, and `bossEvery` steps must have passed since the last
 * fight settled. One boss at a time.
 */
Game.spawnBoss = function () {
    var rung = this.rung();
    if (!rung.bossAt || this.countOf("boss") > 0) {
        return;
    }
    if (this.countOf("balloon") > rung.bossAt) {
        return;
    }
    if (this.ticks - this.lastBoss < rung.bossEvery) {
        return;
    }

    var radius = Math.max(BOSS_MIN_RADIUS, BOSS_BASE_SIZE * this.ratio);
    this.add(bossConstructor(
        this.width / 2,
        // High, so the fight happens over the balloons rather than in them —
        // but not so high that the fuse ring drawn around it disappears under
        // the HUD band.
        Math.max(radius * 1.6, this.height * 0.26),
        radius,
        BOSS_DRIFT * this.ratio * (Math.random() < 0.5 ? 1 : -1),
        this.width
    ));
    Announce.bossArrived(this);
};

/**
 * A fight ended, however it ended.
 *
 * The cooldown starts here rather than when the boss arrived, so a long fight
 * does not eat into the gap before the next one.
 */
Game.bossSettled = function () {
    this.lastBoss = this.ticks;
};

/**
 * Maybe releases one bird.
 *
 * It starts a full wingspan outside the canvas and flies in, so it is always
 * visible for a beat before it reaches the crowded middle — a bird appearing
 * on top of a point the player had already committed to would be a penalty
 * for something nobody could avoid.
 *
 * Its height is the middle band of the sky: below the HUD, and above the strip
 * at the bottom where balloons are released, so it crosses the crowd rather
 * than the queue.
 */
Game.spawnBird = function () {
    var chance = this.rung().birds || 0;
    if (chance <= 0 || Math.random() >= chance) {
        return;
    }

    var radius = Math.max(BIRD_MIN_RADIUS, BIRD_BASE_SIZE * this.ratio);
    var span = radius * BIRD_SPAN;
    var fromLeft = Math.random() < 0.5;
    var band = this.height * 0.55;
    var top = this.height * 0.18;

    this.add(birdConstructor(
        fromLeft ? -span : this.width + span,
        top + Math.random() * band,
        radius,
        BIRD_SPEED * this.ratio,
        fromLeft
    ));
};

/**
 * Clears out everything that is finished with, and says how many of them got
 * away. Each kind decides for itself why it is done: a balloon off the top has
 * escaped and costs the player, and a thing that merely left will not.
 */
Game.reap = function () {
    var escaped = 0;

    for (var i = this.entities.length - 1; i >= 0; i--) {
        var why = this.entities[i].gone(this);
        if (why) {
            this.entities.splice(i, 1);
            if (why === "escaped") {
                escaped++;
            }
        }
    }
    return escaped;
};

/**
 * Moves everything one step. `leave` is set once a round is over: it is how the
 * board empties itself, with whatever is left speeding up and clearing off.
 */
Game.step = function (leave) {
    for (var i = 0; i < this.entities.length; i++) {
        this.entities[i].step(this, leave);
    }
};

// --------------------------------------------------------------------- boot

/**
 * Notices the tab going away.
 *
 * Installed once for the life of the page rather than per screen, because the
 * thing it watches for is the page itself losing focus. It only acts during
 * play: every other screen is either already waiting for the player or is
 * happy to be left running.
 */
Game.watchVisibility = function () {
    var that = this;
    document.addEventListener("visibilitychange", function () {
        if (document.hidden && that.screen === "playing") {
            that.enter("paused");
        }
    });
};

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

    this.entities = [];
    this.pressed = null;
    this.pointers = { touch: 0, mouse: 0 };

    /**
     * Where the next run opens.
     *
     * Deliberately NOT remembered between visits. The difficulty setting this
     * game used to carry was, and a returning player was silently put back on
     * a choice they made once; a practice level is a stronger version of the
     * same trap, because it also stops their scores counting.
     */
    this.startLevel = 1;
    this.applyLevel(1);

    this.applyCanvasSize();
    this.enter(stored ? "title" : "name");
    this.watchViewport();
    this.watchVisibility();
};

window.addEventListener("load", function () {
    Game.init();
}, false);
