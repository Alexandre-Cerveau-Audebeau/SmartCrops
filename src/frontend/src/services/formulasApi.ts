import {
  isDashboardLevel,
  type DashboardLevel,
  type FormulaAccount,
  type FormulaAvailability,
  type FormulasCatalog,
} from '../types/Dashboard';
import { isRefusalReason, normalizeCapabilities } from './formulaWire';
import { fetchJson } from './fetchJson';
import { arrayOf, isBoolean, isNullableString, isRecord, isWholeNumber, matches, nullable } from './wireChecks';

const API_BASE = '/api';

// FormulasController sits behind [Authorize] — `credentials: 'include'` so the
// HttpOnly auth cookie flows (SMA-280 policy: every call site states it).

const isLevel = (value: unknown): value is DashboardLevel =>
  typeof value === 'string' && isDashboardLevel(value);

const isSize = matches<{ width: number; height: number }>({
  width: isWholeNumber,
  height: isWholeNumber,
});

const isAvailability = matches<FormulaAvailability>({
  formula: isLevel,
  current: isBoolean,
  available: isBoolean,
  reasons: arrayOf(isRefusalReason),
});

const isAccount = matches<FormulaAccount>({
  formula: isLevel,
  chosen: isBoolean,
  chosenAt: isNullableString,
  gardenCount: isWholeNumber,
  largestGardenSize: nullable(isSize),
  availability: arrayOf(isAvailability),
});

/**
 * SMA-448, lot F3 — the catalogue as the API serves it, checked at this
 * boundary as every record is: each of the three formulas through the same
 * `normalizeCapabilities` the layout's capabilities go through, then the
 * account — its formula one of the catalogue's, its availability naming
 * every formula of the catalogue once, each reason of the two kinds the
 * server serves. A catalogue that does not hold together is refused WHOLE:
 * the choice screen shows its error and its retry rather than three offers
 * it cannot vouch for, and the planner falls back on the server's own
 * refusal (R8: the right is checked there whatever the client draws).
 */
export function normalizeCatalog(raw: unknown): FormulasCatalog {
  if (!isRecord(raw) || !Array.isArray(raw.formulas)) {
    throw new Error('Malformed formulas catalogue: no formulas.');
  }
  const formulas = raw.formulas.map(normalizeCapabilities);
  const known = formulas.map((formula) => formula.key);
  if (new Set(known).size !== known.length) {
    throw new Error('Malformed formulas catalogue: a formula served twice.');
  }

  const account = raw.account;
  if (!isAccount(account)) {
    throw new Error('Malformed formulas catalogue: the account does not match the expected shape.');
  }
  if (!known.includes(account.formula)) {
    throw new Error('Malformed formulas catalogue: the account is on a formula the catalogue does not serve.');
  }
  const named = account.availability.map((entry) => entry.formula);
  if (named.length !== known.length || known.some((key) => !named.includes(key))) {
    throw new Error('Malformed formulas catalogue: the availability does not name every formula once.');
  }

  return { formulas, account };
}

/** `GET /api/formulas` — the three formulas and the caller against them, normalized. */
export async function fetchFormulas(signal?: AbortSignal): Promise<FormulasCatalog> {
  const raw = await fetchJson<unknown>(`${API_BASE}/formulas`, { credentials: 'include', signal });
  return normalizeCatalog(raw);
}
