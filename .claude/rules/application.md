---
paths:
  - "app/**"
  - "components/**"
  - "lib/**"
---

# CMS application rules

- Preserve setup-state gates, authentication, permissions, licensing, administrator authorization, and rate limits on the server.
- Sanitize rich text and imported content; validate uploads, archives, CSV/XLSX data, and API payloads.
- Reuse existing content-type, editor, theme, storage, and integration abstractions.
- Preserve money representation and tested price-direction behavior.
- Keep secrets and privileged database/storage/mail operations out of browser code.
