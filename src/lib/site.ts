/** Datos y utilidades compartidas del server. */
import { getCollection } from 'astro:content';

export const SITE = {
  nombre: 'El servidor de Lourdes',
  lema: 'Comparto contenido para users que quieren crecer en este mundo sin respawn.',
  autora: 'Lourdes Pedaci',
  firma: 'Experience Designer, Lic. en Tecnología Educativa, Prof. de Informática',
  /** La firma separada en títulos, para mostrarlos como ítems */
  titulos: ['Experience Designer', 'Lic. en Tecnología Educativa', 'Prof. de Informática'],
  descripcion:
    'Materiales didácticos, charlas, cursos gratuitos y recursos tech para estudiantes de informática, egresados y cualquier internauta que quiera seguir aprendiendo.',
  redes: {
    linkedin: 'https://www.linkedin.com/in/lourdes-pedaci/',
    github: 'https://github.com/lpedaci',
    portfolio: 'https://lpedaci.github.io/portfolio/',
    youtube: 'https://www.youtube.com/@elservidordelourdes',
    cafecito: 'https://cafecito.app/servidorlourdes',
    taller: 'https://lpedaci.github.io/taller-primerempleo/',
  },
  legal: 'Todos los links pertenecen a sitios de terceros. Solo comparto material. Si podés, comprá los libros: ayudás a sus creadores.',
};

/** Ruta interna con el `base` del sitio. */
export const url = (p = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;

export const CERT: Record<string, { label: string; clase: string }> = {
  'gratis-con-certificado': { label: 'Gratis con certificado', clase: 'badge--cert' },
  'gratis-con-limite': { label: 'Gratis con límite', clase: 'badge--limite' },
  'gratis-sin-certificado': { label: 'Gratis sin certificado', clase: 'badge--sin' },
  pago: { label: 'Pago', clase: 'badge--pago' },
};

export const TIPO_POST: Record<string, string> = {
  charla: 'Charla',
  guia: 'Guía',
  recopilacion: 'Recopilación',
};

const fmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const fecha = (d: Date) => fmt.format(d);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "octubre de 2026" */
export const mesAnio = (d: Date) => fmtMes.format(d);

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Cursos y recursos visibles: los caídos no se muestran. */
export async function datos() {
  const [threads, posts, cursos, recursos, categorias, etiquetas] = await Promise.all([
    getCollection('threads'),
    getCollection('posts'),
    getCollection('cursos', (c) => c.data.estado !== 'caido'),
    getCollection('recursos', (r) => r.data.estado !== 'caido'),
    getCollection('categorias'),
    getCollection('etiquetas'),
  ]);
  threads.sort((a, b) => a.data.orden - b.data.orden);
  // Las categorías respetan el orden del JSON (el de las vistas originales de Notion).
  const ordenCat = (await import('../data/categorias.json')).default.map((c: { id: string }) => c.id);
  categorias.sort((a, b) => ordenCat.indexOf(a.id) - ordenCat.indexOf(b.id));
  posts.sort((a, b) => +b.data.actualizado - +a.data.actualizado || a.data.titulo.localeCompare(b.data.titulo, 'es'));
  const colorEtiqueta = new Map(etiquetas.map((e) => [e.data.nombre, e.data.color]));
  return { threads, posts, cursos, recursos, categorias, etiquetas, colorEtiqueta };
}
