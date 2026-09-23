import { useNavigate } from "react-router-dom";
import "../admin.css";

const modules = [
  {
    id: "players",
    icon: "👥",
    title: "Jugadores",
    description: "Gestionar la plantilla 2026-2027, dorsales y fotos de perfil.",
    status: "Operativo",
    available: true,
    path: "/admin/players",
    action: "Abrir jugadores",
  },
  {
    id: "fantasy",
    icon: "🎮",
    title: "Fantasy",
    description: "Mercado, precios, rasgos, jornadas, deadlines y economía Fantasy.",
    status: "Operativo",
    available: true,
    path: "/admin/fantasy",
    action: "Abrir Fantasy",
  },
  {
    id: "porra",
    icon: "🎯",
    title: "La Porra del Gazal",
    description: "Crear jornadas, preguntas, deadlines, resultados y clasificación de la Porra.",
    status: "Operativo",
    available: true,
    path: "/admin/porra",
    action: "Abrir Porra",
  },
  {
    id: "live",
    icon: "⚡",
    title: "Partidos y Live Stats",
    description: "Preparar, continuar, anotar, revisar y publicar partidos. También gestionar amistosos y Lives en curso.",
    status: "Operativo",
    available: true,
    path: "/admin/live/setup",
    action: "Gestionar partidos",
  },
  {
    id: "exports",
    icon: "📥",
    title: "Estadísticas y exportaciones",
    description: "Consultar los datos disponibles para descarga y exportar Excel de partidos, temporadas, histórico y quintetos/+/-.",
    status: "Operativo",
    available: true,
    path: "/admin/exportaciones",
    action: "Abrir exportaciones",
  },
];

export default function AdminCenter() {
  const navigate = useNavigate();

  return (
    <div className="admin-center">
      <div className="container">
        <header className="admin-center__hero">
          <p className="admin-center__eyebrow">Administración · Gazalbide Stats</p>
          <h1 className="admin-center__title">Centro de administración</h1>
          <p className="admin-center__subtitle">
            Cada herramienta vive en su propia página para que el panel siga limpio y sea cómodo también desde el móvil.
          </p>
        </header>

        <section className="admin-center__modules" aria-labelledby="admin-modules-title">
          <div className="admin-center__section-heading">
            <div>
              <h2 id="admin-modules-title">Módulos</h2>
              <p>Cada módulo aparece una sola vez. Las correcciones de partidos publicados se hacen desde Partidos y Live Stats.</p>
            </div>
          </div>

          <div className="admin-center__grid">
            {modules.map((module) => (
              <article
                key={module.id}
                className={`admin-module${module.available ? " admin-module--available" : " admin-module--pending"}`}
              >
                <div className="admin-module__top">
                  <span className="admin-module__icon" aria-hidden="true">{module.icon}</span>
                  <span className={`admin-module__status${module.available ? " admin-module__status--ready" : ""}`}>
                    {module.status}
                  </span>
                </div>

                <h3 className="admin-module__title">{module.title}</h3>
                <p className="admin-module__description">{module.description}</p>

                {module.available ? (
                  <button type="button" className="admin-module__action" onClick={() => navigate(module.path)}>
                    {module.action} <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <span className="admin-module__pending-copy">Sin controles activos todavía</span>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
