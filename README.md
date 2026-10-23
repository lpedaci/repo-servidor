# El servidor de Lourdes

> Comparto contenido para users que quieren crecer en este mundo sin respawn.

Repositorio de materiales didácticos, charlas, cursos gratuitos y recursos tech para estudiantes de informática, egresados y cualquiera que quiera seguir aprendiendo. Por **Lourdes Pedaci**, Experience Designer, Lic. en Tecnología Educativa, Prof. de Informática.

**Sitio:** https://lpedaci.github.io/repo-servidor/ · **Componentes:** [/ui/](https://lpedaci.github.io/repo-servidor/ui/)

---

## Stack

| Pieza | Elección |
|---|---|
| Generador | [Astro](https://astro.build) 7, salida estática |
| Contenido | Markdown (`src/content/posts/`) y JSON (`src/data/`) como content collections con esquemas zod |
| Interactividad | TypeScript sin frameworks, en scripts chicos por página |
| Búsqueda | [Pagefind](https://pagefind.app), índice estático generado en el build |
| Íconos | Font Awesome Free 7 como sprite SVG inline, leído del paquete al compilar |
| Deploy | GitHub Actions + GitHub Pages |
| Links | [lychee](https://github.com/lycheeverse/lychee) mensual que abre un issue con los caídos |

Sin cookies, sin analytics y sin dependencias en el navegador más allá de Pagefind.

## Desarrollo

Requisitos: Node 22 o más.

```bash
npm install
npm run dev
```

El sitio corre en `http://localhost:4321/repo-servidor/`. La raíz `/` da 404 porque el sitio vive bajo el `base`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local con recarga en vivo |
| `npm run build` | Compila a `dist/` y genera el índice de Pagefind. Valida todos los esquemas: si un dato no cumple, falla |
| `npm run preview` | Sirve `dist/`. La búsqueda solo funciona acá o online |
| `npm run links` | Revisa los links de cursos, recursos y posts, actualiza `estado`/`revisado` y escribe `_import/reporte-links.md` |
| `npm run og` | Regenera las cards de Open Graph (1200x630) en `public/og/`: una por sección y una por thread (los posts usan la de su thread). Plantilla en `scripts/og.html`, lista de cards en `scripts/og.mjs` |
| `npm run import` | Reimporta desde un export de Notion en `/_import/notion/` (pisa los posts) |

### Estructura

```
src/
  content.config.ts      Esquemas de todas las colecciones
  content/posts/         Posts en Markdown (_plantilla.md no se publica)
  data/                  threads, cursos, recursos, categorias, etiquetas (JSON)
  assets/posts/<slug>/   Imágenes de posts (las optimiza astro:assets)
  components/            TopBar, Footer, cards, FilterBar, Callout, LinkCard, ThreadArt...
  components/lobby/      LobbyConsola (hero + categorías), LobbyAbajo, TemasBanda
  layouts/Base.astro     Head, SEO, Open Graph, sprite, barra y pie
  lib/                   site.ts (datos y helpers), lobby.ts, icons.mjs, linkcard.mjs, remark-server.mjs
  pages/                 Rutas (ver abajo)
  scripts/               app.ts (global), filtros.ts (exploradores), inventario.ts (localStorage)
  styles/                tokens.css, global.css, motion.css
scripts/                 import-notion, check-links, og
```

### Rutas

| Ruta | Qué es |
|---|---|
| `/` | Lobby |
| `/threads/` y `/threads/[id]/` | Índice y página de cada thread (`cursando`, `cursos`, `tecnologia`, `variaditos`) |
| `/posts/[slug]/` | Charlas y guías, con índice lateral y navegación dentro del thread |
| `/cursos/` | Explorador de cursos. Filtros en la URL: `?cat=inteligencia-artificial&formato=diplomatura&modalidad=sincronica&prov=Google&idioma=Español&cert=gratis-con-certificado&q=python&orden=duracion&vista=tabla` |
| `/recursos/` | Explorador de recursos (`?tipo=`, `?thread=`, `?idioma=`, `?gratis=si`) |
| `/inventario/` | Favoritos y "ya lo vi" del user, en `localStorage` (no indexada) |
| `/buscar/?q=` | Búsqueda con Pagefind |
| `/sobre/`, `/404` | Sobre el server y página de error |
| `/ui/` | Muestrario del sistema de diseño (no indexada) |

### Modelo de datos

Todo se valida en `src/content.config.ts`.

- **Curso** (`cursos.json`): `id, nombre, proveedores[], url, temas[], categoria[], duracion, duracionHoras?, idiomas[], certificacion, formato?, modalidad?, precio?, agregado, revisado, estado`.
  `certificacion`: `gratis-con-certificado` | `gratis-sin-certificado` | `gratis-con-limite` | `certificado-pago` | `pago`. `formato`: `curso` | `certificacion` | `diplomatura`. `modalidad`: `asincronica` | `sincronica` | `mixta`. `precio` es texto libre (en pesos si es en Argentina). `duracionHoras` se usa para ordenar (un mes se estima en 40 hs).
- **Recurso** (`recursos.json`): `id, nombre, url, descripcion, tipo, temas[], idioma[], gratis, thread, aparece_en?[], revisado, estado`.
  `tipo`: `biblioteca` | `herramienta` | `guia` | `canal` | `comunidad` | `sitio`.
- **Post** (frontmatter): `titulo, bajada, thread, tipo (charla|guia|recopilacion), temas[], publicado, actualizado, tiempoLectura?, portada?, destacado?`.
- **`estado`**: `activo` | `revisar` (se muestra con "Link en revisión") | `caido` (no se muestra). Los contadores del Lobby solo cuentan `activo`.
- Los JSON van ordenados por `id`, con indentación de 2 espacios: así los diffs se leen bien.

### Directivas de Markdown

El plugin `src/lib/remark-server.mjs` (sobre `remark-directive`) agrega:

```md
:::callout{tipo="idea"}      <!-- idea | aviso | tip -->
Texto del callout.
:::

::recurso{#flowcv}            <!-- tarjeta desde recursos.json; si el id no existe, el build falla -->

::video{id="x426QPTn-Ik"}     <!-- YouTube: portada liviana, el iframe (nocookie) carga al hacer clic -->

::vista{#taller-primerempleo img="previews/taller-primerempleo.webp" cta="Ver el taller"}
                              <!-- recurso con captura del sitio (public/previews/, 960 px, WebP) -->
```

Además: los links externos salen con `target="_blank" rel="noopener noreferrer"`, ícono y aviso para lectores de pantalla, y los internos (`/cursos/`) reciben el `base` solos. En `.astro`, usar `url()` de `src/lib/site.ts`.

### Deploy

Cada push a `main` corre `.github/workflows/deploy.yml` (build + `actions/deploy-pages`). En el repo, Settings > Pages > Source tiene que estar en **GitHub Actions**. El `base` (`/repo-servidor`) está en `astro.config.mjs`: si el repo cambia de nombre, se cambia ahí.

---

## Sistema de diseño

Dirección visual: **panel de app educativa**. Fondo lavanda, paneles blancos muy redondeados, mosaicos de color con texto siempre oscuro y bloques carbón para lo que pide acción. La metáfora del sitio es un servidor de juego (users, threads, lobby, inventario) y el hero lo lleva literal con una terminal.

Todos los valores viven en `src/styles/tokens.css` y se revisan en vivo en `/ui/`, en los dos temas.

### Color

| Token | Claro | Uso |
|---|---|---|
| `--bg` | `#e9e8f6` | Fondo general |
| `--surface` / `--surface-2` | `#ffffff` / `#f4f4fa` | Paneles y superficies internas |
| `--ink` / `--muted` | `#1f1f24` / `#5b5a6b` | Texto principal y secundario |
| `--deep` | `#24242a` | Bloques carbón, barra superior, botones primarios |
| `--l1` / `--l2` | `#5257c9` / `#b4530f` | Links y acentos de texto |
| `--yes` / `--no` | `#17764a` / `#b4380f` | Estados (certificado, en revisión) |

**Mosaicos:** siete colores, uno por categoría de cursos, siempre con texto oscuro (`--tile-ink`) en los dos temas.

| Token | Color | Categoría | Thread |
|---|---|---|---|
| `--t1` | `#b9bbf6` lavanda | Programación | Cursando y egresando |
| `--t2` | `#f7ab6a` naranja | Gestión y soft skills | Cursos |
| `--t3` | `#f8de73` amarillo | Marketing y finanzas | Variaditos |
| `--t4` | `#b8d8c9` verde agua | Ciudadanía digital y seguridad | Tecnología |
| `--t5` | `#f2b8d2` rosa | Diseño, UX y UI | |
| `--t6` | `#a9d3f0` celeste | Datos y ofimática | |
| `--t7` | `#d3e88a` lima | Inteligencia artificial | |

Las etiquetas de temas heredan el color de su categoría (`etiquetas.json`). El tema oscuro redefine los tokens bajo `prefers-color-scheme: dark` y `[data-theme="dark"]`; el usuario puede forzarlo desde la barra.

### Tipografía

Autoalojadas en `public/fonts/` con `font-display: swap` y preload de las dos principales.

- **Outfit**: títulos, botones y etiquetas (600, tracking negativo en tamaños grandes).
- **Geist**: cuerpo, 17 px, interlineado 1.65, lectura a 70ch.
- **Geist Mono**: datos, contadores, duraciones y la terminal.

### Forma y espacio

- Radios: paneles `2rem` (`--r-lg`), bloques `1.5rem` (`--r`), botones y chips en píldora.
- Grilla del Lobby: 12 columnas en escritorio, una sola columna bajo 768 px. Gutter de 16 px en móvil.
- Sombras teñidas del fondo (`--shadow`), nunca negras ni con brillo.
- Ilustración: trazos de línea blancos y translúcidos (`ThreadArt.astro`), un objeto por thread: camino con bandera, birrete, `</>` y hoja con renglones.

### Motion

Todo en `src/styles/motion.css` y en los `<style>` de cada componente, siempre dentro de `@media (prefers-reduced-motion: no-preference)`. Solo se anima `transform`, `opacity` y `stroke-dashoffset`.

- Curvas: `--ease` `cubic-bezier(0.16, 1, 0.3, 1)` para todo; `--spring` con rebote para lo que aparece (contadores, estrellas, avisos).
- Entrada: cascada con `--i` en los bloques, título con máscara por línea, trazos que se dibujan solos, contadores que suben.
- Continuo: terminal con una sesión SSH a Ubuntu, banda de temas con scroll real (se frena con hover o foco y se mueve con rueda horizontal, trackpad o dedo), luz de "online" que late.
- Entre páginas: View Transitions entre documentos donde el navegador las soporta.
- Con movimiento reducido el sitio queda completo y quieto. Sin JS, nada queda oculto: lo que se esconde para animar depende de `html.js`.

### Accesibilidad

Objetivo WCAG 2.1 AA, verificado con axe y Lighthouse (100) en claro, oscuro, móvil y escritorio.

- Skip link, foco visible, HTML semántico y jerarquía de títulos sin saltos.
- Contraste verificado en los dos temas; los mosaicos nunca llevan texto claro.
- Contador de resultados de los exploradores en `aria-live`, con espera mientras se escribe.
- Filtros como checkboxes nativos con estilo de chip. Tabla real (`<table>`) que se apila en móvil.
- Decoración (`ThreadArt`, terminal) con `aria-hidden`. Toda imagen de contenido con texto alternativo.
- Inventario en `localStorage` siempre dentro de try/catch: en modo privado el sitio sigue funcionando.

### Copy

Español rioplatense con voseo, cercano y con humor liviano. Sin rayas (—) y sin emojis. Referencias en APA 7.ª edición.

---

Íconos: [Font Awesome Free](https://fontawesome.com) (CC BY 4.0). Tipografías: Outfit, Geist y Geist Mono (SIL OFL). Todos los links del sitio pertenecen a sus autores.
