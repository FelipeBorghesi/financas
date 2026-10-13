import type { Category, MonthSummary } from '@financas/core';
import { formatBRL } from '../format';
import styles from './FixedExpenses.module.css';
import ui from './ui.module.css';

export function FixedExpenses({ summary: s }: { summary: MonthSummary }) {
  const byCategory = new Map<Category, MonthSummary['fixed']>();
  for (const g of s.fixed) byCategory.set(g.category, [...(byCategory.get(g.category) ?? []), g]);

  return (
    <section className={ui.section}>
      <div className={ui.sectionHeader}>
        <h2 className={ui.sectionTitle}>Gastos fixos</h2>
        <strong className="num">{formatBRL(s.fixosCents)}</strong>
      </div>
      {s.fixed.length === 0 ? (
        <p className={ui.muted}>Nenhum gasto fixo neste mês.</p>
      ) : (
        <ul className={styles.list}>
          {[...byCategory.entries()].map(([category, groups]) => (
            <li key={category} className={styles.group}>
              <div className={styles.head}>
                <span>{category}</span>
                <span className="num">
                  {formatBRL(groups.reduce((a, g) => a + g.totalCents, 0))}
                </span>
              </div>
              <ul className={styles.items}>
                {groups.map((g) => (
                  <li key={g.merchantKey}>
                    <span className={styles.merchant} title={g.merchantKey}>
                      {g.merchantKey}
                      {g.count > 1 && <span className={styles.count}> {g.count}×</span>}
                    </span>
                    <span className="num">{formatBRL(g.totalCents)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
