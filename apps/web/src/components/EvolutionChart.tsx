import { formatMonthLong, formatMonthShort, type EvolutionPoint } from '@financas/core';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type XAxisTickContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatBRL, formatBRLCompact } from '../format';
import styles from './EvolutionChart.module.css';
import ui from './ui.module.css';

const SERIES = [
  { key: 'entradasCents', label: 'Entradas', color: 'var(--series-entradas)' },
  { key: 'gastosCents', label: 'Gastos', color: 'var(--series-gastos)' },
] as const;

interface Props {
  points: EvolutionPoint[];
  selected: string;
  onSelect: (month: string) => void;
}

export function EvolutionChart({ points, selected, onSelect }: Props) {
  const [showTable, setShowTable] = useState(false);
  const data = points.slice(-12);

  return (
    <section className={ui.section}>
      <div className={ui.sectionHeader}>
        <h2 className={ui.sectionTitle}>Evolução</h2>
        <button className={`${ui.button} ${ui.small}`} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      <div className={styles.legend}>
        {SERIES.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      {data.length === 0 ? (
        <div className={ui.hint}>Sem dados ainda.</div>
      ) : showTable ? (
        <table className={ui.table}>
          <thead>
            <tr>
              <th>Mês</th>
              <th className={ui.right}>Entradas</th>
              <th className={ui.right}>Gastos</th>
              <th className={ui.right}>Sobra</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.month} className={p.month === selected ? styles.selectedRow : undefined}>
                <td>{formatMonthShort(p.month)}</td>
                <td className={`${ui.right} num`}>{formatBRL(p.entradasCents)}</td>
                <td className={`${ui.right} num`}>{formatBRL(p.gastosCents)}</td>
                <td className={`${ui.right} num`}>{formatBRL(p.entradasCents - p.gastosCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.chart}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              barGap={2}
              barCategoryGap="25%"
              margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={{ stroke: 'var(--axis)' }}
                tick={(props: XAxisTickContentProps) => (
                  <text
                    x={props.x}
                    y={Number(props.y) + 12}
                    textAnchor="middle"
                    fontSize={12}
                    fill={props.payload.value === selected ? 'var(--ink)' : 'var(--muted)'}
                    fontWeight={props.payload.value === selected ? 700 : 400}
                  >
                    {formatMonthShort(String(props.payload.value))}
                  </text>
                )}
                interval="preserveStartEnd"
              />
              <YAxis
                width={64}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: 'var(--muted)' }}
                tickFormatter={(v: number) => formatBRLCompact(v)}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                content={(props) => <ChartTooltip {...props} />}
              />
              {SERIES.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  cursor="pointer"
                  onClick={(entry: { payload?: EvolutionPoint }) => {
                    if (entry.payload) onSelect(entry.payload.month);
                  }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as EvolutionPoint | undefined;
  if (!p) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{formatMonthLong(String(label))}</div>
      {SERIES.map((s) => (
        <div key={s.key} className={styles.tooltipRow}>
          <span className={styles.swatch} style={{ background: s.color }} aria-hidden />
          <span>{s.label}</span>
          <span className="num">{formatBRL(p[s.key])}</span>
        </div>
      ))}
      <div className={styles.tooltipRow}>
        <span />
        <span>Sobra</span>
        <span className="num">{formatBRL(p.entradasCents - p.gastosCents)}</span>
      </div>
    </div>
  );
}
