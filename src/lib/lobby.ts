/** Datos que usan el Lobby y sus propuestas de diseño. */
import { datos } from './site';

/** Tiempo online desde un mes dado: años cumplidos y meses restantes (dic. 2019 a oct. 2026: 6 años, 10 meses). */
function tiempoDesde(anio: number, mes: number) {
  const hoy = new Date();
  const meses = (hoy.getFullYear() - anio) * 12 + (hoy.getMonth() + 1 - mes);
  return { anios: Math.floor(meses / 12), meses: meses % 12 };
}

const DESTACADO = 'charla-carreras-info-y-afines';

export async function datosLobby() {
  const d = await datos();
  const { threads, posts, cursos, recursos, categorias, etiquetas } = d;
  const activos = (xs: { data: { estado: string } }[]) => xs.filter((x) => x.data.estado === 'activo').length;
  const ultima = new Date(
    Math.max(...posts.map((p) => +p.data.actualizado), ...cursos.map((c) => +c.data.revisado), ...recursos.map((r) => +r.data.revisado))
  );
  const porThread = new Map(threads.map((t) => [t.id, 0]));
  posts.forEach((p) => porThread.set(p.data.thread.id, (porThread.get(p.data.thread.id) ?? 0) + 1));

  // Temas más usados (banda en movimiento)
  const uso = new Map<string, number>();
  [...cursos, ...recursos].forEach((x) => x.data.temas.forEach((t: string) => uso.set(t, (uso.get(t) ?? 0) + 1)));

  return {
    ...d,
    nCursos: activos(cursos),
    nRecursos: activos(recursos),
    conPython: cursos.filter((c) => c.data.temas.includes('Python') || /python/i.test(c.data.nombre)).length,
    ultima,
    /** El server existe desde diciembre de 2019. */
    desde: { iso: '2019-12', texto: 'dic. 2019', ...tiempoDesde(2019, 12) },
    nThread: (id: string) => (id === 'cursos' ? `${cursos.length} cursos` : `${porThread.get(id)} posts`),
    cats: categorias.map((c) => ({
      id: c.id,
      nombre: c.data.nombre,
      descripcion: c.data.descripcion,
      icono: c.data.icono,
      color: c.data.color,
      n: cursos.filter((x) => x.data.categoria.includes(c.id)).length,
    })),
    temasTop: [...uso].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([t]) => t),
    colorDe: new Map(etiquetas.map((e) => [e.data.nombre, e.data.color])),
    // Lo nuevo: la charla de carreras siempre primero y después los dos posts más recientes
    nuevos: [...posts]
      .sort((a, b) => +(b.id === DESTACADO) - +(a.id === DESTACADO) || +b.data.publicado - +a.data.publicado)
      .slice(0, 3),
    threadDe: new Map(threads.map((t) => [t.id, t])),
  };
}

export type DatosLobby = Awaited<ReturnType<typeof datosLobby>>;
