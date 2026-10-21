import LeGazalLivingActors, { livingMessage } from "./LeGazalLivingActors";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SLOT_COLUMNS, SLOT_ROWS } from "../slotTypes";
import PAYLINES from "../paylines.json";
import LeGazalCoinBurst from "./LeGazalCoinBurst";
import SlotSymbol from "./SlotSymbol";

const COLORS = ["#facc15", "#67e8f9", "#f0abfc", "#86efac"];
export default function LeGazalGrid({ grid, isSpinning, stoppedColumns, winningCellKeys,
  winningCombinations = [], coinBurstKey, amountWon, reduceMotion, living = false, livingRound = null, livingFrame = null }) {
  const boardRef = useRef(null);
  const [geometry, setGeometry] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  useEffect(() => { if (isSpinning) setPreviewId(null); }, [isSpinning]);
  useLayoutEffect(() => {
    const board = boardRef.current;
    const measure = () => {
      const bounds = board.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const centers = {};
      board.querySelectorAll('[data-cell-key]').forEach(cell => {
        const b = cell.getBoundingClientRect();
        centers[cell.dataset.cellKey] = [b.x - bounds.x + b.width / 2, b.y - bounds.y + b.height / 2];
      });
      setGeometry({ width: bounds.width, height: bounds.height, centers });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(board);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const displayGrid = livingFrame?.grid || grid;
  const showLiving = livingRound ? livingRound.mode === "living" : living;
  const phase = livingFrame?.playing ? livingFrame.kind : "idle";
  const winningSet = new Set(isSpinning ? [] : winningCellKeys || []);
  const preview = PAYLINES.find(p => p.id === previewId);
  const lines = isSpinning ? [] : preview ? [{id:'preview',cells:preview.rows.map((row,col)=>({row,col}))}] : winningCombinations;
  const points = (cells) => cells.map(({row,col}) =>
    (geometry?.centers[`${row}-${col}`] || [(col+.5)*100,(row+.5)*100]).join(',')).join(' ');

  return <div className={`le-gazal-board-wrap ${reduceMotion ? 'le-gazal-board-wrap--reduced' : ''}`}>
    <div ref={boardRef} className={`le-gazal-board ${isSpinning ? 'le-gazal-board--spinning' : ''}`}
      role="img" aria-label={preview && !isSpinning ? `Vista previa: línea ${preview.id}, ${preview.label}` : `Rodillos de Le Gazal. ${!isSpinning && winningCombinations.length ? `${winningCombinations.length} líneas premiadas` : ''}`}>
      {showLiving && <LeGazalLivingActors geometry={geometry} round={livingRound} frame={livingFrame} reduceMotion={reduceMotion} />}
      <svg className={`le-gazal-board__lines ${preview ? 'le-gazal-board__lines--preview' : ''}`}
        viewBox={`0 0 ${geometry?.width || 600} ${geometry?.height || 500}`} preserveAspectRatio="none" aria-hidden="true">
        {lines.map((line,i) => <polyline key={line.id} points={points(line.cells)} fill="none"
          stroke={COLORS[i % COLORS.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" pathLength="1" />)}
      </svg>
      {Array.from({length:SLOT_COLUMNS},(_,col) => <div key={col}
        className={`le-gazal-board__column ${phase==='cascade' && livingFrame.col===col ? 'le-gazal-board__column--dropping':''}${isSpinning ? stoppedColumns?.[col] ? ' le-gazal-board__column--settled' : ' le-gazal-board__column--spinning' : ''}`}
        style={{animationDelay:`${col*.035}s`}}>
        {Array.from({length:SLOT_ROWS},(_,row) => <div key={row} data-cell-key={`${row}-${col}`}
          className={`le-gazal-board__cell ${livingFrame?.playing && livingFrame.row===row && livingFrame.col===col ? `le-gazal-board__cell--${phase}` : ""} ${winningSet.has(`${row}-${col}`) ? 'le-gazal-board__cell--winning' : ''}`}>
          {displayGrid[row][col] && <SlotSymbol symbolId={displayGrid[row][col]} />}
        </div>)}
      </div>)}
    </div>
    {!isSpinning && winningCombinations.length > 0 && <div className="le-gazal-line-wins" aria-live="polite">
      {winningCombinations.map((line,i) => <span key={line.id} style={{'--line-color':COLORS[i%COLORS.length]}}>
        L{line.lineId} · {line.lineLabel} <strong>+{line.amountWon} 🍺</strong>
      </span>)}
    </div>}
    {showLiving && <div className="le-gazal-living-status" role="status">
      <strong>Tablero viviente</strong><span>{livingMessage(livingFrame,livingRound)}</span>
      {livingFrame?.playing && <small>Recogido: {livingFrame.collected} 🍺</small>}
    </div>}
    {!showLiving && <details className="le-gazal-patterns" onToggle={e => { if (!e.currentTarget.open) setPreviewId(null); }}>
      <summary>20 líneas activas · Ver patrones</summary>
      <p>Tres o más símbolos seguidos desde la izquierda, siguiendo una línea. Todas incluidas en la tirada.</p>
      <div className="le-gazal-patterns__grid">{PAYLINES.map(path => <button type="button" key={path.id}
        disabled={isSpinning} aria-pressed={previewId===path.id} aria-label={`Ver línea ${path.id}: ${path.label}`}
        onClick={()=>setPreviewId(id=>id===path.id ? null : path.id)}>
        <svg viewBox="0 0 60 50" aria-hidden="true"><polyline fill="none" stroke="currentColor" strokeWidth="2"
          points={path.rows.map((row,col)=>`${col*10+5},${row*10+5}`).join(' ')} /></svg>
        <span>L{path.id}</span>
      </button>)}</div>
      {preview && <p className="le-gazal-patterns__preview">Vista previa · {preview.label}. No es un premio.</p>}
    </details>}
    <LeGazalCoinBurst burstKey={coinBurstKey} amountWon={amountWon} disabled={reduceMotion} />
  </div>;
}
