export const TIME_ZONE = 'America/Sao_Paulo';

/** "01/08/2026" → "2026-08-01" */
export function parseBrDate(raw: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!m) throw new Error(`Data inválida: "${raw}"`);
  return assertIsoDate(`${m[3]}-${m[2]}-${m[1]}`);
}

/** Valida "2026-08-01". */
export function assertIsoDate(raw: string): string {
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Data inválida: "${raw}"`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new Error(`Data inválida: "${raw}"`);
  }
  return s;
}

/** "2026-08-01" → "2026-08" */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Data (aaaa-mm-dd) de um instante no fuso de São Paulo. */
export function dateInSaoPaulo(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Mês (aaaa-mm) atual em São Paulo. */
export function currentMonth(now: Date = new Date()): string {
  return monthOf(dateInSaoPaulo(now));
}

/** "2026-08" → "agosto de 2026" */
export function formatMonthLong(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 15));
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** "2026-08" → "ago/26" */
export function formatMonthShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 15));
  const name = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(d)
    .replace('.', '');
  return `${name}/${String(y).slice(2)}`;
}

/** "2026-08-01" → "01/08" */
export function formatDayMonth(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}
