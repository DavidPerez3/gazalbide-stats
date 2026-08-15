import { useNavigate } from "react-router-dom";
import AdminPage from "./AdminPage.jsx";
import FantasyPriceProposalPanel from "../components/FantasyPriceProposalPanel.jsx";
import "../admin.css";

const modules = [
  {
    id: "matches",
    icon: "🏀",
    title: "Partidos",
    description: "Crear, revisar y publicar partidos de Gazalbide.",
    status: "Próximamente",
  },
  {
    id: "players",
    icon: "👥",
    title: "Jugadores",
    description: "Gestionar la plantilla 2026-2027, dorsales y fotos de perfil.",
    status: "Operativo",
    available: true,
  },
  {
    id: "stats",
    icon: "📊",
    title: "Estadísticas",
    description: "Revisar y administrar las estadísticas de cada partido.",
    status: "Próximamente",
  },
  {
    id: "fantasy",
    icon: "🎮",
    title: "Fantasy",
    description: "Gestionar jornadas, deadlines y alineaciones Fantasy.",
    status: "Operativo",
    available: true,
  },
  {
    id: "live",
    icon: "⚡",
    title: "Live Stats",
    description: "Preparar convocatoria y registrar el partido en horizontal con almacenamiento local.",
    status: "Prueba local",
    available: true,
  },
];

export default function AdminCenter() {
  const navigate = useNavigate();

  const openModule = (module) => {
    if (module.id === "players") {
      navigate("/admin/players");
      return;
    }
    if (module.id === "live") {
      navigate("/admin/live/setup");
      return;
    }
    if (module.id === "fantasy") {
      document.getElementById("admin-fantasy")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <div className="admin-center">
      <div className="container">
        <header className="admin-center__hero">
          <p className="admin-center__eyebrow">Administración · Gazalbide Stats</p>
          <h1 className="admin-center__title">Centro de administración</h1>
          <p className="admin-center__subtitle">
            Todas las herramientas de gestión de Gazalbide se irán centralizando aquí.
          </p>
        </header>

        <section className="admin-center__modules" aria-labelledby="admin-modules-title">
          <div className="admin-center__section-heading">
            <div>
              <h2 id="admin-modules-title">Módulos</h2>
              <p>Plantilla, Fantasy y Live Stats ya tienen módulos propios dentro del rol admin.</p>
            </div>
          </div>

          <div className="admin-center__grid">
            {modules.map((module) => (
              <article
                key={module.id}
                className={`admin-module${module.available ? " admin-module--available" : ""}`}
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
                  <button type="button" className="admin-module__action" onClick={() => openModule(module)}>
                    Abrir {module.id === "live" ? "Live Stats" : "gestión"} <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <span className="admin-module__pending">Aún no disponible</span>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>

      <section id="admin-fantasy" className="admin-center__fantasy" aria-label="Gestión Fantasy">
        <div className="admin">
          <div className="container">
            <FantasyPriceProposalPanel />
          </div>
        </div>
        <AdminPage />
      </section>
    </div>
  );
}
