var ESCAPE_COORDS = -10;

var balloonConstructor = function(xcoord, ycoord, size, color, xmax, speed) {
    var that;
    that = {};
    that.xcoord = xcoord ;
    that.ycoord = ycoord ;
    that.size = size;
    that.color = color;
    that.delta = -1 * ((Math.random()*speed)+0.25);
    that.xdelta = -.5+ Math.random();
    that.xmax = xmax;

    that.tick = function(accelerate) {
        if (accelerate) {
            that.delta *= 1.01
        }
        that.ycoord = that.ycoord +that.delta;
        that.xcoord = that.xcoord +that.xdelta;
        if (that.xcoord < 0) {
            that.xdelta = -that.xdelta;
        }
        if (that.xcoord > that.xmax) {
            that.xdelta = -that.xdelta;
        }
    };

    that.draw = function() {
        if (this.ycoord > ESCAPE_COORDS) {
            var balloon = new CANVASBALLOON.Balloon('balloon_canvas', this.xcoord, this.ycoord, this.size, this.color);
            balloon.draw();
        }
    };

    that.collision = function(x,y) {
        var balloon = new CANVASBALLOON.Balloon('balloon_canvas', this.xcoord, this.ycoord, this.size, this.color);
        return balloon.check_hit(x,y)
    };
    return that;
};