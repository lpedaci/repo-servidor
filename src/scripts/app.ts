/**
 * Interacciones comunes a todas las páginas: tema, menú móvil, inventario (★ y contador),
 * aviso flotante, revelado al hacer scroll, contadores animados, banda de etiquetas,
 * videos que cargan al hacer clic e índice lateral de los posts.
 */
import { alternarFav, esFav, leer } from './inventario';

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

/* ---------- tema ---------- */
const temaBtn = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const esOscuro = () =>
  root.dataset.theme === 'dark' || (!root.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
const etiquetarTema = () => temaBtn?.setAttribute('aria-label', esOscuro() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
etiquetarTema();
temaBtn?.addEventListener('click', () => {
  const nuevo = esOscuro() ? 'light' : 'dark';
  root.dataset.theme = nuevo;
  try {
    localStorage.setItem('server:tema', nuevo);
  } catch {
    /* sin almacenamiento */
  }
  etiquetarTema();
});

/* ---------- menú móvil ---------- */
const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu]');
const nav = document.getElementById('nav');
function cerrarMenu(foco = false) {
  menuBtn?.setAttribute('aria-expanded', 'false');
  nav?.classList.remove('is-open');
  if (foco) menuBtn?.focus();
}
menuBtn?.addEventListener('click', () => {
  const abrir = menuBtn.getAttribute('aria-expanded') !== 'true';
  menuBtn.setAttribute('aria-expanded', String(abrir));
  nav?.classList.toggle('is-open', abrir);
  if (abrir) nav?.querySelector('a')?.focus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav?.classList.contains('is-open')) cerrarMenu(true);
});
document.addEventListener('click', (e) => {
  if (nav?.classList.contains('is-open') && !(e.target as Element).closest('.top-in')) cerrarMenu();
});

/* ---------- aviso flotante ---------- */
const toast = document.querySelector<HTMLElement>('[data-toast]');
const toastTxt = document.querySelector<HTMLElement>('[data-toast-txt]');
// El aviso visual se oculta con visibility; el anuncio para lectores de pantalla va en una región aparte, siempre presente.
const toastSr = document.querySelector<HTMLElement>('[data-toast-sr]');
let toastT: number | undefined;
export function avisar(msg: string) {
  if (!toast || !toastTxt) return;
  toastTxt.textContent = msg;
  if (toastSr) toastSr.textContent = msg;
  toast.classList.add('is-on');
  clearTimeout(toastT);
  toastT = window.setTimeout(() => toast.classList.remove('is-on'), 3000);
}

/* ---------- inventario: contador y botones ★ ---------- */
const contador = document.querySelector<HTMLElement>('[data-inv-count]');
const contadorSr = document.querySelector<HTMLElement>('[data-inv-count-sr]');
let ultimo = -1;
function pintarContador() {
  const n = leer().fav.length;
  if (contador) {
    contador.textContent = n ? String(n) : '';
    contador.dataset.n = String(n);
    if (ultimo >= 0 && n !== ultimo && !reduce()) {
      contador.classList.remove('pop');
      void contador.offsetWidth;
      contador.classList.add('pop');
    }
  }
  if (contadorSr) contadorSr.textContent = n ? `, ${n} guardado${n === 1 ? '' : 's'}` : '';
  ultimo = n;
}
function pintarFavs() {
  document.querySelectorAll<HTMLButtonElement>('[data-fav]').forEach((b) => b.setAttribute('aria-pressed', String(esFav(b.dataset.fav!))));
}
pintarContador();
pintarFavs();
document.addEventListener('inventario', () => {
  pintarContador();
  pintarFavs();
});
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('[data-fav]');
  if (!b) return;
  const guardado = alternarFav({ key: b.dataset.fav!, nombre: b.dataset.nombre!, href: b.dataset.href! });
  if (guardado && !reduce()) {
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
  }
  avisar(guardado ? `Guardado en tu inventario: ${b.dataset.nombre}` : `Lo sacaste de tu inventario`);
});

/* ---------- revelado al entrar en pantalla ---------- */
// Los callouts de los posts también se revelan.
document.querySelectorAll('.prose .callout').forEach((c) => c.classList.add('reveal'));
const reveals = document.querySelectorAll<HTMLElement>('.reveal');
if ('IntersectionObserver' in window && !reduce()) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px' }
  );
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('is-in'));
}

