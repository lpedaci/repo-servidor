#!/usr/bin/env node
/**
 * Importa el export de Notion ("Markdown & CSV", con subpáginas) que vive en /_import/notion/
 * y genera el contenido del server:
 *
 *   src/content/posts/<slug>.md        Posts (charlas, guías, recopilaciones)
 *   src/assets/posts/<slug>/*          Imágenes de cada post (las optimiza astro:assets)
 *   src/data/cursos.json               Tabla de cursos normalizada
 *   src/data/recursos.json             Bookmarks y bases chicas convertidas en recursos
 *   src/data/etiquetas.json            Etiquetas canónicas con sinónimos
 *   _import/reporte-importacion.md     Qué se importó, qué se descartó y qué revisar
 *
 * Se corre una sola vez (o cuando haya que reimportar): `npm run import`.
 * Después el repo es la fuente: no se vuelve a tocar Notion.
 *
 * Si se reimporta, los campos `estado` y `revisado` de cursos y recursos que ya existían se conservan.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { RECURSOS as OVERRIDES } from './import-overrides.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SRC = path.join(ROOT, '_import', 'notion');
const SITE = path.join(SRC, 'El servidor de Lourdes');
const OUT_POSTS = path.join(ROOT, 'src', 'content', 'posts');
const OUT_ASSETS = path.join(ROOT, 'src', 'assets', 'posts');
const OUT_DATA = path.join(ROOT, 'src', 'data');
const HOY = new Date().toISOString().slice(0, 10);

const report = { posts: [], imagenes: 0, descartadas: [], links: new Set(), noConvertido: [], altGenerico: [], unificaciones: [] };

// ---------------------------------------------------------------- utilidades

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/\+\+/g, ' plus ')
    .replace(/#/g, ' sharp ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');

/** Saca el hash de 32 caracteres que Notion agrega a archivos y carpetas. */
const sinHash = (s) => s.replace(/\s[0-9a-f]{32}(_all)?(?=\.\w+$|$)/, '');

/**
 * Resuelve una ruta relativa del export tolerando lo que cambia al descomprimir en Windows
 * (por ejemplo, carpetas que terminaban en espacio quedan con "_").
 */
