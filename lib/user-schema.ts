// lib/user-schema.ts
import { z } from 'zod';

export const userRoles = ['admin', 'editor', 'author'] as const;
export type UserRole = (typeof userRoles)[number];

/**
 * 12 characters minimum, no composition rules.
 *
 * Length beats character-class requirements: "P@ss1!" satisfies every classic
 * rule and is trivially guessable, while a 12-character passphrase is not.
 * NIST 800-63B recommends exactly this trade.
 */
export const passwordSchema = z
  .string()
  .min(12, 'كلمة المرور يجب ألا تقل عن ١٢ حرفاً')
  .max(200, 'كلمة المرور طويلة جداً');

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('بريد غير صالح').max(255),
  name: z.string().trim().min(1, 'الاسم مطلوب').max(255),
  role: z.enum(userRoles),
  password: passwordSchema,
  isActive: z.boolean().default(true),
});

/** Password is changed through its own endpoint, never alongside profile edits. */
export const updateUserSchema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب').max(255),
  role: z.enum(userRoles),
  isActive: z.boolean(),
});

export const changePasswordSchema = z.object({
  password: passwordSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'مدير عام',
  editor: 'محرر',
  author: 'كاتب',
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  admin: 'صلاحية كاملة، بما فيها الإعدادات وإدارة المستخدمين.',
  editor: 'إنشاء وتعديل وحذف كل المحتوى والوسائط.',
  author: 'إنشاء وتعديل المحتوى دون حذفه أو تغيير الإعدادات.',
};
