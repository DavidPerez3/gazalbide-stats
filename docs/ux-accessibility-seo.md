# Fase UX, ayuda, accesibilidad y SEO (octubre de 2026)

## Auditoría de main b84983f

Ya existían privacidad/condiciones estáticas, robots y sitemap generados según dominio/base, canonical/Open Graph/Twitter de inicio, PWA y push, navegación móvil, accesos de partido y juegos, exportación PDF/Excel y la corrección compartida de columnas fijas (PR106). Se reutilizan sin duplicarlos. Las fotografías ya tenían alt y las ilustraciones decorativas se mantienen sin narración redundante.

Faltaban wildcard del router y 404 física, ayuda unificada, títulos por sección y tratamiento noindex de rutas privadas, foco compartido/skip link, Escape en menú y estados accesibles concretos. Match confundía errores con inexistencia y no reiniciaba la carga al cambiar id; Players no capturaba rechazos. El botón de ordenación ejecutaba el cambio dos veces al pulsar Enter (onKeyDown más click nativo). Se corrige sin cambiar cálculos.

## Fuentes de la ayuda

- `lib/data.js`, `historyStats.js`, `pages/Ranking.jsx`, `StatisticsPage.jsx`, `features/reports/PdfReportPanel.jsx`: filtros, porcentajes y exportaciones.
- `features/live-stats/liveReview.js`, `LiveStatsPage.jsx`, `LiveStatsReviewPage.jsx`, `localSession.js`: estado provisional, revisión y guardado.
- `lib/fantasyScoring.js`, `pages/FantasyBuilder.jsx`, `docs/fantasy-deadline.md` y migraciones de cierre: PIR × capitán × rasgos, bonus victoria 0, alineación y cierre. La ayuda no inventa importes de presupuesto ni constantes de rasgos.
- `pages/PorraPage.jsx`, `features/gazalbet/`, `docs/manual-qa.md` (Disponibilidad y combinadas): fichas ficticias, cierre, cuotas y anulaciones. No se modifican pagos o disponibilidad.
- `components/AppInstall.jsx`, `lib/pushNotifications.js`, `NotificationSettingsPage.jsx`, `public/sw.js`: instalación, permiso por dispositivo, preferencias y límites offline.
- `components/PrivateRoute.jsx` y `public/privacidad.html`: acceso y contacto existente.

## SEO: límites y decisiones

Se conserva HashRouter. Los títulos y las descripciones cambian en el navegador para mejorar orientación, historial y accesibilidad; no se presentan como páginas independientemente indexables. Canonical y OG continúan apuntando a la URL pública de inicio, sin parámetros de sesión. El sitemap conserva únicamente la raíz, no rutas privadas ni fragmentos ficticios. Robots no puede discriminar fragmentos: el navegador aplica noindex/nofollow a rutas privadas y desconocidas, como indicación complementaria, no como seguridad o garantía de exclusión para robots que no ejecuten JS. La protección real continúa en autenticación y políticas existentes.

404.html se genera en el build con enlaces absolutos derivados de siteConfig y noindex. GitHub Pages lo sirve para rutas físicas inexistentes sin convertirlas mediante redirección en un 200 de la SPA. Las rutas hash inexistentes muestran la página 404 dentro del diseño existente, con HTTP200 propio del shell SPA. No se reescriben enlaces a partidos/jugadores/juegos. No se añaden seguimiento, librerías, tarjetas sociales deportivas, servicios o cambios de arquitectura.

## QA manual

- Menú en móvil: abrir, navegar con Tab, Escape cierra y devuelve foco al botón; estado expandido y nombre Abrir/Cerrar correctos.
- Tab al cargar: Saltar al contenido llega a main; foco visible en botones, enlaces, campos y summary. Cambiar sección sitúa el foco en main sin intervenir en el anotador durante un partido.
- Ayuda: acordeones con teclado/tacto y botones de tema; sin overlays en Live Stats. Enlaces de ayuda en menú y pie.
- Probar `#/no-existe`, inicio, partido, perfil, directo y enlaces Fantasy existentes. Probar físicamente `/no-existe/otra`: 404 del servidor y enlace de recuperación a la base correcta.
- Comprobar dominio raíz y GitHub Pages bajo /gazalbide-stats/: robots, sitemap, canonical, OG y 404. Cambiar sección privada/pública debe restaurar robots y título sin dejar un noindex residual.
- Simular error y lista vacía en plantilla/partido, buscar un jugador inexistente y pulsar Enter una vez sobre una cabecera ordenable.
- Repetir prueba de tablas con `scripts/check_sticky_tables.cjs`; se conserva PR106.
- Comprobar avisos con lector de pantalla: estado de carga, errores y etiqueta del interruptor general.

El anotador conserva sus interacciones deportivas actuales por arrastre; esta fase no lo convierte en un anotador completo de teclado ni equivale a una certificación WCAG. No se alteran sus animaciones ni la velocidad de toma de acciones. Se han revisado las imágenes compartidas, manteniendo alt vacíos en símbolos e ilustraciones decorativas.

Referencias de plataforma contrastadas: [404 de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site) y [Google Search: fragmentos en URL](https://developers.google.com/search/docs/crawling-indexing/url-structure).
