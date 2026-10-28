import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function PrivateRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <p role="status">Comprobando acceso…</p>;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin =
    profile?.is_admin === true;

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
