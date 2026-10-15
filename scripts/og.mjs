#!/usr/bin/env node
/**
 * Regenera las imágenes Open Graph (1200x630) en public/og/ a partir de scripts/og.html,
 * con Chrome o Edge en modo headless. Una card por sección y una por thread (los posts usan la de su thread).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const candidatos = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chrome = candidatos.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('No encontré Chrome ni Edge. Definí CHROME_PATH con la ruta del navegador.');
  process.exit(1);
}

const leer = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', f), 'utf8'));
const activos = (f) => leer(f).filter((x) => x.estado === 'activo').length;
const cursos = activos('cursos.json');
const recursos = activos('recursos.json');
const threads = leer('threads.json');

const COLOR = { t1: '#b9bbf6', t2: '#f7ab6a', t3: '#f8de73', t4: '#b8d8c9', t5: '#f2b8d2', t6: '#a9d3f0' };
const datos = `${cursos} cursos|${recursos} recursos|${threads.length} threads`;

const cards = [
  {
    archivo: 'og',
    k: 'Lobby',
    t: 'Crecé en este mundo *sin respawn*',
    d: 'Materiales, charlas, cursos gratuitos y recursos tech para seguir aprendiendo.',
    c: COLOR.t1,
    s: datos,
  },
  {
    archivo: 'threads',
    k: 'Threads',
    t: 'Cuatro threads para *seguir aprendiendo*',
    d: 'Carrera y primer empleo, cursos gratuitos, tecnología y materiales para la cursada.',
    c: COLOR.t3,
    s: datos,
  },
  {
    archivo: 'cursos',
    k: 'Explorador de cursos',
    t: `${cursos} cursos *gratuitos*`,
    d: 'Filtrables por tema, proveedor, idioma y certificado. Para aprender sin gastar.',
    c: COLOR.t2,
    s: 'Con certificado|Sin certificado|En español e inglés',
  },
  {
    archivo: 'recursos',
    k: 'Explorador de recursos',
    t: `${recursos} recursos *tech*`,
    d: 'Bibliotecas, herramientas, guías, canales y comunidades para programar, diseñar y estudiar.',
    c: COLOR.t4,
    s: 'Gratis|Por tipo|Por thread',
  },
  {
    archivo: 'sobre',
    k: 'Sobre el server',
    t: 'Un server para *seguir aprendiendo*',
    d: 'Lo arma Lourdes Pedaci: Experience Designer, Lic. en Tecnología Educativa, Prof. de Informática.',
    c: COLOR.t5,
  },
  ...threads.map((th) => ({
    archivo: `thread-${th.id}`,
    k: 'Thread',
    t: th.corto,
    d: th.bajada,
    c: COLOR[th.color] ?? COLOR.t1,
  })),
];

const dir = path.join(ROOT, 'public', 'og');
fs.mkdirSync(dir, { recursive: true });
const plantilla = pathToFileURL(path.join(ROOT, 'scripts', 'og.html')).href;

for (const { archivo, ...params } of cards) {
  const salida = path.join(dir, `${archivo}.png`);
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--allow-file-access-from-files',
    '--virtual-time-budget=2000',
    '--window-size=1200,630',
    `--screenshot=${salida}`,
    `${plantilla}?${qs}`,
  ]);
  console.log(`Listo: ${path.relative(ROOT, salida)}`);
}
