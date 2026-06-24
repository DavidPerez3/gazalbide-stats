import { DEBUG_SCENARIOS } from "../slotTypes";

export default function LeGazalDebugPanel({ onRunScenario }) {
  return (
    <section className="le-gazal-debug card">
      <div className="le-gazal-debug__header">
        <h2>Debug demo</h2>
        <span>Visible solo en modo debug.</span>
      </div>

      <div className="le-gazal-debug__grid">
        {DEBUG_SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className="le-gazal-debug__button"
            onClick={() => onRunScenario(scenario.id)}
          >
            {scenario.label}
          </button>
        ))}
      </div>
    </section>
  );
}
