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
 * Screen positions, the difficulty menu and its hit regions all come from
 * layout.js. Seventeen loose fractions and eight hand-counted string offsets
 * used to live here. What each screen *is* comes from screens.js.
 */

const SCORE_URL = "/api/scores/";

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

var Game = {};
Game.fps = 30;

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
    var screen = Screens[name];

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

/** One frame: move what moves, then paint what is on screen by then. */
Game.frame = function () {
    var screen = Screens[this.screen];

    if (screen.update) {
        screen.update(this);
    }
    this.paint();
};

Game.startLoop = function () {
    var that = this;
    if (this.tick_interval) {
        return;
    }
    this.tick_interval = setInterval(function () { that.frame(); }, 1000 / Game.fps);
};

Game.stopLoop = function () {
    if (this.tick_interval) {
        clearInterval(this.tick_interval);
        this.tick_interval = null;
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
    this.fontSize = Layout.applyFont(this.ctx, this.width, this.height);
    this.layout = Layout.compute(this.ctx, this.width, this.height, this.fontSize);
    this.palette = Sky.paletteFor(this.difficulty.level);
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

/** Maps a pointer event onto canvas coordinates, accounting for CSS scaling. */
Game.getCanvasPoint = function (event) {
    var rect = this.canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (this.width / rect.width),
        y: (event.clientY - rect.top) * (this.height / rect.height)
    };
};

/** Popping balloons: bound while a round is counting down or being played. */
Game.bindPopping = function (signal) {
    var that = this;

    this.canvas.addEventListener("click", function (event) {
        var point = that.getCanvasPoint(event);
        for (var i = that.balloons.length - 1; i >= 0; i--) {
            if (that.balloons[i].collision(point.x, point.y)) {
                that.balloons.splice(i, 1);
                that.balloons_caught++;
                break;
            }
        }
    }, { signal: signal });
};

/**
 * The difficulty menu: bound on the screens that show it.
 *
 * A locked menu is a live binding that declines, rather than the old absence
 * of any binding at all — so the lockout is one condition, checked in the same
 * place that decides how the buttons are drawn.
 */
Game.bindMenu = function (signal) {
    var that = this;

    // Animated screens are repainted by the loop; a static one has to be told.
    var repaintIfStatic = function () {
        if (!Screens[that.screen].animated) {
            that.paint();
        }
    };

    this.canvas.addEventListener("pointerdown", function (event) {
        if (!that.isMenuLive()) {
            return;
        }
        var target = Layout.pick(that.layout.targets, that.getCanvasPoint(event));
        that.pressedLevel = target ? target.level : null;
        repaintIfStatic();
    }, { signal: signal });

    var releasePress = function () {
        if (that.pressedLevel !== null) {
            that.pressedLevel = null;
            repaintIfStatic();
        }
    };
    this.canvas.addEventListener("pointerup", releasePress, { signal: signal });
    this.canvas.addEventListener("pointercancel", releasePress, { signal: signal });
    this.canvas.addEventListener("pointerleave", releasePress, { signal: signal });

    this.canvas.addEventListener("click", function (event) {
        that.pressedLevel = null;
        if (!that.isMenuLive()) {
            return;
        }

        var target = Layout.pick(that.layout.targets, that.getCanvasPoint(event));
        if (target) {
            // The high-score line has no level of its own; it replays the
            // difficulty already selected.
            that.restart(target.level || that.difficulty.level);
        }
    }, { signal: signal });

    document.addEventListener("keydown", function (event) {
        if (!that.isMenuLive()) {
            return;
        }
        var key = event.key.toUpperCase();
        if (event.key === " " || event.key === "Enter") {
            that.restart(that.difficulty.level);
        } else if (key === "E" || key === "S" || key === "H" || key === "V") {
            that.restart(key);
        }
    }, { signal: signal });
};

// ------------------------------------------------------------------- scores

/**
 * Fetches the leaderboard, once.
 *
 * The game-over screen asks for the board on every frame it draws, and the old
 * version issued a fresh request each time until one came back: thirty requests
 * a second for as long as the network took. The in-flight promise is the lock.
 */
Game.loadScores = function () {
    var that = this;

    if (this.scores || this.scoresPending) {
        return;
    }

    // Wait on any score still being submitted, so the board we draw includes it.
    var mine = (this.pendingScore || Promise.resolve())
        .then(function () {
            return fetch(SCORE_URL + that.difficulty.level.toLowerCase());
        })
        .then(function (response) {
            return response.ok ? response.json() : [];
        })
        .then(function (data) {
            // A score submitted while this was in flight supersedes it, or the
            // board we are holding is already out of date.
            if (that.scoresPending !== mine) {
                return;
            }
            that.scoresPending = null;
            that.scores = data;

            // A static screen drew before the board arrived, so it has to be
            // drawn again — as a whole screen, not by painting text over
            // whatever happens to be on the canvas by now.
            if (!Screens[that.screen].animated) {
                that.paint();
            }
        })
        .catch(function () {
            /* The leaderboard is a nicety; the game plays fine without it. */
            if (that.scoresPending === mine) {
                that.scoresPending = null;
            }
        });

    this.scoresPending = mine;
};

Game.submitScore = function (score) {
    var that = this;

    // The board on screen predates this score, and so does any request for it.
    this.scores = undefined;
    this.scoresPending = null;

    this.pendingScore = fetch(SCORE_URL + this.difficulty.level.toLowerCase(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score: score, name: that.name })
    }).catch(function () {
        /* Ignore: a failed submission shouldn't block the game-over screen. */
    });
};

