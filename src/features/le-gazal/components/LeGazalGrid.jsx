import { SLOT_COLUMNS, SLOT_ROWS } from "../slotTypes";
import LeGazalCoinBurst from "./LeGazalCoinBurst";
import SlotSymbol from "./SlotSymbol";

function buildWinningRows(grid, winningCellKeys) {
  if (!winningCellKeys?.length) {
    return [];
  }

  const rows = new Map();

  for (const key of winningCellKeys) {
    const [rowText, colText] = key.split("-");
    const row = Number(rowText);
    const col = Number(colText);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      continue;
    }

    if (!rows.has(row)) {
      rows.set(row, []);
    }

    rows.get(row).push(col);
  }

  return [...rows.entries()]
    .map(([row, cols]) => ({ row, min: Math.min(...cols), max: Math.max(...cols) }))
    .filter((item) => item.max > item.min);
}

export default function LeGazalGrid({
  grid,
  isSpinning,
  winningCellKeys,
  coinBurstKey,
  amountWon,
  reduceMotion,
}) {
  const winningSet = new Set(winningCellKeys || []);
  const winningRows = buildWinningRows(grid, winningCellKeys);

  return (
    <div className="le-gazal-board-wrap">
      <div className="le-gazal-board" role="img" aria-label="Rodillos de Le Gazal">
        {winningRows.map((line) => (
          <div
            key={`line-${line.row}-${line.min}-${line.max}`}
            className="le-gazal-board__payline"
            style={{
              top: `calc(${((line.row + 0.5) / SLOT_ROWS) * 100}% - 3px)`,
              left: `calc(${(line.min / SLOT_COLUMNS) * 100}% + 10px)`,
              width: `calc(${(((line.max - line.min) + 1) / SLOT_COLUMNS) * 100}% - 20px)`,
            }}
          />
        ))}

        {Array.from({ length: SLOT_COLUMNS }, (_, columnIndex) => (
          <div
            key={`column-${columnIndex}`}
            className={`le-gazal-board__column ${isSpinning ? "le-gazal-board__column--spinning" : ""}`}
            style={{ animationDelay: `${columnIndex * 0.08}s` }}
          >
            {Array.from({ length: SLOT_ROWS }, (_, rowIndex) => {
              const cellKey = `${rowIndex}-${columnIndex}`;
              const isWinning = winningSet.has(cellKey);

              return (
                <div
                  key={cellKey}
                  className={`le-gazal-board__cell ${isWinning ? "le-gazal-board__cell--winning" : ""}`}
                >
                  <SlotSymbol symbolId={grid[rowIndex][columnIndex]} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <LeGazalCoinBurst
        burstKey={coinBurstKey}
        amountWon={amountWon}
        disabled={reduceMotion}
      />
    </div>
  );
}
