// Read-only visual fixture: real components/CSS, synthetic tickets, no API calls.
// Run from the repository: node scripts/preview_gazalbet.mjs /absolute/output.html
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve(process.argv[2] || "/tmp/gazalbet-preview.html");
const server = await createServer({
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true },
  appType: "custom",
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://127.0.0.1:9"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("visual-fixture-only"),
  },
});
try {
  const { default: Live } = await server.ssrLoadModule("/src/features/gazalbet/GazalBetLive.jsx");
  const { default: History } = await server.ssrLoadModule("/src/features/gazalbet/GazalBetHistory.jsx");
  const week = { id: 1, name: "Jornada 1", opponent: "Rival con un nombre especialmente largo", date: "2026-10-10", match_id: "fixture" };
  const legs = [
    { id: "pts", leg_type: "player_prop", player_id: 1, stat_key: "pts", direction: "over", line: 10.5, odds: 1.8, status: "pending", label: "Jugador con nombre largo · Puntos · Más de 10.5" },
    { id: "total", leg_type: "game_prop", stat_key: "total", direction: "under", line: 110.5, odds: 2, status: "pending", label: "Total de puntos · Menos de 110.5" },
  ];
  const ticket = { id: "pending", gameweek_id: 1, ticket_type: "accumulator", total_odds: 3.6, stake: 5, payout: 0, status: "pending", placed_at: "2026-10-08T10:00:00Z", gazalbet_ticket_legs: legs };
  const won = { ...ticket, id: "won", status: "won", payout: 9, total_odds: 1.8, settled_at: "2026-10-08T12:00:00Z", gazalbet_ticket_legs: [{ ...legs[0], status: "won", result_value: 13 }, { ...legs[1], status: "void" }] };
  const legacy = { id: "legacy", gameweek_id: 1, odds: 2.1, stake: 5, status: "pending", selection_key: "gazalbide", selection_label: "Gazalbide gana", gazalbet_markets: { kind: "winner" } };
  const live = renderToStaticMarkup(React.createElement(Live, { gameweeks: [week], gameweek: week, tickets: [ticket, won], bets: [legacy], snapshot: { phase: "live", score: { gazalbide: 60, opponent: 55 }, players: [{ playerId: 1, stats: { pts: 13 } }] }, updatedAt: Date.parse("2026-10-08T10:30:00Z") }));
  const history = renderToStaticMarkup(React.createElement(History, { gameweeks: [week], tickets: [ticket, won], bets: [legacy] }));
  const css = (await Promise.all(["src/index.css", "src/gazalbet.css"].map((p) => readFile(p, "utf8")))).join("\n");
  await copyFile("public/gazalbet-logo.webp", path.join(path.dirname(output), "gazalbet-logo.webp"));
  const hero = '<header class="gazalbet-hero"><img src="gazalbet-logo.webp" alt="GazalBet"><div class="gazalbet-hero__copy"><span>APUESTAS CON FICHAS VIRTUALES</span><h1>GazalBet</h1><p>Crea tus líneas, apuesta por separado o monta una combinada.</p></div><div class="gazalbet-balance"><small>Tu saldo</small><strong>218,95 🪙</strong></div></header>';
  const tabs = '<nav class="gazalbet-tabs"><button>Apuestas</button><button class="active">En directo</button><button>Ranking</button><button>Mis apuestas</button></nav>';
  const document = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main class="container"><div class="gazalbet-page">${hero}${tabs}${live}${history}</div></main></body></html>`;
  const escape = (s) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const widths = [320, 390, 768, 1280];
  await writeFile(output, `<!doctype html><html lang="es"><meta charset="utf-8"><title>GazalBet · revisión responsive</title><style>body{background:#222;color:#eee;font:16px system-ui;margin:16px}section{display:flex;gap:20px;align-items:start;flex-wrap:wrap}iframe{border:1px solid #666;height:1800px}h1{font-size:20px}</style><h1>Componentes reales · datos ficticios · sin conexión a Supabase</h1><section>${widths.map((width) => `<article><h2>${width}px</h2><iframe title="GazalBet ${width}px" width="${width}" srcdoc="${escape(document)}"></iframe></article>`).join("")}</section></html>`);
  console.log(output);
} finally {
  await server.close();
}
