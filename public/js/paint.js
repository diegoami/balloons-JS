/**
 * Everything the game draws.
 *
 * These were methods on Game, which meant the object that owned the loop, the
 * canvas, the balloons and the score client owned the drawing as well. A screen
 * (screens.js) says what to paint and in what order; this says what each of
 * those things looks like. Nothing here decides anything: every routine takes
 * the game, reads the layout and the palette, and draws.
 */

"use strict";
var Paint = {};

/** The backdrop, from the cache Sky keeps per size and time of day. */
Paint.sky = function (game) {
    var sky = Sky.render(game.width, game.height, game.dpr, game.level);
    game.ctx.drawImage(sky, 0, 0, game.width, game.height);
};

/**
 * The ground the text block stands on.
 *
 * White text over a daytime sky is legible at the top, where the sky is deep
 * blue, and invisible at the bottom, where it is nearly white: the leaderboard
 * was landing at 1.4:1 against the horizon. The sky's own scrim was made for a
 * composition that lived in the top half of the screen. This is the same idea
 * sized to what is actually drawn.
 */
Paint.panel = function (game, box) {
    box = box || game.layout.panel;
    var ctx = game.ctx;

    // It fades in rather than sitting there as a card, because the sky it has
    // to compensate for is not uniform: every palette runs deep at the top and
    // bright along the horizon, so the ground the text needs is all at the
    // bottom. The top of the sky is left as it is.
    var bottom = box.y + box.height;
    var ground = ctx.createLinearGradient(0, 0, 0, bottom);
    ground.addColorStop(0, Sky.transparent(game.palette.panel));
    ground.addColorStop(box.y / bottom, Sky.transparent(game.palette.panel));
    ground.addColorStop(0.42, game.palette.panel);
    ground.addColorStop(0.9, game.palette.panel);
    ground.addColorStop(1, Sky.transparent(game.palette.panel));

    // Full width and no edges: a card inset from a composition that already
    // fills the screen leaves a sliver of sky around it that reads as a
    // mistake. This reads as the sky being deeper where the writing is.
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, game.width, bottom);
};

/** The one headline line, shared by the title and game-over screens. */
Paint.intro = function (game, text) {
    game.ctx.font = game.layout.fonts.intro;
    game.ctx.fillStyle = game.palette.ink;
    game.ctx.fillText(text, game.layout.intro.x, game.layout.intro.y);
    game.ctx.font = game.layout.fonts.menu;
};

/**
 * Draws the menu button in whichever of its states it is in.
 *
 * A button used to look identical whether or not pressing it would do
 * anything: after a game ended the menu was repainted every frame for five
 * seconds while no input was bound at all.
 */
Paint.menu = function (game) {
    var ctx = game.ctx;
    var palette = game.palette;
    var buttons = game.layout.menu.buttons;
    var live = game.isMenuLive();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = game.layout.fonts.menu;
    ctx.lineWidth = Math.max(1, game.layout.line * 0.06);

    for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        // There is one button and it is the thing to press, so it is drawn the
        // way the selected difficulty used to be.
        var selected = true;
        var pressed = live && button.id === game.pressed;

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

    ctx.font = game.layout.fonts.label;
    ctx.fillStyle = live ? palette.inkSoft : palette.inkDisabled;
    ctx.fillText(
        live ? Layout.START_TEXT : "Hold on...",
        game.layout.hint.x,
        game.layout.hint.y
    );
};

/**
 * What the game is, in two lines, where the Play button used to be.
 *
 * The footage behind this shows how the game moves; these say what a run is,
 * which is the one thing watching it cannot tell you.
 */
Paint.description = function (game) {
    var ctx = game.ctx;
    ctx.font = game.layout.fonts.label;
    ctx.fillStyle = game.palette.inkSoft;
    // Each line carries its own words: after wrapping there is no longer one
    // line per sentence in Layout.DESCRIPTION to index into.
    game.layout.description.forEach(function (line) {
        ctx.fillText(line.text, line.x, line.y);
    });
};

