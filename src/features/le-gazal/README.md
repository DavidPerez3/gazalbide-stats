# Le Gazal

## Motor actual: recogida por símbolos (v4)

Las nuevas tiradas usan `collectionEngine.js` y `gazalbide_internal.le_gazal_collections`. Se genera el tablero antes de calcular el premio. El mapache recoge BALL (x1) y TROPHY (x2); la salamandra HOOP (x1) y WHISTLE (x2). Todos los símbolos corrientes tienen utilidad. Solo SHIELD activa tiradas gratis; no se generan letras, números, WILD, camisetas ni BONUS_BALL.

Los personajes arrancan en los extremos de la fila central, alternan turnos y eligen entre las cuatro casillas contiguas sin diagonales ni invadir al otro personaje. Se elige el mayor pago incluyendo nivel del suelo; empates en orden arriba, derecha, abajo, izquierda. Cada movimiento precede una recogida remunerada. No hay exploraciones, transformaciones ni recogidas añadidas por un resultado económico previo. Los personajes se recolocan sin transición al preparar un nuevo tablero.

Después de recoger se aplica gravedad y una reposición de esa columna. Cada columna tiene una reserva de cinco símbolos generada al inicio; cuando se agota quedan huecos. Esto limita la duración y garantiza que el resolver termine sin cortar recorridos válidos. Las reposiciones no generan escudos. Termina cuando ninguno de los personajes tiene una recogida compatible.

### Bonus y progreso

Se cuentan los escudos del tablero inicial: 3 → 10 giros x2; 4 → 15 giros x3; 5 o más → 20 giros x5. Se puede cobrar por recogidas y activar un bonus en la misma tirada. Los retriggers añaden giros y conservan el mayor multiplicador. Pol y Pelos solo celebran los escudos.

En giros gratis, cada recogida mejora la posición del suelo: normal → x2 → x3 para las siguientes visitas. La recogida que mejora aún cobra el nivel previo. El suelo no cae. A las 6 y 12 recogidas se abren las columnas 7 y 8 después de resolver el giro. Las columnas amplían el espacio de los siguientes tableros; no añaden recogidas garantizadas. Al acabar el bonus o guardar el saldo, el progreso se limpia.

`le_gazal_spin` bloquea la sesión, genera símbolos y reservas, resuelve y guarda premio, eventos, estado del suelo y ledger en una misma transacción. Solo el propietario autenticado puede girar; los generadores y resolvers no son RPC públicos. El navegador muestra las instantáneas guardadas. Recargar restaura el final sin repetir apuestas ni premios. Las sesiones con tiradas gratis antiguas conservan sus giros, apuesta de referencia y multiplicador; la siguiente tirada usa v4.

### Generación y economía

RNG reproducible Park–Miller (16807, módulo 2147483647), semilla de 28 bits del UUID aleatorio del giro. El navegador usa el mismo algoritmo para diversión. Cada símbolo inicial tiene aproximadamente un 1,4 % de probabilidad de escudo. Después, dentro de cada mitad del tablero: 4 % símbolo básico propio, 1 % premium propio, 85 % básico del otro personaje, 10 % premium del otro. Todas las columnas están conectadas por los recorridos, por lo que un personaje que llega a la otra mitad puede encadenar recogidas. No se sortea una categoría de pago ni se modifica el tablero para ajustar un premio.

`node scripts/simulate_le_gazal_collections.mjs 50000` mide 50.000 giros de pago con apuesta 1, semilla 1729, y todos sus bonus/retriggers hasta terminarlos: 5.130 giros gratis, pago total 33.883, retorno observado 67,766 %, acierto en giros de pago 26,004 %. Es una simulación reproducible, no una garantía de retorno ni una demostración del valor esperado exacto. También verifica que se recogen los cuatro símbolos. Se pueden pasar otros tamaños de muestra.

### Pruebas y QA

Las pruebas SQL cotejan 480 secuencias completas de JS/Postgres a distintos tamaños y niveles. Comprueban los símbolos reales anteriores a cada movimiento, prioridad incluyendo suelo, empates, bloqueo por el otro personaje, gravedad, pago, fin por ausencia de objetivos, escudos y ausencia de recogidas artificiales al ampliar. Se verifica también el RPC real en PGlite: saldo, ledger, giros gratis, persistencia y titularidad.

En `/#/fantasy/le-gazal-demo`, las opciones admin preparan tableros conocidos y pasan por el mismo resolver: «Sin premio» (quietos), «Balón contiguo», «Trofeo contiguo», «Varios símbolos contiguos» y 3/4/5 escudos. «Probar mejora y ampliación» prepara un suelo próximo a crecer. Son datos ficticios y no escriben en Supabase. El modo diversión no permite forzar resultados y su progreso vive solo en memoria.

## Compatibilidad histórica

`slotEngine.js` conserva el evaluador de las 20 líneas v1 de `paylines.json`; `livingEngine.js` conserva el generador v2 y los temporizadores; `bonusBoard.js` conserva el generador v3 y las utilidades de rodillos con dimensiones variables. Los generadores v1–v3 y sus funciones SQL quedan para las pruebas y las instantáneas históricas. El motor activo no los llama para resolver nuevos giros. No se recalculan saldos ni se reescriben resultados antiguos. Las imágenes y la compatibilidad de sus símbolos se conservan para mostrar el historial.
