/**
 * The name field: the one piece of the game that is a DOM element rather than
 * something drawn.
 *
 * A canvas cannot raise a phone's keyboard, and reimplementing a caret,
 * selection, paste, IME and autofill on top of keydown would be worse at all
 * of them than the element the platform already provides. So the field is a
 * real input, positioned from the same layout the canvas draws with and
 * coloured from the sky's palette, and this is everything that knows about it.
 */

var NameField = {};

/** The element lives in the page, so the game only has to find it. */
NameField.find = function () {
    NameField.element = document.getElementById("player_name");
};

/**
 * Puts the input where the layout says the field is, in the palette's colours.
 * Done on every paint, so a resize or a rotation moves it with everything else.
 */
NameField.place = function (game) {
    var field = game.layout.name.field;
    var style = NameField.element.style;

    style.left = field.x + "px";
    style.top = field.y + "px";
    style.width = field.width + "px";
    style.height = field.height + "px";
    style.padding = "0 " + Math.round(game.layout.line * 0.4) + "px";
    style.borderRadius = game.layout.name.save.radius + "px";
    style.font = game.layout.fonts.menu;
    style.background = game.palette.buttonFill;
    style.borderColor = game.palette.buttonBorder;
    style.color = game.palette.ink;
    style.caretColor = game.palette.accent;
};

NameField.show = function (game, value) {
    NameField.element.hidden = false;
    NameField.element.value = value;
    NameField.place(game);

    // Entered by a tap, so this call is still inside that gesture and a phone
    // will raise its keyboard. select() means the first keystroke replaces the
    // old name rather than appending to it.
    NameField.element.focus();
    NameField.element.select();
};

NameField.hide = function () {
    NameField.element.blur();
    NameField.element.hidden = true;
};
