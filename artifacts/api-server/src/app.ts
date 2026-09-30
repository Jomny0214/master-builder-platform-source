import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { handlePaddleWebhook } from "./routes/paddle";

const app: Express = express();

function trustedOrigins() {
  return new Set(
    (process.env.REPLIT_DOMAINS || "")
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean)
      .map((domain) => `https://${domain}`),
  );
}

app.post(
  ["/api/webhooks/paddle", "/api/paddle/webhook"],
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.get("paddle-signature");
    if (!signature) {
      res.status(400).json({ error: "Missing Paddle signature." });
      return;
    }

    try {
      await handlePaddleWebhook(req.body as Buffer, signature);
      res.json({ received: true });
    } catch (error) {
      logger.error({ err: error }, "Paddle webhook rejected");
      res.status(400).json({ error: "Webhook verification failed." });
    }
  },
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || trustedOrigins().has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);
app.use((req, res, next) => {
  const origin = req.get("origin");
  const changesState = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (changesState && origin && !trustedOrigins().has(origin)) {
    res.status(403).json({ error: "Origin is not allowed." });
    return;
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