// ------------------------------------------------------------------ drawing

Game.clear = function () {
    var sky = Sky.render(this.width, this.height, this.dpr, this.difficulty.level);
    this.ctx.drawImage(sky, 0, 0, this.width, this.height);
};

/** The one headline line, shared by the title and game-over screens. */
Game.drawIntro = function (text) {
    this.ctx.font = this.layout.fonts.intro;
    this.ctx.fillStyle = this.palette.ink;
    this.ctx.fillText(text, this.layout.intro.x, this.layout.intro.y);
    this.ctx.font = this.layout.fonts.menu;
};

/**
 * Draws the difficulty buttons in whichever of four states they are in.
 *
 * A button used to look identical whether or not pressing it would do
 * anything: after a game ended the menu was repainted every frame for five
 * seconds while no input was bound at all.
 */
Game.drawMenu = function () {
    var ctx = this.ctx;
    var palette = this.palette;
    var buttons = this.layout.menu.buttons;
    var live = this.isMenuLive();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = this.layout.fonts.menu;
    ctx.lineWidth = Math.max(1, this.layout.line * 0.06);

    for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        var selected = button.level === this.difficulty.level;
        var pressed = live && button.level === this.pressedLevel;

        var fill, border, label;
        if (!live) {
            fill = palette.buttonDisabledFill;
            border = palette.buttonDisabledBorder;
            label = palette.inkDisabled;
        } else if (selected) {
            fill = palette.accent;
            border = null;
            label = palette.onAccent;
        } else {
            fill = palette.buttonFill;
            border = palette.buttonBorder;
            label = palette.ink;
        }

        Layout.roundedRect(ctx, button, button.radius);
        ctx.fillStyle = fill;
        ctx.fill();

        if (border) {
            ctx.strokeStyle = border;
            ctx.stroke();
        }

        // Layered over whatever fill the button has, so the already-selected
        // button responds to a press too — it restarts the game, so it is just
        // as pressable as the others.
        if (pressed) {
            ctx.fillStyle = palette.buttonPressOverlay;
            ctx.fill();
        }

        ctx.fillStyle = label;
        ctx.fillText(
            button.label,
            button.x + button.width / 2,
            button.y + button.height / 2
        );
    }

    ctx.restore();

    ctx.font = this.layout.fonts.label;
    ctx.fillStyle = live ? palette.inkSoft : palette.inkDisabled;
    ctx.fillText(
        live ? Layout.HINT_TEXT : "Hold on...",
        this.layout.hint.x,
        this.layout.hint.y
    );
};

