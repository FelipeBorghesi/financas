import {
  CUSTOM_CATEGORY_TYPES,
  DEFAULT_RULES,
  hasBudget,
  parseBrDecimalToCents,
  type Budgets,
  type Category,
  type CategoryType,
  type CustomCategoryType,
} from '@financas/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type CategoryInfo } from '../api';
import {
  CategoryOptions,
  NewCategoryForm,
  TYPE_LABEL,
  useCategories,
} from '../components/categories';
import { Icon } from '../components/Icon';
import { useInvalidateData } from '../components/TransactionsList';
import ui from '../components/ui.module.css';
import styles from './GoalsPage.module.css';

const BUDGET_GROUPS: { title: string; type: CategoryType }[] = [
  { title: 'Variáveis', type: 'variavel' },
  { title: 'Fixos', type: 'fixo' },
  { title: 'Aporte', type: 'investimento' },
];

const centsToInput = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function GoalsPage() {
  return (
    <>
      <CategoriesEditor />
      <BudgetsEditor />
      <RulesEditor />
    </>
  );
}

function CategoriesEditor() {
  const cats = useCategories();
  const custom = (cats.data ?? []).filter((c) => !c.builtin);
  const builtin = (cats.data ?? []).filter((c) => c.builtin);

  return (
    <section className={ui.section}>
      <h2 className={ui.sectionTitle}>Suas categorias</h2>
      <p className={`${ui.hint} ${styles.lead}`}>
        Crie categorias além das padrão. <strong>Fixo</strong> e <strong>variável</strong> contam
        como gasto e podem ter meta; <strong>entrada</strong> soma nas entradas.
      </p>
      <NewCategoryForm />

      {custom.length > 0 && (
        <ul className={styles.catList}>
          {custom.map((c) => (
            <CustomCategoryRow key={c.id} category={c} />
          ))}
        </ul>
      )}

      {builtin.length > 0 && (
        <p className={styles.builtin}>
          <span className={ui.muted}>Padrão: </span>
          {builtin.map((c) => c.name).join(' · ')}
        </p>
      )}
    </section>
  );
}

