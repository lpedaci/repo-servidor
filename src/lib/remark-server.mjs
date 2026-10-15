/**
 * Plugin de Markdown del server:
 *   :::callout{tipo="idea|aviso|tip"} ... :::   Callout con ícono y etiqueta
 *   ::recurso{#id}                              Tarjeta de un recurso de src/data/recursos.json
 *   ::video{id="xxxxxxxxxxx"}                   Video de YouTube (portada liviana, el reproductor carga al hacer clic)
 * Además: links externos en pestaña nueva con aviso, y links internos con el `base` del sitio.
 */
import fs from 'node:fs';
import path from 'node:path';
import { visit, SKIP } from 'unist-util-visit';
import { linkCardHtml } from './linkcard.mjs';

const CALLOUT = {
  idea: { label: 'Idea clave', icon: 'lightbulb' },
  aviso: { label: 'Ojo', icon: 'warning' },
  tip: { label: 'Dato', icon: 'pin' },
};

const EXT = '<svg class="ic ic-ext" aria-hidden="true"><use href="#i-external"/></svg><span class="sr-only"> (se abre en otra pestaña)</span>';

function cargarRecursos() {
  const p = path.join(process.cwd(), 'src', 'data', 'recursos.json');
  return new Map(JSON.parse(fs.readFileSync(p, 'utf8')).map((r) => [r.id, r]));
}

export function remarkServer(opts = {}) {
  const base = (opts.base ?? '/').replace(/\/$/, '');
  return (tree, file) => {
    const recursos = cargarRecursos();
    visit(tree, (node, index, parent) => {
      if (node.type === 'containerDirective' && node.name === 'callout') {
        const tipo = CALLOUT[node.attributes?.tipo] ? node.attributes.tipo : 'tip';
        const c = CALLOUT[tipo];
        node.data = { hName: 'div', hProperties: { className: ['callout', `callout--${tipo}`], role: 'note' } };
        node.children.unshift({
          type: 'html',
          value: `<p class="callout-label"><svg class="ic" aria-hidden="true"><use href="#i-${c.icon}"/></svg>${c.label}</p>`,
        });
        return;
      }
      // :::media ... ::: logo o ícono a la izquierda (tamaño fijo) y el texto al lado
      if (node.type === 'containerDirective' && node.name === 'media') {
        node.data = { hName: 'div', hProperties: { className: ['media'] } };
        return;
      }
      if (node.type === 'leafDirective' && node.name === 'recurso') {
        const id = node.attributes?.id;
        const r = recursos.get(id);
        if (!r) file.fail(`::recurso{#${id}} no existe en src/data/recursos.json`, node);
        parent.children[index] = { type: 'html', value: linkCardHtml(r) };
        return SKIP;
      }
      // ::vista{#id img="previews/archivo.webp" cta="Ver el material"}: recurso con captura del sitio
      if (node.type === 'leafDirective' && node.name === 'vista') {
        const id = node.attributes?.id;
        const r = recursos.get(id);
        if (!r) file.fail(`::vista{#${id}} no existe en src/data/recursos.json`, node);
        const img = node.attributes?.img;
        if (!img) file.fail(`::vista{#${id}} necesita img="previews/..."`, node);
        const cta = node.attributes?.cta ?? 'Ver el material';
        const dir = r.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        parent.children[index] = {
          type: 'html',
          value:
            `<a class="vista" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">` +
            `<span class="vista-frame" aria-hidden="true"><span class="vista-bar"><i></i><i></i><i></i><span class="vista-url">${esc(dir)}</span></span>` +
            `<span class="vista-shot"><img src="${base}/${esc(img)}" alt="" loading="lazy" decoding="async" width="960" height="1500"></span></span>` +
            `<span class="vista-txt"><span class="vista-kicker"><svg class="ic" aria-hidden="true"><use href="#i-eye"/></svg>Vista previa</span>` +
            `<span class="vista-name">${esc(r.nombre)}</span>` +
            (r.descripcion ? `<span class="vista-desc">${esc(r.descripcion)}</span>` : '') +
            `<span class="vista-cta">${esc(cta)}<svg class="ic" aria-hidden="true"><use href="#i-arrow-right"/></svg></span></span>` +
            `<span class="sr-only"> (se abre en otra pestaña)</span></a>`,
        };
        return SKIP;
      }
      if (node.type === 'leafDirective' && node.name === 'video') {
        const id = String(node.attributes?.id ?? '');
        if (!/^[\w-]{11}$/.test(id)) file.fail(`::video con id inválido: ${id}`, node);
        parent.children[index] = {
          type: 'html',
          value:
            `<div class="video" data-video="${id}"><a class="video-link" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer">` +
            `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" decoding="async" width="480" height="360">` +
            `<span class="video-play"><svg class="ic" aria-hidden="true"><use href="#i-play-s"/></svg><span>Ver video</span></span>` +
            `<span class="sr-only"> en YouTube (se abre en otra pestaña)</span></a></div>`,
        };
        return SKIP;
      }
      // Directivas de texto que no son nuestras (por ejemplo "nota:importante") vuelven a ser texto.
      if (node.type === 'textDirective') {
        parent.children.splice(index, 1, { type: 'text', value: `:${node.name}` }, ...(node.children ?? []));
        return index;
      }
      if (node.type === 'leafDirective' || node.type === 'containerDirective') {
        file.fail(`Directiva desconocida: ${node.name}`, node);
      }
      if (node.type === 'link') {
        const url = node.url;
        if (/^https?:\/\//.test(url)) {
          node.data = { hProperties: { target: '_blank', rel: 'noopener noreferrer' } };
          node.children.push({ type: 'html', value: EXT });
          return SKIP;
        }
        if (url.startsWith('/') && !url.startsWith(base + '/')) node.url = base + url;
      }
    });
  };
}
