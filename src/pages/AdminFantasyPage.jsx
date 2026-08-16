import { useNavigate } from "react-router-dom";
import AdminPage from "./AdminPage.jsx";
import FantasyPriceProposalPanel from "../components/FantasyPriceProposalPanel.jsx";
import "../admin.css";

export default function AdminFantasyPage() {
  const navigate = useNavigate();

  return (
    <div className="admin-fantasy-page">
      <header className="admin-subpage-header card card--p">
        <div>
          <p className="admin-center__eyebrow">Admin · Fantasy</p>
          <h1>Gestión Fantasy</h1>
          <p className="text-dim">
            Mercado, precios, rasgos, jornadas, deadlines, propuestas automáticas y economía de la temporada.
          </p>
        </div>
        <button type="button" className="admin-subpage-back" onClick={() => navigate("/admin")}>
          ← Volver a Admin
        </button>
      </header>

      <section className="admin-fantasy-page__proposal">
        <FantasyPriceProposalPanel />
      </section>

      <section className="admin-fantasy-page__settings">
        <AdminPage />
      </section>
    </div>
  );
}
