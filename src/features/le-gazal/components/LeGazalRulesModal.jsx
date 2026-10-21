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
          <p>El mapache y la salamandra cooperan en el tablero: uno activa una casilla, el otro recoge su símbolo y los símbolos superiores caen para rellenar el hueco. Cada recogida suma al premio visible de la jugada. No necesitas formar líneas.</p>
          <p>El importe de cada recogida se muestra al recogerla; el multiplicador del bonus ya está incluido. Una tirada puede encadenar varias recogidas con una sola apuesta. Las casillas corrientes no pagan por aparecer: solo cuentan los símbolos activados y recogidos.</p>
          <p>3 escudos activan CLUTCH TIME: 10 tiradas gratis x2. Con 4 escudos: 15 tiradas x3. Con 5 o más: LOCURA GAZAL, 20 tiradas x5. Tres símbolos BONUS activan 5 tiradas gratis x3. Los símbolos de bonus cuentan en cualquier posición.</p>
          <p>En las tiradas gratis, la casilla recogida mejora para la siguiente visita: x1 → x2 → x3. El nivel pertenece al suelo y no cae con los símbolos. El bonus conserva las mejoras al salir y volver a entrar.</p>
          <p>Cada 6 recogidas se desbloquea una columna, hasta 8 × 5. Cada columna nueva añade una recogida a las jugadas premiadas siguientes. Las tiradas sin premio no pagan por tener casillas mejoradas. Al terminar el bonus la pista vuelve a 6 × 5 y los niveles se reinician.</p>
          <p>Los resultados, apuestas y premios se generan y guardan en el servidor. El navegador solo muestra la animación.</p>
          <p>Puedes retirarte cuando quieras. El saldo guardado se transfiere a la siguiente jornada dentro de los límites de la economía Fantasy.</p>
        </div>
      </div>
    </div>
  );
}
