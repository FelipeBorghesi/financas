# Finanças

Controle financeiro pessoal a partir dos extratos do Nubank. Importo o CSV da conta e da fatura do
cartão, o app categoriza tudo e mostra quanto entrou, quanto foi para gastos fixos e variáveis,
quanto investi e quanto sobrou no mês.

Fiz para uso próprio, com login de usuário único.

## O que faz

- Importa o extrato da conta e a fatura do cartão (CSV exportado pelo app do Nubank), sem duplicar
  nada ao reimportar.
- Categoriza por regras: as padrão e as minhas, que crio a partir de qualquer lançamento.
- Mostra a sobra do mês, gastos fixos por estabelecimento, variáveis contra a meta e a evolução mês
  a mês.
- Categorias e metas editáveis.
- Avisa quando um mês está incompleto (só conta ou só cartão importado).
- Funciona bem no celular, com tema claro e escuro.

## Stack

TypeScript em tudo, num monorepo com npm workspaces:

- `packages/core`: regras de negócio puras (parser de CSV, categorização, resumo do mês), com testes
  em Vitest.
- `apps/api`: Fastify, Drizzle ORM e Postgres. Em produção também serve o front.
- `apps/web`: React, Vite, TanStack Query e Recharts.

## Rodando localmente

Precisa de Node 22+.

```bash
npm install
cp .env.example .env
npm run hash-password     # gera o APP_PASSWORD_HASH para o .env
npm run dev               # front em http://localhost:5173, API em :3000
```

As migrations rodam quando a API sobe.

### Banco

Duas opções para o `DATABASE_URL`:

- `postgres://financas:financas@localhost:5432/financas`, subindo o Postgres com
  `docker compose up -d`;
- `pglite:./.pglite`, que usa o [PGlite](https://pglite.dev) (Postgres embutido, grava numa pasta).
  É o jeito mais rápido de começar, sem Docker.

O PGlite não lida bem com o processo sendo encerrado no meio de uma escrita, nem com dois processos
abrindo a mesma pasta. Por isso a API trava o banco para um processo só e guarda uma cópia em
`apps/api/.pglite-backups/` a cada inicialização (as 5 últimas). Se um dia o banco não abrir,
renomeie `.pglite` e copie o backup mais recente no lugar. Pare a API com Ctrl+C.

`npm run dev` não reinicia a API ao salvar arquivos, justamente para não derrubar o PGlite no meio
de uma escrita. Para desenvolver a API com recarregamento, use `npm run dev:watch -w apps/api` com
um banco descartável.

## Variáveis de ambiente

| Variável            | Descrição                                                    |
| ------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`      | `postgres://...` ou `pglite:<pasta>`                         |
| `APP_USER_EMAIL`    | e-mail do login                                              |
| `APP_PASSWORD_HASH` | hash bcrypt da senha (`npm run hash-password`)               |
| `SESSION_SECRET`    | 32+ caracteres aleatórios; trocar derruba as sessões abertas |
| `PORT`              | padrão 3000                                                  |
| `NODE_ENV`          | `production` no servidor                                     |

No `.env`, coloque o `APP_PASSWORD_HASH` entre aspas simples por causa dos `$`.

## Importando os extratos

Exporte no app do Nubank:

- **extrato da conta**: CSV com `Data,Valor,Identificador,Descrição`;
- **fatura do cartão**: CSV com `date,title,amount`, uma por mês.

Envie os arquivos na aba **Importar**. O mês de cada lançamento é o da data da compra, não o do
pagamento da fatura. O pagamento da fatura é ignorado nos totais, para o cartão não contar duas
vezes.

## Categorias e regras

A categoria de um lançamento é decidida nesta ordem:

1. categoria escolhida manualmente no lançamento;
2. minhas regras (salvas no banco);
3. regras padrão (`packages/core/src/rules.ts`);
4. sem regra: entrada vira "Outras entradas" e saída vira "Outros".

Ao trocar a categoria de um lançamento, "Aplicar a todos" cria uma regra. O texto sugerido já vem
sem o número da parcela ("Loja X*3 de" vira "Loja X"), para pegar os outros meses.

### Regras pessoais

Regras com nomes de pessoas ou lugares (quem paga meu salário, a construtora, o mercado do bairro)
não ficam no código. Ficam num JSON fora do git e são importadas para o banco:

```bash
cp regras-pessoais.example.json regras-pessoais.json   # edite com as suas
npm run import-rules -- regras-pessoais.json
```

Cada regra procura o texto no nome do estabelecimento/pessoa (`"field": "key"`, padrão) ou na
descrição inteira (`"field": "desc"`). Com `"onlyNegative": true`, só vale para saídas. Rodar de novo
atualiza as regras existentes.

## Testes

```bash
npm test            # core e API (a API testa contra um Postgres em memória)
npm run typecheck
npm run lint
```

## Deploy

É um único serviço Node: `npm run build` gera o front e a API, e a API serve os arquivos estáticos.
Exemplo com [Render](https://render.com) e Postgres no [Neon](https://neon.tech):

1. Crie um banco no Neon e copie a connection string (com `?sslmode=require`).
2. No Render, crie um Web Service apontando para o repositório:
   - build: `npm ci && npm run build`
   - start: `npm start`
   - health check: `/api/health`
3. Configure `NODE_ENV=production`, `DATABASE_URL`, `APP_USER_EMAIL`, `APP_PASSWORD_HASH` (sem
   aspas) e `SESSION_SECRET`.
4. Depois do primeiro deploy, importe as regras pessoais apontando para o banco de produção:
   `DATABASE_URL=<url do neon> npm run import-rules -- regras-pessoais.json`.

O cookie de sessão é `secure`, então o app precisa rodar em HTTPS (o Render já entrega assim).

## Segurança

- Todas as rotas da API exigem login, menos `/api/health` e o próprio login.
- Sessão em cookie assinado (`httpOnly`, `secure`, `sameSite=lax`), válida por 30 dias.
- Rate limit no login, proteção CSRF nas rotas que alteram dados, Helmet com CSP, sem CORS.
- Os logs não registram corpo de requisição nem cookies.

## Ideias para depois

- Sincronização automática via Open Finance (Pluggy / Meu Pluggy). O banco já tem as tabelas para
  isso.
- Alerta por e-mail quando passar da meta.
- Projeção do fim do mês.
