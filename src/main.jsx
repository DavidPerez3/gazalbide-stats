import React from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";

import App from "./App.jsx";
import Home from "./pages/Home.jsx";
import Match from "./pages/Match.jsx";
import Players from "./pages/Players.jsx";
import Player from "./pages/Player.jsx";
import Ranking from "./pages/Ranking.jsx";
import Compare from "./pages/Compare.jsx";

import AuthPage from "./pages/AuthPage.jsx";
import FantasyHome from "./pages/FantasyHome.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import FantasyBuilder from "./pages/FantasyBuilder.jsx";
import FantasyHistory from "./pages/FantasyHistory.jsx";
import FantasyRanking from "./pages/FantasyRanking.jsx";
import FantasyTeamHistory from "./pages/FantasyTeamHistory.jsx";

import { AuthProvider } from "./context/AuthContext.jsx";
import PrivateRoute from "./components/PrivateRoute.jsx";

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

      { path: "login", element: <AuthPage /> },

      {
        path: "fantasy",
        element: (
          <PrivateRoute>
            <FantasyHome />
          </PrivateRoute>
        ),
      },
      {
        path: "fantasy/crear-equipo",
        element: (
          <PrivateRoute>
            <FantasyBuilder />
          </PrivateRoute>
        ),
      },
      {
        path: "fantasy/historial",
        element: (
          <PrivateRoute>
            <FantasyHistory />
          </PrivateRoute>
        ),
      },
      {
        path: "fantasy/ranking",
        element: (
          <PrivateRoute>
            <FantasyRanking />
          </PrivateRoute>
        ),
      },
      {
        path: "fantasy/team/:teamId",
        element: (
          <PrivateRoute>
            <FantasyTeamHistory />
          </PrivateRoute>
        ),
      },
      {
        path: "admin",
        element: (
          <PrivateRoute adminOnly={true}>
            <AdminPage />
          </PrivateRoute>
        ),
      },
    ],
  },
]);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
