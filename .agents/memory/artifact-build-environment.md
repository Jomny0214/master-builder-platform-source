---
name: Artifact build environment
description: Environment requirements for validating routed Vite artifacts locally
---

Routed Vite artifacts in this workspace require both `PORT` and `BASE_PATH` when running a production build outside the managed workflow.

**Why:** The shared Vite configuration intentionally fails fast when either value is missing, while the managed workflow supplies them automatically.

**How to apply:** For a local build, provide a valid port and the artifact's routed base path; do not change the app configuration just to make an ad hoc build run.

The workspace package install may need the online pnpm registry when offline metadata is missing, even if the required packages are already present in the shared cache.

**Why:** Filtered installs can resolve unrelated workspace catalog entries and package-firewall metadata before linking the target artifact.

**How to apply:** Try the filtered offline install first; if it fails on missing catalog or mirror metadata, use the normal filtered install rather than adding ad hoc dependency copies.