import { TRPCError } from "@trpc/server";
import { and, asc, count, db, eq, isNull, ne } from "@repo/database";
import { sessionsTable, usersTable } from "@repo/database/schema";
import { logger } from "@repo/logger";

import type { PhoneModel } from "../auth/model";
import type {
  RegisterStaffInputModel,
  SetActiveInputModel,
  SetRoleInputModel,
  StaffModel,
  UpdateStaffInputModel,
} from "./model";

// accepts "9876543210", "+91 98765 43210" or "919876543210"; Indian numbers only for now
export function parseIndianPhone(raw: string): PhoneModel {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (!/^\d{10}$/.test(digits)) {
    throw new Error(`Invalid Indian phone number: ${raw}`);
  }
  return { countryCode: "+91", phone: digits };
}

const staffColumns = {
  id: usersTable.id,
  name: usersTable.name,
  countryCode: usersTable.countryCode,
  phone: usersTable.phone,
  role: usersTable.role,
  isActive: usersTable.isActive,
  photoUrl: usersTable.photoUrl,
  createdAt: usersTable.createdAt,
};

function isUniqueViolation(error: unknown) {
  const cause = (error as { cause?: { code?: string } })?.cause ?? (error as { code?: string });
  return cause?.code === "23505";
}

export default class UserService {
  // the very first admin comes from PHONE_NUMBER in .env; every later user is registered by an admin
  async ensureFirstAdmin(rawPhone: string) {
    const [existing] = await db.select({ users: count() }).from(usersTable);
    if (existing && existing.users > 0) return;

    const phone = parseIndianPhone(rawPhone);
    await db.insert(usersTable).values({ name: "Admin", role: "admin", ...phone });
    logger.info(`Created the first admin for ${phone.countryCode}${phone.phone}`);
  }

  async list(): Promise<StaffModel[]> {
    return db.select(staffColumns).from(usersTable).orderBy(asc(usersTable.name));
  }

  private async get(id: string) {
    const [user] = await db.select(staffColumns).from(usersTable).where(eq(usersTable.id, id));
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
    return user;
  }

  // the business must always keep at least one active admin
  private async assertOtherActiveAdmin(userId: string) {
    const [row] = await db
      .select({ admins: count() })
      .from(usersTable)
      .where(
        and(eq(usersTable.role, "admin"), eq(usersTable.isActive, true), ne(usersTable.id, userId)),
      );

    if (!row || row.admins === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "There must be at least one other active admin.",
      });
    }
  }

  async register(input: RegisterStaffInputModel): Promise<StaffModel> {
    try {
      const [created] = await db
        .insert(usersTable)
        .values({
          name: input.name,
          countryCode: input.countryCode,
          phone: input.phone,
          role: input.role,
        })
        .returning(staffColumns);
      return created!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TRPCError({ code: "CONFLICT", message: "This number is already registered." });
      }
      throw error;
    }
  }

  async update(input: UpdateStaffInputModel): Promise<StaffModel> {
    const { id, ...changes } = input;
    await this.get(id);

    try {
      const [updated] = await db
        .update(usersTable)
        .set(changes)
        .where(eq(usersTable.id, id))
        .returning(staffColumns);
      return updated!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TRPCError({ code: "CONFLICT", message: "This number is already registered." });
      }
      throw error;
    }
  }

  async setRole(input: SetRoleInputModel): Promise<StaffModel> {
    const user = await this.get(input.id);
    if (user.role === "admin" && input.role !== "admin" && user.isActive) {
      await this.assertOtherActiveAdmin(user.id);
    }

    const [updated] = await db
      .update(usersTable)
      .set({ role: input.role })
      .where(eq(usersTable.id, input.id))
      .returning(staffColumns);
    return updated!;
  }

  async setActive(input: SetActiveInputModel): Promise<StaffModel> {
    const user = await this.get(input.id);
    if (!input.isActive && user.role === "admin") {
      await this.assertOtherActiveAdmin(user.id);
    }

    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(usersTable)
        .set({ isActive: input.isActive })
        .where(eq(usersTable.id, input.id))
        .returning(staffColumns);

      // a deactivated user is logged out everywhere immediately
      if (!input.isActive) {
        await tx
          .update(sessionsTable)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessionsTable.userId, input.id), isNull(sessionsTable.revokedAt)));
      }

      return updated!;
    });
  }

  async forceLogout(userId: string) {
    await this.get(userId);
    await db
      .update(sessionsTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.revokedAt)));
  }
}
