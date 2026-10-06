// Drawer: a vintage card-file ("rolodex") stack, driven continuously.
//
// Instead of snapping between discrete slots, the stack has a continuous focus
// value `f` (e.g. 2.37 = between card 2 and card 3) that eases toward a target
// set by the mouse. Every card's position and tilt are smooth functions of its
// distance to `f`, so moving the mouse flips through the file fluidly.
//
// While hovered:
//   • the focused card stands almost upright and is fully visible;
//   • the gap between cards shrinks exponentially with distance from the
//     focus (→ 0), so the stack always fits, whatever the aspect ratio;
//   • tilt grows smoothly with distance (behind / in front), like the real thing;
//   • each card's projected (after 3D) top and bottom are computed and clamped
//     to the panel, so nothing is ever cropped.
//
// Zero dependencies. Only `transform` changes per frame (compositor only).

export interface ProjectMeta {
  slug: string;
  title: string;
  accent?: string;
  summary?: string;  // first paragraph of the project, shown on the card
  draft?: boolean;   // true = greyed-out, non-clickable "coming soon" card
  cover?: string;    // square image shown in the middle of the card
}

interface DrawerOpts {
  drawer: HTMLElement;   // container that holds the cards
  right: HTMLElement;    // the right panel (shrinks once a project is selected)
  left: HTMLElement;     // the left panel (receives project content)
  layout?: HTMLElement;  // gets `.has-selection` once a project is opened
  projects: ProjectMeta[];
}

// ─── Tunables ────────────────────────────────────────────────────────────
const PERSPECTIVE  = 1200;  // px, per-card perspective (must match the CSS fallback)
const EDGE_PAD     = 14;    // px always kept free at the top/bottom of the panel

// Tilt (deg, rotateX). Negative = top edge leans toward the viewer.
const TILT_IDLE    = -55;   // every card when nothing is hovered
const TILT_FOCUS   = -10;   // the focused card (nearly upright → readable)
const TILT_ABOVE   = -55;   // asymptotic tilt of cards behind / above the focus
const TILT_BELOW   = -82;   // cards in front / below the focus: flipped almost flat
const TILT_SPREAD  = 1.1;   // in cards: how quickly cards behind reach TILT_ABOVE
const TILT_SPREAD_BELOW = 0.45; // same for cards in front (small = they flip down fast)

// Spacing. Gap to the k-th neighbour ∝ e^(-k / GAP_*). Bigger = gaps shrink slower.
const GAP_ABOVE    = 1.1;
const GAP_BELOW    = 0.9;

// The cards in front (lower index) always stay in front, so they hide the
// bottom of the focused card. REVEAL = fraction of the focused card's height
// that stays visible above the card just in front of it (0.9 = top 90%).
const REVEAL       = 0.9;
const FRONT_STACK  = 30;    // px reserved below for the cards further in front

const SHRINK       = 0.03;  // scale lost per card further back
const MIN_SCALE    = 0.7;
const IDLE_SPREAD  = 0.27;  // fraction of panel height the resting stack spans

// Feel
const FOLLOW_MS    = 110;   // smoothing time constant of the focus (higher = floatier)
const ENGAGE_MS    = 200;   // smoothing of the idle ↔ hovered transition
const DETENT       = 0.5;   // 0 = perfectly linear, 1 = strong "notch" on each card
const HOVER_MARGIN = 0.1;   // fraction of the panel at top/bottom that maps to the ends
const FRONT_AT     = 0.35;  // engagement level above which a front card is highlighted

// ─── 3D projection helpers ───────────────────────────────────────────────
// CSS rotateX(t): y' = y·cos t, z' = y·sin t ; perspective(P): × P / (P − z')
function project(y: number, t: number) {
  return (y * Math.cos(t) * PERSPECTIVE) / (PERSPECTIVE - y * Math.sin(t));
}

