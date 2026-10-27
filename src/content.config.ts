/**
 * Colecciones del server. Si un dato no cumple el esquema, el build falla: así se mantiene ordenado.
 * Dónde vive cada cosa: ver CLAUDE.md.
 */
import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const color = z.enum(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 'deep']);
const estado = z.enum(['activo', 'revisar', 'caido']);

const threads = defineCollection({
  loader: file('src/data/threads.json'),
  schema: z.object({
    id: z.string(),
    titulo: z.string(),
    corto: z.string(),
    bajada: z.string(),
    icono: z.string(),
    color,
    orden: z.number(),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/_*.md'], base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      titulo: z.string(),
      bajada: z.string(),
      thread: reference('threads'),
      tipo: z.enum(['charla', 'guia', 'recopilacion']),
      temas: z.array(z.string()),
      publicado: z.coerce.date(),
      actualizado: z.coerce.date(),
      tiempoLectura: z.number().optional(),
      portada: image().optional(),
      destacado: z.boolean().optional(),
    }),
});

const cursos = defineCollection({
  loader: file('src/data/cursos.json'),
  schema: z.object({
    id: z.string(),
    nombre: z.string(),
    proveedores: z.array(z.string()).min(1),
    url: z.url(),
    temas: z.array(z.string()),
    categoria: z.array(z.string()).min(1),
    duracion: z.string(),
    duracionHoras: z.number().optional(),
    idiomas: z.array(z.string()),
    certificacion: z.enum(['gratis-con-certificado', 'gratis-sin-certificado', 'gratis-con-limite', 'certificado-pago', 'pago']),
    formato: z.enum(['curso', 'certificacion', 'diplomatura']).default('curso'),
    modalidad: z.enum(['asincronica', 'sincronica', 'mixta']).optional(),
    precio: z.string().optional(),
    agregado: z.coerce.date(),
    revisado: z.coerce.date(),
    estado,
  }),
});

const recursos = defineCollection({
  loader: file('src/data/recursos.json'),
  schema: z.object({
    id: z.string(),
    nombre: z.string(),
    url: z.url(),
    descripcion: z.string(),
    tipo: z.enum(['biblioteca', 'herramienta', 'guia', 'canal', 'comunidad', 'sitio']),
    temas: z.array(z.string()),
    idioma: z.array(z.string()),
    gratis: z.boolean(),
    thread: reference('threads'),
    aparece_en: z.array(reference('posts')).optional(),
    revisado: z.coerce.date(),
    estado,
  }),
});

const categorias = defineCollection({
  loader: file('src/data/categorias.json'),
  schema: z.object({
    id: z.string(),
    nombre: z.string(),
    descripcion: z.string(),
    icono: z.string(),
    color,
    temas: z.array(z.string()),
  }),
});

const etiquetas = defineCollection({
  loader: file('src/data/etiquetas.json'),
  schema: z.object({
    id: z.string(),
    nombre: z.string(),
    color,
    sinonimos: z.array(z.string()),
  }),
});

export const collections = { threads, posts, cursos, recursos, categorias, etiquetas };
