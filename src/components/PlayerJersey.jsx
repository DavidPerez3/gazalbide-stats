// Vector jersey inspired by the club kit: gold shoulders and side panels,
// black body and a few angular map lines. The number remains live text.
export default function PlayerJersey({ number, className = '' }) {
  return <svg className={`player-jersey ${className}`} viewBox="0 0 64 76" role="img" aria-label={`Camiseta, dorsal ${number}`}>
    <path fill="#111" stroke="#d4af37" strokeWidth="1.5" strokeLinejoin="round" d="M18 3 8 7v13c0 7-3 11-6 13v40h60V33c-3-2-6-6-6-13V7L46 3c-2 8-7 12-14 12S20 11 18 3Z" />
    <path fill="#d4af37" d="m8 7 10-4 3 8-13 4Zm38-4 10 4v8l-13-4ZM2 33l7-5v45H2Zm53-5 7 5v40h-7Z" />
    <path stroke="#555" strokeWidth="1" fill="none" d="m12 18 9 5 5-3 7 6 12-6 7 4M13 65l7-4 9 3 5-7 17 4M14 35l8-5m23 2 6 4" />
    <path stroke="#d4af37" strokeWidth="1.3" fill="none" d="m10 28 13-4 7 4 19-7M11 58l13 4 8-3 20 7" />
    <text x="32" y="32" textAnchor="middle" fill="#d4af37" fontSize="5.3" fontWeight="800" fontFamily="sans-serif">GAZALBIDE</text>
    <text x="32" y="54" textAnchor="middle" fill="#e8bf45" fontSize={String(number).length > 2 ? 18 : 23} fontWeight="900" fontFamily="sans-serif">{number}</text>
  </svg>;
}
