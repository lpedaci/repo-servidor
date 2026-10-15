/**
 * Inventario del user: favoritos y "ya lo vi", guardados solo en este navegador (localStorage).
 * Todo acceso a localStorage va envuelto en try/catch: en modo privado o con datos bloqueados
 * el sitio sigue funcionando, solo que el inventario no persiste.
 */
const KEY = 'server:inventario:v1';

export interface Guardado {
  key: string; // "curso:id" | "recurso:id" | "post:slug"
  nombre: string;
  href: string;
  t: number;
}
interface Estado {
  fav: Guardado[];
  visto: string[];
}

let memoria: Estado = { fav: [], visto: [] };

export function leer(): Estado {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const e = JSON.parse(raw);
      memoria = { fav: Array.isArray(e.fav) ? e.fav : [], visto: Array.isArray(e.visto) ? e.visto : [] };
    }
  } catch {
    /* sin almacenamiento: se usa la memoria de la página */
  }
  return memoria;
}

function escribir(e: Estado) {
  memoria = e;
  try {
    localStorage.setItem(KEY, JSON.stringify(e));
  } catch {
    /* idem */
  }
  document.dispatchEvent(new CustomEvent('inventario', { detail: e }));
}

export const esFav = (key: string) => leer().fav.some((f) => f.key === key);

export function alternarFav(g: Omit<Guardado, 't'>): boolean {
  const e = leer();
  const ya = e.fav.some((f) => f.key === g.key);
  const fav = ya ? e.fav.filter((f) => f.key !== g.key) : [...e.fav, { ...g, t: Date.now() }];
  escribir({ ...e, fav });
  return !ya;
}

export function quitar(key: string) {
  const e = leer();
  escribir({ fav: e.fav.filter((f) => f.key !== key), visto: e.visto.filter((v) => v !== key) });
}

export function alternarVisto(key: string, valor: boolean) {
  const e = leer();
  const visto = valor ? [...new Set([...e.visto, key])] : e.visto.filter((v) => v !== key);
  escribir({ ...e, visto });
}

export function borrarTodo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* idem */
  }
  escribir({ fav: [], visto: [] });
}
