import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa ter pelo menos 32 caracteres'),
  APP_USER_EMAIL: z.email('APP_USER_EMAIL inválido'),
  APP_PASSWORD_HASH: z
    .string()
    .regex(
      /^\$2[aby]\$\d{2}\$/,
      'APP_PASSWORD_HASH não é um hash bcrypt (rode npm run hash-password)',
    ),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Variáveis de ambiente inválidas:\n${problems.join('\n')}\nVeja o .env.example.`,
    );
  }
  return parsed.data;
}
