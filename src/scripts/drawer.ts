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
  let index = 0;
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

  function render() {
    for (let i = 0; i < cards.length; i++) {
      const el = cards[i];
      const offset = i - index;          // <0 = already passed, 0 = front, >0 = behind/above
      el.style.setProperty('--offset', String(offset));
      el.style.setProperty('--abs', String(Math.abs(offset)));
      // Only cards at/after the current one form the climbing stack.
      // Passed cards (negative) get clamped so they tuck behind, not in front.
      el.style.setProperty('--depth', String(Math.max(0, offset)));
      el.classList.toggle('is-front', i === index);
      el.classList.toggle('is-passed', offset < 0);
      // Nearer the front = higher in the stack. Front card on top.
      el.style.zIndex = String(1000 - Math.abs(offset));
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
    right.classList.add('is-collapsed');
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

  // Shuffle based on the pointer's vertical position over the panel.
  // Top of the panel = first card, bottom = last card.
  right.addEventListener('mousemove', (e) => {
    const rect = right.getBoundingClientRect();
    // fraction 0..1 of how far down the panel the cursor is
    const frac = (e.clientY - rect.top) / rect.height;
    const clamped = Math.min(0.999, Math.max(0, frac));
    const target = Math.floor(clamped * projects.length);
    if (target !== index) go(target);
  });

  // Keep keyboard support.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(index + 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(index - 1);
    if (e.key === 'Enter') selectProject(projects[index]);
  });

  render();
}