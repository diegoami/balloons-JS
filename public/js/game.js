var BALLOON_FREQUENCY = 0.1;
var BALLOON_SPEED = 5.5;
var MAX_BALLOONS = 20;
var RATIO_SIZE = 1;
var MAX_LOST_BALLOONS = 15;

var RATIO_DECREASE = 2000;
var SPEED_INCREASE = 500;
var SPEED_MODIFIER = 0.0015;
var DIFF_LEVEL = "E";

/**
 * Screen positions, the difficulty menu and its hit regions all come from
 * layout.js. Seventeen loose fractions and eight hand-counted string offsets
 * used to live here.
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
    this.layout = Layout.compute(this.ctx, this.width, this.height);

    this.is_gradient = 0;
    this.updateGradient();
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
        for (var i = 0; i < (that.balloons || []).length; i++) {
            that.balloons[i].xmax = that.width;
        }

        that.redraw();
    });
};

/**
 * Only the title screen is painted once and left alone. Every other screen is
 * repainted by the game loop, which keeps running through game over.
 */
Game.redraw = function () {
    if (this.screen === "title") {
        this.drawTitleScreen();
    } else if (this.screen === "starting") {
        this.clear();
    }
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

Game.drawTitleScreen = function () {
    this.clear();
    this.updateGradient();
    this.ctx.fillText(Layout.INTRO_TEXT, this.layout.intro.x, this.layout.intro.y);
    this.draw_diff_levels();
    if (this.scores) {
        this.fillscore(this.scores);
    }
};

Game.updateGradient = function () {
    if (!this.is_gradient) {
        var gradient = this.ctx.createLinearGradient(0, 0, this.width, 0);
        for (var i = 0; i < 1; i += 0.05) {
            gradient.addColorStop(i, getRandomCssColor());
        }
        this.ctx.fillStyle = gradient;
        this.is_gradient = 1;
    }
};

/**
 * Drops every listener bound for the previous game state and returns a signal
 * for the next set. Replaces jQuery's .unbind(), which removed *all* handlers
 * on document as a way to reset input.
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

Game.do_click = function () {
    var that = this;
    var signal = this.resetInput();

    this.canvas.addEventListener("click", function (event) {
        var point = that.getCanvasPoint(event);
        for (var i = that.balloons.length - 1; i >= 0; i--) {
            if (that.balloons[i].collision(point.x, point.y)) {
                that.balloons.splice(i, 1);
                if (!that.isrestart) {
                    that.balloons_caught++;
                }
                break;
            }
        }
    }, { signal: signal });
};

Game.restart = function (diff_level) {
    saveSetting("diff_level", diff_level);
    if (diff_level == "E") {
        MAX_LOST_BALLOONS = 15;
        RATIO_DECREASE = 2000;
        SPEED_INCREASE = 500;
        DIFF_LEVEL = "EASY";
    } else if (diff_level == "S") {
        MAX_LOST_BALLOONS = 7;
        RATIO_DECREASE = 1200;
        SPEED_INCREASE = 200;
        DIFF_LEVEL = "STANDARD";
    } else if (diff_level == "H") {
        MAX_LOST_BALLOONS = 3;
        RATIO_DECREASE = 700;
        SPEED_INCREASE = 120;
        DIFF_LEVEL = "HARD";
    } else if (diff_level == "V") {
        MAX_LOST_BALLOONS = 1;
        RATIO_DECREASE = 300;
        SPEED_INCREASE = 80;
        DIFF_LEVEL = "VHARD";
    }
    this.diff_level = diff_level;
    this.do_click();
    if (this.tick_interval) {
        clearInterval(this.tick_interval);
    }
    this.isrestart = false;
    this.showscores = false;
    this.screen = "starting";
    this.clear();
    this.balloons = [];
    this.balloons_caught = 0;
    this.lostBalloons = 0;

    var that = this;
    setTimeout(function () {
        that.start = Date.now();
        that.screen = "playing";
        that.tick_interval = setInterval(Game.run, 1000 / Game.fps);
    }, 2000);
};

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

    this.diff_level = loadSetting("diff_level");
    if (!this.diff_level) {
        this.diff_level = "S";
    }

    this.applyCanvasSize();
    this.screen = "title";
    this.drawTitleScreen();

    this.getScores();
    this.setDifficulty();
    this.watchViewport();
};

Game.setDifficulty = function () {
    var that = this;
    var signal = this.resetInput();

    this.canvas.addEventListener("click", function (event) {
        var point = that.getCanvasPoint(event);
        var target = Layout.pick(that.layout.targets, point);

        if (target) {
            // The high-score line has no level of its own; it replays the
            // difficulty already selected.
            that.restart(target.level || that.diff_level);
        }
    }, { signal: signal });

    document.addEventListener("keydown", function (event) {
        var key = event.key.toUpperCase();
        if (event.key === " " || event.key === "Enter") {
            that.restart(that.diff_level);
        } else if (key === "E" || key === "S" || key === "H" || key === "V") {
            that.restart(key);
        }
    }, { signal: signal });
};

Game.fillscore = function (data) {
    var scores = this.layout.scores;

    if (!data) {
        return;
    }

    this.ctx.fillText(Layout.HIGH_SCORES_TEXT + this.diff_level, scores.heading.x, scores.heading.y);

    for (var i = 0; i < scores.rows.length; i++) {
        if (data.length > i) {
            this.ctx.fillText(data[i]["score_day"], scores.columns.date, scores.rows[i]);
            this.ctx.fillText(data[i]["name"], scores.columns.name, scores.rows[i]);
            this.ctx.fillText(data[i]["score"], scores.columns.value, scores.rows[i]);
        }
    }
};

Game.getScores = function () {
    var that = this;

    if (this.scores) {
        this.fillscore(this.scores);
        return;
    }

    // Wait on any score still being submitted, so the board we draw includes it.
    var ready = this.pendingScore || Promise.resolve();

    ready
        .then(function () {
            return fetch(SCORE_URL + that.diff_level.toLowerCase());
        })
        .then(function (response) {
            return response.ok ? response.json() : [];
        })
        .then(function (data) {
            that.scores = data;
            that.fillscore(data);
        })
        .catch(function () {
            /* The leaderboard is a nicety; the game plays fine without it. */
        });
};

