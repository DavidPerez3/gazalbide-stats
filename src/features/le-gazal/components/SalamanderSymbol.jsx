const COLORS={BALL:'#ffd52a',WHISTLE:'#ff36ac',SHOE:'#24bfff',HOOP:'#95f52d'};
const LABELS={BALL:'Balón amarillo',WHISTLE:'Silbato rosa',SHOE:'Zapatilla azul',HOOP:'Canasta verde'};
export default function SalamanderSymbol({symbol}) {
 const color=COLORS[symbol];
 if(!color)return null;
 return <div className="le-gazal-color-symbol" style={{color}} data-symbol-color={symbol}>
  <svg viewBox="0 0 100 100" role="img" aria-label={LABELS[symbol]}>
   {symbol==='BALL' && <g stroke="#372e0b" strokeWidth="4" fill="none">
    <circle cx="50" cy="50" r="35" fill="currentColor"/>
    <path d="M15 50h70M50 15v70M25 25c36 0 50 20 50 50M25 75c0-36 20-50 50-50"/>
    <path d="M30 27c5-5 12-8 18-8" stroke="#fff4b3" strokeLinecap="round"/>
   </g>}
   {symbol==='HOOP' && <g strokeLinejoin="round" strokeLinecap="round">
    <rect x="15" y="16" width="70" height="43" rx="7" fill="#18340b" stroke="currentColor" strokeWidth="7"/>
    <path d="M38 48V34h24v14" fill="none" stroke="currentColor" strokeWidth="4"/>
    <path d="M30 58l9 26h22l9-26M38 59l20 25M62 59L42 84M35 70h30" fill="none" stroke="#ddffc0" strokeWidth="3"/>
    <ellipse cx="50" cy="57" rx="25" ry="7" fill="#244310" stroke="currentColor" strokeWidth="6"/>
   </g>}
   {symbol==='SHOE' && <g stroke="#092a44" strokeWidth="4" strokeLinejoin="round">
    <path d="M18 22h23l5 24 16 10 19 4 6 13-4 10H15l-3-13 6-14z" fill="currentColor"/>
    <path d="M14 73h71v10H15z" fill="#c5f0ff"/>
    <path d="M34 45l12-3M39 52l12-4M47 58l10-5" stroke="#e7f9ff" strokeLinecap="round"/>
    <path d="M25 29v20" stroke="#92e5ff" strokeLinecap="round"/>
   </g>}
   {symbol==='WHISTLE' && <g stroke="#460c30" strokeWidth="4" strokeLinejoin="round">
    <path d="M14 54a25 25 0 0 1 25-25h39l8 11-17 17H59L48 79H32a23 23 0 0 1-18-25z" fill="currentColor"/>
    <circle cx="37" cy="55" r="13" fill="#820d54"/>
    <path d="M54 34h18l-8 10H51z" fill="#ffb6df"/>
    <path d="M19 80l8-9" stroke="currentColor" strokeWidth="7" strokeLinecap="round"/>
   </g>}
  </svg>
 </div>;
}