/** The board, if one has arrived. Nothing is drawn before then. */
Game.drawScores = function () {
    var scores = this.layout.scores;
    var data = this.scores;

    if (!data) {
        return;
    }

    this.ctx.font = this.layout.fonts.label;
    this.ctx.fillStyle = this.palette.inkSoft;
    this.ctx.fillText(Layout.HIGH_SCORES_TEXT + this.difficulty.level, scores.heading.x, scores.heading.y);

    this.ctx.font = this.layout.fonts.score;
    for (var i = 0; i < scores.rows.length; i++) {
        if (data.length > i) {
            this.ctx.fillStyle = this.palette.inkSoft;
            this.ctx.fillText(data[i]["score_day"], scores.columns.date, scores.rows[i]);
            this.ctx.fillStyle = this.palette.ink;
            this.ctx.fillText(data[i]["name"], scores.columns.name, scores.rows[i]);
            this.ctx.fillStyle = this.palette.accent;
            this.ctx.fillText(data[i]["score"], scores.columns.value, scores.rows[i]);
        }
    }
    this.ctx.font = this.layout.fonts.menu;
};

Game.drawCountdown = function (remaining) {
    var ctx = this.ctx;

    ctx.save();
    ctx.textAlign = "center";

    ctx.font = this.layout.fonts.label;
    ctx.fillStyle = this.palette.inkSoft;
    ctx.fillText("Get ready", this.layout.countdown.x, this.layout.countdown.y - this.layout.line * 1.5);

    ctx.font = this.layout.fonts.countdown;
    ctx.fillStyle = this.palette.accent;
    ctx.fillText(
        String(Math.ceil(Math.max(remaining, 0) / 1000)),
        this.layout.countdown.x,
        this.layout.countdown.y
    );

    ctx.restore();
};

Game.drawBalloons = function () {
    for (var i = 0; i < this.balloons.length; i++) {
        this.balloons[i].draw();
    }
};

Game.drawHud = function () {
    var hud = this.layout.hud;

    this.ctx.font = this.layout.fonts.hud;
    this.ctx.fillStyle = this.palette.ink;
    this.ctx.fillText(
        this.balloons_caught + " popped, " + this.lostBalloons + " lost",
        hud.caught, hud.y
    );
    this.ctx.fillStyle = this.palette.inkSoft;
    this.ctx.fillText(this.difficulty.name, hud.level, hud.y);
    this.ctx.fillStyle = this.palette.accent;
    this.ctx.fillText(this.elapsed() + "s", hud.time, hud.y);
};

// -------------------------------------------------------------------- world

/** How long the current round has been running, as a fixed-point string. */
Game.elapsed = function () {
    return ((Date.now() - this.start) / 1000).toFixed(2);
};

/**
 * Clears the board for a new round. The clock is set here and again when play
 * actually begins, so nothing drawn during the countdown can read a time left
 * over from the previous game.
 */
Game.resetRound = function () {
    this.pressedLevel = null;
    this.balloons = [];
    this.balloons_caught = 0;
    this.lostBalloons = 0;
    this.end_time = null;
    this.start = Date.now();
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
    // Asked once on first visit and remembered afterwards. Previously this
    // prompted on every single load, and fell back to a plaintext JSONP call
    // to gd.geobytes.com just to pre-fill the field.
    var name = loadSetting("name");
    if (!name) {
        name = window.prompt("Please enter your name", "anonymous");
        if (name) {
            saveSetting("name", name);
        }
    }
    this.name = name || "anonymous";

    this.canvas = document.getElementById("balloon_canvas");
    this.ctx = this.canvas.getContext("2d");

    this.difficulty = Difficulty.get(loadSetting("diff_level"));
    this.balloons = [];
    this.pressedLevel = null;

    this.applyCanvasSize();
    this.enter("title");
    this.watchViewport();
};

window.addEventListener("load", function () {
    Game.init();
}, false);
