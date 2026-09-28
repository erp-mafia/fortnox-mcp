# Alectiv notes

This repo is a working fork of [erp-mafia/fortnox-mcp](https://github.com/erp-mafia/fortnox-mcp) (hosted at `https://fortnox-mcp.vercel.app/mcp`).

Goal: keep using their remote Fortnox OAuth app (no Alectiv Fortnox developer application), and ship receipt upload upstream so the hosted server gets `fortnox_upload_receipt`.

Local changes vs upstream:
- Expanded `FORTNOX_SCOPES` with `supplierinvoice`, `inbox`, `connectfile`, `archive`
- Added receipt upload tools + multipart helper in `src/services/api.ts`

Until the PR is merged and redeployed, Cursor should keep using the remote URL. Receipt upload will 403 until scopes are live and you re-authorize.
