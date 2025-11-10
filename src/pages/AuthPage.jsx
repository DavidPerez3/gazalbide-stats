import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, Link } from "react-router-dom";

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); // solo en registro
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();

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
                <div className="auth__password-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="auth__input"
                  />
                  <button
                    type="button"
                    className="auth__password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-pressed={showPassword}
                    aria-label={
                      showPassword
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                    title={
                      showPassword
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                  >
                    {showPassword ? (
                      // ojo cerrado
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                      >
                        <path
                          d="M3 3L21 21"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M10.58 10.58C10.214 11.0117 10.0033 11.5445 10 12.0977C9.99673 12.651 10.2023 13.1862 10.5622 13.6225C10.9221 14.0587 11.4149 14.3685 11.9662 14.5062C12.5175 14.6439 13.0969 14.6023 13.623 14.387"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M9.88 5.88C8.05996 6.464 6.38713 7.47866 5 8.84C3.9 9.9 3 11.1 2.5 12C3.1 13.1 4.1 14.5 5.5 15.7C6.7 16.7 8.2 17.6 9.88 18.12"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M14.12 5.88C15.94 6.464 17.6129 7.47866 19 8.84C20.1 9.9 21 11.1 21.5 12C20.9 13.1 19.9 14.5 18.5 15.7C17.3 16.7 15.8 17.6 14.12 18.12"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      // ojo abierto
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                      >
                        <path
                          d="M2.5 12C3 11.1 3.9 9.9 5 8.84C6.38713 7.47866 8.05996 6.464 9.88 5.88C10.8967 5.5472 11.9467 5.37778 13 5.37778C14.0533 5.37778 15.1033 5.5472 16.12 5.88C17.94 6.464 19.6129 7.47866 21 8.84C22.1 9.9 23 11.1 23.5 12C23 12.9 22.1 14.1 21 15.16C19.6129 16.5213 17.94 17.536 16.12 18.12C15.1033 18.4528 14.0533 18.6222 13 18.6222C11.9467 18.6222 10.8967 18.4528 9.88 18.12C8.05996 17.536 6.38713 16.5213 5 15.16C3.9 14.1 3 12.9 2.5 12Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          fill="none"
                        />
                        <circle
                          cx="13"
                          cy="12"
                          r="3"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          fill="none"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              {mode === "login" && (
                <div className="auth__forgot">
                  <Link to="/forgot-password" className="auth__forgot-link">
                    ¿Has olvidado la contraseña?
                  </Link>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} className="auth__button">
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
