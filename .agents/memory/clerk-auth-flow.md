---
name: Clerk verification flow
description: Stable routing callbacks and controlled code sending prevent Clerk verification transactions from being replaced during auth and focus-state updates.
---

The Clerk provider's custom `routerPush` and `routerReplace` callbacks must remain referentially stable. Recreating them on provider rerenders can make hosted sign-in or sign-up verification state look like a new flow when Clerk reacts to browser focus or auth-state changes.

**Why:** The verification transaction belongs to Clerk's hosted UI, so app code cannot safely resend or restore it after the widget is reinitialized. Stable navigation callbacks remove an avoidable app-level trigger.

**How to apply:** Keep one top-level `ClerkProvider`, preserve the wildcard `/sign-in/*?` and `/sign-up/*?` routes, and wrap custom router callbacks in `useCallback` with only the router setter dependency.

Clerk's current email/SMS verification guidance says a code remains valid for 10 minutes; the prebuilt UI's resend cooldown is 30 seconds. The hosted verification view prepares a code when it mounts, so a remount can send a replacement and make a user-visible code appear to expire immediately.

**Why:** The live managed environment showed no short expiration override, while the reported 3–4 second failure pattern is consistent with repeated preparation or replacement rather than Clerk's normal TTL.

**How to apply:** For this course platform, keep verification preparation explicit and one-shot, expose the returned `expireAt` when available, preserve the in-progress transaction across reloads, and allow resend only after the 30-second cooldown.

The Replit preview's automated Chromium session cannot complete this development instance's Turnstile CAPTCHA; Clerk rejects sign-up before sending any verification email.

**Why:** A Mailinator test attempt reached the sign-up form, but the inbox stayed empty and Clerk returned `captcha_missing_token` / “The CAPTCHA failed to load.”

**How to apply:** Treat headless-preview signup failures as CAPTCHA-environment failures, not verification-expiry evidence. Complete final code-validity tests in a normal browser or an isolated development configuration where CAPTCHA is intentionally disabled.