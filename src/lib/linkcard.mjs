/**
 * HTML de una tarjeta de recurso. Lo usan el plugin de Markdown (::recurso{#id})
 * y los componentes Astro, así un link se ve igual en todo el server.
 */
import { ICONO_TIPO, ETIQUETA_TIPO } from './icons.mjs';

export const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const dominio = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export function linkCardHtml(r, { descripcion = false } = {}) {
  if (r.estado === 'caido') {
    return `<p class="linkcard is-caido"><span class="linkcard-txt"><span class="linkcard-name">${esc(r.nombre)}</span><span class="linkcard-meta">Link no disponible por ahora.</span></span></p>`;
  }
  const revisar = r.estado === 'revisar' ? ' <span class="badge badge--revisar">Link en revisión</span>' : '';
  const desc = descripcion && r.descripcion ? `<span class="linkcard-desc">${esc(r.descripcion)}</span>` : '';
  return (
    `<a class="linkcard" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" data-tipo="${esc(r.tipo)}">` +
    `<span class="linkcard-ic" aria-hidden="true"><svg class="ic"><use href="#i-${ICONO_TIPO[r.tipo] ?? 'link'}"/></svg></span>` +
    `<span class="linkcard-txt"><span class="linkcard-name">${esc(r.nombre)}</span>${desc}` +
    `<span class="linkcard-meta">${esc(dominio(r.url))} · ${ETIQUETA_TIPO[r.tipo] ?? 'Sitio'}${revisar}</span></span>` +
    `<svg class="ic linkcard-out" aria-hidden="true"><use href="#i-external"/></svg>` +
    `<span class="sr-only"> (se abre en otra pestaña)</span></a>`
  );
}
