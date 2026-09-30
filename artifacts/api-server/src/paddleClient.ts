import {
  Environment,
  LogLevel,
  Paddle,
} from "@paddle/paddle-node-sdk";

export type PaddleEnvironmentName = "sandbox" | "production";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Paddle checkout.`);
  return value;
}

export function getPaddleEnvironmentName(): PaddleEnvironmentName {
  const environment = process.env.PADDLE_ENV?.trim();
  if (environment === "sandbox" || environment === "production") {
    return environment;
  }
  throw new Error('PADDLE_ENV must be either "sandbox" or "production".');
}

export function getPaddleProductId() {
  return requiredEnv("PADDLE_PRODUCT_ID");
}

export function getPaddlePriceId() {
  return requiredEnv("PADDLE_PRICE_ID");
}

export function getPaddleClient() {
  const environment = getPaddleEnvironmentName();
  const apiKey = requiredEnv(
    environment === "production" ? "PADDLE_LIVE_API_KEY" : "PADDLE_API_KEY",
  );

  return new Paddle(apiKey, {
    environment:
      environment === "production"
        ? Environment.production
        : Environment.sandbox,
    logLevel: LogLevel.error,
  });
}

export function getPaddleClientToken() {
  const environment = getPaddleEnvironmentName();
  const clientToken = requiredEnv(
    environment === "production"
      ? "PADDLE_LIVE_CLIENT_TOKEN"
      : "PADDLE_CLIENT_TOKEN",
  );
  const expectedPrefix = environment === "production" ? "live_" : "test_";
  if (!clientToken.startsWith(expectedPrefix)) {
    throw new Error(
      `Paddle client-side token must start with ${expectedPrefix} in ${environment}.`,
    );
  }
  return clientToken;
}

export function getPaddleWebhookSecret() {
  const environment = getPaddleEnvironmentName();
  return requiredEnv(
    environment === "production"
      ? "PADDLE_LIVE_WEBHOOK_SECRET"
      : "PADDLE_WEBHOOK_SECRET",
  );
}