// Start the site, then run: STORY_PREVIEW_URL=http://127.0.0.1:4207 node tools/verification/public-story.browser.cjs
// Browser artifacts go to the ignored test-results/public-story directory.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const base = process.env.STORY_PREVIEW_URL || 'http://127.0.0.1:4202';
const artifacts = path.resolve(__dirname, '../../test-results/public-story');
fs.mkdirSync(artifacts, { recursive: true });
const pause = page => page.waitForTimeout(100);
const stageProgress = page =>
  page.locator('#tree-stage').getAttribute('data-progress').then(Number);
async function top(page) {
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await pause(page);
}
// Find the actual scroll state; no renderer timing formula is duplicated in this check.
async function atProgress(page, target) {
  let lo = 0,
    hi = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let i = 0; i < 10; i++) {
    const y = (lo + hi) / 2;
    await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), y);
    await pause(page);
    const value = await stageProgress(page);
    if (value >= target) hi = y;
    else lo = y;
  }
  await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), hi);
  await page.waitForTimeout(250);
  return stageProgress(page);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      const stats = (window.__graphics = {
        frames: 0,
        draws: 0,
        programs: 0,
        deleted: 0,
        rootMatrix: [],
        bodyMatrix: [],
        time: 0,
      });
      const locations = new WeakMap();
      const track = (name, handler) => {
        const original = WebGLRenderingContext.prototype[name];
        WebGLRenderingContext.prototype[name] = function (...args) {
          if (this.canvas.id === 'seed-canvas') handler(...args);
          return original.apply(this, args);
        };
      };
      const location = WebGLRenderingContext.prototype.getUniformLocation;
      WebGLRenderingContext.prototype.getUniformLocation = function (program, name) {
        const value = location.call(this, program, name);
        if (value) locations.set(value, name);
        return value;
      };
      let matrix = 0;
      track('clear', mask => {
        if (mask & 0x4000) {
          stats.frames++;
          matrix = 0;
        }
      });
      track('drawElements', () => stats.draws++);
      track('createProgram', () => stats.programs++);
      track('deleteBuffer', () => stats.deleted++);
      track('uniform1f', (location, value) => {
        if (locations.get(location) === 'uTime') stats.time = value;
      });
      track('uniformMatrix4fv', (location, transpose, value) => {
        if (locations.get(location) === 'uMatrix') {
          stats[matrix++ ? 'bodyMatrix' : 'rootMatrix'] = [...value];
        }
      });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/story`);
    await page.waitForSelector('#contribution-tree');
    assert.equal(await page.title(), 'Our story | Dukarun');
    assert.equal(await page.locator('.leaf-node').count(), 20);
    assert.equal(await page.locator('.leaf-node circle').count(), 20);
    assert.equal(await page.locator('#voice-select option').count(), 20);
    assert.equal(await page.locator('.leaf-account').count(), 1);
    assert.equal(await page.locator('dialog,.chapter,br').count(), 0);
    assert.equal(await page.locator('.branch-solid').count(), 20);
    const delivery = await page.evaluate(() => {
      const packet = document.querySelector('[data-source-leaf="cashier-1"]');
      const animation = packet.getAnimations()[0],
        timing = animation.effect.getTiming();
      animation.pause();
      const cycle = Math.ceil(-timing.delay / timing.duration);
      const sample = progress => {
        animation.currentTime = timing.delay + timing.duration * (cycle + progress);
        const offset = parseFloat(getComputedStyle(packet).strokeDashoffset);
        const p = packet.getPointAtLength(Math.max(0, -offset) * packet.getTotalLength());
        return { offset, distance: Math.hypot(p.x - 400, p.y - 650) };
      };
      const result = { early: sample(0.15), late: sample(0.8) };
      animation.play();
      return result;
    });
    assert.ok(
      delivery.late.offset < delivery.early.offset &&
        delivery.late.distance < delivery.early.distance - 100,
      'Feedback must travel from the leaf into the block'
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const options = await page
      .locator('#voice-select option')
      .evaluateAll(items => items.map(item => item.value));
    for (const id of options) {
      await page.selectOption('#voice-select', id);
      await pause(page);
      assert.equal(await page.locator('.leaf-account').count(), 1);
      assert.equal(
        await page.locator('.leaf-node[aria-pressed="true"]').getAttribute('data-leaf-id'),
        id
      );
      assert.ok((await page.locator('.account-persona').innerText()).length > 4);
    }
    await page.selectOption('#voice-select', 'cashier-1');
    await top(page);
    await page.locator('.leaf-node[data-leaf-id="owner-1"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.leaf-account').getAttribute('id'), 'money-record');
    await page.locator('.account-evidence summary').click();
    assert.ok(await page.locator('.account-evidence').evaluate(e => e.open));
    await page.selectOption('#voice-select', 'cashier-1');
    assert.equal(await page.locator('.account-evidence').evaluate(e => e.open), false);
    assert.ok(
      (await page.locator('.leaf-node.is-connected').count()) > 1,
      'Related contributions must be visible together'
    );
    await page.goto(`${base}/story#freedom-to-rebuild`);
    await page.waitForSelector('#contribution-tree');
    assert.equal(await page.locator('#voice-select').inputValue(), 'builder-3');
    await page.selectOption('#voice-select', 'cashier-1');
    // Preserve the same canvas/program through every intermediate phase and back again.
    await top(page);
    const initial = await page.evaluate(() => ({
      width: document.querySelector('#tree-stage').clientWidth,
      height: document.querySelector('#tree-stage').clientHeight,
      programs: __graphics.programs,
    }));
    const states = [];
    for (const [name, target] of [
      ['gathering', 0.28],
      ['organic', 0.56],
      ['rooted', 0.74],
      ['potential', 0.999],
    ]) {
      await atProgress(page, target);
      states.push(
        await page.evaluate(() => ({
          ...document.querySelector('#tree-stage').dataset,
          programs: __graphics.programs,
        }))
      );
      await page.screenshot({ path: path.join(artifacts, `desktop-${name}.png`) });
    }
    assert.ok(
      states.every(state => state.programs === initial.programs),
      'The block and seed must keep the same WebGL object'
    );
    assert.ok(
      states[0].material > 0 &&
        states[0].material < states[1].material &&
        states[2].material === states[3].material
    );
    const expanded = await page
      .locator('#tree-stage')
      .evaluate(e => ({ width: e.clientWidth, height: e.clientHeight }));
    assert.ok(
      expanded.width > initial.width &&
        expanded.width < initial.width * 1.1 &&
        expanded.height > initial.height &&
        expanded.height < initial.height * 1.15,
      'Final viewport expands modestly'
    );
    await top(page);
    assert.equal(await stageProgress(page), 0);
    assert.equal(await page.locator('#tree-stage').getAttribute('data-material'), '0.000');
    assert.equal(await page.locator('.leaf-node[tabindex="0"]').count(), 20);
    await page.screenshot({ path: path.join(artifacts, 'desktop-contributions.png') });
    const layouts = [];
    for (const [width, height] of [
      [1440, 1000],
      [1280, 800],
      [1024, 768],
      [768, 1024],
      [736, 900],
      [390, 844],
      [360, 800],
      [320, 740],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await top(page);
      await page.selectOption('#voice-select', 'cashier-1');
      await pause(page);
      const initial = await page
        .locator('#tree-stage')
        .evaluate(e => e.getBoundingClientRect().toJSON());
      await atProgress(page, 0.999);
      const layout = await page.evaluate(() => {
        const rect = e => {
          const r = e.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        return {
          width: innerWidth,
          height: innerHeight,
          overflow: document.documentElement.scrollWidth > innerWidth,
          phase: document.querySelector('#tree-stage').dataset.phase,
          stage: rect(document.querySelector('#tree-stage')),
          roots: [...document.querySelectorAll('.root-label')].map(rect),
        };
      });
      assert.equal(layout.overflow, false, `${width}px: no horizontal overflow`);
      assert.equal(layout.phase, 'potential');
      layout.roots.forEach((root, i) => {
        assert.ok(
          root.left >= 0 && root.right <= width + 1,
          `${width}px: root ${i} fits horizontally`
        );
        for (let j = 0; j < i; j++) {
          const other = layout.roots[j];
          assert.ok(
            root.right <= other.left + 1 ||
              other.right <= root.left + 1 ||
              root.bottom <= other.top + 1 ||
              other.bottom <= root.top + 1,
            `${width}px: root labels ${i}/${j} overlap`
          );
        }
      });
      if (width <= 760 && height > 600)
        assert.ok(layout.stage.height < height * 0.42, 'Mobile graphic leaves room to read');
      layouts.push({ ...layout, initial });
      if (width === 390) {
        await page.screenshot({ path: path.join(artifacts, 'mobile-potential.png') });
        await top(page);
        await page.screenshot({ path: path.join(artifacts, 'mobile-contributions.png') });
      }
    }
    // Root links return to their real account, with no duplicated popup.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await atProgress(page, 0.999);
    await page.locator('.root-label').first().click();
    await pause(page);
    assert.equal(await page.locator('.leaf-account').getAttribute('id'), 'money-record');
    assert.ok((await stageProgress(page)) < 0.1);
    // End motion: seed spins, roots keep their anchor, then all rendering pauses offscreen.
    await page.selectOption('#voice-select', 'cashier-1');
    await atProgress(page, 0.999);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => ({ ...__graphics }));
    await page.waitForTimeout(1800);
    const after = await page.evaluate(() => ({ ...__graphics }));
    assert.ok(after.frames > before.frames + 5, 'Final scene remains animated');
    assert.notDeepEqual(after.bodyMatrix, before.bodyMatrix, 'Seed body continues to spin');
    assert.deepEqual(
      after.rootMatrix,
      before.rootMatrix,
      'Roots remain anchored while the body spins'
    );
    // The footer can leave part of the scene visible at maximum scroll. Use a
    // short viewport where the hero genuinely places the graphic below the fold.
    await page.setViewportSize({ width: 1440, height: 250 });
    await top(page);
    await page.waitForTimeout(500);
    const offscreen = await page.evaluate(() => __graphics.frames);
    await page.waitForTimeout(400);
    assert.equal(
      await page.evaluate(() => __graphics.frames),
      offscreen,
      'Offscreen rendering stops'
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await atProgress(page, 0.999);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(400);
    const stopped = await page.evaluate(() => __graphics.frames);
    await page.waitForTimeout(400);
    assert.equal(
      await page.evaluate(() => __graphics.frames),
      stopped,
      'Reduced motion stays static'
    );
    await page.locator('.story-breadcrumb').click();
    await page.waitForURL('**/about');
    assert.ok(
      (await page.evaluate(() => __graphics.deleted)) > 50,
      'Route teardown releases mesh buffers'
    );
    const deletedFrames = await page.evaluate(() => __graphics.frames);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => __graphics.frames), deletedFrames);
    const touchContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const touchPage = await touchContext.newPage();
    touchPage.on('pageerror', error => errors.push(error.message));
    await touchPage.goto(`${base}/story`);
    await touchPage.waitForSelector('#contribution-tree');
    for (const id of options) {
      const point = await touchPage.locator(`.leaf-node[data-leaf-id="${id}"]`).evaluate(leaf => {
        const p = new DOMPoint(32, 0).matrixTransform(leaf.getScreenCTM());
        return { x: p.x, y: p.y };
      });
      await touchPage.touchscreen.tap(point.x, point.y);
      assert.equal(
        await touchPage.locator('#voice-select').inputValue(),
        id,
        'Each mobile leaf can be selected by touch'
      );
    }
    const forgivingHit = await touchPage
      .locator('.leaf-node[data-leaf-id="cashier-4"]')
      .evaluate(leaf => {
        const p = new DOMPoint(32, 0).matrixTransform(leaf.getScreenCTM());
        return { x: p.x + 18, y: p.y };
      });
    await touchPage.touchscreen.tap(forgivingHit.x, forgivingHit.y);
    assert.equal(
      await touchPage.locator('#voice-select').inputValue(),
      'cashier-4',
      'Touch targets extend beyond the small drawn leaf'
    );
    await touchContext.close();
    // Verify projection registration and framing against the actual renderer, at several aspect ratios.
    const bundle = esbuild.buildSync({
      entryPoints: [
        path.resolve(
          __dirname,
          '../../apps/site/src/app/marketing/story/rendering/seed-renderer.js'
        ),
      ],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'StoryGraphics',
    }).outputFiles[0].text;
    await page.addScriptTag({ content: bundle });
    const geometry = await page.evaluate(() => {
      const results = [];
      for (const [width, height] of [
        [635, 608],
        [350, 275],
        [280, 245],
      ]) {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `position:fixed;width:${width}px;height:${height}px;left:-2000px`;
        document.body.append(canvas);
        const renderer = new StoryGraphics.SeedRenderer(canvas);
        renderer.render(1, 0, 1, 1);
        const error = Math.max(
          ...renderer.potential.stemSamples.map(pair => {
            const a = renderer.project(pair.germinant),
              b = renderer.projectPotential(pair.silhouette);
            return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
          })
        );
        const points = [
          ...renderer.rootTips.map(p => renderer.project(p)),
          ...renderer.potential.framingPoints.map(p => renderer.projectPotential(p)),
        ];
        results.push({
          width,
          height,
          error,
          inFrame: points.every(p => p.x > 0.03 && p.x < 0.97 && p.y > 0.03 && p.y < 0.97),
          triangles: renderer.meshes.reduce((sum, m) => sum + m.count / 3, 0),
        });
        renderer.destroy();
        canvas.remove();
      }
      return results;
    });
    geometry.forEach(result => {
      assert.ok(result.error < 4, 'Projected lower trunk overlaps the current stem');
      assert.ok(result.inFrame, 'Roots and projected crown stay framed');
      assert.ok(result.triangles < 22000, 'Bounded mesh complexity');
    });
    // WebGL unavailable: the same choices, morph and projected silhouette remain usable.
    const fallbackPage = await context.newPage();
    fallbackPage.on('pageerror', error => errors.push(error.message));
    await fallbackPage.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === 'webgl' ? null : original.call(this, type, ...args);
      };
    });
    await fallbackPage.emulateMedia({ reducedMotion: 'reduce' });
    await fallbackPage.goto(`${base}/story`);
    await fallbackPage.waitForSelector('.fallback-rendering');
    assert.equal(await fallbackPage.locator('.leaf-node').count(), 20);
    await atProgress(fallbackPage, 0.999);
    assert.equal(await fallbackPage.locator('#tree-stage').getAttribute('data-phase'), 'potential');
    assert.equal(await fallbackPage.locator('.fallback-rendering path[d*="NaN"]').count(), 0);
    await fallbackPage.screenshot({ path: path.join(artifacts, 'fallback-potential.png') });
    await fallbackPage.close();
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(artifacts, 'checks.json'),
      JSON.stringify(
        {
          delivery,
          states,
          layouts,
          geometry,
          continuousFrames: after.frames - before.frames,
          errors,
        },
        null,
        2
      )
    );
    console.log(
      JSON.stringify(
        {
          result: 'passed',
          leafSelections: 20,
          viewports: layouts.length,
          projection: geometry,
          continuousFrames: after.frames - before.frames,
          artifacts,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
