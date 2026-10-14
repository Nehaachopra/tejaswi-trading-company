import { z } from "zod";

import { phoneModel } from "../auth/model";

export const roleModel = z.enum(["admin", "accountant", "staff"]);

export const staffModel = z.object({
  id: z.string().uuid(),
  name: z.string(),
  countryCode: z.string(),
  phone: z.string(),
  role: roleModel,
  isActive: z.boolean(),
  photoUrl: z.string().nullable(),
  createdAt: z.date(),
});

export type StaffModel = z.infer<typeof staffModel>;

export const registerStaffInputModel = phoneModel.extend({
  name: z.string().trim().min(1).max(30),
  role: roleModel,
});

export type RegisterStaffInputModel = z.infer<typeof registerStaffInputModel>;

export const updateStaffInputModel = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(30).optional(),
  countryCode: phoneModel.shape.countryCode.optional(),
  phone: phoneModel.shape.phone.optional(),
  photoUrl: z.string().url().nullable().optional(),
});

export type UpdateStaffInputModel = z.infer<typeof updateStaffInputModel>;

export const setRoleInputModel = z.object({ id: z.string().uuid(), role: roleModel });

export type SetRoleInputModel = z.infer<typeof setRoleInputModel>;

export const setActiveInputModel = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export type SetActiveInputModel = z.infer<typeof setActiveInputModel>;

export const staffIdInputModel = z.object({ id: z.string().uuid() });
