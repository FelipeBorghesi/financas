import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, ApiError, setUnauthorizedHandler } from './api';
import styles from './App.module.css';
import { Icon } from './components/Icon';
import { ThemeToggle } from './components/ThemeToggle';
import ui from './components/ui.module.css';
import { GoalsPage } from './pages/GoalsPage';
import { ImportPage } from './pages/ImportPage';
import { LoginPage } from './pages/LoginPage';
import { MonthPage } from './pages/MonthPage';

const PAGES = [
  { id: 'mes', label: 'Mês', icon: 'month' },
  { id: 'metas', label: 'Metas e regras', icon: 'goals' },
  { id: 'importar', label: 'Importar', icon: 'upload' },
] as const;
type PageId = (typeof PAGES)[number]['id'];

function pageFromHash(): PageId {
  const id = window.location.hash.replace(/^#\/?/, '');
  return PAGES.some((p) => p.id === id) ? (id as PageId) : 'mes';
}

export function App() {
  const qc = useQueryClient();
  const [page, setPage] = useState<PageId>(pageFromHash);
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => qc.setQueryData(['me'], null));
  }, [qc]);

  /** Limpa os dados em cache, mantendo a query de sessão observada por este componente. */
  const clearData = () => qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });

  if (me.isPending) return <div className={ui.empty}>Carregando…</div>;

  const unauthorized =
    (me.error instanceof ApiError && me.error.status === 401) || me.data === null;
  if (unauthorized) {
    return (
      <LoginPage
        onLogin={(email) => {
          clearData();
          qc.setQueryData(['me'], { email });
        }}
      />
    );
  }
  if (me.isError) {
    return (
      <div className={styles.shell}>
        <div className={`${ui.banner} ${ui.bannerError}`}>
          Não foi possível falar com o servidor: {me.error.message}
        </div>
      </div>
    );
  }

  const logout = async () => {
    await api.logout().catch(() => {});
    clearData();
    qc.setQueryData(['me'], null);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Finanças</span>
        </div>
        <nav className={styles.nav} aria-label="Seções">
          {PAGES.map((p) => (
            <a
              key={p.id}
              href={`#/${p.id}`}
              className={styles.navLink}
              aria-current={page === p.id ? 'page' : undefined}
            >
              <Icon name={p.icon} size={18} />
              <span>{p.label}</span>
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <ThemeToggle />
          <button className={ui.iconButton} onClick={logout} aria-label="Sair" title="Sair">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </header>
      <main className={styles.main}>
        {page === 'mes' && <MonthPage />}
        {page === 'metas' && <GoalsPage />}
        {page === 'importar' && <ImportPage />}
      </main>
    </div>
  );
}
