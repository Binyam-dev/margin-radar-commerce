# Live activation status (2026-11-25)

Crossmart is forked into this repository. `integrations/margin-radar` contains a CJ product scanner and strict candidate gate. The test suite passes, and the runner is designed to create zero-stock Crossmart drafts only after exact GTIN sold-comparable evidence, variant stock, shipping, fees and minimum margin are present.

## Remaining connections

1. **Sold-price evidence:** eBay Marketplace Insights API is restricted and not open to new users. Provide an authorized exact-GTIN sold-data feed (the scanner's `EXACT_SOLD_FEED_URL`) or change the strategy to a clearly labeled active-listing estimate; do not call estimates verified profit.
2. **Crossmart runtime:** deploy API, worker, Postgres and Redis. The dashboard alone does not schedule scans; run the scanner as a hosted cron or persistent process. A hosted cron must have `CJ_API_KEY`, `CROSSMART_API_URL`, `CROSSMART_API_KEY` and the evidence feed configured as secrets.
3. **Marketplace authorization:** Crossmart's direct eBay channel requires its own eBay Developer production client ID, secret, RuName, account-deletion verification token, and the seller OAuth connection. CJ eBay authorization is separate. Other channels have their own credentials and seller approvals.
4. **Fulfillment:** verify the supplier's dropship and marketplace terms, actual variant stock and ship-to quote, shipping policy, returns, sales tax, and order-routing capability for each listing. No retail-to-retail forwarding is enabled.
5. **Payments:** complete the marketplace payout and account checks before attempting a real sale.

No opportunity is presently qualified. No Crossmart service is deployed, no listing is published, and no order has been routed. Do not enable automatic publishing until an end-to-end sandbox order and a real supplier fulfillment path have been verified.

The current private Margin Radar dashboard remains a research and CJ data view. It should not display a live-revenue claim until these gates are cleared.