/** How a row says where it got to: won, a level, or nothing recorded. */
Paint.reached = function (row) {
    var got = row["won"] ? "WON" : (row["level"] ? "L" + row["level"] : "\u2014");
    var pointer = row["pointer"];

    // Only when it is not a mouse.
    //
    // A fifth column would not fit a phone, and a marker on every row would be
    // noise. One pointer at about 2.1 taps a second is what the ladder is
    // calibrated against, so a mouse is the baseline and needs no label; two
    // thumbs is the thing worth flagging. Same rule as the practice warning:
    // say it when it applies and stay quiet when it does not.
    if (pointer === "touch" || pointer === "mixed") {
        return got + " " + pointer;
    }
    return got;
};

/** The board, if one has arrived. Nothing is drawn before then. */
Paint.scores = function (game) {
    var scores = game.layout.scores;
    var data = Scores.board;

    if (!data) {
        return;
    }

    game.ctx.font = game.layout.fonts.label;
    game.ctx.fillStyle = game.palette.inkSoft;
    game.ctx.fillText(Layout.HIGH_SCORES_TEXT, scores.heading.x, scores.heading.y);

    game.ctx.font = game.layout.fonts.score;
    for (var i = 0; i < scores.rows.length; i++) {
        if (data.length > i) {
            game.ctx.fillStyle = game.palette.inkSoft;
            game.ctx.fillText(data[i]["score_day"], scores.columns.date, scores.rows[i]);
            game.ctx.fillStyle = game.palette.ink;
            game.ctx.fillText(data[i]["name"], scores.columns.name, scores.rows[i]);

            // How far up the ladder that score got. Rows already on the board
            // were set before this was recorded, so they get a dash: a missing
            // fact is not a level of nothing.
            game.ctx.fillStyle = data[i]["won"] ? game.palette.accent : game.palette.inkSoft;
            game.ctx.fillText(
                Paint.reached(data[i]),
                scores.columns.level,
                scores.rows[i]
            );

            game.ctx.fillStyle = game.palette.accent;
            game.ctx.fillText(data[i]["score"], scores.columns.value, scores.rows[i]);
        }
    }
    game.ctx.font = game.layout.fonts.menu;
};

/**
 * A screen that interrupts play: the break between levels, or a tab that was
 * backgrounded and has come back.
 *
 * A label, a headline, a line or two under it, and one button over a sky
 * frozen exactly where it was. It had a second user — the break between
 * levels — which drew a bar showing the wait draining. The break is gone, so
 * the bar and the parameter that fed it are too.
 */
Paint.interlude = function (game, label, headline, lines) {
    var ctx = game.ctx;
    var palette = game.palette;
    var L = game.layout;

    ctx.font = L.fonts.label;
    ctx.fillStyle = palette.inkSoft;
    ctx.fillText(label, L.intro.x, L.intro.y);

    ctx.font = L.fonts.intro;
    ctx.fillStyle = palette.ink;
    ctx.fillText(headline, L.intro.x, L.intro.y + L.line * 1.5);

    ctx.font = L.fonts.label;
    lines.forEach(function (line, i) {
        if (!line || !L.description[i]) {
            return;
        }
        ctx.fillStyle = i === 0 ? palette.inkSoft : palette.accent;
        ctx.fillText(line, L.description[i].x, L.description[i].y);
    });

    var button = L.resume;
    var pressed = game.pressed === "resume";

    ctx.save();
    ctx.lineWidth = Math.max(1, L.line * 0.06);
    ctx.fillStyle = pressed ? palette.buttonPressOverlay : palette.buttonFill;
    ctx.strokeStyle = palette.buttonBorder;
    Layout.roundedRect(ctx, button, button.radius);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = L.fonts.menu;
    ctx.fillStyle = palette.ink;
    ctx.fillText(button.label, button.x + button.width / 2, button.y + button.height / 2);
    ctx.restore();

};

