import React from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";

import App from "./App.jsx";
import Home from "./pages/Home.jsx";
import Match from "./pages/Match.jsx";
import LiveCenterPage from "./pages/LiveCenterPage.jsx";
import Players from "./pages/Players.jsx";
import PlayerProfilePage from "./pages/PlayerProfilePage.jsx";
import Ranking from "./pages/Ranking.jsx";
import Compare from "./pages/Compare.jsx";
import LeGazalPage from "./pages/LeGazalPage.jsx";

import AuthPage from "./pages/AuthPage.jsx";
import FantasyHome from "./pages/FantasyHome.jsx";
import NotificationSettingsPage from "./pages/NotificationSettingsPage.jsx";
import AdminCenter from "./pages/AdminCenter.jsx";
import AdminPlayers from "./pages/AdminPlayers.jsx";
import ExportCenterPage from "./pages/ExportCenterPage.jsx";
import LiveStatsSetup from "./pages/LiveStatsSetup.jsx";
import LiveStatsWithStaffPage from "./pages/LiveStatsWithStaffPage.jsx";
import LiveStatsReviewPage from "./pages/LiveStatsReviewPage.jsx";
import LiveReliabilityGuard from "./features/live-stats/LiveReliabilityGuard.jsx";
import FantasyBuilder from "./pages/FantasyBuilder.jsx";
import FantasyHistory from "./pages/FantasyHistory.jsx";
import FantasyRanking from "./pages/FantasyRanking.jsx";
import FantasyTeamHistory from "./pages/FantasyTeamHistory.jsx";

import { AuthProvider } from "./context/AuthContext.jsx";
import { SeasonProvider } from "./context/SeasonContext.jsx";
import PrivateRoute from "./components/PrivateRoute.jsx";
import { installFantasyStatsFetchAdapter } from "./lib/fantasyGameweekStats.js";

import "./index.css";
import "./mobile.css";
import "./fantasy-mobile.css";
import "./responsive-cleanup.css";
import ForgotPassword from "./components/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

installFantasyStatsFetchAdapter();

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "partido/:id", element: <Match /> },
      { path: "live/:matchId", element: <LiveCenterPage /> },
      { path: "jugadores", element: <Players /> },
      { path: "jugador/:name", element: <PlayerProfilePage /> },
      { path: "ranking", element: <Ranking /> },
      { path: "compare", element: <Compare /> },
      { path: "le-gazal", element: <Navigate to="/fantasy/le-gazal" replace /> },

      { path: "login", element: <AuthPage /> },
      { path: "forgot-password", element: <ForgotPassword /> },
      { path: "reset-password", element: <ResetPassword /> },
      {
        path: "notificaciones",
        element: (
          <PrivateRoute>
            <NotificationSettingsPage />
          </PrivateRoute>
        ),
      },

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
        path: "fantasy/le-gazal",
        element: (
          <PrivateRoute>
            <LeGazalPage />
          </PrivateRoute>
        ),
      },
      {
        path: "admin",
        element: (
          <PrivateRoute adminOnly={true}>
            <AdminCenter />
          </PrivateRoute>
        ),
      },
      {
        path: "admin/players",
        element: (
          <PrivateRoute adminOnly={true}>
            <AdminPlayers />
          </PrivateRoute>
        ),
      },
      {
        path: "admin/exportaciones",
        element: (
          <PrivateRoute adminOnly={true}>
            <ExportCenterPage />
          </PrivateRoute>
        ),
      },
      {
        path: "admin/live/setup",
        element: (
          <PrivateRoute adminOnly={true}>
            <LiveStatsSetup />
          </PrivateRoute>
        ),
      },
      {
        path: "admin/live",
        element: (
          <PrivateRoute adminOnly={true}>
            <LiveStatsWithStaffPage />
          </PrivateRoute>
        ),
      },
      {
        path: "admin/live/review",
        element: (
          <PrivateRoute adminOnly={true}>
            <LiveReliabilityGuard>
              <LiveStatsReviewPage />
            </LiveReliabilityGuard>
          </PrivateRoute>
        ),
      },
    ],
  },
]);

function allowGalleryForAdminPlayerPhotos(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.type !== "file" || !input.hasAttribute("capture")) return;
  if (!input.closest(".admin-players")) return;
  input.removeAttribute("capture");
}

document.addEventListener("pointerdown", allowGalleryForAdminPlayerPhotos, true);
document.addEventListener("click", allowGalleryForAdminPlayerPhotos, true);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error) => console.error("Service worker registration failed:", error));
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <SeasonProvider>
        <RouterProvider router={router} />
      </SeasonProvider>
    </AuthProvider>
  </React.StrictMode>
);
