---
titulo: "Título del post"
bajada: "Una o dos líneas que cuentan de qué va y por qué sirve."
thread: variaditos # cursando | cursos | tecnologia | variaditos
tipo: guia # charla | guia | recopilacion
temas: ["Escritura académica"] # mismas etiquetas que en src/data/etiquetas.json
publicado: 2026-01-01
actualizado: 2026-01-01
tiempoLectura: 5 # minutos (opcional)
destacado: false
---

Este archivo es una plantilla: como empieza con "_", no se publica.
Copialo con otro nombre (en minúscula, sin tildes y con guiones, por ejemplo `mi-post-nuevo.md`).

## Un título de sección

Texto normal en Markdown. **Negrita**, *itálica* y [links](https://ejemplo.com).
Los links externos se abren solos en otra pestaña.

:::callout{tipo="idea"}
Un callout. Tipos: `idea` (Idea clave), `aviso` (Ojo) y `tip` (Dato).
:::

Para mostrar un recurso de `src/data/recursos.json` (así el link se actualiza en un solo lugar):

::recurso{#flowcv}

Para un video de YouTube (va el código que aparece después de `v=` en la dirección):

::video{id="dQw4w9WgXcQ"}

Imágenes: guardalas en `src/assets/posts/<nombre-del-post>/` y siempre con texto alternativo.

![Qué muestra la imagen, en una oración](../../assets/posts/mi-post-nuevo/captura.png)

Referencias en APA 7.ª edición:

Apellido, N. (Año). *Título del libro*. Editorial.
