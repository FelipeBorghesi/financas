import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';
import { api, type CsvImportResult } from '../api';
import { Icon } from '../components/Icon';
import { useInvalidateData } from '../components/TransactionsList';
import ui from '../components/ui.module.css';
import styles from './ImportPage.module.css';

export function ImportPage() {
  const invalidate = useInvalidateData();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<CsvImportResult[] | null>(null);
  const upload = useMutation({
    mutationFn: (files: File[]) => api.importCsv(files),
    onSuccess: async (data) => {
      setResults(data.results);
      if (input.current) input.current.value = '';
      await invalidate();
    },
  });

  const send = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (files.length) upload.mutate(files);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!upload.isPending) send(e.dataTransfer.files);
  };

  return (
    <>
      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Importar do Nubank</h2>
        <p className={`${ui.hint} ${styles.lead}`}>
          Envie o extrato da conta e a fatura do cartão em CSV. Dá para mandar vários de uma vez, e
          o que já foi importado é ignorado.
        </p>

        <label
          className={`${styles.drop} ${dragging ? styles.dragging : ''} ${upload.isPending ? styles.busy : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className={styles.dropIcon}>
            <Icon name="upload" size={22} />
          </span>
          <strong>{upload.isPending ? 'Importando…' : 'Escolher arquivos CSV'}</strong>
          <span className={ui.muted}>ou arraste para cá</span>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            multiple
            aria-label="Arquivos CSV"
            onChange={(e) => send(e.target.files)}
            disabled={upload.isPending}
          />
        </label>

        {upload.isError && (
          <div className={`${ui.banner} ${ui.bannerError}`}>{upload.error.message}</div>
        )}

        {results && (
          <ul className={styles.results}>
            {results.map((r, i) => (
              <li key={i} className={styles.result}>
                <span
                  className={`${styles.resultIcon} ${'error' in r ? styles.resultError : styles.resultOk}`}
                >
                  <Icon name={'error' in r ? 'close' : 'check'} size={14} />
                </span>
                <div className={styles.resultBody}>
                  <strong className={styles.fileName}>{r.fileName}</strong>
                  {'error' in r ? (
                    <span className={styles.error}>{r.error}</span>
                  ) : (
                    <span className={ui.muted}>
                      {r.kind === 'conta' ? 'Extrato da conta' : 'Fatura do cartão'} · {r.inserted}{' '}
                      novo{r.inserted === 1 ? '' : 's'}
                      {r.duplicates > 0 &&
                        ` · ${r.duplicates} já importado${r.duplicates === 1 ? '' : 's'}`}
                    </span>
                  )}
                  {'errors' in r && r.errors.length > 0 && (
                    <span className={styles.error}>
                      {r.errors.length} linha(s) ignorada(s):{' '}
                      {r.errors
                        .slice(0, 3)
                        .map((e) => `linha ${e.line} (${e.message})`)
                        .join('; ')}
                      {r.errors.length > 3 && '…'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>O que enviar</h2>
        <ol className={styles.steps}>
          <li>
            <strong>Extrato da conta:</strong> exporte o extrato do período em CSV (colunas Data,
            Valor, Identificador, Descrição).
          </li>
          <li>
            <strong>Fatura do cartão:</strong> exporte a fatura de cada mês em CSV (colunas date,
            title, amount).
          </li>
          <li>
            Envie os dois. Se um mês tiver só um deles, a tela do mês avisa que está incompleto.
          </li>
        </ol>
      </section>
    </>
  );
}
