export default function LeGazalRulesModal({ open, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div className="le-gazal-modal" role="dialog" aria-modal="true" aria-labelledby="le-gazal-rules-title">
      <div className="le-gazal-modal__card">
        <div className="le-gazal-modal__header">
          <h2 id="le-gazal-rules-title">Reglas de Le Gazal</h2>
          <button type="button" className="le-gazal-modal__close" onClick={onClose} aria-label="Cerrar reglas">
            Cerrar
          </button>
        </div>

        <div className="le-gazal-modal__body">
          <p>Le Gazal utiliza exclusivamente cervezas virtuales sobrantes de una jornada Fantasy con alineación válida. No tienen valor económico real.</p>
          <p>Si no juegas, el ahorro se conserva automáticamente. Jugar puede reducir tu saldo; las cervezas apostadas no están garantizadas.</p>
          <p>Puedes elegir cuánto saldo sobrante destinar a Le Gazal y apostar 1, 3, 5 o 10 🍺 por tirada.</p>
          <p>Cuatro salamandras recogen símbolos de su color: amarilla → balón, rosa → silbato, azul → zapatilla y verde → canasta. El mapache es el anfitrión y no interviene en el tablero.</p>
          <p>Cada recogida paga 0,10 × apuesta × multiplicador del suelo × multiplicador del bonus, en cervezas virtuales. Se conserva el saldo con dos decimales. El premio es siempre positivo, aunque sea menor que la apuesta.</p>
          <p>Las cuatro salamandras comparten una cadena por tirada: a las 5 recogidas se suma un extra de 0,50 × apuesta; a las 10, otro de 1,50 × apuesta; y a las 15, otro de 3 × apuesta. Los tres extras son acumulables y se cobran una sola vez cada uno. El suelo y los multiplicadores de scatter no multiplican estos extras. El contador vuelve a cero en cada tirada, también en las gratis.</p>
          <p>Las salamandras alternan turnos y solo se mueven a un símbolo compatible arriba, derecha, abajo o izquierda, sin invadir a otra. Eligen la casilla que más paga; en empate: arriba, derecha, abajo, izquierda. Sin objetivo, se quedan quietas.</p>
          <p>Las casillas ocupadas no contienen símbolos. Tras recoger, los símbolos caen solo por los huecos libres de las columnas afectadas y se rellena desde sus reservas. Hay cinco reposiciones por columna y giro; después quedan huecos. La jugada termina cuando ninguna salamandra puede recoger. Los cuatro colores se mezclan por todo el tablero.</p>
          <p>Los escudos iniciales activan el BONUS: 3 → 10 tiradas gratis x2; 4 → 15 x3; 5 o más → 20 x5. Pueden coincidir recogidas y bonus. Los retriggers añaden tiradas y conservan el mayor multiplicador. Pol y Pelos celebran los escudos.</p>
          <p>Durante el bonus, cada recogida mejora el suelo para la siguiente visita: normal → x2 → x3. A las 6 y 12 recogidas se abre una columna, hasta 8 × 5. Ampliar añade espacio para la siguiente tirada, sin premios automáticos. Fantasy conserva el progreso al volver a entrar; terminar el bonus o guardar el saldo lo reinicia.</p>
          <p>Al guardar en Fantasy se transfiere únicamente la parte entera del saldo, dentro del límite de ahorro de la temporada. Los decimales restantes no se transfieren y se muestran en el resumen. En diversión todo es ficticio y vive solo en memoria.</p>
          <p>Los resultados, apuestas y premios se generan y guardan en el servidor. El navegador solo muestra la animación.</p>
          <p>Puedes retirarte cuando quieras. El saldo guardado se transfiere a la siguiente jornada dentro de los límites de la economía Fantasy.</p>
        </div>
      </div>
    </div>
  );
}
