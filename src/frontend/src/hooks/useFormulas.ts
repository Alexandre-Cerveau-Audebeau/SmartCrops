import { useCallback, useEffect, useState } from 'react';
import { fetchFormulas } from '../services/formulasApi';
import type { FormulaCapabilities, FormulasCatalog } from '../types/Dashboard';

/**
 * SMA-448, lot F3 — the catalogue of the formulas and the account against
 * it (`GET /api/formulas`), read once at mount and again on `reload`. What
 * the choice screen draws its three offers from, and what the planner bounds
 * its grid by — the served formula, never a table of this client's (R8).
 *
 * Modelled on `useDashboardPreferences`' load: an AbortController per
 * request, every state write inside the promise chain (never synchronously
 * in an effect body), and a failed read leaves `catalog` null with
 * `loadError` raised — the screen shows its error and its retry, the planner
 * keeps its bounds of before and leaves the refusal to the server.
 */
export function useFormulas() {
  const [catalog, setCatalog] = useState<FormulasCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchFormulas(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setCatalog(next);
        setLoadError(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCatalog(null);
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [epoch]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setEpoch((value) => value + 1);
  }, []);

  return { catalog, loading, loadError, reload };
}

/** The account's own formula in the catalogue — the one its rights are read from; null while the catalogue is not read. */
export function ownFormula(catalog: FormulasCatalog | null): FormulaCapabilities | null {
  if (!catalog) return null;
  return catalog.formulas.find((formula) => formula.key === catalog.account.formula) ?? null;
}
