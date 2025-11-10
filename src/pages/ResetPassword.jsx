// ResetPassword.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Escuchamos eventos de auth
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          // El usuario ya llegó via link de recuperación y está "logueado" temporalmente
          // Ahora pedimos la nueva contraseña y actualizarla con updateUser
          // (Si prefieres, puedes mostrar el formulario y que el usuario pulse un botón para confirmar)
          // Aquí no hacemos nada automático; esperamos a que el usuario escriba la contraseña y envíe.
        }
      }
    );

    return () => {
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);

    if (newPassword.length < 6) {
      setStatus({ type: "error", text: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }

    setStatus({ type: "loading", text: "Actualizando contraseña..." });

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setStatus({ type: "error", text: error.message });
      return;
    }

    setStatus({ type: "success", text: "Contraseña actualizada. Ya puedes iniciar sesión." });

    // opcional: redirigir al login después de un rato
    setTimeout(() => navigate("/login"), 1500);
  }

  return (
    <div className="reset-password-card">
      <h2>Establecer nueva contraseña</h2>

      <form onSubmit={handleSubmit} className="auth__form">
        <label className="auth__label">
          Nueva contraseña
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="auth__input"
          />
        </label>

        <button type="submit" className="auth__button">
          Cambiar contraseña
        </button>
      </form>

      {status && (
        <p
          className={
            status.type === "success"
              ? "auth__message auth__message--success"
              : status.type === "error"
              ? "auth__message auth__message--error"
              : "auth__message"
          }
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
