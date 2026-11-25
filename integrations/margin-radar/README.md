# Margin Radar integration

This standalone Node 24 worker scans CJ products on a recurring interval and creates **drafts with zero sellable stock** in Crossmart only after an exact, recent sold comparable and a verified landed-cost margin pass. It does not publish a listing or pay CJ. A missing comparable provider causes zero candidates; public advertised prices are not treated as sold evidence.

Run `node --test integrations/margin-radar/scanner.test.mjs` and `node integrations/margin-radar/run.mjs --once` from the repository root. Omit `--once` to repeat every 60 minutes (minimum 30).

Environment variables: `CJ_API_KEY` (required, secret); `EXACT_SOLD_FEED_URL` (provider returning `{matchType:"EXACT_GTIN",gtin,condition:"NEW",currency:"USD",price,soldCount,observedAt}` for query parameters `cjProductId` and `cjVariantId`); optional `EXACT_SOLD_FEED_TOKEN`; `CROSSMART_API_URL` ending in `/api/v1`, `CROSSMART_API_KEY`, `CROSSMART_WORKSPACE_ID` for draft import; optional `SCAN_INTERVAL_MINUTES`, `SCAN_PRODUCTS_PER_CYCLE` (defaults 8). The CJ variant must contain an identical GTIN or it is rejected. Never store tokens in this repository.

Before this can run in production, connect a licensed sold-comparable source with exact variant identifiers, deploy Crossmart's API, PostgreSQL, Redis, and worker, and connect an eBay account with its own developer credentials. The existing Margin Radar Site uses CJ's eBay authorization, which is a separate integration. A Crossmart draft with quantity zero must never be published as a stocked offer; supplier stock requires a separate verified synchronization and order payment path.
