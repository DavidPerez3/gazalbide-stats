import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildLiveReviewSnapshot } from "./liveReview.js";
import "./liveReviewEntry.css";

function canOfferReview(snapshot) {
  if (!snapshot?.state) return false;
  if (snapshot.state.clockRunning) return false;
  if (Number(snapshot.state.period || 0) < 4) return false;
  if (Number(snapshot.state.clockMs || 0) > 0) return false;
  if (Number(snapshot.state.score?.gazalbide || 0) === Number(snapshot.state.score?.opponent || 0)) {
    return false;
  }
  return !snapshot.issues.some((issue) => issue.code === "period-not-closed");
}

export default function LiveReviewEntry() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(() => buildLiveReviewSnapshot());

  useEffect(() => {
    const refresh = () => setSnapshot(buildLiveReviewSnapshot());
    const interval = window.setInterval(refresh, 1500);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (!canOfferReview(snapshot)) return null;

  const errors = snapshot.blockingIssues.length;
  return (
    <aside className="live-review-entry">
      <button type="button" onClick={() => navigate("/admin/live/review")}>
        <strong>REVISAR FINAL</strong>
        <span>{errors > 0 ? `${errors} comprobación${errors === 1 ? "" : "es"} pendiente${errors === 1 ? "" : "s"}` : "Listo para revisión"}</span>
      </button>
    </aside>
  );
}
