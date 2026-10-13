import { formatMonthLong, type MonthSummary } from '@financas/core';
import { formatBRL, formatBRLWhole, formatPercent } from '../format';
import { Icon } from './Icon';
import styles from './MonthHero.module.css';
import ui from './ui.module.css';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Props {
  month: string;
  options: string[];
  onChange: (month: string) => void;
  summary?: MonthSummary;
}

export function MonthHero({ month, options, onChange, summary: s }: Props) {
  const idx = options.indexOf(month);

  return (
    <section className={styles.hero}>
      <div className={styles.monthRow}>
        <button
          className={ui.iconButton}
          onClick={() => onChange(options[idx - 1] ?? month)}
          disabled={idx <= 0}
          aria-label="Mês anterior"
        >
          <Icon name="left" />
        </button>
        <label className={styles.monthPicker}>
          <span>{capitalize(formatMonthLong(month))}</span>
          <select value={month} onChange={(e) => onChange(e.target.value)} aria-label="Mês">
            {options.map((m) => (
              <option key={m} value={m}>
                {capitalize(formatMonthLong(m))}
              </option>
            ))}
          </select>
        </label>
        <button
          className={ui.iconButton}
          onClick={() => onChange(options[idx + 1] ?? month)}
          disabled={idx >= options.length - 1}
          aria-label="Próximo mês"
        >
          <Icon name="right" />
        </button>
        {s?.partial && <span className={styles.tag}>em andamento</span>}
      </div>

      {s && (
        <>
          <div className={styles.heroGrid}>
            <div>
              <div className={styles.sobraLabel}>Sobra do mês</div>
              <div className={`${styles.sobra} ${s.sobraCents < 0 ? styles.negative : ''}`}>
                {formatBRL(s.sobraCents)}
              </div>
            </div>

            <dl className={styles.stats}>
              <div>
                <dt>Entradas</dt>
                <dd className="num">{formatBRL(s.entradasCents)}</dd>
              </div>
              <div>
                <dt>Gastos</dt>
                <dd className="num">{formatBRL(s.gastosCents)}</dd>
              </div>
              <div>
                <dt>Investido</dt>
                <dd className="num">{formatBRL(s.investidoCents)}</dd>
                {s.investmentGoalCents > 0 && (
                  <small>
                    {s.investidoCents >= s.investmentGoalCents ? (
                      <>
                        <Icon name="check" size={12} /> meta {formatBRLWhole(s.investmentGoalCents)}
                      </>
                    ) : (
                      `faltam ${formatBRLWhole(s.investmentGoalCents - s.investidoCents)}`
                    )}
                  </small>
                )}
              </div>
            </dl>
          </div>

          <MoneyFlow summary={s} />
        </>
      )}
    </section>
  );
}

/** Para onde foram as entradas: fixos · variáveis · investido · sobra. */
function MoneyFlow({ summary: s }: { summary: MonthSummary }) {
  const parts = [
    { label: 'Fixos', cents: s.fixosCents, color: 'var(--series-fixos)' },
    { label: 'Variáveis', cents: s.variaveisCents, color: 'var(--series-variaveis)' },
    { label: 'Investido', cents: s.investidoCents, color: 'var(--series-investido)' },
  ].filter((p) => p.cents > 0);
  const used = parts.reduce((a, p) => a + p.cents, 0);
  const rest = s.entradasCents - used;
  const base = Math.max(s.entradasCents, used);
  if (base <= 0) return null;

  const segments =
    rest > 0 ? [...parts, { label: 'Sobra', cents: rest, color: 'var(--surface-3)' }] : parts;

  return (
    <div className={styles.flow}>
      <div className={styles.flowBar} role="img" aria-label="Divisão das entradas do mês">
        {segments.map((p) => (
          <div
            key={p.label}
            className={styles.flowSegment}
            style={{ flexGrow: p.cents / base, background: p.color }}
            title={`${p.label}: ${formatBRL(p.cents)}`}
          />
        ))}
      </div>
      <ul className={styles.flowLegend}>
        {segments.map((p) => (
          <li key={p.label}>
            <span className={styles.dot} style={{ background: p.color }} aria-hidden />
            <span className={styles.flowLabel}>{p.label}</span>
            <span className="num">{formatBRLWhole(p.cents)}</span>
            {s.entradasCents > 0 && (
              <span className={styles.flowPct}>{formatPercent(p.cents / s.entradasCents)}</span>
            )}
          </li>
        ))}
      </ul>
      {rest < 0 && (
        <p className={styles.over}>
          <Icon name="alert" size={14} /> Saiu {formatBRL(-rest)} a mais do que entrou.
        </p>
      )}
    </div>
  );
}
