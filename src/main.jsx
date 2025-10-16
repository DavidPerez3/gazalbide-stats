import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App.jsx";
import Home from "./pages/Home.jsx";
import Match from "./pages/Match.jsx";
import Players from "./pages/Players.jsx";
import Player from "./pages/Player.jsx";
import Ranking from "./pages/Ranking.jsx";
import "./index.css";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        { index: true, element: <Home /> },
        { path: "partido/:id", element: <Match /> },
        { path: "jugadores", element: <Players /> },
        { path: "jugador/:name", element: <Player /> },
        { path: "ranking", element: <Ranking /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL } // "/" en dev, "/gazalbide-stats/" en GH Pages
);

createRoot(document.getElementById("root")).render(<RouterProvider router={router} />);
