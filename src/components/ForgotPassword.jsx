// src/pages/ForgotPassword.jsx
import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      // Aquí el cambio importante 👇
      const redirectTo = new URL(window.location.href);
      redirectTo.hash = "";         // limpia el hash
      redirectTo.search = "";       // limpia query
      redirectTo.pathname = "/gazalbide-stats/"; // fuerza subpath correcto
          
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo.toString(),
        },
      });

      setLoading(false);

      if (error) {
        setStatus({ type: "error", text: error.message });
        return;
      }

      setStatus({
        type: "success",
        text:
          "Te hemos enviado un correo con un enlace mágico para entrar. Revisa tu bandeja y la carpeta de spam.",
      });
    } catch (err) {
      setLoading(false);
      setStatus({ type: "error", text: "Error inesperado. Inténtalo más tarde." });
    }
  }

  return (
    <div className="auth">
      <div className="container">
        <div className="auth__card">
          <h1 className="auth__title">Entrar con enlace al correo</h1>

          <form onSubmit={handleSubmit} className="auth__form">
            <label className="auth__label">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth__input"
                placeholder="tu@correo.com"
              />
            </label>

            <button type="submit" className="auth__button" disabled={loading}>
              {loading ? "Enviando..." : "Enviar enlace mágico"}
            </button>
          </form>

          {status && (
            <p
              className={
                status.type === "success"
                  ? "auth__message auth__message--success"
                  : "auth__message auth__message--error"
              }
            >
              {status.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
