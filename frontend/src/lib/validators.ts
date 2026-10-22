import { z } from 'zod'

export const phoneSchema = z.string().regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number')

export const otpSchema = z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric')

export const orgCreateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  plan: z.string().default('free'),
})

export const subfolderSchema = z.object({
  root_folder: z.string(),
  subfolder_name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9 _\-.]*[a-zA-Z0-9]$/, 'Invalid folder name'),
})
