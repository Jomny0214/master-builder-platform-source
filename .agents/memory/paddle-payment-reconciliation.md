---
name: Paddle payment reconciliation
description: Security rule for recovering paid access when Paddle webhook delivery misses the production account.
---

Keep the authenticated server-side Paddle transaction reconciliation path as a fallback to webhook delivery. It must fetch the transaction from Paddle, require completed status, verify the configured product and price, verify signed checkout metadata, and confirm the Clerk user and course account ownership before granting access.

**Why:** Sandbox checkout completed successfully while webhook delivery targeted the wrong environment, leaving the production account unpaid. Client-side checkout completion alone is not trustworthy, but Paddle API verification provides a secure recovery path.

**How to apply:** Run reconciliation after `checkout.completed`, when an unpaid account opens the paywall, and inside the authenticated server-side course-access check. This server check ensures stale browser tabs still recover. Never grant access solely from a Paddle.js browser event or an unverified transaction ID.