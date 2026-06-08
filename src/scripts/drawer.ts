// Drawer: CSS-3D card stack with shuffle + select.
// Zero dependencies. All motion is CSS transforms driven by custom properties,
// so shuffling never triggers layout — only the compositor moves cards.

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
  right: HTMLElement;    // the right panel (collapses on select)
  left: HTMLElement;     // the left panel (receives project content)
  projects: ProjectMeta[];
}

export function initDrawer({ drawer, right, left, projects }: DrawerOpts) {
  let index = -1;            // -1 = no card focused
  let activeSlug: string | null = null;

  // Build cards once.
  const cards = projects.map((p, i) => {
    const el = document.createElement('button');
    el.type = 'button';
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

    // Focus the card the cursor is actually over (the visible one you point at).
    el.addEventListener('mouseenter', () => {
      if (index !== i) { index = i; render(); }
    });
    // Click selects whatever card you're pointing at.
    el.addEventListener('click', () => {
      if (p.draft) return;            // drafts are not selectable
      selectProject(p);
    });
    drawer.appendChild(el);
    return el;
  });

  // --- Stack geometry (tweak freely) ---
  const TILT_PILE = -55;    // deg: unfocused cards above the focus (in the pile)
  const TILT_FOCUS = -22;   // deg: the focused card (barely rotated)
  const TILT_BELOW = -70;   // deg: unfocused cards below the focus (passed)
  const SHRINK = 0.03;      // scale loss per slot from the bottom
  const TOP_PAD = 0.16;     // fraction of panel height kept as margin top/bottom
  const CLEARANCE = 70;     // px each neighbor shifts away to clear the focused card
  const IDLE_SQUEEZE = 0.62; // <1 = cards sit closer together when nothing is hovered

  function render() {
    const n = projects.length;
    const h = right.clientHeight || 1;
    const usable = h * (1 - TOP_PAD * 2);
    // Resting gap is compressed; when a card is focused we use the full spread.
    const squeeze = index < 0 ? IDLE_SQUEEZE : 1;
    const span = n > 1 ? (usable / (n - 1)) * squeeze : 0;
    const totalSpan = span * (n - 1);

    for (let i = 0; i < n; i++) {
      const el = cards[i];
      const focused = i === index;       // index === -1 => nothing focused
      const offset = index < 0 ? 1 : i - index;
      el.style.setProperty('--offset', String(offset));
      el.style.setProperty('--abs', String(Math.abs(offset)));

      // Centre the (possibly compressed) stack: i=0 bottom, i=n-1 top.
      let ty = totalSpan / 2 - span * i;

      // Make room around the focused card: push cards above further up and
      // cards below further down. The focused card stays in its slot.
      if (index >= 0 && !focused) {
        ty += offset > 0 ? -CLEARANCE : CLEARANCE;
      }

      let tilt: number;
      if (focused) tilt = TILT_FOCUS;
      else if (offset > 0) tilt = TILT_PILE;
      else tilt = TILT_BELOW;

      const sc = 1 - i * SHRINK;

      el.style.setProperty('--ty', `${ty}px`);
      el.style.setProperty('--tilt', `${tilt}deg`);
      el.style.setProperty('--sc', String(sc));
      el.classList.toggle('is-front', focused);
      // Visual stacking: lower index paints on top. Focused card lifts above
      // all so its visible area isn't occluded and reliably catches the click.
      el.style.zIndex = String(focused ? 5000 : n - i);
      // Every card is hit-testable, so the browser picks whichever card's
      // visible pixels are under the cursor — i.e. the one you point at.
      el.style.pointerEvents = projects[i].draft ? 'none' : 'auto';
    }
  }

  function go(i: number) {
    const n = projects.length;
    index = ((i % n) + n) % n;
    render();
  }

  async function selectProject(p: ProjectMeta) {
    if (activeSlug === p.slug) return;
    activeSlug = p.slug;
    left.classList.remove('is-empty');
    left.dataset.loading = 'true';

    try {
      // Fetch the rendered project page and pull out its <main> content.
      // No full navigation = no reload = instant once cached.
      const res = await fetch(`/projects/${p.slug}/`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const content = doc.querySelector('[data-project-content]');
      left.innerHTML = content ? content.innerHTML : '<p>Could not load project.</p>';

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

  // Focus is driven by per-card mouseenter (set up per card above), so the
  // card you actually point at is the one that highlights. Leaving the panel
  // deselects everything.
  right.addEventListener('mouseleave', () => {
    if (index !== -1) { index = -1; render(); }
  });

  // Keep keyboard support (ignored when nothing is focused yet).
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(index < 0 ? 0 : index + 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(index < 0 ? projects.length - 1 : index - 1);
    if (e.key === 'Enter' && index >= 0) selectProject(projects[index]);
  });

  render();
}