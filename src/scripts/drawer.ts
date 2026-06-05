// Drawer: CSS-3D card stack with shuffle + select.
// Zero dependencies. All motion is CSS transforms driven by custom properties,
// so shuffling never triggers layout — only the compositor moves cards.

export interface ProjectMeta {
  slug: string;
  title: string;
  accent?: string;
  summary?: string;  // first paragraph of the project, shown on the card
  draft?: boolean;   // true = greyed-out, non-clickable "coming soon" card
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
    el.innerHTML =
      `<span class="card__tab"></span>` +
      `<span class="card__body">` +
        `<span class="card__name">${p.title}</span>` +
        summary +
      `</span>` +
      `<span class="card__soon">coming soon…</span>`;

    el.addEventListener('click', () => {
      if (p.draft) return;            // drafts are not selectable
      if (i === index) selectProject(p);
      else go(i);
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
  const CARD_H_RESERVE = 0.6; // fraction of card height reserved so the top/bottom
                              // cards stay on-screen (lower = more spread out)

  function render() {
    const n = projects.length;
    const h = right.clientHeight || 1;
    // Reserve (part of) the card's own height so the top & bottom cards stay
    // fully inside the panel instead of spilling past the edges. Subtracting
    // this shrinks the spread, which compresses the cards closer together.
    const cardH = cards[0]?.offsetHeight || 360;
    const usable = Math.max(0, h * (1 - TOP_PAD * 2) - cardH * CARD_H_RESERVE);
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
      // Strict rank order: card n in front of every k>n, behind every i<n.
      // (Lower index = higher in the stack.) Focused card does NOT jump out.
      el.style.zIndex = String(n - i);
      // Only the focused card catches clicks.
      el.style.pointerEvents = focused ? 'auto' : 'none';
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

  // Cursor vertical position only chooses WHICH card is focused.
  // The cards keep their fixed slots; nothing slides.
  right.addEventListener('mousemove', (e) => {
    const rect = right.getBoundingClientRect();
    const frac = 1 - (e.clientY - rect.top) / rect.height;  // bottom = first card
    const clamped = Math.min(0.999, Math.max(0, frac));
    const target = Math.floor(clamped * projects.length);
    if (target !== index) { index = target; render(); }
  });

  // Leaving the panel deselects everything (no card focused).
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