import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { courseAccounts, db } from "@workspace/db";
import {
  finalExamQuestions,
  modules,
  phaseGroups,
} from "../course-content";
import { reconcilePaddlePaidAccess } from "../paddleReconciliation";

const router: IRouter = Router();

export type CourseRequest = Request & { clerkUserId?: string };

export function requireAuth(req: CourseRequest, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }
  req.clerkUserId = userId;
  next();
}

export async function getOrCreateAccount(clerkUserId: string) {
  const existing = await db
    .select()
    .from(courseAccounts)
    .where(eq(courseAccounts.clerkUserId, clerkUserId))
    .limit(1);
  if (existing[0]) return existing[0];

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ||
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error("Your account does not have an email address.");

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email.split("@")[0];

  try {
    const inserted = await db
      .insert(courseAccounts)
      .values({ clerkUserId, email, displayName })
      .returning();
    return inserted[0];
  } catch {
    const raced = await db
      .select()
      .from(courseAccounts)
      .where(eq(courseAccounts.clerkUserId, clerkUserId))
      .limit(1);
    if (!raced[0]) throw new Error("Unable to create your course account.");
    return raced[0];
  }
}

async function requirePaid(req: CourseRequest, res: Response, next: NextFunction) {
  if (!req.clerkUserId) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }
  const account = await getOrCreateAccount(req.clerkUserId);
  if (!account.paid) {
    res.status(403).json({ error: "A paid course account is required." });
    return;
  }
  next();
}

function codesMatch(input: string, configured: string) {
  const inputDigest = createHash("sha256").update(input).digest();
  const configuredDigest = createHash("sha256").update(configured).digest();
  return timingSafeEqual(inputDigest, configuredDigest);
}

router.get("/course/access", requireAuth, async (req: CourseRequest, res) => {
  try {
    const account = await getOrCreateAccount(req.clerkUserId!);
    const paid =
      account.paid ||
      (await reconcilePaddlePaidAccess(account).catch((error) => {
        req.log?.warn(
          { err: error, courseAccountId: account.id },
          "Unable to auto-reconcile Paddle access",
        );
        return false;
      }));
    res.json({
      authenticated: true,
      paid,
      account: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        paddleCustomerId: account.paddleCustomerId,
      },
    });
  } catch (error) {
    req.log?.error({ err: error }, "Unable to load course account");
    res.status(500).json({ error: "Unable to load your course account." });
  }
});

router.get(
  "/course/content",
  requireAuth,
  requirePaid,
  (_req: CourseRequest, res) => {
    res.json({ modules, finalExamQuestions, phaseGroups });
  },
);

router.post("/course/unlock", requireAuth, async (req: CourseRequest, res) => {
  const configuredCode = process.env.COURSE_ACCESS_CODE;
  const inputCode =
    typeof req.body?.code === "string" ? req.body.code.trim() : "";

  if (!configuredCode) {
    res.status(503).json({ error: "Course access is not configured yet." });
    return;
  }

  if (!inputCode || !codesMatch(inputCode, configuredCode)) {
    res.status(403).json({ error: "That access code is not valid." });
    return;
  }

  try {
    await getOrCreateAccount(req.clerkUserId!);
    const updated = await db
      .update(courseAccounts)
      .set({
        paid: true,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(courseAccounts.clerkUserId, req.clerkUserId!))
      .returning({ paid: courseAccounts.paid });

    res.json({ paid: updated[0]?.paid === true });
  } catch (error) {
    req.log?.error({ err: error }, "Unable to unlock course access");
    res.status(500).json({ error: "Unable to activate course access." });
  }
});

router.get(
  "/course/progress",
  requireAuth,
  requirePaid,
  async (req: CourseRequest, res) => {
    try {
      const account = await getOrCreateAccount(req.clerkUserId!);
      res.json({
        completedModules: account.completedModules,
        examScore: account.examScore,
        streak: account.streak,
      });
    } catch (error) {
      req.log?.error({ err: error }, "Unable to load course progress");
      res.status(500).json({ error: "Unable to load your progress." });
    }
  },
);

router.patch(
  "/course/progress",
  requireAuth,
  requirePaid,
  async (req: CourseRequest, res) => {
    const completedModules: number[] | null = Array.isArray(
      req.body?.completedModules,
    )
      ? (req.body.completedModules as unknown[]).filter(
          (value): value is number =>
            typeof value === "number" &&
            Number.isInteger(value) &&
            value >= 1 &&
            value <= 22,
        )
      : null;
    const examScore =
      req.body?.examScore === null ||
      (Number.isInteger(req.body?.examScore) &&
        req.body.examScore >= 0 &&
        req.body.examScore <= 100)
        ? req.body.examScore
        : undefined;
    const streak =
      Number.isInteger(req.body?.streak) && req.body.streak >= 0
        ? req.body.streak
        : undefined;

    if (!completedModules || examScore === undefined || streak === undefined) {
      res.status(400).json({ error: "Invalid progress payload." });
      return;
    }

    try {
      const normalizedModules = Array.from(new Set(completedModules!)).sort(
        (a, b) => a - b,
      );
      const updated = await db
        .update(courseAccounts)
        .set({
          completedModules: normalizedModules,
          examScore,
          streak,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(courseAccounts.clerkUserId, req.clerkUserId!))
        .returning();
      res.json({
        completedModules: updated[0]?.completedModules ?? [],
        examScore: updated[0]?.examScore ?? null,
        streak: updated[0]?.streak ?? 0,
      });
    } catch (error) {
      req.log?.error({ err: error }, "Unable to save course progress");
      res.status(500).json({ error: "Unable to save your progress." });
    }
  },
);

export default router;