import { useState } from "react";
import "./password-input.css"; // crea este archivo

export default function PasswordInputPlain({ id="password", name="password", value, onChange, placeholder="Contraseña", showToggle=true }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="pw-wrap">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="pw-input"
        autoComplete="current-password"
      />
      {showToggle && (
        <button type="button" className="pw-toggle" onClick={() => setVisible(v => !v)} aria-label={visible ? "Ocultar" : "Mostrar"}>
          {visible ? "🙈" : "👁️"}
        </button>
      )}
    </div>
  );
}
