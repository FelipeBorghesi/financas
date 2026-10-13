import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { EvolutionChart } from '../components/EvolutionChart';
import { FixedExpenses } from '../components/FixedExpenses';
import { Icon } from '../components/Icon';
import { MonthHero } from '../components/MonthHero';
import { TransactionsList } from '../components/TransactionsList';
import ui from '../components/ui.module.css';
import { VariablesVsBudget } from '../components/VariablesVsBudget';
import styles from './MonthPage.module.css';

export function MonthPage() {
  const months = useQuery({ queryKey: ['months'], queryFn: api.months });
  const [picked, setPicked] = useState<string | null>(null);

  const options = months.data
    ? [...new Set([...months.data.months, months.data.current])].sort()
    : [];
  const month = picked ?? months.data?.months.at(-1) ?? months.data?.current ?? null;

  const summary = useQuery({
    queryKey: ['summary', month],
    queryFn: () => api.summary(month!),
    enabled: !!month,
  });

  if (months.isError) {
    return <div className={`${ui.banner} ${ui.bannerError}`}>{months.error.message}</div>;
  }
  if (!month) return <div className={ui.empty}>Carregando…</div>;

  const s = summary.data?.summary;

  return (
    <>
      <MonthHero month={month} options={options} onChange={setPicked} summary={s} />

      {summary.isError && (
        <div className={`${ui.banner} ${ui.bannerError}`}>{summary.error.message}</div>
      )}

      {s && s.transactionCount === 0 && (
        <div className={`${ui.banner} ${ui.bannerWarn}`}>
          <Icon name="file" size={18} />
          <span>
            Nenhum lançamento neste mês. Envie os CSVs do Nubank em{' '}
            <a href="#/importar">Importar</a>.
          </span>
        </div>
      )}

      {s?.incomplete && (
        <div className={`${ui.banner} ${ui.bannerWarn}`} role="status">
          <Icon name="alert" size={18} />
          <span>
            <strong>Mês incompleto.</strong> Tem lançamentos {s.hasConta ? 'da conta' : 'do cartão'}
            , mas nenhum {s.hasConta ? 'do cartão' : 'da conta'}, então os totais podem estar
            errados. <a href="#/importar">Importar o que falta</a>
          </span>
        </div>
      )}

      {s && s.transactionCount > 0 && (
        <div className={styles.columns}>
          <VariablesVsBudget summary={s} />
          <FixedExpenses summary={s} />
        </div>
      )}

      {summary.data && summary.data.evolution.length > 1 && (
        <EvolutionChart
          points={summary.data.evolution}
          selected={month}
          onSelect={(m) => setPicked(m)}
        />
      )}

      {s && s.transactionCount > 0 && <TransactionsList month={month} />}
    </>
  );
}
