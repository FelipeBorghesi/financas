import { normalizeKey, type AccountKind } from './merchant.js';

export interface DedupeCandidate {
  accountKind: AccountKind;
  date: string;
  amountCents: number;
  merchantKey: string;
}

/**
 * Procura, entre `candidates`, o lançamento que representa a mesma transação que `tx`
 * (vinda de outra origem, ex.: Pluggy × CSV).
 * Casa por tipo de conta + data + valor; se houver mais de um, desempata pela chave.
 */
export function findDuplicate<T extends DedupeCandidate>(
  tx: DedupeCandidate,
  candidates: readonly T[],
): T | undefined {
  const same = candidates.filter(
    (c) =>
      c.accountKind === tx.accountKind && c.date === tx.date && c.amountCents === tx.amountCents,
  );
  if (same.length <= 1) return same[0];
  const key = normalizeKey(tx.merchantKey);
  const byKey = same.filter((c) => normalizeKey(c.merchantKey) === key);
  if (byKey.length >= 1) return byKey[0];
  const partial = same.filter((c) => {
    const k = normalizeKey(c.merchantKey);
    return k.length > 0 && key.length > 0 && (k.includes(key) || key.includes(k));
  });
  return partial[0];
}
