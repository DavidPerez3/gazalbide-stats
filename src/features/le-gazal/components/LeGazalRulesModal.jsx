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
          <p>Hay 20 líneas activas: horizontales, diagonales, en V y zigzag. Todas están incluidas en el importe de la tirada. Necesitas al menos 3 símbolos iguales consecutivos desde la izquierda, siguiendo el recorrido de una línea. Los WILD sustituyen símbolos normales.</p>
          <p>Una línea de 3, 4, 5 o 6 símbolos paga respectivamente x1, x2, x3 o x4 del importe de la tirada, antes del multiplicador del bonus. Los premios de varias líneas se suman. Puedes consultar los recorridos bajo el tablero.</p>
          <p>3 escudos activan CLUTCH TIME: 10 tiradas gratis x2. Con 4 escudos: 15 tiradas x3. Con 5 o más: LOCURA GAZAL, 20 tiradas x5. Tres símbolos BONUS activan 5 tiradas gratis x3. Los símbolos de bonus cuentan en cualquier posición.</p>
          <p>Los resultados, apuestas y premios se generan y guardan en el servidor. El navegador solo muestra la animación.</p>
          <p>Puedes retirarte cuando quieras. El saldo guardado se transfiere a la siguiente jornada dentro de los límites de la economía Fantasy.</p>
        </div>
      </div>
    </div>
  );
}
