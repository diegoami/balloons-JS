var BALLOON_FREQUENCY = 0.1;
var BALLOON_SPEED = 5.5;
var MAX_BALLOONS = 20;
var RATIO_SIZE = 1;
var MAX_LOST_BALLOONS = 15;

var RATIO_DECREASE = 2000;
var SPEED_INCREASE = 500;
var SPEED_MODIFIER = 0.0015;
var DIFF_LEVEL = "E";

const START_TEXT_BEGIN_X = 0.05;
const START_TEXT_INTRO_X = 0.05;
const START_TEXT_INTRO_Y = 0.08;
const START_TEXT_BEGIN_Y = 0.2;
const HIGH_SCORE_BEGIN_X = 0.28;
const HIGH_SCORE_BEGIN_Y = 0.37;

const DIFF_0 = "Tap ", DIFF_1 = "E: Easy", DIFF_2 = "S: Standard", DIFF_3 = "H: Hard", DIFF_4 = "V: VHard";
const HIGH_SCORES_TEXT = "High Scores - ";
const HIGH_SCORES_LENGTH = HIGH_SCORES_TEXT.length;
const DIFF_TOTAL = DIFF_0 + DIFF_1 + ", " + DIFF_2 + ", " + DIFF_3 + ", " + DIFF_4;
const DIFF_OFFSET_1 = DIFF_0.length, DIFF_LENGTH_1 = DIFF_1.length;
const DIFF_OFFSET_2 = DIFF_OFFSET_1 + DIFF_LENGTH_1 + 2, DIFF_LENGTH_2 = DIFF_2.length;
const DIFF_OFFSET_3 = DIFF_OFFSET_2 + DIFF_LENGTH_2 + 2, DIFF_LENGTH_3 = DIFF_3.length;
const DIFF_OFFSET_4 = DIFF_OFFSET_3 + DIFF_LENGTH_3 + 2, DIFF_LENGTH_4 = DIFF_4.length;
const DIFFICULTY_CHOICE = DIFF_TOTAL;

const DIFF_LENGTH_TOTAL = DIFF_TOTAL.length;
const DEFAULT_FONT_SIZE = 30;
const MIN_FONT_SIZE = 12;

/**
 * Same origin as the page, served by netlify/functions/scores.mts. The old
 * absolute 'http://<host>:5000/...' URL was blocked as mixed content on any
 * HTTPS deploy and needed CORS on top.
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

Game.updateGradient = function () {
    if (!this.is_gradient) {
        var gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
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
        x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (event.clientY - rect.top) * (this.canvas.height / rect.height)
    };
};

/**
 * Single source of truth for where the difficulty boxes and high-score line
 * sit. Drawing and hit-testing used to compute this separately and disagreed
 * on the box height (1.3 vs 1.2 ems), so the clickable area was offset from
 * the box actually drawn on screen.
 */
