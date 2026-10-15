/**
 * Sprite de íconos: Font Awesome Free (CC BY 4.0), leídos del paquete al compilar.
 * Para sumar un ícono: agregalo acá y usalo con <Icon name="..." />.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const FA = path.join(path.dirname(require.resolve('@fortawesome/fontawesome-free/package.json')), 'svgs');

export const ICONOS = {
  compass: 'solid/compass',
  'graduation-cap': 'solid/graduation-cap',
  code: 'solid/code',
  shapes: 'solid/shapes',
  search: 'solid/magnifying-glass',
  star: 'solid/star',
  'star-o': 'regular/star',
  moon: 'solid/moon',
  sun: 'solid/sun',
  'arrow-right': 'solid/arrow-right',
  'arrow-left': 'solid/arrow-left',
  'arrow-up': 'solid/arrow-up',
  external: 'solid/arrow-up-right-from-square',
  close: 'solid/xmark',
  menu: 'solid/bars',
  table: 'solid/table-list',
  grid: 'solid/grip',
  clock: 'solid/clock',
  language: 'solid/language',
  certificate: 'solid/certificate',
  trash: 'solid/trash-can',
  check: 'solid/check',
  info: 'solid/circle-info',
  lightbulb: 'solid/lightbulb',
  warning: 'solid/triangle-exclamation',
  house: 'solid/house',
  layers: 'solid/layer-group',
  book: 'solid/book',
  'book-open': 'solid/book-open',
  toolbox: 'solid/toolbox',
  users: 'solid/users',
  play: 'solid/circle-play',
  'play-s': 'solid/play',
  pause: 'solid/pause',
  comments: 'solid/comments',
  'pen-nib': 'solid/pen-nib',
  'shield-halved': 'solid/shield-halved',
  'chart-column': 'solid/chart-column',
  'chart-line': 'solid/chart-line',
  mug: 'solid/mug-hot',
  reset: 'solid/rotate-left',
  link: 'solid/link',
  eye: 'solid/eye',
  inventario: 'solid/box-archive',
  server: 'solid/server',
  gamepad: 'solid/gamepad',
  globe: 'solid/globe',
  filter: 'solid/filter',
  sliders: 'solid/sliders',
  terminal: 'solid/terminal',
  heart: 'solid/heart',
  pin: 'solid/thumbtack',
  hourglass: 'solid/hourglass-half',
  signal: 'solid/signal',
  linkedin: 'brands/linkedin',
  youtube: 'brands/youtube',
  github: 'brands/github',
};

let cache;
export function spriteSymbols() {
  if (cache) return cache;
  cache = Object.entries(ICONOS)
    .map(([id, file]) => {
      const svg = fs.readFileSync(path.join(FA, `${file}.svg`), 'utf8');
      const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
      const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => `<path d="${m[1]}"/>`).join('');
      return `<symbol id="i-${id}" viewBox="${viewBox}">${paths}</symbol>`;
    })
    .join('');
  return cache;
}

/** Ícono y etiqueta por tipo de recurso. */
export const ICONO_TIPO = {
  biblioteca: 'book',
  herramienta: 'toolbox',
  guia: 'book-open',
  canal: 'play',
  comunidad: 'users',
  sitio: 'globe',
};
export const ETIQUETA_TIPO = {
  biblioteca: 'Biblioteca',
  herramienta: 'Herramienta',
  guia: 'Guía',
  canal: 'Canal',
  comunidad: 'Comunidad',
  sitio: 'Sitio',
};
