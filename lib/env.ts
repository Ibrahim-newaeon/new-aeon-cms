// lib/env.ts
import { z } from 'zod';

/**
 * Mega-prompt rule: "Secrets in env only, validated at boot."
 * Import this module for its side effect from any server entrypoint that needs
 * guaranteed-valid config. Failing here is deliberate — a missing JWT secret
 * should stop the process, not surface as a 500 on first login.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),

  // 32 chars is the documented minimum in .env.example and the mega-prompt.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),

  ADMIN_PATH: z
    .string()
    .regex(/^\/[a-z0-9-/]*$/i, 'ADMIN_PATH must start with / and be URL-safe')
    .default('/admin'),

  DEFAULT_LOCALE: z.enum(['ar', 'en']).default('ar'),
  AVAILABLE_LOCALES: z.string().default('ar,en'),

  UPLOAD_DIR: z.string().default('./public/uploads'),
  REDIS_URL: z.string().url().optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

function parseEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  return parsed.data;
}

export const env = parseEnv();

export const locales = env.AVAILABLE_LOCALES.split(',')
  .map((l) => l.trim())
  .filter((l): l is 'ar' | 'en' => l === 'ar' || l === 'en');

export type Locale = (typeof locales)[number];