/**
 * A tab that was away and has come back.
 *
 * Backgrounding a tab already stopped the game: requestAnimationFrame stops
 * firing, and because time played is counted in simulation steps the clock and
 * the level stop with it. What it did NOT do was say so — the game restarted
 * the instant the tab was focused, so you could come back to balloons already
 * escaping before you had registered that it was live. This is that behaviour
 * made honest rather than a new feature.
 */
Paint.paused = function (game) {
    Paint.interlude(
        game,
        "LEVEL " + game.level,
        Layout.PAUSED_TEXT,
        [Layout.PAUSED_HINT, ""]
    );
};

Paint.countdown = function (game, remaining) {
    var ctx = game.ctx;

    ctx.save();
    ctx.textAlign = "center";

    // The game has never told anyone what to do. This is the one line it gets,
    // and the countdown is when a new player is looking at nothing else.
    ctx.font = game.layout.fonts.label;
    ctx.fillStyle = game.palette.inkSoft;
    ctx.fillText(
        Layout.PLAY_INSTRUCTION,
        game.layout.countdown.x,
        game.layout.countdown.y - game.layout.line * 1.5
    );

    ctx.font = game.layout.fonts.countdown;
    ctx.fillStyle = game.palette.accent;
    ctx.fillText(
        String(Math.ceil(Math.max(remaining, 0) / 1000)),
        game.layout.countdown.x,
        game.layout.countdown.y
    );

    ctx.restore();
};

/**
 * The name line along the bottom: who the score will be posted as, and the way
 * in to changing it. Underlined because it is the only text on the screen you
 * can tap that is not obviously a button.
 */
/**
 * The level chip, and the warning that comes with it.
 *
 * The warning is only drawn when it applies, and in the accent rather than the
 * soft ink: "this will not be saved" is the one thing on this screen a player
 * must not skim past.
 */
