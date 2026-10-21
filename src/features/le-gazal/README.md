# Le Gazal — cuatro salamandras (v5)

## Aspecto y personajes

El mapache original es un anfitrión estático junto al logo, arriba a la izquierda, y no participa en las recogidas nuevas. Las cuatro salamandras comparten diseño y camiseta Gazalbide #13 negra, con manchas, ribetes y letras en su color:

- Amarilla original: BALL, balón dorado.
- Rosa/fucsia, inspirada en los colores del femenino: WHISTLE, silbato rosa.
- Azul eléctrico: SHOE, zapatilla azul.
- Verde lima: HOOP, canasta verde.

Los símbolos nuevos son SVG sencillos (`SalamanderSymbol.jsx`): se distinguen por objeto además del color. Los cuatro colores se mezclan uniformemente por todo el tablero. No hay mitades, letras, números ni iconos de relleno. Los escudos conservan el emblema y activan los bonus; Pol y Pelos siguen reservados para celebrarlos. El panel muestra una sola vez saldo y premio, una línea de resultado/progreso y los controles. Reglas en «Cómo jugar», sin leyenda permanente ni nombres debajo de personajes.

### Assets y generación

Se conserva `public/assets/le-gazal/characters/salamander-v1.webp`. Nuevos sprites de 512×512 con alfa:

- `public/assets/le-gazal/characters/salamander-pink-v1.webp`
- `public/assets/le-gazal/characters/salamander-blue-v1.webp`
- `public/assets/le-gazal/characters/salamander-green-v1.webp`

Generados con la herramienta integrada image_gen, usando la salamandra original como referencia de edición. Prompt por variante: conservar cara, proporciones, pose, cola, piel negra, estilo ilustrado, texto GAZALBIDE y dorsal 13; sustituir todas las manchas, ribetes y letras amarillas por fucsia #ff3ba7 / azul eléctrico #24bfff / verde lima #91f52b; mantener camiseta y pantalón negros; personaje completo aislado, fondo alfa transparente, sin escenario ni rótulos. La conversión a WebP conserva el alfa; el prebuild comprueba tamaño, formato y transparencia.

## Resolución y economía

`salamanderEngine.js` / `gazalbide_internal.le_gazal_salamanders` generan primero símbolos y reservas y resuelven el tablero. Las salamandras arrancan en las cuatro esquinas y alternan amarillo, rosa, azul, verde. Solo entran en una casilla contigua de su color (arriba, derecha, abajo, izquierda), nunca en la de otra salamandra. Eligen el mayor premio incluyendo suelo; empate en ese mismo orden. Sin objetivo no se mueven. Cada movimiento precede una recogida positiva.

Cada recogida paga **0,10 × apuesta × nivel del suelo × multiplicador del bonus**. Los cálculos se realizan en céntimos y se conservan dos decimales. La reserva de cinco símbolos por columna limita la resolución sin cortar recorridos válidos: tras agotarla quedan huecos. Solo aparecen escudos en la generación inicial (aproximadamente 1,4 % de cada casilla); cada color corriente tiene la misma probabilidad en cualquier columna.

Los escudos iniciales activan 3 → 10 giros x2; 4 → 15 x3; 5 o más → 20 x5, compatibles con cobrar recogidas. Los retriggers suman giros y conservan el mayor multiplicador. En bonus, recoger mejora el suelo para la siguiente visita: normal → x2 → x3. A las 6 y 12 recogidas se abren columnas hasta 8×5, sin recogidas extra garantizadas. Los eventos incluyen el suelo; el estado final conserva también el último contador de una casilla ya al máximo.

### Persistencia, decimales y retirada

La sesión, los pagos, los balances por giro y el ledger admiten dos decimales (numeric 14,2). No se recalculan importes antiguos. El RPC mantiene el bloqueo de sesión y la autorización del propietario, y guarda evento, saldo, suelo y ledger en la misma transacción. Al recargar se restaura el resultado sin repetir cobros ni apuestas. Los helpers no son ejecutables por clientes.

Fantasy mantiene su presupuesto en cervezas enteras. El cashout aplica **floor(balance)** antes del límite de ahorro, tanto manual como automático, sin redondear hacia arriba. El botón muestra la parte entera; su ayuda y las reglas indican que los decimales no se transfieren. El resumen y el apunte de descarte incluyen esos decimales junto al exceso de límite, si existe. Se limpian giros gratis y suelo. El modo diversión nunca escribe en Supabase y reproduce ese resumen con datos ficticios.

### Simulación y comprobaciones

`node scripts/simulate_le_gazal_salamanders.mjs 50000`: semilla 1729, 50.000 giros de pago con apuesta 1 y todos sus bonus/retriggers. Muestra de referencia: 5.540 giros gratis, 525 activaciones, 32.094,30 de pago total, retorno observado **64,1886 %**, 89,516 % de giros de pago con alguna recogida. Es una medición de muestra, no una garantía ni una prueba del valor esperado exacto. El acierto frecuente puede pagar menos que la apuesta.

Pruebas SQL: 480 secuencias completas de JS/Postgres con seis, siete y ocho columnas, distintos niveles y multiplicadores. Se prueban las cuatro identidades y sus símbolos, exclusión de las otras tres posiciones, mezcla de colores por columna, premios positivos en céntimos, conservación de saldo/ledger, autorización y cashout 11,99 → 11 con descarte 0,99. Las pruebas de interfaz mantienen el historial y comprueban cuatro salamandras sin mapache ni nombres sobre el tablero.

QA: `/#/fantasy/le-gazal-demo` permite preparar pérdida quieta, amarilla con balón, recogidas encadenadas, cuatro colores y 3/4/5 escudos. «Probar mejora y ampliación» prepara un bonus ficticio próximo a abrir una columna. «Reiniciar» borra el progreso ficticio. No hay resultados forzados en Fantasy real ni en diversión pública.

## Historial

Los motores v1–v4 (`slotEngine`, `livingEngine`, `bonusBoard`, `collectionEngine`) y sus helpers SQL se conservan para las pruebas y las instantáneas históricas. No resuelven nuevas tiradas. Las imágenes antiguas y el render de símbolos sin paleta permiten restaurar esos resultados sin convertirlos al diseño nuevo.
