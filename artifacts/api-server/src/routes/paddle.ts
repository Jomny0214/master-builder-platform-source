import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  EventName,
  type AdjustmentNotification,
  type TransactionNotification,
} from "@paddle/paddle-node-sdk";
import { courseAccounts, db } from "@workspace/db";
import {
  getPaddleClient,
  getPaddleClientToken,
  getPaddleEnvironmentName,
  getPaddlePriceId,
  getPaddleProductId,
  getPaddleWebhookSecret,
} from "../paddleClient";
import { getPaddleAccessChange } from "../paddleAccessPolicy";
import {
  createCheckoutMetadata,
  grantPaddlePaidAccess,
  reconcilePaddlePaidAccess,
} from "../paddleReconciliation";
import {
  getOrCreateAccount,
  requireAuth,
  type CourseRequest,
} from "./course";

const router: IRouter = Router();

function debugText(value: unknown, maxLength = 2_000) {
  if (typeof value !== "string") return undefined;
  return value.slice(0, maxLength);
}

async function setPaddleAccessState(
  transactionId: string,
  paid: boolean,
) {
  await db
    .update(courseAccounts)
    .set({
      paid,
      ...(paid
        ? { lastActiveAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(courseAccounts.paddleTransactionId, transactionId),
        eq(courseAccounts.paid, !paid),
      ),
    );
}

async function applyPaddleAdjustment(
  adjustment: AdjustmentNotification,
) {
  const accessChange = getPaddleAccessChange(
    adjustment.action,
    adjustment.status,
  );
  if (accessChange === "revoke") {
    await setPaddleAccessState(adjustment.transactionId, false);
    return;
  }

  if (accessChange === "restore") {
    await setPaddleAccessState(adjustment.transactionId, true);
  }
}

export async function handlePaddleWebhook(
  rawBody: Buffer,
  signature: string,
) {
  const webhookSecret = getPaddleWebhookSecret();

  const event = await getPaddleClient().webhooks.unmarshal(
    rawBody.toString("utf8"),
    webhookSecret,
    signature,
  );
  const eventName = event.eventType as EventName;

  if (
    eventName === EventName.AdjustmentCreated ||
    eventName === EventName.AdjustmentUpdated
  ) {
    await applyPaddleAdjustment(
      (event as { data: AdjustmentNotification }).data,
    );
    return;
  }

  if (
    eventName !== EventName.TransactionPaid &&
    eventName !== EventName.TransactionCompleted
  ) {
    return;
  }

  const transaction = (event as { data: TransactionNotification }).data;
  if (
    transaction.status !== "paid" &&
    transaction.status !== "completed"
  ) {
    return;
  }

  await grantPaddlePaidAccess(transaction);
}

router.get(
  "/paddle/config",
  requireAuth,
  (_req: CourseRequest, res) => {
    try {
      const productId = getPaddleProductId();
      const priceId = getPaddlePriceId();
      res.json({
        clientToken: getPaddleClientToken(),
        environment: getPaddleEnvironmentName(),
        productId,
        priceId,
      });
    } catch (error) {
      res.status(503).json({ error: "Paddle checkout is not configured." });
    }
  },
);

router.post(
  "/paddle/checkout",
  requireAuth,
  async (req: CourseRequest, res) => {
    try {
      const productId = getPaddleProductId();
      const priceId = getPaddlePriceId();
      const account = await getOrCreateAccount(req.clerkUserId!);
      if (account.paid) {
        res.json({ alreadyPaid: true });
        return;
      }

      const price = await getPaddleClient().prices.get(priceId);
      if (price.status !== "active" || price.productId !== productId) {
        req.log?.error(
          {
            configuredPriceId: priceId,
            configuredProductId: productId,
            actualPriceId: price.id,
            actualProductId: price.productId,
            priceStatus: price.status,
          },
          "Paddle catalog configuration is invalid",
        );
        res.status(503).json({
          error: "The Paddle course price is not active or does not belong to the configured course product.",
        });
        return;
      }

      res.json({
        clientToken: getPaddleClientToken(),
        environment: getPaddleEnvironmentName(),
        productId,
        priceId,
        customData: createCheckoutMetadata(account),
      });
    } catch (error) {
      req.log?.error({ err: error }, "Unable to prepare Paddle Checkout");
      res.status(500).json({ error: "Unable to start checkout. Try again." });
    }
  },
);

router.post(
  "/paddle/reconcile",
  requireAuth,
  async (req: CourseRequest, res) => {
    try {
      const account = await getOrCreateAccount(req.clerkUserId!);
      if (account.paid) {
        res.json({ paid: true });
        return;
      }

      const requestedTransactionId =
        typeof req.body?.transactionId === "string"
          ? req.body.transactionId.trim()
          : "";
      if (
        requestedTransactionId &&
        !/^txn_[a-z0-9]+$/.test(requestedTransactionId)
      ) {
        res.status(400).json({ error: "Invalid Paddle transaction ID." });
        return;
      }

      const paid = await reconcilePaddlePaidAccess(
        account,
        requestedTransactionId || undefined,
      );
      if (!paid) {
        res.status(409).json({ paid: false });
        return;
      }

      req.log?.info(
        {
          transactionId: requestedTransactionId || undefined,
          courseAccountId: account.id,
        },
        "Reconciled completed Paddle transaction",
      );
      res.json({ paid: true });
    } catch (error) {
      req.log?.error({ err: error }, "Unable to reconcile Paddle transaction");
      res.status(500).json({ error: "Unable to confirm the completed payment." });
    }
  },
);

router.post(
  "/paddle/checkout-debug",
  requireAuth,
  (req: CourseRequest, res) => {
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const diagnostic = {
      phase: debugText(body.phase, 80),
      eventName: debugText(body.eventName, 120),
      name: debugText(body.name, 120),
      code: debugText(body.code, 120),
      type: debugText(body.type, 120),
      documentationUrl: debugText(body.documentationUrl, 500),
      message: debugText(body.message, 2_000),
      stack: debugText(body.stack, 4_000),
    };

    req.log?.error(
      { paddleCheckoutDebug: diagnostic },
      "Paddle checkout client error",
    );
    res.status(204).end();
  },
);

export default router;