// How far (px) the card reaches above and below its centre once tilted.
function extents(tiltDeg: number, half: number, tab: number, sc: number) {
  const t = (tiltDeg * Math.PI) / 180;
  return {
    top: -project(-(half + tab) * sc, t),
    bottom: project(half * sc, t),
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function initDrawer({ drawer, right, left, layout, projects }: DrawerOpts) {
  const n = projects.length;
  let activeSlug: string | null = null;

  // Build cards once. They don't receive pointer events: the panel maps the
  // cursor to a focus value, and a click opens the highlighted (front) card.
  const cards = projects.map((p) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.tabIndex = -1;
    el.className = 'card';
    el.dataset.slug = p.slug;
    if (p.accent) el.style.setProperty('--accent', p.accent);
    if (p.draft) el.classList.add('is-draft');

    const summary = p.summary ? `<span class="card__summary">${p.summary}</span>` : '';
    const cover = p.cover
      ? `<span class="card__media"><img src="${p.cover}" alt="" loading="lazy" /></span>`
      : '';
    el.innerHTML =
      `<span class="card__tab"></span>` +
      `<span class="card__body">` +
        `<span class="card__name">${p.title}</span>` +
        summary +
        cover +
      `</span>` +
      `<span class="card__soon">coming soon…</span>`;

    drawer.appendChild(el);
    return el;
  });

  // ── Live geometry (kept fresh by a ResizeObserver) ──────────────────────
  let panelH = 0;
  let halfCard = 0;
  let tabH = 0;
  function measure() {
    panelH = right.clientHeight;
    const c = cards[0];
    halfCard = c ? c.offsetHeight / 2 : 0;
    tabH = c ? (c.querySelector<HTMLElement>('.card__tab')?.offsetHeight ?? 0) : 0;
  }

  // ── Animation state ────────────────────────────────────────────────────
  let f = 0, fTarget = 0;   // continuous focus (card index)
  let e = 0, eTarget = 0;   // engagement: 0 = idle stack, 1 = hovered layout
  let raf = 0, lastT = 0;
  let mouseInside = false;
  let lastPointer = 'mouse';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function draw() {
    if (!panelH || !halfCard || !n) return;

    const lo = -panelH / 2 + EDGE_PAD;   // highest allowed edge (px from centre)
    const hi =  panelH / 2 - EDGE_PAD;   // lowest allowed edge

    // Range in which the focused card is fully visible. The focus anchor slides
    // through it: card 0 focused → bottom, last card focused → top.
    const fe = extents(TILT_FOCUS, halfCard, tabH, 1);
    let fTop = lo + fe.top;
    let fBot = hi - fe.bottom;
    if (fTop > fBot) fTop = fBot = (fTop + fBot) / 2;

    // As soon as there are cards in front of the focus, lift the lowest focus
    // position so they fit under the REVEAL line instead of being squeezed up
    // over the focused card: reveal offset + one flipped card + the rest.
    const flat = extents(TILT_BELOW, halfCard, tabH, 1);
    const revealOffset = -fe.top + REVEAL * (fe.top + fe.bottom);
    const fBotFront = Math.max(fTop, hi - revealOffset - (flat.top + flat.bottom) - FRONT_STACK);
    const fBotEff = fBot + (Math.min(fBot, fBotFront) - fBot) * clamp(f, 0, 1);
    const yFocus = n > 1 ? fBotEff + (fTop - fBotEff) * (f / (n - 1)) : 0;

    const idleSpan = panelH * IDLE_SPREAD;
    const idleStep = n > 1 ? idleSpan / (n - 1) : 0;

    const front = clamp(Math.round(f), 0, n - 1);
    const engaged = e > FRONT_AT;

    for (let i = 0; i < n; i++) {
      const el = cards[i];
      const d = i - f;  // > 0: behind (above) the focus, < 0: in front (below)

      // ── hovered layout ──
      const spread = d > 0 ? TILT_SPREAD : TILT_SPREAD_BELOW;
      const k = 1 - Math.exp(-((d / spread) ** 2));            // 0 at focus → 1 far
      const tiltH = TILT_FOCUS + ((d > 0 ? TILT_ABOVE : TILT_BELOW) - TILT_FOCUS) * k;
      const scH = d > 0 ? Math.max(MIN_SCALE, 1 - SHRINK * d) : 1;
      const exH = extents(tiltH, halfCard, tabH, scH);
      let yH: number;
      if (d >= 0) {
        const end = Math.min(lo + exH.top, yFocus);      // as high as it may go
        yH = yFocus + (end - yFocus) * (1 - Math.exp(-d / GAP_ABOVE));
      } else {
        const end = Math.max(hi - exH.bottom, yFocus);   // as low as it may go
        // Where this card must sit (as the card just in front) so that its top
        // edge leaves REVEAL of the focused card visible.
        const revealLine = yFocus + revealOffset;
        const yReveal = clamp(revealLine + exH.top, yFocus, end);
        const a = -d;   // distance in front of the focus
        if (a <= 1) {
          // 0 → 1 card in front: ease from the focus slot down to the reveal slot
          yH = yFocus + (yReveal - yFocus) * (1 - (1 - a) * (1 - a));
        } else {
          // further cards: gaps shrink toward 0 between the reveal slot and the bottom
          yH = yReveal + (end - yReveal) * (1 - Math.exp(-(a - 1) / GAP_BELOW));
        }
      }

      // ── idle layout (the resting stack) ──
      const yI = idleSpan / 2 - idleStep * i;
      const scI = Math.max(MIN_SCALE, 1 - i * SHRINK);

      // ── blend + hard clamp so the projected card never leaves the panel ──
      const tilt = TILT_IDLE + (tiltH - TILT_IDLE) * e;
      const sc = scI + (scH - scI) * e;
      const ex = extents(tilt, halfCard, tabH, sc);
      const minY = lo + ex.top;
      const maxY = hi - ex.bottom;
      let y = yI + (yH - yI) * e;
      y = minY > maxY ? (minY + maxY) / 2 : clamp(y, minY, maxY);

      el.style.transform =
        `translateY(${y.toFixed(2)}px) perspective(${PERSPECTIVE}px) ` +
        `rotateX(${tilt.toFixed(2)}deg) scale(${sc.toFixed(4)})`;

      // Always physical order: a lower index is always in front, focused or not.
      const isFront = engaged && i === front;
      el.style.zIndex = String(n - i);
      el.classList.toggle('is-front', isFront);
    }

    right.classList.toggle('front-is-draft', engaged && !!projects[front]?.draft);
  }

  function tick(now: number) {
    const dt = lastT ? Math.min(now - lastT, 64) : 16;
    lastT = now;
    const af = reduceMotion ? 1 : 1 - Math.exp(-dt / FOLLOW_MS);
    const ae = reduceMotion ? 1 : 1 - Math.exp(-dt / ENGAGE_MS);
    f += (fTarget - f) * af;
    e += (eTarget - e) * ae;

    const settled = Math.abs(fTarget - f) < 0.0005 && Math.abs(eTarget - e) < 0.001;
    if (settled) { f = fTarget; e = eTarget; }
    draw();

    if (settled) { raf = 0; lastT = 0; }
    else raf = requestAnimationFrame(tick);
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // Soft "notch" on each card: monotonic, slows down near integer positions.
  function detent(x: number) {
    if (DETENT <= 0) return x;
    const k = Math.floor(x);
    const u = x - k;
    return k + u - (DETENT * Math.sin(2 * Math.PI * u)) / (2 * Math.PI);
  }

  // Cursor at the top of the panel = last card (top of the stack), bottom = first.
  function targetFromPointer(clientY: number) {
    const r = right.getBoundingClientRect();
    let t = (clientY - r.top) / (r.height || 1);
    t = clamp((t - HOVER_MARGIN) / (1 - 2 * HOVER_MARGIN), 0, 1);
    return detent((1 - t) * (n - 1));
  }

  // ── Pointer input ──────────────────────────────────────────────────────
  right.addEventListener('pointerenter', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    mouseInside = true;
    fTarget = targetFromPointer(ev.clientY);
    if (e < 0.05) f = fTarget;   // start where the cursor is, no sweep from elsewhere
    eTarget = 1;
    kick();
  });

  right.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    mouseInside = true;
    fTarget = targetFromPointer(ev.clientY);
    eTarget = 1;
    kick();
  });

  right.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    mouseInside = false;
    eTarget = 0;
    kick();
  });

  right.addEventListener('pointerdown', (ev) => { lastPointer = ev.pointerType; });

  right.addEventListener('click', (ev) => {
    // Touch / pen (touch laptops): first tap flips to the card, tapping the
    // same card again opens it.
    if (lastPointer !== 'mouse') {
      const t = targetFromPointer(ev.clientY);
      if (e > FRONT_AT && Math.round(t) === Math.round(f)) {
        const p = projects[clamp(Math.round(f), 0, n - 1)];
        if (p && !p.draft) selectProject(p);
      } else {
        fTarget = t;
        if (e < 0.05) f = t;
        eTarget = 1;
        kick();
      }
      return;
    }
    if (e < FRONT_AT) return;
    const p = projects[clamp(Math.round(f), 0, n - 1)];
    if (p && !p.draft) selectProject(p);
  });

  // ── Keyboard ───────────────────────────────────────────────────────────
  // ←/→ always flip; ↑/↓ only while the mouse is over the drawer, so they
  // keep scrolling the project text otherwise. Enter opens the front card.
  window.addEventListener('keydown', (ev) => {
    if (!right.clientHeight) return;   // drawer hidden (mobile)
    const tgt = ev.target as HTMLElement | null;
    if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return;

    const base = e > FRONT_AT ? Math.round(fTarget) : null;
    let next: number | null = null;
    const up = ev.key === 'ArrowRight' || (mouseInside && ev.key === 'ArrowUp');
    const down = ev.key === 'ArrowLeft' || (mouseInside && ev.key === 'ArrowDown');
    if (up) next = base === null ? n - 1 : base + 1;
    if (down) next = base === null ? 0 : base - 1;

    if (next !== null) {
      if (mouseInside && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) ev.preventDefault();
      fTarget = ((next % n) + n) % n;
      eTarget = 1;
      kick();
    }
    if (ev.key === 'Enter' && e > FRONT_AT) {
      const p = projects[clamp(Math.round(fTarget), 0, n - 1)];
      if (p && !p.draft) selectProject(p);
    }
  });

  // ── Loading a project ──────────────────────────────────────────────────
  async function selectProject(p: ProjectMeta) {
    if (activeSlug === p.slug) return;
    activeSlug = p.slug;
    layout?.classList.add('has-selection');   // project 75% / drawer 25%
    left.classList.remove('is-empty');
    left.dataset.loading = 'true';
    // Always start a freshly-selected project from the top (desktop + mobile).
    left.scrollTop = 0;

    try {
      // Fetch the rendered project page and pull out its content.
      // No full navigation = no reload = instant once cached.
      const res = await fetch(`/projects/${p.slug}/`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const content = doc.querySelector('[data-project-content]');
      left.innerHTML = content ? content.innerHTML : '<p>Could not load project.</p>';
      left.scrollTop = 0;

      // If the project embeds a <model-viewer>, ensure the script is present.
      if (left.querySelector('model-viewer') && !document.getElementById('mv-script')) {
        const s = document.createElement('script');
        s.id = 'mv-script';
        s.type = 'module';
        s.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js';
        document.head.appendChild(s);
      }
    } catch {
      left.innerHTML = '<p>Could not load project.</p>';
    } finally {
      left.dataset.loading = 'false';
    }
  }

  // Re-layout whenever the panel changes size (window resize, or the
  // 50% → 25% collapse after selecting a project, frame by frame).
  const ro = new ResizeObserver(() => { measure(); draw(); });
  ro.observe(right);
  measure();
  draw();

  // Expose the select path + data so other UIs (e.g. the mobile menu) can
  // reuse the exact same inline-load behaviour without duplicating logic.
  return { selectProject, projects, getActiveSlug: () => activeSlug };
}