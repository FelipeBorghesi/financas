import type {
  AccountKind,
  Budgets,
  Category,
  CategorySource,
  CategoryDef,
  CustomCategoryType,
  CsvRowError,
  EvolutionPoint,
  MonthSummary,
} from '@financas/core';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Chamado quando a sessão expira (401), para voltar à tela de login. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  // Header customizado: um site de fora não consegue enviá-lo sem CORS (proteção CSRF).
  if (method !== 'GET') headers['x-csrf'] = '1';

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Confira a internet e tente de novo.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized();
    const msg =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Erro ${res.status}. Tente de novo.`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export interface Transaction {
  id: number;
  date: string;
  amountCents: number;
  description: string;
  merchantKey: string;
  accountKind: AccountKind;
  source: 'pluggy' | 'csv';
  category: Category;
  categorySource: CategorySource;
  categoryManual: Category | null;
}

export interface Rule {
  id: number;
  pattern: string;
  category: Category;
  field: 'key' | 'desc';
  onlyNegative: boolean;
  createdAt: string;
}

export interface CategoryInfo extends CategoryDef {
  /** só as categorias do usuário têm id */
  id?: number;
}

export type CsvImportResult =
  | {
      fileName: string;
      kind: AccountKind;
      total: number;
      inserted: number;
      duplicates: number;
      errors: CsvRowError[];
    }
  | { fileName: string; error: string };

export const api = {
  me: () => request<{ email: string }>('GET', '/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ email: string }>('POST', '/api/auth/login', { email, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),

  categories: () => request<CategoryInfo[]>('GET', '/api/categories'),
  createCategory: (name: string, type: CustomCategoryType) =>
    request<CategoryInfo>('POST', '/api/categories', { name, type }),
  updateCategory: (id: number, patch: { name?: string; type?: CustomCategoryType }) =>
    request<CategoryInfo>('PATCH', `/api/categories/${id}`, patch),
  deleteCategory: (id: number) => request<{ ok: true }>('DELETE', `/api/categories/${id}`),
  months: () => request<{ months: string[]; current: string }>('GET', '/api/months'),
  summary: (month: string) =>
    request<{ summary: MonthSummary; evolution: EvolutionPoint[] }>(
      'GET',
      `/api/summary?month=${month}`,
    ),
  transactions: (params: { month?: string; q?: string; category?: string }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return request<Transaction[]>('GET', `/api/transactions?${qs.toString()}`);
  },
  setCategory: (id: number, category: Category | null, applyToAll = false, pattern?: string) =>
    request<{ ok: true; rule?: { pattern: string; category: Category } }>(
      'PATCH',
      `/api/transactions/${id}`,
      { category, applyToAll, pattern },
    ),
  budgets: () => request<Budgets>('GET', '/api/budgets'),
  saveBudgets: (b: Budgets) => request<Budgets>('PUT', '/api/budgets', b),
  rules: () => request<Rule[]>('GET', '/api/rules'),
  addRule: (pattern: string, category: Category) =>
    request<Rule>('POST', '/api/rules', { pattern, category }),
  deleteRule: (id: number) => request<{ ok: true }>('DELETE', `/api/rules/${id}`),
  importCsv: (files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    return request<{ results: CsvImportResult[] }>('POST', '/api/import/csv', fd);
  },
};
