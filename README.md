# Gazalbide Stats 🏀

**Gazalbide Stats** es la PWA del Gazalbide CB para consultar estadísticas, seguir partidos en directo, registrar Live Stats y jugar a la Fantasy interna del equipo.

La aplicación ya no es una web estática basada únicamente en Excel/JSON: actualmente usa **React + Vite + Supabase** como base de datos y backend, autenticación de usuarios, sincronización en tiempo real, Web Push y herramientas de administración.

## Estado actual

La v1.0 está planteada como **PWA**. La publicación como aplicación nativa queda fuera del alcance inicial y solo se valorará más adelante si el uso lo justifica.

Actualmente están implementados, entre otros:

- estadísticas oficiales por partido, jugador, temporada e histórico;
- rankings avanzados con totales, medias, porcentajes y métricas por 40 minutos;
- perfiles de jugador con carrera, temporadas y récords personales;
- Live Stats para el anotador del equipo;
- almacenamiento local-first, recuperación de sesión y resincronización;
- control exclusivo del dispositivo anotador;
- reloj, periodos, prórrogas, faltas, sustituciones, minutos y +/-;
- historial editable de acciones y Undo sin alterar el reloj;
- revisión, publicación, reapertura y republicación de partidos;
- quintetos, tramos en pista y mejor quinteto del partido;
- Live Center público con marcador, reloj, quinteto, box score y play-by-play;
- Fantasy Live provisional durante el partido;
- Fantasy de temporada con mercado, alineaciones, capitán, entrenador, rasgos y sinergias;
- economía Fantasy, ahorro y Le Gazal;
- propuesta automática de evolución de precios;
- notificaciones Web Push configurables por usuario/dispositivo;
- exportaciones Excel de partido, temporada/histórico y quintetos +/-;
- administración de jugadores, Fantasy, Live Stats y exportaciones;
- instalación como PWA en dispositivos compatibles.

> La activación real de cada temporada Fantasy y la creación de jornadas se realiza de forma controlada desde administración. El código no debe asumir que el mercado o una jornada concreta están abiertos.

## Tecnologías

- **React 18**
- **Vite 7**
- **React Router**
- **Supabase**
  - PostgreSQL
  - Auth
  - Realtime
  - Row Level Security
  - RPCs PostgreSQL
  - Edge Functions
  - Vault
  - `pg_cron`
- **Service Worker / PWA**
- **Web Push (VAPID)**
- **SheetJS / ExcelJS** para importación y exportación de hojas de cálculo
- **GitHub Actions + GitHub Pages** para CI/CD y despliegue

## Áreas principales

### Estadísticas

La parte pública permite consultar partidos, jugadores, perfiles, comparaciones y rankings. Las estadísticas oficiales proceden de Supabase y solo se consideran definitivas cuando el partido está publicado.

Métricas principales:

`MIN`, `PTS`, `REB`, `OREB`, `DREB`, `AST`, `ROB`, `BLK`, `TOV`, `PF`, `PFD`, `FGM/FGA`, `2PM/2PA`, `3PM/3PA`, `FTM/FTA`, `PIR`, `EFF` y `+/-`.

El histórico se unifica por `player_id`, de forma que un cambio de dorsal no divide la carrera de un jugador.

### Live Stats

Live Stats está pensado principalmente para utilizarse en **móvil o tablet en horizontal** durante el partido.

Incluye:

- convocatoria y quinteto inicial;
- acciones individuales y del rival;
- sustituciones por drag & drop;
- minutos jugados;
- +/- individual y por quinteto;
- faltas y disciplina;
- bonus y reglas de partido;
- reloj, periodos y prórrogas;
- correcciones y Undo;
- persistencia local;
- sincronización con Supabase;
- funcionamiento local durante pérdidas de conexión;
- recuperación tras recargar/cerrar la PWA;
- Wake Lock cuando es compatible;
- lease de control para que solo un dispositivo anote a la vez.

**Invariante importante:** deshacer o corregir una acción histórica no modifica el reloj actual ni los minutos ya acumulados. Una corrección manual explícita del reloj sí ajusta los minutos del quinteto que está en pista.

### Publicación de partidos

Al finalizar el partido existe una pantalla de revisión antes de publicar. La publicación materializa las estadísticas oficiales, los quintetos y el historial de revisiones.

Un partido publicado puede reabrirse, corregirse y republicarse de forma versionada, evitando duplicar efectos posteriores como movimientos de precio Fantasy.

### Live Center

Cada partido Live dispone de una página pública compartible con:

- marcador;
- periodo/prórroga;
- reloj;
- parciales;
- quinteto actual;
- últimas acciones;
- box score provisional;
- mejor quinteto del partido;
- actualización mediante Supabase Realtime.

