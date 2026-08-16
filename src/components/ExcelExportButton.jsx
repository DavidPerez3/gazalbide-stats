import { useState } from "react";

export default function ExcelExportButton({ onExport, children = "Exportar Excel", className = "" }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await onExport();
    } catch (exportError) {
      console.error("Error exportando Excel:", exportError);
      setError(exportError?.message || "No se pudo generar el Excel.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <span className="excel-export-control">
      <button
        type="button"
        className={`btn ${className}`.trim()}
        onClick={handleClick}
        disabled={working}
      >
        {working ? "Generando Excel…" : children}
      </button>
      {error ? <small className="excel-export-error">{error}</small> : null}
    </span>
  );
}
