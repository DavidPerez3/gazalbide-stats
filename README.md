# Gazalbide Stats 🏀✨

Web estática para consultar estadísticas de partidos y jugadores del **Gazalbide CB**.  
Sin login, sin base de datos: subes tu Excel → el script lo convierte a JSON → la web los muestra.

---

## ⚡ Características

- Sin autenticación ni backend.
- Importación desde Excel (`.xls`/`.xlsx`) → JSON listo para servir.
- Páginas:
  - **Inicio:** lista de partidos.
  - **Partido:** tabla por jugador con FG%, 2P%, 3P%, FT%.
  - **Jugadores:** grid ordenado por dorsal.
  - **Jugador:** tarjetas con Total/Media para todas las métricas + % totales.
  - **Ranking:** ranking por cualquier métrica (incluido MIN), en Total o Media.
- **Leyenda reutilizable.**
- **Tema negro + dorado.**

---

## 🗂 Estructura

```bash
gazalbide-stats/
├─ public/data/
│  ├─ matches.json
│  ├─ players.json
│  └─ player_stats/
├─ scripts/
│  └─ convert_excel_to_json.mjs
├─ src/
│  ├─ components/StatLegend.jsx
│  ├─ pages/
│  ├─ lib/data.js
│  ├─ index.css
│  ├─ App.jsx
│  └─ main.jsx
├─ vite.config.js
└─ package.json
```

---

## 📥 Importar Excel → JSON

```bash
node scripts/convert_excel_to_json.mjs ./excels
```

---

## 🧰 Desarrollo local

```bash
npm install
npm run dev
```

Abrir: [http://localhost:5173/](http://localhost:5173/)

---

## 🛫 Despliegue (GitHub Pages)

- `vite.config.js` usa base dinámica.
- Workflow en `.github/workflows/deploy.yml`.
- Página: `https://<TU_USUARIO>.github.io/gazalbide-stats/`

---

## 📊 Métricas

MIN, PTS, REB, OREB, DREB, AST, STL, BLK, TOV, PF, PFD, FGM/FGA, 2PM/2PA, 3PM/3PA, FTM/FTA, PIR, EFF, +/-.

---

## 🎨 Tema

- Fondo: `#0f0f0f`
- Dorado: `#d4af37`
- Hover: `#f1c40f`

---

## 🧪 Comandos

```bash
npm run dev
npm run build
npm run preview
```

---

## 📄 Licencia

MIT — haz magia 🪄
