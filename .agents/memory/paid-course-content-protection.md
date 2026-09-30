---
name: Paid course content protection
description: The commercial course must keep lesson and exam content behind authenticated paid access.
---

Paid course content must be delivered from a server endpoint protected by both authentication and the account's paid state; the public browser bundle should contain only types and paywall UI.

**Why:** Client-side route guards do not protect content that has already been included in JavaScript. Anyone can download and inspect a public bundle, even when every visible course route redirects unpaid users.

**How to apply:** Keep the content source server-side, require paid access on the content endpoint, and verify unauthenticated requests return 401/403 while the built client assets contain no lesson or exam text.