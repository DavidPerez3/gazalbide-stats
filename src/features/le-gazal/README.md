# Le Gazal

`Le Gazal` esta montado como feature aislado para poder cambiar mas adelante la capa de economia sin tocar el motor de slots ni la UI.

Punto de extension previsto:

- `DemoEconomyAdapter`: saldo ilimitado, sin persistencia externa.
- `FantasyEconomyAdapter`: futura integracion con saldo real, validacion fantasy y registro en Supabase.

Hoy solo existe el comportamiento demo dentro de `useLeGazalDemo.js`. El siguiente paso natural seria extraer la gestion de saldo y costes a un adaptador inyectable, manteniendo `slotEngine.js` como motor puro.

## Patrones (octubre 2026)

Hay 20 recorridos de seis rodillos, definidos en `paylines.json`: cinco horizontales y quince diagonales, V y zigzag. Se requieren al menos tres símbolos consecutivos desde la izquierda. WILD sustituye símbolos normales; escudos y BONUS cuentan por posiciones, no por líneas. Cada tirada incluye todos los recorridos y los premios de varias líneas se suman.

La economía Fantasy conserva los escenarios y pesos existentes (pago base 0/1/2/4/2). Los tableros se construyen en el servidor para representar esos resultados con una línea de 3, 4 o 6 símbolos, o dos líneas de cuatro en algunos premios altos. No son 20 sorteos económicos independientes: el número de recorridos no multiplica la frecuencia de premios. Demo y servidor usan la misma tabla por longitud (3→x1, 4→x2, 5→x3, 6→x4); los generadores actuales no producen líneas de cinco.

`le_gazal_spin` guarda `visual_result` junto al pago y el apunte económico, en la misma transacción. El navegador consume ese tablero y restaura la última tirada al reabrir una sesión activa. Las tiradas históricas conservan `visual_result=null`: no se reescriben ni recalculan saldos. El generador privado es determinista respecto al UUID del giro; las pruebas cotejan 720 tableros con el evaluador del navegador y comprueban saldo, bonus, permisos y persistencia del RPC.

La superposición SVG mide los centros de las casillas para respetar huecos y padding en móvil. Solo dibuja combinaciones ganadoras explícitas, nunca líneas horizontales deducidas de escudos dispersos. Hay un visor plegable de recorridos y trazado sin animación con movimiento reducido.

## Tablero viviente: mapache y salamandra

Los nuevos giros usan `mode: living` y una lista de eventos guardada por el servidor. El mapache original (`Mapache.png`) y la salamandra adaptada del escudo cooperan: activación de casilla, desplazamiento adyacente, recogida remunerada y gravedad/relleno de la columna. Se actualiza el acumulado durante las recogidas. También hay exploración sin premio y activación de scatters dentro del tablero. Pol y Pelos se reservan para las celebraciones de los tres niveles de scatter.

Esta primera fase sustituye las líneas como forma de resolver **nuevas** jugadas; mantiene intactos los datos y el evaluador de los tableros antiguos. Los eventos determinan el estado mostrado y la suma de sus recogidas debe coincidir con el pago autorizado del giro. Se conservan los pesos e importes base anteriores; no se añaden cargos por movimiento, y los giros gratis siguen sin descontar cervezas. Las ampliaciones y las mejoras persistentes del bonus se describen a continuación.

`livingEngine.js` reproduce la misma secuencia que `gazalbide_internal.le_gazal_living` y administra temporizadores cancelables. Los controles permanecen bloqueados hasta la resolución completa. Al recargar, Fantasy restaura el tablero final guardado; no se vuelve a girar ni a pagar. Movimiento reducido omite las transiciones con idéntico saldo. La prueba SQL compara 576 secuencias completas de servidor/demo; las pruebas cubren adyacencia, gravedad, suma de premios, titularidad, giros gratis y cancelación.

Recurso nuevo: `public/assets/le-gazal/characters/salamander-v1.webp`, generado con imagegen integrado a partir de `Escudo.png`. Prompt: aislar y adaptar fielmente la salamandra negra con manchas amarillas, ojos marrones, sonrisa y camiseta Gazalbide 13, cuerpo completo y fondo transparente; retirar el marco del escudo y el balón. El mapache existente se conserva.


## Bonus: suelo mejorable y ampliaciones

`bonusBoard.js` / `gazalbide_internal.le_gazal_bonus_living` resuelven los giros gratis con un suelo persistente. Cada recogida paga apuesta × multiplicador del bonus × (1 + nivel previo de la casilla). Después mejora el suelo hasta nivel 2 (próxima recogida x3). Los niveles no caen con los símbolos. No hay premios pasivos por ver una casilla mejorada.

A las 6 y 12 recogidas se añade una columna (6×5 → 7×5 → 8×5). Cada columna desbloqueada añade una recogida a los resultados premiados posteriores. El cambio se anima después de resolver las recogidas del giro. El máximo por giro gratis es 6 recogidas × x3 de suelo × apuesta × multiplicador de bonus; una pérdida sigue pagando cero. Los giros de pago mantienen los pesos e importes de v2. Esta fase aumenta los premios de bonus; no cambia probabilidades, no cobra por las mejoras ni recalcula giros antiguos.

El servidor guarda `le_gazal_sessions.board_state` bajo el mismo bloqueo/transacción que saldo, giro y ledger. Los eventos incluyen instantáneas del suelo; recargar restaura el último resultado y reanuda el progreso sin volver a pagar. Los retriggers lo conservan. La última tirada gratis y el cashout manual/automático lo borran; el siguiente giro de pago vuelve a 6×5. Las sesiones antiguas sin estado empiezan con suelo nuevo. El modo diversión reproduce la mecánica solo en memoria, se reinicia al abandonar la página y nunca escribe en Supabase.

Los personajes ya no llevan rótulos debajo. Los símbolos corrientes distintos del balón y la canasta siguen siendo relleno visual en esta fase; los escudos y BONUS sí disparan sus funciones. No se anuncian premios ni mejoras por esos símbolos decorativos.

QA admin: `/#/fantasy/le-gazal-demo` → «Probar mejora y ampliación» prepara un bonus ficticio con 5 recogidas y un premio alto para comprobar niveles y 7ª columna en una tirada. Repetir «Premio grande» dentro de ese bonus permite abrir la 8ª. «Reiniciar» limpia todo. El botón no existe en el modo público ni en Fantasy real.
