import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); // solo en registro
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();

  // Si ya estás logueado, te mando al home
  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  async function handleLogin(e) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    navigate("/");
  }

  async function handleRegister(e) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setInfoMsg(
      "Te hemos enviado un correo para confirmar tu cuenta. Revisa tu bandeja de entrada."
    );
  }

  return (
    <div className="auth">
      <div className="container">
        <div className="auth__card">
          <h1 className="auth__title">
            {mode === "login" ? "Iniciar sesión" : "Registrarse"}
          </h1>

          <div className="auth__tabs">
            <button
              type="button"
              className={
                "auth__tab " + (mode === "login" ? "auth__tab--active" : "")
              }
              onClick={() => setMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={
                "auth__tab " +
                (mode === "register" ? "auth__tab--active" : "")
              }
              onClick={() => setMode("register")}
            >
              Registro
            </button>
          </div>

          <form
            className="auth__form"
            onSubmit={mode === "login" ? handleLogin : handleRegister}
          >
            <div className="auth__field">
              <label className="auth__label">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth__input"
                />
              </label>
            </div>

            {mode === "register" && (
              <div className="auth__field">
                <label className="auth__label">
                  Nombre de usuario
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="auth__input"
                  />
                </label>
              </div>
            )}

            <div className="auth__field">
              <label className="auth__label">
                Contraseña
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth__input"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth__button"
            >
              {loading
                ? "Cargando..."
                : mode === "login"
                ? "Entrar"
                : "Registrarse"}
            </button>
          </form>

          {errorMsg && (
            <p className="auth__message auth__message--error">{errorMsg}</p>
          )}
          {infoMsg && (
            <p className="auth__message auth__message--success">{infoMsg}</p>
          )}
        </div>
      </div>
    </div>
  );
}