/* ---------- contadores que suben (stat tiles) ---------- */
const nums = document.querySelectorAll<HTMLElement>('[data-count]');
function contar(el: HTMLElement) {
  const fin = Number(el.dataset.count);
  if (reduce() || !fin) return;
  const dur = 1200;
  const t0 = performance.now();
  const paso = (t: number) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 4);
    el.textContent = String(Math.round(fin * e));
    if (p < 1) requestAnimationFrame(paso);
  };
  el.textContent = '0';
  requestAnimationFrame(paso);
}
if (nums.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        contar(en.target as HTMLElement);
        io.unobserve(en.target);
      }
    });
  });
  nums.forEach((n) => io.observe(n));
}

/* ---------- banda de etiquetas: avanza sola y se puede mover a mano ----------
   Avanza mientras está en pantalla. Se frena con el cursor encima o con el foco del teclado,
   y unos segundos después de que el user la mueve con la rueda horizontal, el trackpad o el dedo.
   Con movimiento reducido no avanza sola, pero se puede recorrer igual. */
document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((m) => {
  const view = m.querySelector<HTMLElement>('[data-marquee-view]');
  const track = view?.firstElementChild as HTMLElement | null;
  if (!view || !track || track.children.length < 2) return;
  const [a, b] = [...track.children] as HTMLElement[];
  const ciclo = () => b.offsetLeft - a.offsetLeft; // ancho de una copia más el espacio entre copias
  const VELOCIDAD = 30; // px por segundo
  let pos = 0;
  let encima = false;
  let visible = false;
  let quietoHasta = 0;
  let previo = 0;

  const envolver = () => {
    const c = ciclo();
    if (c <= 0) return;
    if (pos >= c) pos -= c;
    if (pos < 0) pos += c;
  };
  view.addEventListener('scroll', () => {
    // Si la posición cambió más de lo que mueve la animación, la movió el user.
    if (Math.abs(view.scrollLeft - pos) > 2) {
      pos = view.scrollLeft;
      quietoHasta = performance.now() + 2500;
      const antes = pos;
      envolver();
      if (pos !== antes) view.scrollLeft = pos;
    }
  });
  m.addEventListener('pointerenter', () => (encima = true));
  m.addEventListener('pointerleave', () => (encima = false));
  m.addEventListener('focusin', () => (encima = true));
  m.addEventListener('focusout', () => (encima = false));
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(view);

  const cuadro = (t: number) => {
    const dt = previo ? Math.min(t - previo, 100) : 0;
    previo = t;
    if (visible && !encima && t > quietoHasta && !reduce()) {
      pos += (VELOCIDAD * dt) / 1000;
      envolver();
      view.scrollLeft = pos;
    }
    requestAnimationFrame(cuadro);
  };
  requestAnimationFrame(cuadro);
});

/* ---------- videos: el reproductor de YouTube carga recién al hacer clic ---------- */
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('.video-link');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const box = a.closest<HTMLElement>('[data-video]');
  if (!box) return;
  e.preventDefault();
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${box.dataset.video}?autoplay=1&rel=0`;
  f.title = 'Video de YouTube';
  f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  f.allowFullscreen = true;
  box.replaceChildren(f);
  f.focus();
});

/* ---------- índice lateral: en pantallas chicas arranca plegado ---------- */
const tocDetails = document.querySelector<HTMLDetailsElement>('[data-toc-details]');
if (tocDetails && window.matchMedia('(max-width: 1023px)').matches) tocDetails.open = false;

/* ---------- índice lateral: marca la sección que se está leyendo ---------- */
const tocLinks = document.querySelectorAll<HTMLAnchorElement>('[data-toc] a');
if (tocLinks.length && 'IntersectionObserver' in window) {
  const porId = new Map([...tocLinks].map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        tocLinks.forEach((a) => a.classList.remove('is-here'));
        const a = porId.get(en.target.id);
        a?.classList.add('is-here');
      });
    },
    { rootMargin: '-15% 0px -70% 0px' }
  );
  porId.forEach((_, id) => {
    const h = document.getElementById(id);
    if (h) io.observe(h);
  });
}
