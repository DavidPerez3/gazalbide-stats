import React from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import App from "./App.jsx";
import Home from "./pages/Home.jsx";
import Match from "./pages/Match.jsx";
import Players from "./pages/Players.jsx";
import Player from "./pages/Player.jsx";
import Ranking from "./pages/Ranking.jsx";
import Compare from "./pages/Compare";
import "./index.css";

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "partido/:id", element: <Match /> },
      { path: "jugadores", element: <Players /> },
      { path: "jugador/:name", element: <Player /> },
      { path: "ranking", element: <Ranking /> },
      { path: "compare", element: <Compare /> },
    ],
  },
]);

createRoot(document.getElementById("root")).render(
  <RouterProvider router={router} />
);
