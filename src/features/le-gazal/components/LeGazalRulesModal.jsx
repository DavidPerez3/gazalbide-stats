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
          <p>El tablero determina el premio. El mapache recoge balones (x1 de la apuesta) y trofeos (x2); la salamandra recoge canastas (x1) y silbatos (x2). Solo pueden recoger arriba, derecha, abajo o izquierda, sin diagonales y sin ocupar la casilla del otro personaje.</p>
          <p>Alternan sus turnos y eligen el símbolo contiguo que más paga, incluyendo la mejora del suelo. En empate: arriba, derecha, abajo, izquierda. Solo se mueven para recoger y cobrar. Sin símbolo compatible al lado, se quedan quietos.</p>
          <p>Tras cada recogida, los símbolos superiores caen y entra uno de la reserva de esa columna. Cada columna dispone de cinco reposiciones por tirada; al agotarse quedan huecos. La jugada continúa mientras algún personaje pueda recoger. El importe mostrado ya incluye todos los multiplicadores.</p>
          <p>Solo los escudos activan el bonus: 3 escudos dan 10 tiradas gratis x2; 4, 15 tiradas x3; 5 o más, 20 tiradas x5. Cuentan los escudos del tablero inicial en cualquier posición. Pueden coincidir un premio por recogidas y un bonus. Más escudos durante el bonus añaden tiradas y conservan el mayor multiplicador.</p>
          <p>Durante el bonus, recoger una casilla mejora su suelo para la siguiente visita: normal → x2 → x3. El suelo no cae con los símbolos. Cada 6 recogidas se abre una columna, hasta 8 × 5. Ampliar añade espacio para las siguientes tiradas: no garantiza recogidas ni paga por sí mismo.</p>
          <p>Fantasy guarda el progreso del bonus al salir y volver a entrar. Al terminar las tiradas gratis o guardar el saldo se reinician niveles y tamaño. El modo diversión guarda todo solo mientras estás en esa página.</p>
          <p>Los resultados, apuestas y premios se generan y guardan en el servidor. El navegador solo muestra la animación.</p>
          <p>Puedes retirarte cuando quieras. El saldo guardado se transfiere a la siguiente jornada dentro de los límites de la economía Fantasy.</p>
        </div>
      </div>
    </div>
  );
}
