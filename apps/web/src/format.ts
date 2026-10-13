import { formatBRL } from '@financas/core';

export { formatBRL };

const brlWhole = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** Sem centavos, para listas e legendas: "R$ 557" */
export function formatBRLWhole(cents: number): string {
  return brlWhole.format(Math.round(cents / 100));
}

const compact = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Eixo dos gráficos: "R$ 5 mil" */
export function formatBRLCompact(cents: number): string {
  return `R$ ${compact.format(cents / 100)}`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