Al finalizar pasa a **pendiente de revisión** y, tras publicar, a **oficial**.

### Fantasy

La Fantasy incluye:

- presupuesto;
- mercado por jornadas;
- cinco jugadores;
- capitán;
- entrenador;
- precios por jornada;
- rasgos y sinergias;
- puntuación basada en PIR y modificadores;
- ahorro/carry entre jornadas;
- Le Gazal;
- clasificación e histórico;
- evolución automática de precios con revisión administrativa.

La alineación permanece editable hasta el deadline. Al llegar el deadline se consolida la jornada y, a partir de ahí, se resuelve la economía disponible para ahorro/Le Gazal.

### Fantasy Live

Durante un partido compatible se calcula una clasificación **provisional** utilizando el mismo motor de puntuación que la Fantasy oficial.

Las correcciones y Undo del Live Stats recalculan inmediatamente la puntuación provisional. Al finalizar el partido queda pendiente de revisión y solo pasa a oficial cuando el partido se publica.

### Notificaciones PWA

Cada usuario puede activar Web Push por dispositivo y elegir qué categorías recibe, por ejemplo:

- nueva jornada;
- deadline 24 h;
- deadline 1 h si la alineación sigue siendo inválida;
- cambios de disponibilidad de jugadores;
- partido/Fantasy Live disponible;
- resultado oficial;
- nuevos precios;
- saldo disponible para ahorro/Le Gazal.

El envío utiliza una cola deduplicada, Edge Function, VAPID almacenado en Supabase Vault y scheduler de Supabase.

### Exportaciones

El panel de administración permite generar `.xlsx` bajo demanda desde los datos oficiales de Supabase:

- partido;
- temporada o histórico completo;
- quintetos y +/-.

Los Excel son una salida de datos, **no una fuente de verdad** para la aplicación.

## Desarrollo local

```bash
npm install
npm run dev
```

Por defecto Vite sirve la aplicación en:

```text
http://localhost:5173/
```

Para compilar producción:

```bash
npm run build
npm run preview
```

## Variables de entorno

La aplicación necesita la configuración pública de Supabase utilizada por el cliente. Las credenciales privadas, claves VAPID privadas y demás secretos de servidor **no deben guardarse en el repositorio ni exponerse en el bundle del navegador**.

Consulta la configuración existente del proyecto antes de crear o rotar variables. Las claves privadas del sistema de notificaciones se gestionan desde Supabase/Vault.

## Base de datos y migraciones

El esquema se mantiene mediante migraciones de Supabase. Entre las áreas cubiertas por el modelo actual están:

- temporadas y jugadores;
- partidos y estadísticas oficiales;
- Live Stats (`matches`, `game_roster`, `game_events`, `live_game_state`);
- control del dispositivo anotador;
- quintetos publicados;
- revisiones de publicación;
- Fantasy, jornadas, precios y economía;
- disciplina;
- notificaciones y suscripciones Push.

Los cambios de esquema deben hacerse mediante migraciones y respetar las políticas RLS existentes.

## Importación histórica

El proyecto conserva scripts de importación/conversión utilizados para cargar estadísticas históricas desde Excel/JSON. Son herramientas de mantenimiento y migración; la aplicación actual consulta Supabase como fuente principal.

Comandos disponibles actualmente:

```bash
npm run dev
npm run build
npm run preview
npm run data
npm run migrate:stats
```

## PWA y dispositivos

Gazalbide Stats se mantiene como PWA y debe funcionar correctamente en:

- móvil vertical;
- móvil horizontal;
- tablet;
- escritorio.

Live Stats tiene una interfaz específica orientada al uso horizontal. El resto de la aplicación debe ser responsive en ambas orientaciones.

El Service Worker proporciona la base de instalación/caché y también recibe Web Push.

## Despliegue

El despliegue se realiza automáticamente con GitHub Actions al actualizar `main`.

Workflow:

```text
.github/workflows/deploy.yml
```

Producción:

```text
https://davidperez3.github.io/gazalbide-stats/
```

## Seguridad

Al trabajar con Supabase:

- no introducir secretos privados en el frontend;
- mantener RLS en las tablas expuestas;
- limitar operaciones administrativas a usuarios autorizados;
- proteger publicación/reapertura de partidos y escritura de Live Stats;
- no persistir cálculos de Fantasy Live como resultados oficiales;
- revisar RPCs `SECURITY DEFINER` antes de ampliar permisos.

## Estado de la v1.0

El núcleo funcional está muy avanzado. Antes de considerar cerrada la v1.0 todavía se prevén principalmente tareas de hardening, pulido transversal de la PWA, configuración final de autenticación social cuando corresponda y QA completo con datos reales de temporada.

## Licencia

MIT