function resolver(dir, rel) {
  let actual = dir;
  for (const seg of decodeURIComponent(rel).split('/')) {
    if (seg === '..') {
      actual = path.dirname(actual);
      continue;
    }
    // Windows ignora espacios finales al consultar rutas: se compara contra el listado real.
    const nombres = fs.existsSync(actual) ? fs.readdirSync(actual) : [];
    if (nombres.includes(seg)) {
      actual = path.join(actual, seg);
      continue;
    }
    const norm = (n) => n.normalize('NFC').replace(/[\s_]+$/, '').replace(/[?:*"<>|]/g, '_');
    const hit = nombres.find((n) => norm(n) === norm(seg));
    actual = path.join(actual, hit || seg);
  }
  return actual;
}

const read = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const lista = (s) =>
  (s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function findFile(dir, prefix, ext = '.md') {
  const f = fs.readdirSync(dir).find((n) => n.startsWith(prefix) && n.endsWith(ext) && !n.endsWith('_all' + ext));
  if (!f) throw new Error(`No encontré "${prefix}*${ext}" en ${dir}`);
  return path.join(dir, f);
}
function findAll(dir, prefix) {
  const f = fs.readdirSync(dir).find((n) => n.startsWith(prefix) && n.endsWith('_all.csv'));
  return f ? path.join(dir, f) : findFile(dir, prefix, '.csv');
}

/** Emojis fuera: el server usa íconos. Los números en tecla (1️⃣) pasan a "Paso 1." */
function sinEmojis(s) {
  return s
    .replace(/([0-9])️?⃣/g, 'Paso $1.')
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]️?(‍[\p{Extended_Pictographic}]️?)*/gu, '')
    .replace(/️/g, '')
    .replace(/[ \t]{2,}/g, ' ');
}

/** Sin rayas en el copy: " – " y " — " pasan a coma. */
const sinRayas = (s) => s.replace(/\s+[–—]\s+/g, ', ').replace(/[–—]/g, '-');

const limpiarTexto = (s) => sinRayas(sinEmojis(s)).replace(/\s+([,.;:])/g, '$1').trim();

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Texto plano desde markdown: para descripciones. */
function plano(md) {
  return limpiarTexto(
    md
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`>#]+/g, '')
      .replace(/\s+/g, ' ')
  );
}

/** Corta en el límite de oración más cercano a `max` caracteres. */
function recortar(s, max = 200) {
  if (s.length <= max) return s;
  const corte = s.slice(0, max);
  const punto = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('.» '));
  if (punto > 80) return corte.slice(0, punto + 1);
  return corte.replace(/\s+\S*$/, '') + '…';
}

// ---------------------------------------------------------------- etiquetas canónicas

/** canónico <- sinónimos. Lo que no está acá queda como viene. */
const CANON_TEMAS = {
  'Análisis empresarial': ['Analisis empresarial'],
  'Data Science': ['Data Science/Analysis'],
  SQL: ['SQL / MySQL'],
  'Gestión de Proyectos': ['PM'],
  'Seguridad Informática': ['Seguridad de la Información'],
  'HTML y CSS': ['HTML5 + CSS3', 'HTML/CSS'],
  'Node.js': ['Node.JS'],
  TypeScript: ['Typescript'],
  Svelte: ['SvelteJS'],
  Java: ['JAVA'],
  'Desarrollo Mobile': ['Apps Moviles', 'Mobile Dev'],
  'Power BI': ['PowerBI'],
  'Inteligencia Artificial': ['IA', 'AI'],
  'Algoritmos y Estructuras de Datos': ['Algoritmos / Estructura de Datos', 'Data Structure/Algorithms'],
  'Videojuegos': ['Video Games', 'VideoGames'],
  'Git y GitHub': ['Git / GitHub', 'GitHub'],
  'Programación': ['Programación base', 'Programación Web', 'Incluye múltiples lenguajes de programación'],
  'Desarrollo Profesional': ['Desarrollo profesional'],
  'Ciencias de la Computación': ['Computer Science'],
};
const CANON_PROVEEDORES = {
  Cisco: ['CISCO'],
  freeCodeCamp: ['FreeCodeCamp'],
  midudev: ['Plataforma de @midudev'],
  FutureLearn: ['Future Learn'],
  'Programas gubernamentales': ['Prog. Gubernamentales'],
  '{desafío} latam_': ['{desafío} latam_ Academia'],
};
const CANON_IDIOMAS = {
  Inglés: ['Poner traductor de Google al sitio!'],
  Francés: ['Frances'],
};

function canonizador(mapa, tipo) {
  const inv = new Map();
  for (const [c, sins] of Object.entries(mapa)) for (const s of sins) inv.set(s.toLowerCase(), c);
  const usados = new Map();
  return (v) => {
    const c = inv.get(v.toLowerCase()) ?? v;
    if (c !== v) usados.set(`${v} → ${c}`, (usados.get(`${v} → ${c}`) ?? 0) + 1);
    canonizador.usados ??= {};
    canonizador.usados[tipo] = usados;
    return c;
  };
}
const canonTema = canonizador(CANON_TEMAS, 'temas');
const canonProv = canonizador(CANON_PROVEEDORES, 'proveedores');
const canonIdioma = canonizador(CANON_IDIOMAS, 'idiomas');
const uniq = (a) => [...new Set(a)];

// ---------------------------------------------------------------- categorías del Thread de Cursos

/** Las "vistas" por tema de Notion: cada CSV dice qué cursos curó Lourdes en cada categoría. */
const CATEGORIAS = [
  { id: 'programacion', csv: 'Cursos solo de Programación' },
  { id: 'gestion-y-soft-skills', csv: 'Cursos sobre Gestión de Proyectos' },
  { id: 'diseno-ux-ui', csv: 'Cursos sobre Diseño UX UI' },
  { id: 'ciudadania-y-seguridad', csv: 'Cursos sobre Ciudadanía Digital' },
  { id: 'datos-y-ofimatica', csv: 'Cursos sobre Ofimática' },
  { id: 'marketing-y-finanzas', csv: 'Cursos sobre Marketing' },
];

// ---------------------------------------------------------------- posts

const THREAD_CURSOS_DIR = 'Thread de Cursos [2025] Updated';

const POSTS = [
  {
    prefix: 'Charla Carreras Info y afines',
    slug: 'charla-carreras-info-y-afines',
    titulo: 'Charla: Carreras Info y afines',
    bajada: 'Si no tenés idea de qué estudiar, arrancá por acá: tests vocacionales, inteligencias múltiples y cómo investigar carreras e instituciones.',
    thread: 'cursando',
    tipo: 'charla',
    temas: ['Orientación vocacional', 'Desarrollo Profesional'],
    publicado: '2021-11-25',
    destacado: true,
  },
  {
    prefix: 'Charla El Perfil Profesional',
    slug: 'charla-el-perfil-profesional',
    titulo: 'Charla: El Perfil Profesional, Currículum Vitae y Porfolio laboral',
    bajada: 'Cómo armar tu CV y tu porfolio, certificar tu nivel de inglés y prepararte para las primeras entrevistas.',
    thread: 'cursando',
    tipo: 'charla',
    temas: ['Empleabilidad', 'Desarrollo Profesional'],
    publicado: '2021-11-18',
    destacado: true,
  },
  {
    prefix: 'Recursos Tech++',
    slug: 'recursos-tech-plus-plus',
    titulo: 'Recursos Tech++',
    bajada: 'Bibliotecas, manuales, cheatsheets y cuentas para seguir. Material variado en español e inglés, casi todo gratis.',
    thread: 'tecnologia',
    tipo: 'recopilacion',
    temas: ['Programación', 'Desarrollo Web'],
    publicado: '2024-03-30',
    destacado: true,
  },
  {
    prefix: 'Herramientas para Desarrollo Web',
    slug: 'herramientas-para-desarrollo-web',
    titulo: 'Herramientas para Desarrollo Web',
    bajada: 'Por dónde empezar en desarrollo web y una caja de herramientas para HTML, CSS y diseño UX/UI.',
    thread: 'tecnologia',
    tipo: 'recopilacion',
    temas: ['Desarrollo Web', 'HTML y CSS', 'UX', 'UI'],
    publicado: '2021-11-26',
  },
  {
    prefix: 'Documentos académicos',
    slug: 'documentos-academicos',
    titulo: 'Documentos académicos: ¿cómo diseñarlos adecuadamente?',
    bajada: 'Portada, índice, encabezados, citas y referencias: las partes de un desarrollo textual profesional, paso a paso.',
    thread: 'variaditos',
    tipo: 'guia',
    temas: ['Ofimática', 'Escritura académica'],
    publicado: '2021-03-15',
  },
  {
    prefix: 'Desarrollos textuales el Proyecto',
    slug: 'desarrollos-textuales-el-proyecto',
    titulo: 'Desarrollos textuales: el Proyecto',
    bajada: 'Qué es un proyecto, sus etapas y una estructura general para armarlo sin perderte.',
    thread: 'variaditos',
    tipo: 'guia',
    temas: ['Gestión de Proyectos', 'Escritura académica'],
    publicado: '2021-04-10',
  },
  {
    prefix: 'Desarrollos textuales la Monografía',
    slug: 'desarrollos-textuales-la-monografia',
    titulo: 'Desarrollos textuales: la Monografía',
    bajada: 'Qué es una monografía, qué partes lleva y cómo encararla.',
    thread: 'variaditos',
    tipo: 'guia',
    temas: ['Escritura académica'],
    publicado: '2021-04-12',
  },
  {
    prefix: 'Las Presentaciones Multimedia',
    slug: 'presentaciones-multimedia',
    titulo: 'Las Presentaciones Multimedia y sus consideraciones',
    bajada: 'Plataformas para armar presentaciones y las claves de diseño para que se entiendan.',
    thread: 'variaditos',
    tipo: 'guia',
    temas: ['Ofimática', 'Comunicación', 'Diseño'],
    publicado: '2021-02-01',
  },
  {
    prefix: 'Los Mapas Conceptuales',
    slug: 'mapas-conceptuales',
    titulo: 'Los Mapas Conceptuales',
    bajada: 'Qué son, para qué sirven y tres plataformas para diseñarlos.',
    thread: 'variaditos',
    tipo: 'guia',
    temas: ['Técnicas de estudio'],
    publicado: '2021-05-03',
  },
  {
    prefix: 'Recursos multimedia gratuitos',
    slug: 'recursos-multimedia-gratuitos',
    titulo: 'Recursos multimedia gratuitos',
    bajada: 'Licencias Creative Commons explicadas y plataformas para conseguir imágenes, íconos y plantillas sin problemas legales.',
    thread: 'variaditos',
    tipo: 'recopilacion',
    temas: ['Diseño', 'Ciudadanía Digital'],
    publicado: '2021-01-20',
  },
  {
    prefix: '¿Cómo organizar tu tiempo de cursada',
    slug: 'como-organizar-tu-tiempo-de-cursada',
    titulo: '¿Cómo organizar tu tiempo de cursada?',
    bajada: 'Técnicas y apps para planificar la semana, priorizar tareas y llegar a las entregas.',
    thread: 'variaditos',
    tipo: 'guia',
    temas: ['Gestión de tiempo', 'Técnicas de estudio'],
    publicado: '2021-03-01',
  },
  {
    prefix: 'El correo formal y su importancia',
    slug: 'el-correo-formal',
    titulo: 'El correo formal y su importancia',
    bajada: 'Cómo configurar tu casilla y redactar un mail claro, conciso y profesional.',
    thread: 'variaditos',
    tipo: 'guia',
    temas: ['Comunicación', 'Empleabilidad'],
    publicado: '2021-02-15',
  },
];
const slugPorPrefijo = (nombre) => POSTS.find((p) => nombre.startsWith(p.prefix))?.slug;

/** Imágenes que en Notion hacían de título: pasan a ser títulos HTML reales. */
const BANNERS = {
  'repBooks1.png': 'Repositorio de manuales y herramientas',
  'cuentasfollow1.png': 'Cuentas recomendadas',
  'htmlcss0.png': 'Desarrollo en HTML5 y CSS3',
  'uxuidesign0.png': 'Diseño UX y UI',
  'devdesign_varios.png': 'Desarrollo y diseño web (variado)',
  'contenido0.png': null, // "Contenido": el índice lateral ya cumple esa función
};
/** Decoración de Notion que no aporta en el sitio nuevo. */
const DESCARTAR = new Set(['MarcadeAgua_03.png', 'dividerCat.gif', 'work-from-home.png', 'webskills_sitepreview06.gif']);

/** Textos alternativos escritos a mano para imágenes sin descripción útil en Notion. */
const ALT = {
  'charla-carreras-info-y-afines/Untitled.png':
    'Meme de Los Simpson: Homero frente a un río que se divide entre un paisaje soleado y uno sombrío, con el texto "Eligiendo cómo iniciarme en programación".',
  'herramientas-para-desarrollo-web/Untitled.png':
    'Meme de Los Simpson: Homero frente a un río que se divide entre un paisaje soleado y uno sombrío, con el texto "Eligiendo cómo iniciarme en programación".',
  'charla-carreras-info-y-afines/teoriaholland.png': 'Hexágono de la teoría de Holland con los seis tipos de personalidad RIASEC.',
  'herramientas-para-desarrollo-web/webskills_siteFAQ.png': 'Captura de la sección de preguntas frecuentes del sitio Web Skills.',
  'recursos-tech-plus-plus/Captura_de_pantalla_2024-03-30_203905.png': 'Captura de la pantalla de inicio de sesión de la biblioteca de Dogram Code.',
  'recursos-tech-plus-plus/Captura_de_pantalla_2024-03-30_205815.png': 'Captura del panel principal de Dogram Code con sus secciones.',
};

// ---------------------------------------------------------------- recursos

const recursos = new Map(); // url normalizada -> recurso
const autoIds = new Set();

const normUrl = (u) => u.trim().replace(/\/+$/, '').replace(/^http:\/\//, 'https://');

function tipoRecurso(url, nombre, extra = '') {
  const h = host(url);
  const t = `${nombre} ${extra}`.toLowerCase();
  if (/youtube|youtu\.be|twitch/.test(h)) return 'canal';
  if (/comunidad|mujeres en tecnolog|chicas en tecnolog|write the docs|sysarmy/.test(t)) return 'comunidad';
  if (/libro|biblioteca|library|pdf|drive\.google\.com\/drive|librotecarios|dogram/.test(t + h)) return 'biblioteca';
  if (/guía|guia|guide|handbook|cheatsheet|tutorial|devhints|manual|fundamentals|entrevistas|documentaci/.test(t)) return 'guia';
  if (/generador|generator|icons|íconos|iconos|illustration|palet|gradient|mesh|designer|builder|shaper|tool|herramienta|test/.test(t)) return 'herramienta';
  return 'sitio';
}

function nombreDesdeUrl(url, contexto = '') {
  const h = host(url);
  if (h.includes('drive.google.com') || h.includes('docs.google.com')) return contexto ? `Presentación: ${contexto}` : 'Documento en Google Drive';
  if (h.includes('youtube') || h.includes('youtu.be')) return 'Video en YouTube';
  return h;
}

function addRecurso({ url, nombre, descripcion = '', tipo, temas = [], idioma = [], gratis = true, thread, post }) {
  const key = normUrl(url);
  const existente = recursos.get(key);
  if (existente) {
    if (post && !existente.aparece_en.includes(post)) existente.aparece_en.push(post);
    if (!existente.descripcion && descripcion) existente.descripcion = descripcion;
    existente.temas = uniq([...existente.temas, ...temas.map(canonTema)]);
    return existente.id;
  }
  nombre = limpiarTexto(nombre.replace(/\*\*/g, '')).replace(/\s*[|·]\s*/g, ': ').replace(/:\s*$/, '');
  const libre = (base, ids) => {
    if (!ids.has(base)) return base;
    let n = 2;
    while (ids.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  };
  // Primero el id automático (sin choques entre automáticos), después la corrección a mano para ese id.
  let id = libre(slugify(nombre) || slugify(host(url)), autoIds);
  autoIds.add(id);
  const ov = OVERRIDES[id];
  if (ov) id = ov.id ?? id;
  id = libre(id, new Set([...recursos.values()].map((r) => r.id)));
  if (ov) {
    nombre = ov.nombre ?? nombre;
    descripcion = ov.descripcion ?? descripcion;
    tipo = ov.tipo ?? tipo;
    gratis = ov.gratis ?? gratis;
  }
  recursos.set(key, {
    id,
    nombre,
    url: url.trim(),
    descripcion: recortar(limpiarTexto(descripcion)),
    tipo: tipo ?? tipoRecurso(url, nombre, descripcion),
    temas: uniq(temas.map(canonTema)),
    idioma: uniq(idioma.map(canonIdioma)),
    gratis,
    thread,
    aparece_en: post ? [post] : [],
    revisado: HOY,
    estado: 'activo',
  });
  report.links.add(url.trim());
  return id;
}

// ---------------------------------------------------------------- conversión de una página

/** Separa los <aside> de Notion (pueden anidarse) en un árbol. */
function parseAsides(md) {
  const root = { children: [] };
  const stack = [root];
  let buf = '';
  const re = /<aside>|<\/aside>/g;
  let last = 0;
  let m;
  while ((m = re.exec(md))) {
    buf = md.slice(last, m.index);
    if (buf) stack.at(-1).children.push(buf);
    if (m[0] === '<aside>') {
      const node = { aside: true, children: [] };
      stack.at(-1).children.push(node);
      stack.push(node);
    } else if (stack.length > 1) stack.pop();
    last = re.lastIndex;
  }
  if (last < md.length) stack.at(-1).children.push(md.slice(last));
  return root.children;
}

function profundidad(node) {
  if (typeof node === 'string') return 0;
  return 1 + Math.max(0, ...node.children.map(profundidad));
}

function tipoCallout(texto) {
  const t = texto.trimStart();
  if (/^(⚠|❗|‼|🚨)/u.test(t)) return 'aviso';
  if (/^(💡|📝)/u.test(t)) return 'idea';
  return 'tip';
}

function convertirPagina(file, post) {
  const dirPagina = path.dirname(file);
  let md = read(file);
  const assetsDir = path.join(OUT_ASSETS, post.slug);
  fs.rmSync(assetsDir, { recursive: true, force: true });
  const usadas = new Map();

  // Título: lo pone el layout.
  md = md.replace(/^# .*\n/, '');
  // "Volver a El servidor de Lourdes": el sitio tiene navegación propia.
  md = md.replace(/<aside>\s*<img[^>]*work-from-home[^>]*\/>\s*Volver a[\s\S]*?<\/aside>/g, '');
  // Toggles de índice de Notion.
  md = md.replace(/^- \*\*\*Expandir\*\*\*\s*$/gm, '');
  // Negritas rotas por Notion: [**X](url)** -> [**X**](url), "****" sueltos.
  md = md.replace(/\[\*\*([^\]]+)\]\(([^)]+)\)\*\*/g, '[**$1**]($2)').replace(/\*\*\*\*/g, '');
  // Links doblemente envueltos: [[url](url)](url) -> [url](url)
  md = md.replace(/\[\[([^\]]+)\]\(([^)]+)\)\]\(\2\)/g, '[$1]($2)');

  // Títulos: el nivel más alto del cuerpo pasa a ser h2 y se quitan las negritas.
  const niveles = [...md.matchAll(/^(#{1,6}) /gm)].map((m) => m[1].length);
  const min = niveles.length ? Math.min(...niveles) : 2;
  const shift = 2 - min;
  md = md.replace(/^(#{1,6}) +(.*)$/gm, (_, h, t) => {
    const nivel = Math.min(6, Math.max(2, h.length + shift));
    const txt = t.replace(/\*\*/g, '').replace(/\*/g, '').trim();
    return txt ? `${'#'.repeat(nivel)} ${txt}` : '';
  });

  // Imágenes.
  let ultimoTitulo = post.titulo;
  const lineas = md.split('\n');
  const salida = [];
  for (let i = 0; i < lineas.length; i++) {
    let linea = lineas[i];
    const h = linea.match(/^#{2,6} (.*)/);
    if (h) ultimoTitulo = h[1];
    const img = linea.match(/^!\[(.*?)\]\((.*?)\)\s*$/);
    if (img) {
      let [, alt, src] = img;
      if (/^https?:/.test(src)) {
        // Imagen remota (blog original o tweet): se mantiene, con texto alternativo.
        alt = alt.replace(/\*/g, '').trim();
        if (!alt) {
          alt = `Ilustración: ${ultimoTitulo}`;
          report.altGenerico.push(`${post.slug}: ${src}`);
        }
        salida.push(`![${limpiarTexto(alt)}](${src})`);
        continue;
      }
      const abs = resolver(dirPagina, src);
      const base = path.basename(abs);
      if (DESCARTAR.has(base)) {
        report.descartadas.push(`${post.slug}: ${base} (decoración de Notion)`);
        continue;
      }
      if (base in BANNERS) {
        report.descartadas.push(`${post.slug}: ${base} (banner con texto, reemplazado por título HTML)`);
        if (BANNERS[base]) {
          salida.push(`## ${BANNERS[base]}`);
          ultimoTitulo = BANNERS[base];
        }
        continue;
      }
      if (!fs.existsSync(abs)) {
        report.noConvertido.push(`${post.slug}: imagen no encontrada ${src}`);
        continue;
      }
      fs.mkdirSync(assetsDir, { recursive: true });
      const nombre = slugify(base.replace(/\.\w+$/, '')) || 'imagen';
      const esGif = /\.gif$/i.test(base);
      const destName = `${nombre}${esGif ? '.webp' : path.extname(base).toLowerCase()}`;
      usadas.set(destName, { abs, esGif });
      // Texto alternativo: el de Notion si es una descripción real, si no el escrito a mano o uno por contexto.
      let altTxt = alt.replace(/\*/g, '').trim();
      const altEsArchivo = !altTxt || /\.(png|gif|jpe?g)$/i.test(altTxt) || /^untitled/i.test(altTxt);
      if (altEsArchivo) {
        altTxt = ALT[`${post.slug}/${base}`];
        // ¿La línea siguiente (no vacía) es un epígrafe en itálica?
        const sig = lineas.slice(i + 1).find((l) => l.trim());
        if (!altTxt && sig && /^\*[^*].*\*$/.test(sig.trim())) altTxt = sig.trim().replace(/^\*|\*$/g, '');
        if (!altTxt) {
          altTxt = `Captura ilustrativa: ${ultimoTitulo}`;
          report.altGenerico.push(`${post.slug}/${destName}`);
        }
      }
      salida.push(`![${limpiarTexto(altTxt)}](../../assets/posts/${post.slug}/${destName})`);
      continue;
    }
    salida.push(linea);
  }
  md = salida.join('\n');

  // Links internos de Notion -> rutas del sitio.
  md = md.replace(/\]\(((?:\.\.\/)?[^)]*?\.md)\)/g, (m, href) => {
    const nombre = sinHash(path.basename(decodeURIComponent(href)).replace(/\.md$/, ''));
    if (nombre === 'El servidor de Lourdes') return '](/)';
    const s = slugPorPrefijo(nombre);
    if (s) return `](/posts/${s}/)`;
    if (nombre.startsWith('Thread de Cursos')) return '](/cursos/)';
    report.noConvertido.push(`${post.slug}: link interno sin destino (${nombre})`);
    return m;
  });

  // Bases de Notion enlazadas dentro del post -> lista de recursos.
  md = md.replace(/^\[([^\]]+)\]\(([^)]+\.csv)\)\s*$/gm, (m, texto, href) => {
    const csvPath = resolver(dirPagina, href);
    const allPath = csvPath.replace(/\.csv$/, '_all.csv');
    const filas = parseCSV(read(fs.existsSync(allPath) ? allPath : csvPath));
    const ids = filas
      .filter((f) => f.URL)
      .map((f) =>
        addRecurso({
          url: f.URL,
          nombre: f.Name,
          tipo: /youtu/.test(f.URL) ? 'canal' : 'guia',
          temas: post.temas,
          idioma: ['Español'],
          thread: post.thread,
          post: post.slug,
        })
      );
    return `### ${limpiarTexto(texto)}\n\n${ids.map((id) => `::recurso{#${id}}`).join('\n\n')}`;
  });

  // Callouts (con su anidamiento) y bookmarks.
  const nodos = parseAsides(md);
  const render = (node, enCallout = null) => {
    if (typeof node === 'string') return bookmarks(node, enCallout);
    const inner = node.children.map((c) => (typeof c === 'string' ? c : '\0')).join('');
    let texto = inner.replace(/^\s*<img src="notion:\/\/custom_emoji[^>]*\/>\s*/, '');
    const tipo = tipoCallout(texto);
    const descripcion = recortar(plano(texto.replace(/^\[.*\]\(https?:[^)]+\)\s*$/gm, '').replace(/\0/g, '')), 220);
    const ctx = { descripcion };
    const cuerpo = node.children
      .map((c, i) => {
        let s = typeof c === 'string' ? render(c, ctx) : render(c, ctx);
        if (i === 0 && typeof c === 'string') s = s.replace(/^\s*<img src="notion:\/\/custom_emoji[^>]*\/>\s*/, '');
        return s;
      })
      .join('\n\n')
      .replace(/^ (?=\S)/gm, '')
      .trim();
    const colons = ':'.repeat(3 + profundidad(node) - 1);
    return `\n\n${colons}callout{tipo="${tipo}"}\n${cuerpo}\n${colons}\n\n`;
  };

  function bookmarks(texto, ctx) {
    return texto.replace(/^\[([^\]]*)\]\((https?:[^)\s]+)\)\s*$/gm, (m, label, url) => {
      const h = host(url);
      if (h === 'apption.co') {
        report.descartadas.push(`${post.slug}: embed de apption.co (${url})`);
        return '';
      }
      if (h === 'twitter.com' || h === 'x.com') {
        const user = url.match(/(?:twitter|x)\.com\/([^/]+)/)?.[1];
        report.links.add(url);
        return `- [Hilo de @${user} en X](${url})`;
      }
      const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
      if (yt && (label === url || !label.trim())) {
        report.links.add(url);
        return `::video{id="${yt[1]}"}`;
      }
      const esUrlPelada = !label.trim() || label.trim() === url;
      const nombre = esUrlPelada ? nombreDesdeUrl(url, post.titulo.replace(/^Charla: /, '')) : label;
      const id = addRecurso({
        url,
        nombre,
        descripcion: ctx?.descripcion ?? '',
        temas: post.temas,
        thread: post.thread,
        post: post.slug,
      });
      return `\n::recurso{#${id}}\n`;
    });
  }

  md = nodos.map((n) => render(n)).join('');

  // Limpieza final de texto.
  md = md
    .split('\n')
    .map((l) =>
      l.startsWith('![') || l.startsWith('::')
        ? l
        : sinRayas(sinEmojis(l))
            .replace(/[ \t]+$/, '')
            // Un espacio inicial suelto queda al sacar el emoji de un callout.
            .replace(/^ (?=\S)/, '')
            // "***texto ***" (espacio que dejó el emoji antes del cierre) no se interpreta como énfasis.
            .replace(/(\S) +(\*{2,3})(?=[\s.,;:]|$)/g, '$1$2')
            .replace(/(^|\s)(\*{2,3}) +(?=\S)/g, '$1$2')
    )
    .join('\n')
    .replace(/^\s*>\s*$/gm, '')
    // Separadores y directivas siempre entre líneas en blanco.
    .replace(/\n*^(---|:{2,}[a-z].*|:{3,})$\n*/gm, '\n\n$1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { md, usadas, assetsDir };
}

