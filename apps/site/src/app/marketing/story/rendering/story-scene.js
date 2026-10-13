import { SeedRenderer } from './seed-renderer.js';
import { layoutContributions, pathData, sample, ORIGIN, VIEWBOX } from './contribution-layout.js';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};
const svg = (tag, attributes = {}) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
};

/** Angular owns the accounts. This scene owns geometry, selection and a single scroll clock. */
export function createStoryScene(host, config, callbacks) {
  const byId = id => host.querySelector(`#${id}`);
  const stage = byId('tree-stage'),
    canvas = byId('seed-canvas');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 760px)');
  const abort = new AbortController();
  const listen = (target, name, handler, options = {}) =>
    target.addEventListener(name, handler, { ...options, signal: abort.signal });
  const tree = svg('svg', {
    id: 'contribution-tree',
    viewBox: `0 0 ${VIEWBOX.join(' ')}`,
    preserveAspectRatio: 'none',
    role: 'group',
    'aria-labelledby': 'contribution-title contribution-description',
  });
  const title = svg('title', { id: 'contribution-title' });
  title.textContent = 'People shape Dukarun';
  const description = svg('desc', { id: 'contribution-description' });
  description.textContent =
    'Choose a leaf to read a person’s contribution. Feedback travels from leaves into shared branches and a metal answer. Scroll to see that same answer become a rooted seed, with its potential projected behind it.';
  const geometry = svg('g'),
    branchesLayer = svg('g'),
    streams = svg('g', { 'aria-hidden': 'true' }),
    leavesLayer = svg('g');
  geometry.append(branchesLayer, streams, leavesLayer);
  tree.append(
    title,
    description,
    svg('rect', { width: 800, height: 780, fill: 'transparent', 'aria-hidden': 'true' }),
    geometry
  );
  byId('tree-drawing').replaceChildren(tree);
  const accounts = new Map(config.chapters.map(chapter => [chapter.leaf, chapter]));
  const layouts = layoutContributions(config),
    leaves = new Map(),
    solids = [];
  const addSolid = (points, width, branch, owner) => {
    const path = svg('path', {
      d: pathData(points),
      fill: 'none',
      stroke: branch.color,
      'stroke-width': width,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: 'branch-solid',
      'data-branch': branch.id,
    });
    branchesLayer.append(path);
    solids.push({ path, points, width, length: path.getTotalLength(), branch: branch.id, owner });
  };
  layouts.forEach(branch => {
    addSolid(branch.main, 8, branch);
    branch.leaves.forEach((leaf, index) => {
      if (leaf.twig) addSolid(leaf.twig, 5.5, branch, leaf.id);
      const chapter = accounts.get(leaf.id),
        label = chapter?.title ?? config.openLabels[leaf.id] ?? 'A story still growing';
      const group = svg('g', {
        class: `leaf-node${chapter ? ' has-account' : ''}`,
        'data-leaf-id': leaf.id,
        role: 'button',
        tabindex: 0,
        'aria-pressed': 'false',
        'aria-label': `${chapter?.persona ?? leaf.persona}: ${label}`,
        style: `color:${leaf.color}`,
      });
      const breadth = 12 + leaf.variant * 1.4,
        length = 47 + leaf.variant;
      group.append(
        svg('ellipse', { cx: 32, cy: 0, rx: 34, ry: 28, fill: 'transparent', class: 'leaf-hit' }),
        svg('ellipse', { cx: 32, cy: 0, rx: 32, ry: 25, class: 'leaf-halo' }),
        svg('path', {
          d: `M12 0 C18 ${-breadth} 36 ${-breadth - 7} ${length + 12} 0 C38 ${breadth + 5} 19 ${breadth} 12 0Z`,
          class: 'leaf-fill',
        }),
        svg('path', {
          d: `M16 0 Q32 -1 ${length + 8} 0 M25 0 L21 -6 M35 0 L33 8 M42 0 L40 -5`,
          class: 'leaf-vein',
        }),
        svg('path', { d: 'M5 0 H16', stroke: leaf.color, 'stroke-width': 2.2 }),
        svg('circle', {
          cx: 0,
          cy: 0,
          r: 5,
          fill: 'var(--story-paper)',
          stroke: leaf.color,
          'stroke-width': 2.5,
        })
      );
      leavesLayer.append(group);
      const route = [leaf.center, ...leaf.route, [400, 650]];
      const packet = svg('path', {
        d: pathData(route),
        pathLength: 1,
        class: 'feedback-packet',
        'data-source-leaf': leaf.id,
        style: `color:${leaf.color};--feed-delay:${-(leaves.size * 0.43).toFixed(2)}s`,
      });
      if (chapter) streams.append(packet);
      const distance = points =>
        points
          .slice(1)
          .reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
      const total = distance(leaf.route),
        twigLength = leaf.twig ? distance(leaf.twig) : 0;
      leaves.set(leaf.id, {
        ...leaf,
        group,
        packet,
        route: leaf.route,
        chapter,
        index,
        total,
        twigLength,
        mainLength: total - twigLength,
      });
      const activate = () => {
        selectLeaf(leaf.id);
        callbacks.selectLeaf(leaf.id);
      };
      listen(group, 'click', activate);
      listen(group, 'keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });
  });
  // A touch can land within 22 screen pixels of a leaf. Choose the nearest leaf
  // rather than overlapping enlarged hit shapes in the compact mobile drawing.
  const coarse = matchMedia('(pointer: coarse)');
  listen(
    tree,
    'click',
    event => {
      if (!coarse.matches || event.detail === 0 || geometry.style.pointerEvents === 'none') return;
      let nearest,
        distance = 22;
      leaves.forEach(leaf => {
        const point = new DOMPoint(32, 0).matrixTransform(leaf.group.getScreenCTM());
        const delta = Math.hypot(point.x - event.clientX, point.y - event.clientY);
        if (delta < distance) {
          nearest = leaf;
          distance = delta;
        }
      });
      if (!nearest) return;
      event.stopImmediatePropagation();
      selectLeaf(nearest.id);
      callbacks.selectLeaf(nearest.id);
    },
    { capture: true }
  );

  let seed, fallback;
  try {
    seed = new SeedRenderer(canvas);
  } catch {
    stage.classList.add('fallback');
    fallback = createFallback(tree);
  }
  let disposed = false,
    visible = true,
    dirty = true,
    frame = 0,
    lastFrame = 0,
    lastFold = -1;
  let progress = 0,
    expansion = 0,
    selected = '',
    arrival = 0;
  let start = 0,
    finish = 1,
    baseWidth = 0,
    baseHeight = 0,
    lastPhase = '',
    lastLabels = '';
  const rootLabels = [...host.querySelectorAll('.root-label')];
  const labels = host.querySelector('.root-labels'),
    potentialLabel = host.querySelector('.potential-label');
  const alignments = ['left', 'bottom-left', 'bottom', 'bottom-right', 'right'];
  rootLabels.forEach((label, index) => (label.dataset.align = alignments[index]));

  function measure() {
    if (disposed) return;
    baseWidth = host.querySelector('.story-visual').clientWidth;
    baseHeight = mobile.matches
      ? Math.max(210, Math.min(innerHeight * 0.29, 255))
      : Math.min((baseWidth * 780) / 800, innerHeight - 190, 560);
    const trigger =
      mobile.matches && innerHeight > 600 ? 64 + baseHeight + 80 : Math.min(innerHeight * 0.6, 460);
    start = scrollY + byId('taking-root').getBoundingClientRect().top - trigger;
    finish =
      scrollY +
      byId('potential').getBoundingClientRect().top -
      trigger +
      (mobile.matches ? -32 : Math.min(110, innerHeight * 0.13));
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    const stickyEnd =
      scrollY +
      host.querySelector('.story-experience').getBoundingClientRect().bottom -
      baseHeight -
      48 -
      70 -
      86;
    finish = Math.min(finish, maxScroll - 20, mobile.matches ? Infinity : stickyEnd);
    finish = Math.max(start + 180, finish);
    dirty = true;
    requestFrame();
  }
  function selectLeaf(id) {
    const chosen = leaves.get(id);
    if (!chosen) return;
    selected = id;
    arrival = performance.now();
    const connected = new Set([
      id,
      ...(chosen.chapter?.related ?? []).map(
        chapterId => config.chapters.find(chapter => chapter.id === chapterId)?.leaf
      ),
    ]);
    const connectedBranches = new Set([...connected].map(leaf => leaves.get(leaf)?.branch));
    leaves.forEach(leaf => {
      const active = leaf.id === id,
        related = connected.has(leaf.id);
      leaf.group.setAttribute('aria-pressed', String(active));
      leaf.group.classList.toggle('is-connected', related);
      leaf.packet.classList.toggle('is-selected', active);
      leaf.packet.style.opacity = active ? '1' : related ? '.65' : '.12';
    });
    solids.forEach(solid => {
      solid.path.classList.toggle(
        'is-selected',
        solid.owner ? solid.owner === id : solid.branch === chosen.branch
      );
      solid.path.classList.toggle(
        'is-connected',
        solid.owner ? connected.has(solid.owner) : connectedBranches.has(solid.branch)
      );
    });
    measure();
  }
  function updateGeometry(fold, origin) {
    if (Math.abs(lastFold - fold) < 0.001) return;
    lastFold = fold;
    const remainder = 1 - fold;
    solids.forEach(solid => {
      const length = solid.length;
      const leaf = leaves.get(solid.owner);
      const fraction = leaf
        ? clamp((leaf.twigLength - fold * leaf.total) / leaf.twigLength)
        : Math.max(
            ...layouts
              .find(branch => branch.id === solid.branch)
              .leaves.map(info => {
                const item = leaves.get(info.id);
                return Math.min(item.mainLength, item.total * remainder) / length;
              })
          );
      solid.path.setAttribute(
        'd',
        pathData(solid.points.slice(0, Math.max(2, Math.ceil(solid.points.length * fraction))))
      );
      solid.path.style.visibility = fraction < 0.005 ? 'hidden' : '';
      solid.path.style.opacity = fold > 0.01 ? String(remainder * 0.8) : '';
    });
    leaves.forEach(leaf => {
      const point = sample(leaf.route, fold);
      const scale = 1 - fold * 0.95;
      leaf.group.setAttribute(
        'transform',
        `translate(${point[0]} ${point[1]}) rotate(${leaf.angle}) scale(${scale})`
      );
      leaf.group.style.visibility = fold > 0.98 ? 'hidden' : '';
      leaf.group.style.opacity = fold > 0.01 ? String(remainder) : '';
      // Collapsed contributions leave the tab order; the inline picker remains available.
      leaf.group.setAttribute('tabindex', fold > 0.8 ? '-1' : '0');
    });
    geometry.style.opacity = String(1 - smooth((fold - 0.72) / 0.28));
    geometry.style.pointerEvents = fold > 0.8 ? 'none' : '';
    geometry.setAttribute(
      'transform',
      `translate(${(origin.x * 800 - ORIGIN[0]) * fold} ${(origin.y * 780 - 650) * fold})`
    );
  }
  function caption(phase) {
    if (phase === lastPhase) return;
    lastPhase = phase;
    stage.dataset.phase = phase;
    host.querySelector('.visual-hint').textContent =
      phase === 'contributions' ? 'Choose a leaf' : '';
    const copy = {
      contributions: ['People shape the answer.', 'Follow a leaf into a shared direction.'],
      changing: ['A first answer, reshaped.', 'The contributions become part of it.'],
      rooted: ['Lessons keep it grounded.', 'The roots feed the seed.'],
      potential: ['Potential, grounded in experience.', 'Guided by real experience.'],
    }[phase];
    byId('scene-title').textContent = copy[0];
    byId('scene-detail').textContent = copy[1];
  }
  function render(now) {
    frame = 0;
    if (disposed) return;
    const previous = progress;
    progress = clamp((scrollY - start) / Math.max(180, finish - start));
    const projection = smooth((progress - 0.76) / 0.24),
      growth = smooth((progress - 0.4) / 0.54),
      material = smooth((progress - 0.09) / 0.61);
    const dt = Math.min(64, now - lastFrame || 33);
    lastFrame = now;
    expansion =
      reduced.matches || !visible || document.hidden
        ? projection
        : expansion + (projection - expansion) * Math.min(1, dt / 130);
    if (Math.abs(expansion - projection) < 0.002) expansion = projection;
    const gain = Math.min(mobile.matches ? 18 : 32, baseWidth * 0.055) * expansion;
    const width = baseWidth + gain,
      height = baseHeight + (mobile.matches ? 30 : 48) * expansion;
    if (Math.abs(stage.clientWidth - width) > 0.5 || Math.abs(stage.clientHeight - height) > 0.5) {
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;
      stage.style.marginLeft = `${-gain / 2}px`;
      seed?.resize();
    }
    const time = reduced.matches ? 0 : now / 1000;
    if (seed) {
      const packet = leaves.get(selected)?.packet,
        animation = packet?.getAnimations()[0];
      const timing = animation?.effect?.getComputedTiming();
      const nearArrival = timing?.progress == null ? 0 : smooth((timing.progress - 0.82) / 0.18);
      seed.feedback =
        (1 - material) * Math.max(nearArrival, Math.max(0, 1 - (now - arrival) / 800) * 0.3);
    }
    const tips = seed
      ? seed.render(growth, time, material, projection)
      : fallback.render(growth, material, projection);
    const origin = seed ? seed.project([0, 0, 0]) : fallback.origin;
    const fold = smooth((progress - 0.05) / 0.61);
    if (Math.abs(previous - progress) > 0.0005 || dirty) lastFold = -1;
    updateGeometry(fold, origin);
    labels.classList.toggle('is-visible', growth > 0.7);
    const labelKey = `${width.toFixed(1)}:${height.toFixed(1)}:${growth.toFixed(3)}:${projection.toFixed(3)}`;
    if (dirty || labelKey !== lastLabels) {
      lastLabels = labelKey;
      tips.forEach((point, index) => {
        const inset = index === 1 ? -16 : index === 3 ? 16 : 0;
        rootLabels[index].style.left = `calc(${point.x * 100}% + ${inset}px)`;
        rootLabels[index].style.top = `calc(${point.y * 100}% + ${[-8, -3, -3, 0, -8][index]}px)`;
      });
      // Short viewports compress the root fan. Lift its outer annotations only
      // when their real text bounds would collide with the three lower labels.
      const bounds = rootLabels.map(label => label.getBoundingClientRect());
      [0, 4].forEach(index => {
        const box = bounds[index];
        const lift = Math.max(
          0,
          ...[1, 2, 3].map(other => {
            const next = bounds[other];
            return box.left < next.right &&
              box.right > next.left &&
              box.top < next.bottom &&
              box.bottom > next.top
              ? box.bottom - next.top + 5
              : 0;
          })
        );
        if (lift) rootLabels[index].style.top = `calc(${tips[index].y * 100}% - ${8 + lift}px)`;
      });
    }
    const top = seed ? seed.projectPotential(seed.potential.top) : { x: 0.5, y: 0.11 };
    potentialLabel.style.left = `${top.x * 100}%`;
    potentialLabel.style.top = `${top.y * 100 - 4}%`;
    potentialLabel.style.opacity = String(projection);
    stage.dataset.progress = progress.toFixed(3);
    stage.dataset.material = material.toFixed(3);
    caption(
      progress < 0.12
        ? 'contributions'
        : progress < 0.65
          ? 'changing'
          : progress < 0.84
            ? 'rooted'
            : 'potential'
    );
    dirty = false;
    if ((visible && !document.hidden && !reduced.matches) || expansion !== projection)
      requestFrame();
  }
  function requestFrame() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(now => {
      if (!dirty && now - lastFrame < 32) {
        frame = 0;
        requestFrame();
        return;
      }
      render(now);
    });
  }
  const visibility = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    tree.classList.toggle('is-paused', !visible || document.hidden);
    if (visible) {
      dirty = true;
      requestFrame();
    }
  });
  visibility.observe(stage);
  const resize = new ResizeObserver(() => measure());
  // Observe content and the column, never the animated stage itself.
  resize.observe(host.querySelector('.story-context'));
  resize.observe(host.querySelector('.story-visual'));
  listen(window, 'scroll', () => {
    dirty = true;
    requestFrame();
  });
  listen(window, 'resize', measure);
  listen(reduced, 'change', () => {
    dirty = true;
    requestFrame();
  });
  listen(document, 'visibilitychange', () => {
    tree.classList.toggle('is-paused', document.hidden || !visible);
    if (!document.hidden) {
      dirty = true;
      requestFrame();
    }
  });
  listen(canvas, 'webglcontextlost', event => {
    event.preventDefault();
    seed?.destroy();
    seed = undefined;
    stage.classList.add('fallback');
    fallback = createFallback(tree);
    dirty = true;
    requestFrame();
  });
  measure();
  return {
    selectLeaf,
    revealContributions() {
      const offset = mobile.matches && innerHeight > 600 ? 64 + baseHeight + 72 : 105;
      window.scrollTo({
        top: scrollY + byId('voices').getBoundingClientRect().top - offset,
        behavior: reduced.matches ? 'instant' : 'smooth',
      });
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      abort.abort();
      visibility.disconnect();
      resize.disconnect();
      seed?.destroy();
      tree.remove();
    },
  };
}

