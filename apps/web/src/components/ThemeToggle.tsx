import { useEffect, useState } from 'react';
import { Icon, type IconName } from './Icon';
import ui from './ui.module.css';

type Theme = 'auto' | 'light' | 'dark';
const META: Record<Theme, { label: string; icon: IconName; next: Theme }> = {
  auto: { label: 'Tema automático', icon: 'auto', next: 'light' },
  light: { label: 'Tema claro', icon: 'sun', next: 'dark' },
  dark: { label: 'Tema escuro', icon: 'moon', next: 'auto' },
};
const KEY = 'financas.theme';

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* sem storage: o tema vale só nesta aba */
    }
  }, [theme]);

  const m = META[theme];
  return (
    <button
      className={ui.iconButton}
      onClick={() => setTheme(m.next)}
      aria-label={`${m.label} (trocar)`}
      title={m.label}
    >
      <Icon name={m.icon} size={18} />
    </button>
  );
}