Game.getDiffLayout = function () {
    var unit = this.ctx.measureText(DIFFICULTY_CHOICE).width / DIFF_LENGTH_TOTAL;
    var em = this.ctx.measureText("M").width * 1.3;
    var left = this.canvas.width * START_TEXT_BEGIN_X;

    return {
        unit: unit,
        top: this.canvas.height * START_TEXT_BEGIN_Y - em * 0.75,
        height: em * 1.25,
        scoresLeft: this.canvas.width * HIGH_SCORE_BEGIN_X,
        scoresTop: this.canvas.height * HIGH_SCORE_BEGIN_Y - em / 2,
        scoresHeight: em,
        scoresWidth: unit * (HIGH_SCORES_LENGTH + 4),
        boxes: [
            { level: "E", x: left + unit * (DIFF_OFFSET_1 - 0.5), width: unit * (DIFF_LENGTH_1 + 0.5) },
            { level: "S", x: left + unit * (DIFF_OFFSET_2 - 0.5), width: unit * (DIFF_LENGTH_2 + 0.5) },
            { level: "H", x: left + unit * (DIFF_OFFSET_3 - 0.5), width: unit * (DIFF_LENGTH_3 + 0.5) },
            { level: "V", x: left + unit * (DIFF_OFFSET_4 - 0.5), width: unit * (DIFF_LENGTH_4 + 0.5) }
        ]
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
    this.clear();
    this.balloons = [];
    this.balloons_caught = 0;
    this.lostBalloons = 0;

    var that = this;
    setTimeout(function () {
        that.start = Date.now();
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
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx = this.canvas.getContext("2d");

    this.ratio = this.canvas.width / 1000;

    // Math.max() with a single argument was a no-op, and the result was then
    // bitwise-OR'd with the default as a string: "15" | 30 === 31, so a phone
    // got a 31px font where 15px was intended and the menu overflowed.
    this.fontSize = Math.round(Math.max(DEFAULT_FONT_SIZE * this.ratio, MIN_FONT_SIZE));
    this.ctx.font = this.fontSize + "px Verdana";
    this.is_gradient = 0;
    this.updateGradient();
    this.ctx.fillText("Stop the balloons, before it is too late !!", this.canvas.width * START_TEXT_INTRO_X, this.canvas.height * START_TEXT_INTRO_Y);

    this.diff_level = loadSetting("diff_level");
    if (!this.diff_level) {
        this.diff_level = "S";
    }

    this.draw_diff_levels();

    this.getScores();
    this.setDifficulty();
};

Game.setDifficulty = function () {
    var that = this;
    var layout = this.getDiffLayout();
    var signal = this.resetInput();

    this.canvas.addEventListener("click", function (event) {
        var point = that.getCanvasPoint(event);

        if (point.y >= layout.top && point.y <= layout.top + layout.height) {
            for (var i = 0; i < layout.boxes.length; i++) {
                var box = layout.boxes[i];
                if (point.x >= box.x && point.x <= box.x + box.width) {
                    that.restart(box.level);
                    return;
                }
            }
        } else if (point.y >= layout.scoresTop && point.y <= layout.scoresTop + layout.scoresHeight) {
            if (point.x >= layout.scoresLeft && point.x <= layout.scoresLeft + layout.scoresWidth) {
                that.restart(that.diff_level);
            }
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
    const SCORE_X_1 = 0.05, SCORE_X_2 = 0.5, SCORE_X_3 = 0.8;
    const SCORE_Y = [0.5, 0.65, 0.8];

    if (!data) {
        return;
    }

    this.ctx.fillText(HIGH_SCORES_TEXT + this.diff_level, this.canvas.width * HIGH_SCORE_BEGIN_X, this.canvas.height * HIGH_SCORE_BEGIN_Y);

    for (var i = 0; i < 3; i++) {
        if (data.length > i) {
            this.ctx.fillText(data[i]["score_day"], this.canvas.width * SCORE_X_1, this.canvas.height * SCORE_Y[i]);
            this.ctx.fillText(data[i]["name"], this.canvas.width * SCORE_X_2, this.canvas.height * SCORE_Y[i]);
            this.ctx.fillText(data[i]["score"], this.canvas.width * SCORE_X_3, this.canvas.height * SCORE_Y[i]);
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
        setTimeout(function () {
            that.setDifficulty();
            that.showscores = true;
        }, 5000);
    }
    if (this.end_time) {
        if (this.balloons.length == 0) {
            this.updateGradient();
        }
        this.ctx.fillText("Game Over. Score: " + this.balloons_caught + ", Time: " + this.end_time, this.canvas.width * START_TEXT_INTRO_X, this.canvas.height * START_TEXT_INTRO_Y);
        this.draw_diff_levels();
        if (this.showscores) {
            this.getScores();
        }
    }
};

Game.draw_diff_levels = function () {
    var layout = this.getDiffLayout();

    this.ctx.fillText(DIFF_TOTAL, this.canvas.width * START_TEXT_BEGIN_X, this.canvas.height * START_TEXT_BEGIN_Y);

    this.ctx.save();
    this.ctx.lineWidth = 3 * this.ratio;
    this.ctx.setLineDash([15, 3, 3, 3]);

    for (var i = 0; i < layout.boxes.length; i++) {
        var box = layout.boxes[i];
        this.ctx.beginPath();
        this.ctx.rect(box.x, layout.top, box.width, layout.height);
        this.ctx.stroke();
    }

    this.ctx.restore();
};

Game.randomBalloon = function () {
    var max_width = this.canvas.width;
    var max_height = this.canvas.height;
    var xcoord = (Math.floor(Math.random() * (max_width * 0.9)) + max_width * 0.05);
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
        this.ctx.fillText(this.balloons_caught + "/" + this.lostBalloons, this.canvas.width * 0.1, this.canvas.height * 0.1);
        this.time_to_show = ((Date.now() - this.start) / 1000).toFixed(2);
        this.ctx.fillText(this.diff_level, this.canvas.width * 0.45, this.canvas.height * 0.1);
        this.ctx.fillText(this.time_to_show, this.canvas.width * 0.8, this.canvas.height * 0.1);
    }
};

Game.clear = function () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
