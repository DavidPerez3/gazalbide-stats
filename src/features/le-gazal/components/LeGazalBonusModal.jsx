export default function LeGazalBonusModal({ modal, onClose }) {
  if (!modal) {
    return null;
  }

  return (
    <div className="le-gazal-modal" role="dialog" aria-modal="true" aria-labelledby="le-gazal-bonus-title">
      <div className="le-gazal-modal__card le-gazal-modal__card--centered">
        <div className="le-gazal-modal__body le-gazal-modal__body--centered">
          <h2 id="le-gazal-bonus-title">{modal.title}</h2>
          {"description" in modal ? (
            <>
              <p>{modal.description}</p>
              <p>
                Preparadas: {modal.freeSpins} tiradas gratis x{modal.multiplier}.
              </p>
            </>
          ) : (
            <>
              <p>
                Ganado durante el bonus: {modal.totalWon} cervezas virtuales.
              </p>
              <p>
                Resueltas: {modal.spins} tiradas gratis con multiplicador x{modal.multiplier}.
              </p>
            </>
          )}
          <button type="button" className="le-gazal-spin le-gazal-spin--compact" onClick={onClose}>
            Seguir
          </button>
        </div>
      </div>
    </div>
  );
}
