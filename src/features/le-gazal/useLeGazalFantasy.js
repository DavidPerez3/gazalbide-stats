import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { supabase } from "../../lib/supabaseClient.js";
import { CURRENT_SEASON_ID } from "../../lib/seasons.js";
import { createDisplayGrid, spinSlot } from "./slotEngine";
import { SLOT_COLUMNS } from "./slotTypes";

function getReducedMotionPreference() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function replaceColumn(previousGrid, nextGrid, columnIndex) {
  return previousGrid.map((row, rowIndex) =>
    row.map((cell, colIndex) =>
      colIndex === columnIndex ? nextGrid[rowIndex][columnIndex] : cell
    )
  );
}

function mergeSpinFrame(previousGrid, nextGrid, stoppedColumns) {
  const randomFrame = createDisplayGrid();
  return previousGrid.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (stoppedColumns[colIndex]) {
        return nextGrid[rowIndex][colIndex];
      }
      return randomFrame[rowIndex][colIndex] || cell;
    })
  );
}

function resultMessage(result) {
  if (!result) {
    return "El resultado y el saldo los calcula Gazalbide en el servidor.";
  }
  if (result.scenario === "scatter") {
    return `CLUTCH TIME: ${result.free_spins_awarded} tiradas gratis. Saldo ${result.balance} 🍺.`;
  }
  if (result.scenario === "bonus") {
    return `CLUTCH TIME+: ${result.free_spins_awarded} tiradas gratis. Saldo ${result.balance} 🍺.`;
  }
  if (Number(result.payout || 0) > 0) {
    return `Premio de ${result.payout} 🍺. Saldo actual: ${result.balance} 🍺.`;
  }
  return `Sin premio. Saldo actual: ${result.balance} 🍺.`;
}

