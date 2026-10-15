#!/usr/bin/env node
/** Regenera public/og/og.png (1200x630) a partir de scripts/og.html con Chrome o Edge en modo headless. */
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
const salida = path.join(ROOT, 'public', 'og', 'og.png');
execFileSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=1200,630',
  `--screenshot=${salida}`,
  pathToFileURL(path.join(ROOT, 'scripts', 'og.html')).href,
]);
console.log(`Listo: ${path.relative(ROOT, salida)}`);
