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

Esta primera fase sustituye las líneas como forma de resolver **nuevas** jugadas; mantiene intactos los datos y el evaluador de los tableros antiguos. Los eventos determinan el estado mostrado y la suma de sus recogidas debe coincidir con el pago autorizado del giro. Se conservan los pesos e importes base anteriores; no se añaden cargos por movimiento, y los giros gratis siguen sin descontar cervezas. No incluye todavía ampliaciones del tablero ni casillas mejorables persistentes entre giros de bonus.

`livingEngine.js` reproduce la misma secuencia que `gazalbide_internal.le_gazal_living` y administra temporizadores cancelables. Los controles permanecen bloqueados hasta la resolución completa. Al recargar, Fantasy restaura el tablero final guardado; no se vuelve a girar ni a pagar. Movimiento reducido omite las transiciones con idéntico saldo. La prueba SQL compara 576 secuencias completas de servidor/demo; las pruebas cubren adyacencia, gravedad, suma de premios, titularidad, giros gratis y cancelación.

Recurso nuevo: `public/assets/le-gazal/characters/salamander-v1.webp`, generado con imagegen integrado a partir de `Escudo.png`. Prompt: aislar y adaptar fielmente la salamandra negra con manchas amarillas, ojos marrones, sonrisa y camiseta Gazalbide 13, cuerpo completo y fondo transparente; retirar el marco del escudo y el balón. El mapache existente se conserva.