Game.addscore = function (score) {
    var that = this;
    this.scores = undefined;

    this.pendingScore = fetch(SCORE_URL + this.diff_level.toLowerCase(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score: score, name: that.name })
    }).catch(function () {
        /* Ignore: a failed submission shouldn't block the game-over screen. */
    });
};

Game.gameover = function () {
    var that = this;

    if (!this.isrestart) {
        this.addscore(this.balloons_caught);
        this.resetInput();
        this.end_time = this.time_to_show;
        this.isrestart = true;
        this.screen = "gameover";
        setTimeout(function () {
            that.setDifficulty();
            that.showscores = true;
        }, 5000);
    }
    if (this.end_time) {
        if (this.balloons.length == 0) {
            this.updateGradient();
        }
        this.ctx.fillText("Game Over. Score: " + this.balloons_caught + ", Time: " + this.end_time, this.layout.intro.x, this.layout.intro.y);
        this.draw_diff_levels();
        if (this.showscores) {
            this.getScores();
        }
    }
};

Game.draw_diff_levels = function () {
    var menu = this.layout.menu;

    this.ctx.fillText(Layout.MENU_TEXT, menu.x, menu.y);

    this.ctx.save();
    this.ctx.lineWidth = 3 * this.ratio;
    this.ctx.setLineDash([15, 3, 3, 3]);

    for (var i = 0; i < menu.boxes.length; i++) {
        this.ctx.beginPath();
        this.ctx.rect(menu.boxes[i].x, menu.top, menu.boxes[i].width, menu.height);
        this.ctx.stroke();
    }

    this.ctx.restore();
};

Game.randomBalloon = function () {
    var max_width = this.width;
    var max_height = this.height;
    var xcoord = Math.floor(Math.random() * this.layout.spawn.width) + this.layout.spawn.min;
    var ycoord = max_height;
    var ratioSize = RATIO_SIZE - this.balloons_caught / RATIO_DECREASE;
    var randomSize = (24 + Math.floor(Math.random() * 50)) * this.ratio * ratioSize;
    var getRandomRGB = function () { return Math.floor(Math.random() * 255); };
    var randomColor = { r: getRandomRGB(), g: getRandomRGB(), b: getRandomRGB() };
    var balloonSpeed = BALLOON_SPEED + this.balloons_caught / SPEED_INCREASE;

    return balloonConstructor(xcoord, ycoord, randomSize, randomColor, max_width, balloonSpeed);
};

Game.tick = function () {
    var i;

    for (i = this.balloons.length - 1; i >= 0; i--) {
        if (this.balloons[i].ycoord <= ESCAPE_COORDS) {
            this.balloons.splice(i, 1);
            if (!this.isrestart) {
                this.lostBalloons++;
            }
        }
    }

    var balloonFrequency = BALLOON_FREQUENCY - SPEED_MODIFIER * this.balloons.length;
    if (!this.isrestart) {
        if (Math.random() < balloonFrequency && this.balloons.length < MAX_BALLOONS) {
            this.balloons.push(this.randomBalloon());
        }
    }

    for (i = 0; i < this.balloons.length; i++) {
        this.balloons[i].tick(this.isrestart);
    }
    if (this.lostBalloons >= MAX_LOST_BALLOONS) {
        this.gameover();
    }
};

Game.draw = function () {
    for (var i = 0; i < this.balloons.length; i++) {
        this.balloons[i].draw();
    }
    if (this.balloons.length > 0) {
        this.is_gradient = 0;
    }
    if (this.ctx && !this.isrestart) {
        var hud = this.layout.hud;
        this.ctx.fillText(this.balloons_caught + "/" + this.lostBalloons, hud.caught, hud.y);
        this.time_to_show = ((Date.now() - this.start) / 1000).toFixed(2);
        this.ctx.fillText(this.diff_level, hud.level, hud.y);
        this.ctx.fillText(this.time_to_show, hud.time, hud.y);
    }
};

Game.clear = function () {
    this.ctx.clearRect(0, 0, this.width, this.height);
};

Game.update = function () {
    this.clear();
    this.tick();
    this.draw();
};

Game.run = function () {
    if (!Game.stopped) {
        Game.update();
    }
};

window.addEventListener("load", function () {
    Game.init();
}, false);
