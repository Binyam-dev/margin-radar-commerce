# Self-hosted price history

The CJ scanner now records each returned variant price into SQLite before checking sales evidence. It emits `supplier_price_drop` when the observed price falls by at least 5% since the preceding observation for the same supplier, variant and currency. History starts with the first successful scan. This is supplier offer history, not marketplace sold history.

Use Node 24 and run:

```
node --test integrations/margin-radar/*.test.mjs
node integrations/margin-radar/run.mjs --once
```

Set `CJ_API_KEY` as a server secret. Set `PRICE_HISTORY_DB` to a path on persistent storage, for example `/var/lib/margin-radar/prices.sqlite`. Omit `--once` for the existing recurring loop. Keep one writer process per database; retain the SQLite database, WAL and SHM files together for backups made while running, or close the process before copying. The local default is `./data/margin-radar/prices.sqlite`.

No Keepa subscription or new npm dependency is required. A machine and persistent storage must remain available for recurring scans. The current scanner samples up to 20 CJ products per cycle; it does not yet cover the whole catalog or collect prices from Amazon, Walmart, Best Buy or eBay. Source adapters, pagination and a dashboard history view remain to be implemented. Existing exact sold-evidence gates stay in place, so supplier price changes alone never qualify a profitable listing.

Use only source feeds and page access permitted for the deployment. Do not bypass sign-in, CAPTCHA or access restrictions. Crossmart publishing and supplier order routing are separate activation steps.
