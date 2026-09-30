import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const courseAccounts = pgTable("course_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  paid: boolean("paid").notNull().default(false),
  paddleTransactionId: text("paddle_transaction_id"),
  paddleCustomerId: text("paddle_customer_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  completedModules: jsonb("completed_modules")
    .$type<number[]>()
    .notNull()
    .default([]),
  examScore: integer("exam_score"),
  streak: integer("streak").notNull().default(0),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type CourseAccount = typeof courseAccounts.$inferSelect;