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

/** The backdrop, from the cache Sky keeps per size and difficulty. */
Paint.sky = function (game) {
    var sky = Sky.render(game.width, game.height, game.dpr, game.difficulty.level);
    game.ctx.drawImage(sky, 0, 0, game.width, game.height);
};

/** The one headline line, shared by the title and game-over screens. */
Paint.intro = function (game, text) {
    game.ctx.font = game.layout.fonts.intro;
    game.ctx.fillStyle = game.palette.ink;
    game.ctx.fillText(text, game.layout.intro.x, game.layout.intro.y);
    game.ctx.font = game.layout.fonts.menu;
};

/**
 * Draws the difficulty buttons in whichever of four states they are in.
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
        var selected = button.level === game.difficulty.level;
        var pressed = live && button.level === game.pressed;

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
        live ? Layout.HINT_TEXT : "Hold on...",
        game.layout.hint.x,
        game.layout.hint.y
    );
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
    game.ctx.fillText(Layout.HIGH_SCORES_TEXT + game.difficulty.level, scores.heading.x, scores.heading.y);

    game.ctx.font = game.layout.fonts.score;
    for (var i = 0; i < scores.rows.length; i++) {
        if (data.length > i) {
            game.ctx.fillStyle = game.palette.inkSoft;
            game.ctx.fillText(data[i]["score_day"], scores.columns.date, scores.rows[i]);
            game.ctx.fillStyle = game.palette.ink;
            game.ctx.fillText(data[i]["name"], scores.columns.name, scores.rows[i]);
            game.ctx.fillStyle = game.palette.accent;
            game.ctx.fillText(data[i]["score"], scores.columns.value, scores.rows[i]);
        }
    }
    game.ctx.font = game.layout.fonts.menu;
};

Paint.countdown = function (game, remaining) {
    var ctx = game.ctx;

    ctx.save();
    ctx.textAlign = "center";

    ctx.font = game.layout.fonts.label;
    ctx.fillStyle = game.palette.inkSoft;
    ctx.fillText("Get ready", game.layout.countdown.x, game.layout.countdown.y - game.layout.line * 1.5);

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
    ctx.fillStyle = game.palette.scrim;
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

Paint.balloons = function (game) {
    for (var i = 0; i < game.balloons.length; i++) {
        game.balloons[i].draw();
    }
};

Paint.hud = function (game) {
    var hud = game.layout.hud;

    game.ctx.font = game.layout.fonts.hud;
    game.ctx.fillStyle = game.palette.ink;
    game.ctx.fillText(
        game.balloons_caught + " popped, " + game.lostBalloons + " lost",
        hud.caught, hud.y
    );
    game.ctx.fillStyle = game.palette.inkSoft;
    game.ctx.fillText(game.difficulty.name, hud.level, hud.y);
    game.ctx.fillStyle = game.palette.accent;
    game.ctx.fillText(game.elapsed() + "s", hud.time, hud.y);
};
