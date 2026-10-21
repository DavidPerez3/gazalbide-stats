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
          <p>Si no juegas, el ahorro se conserva automáticamente. Jugar tiene riesgo y un valor esperado inferior a guardar las cervezas.</p>
          <p>Puedes elegir cuánto saldo sobrante destinar a Le Gazal y apostar 1, 3, 5 o 10 🍺 por tirada.</p>
          <p>El mapache y la salamandra cooperan en el tablero: uno activa una casilla, el otro recoge su símbolo y los símbolos superiores caen para rellenar el hueco. Cada recogida suma al premio visible de la jugada. No necesitas formar líneas.</p>
          <p>El importe de cada recogida se muestra al recogerla; el multiplicador del bonus ya está incluido. Una tirada puede encadenar varias recogidas con una sola apuesta. Las casillas corrientes no pagan por aparecer: solo cuentan los símbolos activados y recogidos.</p>
          <p>3 escudos activan CLUTCH TIME: 10 tiradas gratis x2. Con 4 escudos: 15 tiradas x3. Con 5 o más: LOCURA GAZAL, 20 tiradas x5. Tres símbolos BONUS activan 5 tiradas gratis x3. Los símbolos de bonus cuentan en cualquier posición.</p>
          <p>Los resultados, apuestas y premios se generan y guardan en el servidor. El navegador solo muestra la animación.</p>
          <p>Puedes retirarte cuando quieras. El saldo guardado se transfiere a la siguiente jornada dentro de los límites de la economía Fantasy.</p>
        </div>
      </div>
    </div>
  );
}