export function useLeGazalFantasy() {
  const { user } = useAuth();
  const timeoutRefs = useRef([]);
  const intervalRef = useRef(null);
  const stoppedColumnsRef = useRef(Array(SLOT_COLUMNS).fill(true));

  const [teamId, setTeamId] = useState(null);
  const [gameweek, setGameweek] = useState(null);
  const [offer, setOffer] = useState(null);
  const [session, setSession] = useState(null);
  const [cashoutSummary, setCashoutSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const [bet, setBet] = useState(3);
  const [grid, setGrid] = useState(() => createDisplayGrid());
  const [isSpinning, setIsSpinning] = useState(false);
  const [stoppedColumns, setStoppedColumns] = useState(() =>
    Array(SLOT_COLUMNS).fill(true)
  );
  const [result, setResult] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    getReducedMotionPreference
  );
  const [bonusIntro, setBonusIntro] = useState(null);
  const [bonusSummary, setBonusSummary] = useState(null);
  const [coinBurstKey, setCoinBurstKey] = useState(0);

  const clearTimers = useCallback(() => {
    for (const timeoutId of timeoutRefs.current) {
      window.clearTimeout(timeoutId);
    }
    timeoutRefs.current = [];

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const loadState = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: team, error: teamError } = await supabase
        .from("fantasy_teams")
        .select("id")
        .eq("user_id", user.id)
        .eq("season_id", CURRENT_SEASON_ID)
        .maybeSingle();

      if (teamError) throw teamError;
      if (!team) {
        setTeamId(null);
        setGameweek(null);
        setOffer(null);
        setSession(null);
        return;
      }

      setTeamId(team.id);

      const { data: activeSession, error: activeSessionError } = await supabase
        .from("le_gazal_sessions")
        .select("*")
        .eq("fantasy_team_id", team.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSessionError) throw activeSessionError;

      if (activeSession) {
        const { data: activeGameweek, error: gameweekError } = await supabase
          .from("gameweeks")
          .select("id, name, date, deadline, season_id")
          .eq("id", activeSession.gameweek_id)
          .single();

        if (gameweekError) throw gameweekError;
        setSession(activeSession);
        setGameweek(activeGameweek);
        setOffer(null);
        return;
      }

      const { data: latestGameweek, error: latestGameweekError } = await supabase
        .from("gameweeks")
        .select("id, name, date, deadline, season_id")
        .eq("season_id", CURRENT_SEASON_ID)
        .order("date", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestGameweekError) throw latestGameweekError;
      if (!latestGameweek) {
        setGameweek(null);
        setOffer(null);
        setSession(null);
        return;
      }

      setGameweek(latestGameweek);

      const { data: existingSession, error: existingSessionError } = await supabase
        .from("le_gazal_sessions")
        .select("*")
        .eq("fantasy_team_id", team.id)
        .eq("gameweek_id", latestGameweek.id)
        .maybeSingle();

      if (existingSessionError) throw existingSessionError;
      if (existingSession) {
        setSession(existingSession);
        setOffer(null);
        return;
      }

      const { data: economy, error: economyError } = await supabase
        .from("fantasy_gameweek_economy")
        .select(
          "gameweek_id, carry_out, valid_lineup, finalized_at, savings_generated"
        )
        .eq("fantasy_team_id", team.id)
        .eq("gameweek_id", latestGameweek.id)
        .maybeSingle();

      if (economyError) throw economyError;

      const deadlinePassed =
        latestGameweek.deadline &&
        new Date(latestGameweek.deadline).getTime() <= Date.now();

      if (
        economy?.valid_lineup === true &&
        economy?.finalized_at &&
        Number(economy?.carry_out || 0) > 0 &&
        deadlinePassed
      ) {
        setOffer({
          gameweekId: latestGameweek.id,
          gameweekName: latestGameweek.name || `Jornada ${latestGameweek.id}`,
          available: Number(economy.carry_out || 0),
          rawSavings: Number(economy.savings_generated || 0),
        });
      } else {
        setOffer(null);
      }

      setSession(null);
    } catch (err) {
      console.error("Error cargando Le Gazal Fantasy:", err);
      setError(err.message || "No se pudo cargar Le Gazal");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const startSession = useCallback(
    async (amount) => {
      if (!offer || actionLoading) return null;
      const allocation = Number(amount);
      if (!Number.isInteger(allocation) || allocation <= 0 || allocation > offer.available) {
        setError("Elige una cantidad válida de cervezas sobrantes.");
        return null;
      }

      setActionLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(
          "open_le_gazal_session",
          {
            p_gameweek_id: offer.gameweekId,
            p_amount: allocation,
          }
        );
        if (rpcError) throw rpcError;
        setSession(data);
        setOffer(null);
        setCashoutSummary(null);
        setResult(null);
        return data;
      } catch (err) {
        console.error("Error abriendo Le Gazal:", err);
        setError(err.message || "No se pudo abrir Le Gazal");
        return null;
      } finally {
        setActionLoading(false);
      }
    },
    [offer, actionLoading]
  );

  const finishAnimation = useCallback(
    (spinOutcome, serverResult, previousSession) => {
      clearTimers();
      setGrid(spinOutcome.grid);
      setStoppedColumns(Array(SLOT_COLUMNS).fill(true));
      stoppedColumnsRef.current = Array(SLOT_COLUMNS).fill(true);
      setResult(serverResult);
      setIsSpinning(false);

      if (Number(serverResult.payout || 0) > 0) {
        setCoinBurstKey((previous) => previous + 1);
      }

      if (Number(serverResult.free_spins_awarded || 0) > 0) {
        const isBonus = serverResult.scenario === "bonus";
        setBonusIntro({
          title: isBonus ? "CLUTCH TIME+" : "CLUTCH TIME",
          description: `${serverResult.free_spins_awarded} tiradas gratis con multiplicador x${serverResult.bonus_multiplier}.`,
          freeSpins: Number(serverResult.free_spins_awarded),
          multiplier: Number(serverResult.bonus_multiplier),
        });
      }

      if (
        Number(previousSession?.free_spins_remaining || 0) > 0 &&
        Number(serverResult.free_spins_remaining || 0) === 0 &&
        Number(serverResult.free_spins_awarded || 0) === 0
      ) {
        setBonusSummary({
          title: "Fin del CLUTCH TIME",
          totalWon:
            Number(previousSession?.total_payout || 0) +
            Number(serverResult.payout || 0),
          spins: Number(previousSession?.total_spins || 0) + 1,
          multiplier: Number(previousSession?.bonus_multiplier || 1),
        });
      }
    },
    [clearTimers]
  );

  const spin = useCallback(async () => {
    if (!session || session.status !== "active" || isSpinning || actionLoading) {
      return;
    }

    const hasFreeSpin = Number(session.free_spins_remaining || 0) > 0;
    if (!hasFreeSpin && Number(bet) > Number(session.balance || 0)) {
      setError("No tienes saldo suficiente para esa apuesta.");
      return;
    }

    setError(null);
    setResult(null);
    setBonusIntro(null);
    setBonusSummary(null);
    setIsSpinning(true);
    clearTimers();

    const previousSession = session;

    try {
      const { data: serverResult, error: rpcError } = await supabase.rpc(
        "le_gazal_spin",
        {
          p_session_id: session.id,
          p_bet: Number(bet),
        }
      );
      if (rpcError) throw rpcError;

      const visualOutcome = spinSlot({
        bet: Number(serverResult.bet),
        roundMultiplier: Number(serverResult.round_multiplier || 1),
        forcedOutcome: serverResult.scenario,
      });

      const spinOutcome = {
        ...visualOutcome,
        amountWon: Number(serverResult.payout || 0),
      };

      setSession((previous) => ({
        ...previous,
        balance: Number(serverResult.balance || 0),
        free_spins_remaining: Number(serverResult.free_spins_remaining || 0),
        free_spin_bet:
          Number(serverResult.free_spins_remaining || 0) > 0
            ? Number(serverResult.bet)
            : null,
        bonus_multiplier: Number(serverResult.bonus_multiplier || 1),
        total_spins: Number(previous?.total_spins || 0) + 1,
        total_bet:
          Number(previous?.total_bet || 0) + Number(serverResult.bet_spent || 0),
        total_payout:
          Number(previous?.total_payout || 0) + Number(serverResult.payout || 0),
      }));

      stoppedColumnsRef.current = Array(SLOT_COLUMNS).fill(false);
      setStoppedColumns(Array(SLOT_COLUMNS).fill(false));

      if (!prefersReducedMotion) {
        intervalRef.current = window.setInterval(() => {
          setGrid((previous) =>
            mergeSpinFrame(previous, spinOutcome.grid, stoppedColumnsRef.current)
          );
        }, 68);
      }

      const baseDelay = prefersReducedMotion ? 0 : 360;
      const stepDelay = prefersReducedMotion ? 36 : 190;

      for (let columnIndex = 0; columnIndex < SLOT_COLUMNS; columnIndex += 1) {
        const timeoutId = window.setTimeout(() => {
          stoppedColumnsRef.current[columnIndex] = true;
          setStoppedColumns((previous) => {
            const next = [...previous];
            next[columnIndex] = true;
            return next;
          });
          setGrid((previous) =>
            replaceColumn(previous, spinOutcome.grid, columnIndex)
          );
        }, baseDelay + columnIndex * stepDelay);
        timeoutRefs.current.push(timeoutId);
      }

      const finishDelay =
        baseDelay +
        SLOT_COLUMNS * stepDelay +
        (prefersReducedMotion ? 20 : 260);

      const finishTimeoutId = window.setTimeout(() => {
        finishAnimation(spinOutcome, serverResult, previousSession);
      }, finishDelay);
      timeoutRefs.current.push(finishTimeoutId);
    } catch (err) {
      console.error("Error ejecutando tirada Le Gazal:", err);
      clearTimers();
      setStoppedColumns(Array(SLOT_COLUMNS).fill(true));
      stoppedColumnsRef.current = Array(SLOT_COLUMNS).fill(true);
      setIsSpinning(false);
      setError(err.message || "No se pudo completar la tirada");
      await loadState();
    }
  }, [
    session,
    isSpinning,
    actionLoading,
    bet,
    clearTimers,
    prefersReducedMotion,
    finishAnimation,
    loadState,
  ]);

  const cashout = useCallback(async () => {
    if (!session || session.status !== "active" || isSpinning || actionLoading) {
      return null;
    }

    setActionLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "cashout_le_gazal_session",
        { p_session_id: session.id }
      );
      if (rpcError) throw rpcError;

      setCashoutSummary(data);
      setSession((previous) => ({
        ...previous,
        status: "cashed_out",
        free_spins_remaining: 0,
        free_spin_bet: null,
        bonus_multiplier: 1,
        cashout_amount: Number(data?.transferred || 0),
      }));
      return data;
    } catch (err) {
      console.error("Error retirando saldo Le Gazal:", err);
      setError(err.message || "No se pudo guardar el saldo");
      return null;
    } finally {
      setActionLoading(false);
    }
  }, [session, isSpinning, actionLoading]);

  const bonusState = useMemo(
    () => ({
      remaining: Number(session?.free_spins_remaining || 0),
      multiplier: Number(session?.bonus_multiplier || 1),
      totalWon: Number(session?.total_payout || 0),
    }),
    [session]
  );

  const sessionStats = useMemo(() => {
    const totalBet = Number(session?.total_bet || 0);
    const totalWon = Number(session?.total_payout || 0);
    return {
      spins: Number(session?.total_spins || 0),
      totalBet,
      totalWon,
      net: totalWon - totalBet,
      bestWin: Number(result?.payout || 0),
      lastResult: resultMessage(result),
    };
  }, [session, result]);

  return {
    teamId,
    gameweek,
    offer,
    session,
    cashoutSummary,
    loading,
    actionLoading,
    error,
    bet,
    setBet,
    grid,
    isSpinning,
    stoppedColumns,
    result,
    resultMessage: resultMessage(result),
    rulesOpen,
    openRules: () => setRulesOpen(true),
    closeRules: () => setRulesOpen(false),
    prefersReducedMotion,
    bonusIntro,
    closeBonusIntro: () => setBonusIntro(null),
    bonusSummary,
    closeBonusSummary: () => setBonusSummary(null),
    coinBurstKey,
    bonusState,
    sessionStats,
    startSession,
    spin,
    cashout,
    reload: loadState,
  };
}
