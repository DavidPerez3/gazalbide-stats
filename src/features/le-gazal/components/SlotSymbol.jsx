import { getSymbolDefinition } from "../slotConfig";

function BasketballIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="36" fill="#f97316" stroke="#120f0b" strokeWidth="5" />
      <path d="M50 14 C40 28 40 72 50 86" fill="none" stroke="#120f0b" strokeWidth="5" />
      <path d="M50 14 C60 28 60 72 50 86" fill="none" stroke="#120f0b" strokeWidth="5" />
      <path d="M16 50 H84" fill="none" stroke="#120f0b" strokeWidth="5" />
      <path d="M26 26 C42 42 58 58 74 74" fill="none" stroke="#120f0b" strokeWidth="5" />
    </svg>
  );
}

function HoopIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="20" y="16" width="42" height="32" rx="4" fill="#f8fafc" stroke="#111827" strokeWidth="4" />
      <rect x="60" y="24" width="8" height="54" rx="4" fill="#d1d5db" />
      <path d="M34 52 H70" fill="none" stroke="#ef6c00" strokeWidth="6" strokeLinecap="round" />
      <path d="M38 54 L42 72 L50 82 L58 72 L62 54" fill="none" stroke="#facc15" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function WhistleIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M18 54 C18 36 34 24 50 24 H68 C76 24 82 30 82 38 C82 46 76 52 68 52 H58 L48 72 H34 C25 72 18 65 18 54 Z"
        fill="#f8fafc"
        stroke="#111827"
        strokeWidth="4"
      />
      <circle cx="63" cy="39" r="7" fill="#111827" />
      <circle cx="38" cy="54" r="10" fill="#f59e0b" stroke="#111827" strokeWidth="4" />
    </svg>
  );
}

function JerseyIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M26 20 L40 12 L50 24 L60 12 L74 20 L82 40 L70 48 V84 H30 V48 L18 40 Z"
        fill="#111827"
        stroke="#facc15"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <text x="50" y="62" textAnchor="middle" fill="#facc15" fontSize="26" fontWeight="700">
        88
      </text>
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M28 18 H72 V32 C72 49 62 60 50 60 C38 60 28 49 28 32 Z" fill="#facc15" stroke="#7c5300" strokeWidth="4" />
      <path d="M28 24 H18 C18 40 24 50 36 50" fill="none" stroke="#7c5300" strokeWidth="4" />
      <path d="M72 24 H82 C82 40 76 50 64 50" fill="none" stroke="#7c5300" strokeWidth="4" />
      <rect x="44" y="60" width="12" height="12" rx="2" fill="#facc15" stroke="#7c5300" strokeWidth="4" />
      <rect x="32" y="72" width="36" height="10" rx="3" fill="#7c5300" />
    </svg>
  );
}

function BonusIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="34" fill="#f97316" stroke="#fde68a" strokeWidth="4" />
      <circle cx="50" cy="50" r="22" fill="#fff7d6" opacity="0.45" />
      <path d="M50 18 L57 37 L78 38 L62 51 L67 72 L50 60 L33 72 L38 51 L22 38 L43 37 Z" fill="#111827" opacity="0.3" />
      <path d="M50 28 L55 42 L70 43 L58 52 L62 66 L50 58 L38 66 L42 52 L30 43 L45 42 Z" fill="#fef08a" />
    </svg>
  );
}

function renderArt(symbol) {
  if (symbol.assetPath) {
    return <img src={symbol.assetPath} alt="" className="le-gazal-symbol__image" />;
  }

  if (symbol.id === "BALL") {
    return <BasketballIcon />;
  }

  if (symbol.id === "HOOP") {
    return <HoopIcon />;
  }

  if (symbol.id === "WHISTLE") {
    return <WhistleIcon />;
  }

  if (symbol.id === "JERSEY88") {
    return <JerseyIcon />;
  }

  if (symbol.id === "TROPHY") {
    return <TrophyIcon />;
  }

  if (symbol.id === "BONUS_BALL") {
    return <BonusIcon />;
  }

  return <span className="le-gazal-symbol__value">{symbol.shortLabel}</span>;
}

export default function SlotSymbol({ symbolId }) {
  const symbol = getSymbolDefinition(symbolId);

  return (
    <div className={`le-gazal-symbol le-gazal-symbol--${symbol.tone}`}>
      <div className="le-gazal-symbol__art">{renderArt(symbol)}</div>
      {symbol.tag ? <span className="le-gazal-symbol__tag">{symbol.tag}</span> : null}
    </div>
  );
}
