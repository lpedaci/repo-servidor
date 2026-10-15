/**
 * Explorador de cursos y recursos.
 * - Filtros: dentro de un grupo suman (O), entre grupos restringen (Y).
 * - El estado vive en la URL (?cat=a,b&prov=x&q=texto&orden=nombre&vista=tabla): las vistas se comparten.
 * - El contador de resultados se anuncia con aria-live (con una pequeña espera mientras se escribe).
 * - Sin JS no se ejecuta nada de esto y se ve la lista completa.
 */
const form = document.querySelector<HTMLFormElement>('[data-explorer-form]');
const lista = document.querySelector<HTMLElement>('[data-lista]');
const tabla = document.querySelector<HTMLElement>('[data-tabla]');
const tbody = tabla?.querySelector('tbody');
const vacio = document.querySelector<HTMLElement>('[data-vacio]');
const conteo = document.querySelector<HTMLElement>('[data-conteo]');
const conteoN = document.querySelector<HTMLElement>('[data-conteo-n]');
const anuncio = document.querySelector<HTMLElement>('[data-anuncio]');
const vistaBtns = document.querySelectorAll<HTMLButtonElement>('[data-vista]');
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (form && lista) {
  const noun = lista.dataset.noun ?? 'resultados';
  const items = [...lista.querySelectorAll<HTMLElement>('[data-item]')];
  const filas = new Map([...(tbody?.querySelectorAll<HTMLElement>('tr[data-key]') ?? [])].map((tr) => [tr.dataset.key!, tr]));
  const total = items.length;
  const grupos = [...form.querySelectorAll<HTMLFieldSetElement>('[data-group]')].map((fs) => ({
    param: fs.dataset.group!,
    attr: fs.dataset.attr!,
    inputs: [...fs.querySelectorAll<HTMLInputElement>('input[type=checkbox]')],
  }));
  const q = form.querySelector<HTMLInputElement>('#q')!;
  const orden = form.querySelector<HTMLSelectElement>('#orden')!;
  const more = form.querySelector<HTMLDetailsElement>('[data-more]');
  const extraN = form.querySelector<HTMLElement>('[data-extra-n]');
  let vista: 'tarjetas' | 'tabla' = window.matchMedia('(min-width: 900px)').matches && tabla ? 'tabla' : 'tarjetas';
  let anuncioT: number | undefined;
  let primera = true;

  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();

  // Estado inicial desde la URL
  const params = new URLSearchParams(location.search);
  for (const g of grupos) {
    const vals = (params.get(g.param) ?? '').split(',').filter(Boolean);
    g.inputs.forEach((i) => (i.checked = vals.includes(i.value)));
  }
  q.value = params.get('q') ?? '';
  if (params.get('orden') && [...orden.options].some((o) => o.value === params.get('orden'))) orden.value = params.get('orden')!;
  if (params.get('vista') === 'tabla' || params.get('vista') === 'tarjetas') vista = params.get('vista') as typeof vista;
  if (more && grupos.some((g) => more.contains(g.inputs[0]) && g.inputs.some((i) => i.checked))) more.open = true;

  function aplicar({ anunciar = true, animar = true } = {}) {
    const activos = grupos.map((g) => ({ ...g, vals: g.inputs.filter((i) => i.checked).map((i) => i.value) })).filter((g) => g.vals.length);
    const texto = norm(q.value);
    const palabras = texto.split(/\s+/).filter(Boolean);

    const visibles = items.filter((el) => {
      const okFiltros = activos.every((g) => {
        const tiene = (el.getAttribute(`data-${g.attr}`) ?? '').split('|');
        return g.vals.some((v) => tiene.includes(v));
      });
      if (!okFiltros) return false;
      if (!palabras.length) return true;
      const hay = norm(el.dataset.texto ?? '');
      return palabras.every((p) => hay.includes(p));
    });

    // Orden
    const criterio = orden.value;
    const cmp = (a: HTMLElement, b: HTMLElement) => {
      if (criterio === 'duracion') {
        const ha = Number(a.dataset.horas || Infinity);
        const hb = Number(b.dataset.horas || Infinity);
        if (ha !== hb) return ha - hb;
      }
      if (criterio === 'nuevos') {
        const d = (b.dataset.agregado ?? '').localeCompare(a.dataset.agregado ?? '');
        if (d) return d;
      }
      return (a.dataset.nombre ?? '').localeCompare(b.dataset.nombre ?? '', 'es');
    };
    const ordenados = [...items].sort(cmp);
    const set = new Set(visibles);
    ordenados.forEach((el, i) => {
      const ver = set.has(el);
      el.hidden = !ver;
      lista!.appendChild(el);
      const fila = filas.get(el.dataset.key!);
      if (fila) {
        fila.hidden = !ver;
        tbody!.appendChild(fila);
      }
      if (ver && animar && !primera && !reduce() && i < 400) {
        el.classList.remove('is-entering');
        void el.offsetWidth;
        el.style.setProperty('--i', String(Math.min(visibles.indexOf(el), 14)));
        el.classList.add('is-entering');
      }
    });

    const n = visibles.length;
    if (conteoN) {
      conteoN.textContent = String(n);
      if (!primera && !reduce()) {
        conteoN.classList.remove('tick');
        void conteoN.offsetWidth;
        conteoN.classList.add('tick');
      }
    }
    if (conteo) conteo.dataset.total = String(total);
    if (vacio) vacio.hidden = n > 0;
    lista!.hidden = n === 0 || vista !== 'tarjetas';
    if (tabla) tabla.hidden = n === 0 || vista !== 'tabla';

    if (extraN) {
      const nExtra = grupos.filter((g) => more?.contains(g.inputs[0])).reduce((s, g) => s + g.inputs.filter((i) => i.checked).length, 0);
      extraN.textContent = nExtra ? `(${nExtra})` : '';
    }

    // URL compartible
    const p = new URLSearchParams();
    activos.forEach((g) => p.set(g.param, g.vals.join(',')));
    if (q.value.trim()) p.set('q', q.value.trim());
    if (orden.selectedIndex > 0) p.set('orden', orden.value);
    if (params.has('vista') || !primera) p.set('vista', vista);
    const qs = p.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);

    if (anunciar && anuncio) {
      clearTimeout(anuncioT);
      anuncioT = window.setTimeout(() => {
        anuncio.textContent = n ? `${n} ${noun} de ${total}` : `No hay ${noun} con esos filtros`;
      }, 450);
    }
    primera = false;
  }

  function ponerVista(v: typeof vista) {
    vista = v;
    vistaBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === v)));
    aplicar({ anunciar: false, animar: v === 'tarjetas' });
  }

  form.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).id === 'q') return;
    aplicar();
  });
  q.addEventListener('input', () => aplicar());
  form.querySelector('[data-limpiar]')?.addEventListener('click', () => {
    grupos.forEach((g) => g.inputs.forEach((i) => (i.checked = false)));
    q.value = '';
    orden.selectedIndex = 0;
    aplicar();
    q.focus();
  });
  document.querySelectorAll('[data-limpiar-vacio]').forEach((b) =>
    b.addEventListener('click', () => {
      (form.querySelector('[data-limpiar]') as HTMLButtonElement).click();
    })
  );
  vistaBtns.forEach((b) => b.addEventListener('click', () => ponerVista(b.dataset.vista as typeof vista)));

  vistaBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === vista)));
  aplicar({ anunciar: false });

  // Llegada desde la búsqueda o un favorito: #curso-id
  const ancla = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  const destino = ancla?.closest<HTMLElement>('[data-item]');
  if (destino) {
    if (destino.hidden) {
      grupos.forEach((g) => g.inputs.forEach((i) => (i.checked = false)));
      q.value = '';
      aplicar({ anunciar: false });
    }
    if (vista === 'tabla') ponerVista('tarjetas');
    destino.classList.add('is-target');
    destino.scrollIntoView({ block: 'start', behavior: reduce() ? 'auto' : 'smooth' });
    destino.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });
  }
}