Paint.startLevel = function (game) {
    var rect = game.layout.start;
    var ctx = game.ctx;
    var live = game.isMenuLive();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = game.layout.fonts.label;

    Layout.roundedRect(ctx, rect, rect.radius);
    ctx.fillStyle = game.palette.panel;
    ctx.fill();

    if (live && game.pressed === "start") {
        ctx.fillStyle = game.palette.buttonPressOverlay;
        ctx.fill();
    }

    ctx.fillStyle = live
        ? (game.isPractice() ? game.palette.accent : game.palette.ink)
        : game.palette.inkDisabled;
    ctx.fillText(rect.label, rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.restore();

    if (!game.isPractice()) {
        return;
    }

    ctx.font = game.layout.fonts.label;
    ctx.fillStyle = game.palette.accent;
    ctx.fillText(
        Layout.PRACTICE_WARNING,
        game.layout.practice.x,
        game.layout.practice.y
    );
};

Paint.player = function (game) {
    var rect = game.layout.player;
    var ctx = game.ctx;
    var live = game.isMenuLive();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = game.layout.fonts.label;

    // The sky is at its brightest along the bottom edge, so the chip carries
    // the same scrim the sky uses behind its own text rather than trusting
    // pale ink to hold up over a lit horizon.
    Layout.roundedRect(ctx, rect, rect.radius);
    ctx.fillStyle = game.palette.panel;
    ctx.fill();

    if (live && game.pressed === "player") {
        ctx.fillStyle = game.palette.buttonPressOverlay;
        ctx.fill();
    }

    ctx.fillStyle = live ? game.palette.ink : game.palette.inkDisabled;
    ctx.fillText(
        Layout.PLAYER_PREFIX + game.name,
        rect.x + rect.width / 2,
        rect.y + rect.height / 2
    );
    ctx.restore();
};

/** The name screen: a heading, the field's Save button, and how to get out. */
Paint.nameScreen = function (game) {
    var ctx = game.ctx;
    var save = game.layout.name.save;

    Paint.intro(game, Layout.NAME_TEXT);

    // The field is an element rather than something drawn, but it is part of
    // this picture, so it is placed on the same beat as everything else: a
    // resize or a rotation moves it with the rest of the screen.
    NameField.place(game);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = game.layout.fonts.menu;
    ctx.lineWidth = Math.max(1, game.layout.line * 0.06);

    Layout.roundedRect(ctx, save, save.radius);
    ctx.fillStyle = game.pressed === "save" ? game.palette.buttonFill : game.palette.accent;
    ctx.fill();
    ctx.fillStyle = game.palette.onAccent;
    ctx.fillText(save.label, save.x + save.width / 2, save.y + save.height / 2);
    ctx.restore();

    ctx.font = game.layout.fonts.label;
    ctx.fillStyle = game.palette.inkSoft;
    ctx.fillText(Layout.NAME_HINT, game.layout.hint.x, game.layout.hint.y);
};

/** Everything in the sky, in the order the list keeps: lowest layer first. */
Paint.entities = function (game) {
    for (var i = 0; i < game.entities.length; i++) {
        game.entities[i].draw(game);
    }
};

/**
 * The score, the level and the clock, each on a ground of its own.
 *
 * Measured rather than eyeballed: the clock is drawn in the accent colour,
 * which came out at 3.2:1 against a bright morning sky. Everything else in the
 * game got a ground; so does this.
 *
 * What it does NOT get is a ground across the whole width. The HUD is drawn
 * over the play area, so a bar of scrim along the top of the screen is a lid
 * over the top of the game: balloons rose behind it at about 1.4:1 against the
 * sky and escaped through a strip nobody could see into. Three chips the size
 * of the words leave the rest of the row as clear sky.
 */
Paint.hudRuns = function (game) {
    return [
        { text: game.score + " points, " + game.livesLost + " of " +
            game.allowance + " lost", x: game.layout.hud.caught,
          ink: game.palette.ink },
        { text: "LEVEL " + game.level, x: game.layout.hud.level,
          ink: game.palette.inkSoft },
        { text: game.elapsed() + "s", x: game.layout.hud.time,
          ink: game.palette.accent }
    ];
};

/**
 * The chips the HUD text stands on, and nothing else.
 *
 * Its own routine so the contrast test can measure the ground the game really
 * draws rather than a copy of it kept in step by hand — the old test rebuilt
 * the band itself, which is a test of the test.
 */
Paint.hudGround = function (game) {
    var plate = game.layout.hud.plate;
    var ctx = game.ctx;
    var grounds = [];

    ctx.font = game.layout.fonts.hud;

    // Chips that touch become one chip. On a narrow screen the three runs
    // crowd together, and three overlapping rounded rectangles read as a
    // mistake where one bar reads as a decision — so a phone gets the old bar
    // back, arrived at rather than special-cased.
    Paint.hudRuns(game).forEach(function (run) {
        var box = {
            x: run.x - plate.padX,
            y: plate.y,
            width: ctx.measureText(run.text).width + plate.padX * 2,
            height: plate.height
        };
        var last = grounds[grounds.length - 1];
        if (last && box.x <= last.x + last.width + plate.padX) {
            last.width = Math.max(last.x + last.width, box.x + box.width) - last.x;
            return;
        }
        grounds.push(box);
    });

    ctx.fillStyle = game.palette.panel;
    grounds.forEach(function (box) {
        Layout.roundedRect(ctx, box, plate.radius);
        ctx.fill();
    });

    return grounds;
};

Paint.hud = function (game) {
    Paint.hudGround(game);

    var ctx = game.ctx;
    ctx.font = game.layout.fonts.hud;
    Paint.hudRuns(game).forEach(function (run) {
        ctx.fillStyle = run.ink;
        ctx.fillText(run.text, run.x, game.layout.hud.y);
    });
};
