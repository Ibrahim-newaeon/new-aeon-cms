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

  /**
   * Storage driver. Defaults to `local` on purpose: a developer who clones this
   * and runs `npm run dev` must not need bucket credentials.
   */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),

  // S3-compatible: AWS S3, Cloudflare R2, MinIO, Spaces. Optional here and
  // required conditionally below — see the superRefine on the schema.
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default('auto'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_URL: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional(),

  /**
   * Mail driver. Defaults to `log` on purpose: seed and staging databases hold
   * real customer addresses, so running checkout locally must not be one
   * missing variable away from emailing them.
   */
  MAIL_DRIVER: z.enum(['log', 'smtp', 'resend']).default('log'),
  MAIL_FROM: z.string().email().optional(),
  MAIL_FROM_NAME: z.string().optional(),
  /** Overrides settings.contactEmail for store-facing notifications. */
  MAIL_ADMIN_TO: z.string().email().optional(),

  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),

  RESEND_API_KEY: z.string().min(1).optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

/**
 * A half-configured bucket must stop the process at boot, not surface as a 500
 * on the editor's first upload — by which point the file is already lost.
 */
const withStorageRules = envSchema.superRefine((cfg, ctx) => {
  // Mail: a driver that cannot reach its provider must fail at boot, not on
  // the first order — by which point the customer has no confirmation and
  // nobody has been told the order exists.
  const require = (key: keyof typeof cfg, when: string) => {
    if (!cfg[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when ${when}`,
      });
    }
  };

  if (cfg.MAIL_DRIVER === 'smtp') {
    require('SMTP_HOST', 'MAIL_DRIVER=smtp');
    require('MAIL_FROM', 'MAIL_DRIVER=smtp');
  }

  if (cfg.MAIL_DRIVER === 'resend') {
    require('RESEND_API_KEY', 'MAIL_DRIVER=resend');
    require('MAIL_FROM', 'MAIL_DRIVER=resend');
  }

  if (cfg.STORAGE_DRIVER !== 's3') return;

  const required = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

  for (const key of required) {
    if (!cfg[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when STORAGE_DRIVER=s3`,
      });
    }
  }

  // Without an endpoint we fall back to the AWS virtual-host URL, which needs a
  // real region. `auto` is an R2 convention and is meaningless to AWS.
  if (!cfg.S3_ENDPOINT && !cfg.S3_PUBLIC_URL && cfg.S3_REGION === 'auto') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['S3_REGION'],
      message: 'S3_REGION must be a real AWS region when neither S3_ENDPOINT nor S3_PUBLIC_URL is set',
    });
  }
});

function parseEnv() {
  const parsed = withStorageRules.safeParse(process.env);

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
