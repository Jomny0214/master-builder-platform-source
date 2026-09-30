---
name: Paddle Sandbox initialization
description: Paddle.js requires an explicit Sandbox environment selection before initialization.
---

Paddle.js Sandbox integrations must call `Paddle.Environment.set("sandbox")` as a separate statement before `Paddle.Initialize({ token })`. Passing the environment through initialization options alone is not sufficient for this integration.

**Why:** Sandbox credentials can otherwise be treated as production credentials, producing a generic checkout failure even though the API returns a valid client token.

**How to apply:** Keep environment selection immediately before the one-time Paddle initialization, validate the server response is Sandbox before opening checkout, and use a Sandbox client-side token with the `test_` prefix.

Paddle's `checkout.error` event with `type: "front-end_error"` indicates an integration or Paddle.js setup problem; `api_error` indicates a Paddle API rejection. The event's `detail` and `documentation_url` fields are more useful than the generic visible checkout message.

**Why:** The course checkout API returned 200, but Paddle.js emitted `front-end_error` with `Network Error`; the first diagnostic parser missed the nested `detail` fields.

**How to apply:** Capture `type`, `code`, `detail`, and `documentation_url` from Paddle events before changing server payment logic.

Paddle Sandbox checkout also requires a default payment link in the Sandbox account settings, even when checkout is opened with Paddle.js items. The API error is `transaction_default_checkout_url_not_set`.

**Why:** The corrected client token reached Paddle successfully, which exposed the account-level checkout setting that had been hidden behind the earlier token and generic network errors.

**How to apply:** Configure the Sandbox default payment link at `https://sandbox-vendors.paddle.com/checkout-settings` before testing browser checkout. A Sandbox URL may use the Replit preview domain or localhost.