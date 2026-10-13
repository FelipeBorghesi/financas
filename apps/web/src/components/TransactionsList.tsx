import { suggestRulePattern, type Category } from '@financas/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { api, type Transaction } from '../api';
import { formatBRL } from '../format';
import { CategoryOptions, NewCategoryForm, useCategories } from './categories';
import { Icon } from './Icon';
import styles from './TransactionsList.module.css';
import ui from './ui.module.css';

const PAGE = 30;

const dayFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const formatDay = (iso: string) =>
  dayFormat
    .format(new Date(`${iso}T12:00:00Z`))
    .replace('.', '')
    .replace(/^\w/, (c) => c.toUpperCase());

/** Invalida tudo que depende de categoria. */
export function useInvalidateData() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['months', 'summary', 'transactions', 'rules', 'categories', 'budgets'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );
}

export function TransactionsList({ month }: { month: string }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const deferredQ = useDeferredValue(q.trim());
  const cats = useCategories();

  const txs = useQuery({
    queryKey: ['transactions', month, deferredQ, category],
    queryFn: () => api.transactions({ month, q: deferredQ, category }),
    placeholderData: (prev) => prev,
  });

  const visible = txs.data?.slice(0, limit) ?? [];
  const days: [string, Transaction[]][] = [];
  for (const t of visible) {
    const last = days[days.length - 1];
    if (last && last[0] === t.date) last[1].push(t);
    else days.push([t.date, [t]]);
  }

  return (
    <section className={ui.section}>
      <div className={ui.sectionHeader}>
        <h2 className={ui.sectionTitle}>Lançamentos</h2>
        {txs.data && <span className={ui.muted}>{txs.data.length}</span>}
      </div>

      <div className={styles.filters}>
        <label className={styles.search}>
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Buscar"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            aria-label="Buscar lançamentos"
          />
        </label>
        <select
          className={`${ui.select} ${styles.filterSelect}`}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setLimit(PAGE);
          }}
          aria-label="Filtrar por categoria"
        >
          <option value="">Todas as categorias</option>
          <CategoryOptions categories={cats.data ?? []} />
        </select>
      </div>

      {txs.isError && <div className={`${ui.banner} ${ui.bannerError}`}>{txs.error.message}</div>}
      {txs.data?.length === 0 && <div className={ui.empty}>Nenhum lançamento encontrado.</div>}

      {days.map(([date, items]) => (
        <div key={date} className={styles.day}>
          <h3 className={styles.dayTitle}>{formatDay(date)}</h3>
          <ul className={styles.list}>
            {items.map((t) => (
              <TransactionRow
                key={t.id}
                tx={t}
                open={openId === t.id}
                onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              />
            ))}
          </ul>
        </div>
      ))}

      {txs.data && txs.data.length > limit && (
        <button className={`${ui.button} ${styles.more}`} onClick={() => setLimit((l) => l + PAGE)}>
          Mostrar mais ({txs.data.length - limit})
        </button>
      )}
    </section>
  );
}

const NEW = '__nova__';

function TransactionRow({
  tx,
  open,
  onToggle,
}: {
  tx: Transaction;
  open: boolean;
  onToggle: () => void;
}) {
  const invalidate = useInvalidateData();
  const cats = useCategories();
  const [choice, setChoice] = useState<Category>(tx.category);
  const [creating, setCreating] = useState(false);
  const [pattern, setPattern] = useState(() => suggestRulePattern(tx.merchantKey));
  const save = useMutation({
    mutationFn: (v: { category: Category | null; applyToAll: boolean }) =>
      api.setCategory(tx.id, v.category, v.applyToAll, v.applyToAll ? pattern.trim() : undefined),
    onSuccess: async () => {
      await invalidate();
      onToggle();
    },
  });

  const positive = tx.amountCents > 0;
  const changed = choice !== tx.category;

  return (
    <li className={`${styles.item} ${open ? styles.open : ''}`}>
      <button className={styles.row} onClick={onToggle} aria-expanded={open}>
        <span className={styles.avatar} aria-hidden>
          {tx.merchantKey.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span className={styles.main}>
          <span className={styles.name}>{tx.merchantKey}</span>
          <span className={styles.meta}>
            <span className={styles.chip}>{tx.category}</span>
            {tx.categorySource === 'manual' && <span>· manual</span>}
            <span>· {tx.accountKind === 'cartao' ? 'cartão' : 'conta'}</span>
          </span>
        </span>
        <span className={`${styles.amount} num ${positive ? styles.positive : ''}`}>
          {positive ? '+' : ''}
          {formatBRL(tx.amountCents)}
        </span>
      </button>

      {open && (
        <div className={styles.editor}>
          {tx.description !== tx.merchantKey && <p className={styles.desc}>{tx.description}</p>}
          <label className={styles.editLabel}>
            Categoria
            <select
              className={ui.select}
              value={choice}
              onChange={(e) => {
                if (e.target.value === NEW) setCreating(true);
                else setChoice(e.target.value);
              }}
              disabled={save.isPending}
            >
              <CategoryOptions categories={cats.data ?? []} />
              <option value={NEW}>+ Nova categoria…</option>
            </select>
          </label>
          {creating && (
            <NewCategoryForm
              compact
              onCreated={(name) => {
                setChoice(name);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          )}
          <label className={styles.editLabel}>
            “Aplicar a todos” vale para nomes que contêm
            <input
              className={ui.select}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              maxLength={200}
            />
          </label>
          <div className={styles.actions}>
            <button
              className={`${ui.button} ${ui.small}`}
              onClick={() => save.mutate({ category: choice, applyToAll: false })}
              disabled={save.isPending || !changed}
            >
              Só este
            </button>
            <button
              className={`${ui.button} ${ui.small} ${ui.primary}`}
              onClick={() => save.mutate({ category: choice, applyToAll: true })}
              disabled={save.isPending || pattern.trim().length < 2}
              title={`Cria uma regra: nomes com "${pattern.trim()}" → ${choice}`}
            >
              Aplicar a todos
            </button>
            {tx.categorySource === 'manual' && (
              <button
                className={`${ui.button} ${ui.small} ${ui.ghost}`}
                onClick={() => save.mutate({ category: null, applyToAll: false })}
                disabled={save.isPending}
              >
                Voltar ao automático
              </button>
            )}
          </div>
          {save.isError && (
            <div className={`${ui.banner} ${ui.bannerError}`}>{save.error.message}</div>
          )}
        </div>
      )}
    </li>
  );
}
