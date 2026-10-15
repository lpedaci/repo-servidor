#!/usr/bin/env node
/**
 * Revisa los links de cursos.json, recursos.json y los posts.
 *
 *   activo   responde 2xx (o el sitio bloquea robots con 401/403/429/999: no se puede afirmar que esté caído)
 *   revisar  redirige a otra página o a un home genérico, o da error temporal (5xx, timeout)
 *   caido    404, 410 o dominio inexistente
 *
 * Escribe `estado` y `revisado` en los JSON y genera _import/reporte-links.md.
 * No borra nada: Lourdes decide qué hacer con cada link.
 *
 * Uso: npm run links            (actualiza los JSON)
 *      npm run links -- --seco  (solo reporte)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DATA = path.join(ROOT, 'src', 'data');
const POSTS = path.join(ROOT, 'src', 'content', 'posts');
const SECO = process.argv.includes('--seco');
const HOY = new Date().toISOString().slice(0, 10);
const TIMEOUT = 20000;
const CONCURRENCIA = 8;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const leer = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const cursos = leer('cursos.json');
const recursos = leer('recursos.json');

const urls = new Map(); // url -> [{origen, id}]
const sumar = (url, origen) => urls.set(url, [...(urls.get(url) ?? []), origen]);
cursos.forEach((c) => sumar(c.url, `cursos: ${c.nombre}`));
recursos.forEach((r) => sumar(r.url, `recursos: ${r.nombre}`));
for (const f of fs.readdirSync(POSTS).filter((n) => n.endsWith('.md') && !n.startsWith('_'))) {
  const md = fs.readFileSync(path.join(POSTS, f), 'utf8');
  for (const [, u] of md.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) sumar(u, `post: ${f}`);
}

async function pedir(url, metodo) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, { method: metodo, redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
  } finally {
    clearTimeout(t);
  }
}

/** Sigue redirecciones a mano para saber a dónde termina. */
async function revisar(url, intento = 1) {
  let actual = url;
  let saltos = 0;
  try {
    for (;;) {
      let res = await pedir(actual, 'HEAD');
      if ([403, 405, 501, 400].includes(res.status)) res = await pedir(actual, 'GET');
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        actual = new URL(res.headers.get('location'), actual).href;
        if (++saltos > 8) return { estado: 'revisar', motivo: 'demasiadas redirecciones', final: actual };
        continue;
      }
      const s = res.status;
      if (s >= 200 && s < 300) {
        if (saltos && esRedireccionDudosa(url, actual)) return { estado: 'revisar', motivo: `redirige a ${actual}`, final: actual, redireccion: true };
        return { estado: 'activo', motivo: String(s), final: actual, redireccion: saltos > 0 };
      }
      if ([401, 403, 429, 999].includes(s)) return { estado: 'activo', motivo: `${s} (el sitio bloquea robots: verificar a mano)`, final: actual, bloqueo: true };
      if (s === 404 || s === 410) return { estado: 'caido', motivo: String(s), final: actual };
      if (intento < 2) return revisar(url, intento + 1);
      return { estado: 'revisar', motivo: `HTTP ${s}`, final: actual };
    }
  } catch (e) {
    const code = e.cause?.code ?? e.name;
    if (['ENOTFOUND', 'EAI_AGAIN'].includes(code) && intento >= 2) return { estado: 'caido', motivo: `dominio inexistente (${code})` };
    if (intento < 2) return revisar(url, intento + 1);
    return { estado: 'revisar', motivo: `error: ${code}` };
  }
}

/** Un cambio de http a https, www o barra final no cuenta. Ir al home o a otro dominio, sí. */
function esRedireccionDudosa(origen, destino) {
  try {
    const a = new URL(origen);
    const b = new URL(destino);
    const host = (h) => h.replace(/^www\./, '');
    if (host(a.hostname) !== host(b.hostname)) {
      // Acortadores y dominios de la misma marca (youtu.be -> youtube.com) no son dudosos.
      return !(/youtu\.be$/.test(a.hostname) || b.hostname.endsWith(host(a.hostname).split('.').slice(-2).join('.')));
    }
    const pa = a.pathname.replace(/\/+$/, '');
    const pb = b.pathname.replace(/\/+$/, '');
    if (pa && pa !== '/' && (pb === '' || pb === '/' || /\/(login|signin|404|not-found|error)/i.test(pb))) return true;
    return false;
  } catch {
    return false;
  }
}

const resultados = new Map();
const lista = [...urls.keys()];
let hechos = 0;
async function trabajador() {
  while (lista.length) {
    const url = lista.shift();
    resultados.set(url, await revisar(url));
    if (++hechos % 25 === 0) console.log(`${hechos}/${urls.size}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));

if (!SECO) {
  for (const x of [...cursos, ...recursos]) {
    const r = resultados.get(x.url);
    if (!r) continue;
    x.estado = r.estado;
    x.revisado = HOY;
  }
  const json = (v) => JSON.stringify(v, null, 2) + '\n';
  fs.writeFileSync(path.join(DATA, 'cursos.json'), json(cursos));
  fs.writeFileSync(path.join(DATA, 'recursos.json'), json(recursos));
}

const grupo = (fn) => [...resultados].filter(([, r]) => fn(r));
const linea = ([url, r]) => `- ${url}\n  ${r.motivo}${r.final && r.final !== url ? ` → ${r.final}` : ''}\n  Aparece en: ${urls.get(url).join('; ')}`;
const caidos = grupo((r) => r.estado === 'caido');
const revisarL = grupo((r) => r.estado === 'revisar');
const bloqueos = grupo((r) => r.bloqueo);
const redir = grupo((r) => r.estado === 'activo' && r.redireccion);
const md = [
  `# Reporte de links (${HOY})`,
  '',
  `Revisados: ${resultados.size}. Activos: ${grupo((r) => r.estado === 'activo').length}. A revisar: ${revisarL.length}. Caídos: ${caidos.length}.`,
  '',
  'Nada se borró. Los `caido` no se muestran en el sitio; los `revisar` se muestran con el aviso "Link en revisión".',
  '',
  `## Caídos (${caidos.length})`,
  ...caidos.map(linea),
  '',
  `## A revisar (${revisarL.length})`,
  ...revisarL.map(linea),
  '',
  `## Redirecciones que parecen correctas (${redir.length})`,
  'Conviene actualizar la URL a la final para ahorrar un salto.',
  ...redir.map(linea),
  '',
  `## No verificables automáticamente (${bloqueos.length})`,
  'El sitio bloquea robots (401, 403, 429 o 999). Quedan como activos: revisar a mano cada tanto.',
  ...bloqueos.map(linea),
  '',
].join('\n');
fs.mkdirSync(path.join(ROOT, '_import'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '_import', 'reporte-links.md'), md);
console.log(md.split('\n').slice(0, 3).join('\n'));
console.log('Reporte: _import/reporte-links.md');