/** Same narrative remains readable when WebGL is unavailable or its context is lost. */
function createFallback(tree) {
  const layer = svg('g', { class: 'fallback-rendering', 'aria-hidden': 'true' });
  tree.prepend(layer);
  const defs = svg('defs'),
    gradient = svg('linearGradient', {
      id: 'fallback-material',
      x1: '0%',
      y1: '0%',
      x2: '100%',
      y2: '85%',
    });
  const stops = ['#657884', '#f2f5f6', '#b1c0c9', '#536a78'].map((color, i) =>
    svg('stop', { offset: `${(i * 100) / 3}%`, 'stop-color': color })
  );
  gradient.append(...stops);
  defs.append(gradient);
  layer.append(defs);
  const future = svg('g', { opacity: 0, fill: 'none', stroke: '#86766a', 'stroke-width': 2.5 });
  future.append(
    svg('path', {
      d: 'M400 450 C390 387 410 315 400 265 C388 225 407 192 400 164 M400 298 Q350 245 283 247 M401 269 Q457 220 520 227 M400 228 Q358 182 333 178 M400 215 Q446 179 468 175',
    }),
    svg('path', {
      d: 'M400 130 C425 115 463 139 472 156 C510 139 547 171 543 197 C582 218 553 261 517 267 C487 294 465 264 449 280 C433 271 415 291 400 273 C379 293 360 271 340 280 C321 264 291 282 276 264 C235 258 217 220 253 198 C246 169 283 139 326 151 C346 125 374 113 400 130Z',
      fill: '#c8bdb1',
      'fill-opacity': 0.09,
    })
  );
  const rootGroup = svg('g', {
    fill: 'none',
    stroke: '#b2845d',
    'stroke-width': 5,
    'stroke-linecap': 'round',
  });
  const points = [
    [262, 560],
    [326, 608],
    [400, 632],
    [480, 601],
    [547, 553],
  ];
  points.forEach(([x, y]) =>
    rootGroup.append(
      svg('path', { d: `M400 470 C${x} 501 ${x + (400 - x) * 0.2} ${y - 32} ${x} ${y}` })
    )
  );
  const shoot = svg('g', { fill: '#638044', stroke: '#638044', 'stroke-width': 5 });
  shoot.append(
    svg('path', { d: 'M400 439 C380 381 418 324 400 265', fill: 'none' }),
    svg('path', {
      d: 'M400 300 C352 310 336 277 337 248 C380 251 407 270 400 300Z M400 276 C404 240 441 218 468 224 C459 264 430 281 400 276Z',
      stroke: 'none',
    })
  );
  const body = svg('path', { fill: 'url(#fallback-material)' });
  layer.append(future, rootGroup, shoot, body);
  const metal = [
    -64, -27, -20, -27, 20, -27, 64, -27, 64, -10, 64, 10, 64, 29, 20, 29, -20, 29, -64, 29, -64,
    10, -64, -10, -64, -27,
  ];
  const organic = [
    0, -54, 32, -58, 60, -28, 53, 9, 50, 42, 24, 62, 0, 56, -31, 61, -57, 37, -53, 8, -57, -22, -31,
    -56, 0, -54,
  ];
  return {
    origin: { x: 0.5, y: 650 / 780 },
    render(growth, material, projection) {
      const y = 650 - 200 * smooth(growth);
      const values = metal.map((value, i) => value + (organic[i] - value) * material);
      let d = `M${values[0]} ${values[1]}`;
      for (let i = 2; i < values.length; i += 6) d += ` C${values.slice(i, i + 6).join(' ')}`;
      body.setAttribute('d', d + 'Z');
      body.setAttribute('transform', `translate(400 ${y})`);
      const brown = ['#ac8059', '#b98d64', '#805031', '#462d22'];
      stops.forEach((stop, i) => {
        const a = ['#657884', '#f2f5f6', '#b1c0c9', '#536a78'][i],
          b = brown[i];
        stop.setAttribute(
          'stop-color',
          `rgb(${[1, 3, 5].map(k => Math.round(parseInt(a.slice(k, k + 2), 16) * (1 - material) + parseInt(b.slice(k, k + 2), 16) * material)).join(',')})`
        );
      });
      [rootGroup, shoot].forEach(group => {
        group.setAttribute('opacity', growth);
        group.setAttribute(
          'transform',
          `translate(400 ${y}) scale(1 ${Math.max(0.001, growth)}) translate(-400 -450)`
        );
      });
      future.setAttribute('opacity', projection * 0.45);
      future.setAttribute('transform', `translate(0 ${y - 450})`);
      this.origin = { x: 0.5, y: y / 780 };
      return points.map(([x, tipY]) => ({ x: x / 800, y: (y + (tipY - 450) * growth) / 780 }));
    },
  };
}
