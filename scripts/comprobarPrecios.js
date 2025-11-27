import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabase = createClient("https://xsqjkasrcxbyrdyxevyu.supabase.co", "sb_publishable_Sybd0sqb4WazvZ9M4HYEaQ_zOHxO2am");

const GW = 12;
const BUDGET = 80;

// precios actuales desde tu json
const fantasyPlayers = JSON.parse(fs.readFileSync("../public/data/fantasy_players.json", "utf8"));
const priceByNumber = new Map(
  fantasyPlayers.map(p => [Number(p.number ?? p.dorsal), Number(p.price ?? 0)])
);

const { data: lineups, error } = await supabase
  .from("fantasy_lineups")
  .select("fantasy_team_id, players")
  .eq("gameweek_id", GW);

if (error) throw error;

// calcula coste
const expensive = [];
for (const l of lineups) {
  const nums = (l.players || []).map(x => Number(x)).filter(n => !Number.isNaN(n) && n >= 0);
  const cost = nums.reduce((s, n) => s + (priceByNumber.get(n) || 0), 0);
  if (cost > BUDGET) expensive.push({ fantasy_team_id: l.fantasy_team_id, cost });
}

console.log("Equipos que valen más de 80:");
console.table(expensive);