function CustomCategoryRow({ category: c }: { category: CategoryInfo }) {
  const invalidate = useInvalidateData();
  const [name, setName] = useState(c.name);
  const [confirming, setConfirming] = useState(false);
  const update = useMutation({
    mutationFn: (patch: { name?: string; type?: CustomCategoryType }) =>
      api.updateCategory(c.id!, patch),
    onSuccess: invalidate,
    onError: () => setName(c.name),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteCategory(c.id!),
    onSuccess: invalidate,
  });

  const saveName = () => {
    const n = name.trim();
    if (n && n !== c.name) update.mutate({ name: n });
    else setName(c.name);
  };

  return (
    <li className={styles.catRow}>
      <input
        className={`${ui.input} ${styles.catName}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        maxLength={40}
        aria-label={`Nome da categoria ${c.name}`}
      />
      <select
        className={`${ui.select} ${styles.catType}`}
        value={c.type}
        onChange={(e) => update.mutate({ type: e.target.value as CustomCategoryType })}
        aria-label={`Tipo da categoria ${c.name}`}
      >
        {CUSTOM_CATEGORY_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      {confirming ? (
        <span className={styles.confirm}>
          <button
            className={`${ui.button} ${ui.small} ${styles.danger}`}
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            Apagar
          </button>
          <button
            className={`${ui.button} ${ui.small} ${ui.ghost}`}
            onClick={() => setConfirming(false)}
          >
            Não
          </button>
        </span>
      ) : (
        <button
          className={ui.iconButton}
          onClick={() => setConfirming(true)}
          aria-label={`Apagar categoria ${c.name}`}
          title="Apagar"
        >
          <Icon name="close" size={16} />
        </button>
      )}
      {confirming && (
        <p className={styles.confirmText}>
          As regras desta categoria serão removidas e os lançamentos dela voltam a ser classificados
          automaticamente.
        </p>
      )}
      {(update.isError || remove.isError) && (
        <p className={styles.confirmText} role="alert">
          {(update.error ?? remove.error)?.message}
        </p>
      )}
    </li>
  );
}

function BudgetsEditor() {
  const invalidate = useInvalidateData();
  const cats = useCategories();
  const budgets = useQuery({ queryKey: ['budgets'], queryFn: api.budgets });
  const withBudget = (cats.data ?? []).filter((c) => hasBudget(c.type));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<string[]>([]);

  useEffect(() => {
    if (budgets.data && cats.data) {
      setDraft(
        Object.fromEntries(
          cats.data
            .filter((c) => hasBudget(c.type))
            .map((c) => [c.name, centsToInput(budgets.data[c.name] ?? 0)]),
        ),
      );
    }
  }, [budgets.data, cats.data]);

  const save = useMutation({
    mutationFn: (b: Budgets) => api.saveBudgets(b),
    onSuccess: invalidate,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const out: Budgets = {};
    const bad: string[] = [];
    for (const c of withBudget) {
      try {
        const cents = parseBrDecimalToCents(draft[c.name] || '0');
        if (cents < 0) throw new Error();
        out[c.name] = cents;
      } catch {
        bad.push(c.name);
      }
    }
    setInvalid(bad);
    if (bad.length === 0) save.mutate(out);
  };

  return (
    <form className={ui.section} onSubmit={submit}>
      <div className={ui.sectionHeader}>
        <h2 className={ui.sectionTitle}>Metas por mês</h2>
        <button className={`${ui.button} ${ui.primary}`} disabled={save.isPending || !budgets.data}>
          {save.isPending ? 'Salvando…' : 'Salvar metas'}
        </button>
      </div>
      <p className={`${ui.hint} ${styles.lead}`}>Meta 0 = sem meta (não aparece em vermelho).</p>
      {budgets.isError && (
        <div className={`${ui.banner} ${ui.bannerError}`}>{budgets.error.message}</div>
      )}
      {invalid.length > 0 && (
        <div className={`${ui.banner} ${ui.bannerError}`}>
          Valor inválido em: {invalid.join(', ')}. Use números, ex.: 1550 ou 1.550,00.
        </div>
      )}
      {save.isError && <div className={`${ui.banner} ${ui.bannerError}`}>{save.error.message}</div>}
      {save.isSuccess && !save.isPending && (
        <div className={`${ui.banner} ${ui.bannerWarn}`} role="status">
          <Icon name="check" size={16} /> Metas salvas.
        </div>
      )}
      <div className={styles.groups}>
        {BUDGET_GROUPS.map((g) => {
          const items = withBudget.filter((c) => c.type === g.type);
          if (items.length === 0) return null;
          return (
            <fieldset key={g.title} className={styles.group}>
              <legend>{g.title}</legend>
              {items.map((c) => (
                <label key={c.name} className={styles.budgetRow}>
                  <span>{c.name === 'Investimento' ? 'Meta de aporte' : c.name}</span>
                  <span className={styles.money}>
                    <span className={ui.muted}>R$</span>
                    <input
                      className={ui.input}
                      inputMode="decimal"
                      value={draft[c.name] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [c.name]: e.target.value }))}
                      aria-invalid={invalid.includes(c.name)}
                    />
                  </span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
    </form>
  );
}

function RulesEditor() {
  const invalidate = useInvalidateData();
  const cats = useCategories();
  const rules = useQuery({ queryKey: ['rules'], queryFn: api.rules });
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState<Category>('Outros');
  const [showDefaults, setShowDefaults] = useState(false);

  const add = useMutation({
    mutationFn: () => api.addRule(pattern.trim(), category),
    onSuccess: async () => {
      setPattern('');
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteRule(id),
    onSuccess: invalidate,
  });

  return (
    <section className={ui.section}>
      <h2 className={ui.sectionTitle}>Suas regras</h2>
      <p className={`${ui.hint} ${styles.lead}`}>
        Valem antes das regras padrão e procuram o texto no nome do estabelecimento/pessoa. Para
        criar, troque a categoria de um lançamento e use “Aplicar a todos”, ou adicione aqui.
      </p>

      <form
        className={styles.addRule}
        onSubmit={(e) => {
          e.preventDefault();
          if (pattern.trim().length >= 2) add.mutate();
        }}
      >
        <input
          className={ui.input}
          placeholder="Texto, ex.: POSTO"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          aria-label="Texto da regra"
        />
        <select
          className={ui.select}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Categoria da regra"
        >
          <CategoryOptions categories={cats.data ?? []} />
        </select>
        <button className={ui.button} disabled={add.isPending || pattern.trim().length < 2}>
          Adicionar
        </button>
      </form>
      {add.isError && <div className={`${ui.banner} ${ui.bannerError}`}>{add.error.message}</div>}
      {remove.isError && (
        <div className={`${ui.banner} ${ui.bannerError}`}>{remove.error.message}</div>
      )}

      {rules.data?.length === 0 && <div className={ui.empty}>Nenhuma regra sua ainda.</div>}
      {rules.data && rules.data.length > 0 && (
        <table className={ui.table}>
          <thead>
            <tr>
              <th>Texto</th>
              <th>Categoria</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.data.map((r) => (
              <tr key={r.id}>
                <td className={styles.pattern}>
                  {r.pattern}
                  {(r.field === 'desc' || r.onlyNegative) && (
                    <span className={ui.muted}>
                      {' '}
                      ({r.field === 'desc' ? 'descrição' : 'nome'}
                      {r.onlyNegative ? ', só saídas' : ''})
                    </span>
                  )}
                </td>
                <td>{r.category}</td>
                <td className={ui.right}>
                  <button
                    className={ui.iconButton}
                    onClick={() => remove.mutate(r.id)}
                    disabled={remove.isPending}
                    aria-label={`Remover regra ${r.pattern}`}
                    title="Remover"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        className={`${ui.button} ${ui.small} ${styles.toggleDefaults}`}
        onClick={() => setShowDefaults((v) => !v)}
        aria-expanded={showDefaults}
      >
        {showDefaults ? 'Esconder regras padrão' : 'Ver regras padrão'}
      </button>
      {showDefaults && (
        <table className={ui.table}>
          <thead>
            <tr>
              <th>Texto</th>
              <th>Procura em</th>
              <th>Categoria</th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_RULES.map((r, i) => (
              <tr key={i}>
                <td className={styles.pattern}>{r.pattern}</td>
                <td className={ui.muted}>
                  {r.field === 'desc' ? 'descrição' : 'nome'}
                  {r.onlyNegative ? ', só saídas' : ''}
                </td>
                <td>{r.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
