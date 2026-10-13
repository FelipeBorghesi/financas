import type { BudgetStatus, MonthSummary } from '@financas/core';
import { formatBRLWhole, formatPercent } from '../format';
import { Icon, type IconName } from './Icon';
import ui from './ui.module.css';
import styles from './VariablesVsBudget.module.css';

const STATUS: Record<BudgetStatus, { icon: IconName; label: string }> = {
  ok: { icon: 'check', label: 'dentro da meta' },
  atencao: { icon: 'alert', label: 'perto da meta' },
  estourou: { icon: 'close', label: 'passou da meta' },
};

export function VariablesVsBudget({ summary: s }: { summary: MonthSummary }) {
  const totalBudget = s.variables.reduce((a, v) => a + v.budgetCents, 0);
  const withSpending = s.variables
    .filter((v) => v.spentCents !== 0)
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.spentCents - a.spentCents);
  const idle = s.variables.filter((v) => v.spentCents === 0);

  return (
    <section className={ui.section}>
      <div className={ui.sectionHeader}>
        <h2 className={ui.sectionTitle}>Variáveis x meta</h2>
        <span className={`${ui.muted} num`}>
          <strong className={styles.total}>{formatBRLWhole(s.variaveisCents)}</strong> de{' '}
          {formatBRLWhole(totalBudget)}
        </span>
      </div>

      <ul className={styles.list}>
        {withSpending.map((v) => {
          const st = STATUS[v.status];
          const pct = v.ratio === null ? null : Math.max(0, v.ratio);
          const fill = pct === null ? 1 : Math.min(1, pct);
          return (
            <li key={v.category} className={styles.row}>
              <div className={styles.top}>
                <span className={styles.name}>{v.category}</span>
                <span
                  className={`${styles.badge} ${styles[v.status]}`}
                  title={st.label}
                  aria-label={`${pct === null ? 'sem meta' : formatPercent(pct)}, ${st.label}`}
                >
                  {v.status !== 'ok' && <Icon name={st.icon} size={11} />}
                  {pct === null ? 'sem meta' : formatPercent(pct)}
                </span>
                <span className={`${styles.amount} num`}>
                  {formatBRLWhole(v.spentCents)}
                  <span className={styles.of}> / {formatBRLWhole(v.budgetCents)}</span>
                </span>
              </div>
              <div className={styles.track} aria-hidden>
                <div
                  className={`${styles.fill} ${styles[`${v.status}Fill`]}`}
                  style={{ width: `${fill * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {idle.length > 0 && (
        <p className={styles.idle}>Sem gastos: {idle.map((v) => v.category).join(', ')}</p>
      )}
    </section>
  );
}
