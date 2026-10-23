# El servidor de Lourdes

Sitio estático (Astro 7) publicado en GitHub Pages en `https://lpedaci.github.io/repo-servidor/`. El repo es la única fuente: Notion ya no se usa.

## Dónde vive cada cosa

| Contenido | Archivo | Notas |
|---|---|---|
| Posts (charlas, guías, recopilaciones) | `src/content/posts/*.md` | Copiar `_plantilla.md`. Los archivos que empiezan con `_` no se publican. |
| Imágenes de posts | `src/assets/posts/<slug>/` | Siempre con texto alternativo descriptivo. |
| Cursos | `src/data/cursos.json` | Un objeto por curso, orden alfabético por `id`, indentación de 2 espacios. |
| Recursos (links) | `src/data/recursos.json` | Igual. En posts se muestran con `::recurso{#id}`. |
| Threads | `src/data/threads.json` | 4 threads: `cursando`, `cursos`, `tecnologia`, `variaditos`. |
| Categorías de cursos | `src/data/categorias.json` | Las 7 vistas temáticas (la primera, Inteligencia artificial, va destacada en el Lobby). `temas` sirve para derivar la categoría de un curso nuevo. |
| Etiquetas | `src/data/etiquetas.json` | Nombre canónico, color (`t1`..`t7`) y sinónimos. |
| Esquemas (validación) | `src/content.config.ts` | Si un dato no cumple, el build falla. |
| Estilos | `src/styles/tokens.css`, `global.css`, `motion.css` | Tokens portados del taller. Toda animación va en `motion.css` dentro de `prefers-reduced-motion: no-preference`. |

## Esquemas rápidos

- Curso: `id, nombre, proveedores[], url, temas[], categoria[], duracion, duracionHoras?, idiomas[], certificacion, formato?, modalidad?, precio?, agregado, revisado, estado`.
  - `certificacion`: `gratis-con-certificado` | `gratis-sin-certificado` | `gratis-con-limite` (gratis por tiempo limitado) | `certificado-pago` (cursás gratis, el certificado o examen se paga) | `pago`.
  - `formato`: `curso` (por defecto) | `certificacion` | `diplomatura`. `modalidad`: `asincronica` | `sincronica` | `mixta`.
  - `precio`: texto libre con el precio que figuraba el día de la revisión (en pesos si es en Argentina). Actualizar junto con `revisado`.
  - `categoria`: ids de `categorias.json`.
- Recurso: `id, nombre, url, descripcion, tipo, temas[], idioma[], gratis, thread, aparece_en?[], revisado, estado`.
  - `tipo`: `biblioteca` | `herramienta` | `guia` | `canal` | `comunidad` | `sitio`.
- `estado`: `activo` | `revisar` (se muestra con "Link en revisión") | `caido` (no se muestra; los contadores solo cuentan `activo`).
- Al agregar o revisar un curso o recurso, poner `revisado` con la fecha del día (AAAA-MM-DD). En cursos nuevos, `agregado` también.

## Directivas de Markdown (plugin `src/lib/remark-server.mjs`)

- `:::callout{tipo="idea|aviso|tip"}` ... `:::`
- `::recurso{#id}` (el id tiene que existir en `recursos.json`, si no el build falla)
- `::video{id="xxxxxxxxxxx"}` (YouTube, carga liviana)
- `:::media` ... `:::` (logo o ícono a la izquierda, mismo tamaño para todos, y el texto al lado)
- `::vista{#id img="previews/archivo.webp" cta="Ver el material"}` (recurso con captura del sitio en marco de navegador; la captura va en `public/previews/`, 960 px de ancho, WebP)
- Links internos: escribirlos como `/cursos/` y el plugin les agrega el `base`. En `.astro` usar `url()` de `src/lib/site.ts`.

## Reglas de copy (obligatorias)

- Español rioplatense con voseo, cercano y directo, con humor liviano. Metáfora del server: el sitio es "el server", los visitantes son "users", las secciones son "Threads".
- **Sin rayas (—) en ningún texto.** Usar punto, coma, dos puntos o paréntesis. Verificar con `grep -rn "—" src/`.
- Sin emojis: el sitio usa íconos del sprite (`src/lib/icons.mjs`).
- Referencias bibliográficas en APA 7.ª edición.
- La autora figura siempre como **Lourdes Pedaci** (nunca "Lou"), con la firma: Experience Designer, Lic. en Tecnología Educativa, Prof. de Informática.
- Links externos con `target="_blank" rel="noopener noreferrer"` y aviso "(se abre en otra pestaña)" para lectores de pantalla. En Markdown lo hace el plugin solo.

## Accesibilidad y motion

- WCAG 2.1 AA: foco visible, contraste en ambos temas, mosaicos siempre con texto oscuro (`--tile-ink`).
- Animaciones solo con `transform`/`opacity`, dentro de `@media (prefers-reduced-motion: no-preference)`. Lo que se mueve más de 5 s tiene que poder frenarse: la banda de temas del Lobby se frena con el cursor encima o con foco de teclado y se recorre a mano (rueda horizontal, trackpad, dedo); la terminal del hero es decorativa (`aria-hidden`) y con movimiento reducido queda quieta.
- Nada se oculta sin JS: las clases que esconden contenido para animarlo dependen de `html.js`.
- `localStorage` siempre dentro de try/catch (`src/scripts/inventario.ts`).

## Git

- Commits a nombre de `lpedaci <lourdes.pedaci@gmail.com>` (configurar `user.name` y `user.email` del repo antes de commitear).
- Claude no figura como colaborador: sin `Co-Authored-By`, sin `Claude-Session` ni ninguna otra mención a Claude o Anthropic en commits, PR, comentarios o código.

## Comandos

- `npm run dev`: servidor local en `http://localhost:4321/repo-servidor/`.
- `npm run build`: compila y genera el índice de búsqueda (Pagefind). **Correrlo después de cada cambio y antes de hacer commit.**
- `npm run links`: revisa todos los links, actualiza `estado`/`revisado` y escribe `_import/reporte-links.md`. No borra nada.
- `npm run og`: regenera las cards de Open Graph en `public/og/` (una por sección y por thread; los posts usan la de su thread). Correrlo si cambian los contadores o los threads.
- `npm run import`: reimporta desde `/_import/notion/` (solo si hiciera falta; pisa los posts).
