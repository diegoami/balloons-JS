import assert from 'node:assert/strict';

export async function playfieldTests(t, newGame) {
  await t('the HUD has readable separate stats and compact controls in its own strip', async () => {
    for (const [width, height] of [[320, 240], [320, 480], [480, 320], [480, 720], [640, 480], [1280, 720], [1920, 400]]) {
      const dpr = width === 480 && height === 720 ? 2 : width === 640 ? 3 : 1;
      const { context, page, errors } = await newGame({ width, height, dpr });
      const results = await page.evaluate(() => {
        Game.stopLoop();
        Game.entities = [];
        Game.score = 1000000;
        Game.allowance = 9;
        Game.livesLost = 0;
        Game.ticks = 30 * 99999;
        const results = [];
        for (const level of [1, 8, 14, 20]) {
          Game.applyLevel(level);
          const ctx = Game.ctx;
          const hud = Game.layout.hud;
          const field = Game.layout.playfield;
          if (!field) return [{ missing: true }];
          const boxes = [];
          const fillText = ctx.fillText;
          const icon = Icons.draw;
          const pause = Paint.pauseButton;
          const quit = Paint.quitButton;
          ctx.fillText = function (text, x, y) {
            const m = this.measureText(text);
            boxes.push({ label: text, x, y: y - m.actualBoundingBoxAscent,
              width: m.width, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent });
            return fillText.apply(this, arguments);
          };
          Icons.draw = function (game, kind, x, y, size) {
            boxes.push({ label: kind, x: x - size, y: y - size, width: size * 2, height: size * 2 });
            return icon.apply(this, arguments);
          };
          Paint.pauseButton = Paint.quitButton = () => {};
          let stats;
          try {
            Paint.sky(Game);
            Paint.hud(Game);
            stats = ctx.getImageData(0, 0, Game.canvas.width, Game.canvas.height).data;
          } finally {
            ctx.fillText = fillText;
            Icons.draw = icon;
            Paint.pauseButton = pause;
            Paint.quitButton = quit;
          }
          Paint.sky(Game);
          Paint.hudGround(Game);
          const ground = ctx.getImageData(0, 0, Game.canvas.width, Game.canvas.height).data;
          let statsInControls = 0;
          const visibleControls = [];
          for (const [box, draw] of [[hud.pause, pause], [hud.quit, quit]]) {
            for (let y = Math.ceil(box.y * Game.dpr); y < (box.y + box.height) * Game.dpr; y++) {
              for (let x = Math.ceil(box.x * Game.dpr); x < (box.x + box.width) * Game.dpr; x++) {
                const i = (y * Game.canvas.width + x) * 4;
                if (stats[i] !== ground[i] || stats[i + 1] !== ground[i + 1] || stats[i + 2] !== ground[i + 2]) statsInControls++;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = box.width; canvas.height = box.height;
            const testCtx = canvas.getContext('2d');
            testCtx.translate(-box.x, -box.y);
            Game.ctx = testCtx;
            try { draw(Game); } finally { Game.ctx = ctx; }
            const pixels = testCtx.getImageData(0, 0, canvas.width, canvas.height).data;
            const xs = [], ys = [];
            for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
              if (pixels[(y * canvas.width + x) * 4 + 3]) { xs.push(x); ys.push(y); }
            }
            visibleControls.push({ width: Math.max(...xs) - Math.min(...xs) + 1,
              height: Math.max(...ys) - Math.min(...ys) + 1 });
          }
          const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
            a.y < b.y + b.height && a.y + a.height > b.y;
          results.push({ field, boxes, controls: [hud.pause, hud.quit], statsInControls, visibleControls,
            overlaps: boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => overlap(a, b)).map(b => [a.label, b.label])) });
        }
        return results;
      });
      for (const result of results) {
        assert.ok(!result.missing, 'the playable sky has no separate boundary');
        assert.ok(result.field.y > 0 && result.field.y <= 64, 'the strip takes too much playing space');
        assert.equal(result.field.y + result.field.height, height, 'the playable sky does not fill the space below the strip');
        assert.equal(result.statsInControls, 0, `HUD text/lives paint inside a control at ${width}x${height}`);
        assert.deepEqual(result.overlaps, [], `HUD stats overlap at ${width}x${height}`);
        for (const box of result.boxes) {
          assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height < result.field.y,
            `${box.label} clips or enters the playing area at ${width}x${height}`);
        }
        for (const box of result.controls) {
          assert.ok(box.width >= 44 && box.height >= 44, 'control is too hard to tap');
          assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= result.field.y,
            'a control steals part of the playfield');
        }
        for (const painted of result.visibleControls) {
          assert.ok(painted.width > 0 && painted.width <= 32 && painted.height > 0 && painted.height <= 32,
            `a control still looks oversized: ${JSON.stringify(painted)}`);
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  });

  await t('the playfield clips balloons at its edge and boundary taps miss the controls', async () => {
    const { context, page, errors } = await newGame({ width: 480, height: 720 });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => Game.screen === 'playing');
    const scene = await page.evaluate(() => {
      Game.stopLoop();
      // The fallback lets the old-candidate comparison test actual pixels,
      // rather than stopping solely at its missing playfield metadata.
      const edge = Game.layout.playfield?.y || 64;
      const b = Game.randomBalloon();
      b.xcoord = Game.layout.hud.pause.x + Game.layout.hud.pause.width / 2;
      b.ycoord = edge - 8;
      Game.entities = [b];
      Game.ctx.fillStyle = '#123456';
      Game.ctx.fillRect(0, 0, Game.width, Game.height);
      Paint.entities(Game);
      const countInk = (y, height) => {
        const pixels = Game.ctx.getImageData(0, y, Game.width, height).data;
        let changed = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] !== 18 || pixels[i + 1] !== 52 || pixels[i + 2] !== 86) changed++;
        }
        return changed;
      };
      const headerInk = countInk(0, edge);
      const visibleInk = countInk(edge, 80);
      b.ycoord = edge + 12;
      Game.paint();
      return { headerInk, visibleInk, x: b.xcoord, y: b.ycoord, score: Game.score, pauses: Game.pausesLeft };
    });
    assert.equal(scene.headerInk, 0, 'balloon pixels enter the information/control strip');
    assert.ok(scene.visibleInk > 20, 'the balloon vanishes before the visible escape edge');
    await page.mouse.click(scene.x, scene.y);
    const after = await page.evaluate(() => ({ score: Game.score, pauses: Game.pausesLeft, screen: Game.screen }));
    assert.ok(after.score > scene.score, 'the visible balloon at the escape edge cannot be popped');
    assert.equal(after.pauses, scene.pauses, 'a balloon tap spent a pause');
    assert.equal(after.screen, 'playing', 'a balloon tap opened a control');
    assert.deepEqual(errors, []);
    await context.close();
  });

  await t('the HUD strip never pops a hidden balloon or costs a life', async () => {
    const { context, page, errors } = await newGame({ width: 480, height: 720 });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => Game.screen === 'playing');
    await page.evaluate(() => {
      Game.stopLoop();
      Game.entities = [birdConstructor(70, 20, 14, 0, true)];
    });
    await page.mouse.click(70, 20);
    assert.equal(await page.evaluate(() => Game.livesLost), 0, 'an information-strip tap hit a bird');
    await page.evaluate(() => {
      const b = Game.randomBalloon();
      b.xcoord = 100; b.ycoord = 20;
      Game.entities = [b];
    });
    await page.mouse.click(100, 20);
    assert.equal(await page.evaluate(() => Game.score), 0, 'an information-strip tap popped a hidden balloon');
    const buttons = await page.evaluate(() => ({ pause: Game.layout.hud.pause, quit: Game.layout.hud.quit }));
    await page.mouse.click(buttons.pause.x + 22, buttons.pause.y + 22);
    assert.equal(await page.evaluate(() => Game.screen), 'paused', 'the separate pause control stopped working');
    await page.evaluate(() => Game.enter('playing'));
    await page.mouse.click(buttons.quit.x + 22, buttons.quit.y + 22);
    assert.equal(await page.evaluate(() => Game.screen), 'confirmQuit', 'the separate quit control stopped asking');
    assert.deepEqual(errors, []);
    await context.close();
  });

  await t('the reserved strip preserves balloon crossing time and progress on rotation', async () => {
    for (const [width, height] of [[320, 240], [480, 720], [640, 480], [1280, 720]]) {
      const { context, page } = await newGame({ width, height });
      const results = await page.evaluate(() => {
        Game.stopLoop();
        Game.applyLevel(1);
        const random = Math.random;
        const results = [];
        try {
          for (const value of [0.05, 0.25, 0.5, 0.75, 0.95]) {
            Math.random = () => value;
            const b = Game.randomBalloon();
            const edge = Game.layout.playfield?.y || 64;
            const oldDelta = Game.rung().speed * (BALLOON_SLOWEST + (1 - BALLOON_SLOWEST) * value) * Game.height / REFERENCE_HEIGHT;
            const expected = Math.ceil((Game.height - ESCAPE_COORDS) / oldDelta);
            let steps = 0;
            while (!b.gone(Game) && steps < 10000) { b.step(Game, false); steps++; }
            results.push({ expected, steps, escapedY: b.ycoord, edge, delta: b.delta, margin: ESCAPE_COORDS });
          }
        } finally { Math.random = random; }
        Game.applyLevel(20);
        let fading;
        for (let i = 0; i < 6000 && !fading; i++) {
          const b = Game.randomBalloon();
          if (b.fading) fading = b;
        }
        if (!fading) throw new Error('could not construct a fading balloon');
        const field = Game.layout.playfield || { y: 64, height: Game.height - 64 };
        fading.ycoord = field.y + field.height * 0.2;
        const bird = birdConstructor(Game.width * 0.4, field.y + field.height * 0.5, 14, 1, true);
        const fly = fireflyConstructor(Game.width * 0.6, field.y + field.height * 0.5, 6, 2,
          Game.width, Game.height, field.y);
        const boss = bossConstructor(Game.width * 0.5, field.y + field.height * 0.5, 18, Game.width, 2, field.y);
        Game.entities = [];
        [fading, bird, fly, boss].forEach(e => Game.add(e));
        window.playfieldBefore = { progress: (Game.height - fading.ycoord) / field.height, alpha: fading.alpha() };
        window.playfieldBirdProgress = (bird.ycoord - field.y) / field.height;
        return results;
      });
      for (const result of results) {
        assert.ok(Math.abs(result.steps - result.expected) <= 1,
          `the strip changes time to escape at ${width}x${height}: ${JSON.stringify(result)}`);
        assert.ok(result.escapedY <= result.edge + result.margin && result.escapedY > result.edge + result.margin - Math.abs(result.delta) - 1e-9,
          'the balloon still escapes at the top of the whole screen');
      }
      await page.setViewportSize({ width: height, height: width });
      await page.waitForFunction(([w, h]) => Game.width === w && Game.height === h && !Game.resizePending, [height, width]);
      const rotation = await page.evaluate(() => {
        const field = Game.layout.playfield;
        const b = Game.entities.find(e => e.kind === 'balloon');
        const bird = Game.entities.find(e => e.kind === 'bird');
        const fly = Game.entities.find(e => e.kind === 'firefly');
        const boss = Game.entities.find(e => e.kind === 'boss');
        const birdBase = field.y + window.playfieldBirdProgress * field.height;
        bird.step(Game, false);
        let flyInField = true;
        for (let i = 0; i < 1000; i++) {
          fly.step(Game, false);
          flyInField &&= fly.ycoord >= field.y + fly.radius * FIREFLY_GLOW && fly.ycoord <= Game.height - fly.radius * FIREFLY_GLOW;
        }
        let bossInField = true;
        for (let i = 0; i < 60; i++) {
          boss.step(Game, false);
          bossInField &&= boss.ycoord - boss.radius * RING_RADII >= field.y - 1e-9;
        }
        return { before: window.playfieldBefore, progress: (Game.height - b.ycoord) / field.height, alpha: b.alpha(),
          birdShift: Math.abs(bird.ycoord - birdBase), birdBob: bird.radius * BIRD_BOB, flyInField, bossInField };
      });
      assert.ok(Math.abs(rotation.progress - rotation.before.progress) < 1e-9, 'rotation jumps the balloon through the playfield');
      assert.ok(Math.abs(rotation.alpha - rotation.before.alpha) < 1e-9, 'rotation changes the balloon fading progress');
      assert.ok(rotation.birdShift <= rotation.birdBob + 1e-9, 'the bird jumps back to its old flight band after rotation');
      assert.ok(rotation.flyInField, 'a firefly wanders into the header after rotation');
      assert.ok(rotation.bossInField, 'a saucer fuse enters the header after rotation');
      await context.close();
    }
  });
}
