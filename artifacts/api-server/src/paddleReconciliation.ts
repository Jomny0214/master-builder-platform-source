import { and, eq, or } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type Transaction,
  type TransactionNotification,
} from "@paddle/paddle-node-sdk";
import { courseAccounts, db } from "@workspace/db";
import {
  getPaddleClient,
  getPaddlePriceId,
  getPaddleProductId,
} from "./paddleClient";

type PaddleAccount = {
  id: string;
  clerkUserId: string;
};

function getCheckoutSigningSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for Paddle checkout metadata.");
  }
  return secret;
}

function checkoutMetadataSignature(metadata: {
  clerkUserId: string;
  courseAccountId: string;
}) {
  const message = [
    metadata.clerkUserId,
    metadata.courseAccountId,
    getPaddleProductId(),
    getPaddlePriceId(),
  ].join(":");
  return createHmac("sha256", getCheckoutSigningSecret())
    .update(message)
    .digest("hex");
}

export function createCheckoutMetadata(account: PaddleAccount) {
  const metadata = {
    clerkUserId: account.clerkUserId,
    courseAccountId: account.id,
    productId: getPaddleProductId(),
    priceId: getPaddlePriceId(),
  };
  return {
    ...metadata,
    signature: checkoutMetadataSignature(metadata),
  };
}

function hasValidCheckoutMetadata(customData: Record<string, unknown>) {
  const clerkUserId =
    typeof customData.clerkUserId === "string" ? customData.clerkUserId : "";
  const courseAccountId =
    typeof customData.courseAccountId === "string"
      ? customData.courseAccountId
      : "";
  const signature =
    typeof customData.signature === "string" ? customData.signature : "";
  if (!clerkUserId || !courseAccountId || !signature) return false;

  const expected = checkoutMetadataSignature({
    clerkUserId,
    courseAccountId,
  });
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function transactionBelongsToAccount(
  transaction: TransactionNotification | Transaction,
  account: PaddleAccount,
) {
  const customData = transaction.customData;
  return (
    customData?.courseAccountId === account.id &&
    customData?.clerkUserId === account.clerkUserId &&
    hasValidCheckoutMetadata(customData)
  );
}

export async function grantPaddlePaidAccess(
  transaction: TransactionNotification | Transaction,
) {
  const customData = transaction.customData;
  const clerkUserId =
    typeof customData?.clerkUserId === "string"
      ? customData.clerkUserId
      : "";
  const courseAccountId =
    typeof customData?.courseAccountId === "string"
      ? customData.courseAccountId
      : "";

  if (!clerkUserId || !courseAccountId) {
    throw new Error("Paddle transaction is missing account metadata.");
  }
  if (!hasValidCheckoutMetadata(customData ?? {})) {
    throw new Error("Paddle transaction metadata could not be verified.");
  }

  const productId = getPaddleProductId();
  const priceId = getPaddlePriceId();
  const hasExpectedCoursePrice = transaction.items.some(
    (item) =>
      item.price?.id === priceId &&
      item.price.productId === productId &&
      item.quantity === 1,
  );
  if (!hasExpectedCoursePrice) {
    throw new Error("Paddle transaction does not contain the course price.");
  }

  await db
    .update(courseAccounts)
    .set({
      paid: true,
      paddleTransactionId: transaction.id,
      paddleCustomerId: transaction.customerId ?? null,
      paidAt: new Date(),
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(courseAccounts.id, courseAccountId),
        eq(courseAccounts.clerkUserId, clerkUserId),
        or(
          eq(courseAccounts.paid, false),
          eq(courseAccounts.paddleTransactionId, transaction.id),
        ),
      ),
    );
}

export async function reconcilePaddlePaidAccess(
  account: PaddleAccount,
  transactionId?: string,
) {
  const transaction = transactionId
    ? await getPaddleClient().transactions.get(transactionId)
    : (
        await getPaddleClient().transactions
          .list({ perPage: 200, orderBy: "created_at[DESC]" })
          .next()
      ).find(
        (candidate) =>
          candidate.status === "completed" &&
          transactionBelongsToAccount(candidate, account),
      );

  if (
    !transaction ||
    transaction.status !== "completed" ||
    !transactionBelongsToAccount(transaction, account)
  ) {
    return false;
  }

  await grantPaddlePaidAccess(transaction);
  return true;
}