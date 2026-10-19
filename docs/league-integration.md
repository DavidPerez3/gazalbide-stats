# Liga: calendario, previa y cuotas

La temporada 2026–2027 usa el grupo 1001 de Basketaraba. El calendario externo se guarda en `league_fixtures`, separado de `matches` y de las estadísticas oficiales de jugadores. No crea jornadas Fantasy ni partidos Live automáticamente.

`league_sources` conserva la URL, última actualización correcta y último error. `gazalbide_internal.request_league_sync()` consulta la URL fija a las 06:15, 12:15 y 18:15 UTC mediante pg_net; `consume_league_sync()` comprueba la respuesta cada cinco minutos. Los trabajos `gazalbide-league-*` se gestionan en Supabase Cron. No necesitan secretos adicionales ni un navegador abierto.

El parser exige grupo y temporada correctos, equipos diferentes, puntuaciones válidas y un calendario completo. Omite DESCANSA y trata 0–0 como un resultado todavía pendiente. Una respuesta inválida no sustituye la copia anterior. Al cambiar de temporada hay que revisar la URL/grupo, ya que la federación reutiliza identificadores.

`league_team_aliases` agrupa nombres equivalentes después de quitar puntuación, espacios y acentos. No hay emparejamiento aproximado: un cambio de patrocinador se debe añadir como alias confirmado. Así se reconocen Pozo I Moicar / POZO I. MOICAR y Vedrisko / EMVIT VEDRISKO sin mezclar equipos A y B.

## Modelo league-v1

Usa resultados completos anteriores a la fecha del encuentro (y nunca posteriores a hoy). Todos los equipos empiezan con Elo 1500; el ajuste depende del nivel del oponente, margen limitado y localía. Las medias de puntos se suavizan para evitar conclusiones extremas con una sola jornada. El histórico directo de hasta tres años pesa como máximo un 20%; dentro de ese histórico los resultados pierden peso con su antigüedad. Se añade una ventaja local moderada.

Es una estimación heurística, no un modelo calibrado ni una garantía. La previa avisa cuando alguno de los dos equipos tiene menos de cuatro partidos y distingue el balance calculado del grupo de una clasificación federativa con sus criterios de desempate.

Ganador, hándicap y total usan el mismo contexto. Las cotizaciones de jugadores conservan su modelo propio, excluyendo ahora los amistosos. Las apuestas compradas guardan sus cuotas originales: los mercados con apuestas, los cerrados y los ajustes manuales no se reescriben. Los mercados automáticos abiertos sin compras se actualizan al consultar GazalBet.

## Interfaz y mantenimiento

`get_league_preview()` devuelve el siguiente rival de Gazalbide del calendario, su balance/forma, antecedentes y balance del grupo. GazalBet pasa rival, fecha y temporada de su jornada. Los enlaces al histórico funcionan entre temporadas.

Solo las lecturas están habilitadas a anon/authenticated con RLS. Las funciones de importación y red están en un esquema privado y sin ejecución pública. Una actualización con más de 72 horas o un error de sincronización muestra un aviso en la previa.

Pruebas: `tests/sql/leagueGroup.test.js` valida el HTML real, descansos, grupos erróneos, caché, fechas, aliases, influencia de otros equipos, exclusión de amistosos y protección de cuotas compradas/manuales/cerradas. `LeaguePreview.test.jsx` cubre los antecedentes y los errores de carga.
