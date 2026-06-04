// Drawer: CSS-3D card stack with shuffle + select.
// Zero dependencies. All motion is CSS transforms driven by custom properties,
// so shuffling never triggers layout — only the compositor moves cards.

export interface ProjectMeta {
  slug: string;
  title: string;
  accent?: string;
}

interface DrawerOpts {
  drawer: HTMLElement;   // container that holds the cards
  right: HTMLElement;    // the right panel (collapses on select)
  left: HTMLElement;     // the left panel (receives project content)
  projects: ProjectMeta[];
}

export function initDrawer({ drawer, right, left, projects }: DrawerOpts) {
  let index = 0;
  let wheelLock = false;
  let activeSlug: string | null = null;

  // Build cards once.
  const cards = projects.map((p, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card';
    el.dataset.slug = p.slug;
    if (p.accent) el.style.setProperty('--accent', p.accent);
    el.innerHTML = `<span class="card__tab"></span><span class="card__name">${p.title}</span>`;
    el.addEventListener('click', () => {
      if (i === index) selectProject(p);
      else go(i);
    });
    drawer.appendChild(el);
    return el;
  });

  function render() {
    for (let i = 0; i < cards.length; i++) {
      const el = cards[i];
      const offset = i - index;
      const abs = Math.abs(offset);
      el.style.setProperty('--offset', String(offset));
      el.style.setProperty('--abs', String(abs));
      el.classList.toggle('is-front', i === index);
      el.style.zIndex = String(100 - abs);
      el.style.opacity = abs > 3 ? '0' : '';
      el.style.pointerEvents = abs > 3 ? 'none' : '';
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

  // Shuffle with wheel (throttled) and arrow keys.
  right.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (wheelLock) return;
    wheelLock = true;
    go(index + (e.deltaY > 0 ? 1 : -1));
    setTimeout(() => (wheelLock = false), 160);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(index + 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(index - 1);
    if (e.key === 'Enter') selectProject(projects[index]);
  });

  render();
}