async function copiarImagenes({ usadas, assetsDir }) {
  for (const [dest, { abs, esGif }] of usadas) {
    const out = path.join(assetsDir, dest);
    if (esGif) await sharp(abs, { animated: true }).webp({ quality: 70, effort: 5 }).toFile(out);
    else fs.copyFileSync(abs, out);
    report.imagenes++;
  }
}

function frontmatter(post, md) {
  const palabras = md.replace(/[#*_`!\[\]()>:-]/g, ' ').split(/\s+/).filter(Boolean).length;
  const y = (v) => JSON.stringify(v);
  return [
    '---',
    `titulo: ${y(post.titulo)}`,
    `bajada: ${y(post.bajada)}`,
    `thread: ${post.thread}`,
    `tipo: ${post.tipo}`,
    `temas: ${y(post.temas)}`,
    `publicado: ${post.publicado}`,
    `actualizado: ${HOY}`,
    `tiempoLectura: ${Math.max(1, Math.round(palabras / 200))}`,
    post.destacado ? 'destacado: true' : null,
    '---',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

// ---------------------------------------------------------------- cursos

function importarCursos() {
  const dir = path.join(SITE, THREAD_CURSOS_DIR);
  const filas = parseCSV(read(findAll(dir, 'Listado de los Cursos [Full]')));
  const membresia = new Map();
  for (const cat of CATEGORIAS) {
    for (const f of parseCSV(read(findFile(dir, cat.csv, '.csv')))) {
      const k = f.Name.trim();
      membresia.set(k, uniq([...(membresia.get(k) ?? []), cat.id]));
    }
  }
  const mapaCat = JSON.parse(read(path.join(OUT_DATA, 'categorias.json')));
  const temaACat = new Map();
  for (const c of mapaCat) for (const t of c.temas) temaACat.set(t, uniq([...(temaACat.get(t) ?? []), c.id]));

  const previos = leerPrevios('cursos.json');
  const ids = new Set();
  const cursos = filas.map((f) => {
    const nombre = limpiarTexto(f.Name);
    let id = slugify(nombre);
    if (ids.has(id)) {
      let n = 2;
      while (ids.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    ids.add(id);
    const temas = uniq(lista(f.Contenido).map(canonTema));
    let categoria = membresia.get(f.Name.trim()) ?? [];
    if (!categoria.length) categoria = uniq(temas.flatMap((t) => temaACat.get(t) ?? []));
    if (!categoria.length) report.noConvertido.push(`curso sin categoría: ${nombre}`);
    const duracion = f['Duración'] || 'Sin dato';
    const prev = previos.get(id);
    const c = {
      id,
      nombre,
      proveedores: uniq(lista(f['Ofrecido por']).map(canonProv)),
      url: f.URL.trim(),
      temas,
      categoria,
      duracion: duracion.replace(/(\d)(hs)\b/, '$1 $2'),
      duracionHoras: horas(duracion),
      idiomas: uniq(lista(f.Idioma).map(canonIdioma)),
      certificacion: certificacion(f['Certificación']),
      agregado: prev?.agregado ?? HOY,
      revisado: prev?.revisado ?? HOY,
      estado: prev?.estado ?? 'activo',
    };
    if (c.duracionHoras === undefined) delete c.duracionHoras;
    report.links.add(c.url);
    return c;
  });
  cursos.sort((a, b) => a.id.localeCompare(b.id));
  return cursos;
}

/** Horas aproximadas para ordenar. Un mes se estima en 40 hs (unas 10 por semana). */
function horas(d) {
  const valores = [...d.matchAll(/(\d+)\s*(hs|h|meses|mes|semanas)/gi)].map(([, n, u]) => {
    n = Number(n);
    if (/^mes/i.test(u)) return n * 40;
    if (/^semana/i.test(u)) return n * 10;
    return n;
  });
  return valores.length ? Math.max(...valores) : undefined;
}

function certificacion(v) {
  const s = (v || '').toLowerCase();
  if (s.includes('pago')) return 'pago';
  if (s.includes('c/certificado')) return 'gratis-con-certificado';
  if (s.includes('s/certificado')) return 'gratis-sin-certificado';
  if (s.includes('limita')) return 'gratis-con-limite';
  if (s.includes('inscripción previa')) {
    report.noConvertido.push(`Certificación "${v}" mapeada a gratis-con-limite (revisar)`);
    return 'gratis-con-limite';
  }
  report.noConvertido.push(`Certificación desconocida: "${v}"`);
  return 'gratis-con-limite';
}

function leerPrevios(nombre) {
  const p = path.join(OUT_DATA, nombre);
  if (!fs.existsSync(p)) return new Map();
  return new Map(JSON.parse(read(p)).map((x) => [x.id, x]));
}

// ---------------------------------------------------------------- recursos que vienen de bases chicas

function importarBasesChicas() {
  const dir = path.join(SITE, THREAD_CURSOS_DIR);
  const bases = [
    { prefix: 'Programación BD IA IoT', tipo: null },
    { prefix: 'Aprender Idiomas', tipo: null },
    { prefix: 'Canales & Playlists', tipo: 'canal' },
  ];
  for (const b of bases) {
    const csvFile = findAll(dir, b.prefix);
    const filas = parseCSV(read(csvFile));
    const subdir = path.join(dir, sinHash(path.basename(csvFile).replace(/\.csv$/, '')).replace(/_all$/, ''));
    for (const f of filas) {
      if (!f.URL) continue;
      const desc = descripcionDeFila(subdir, f.Name);
      const plataforma = lista(f.Plataforma).join(' ');
      addRecurso({
        url: f.URL,
        nombre: f.Name,
        descripcion: desc,
        tipo: b.tipo ?? (/youtube|yt /i.test(plataforma) ? 'canal' : /practicar/i.test(plataforma) ? 'herramienta' : tipoRecurso(f.URL, f.Name, desc)),
        temas: lista(f.Contenido),
        idioma: lista(f.Idioma),
        gratis: f['Subscripción'] ? lista(f['Subscripción']).includes('Gratis') : true,
        thread: 'cursos',
      });
      if (f['URL 1']) addRecurso({ url: f['URL 1'], nombre: `${f.Name} (extra)`, descripcion: desc, tipo: 'canal', temas: lista(f.Contenido), idioma: lista(f.Idioma), thread: 'cursos' });
    }
  }
}

/** Cada fila de una base de Notion es una página: se usa su primer párrafo como descripción. */
function descripcionDeFila(subdir, nombre) {
  if (!fs.existsSync(subdir)) return '';
  const limpio = nombre.replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 20);
  const f = fs.readdirSync(subdir).find((n) => n.endsWith('.md') && n.replace(/[^\p{L}\p{N} ]/gu, '').startsWith(limpio));
  if (!f) return '';
  const cuerpo = read(path.join(subdir, f))
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && !/^[\wÁ-úñ ]+: /.test(l) && !/^(!\[|\]\(|\[|https?:)/.test(l.trim()) && !/sketchnote/i.test(l));
  return recortar(plano(cuerpo[0] ?? '').replace(/^«|»$/g, ''), 200);
}

/** Links sueltos de la Home y del Thread de Cursos. */
function importarLinksSueltos() {
  const sueltos = [
    { url: 'https://github.com/DevCaress/guia-entrevistas-de-programacion?tab=readme-ov-file', nombre: 'Guía de entrevistas de programación (DevCaress)', descripcion: 'Repositorio con preguntas, consejos y recursos para preparar entrevistas técnicas de programación.', tipo: 'guia', temas: ['Programación', 'Empleabilidad'], idioma: ['Español'], thread: 'tecnologia' },
    { url: 'https://undef.edu.ar/siedweb/materiales.html', nombre: 'Materiales didácticos de la UNDEF', descripcion: 'Materiales didácticos del Sistema de Educación a Distancia de la Universidad de la Defensa Nacional.', tipo: 'biblioteca', temas: ['Docencia'], idioma: ['Español'], thread: 'tecnologia' },
    { url: 'https://calculatingempires.net/', nombre: 'Calculating Empires: A Genealogy of Technology and Power since 1500', descripcion: 'Mapa visual gigante que recorre cinco siglos de tecnología, poder y control. Para mirar con tiempo.', tipo: 'sitio', temas: ['Tecno y mundo digital'], idioma: ['Inglés'], thread: 'variaditos' },
    { url: 'https://brandesign.es/branding/consultoria/los-arquetipos-de-carl-jung-aplicados-en-la-estrategia-branding/', nombre: 'Los arquetipos de Carl Jung aplicados al branding', descripcion: 'Artículo de Brandesign sobre cómo usar los doce arquetipos de Jung para definir la personalidad de una marca.', tipo: 'guia', temas: ['Marketing', 'Diseño'], idioma: ['Español'], thread: 'variaditos' },
  ];
  for (const s of sueltos) addRecurso(s);

  const md = read(findFile(SITE, 'Thread de Cursos [2025] Updated'));
  let seccion = '';
  for (const linea of md.split('\n')) {
    const h = linea.match(/^## (.*)/);
    if (h) seccion = h[1];
    const m = linea.match(/^\[([^\]]+)\]\((https?:[^)]+)\)\s*$/);
    if (!m) continue;
    const sim = /Simulaciones/.test(seccion);
    addRecurso({
      url: m[2],
      nombre: m[1],
      descripcion: sim ? 'Simulación laboral virtual con casos reales de empresas. Mayormente en inglés.' : '',
      tipo: sim ? 'herramienta' : tipoRecurso(m[2], m[1]),
      temas: sim ? ['Empleabilidad', 'Desarrollo Profesional'] : ['Data Science'],
      idioma: sim ? ['Inglés'] : ['Español'],
      thread: 'cursos',
    });
  }
}

// ---------------------------------------------------------------- etiquetas.json

function generarEtiquetas(cursos, posts) {
  const cats = JSON.parse(read(path.join(OUT_DATA, 'categorias.json')));
  const colorDe = (t) => cats.find((c) => c.temas.includes(t))?.color ?? 't1';
  const todos = new Map();
  const sumar = (t) => todos.set(t, (todos.get(t) ?? 0) + 1);
  cursos.forEach((c) => c.temas.forEach(sumar));
  [...recursos.values()].forEach((r) => r.temas.forEach(sumar));
  posts.forEach((p) => p.temas.forEach(sumar));
  return [...todos.keys()]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((nombre) => ({ id: slugify(nombre), nombre, color: colorDe(nombre), sinonimos: CANON_TEMAS[nombre] ?? [] }));
}

// ---------------------------------------------------------------- main

async function main() {
  if (!fs.existsSync(SITE)) {
    console.error('No encontré el export de Notion en /_import/notion/. Mirá el README.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_POSTS, { recursive: true });
  fs.mkdirSync(OUT_ASSETS, { recursive: true });

  const previosRecursos = leerPrevios('recursos.json');

  for (const post of POSTS) {
    const file = findFile(SITE, post.prefix);
    const res = convertirPagina(file, post);
    await copiarImagenes(res);
    fs.writeFileSync(path.join(OUT_POSTS, `${post.slug}.md`), frontmatter(post, res.md) + res.md + '\n');
    report.posts.push(`${post.slug}.md  (${post.thread}, ${res.usadas.size} imágenes)`);
  }

  importarBasesChicas();
  importarLinksSueltos();
  const cursos = importarCursos();

  const listaRecursos = [...recursos.values()]
    .map((r) => {
      const prev = previosRecursos.get(r.id);
      if (prev) Object.assign(r, { estado: prev.estado, revisado: prev.revisado });
      if (!r.aparece_en.length) delete r.aparece_en;
      return r;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const etiquetas = generarEtiquetas(cursos, POSTS);
  const json = (v) => JSON.stringify(v, null, 2) + '\n';
  fs.writeFileSync(path.join(OUT_DATA, 'cursos.json'), json(cursos));
  fs.writeFileSync(path.join(OUT_DATA, 'recursos.json'), json(listaRecursos));
  fs.writeFileSync(path.join(OUT_DATA, 'etiquetas.json'), json(etiquetas));

  // Reporte
  const u = canonizador.usados ?? {};
  const unif = Object.entries(u).flatMap(([tipo, m]) => [...m].map(([k, n]) => `- ${tipo}: ${k} (${n})`));
  const r = [
    `# Reporte de importación (${HOY})`,
    '',
    `## Posts importados (${report.posts.length})`,
    ...report.posts.map((p) => `- ${p}`),
    '',
    `## Datos`,
    `- Cursos: ${cursos.length}`,
    `- Recursos: ${listaRecursos.length}`,
    `- Etiquetas canónicas: ${etiquetas.length}`,
    `- Imágenes copiadas: ${report.imagenes}`,
    `- Links externos encontrados: ${report.links.size}`,
    '',
    '## Unificación de etiquetas aplicada (revisar y avisar si alguna no va)',
    ...unif,
    '',
    '## Descartado a propósito',
    ...report.descartadas.map((d) => `- ${d}`),
    '',
    '## Imágenes con texto alternativo generado por contexto (conviene revisarlas)',
    ...report.altGenerico.map((d) => `- ${d}`),
    '',
    '## No se pudo convertir / revisar',
    ...(report.noConvertido.length ? report.noConvertido.map((d) => `- ${d}`) : ['- Nada.']),
    '',
  ];
  fs.writeFileSync(path.join(ROOT, '_import', 'reporte-importacion.md'), r.join('\n'));
  console.log(r.slice(0, 16).join('\n'));
  console.log(`\nReporte completo: _import/reporte-importacion.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
