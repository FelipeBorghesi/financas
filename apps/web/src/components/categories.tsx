import { CUSTOM_CATEGORY_TYPES, type CategoryType, type CustomCategoryType } from '@financas/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, type CategoryInfo } from '../api';
import styles from './categories.module.css';
import ui from './ui.module.css';

export const TYPE_LABEL: Record<CategoryType, string> = {
  entrada: 'Entrada',
  fixo: 'Fixo',
  variavel: 'Variável',
  investimento: 'Investimento',
  ignorar: 'Ignorado',
};

const GROUPS: { label: string; types: CategoryType[] }[] = [
  { label: 'Gastos variáveis', types: ['variavel'] },
  { label: 'Gastos fixos', types: ['fixo'] },
  { label: 'Entradas', types: ['entrada'] },
  { label: 'Outros', types: ['investimento', 'ignorar'] },
];

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 60_000 });
}

/** Options de <select> agrupadas por tipo, com as categorias do usuário incluídas. */
export function CategoryOptions({ categories }: { categories: CategoryInfo[] }) {
  return (
    <>
      {GROUPS.map((g) => {
        const items = categories.filter((c) => g.types.includes(c.type));
        if (items.length === 0) return null;
        return (
          <optgroup key={g.label} label={g.label}>
            {items.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

/** Formulário curto para criar categoria. Chama onCreated com o nome criado. */
export function NewCategoryForm({
  onCreated,
  onCancel,
  compact = false,
}: {
  onCreated?: (name: string) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomCategoryType>('variavel');
  const create = useMutation({
    mutationFn: () => api.createCategory(name.trim(), type),
    onSuccess: async (c) => {
      setName('');
      await Promise.all(
        ['categories', 'budgets', 'summary'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
      onCreated?.(c.name);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length >= 2) create.mutate();
  };

  return (
    <form className={`${styles.form} ${compact ? styles.compact : ''}`} onSubmit={submit}>
      <input
        className={ui.input}
        placeholder="Nome, ex.: Moto"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        aria-label="Nome da nova categoria"
        autoFocus={compact}
      />
      <select
        className={ui.select}
        value={type}
        onChange={(e) => setType(e.target.value as CustomCategoryType)}
        aria-label="Tipo da nova categoria"
      >
        {CUSTOM_CATEGORY_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <div className={styles.buttons}>
        <button
          className={`${ui.button} ${ui.primary}`}
          disabled={create.isPending || name.trim().length < 2}
        >
          Criar
        </button>
        {onCancel && (
          <button type="button" className={`${ui.button} ${ui.ghost}`} onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      {create.isError && (
        <div className={`${ui.banner} ${ui.bannerError} ${styles.full}`}>
          {create.error.message}
        </div>
      )}
    </form>
  );
}
