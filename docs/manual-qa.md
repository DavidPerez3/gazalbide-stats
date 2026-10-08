# Revisión manual tras las seis fases

Abre https://davidperez3.github.io/gazalbide-stats/ y recarga con conexión antes de empezar. Revisa en móvil vertical, horizontal y ordenador. Para avisar de un problema, envía captura, pantalla, tamaño/orientación y lo que esperabas ver.

| Zona | Qué revisar | Resultado esperado |
| --- | --- | --- |
| Navegación | Abre el menú como usuario y como administrador, también a 320–390 px y en tablet. | Todos los enlaces accesibles; Admin y Salir visibles; menú desplazable en horizontal. |
| Acceso | Inicia sesión, cierra sesión y prueba recuperar contraseña. | El callback termina en la app sin romper las rutas; enlaces caducados muestran un mensaje comprensible. |
| GazalBet | Cambia entre mercados, seguimiento e historial. | La jornada de mercados no altera la que estás siguiendo; una sola jornada corresponde a un solo partido. |
| GazalBet móvil | Añade selecciones y abre el cupón en vertical y horizontal. | Cupón y botón de confirmar accesibles sin cortes ni desbordamiento. |
| Seguimiento | Abre un cupón simple y uno combinado durante un partido. | Barras, valores, aciertos y fallos coherentes con el marcador; ganancia y límite iguales en cupón e historial. |
| Historial GazalBet | Filtra por jornada/estado y abre un combinado. | Cada selección muestra su estado; también aparecen apuestas antiguas. |
| Programación Admin | Programa una próxima jornada con Fantasy; revisa el listado y abre su Live Setup. | Rival, fecha e identificador compartidos; opción de mercados disponible; una jornada duplicada se rechaza. |
| Programación sin Fantasy | Programa un partido sin Fantasy. | Se puede abrir el Live Setup sin obligar a crear una jornada Fantasy. |
| Live Stats | Usa un partido de prueba/amigable: configura jugadores, registra acciones, cierra y reabre. | Recupera sesión y acciones; las pantallas mantienen botones utilizables en horizontal. Publica solo si deseas conservar el resultado. |
| Navegación del partido | Abre los enlaces Live, estadísticas, Fantasy y GazalBet cuando estén disponibles. | Llevan al mismo partido/jornada. |
| Estadísticas | Filtra temporada y rival; revisa resultados, medias y comparación de temporadas. | Tabla y gráfico coinciden; los porcentajes usan tiros anotados/intentos. |
| Comparación | Escoge dos jugadores con partidos compartidos y después sin coincidencias. | Comparación sobre partidos comunes; mensaje claro si no hay muestra. |
| Live Center | Filtra cronología por periodo y acción; observa evolución de ventaja. | Orden correcto, acciones anuladas excluidas, gráfico coherente con el marcador. |
| Fantasy equipo | Expande el desglose y revisa capitán y sinergias, incluido un PIR negativo si existe. | Base + capitán + sinergias = total; victoria aparece como 0, conforme a la regla actual. |
| Fantasy historial | Filtra temporadas; revisa total, media, mejor/peor jornada, gráfico y filas. | Sin datos aparece Pendiente; una puntuación real de 0 sigue siendo 0. |
| Fantasy ranking | Revisa tu posición, media y distancia al líder. | Empates comparten posición; formato legible en móvil. |
| Instalación Android | En navegador compatible, pulsa Instalar app cuando aparezca. | Icono del club, nombre Gazal Stats, apertura independiente; accesos Fantasy/GazalBet si el sistema los ofrece. |
| Instalación iPhone | Abre Safari y usa las instrucciones de Instalar app. | Compartir → Añadir a pantalla de inicio; icono y apertura correctos. |
| Sin conexión | Tras cargar la app, activa modo avión y reabre una vista ya visitada. | Abre el contenido disponible en caché; aviso sin conexión. Datos y operaciones online pueden necesitar conexión. |
| Actualización | Tras un despliegue, abre con conexión y vuelve a cargar. | Se muestra la versión nueva; conserva acceso y navegación. |

Los enlaces sociales y el sitemap describen la página principal. Las rutas con hash no tienen metadatos sociales independientes. La revisión visual queda a tu cargo; las pruebas automatizadas no sustituyen esta lista.
