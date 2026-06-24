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
          <p>Esta es una demo con cervezas virtuales ilimitadas y sin valor economico real.</p>
          <p>No se pueden comprar ni retirar cervezas y esta version no toca fantasy, plantilla ni estadisticas.</p>
          <p>Las jugadas ganadoras se leen de izquierda a derecha en cada fila. La camiseta 88 hace de wild para cerrar combos.</p>
          <p>Tres scatters activan CLUTCH TIME con 3 tiradas gratis y multiplicador x2.</p>
          <p>Tres bonus activan CLUTCH TIME+ con 5 tiradas gratis y multiplicador x3.</p>
          <p>Es una mecanica humoristica y experimental para la web del equipo. Mas adelante podra conectarse a la economia fantasy, pero hoy no lo hace.</p>
        </div>
      </div>
    </div>
  );
}
