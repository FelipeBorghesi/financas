import { assertIsoDate, parseBrDate } from './dates.js';
import { merchantKeyFor, type AccountKind } from './merchant.js';
import { centsToFixed2, parseBrDecimalToCents, parseDotDecimalToCents } from './money.js';

/** Lê CSV (RFC 4180): aspas, "" escapado, quebras de linha entre aspas, CRLF e BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0]?.trim() === ''));
}

export interface ParsedTransaction {
  externalId: string;
  accountKind: AccountKind;
  /** aaaa-mm-dd (data da compra/transação) */
  date: string;
  /** saída negativa, entrada positiva */
  amountCents: number;
  description: string;
  merchantKey: string;
}

export interface CsvRowError {
  /** linha no arquivo, começando em 1 (o cabeçalho é a linha 1) */
  line: number;
  message: string;
}

export interface CsvImportResult {
  kind: AccountKind;
  transactions: ParsedTransaction[];
  errors: CsvRowError[];
}

const CONTA_HEADER = ['data', 'valor', 'identificador', 'descrição'];
const CARTAO_HEADER = ['date', 'title', 'amount'];

function normHeader(cells: string[]): string[] {
  return cells.map((c) => c.trim().toLowerCase().normalize('NFC'));
}

function sameHeader(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function detectCsvKind(header: string[]): AccountKind | null {
  const h = normHeader(header);
  if (sameHeader(h, CONTA_HEADER)) return 'conta';
  if (sameHeader(h, CARTAO_HEADER)) return 'cartao';
  return null;
}

/** Lê um CSV exportado pelo Nubank (extrato da conta ou fatura do cartão). */
export function parseNubankCsv(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const [header, ...body] = rows;
  const kind = header ? detectCsvKind(header) : null;
  if (!kind) {
    throw new Error(
      'Formato de CSV não reconhecido. Use o extrato da conta (Data,Valor,Identificador,Descrição) ou a fatura do cartão (date,title,amount) exportados pelo Nubank.',
    );
  }

  const transactions: ParsedTransaction[] = [];
  const errors: CsvRowError[] = [];
  const occurrences = new Map<string, number>();

  body.forEach((cells, idx) => {
    const line = idx + 2;
    try {
      if (kind === 'conta') {
        const [data = '', valor = '', id = '', ...descParts] = cells;
        const description = descParts.join(',').trim();
        if (!id.trim()) throw new Error('Identificador vazio');
        transactions.push({
          externalId: id.trim(),
          accountKind: 'conta',
          date: parseBrDate(data),
          amountCents: parseDotDecimalToCents(valor),
          description,
          merchantKey: merchantKeyFor('conta', description),
        });
      } else {
        const [date = '', title = '', amount = ''] = cells;
        const isoDate = assertIsoDate(date);
        const t = title.trim();
        // Na fatura, positivo = compra. No app, compra é saída (negativa).
        const amountCents = -parseBrDecimalToCents(amount);
        const base = `c|${isoDate}|${t}|${centsToFixed2(amountCents)}`;
        const n = (occurrences.get(base) ?? 0) + 1;
        occurrences.set(base, n);
        transactions.push({
          externalId: `${base}|${n}`,
          accountKind: 'cartao',
          date: isoDate,
          amountCents,
          description: t,
          merchantKey: merchantKeyFor('cartao', t),
        });
      }
    } catch (e) {
      errors.push({ line, message: e instanceof Error ? e.message : String(e) });
    }
  });

  return { kind, transactions, errors };
}
