import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import ui from '../components/ui.module.css';
import styles from './LoginPage.module.css';

export function LoginPage({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api.login(email.trim(), password),
    onSuccess: (data) => onLogin(data.email),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <div className={styles.wrap}>
      <form className={`${ui.section} ${styles.card}`} onSubmit={submit}>
        <div className={styles.logo}>
          <img src="/favicon.svg" alt="" width={40} height={40} />
        </div>
        <h1 className={styles.title}>Finanças</h1>
        <label className={styles.field}>
          <span>E-mail</span>
          <input
            className={ui.input}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span>Senha</span>
          <input
            className={ui.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {login.error && (
          <div className={`${ui.banner} ${ui.bannerError}`} role="alert">
            {login.error.message}
          </div>
        )}
        <button className={`${ui.button} ${ui.primary}`} disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
