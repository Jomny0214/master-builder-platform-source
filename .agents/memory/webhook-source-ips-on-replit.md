---
name: Webhook source IPs on Replit
description: Why provider source-IP allowlists cannot be enforced inside this project's Express webhook handlers.
---

Do not enforce Paddle's public webhook CIDRs inside the Express application. Replit's proxy terminates the public connection, and the app receives loopback/private proxy addresses rather than Paddle's original public source IP.

**Why:** A dynamic Paddle CIDR filter rejected a genuine successful sandbox checkout webhook. A diagnostic request showed only loopback and private addresses in both the socket-derived IP and forwarded chain. Removing the filter restored verified webhook delivery.

**How to apply:** Continue verifying Paddle's HMAC signature against the raw body. If source-IP filtering is required later, configure it at an upstream edge that sees the original client IP; do not recreate it in Express.