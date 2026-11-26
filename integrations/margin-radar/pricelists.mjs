// Public advertised offers are research evidence, never sold-price or fulfillment evidence.
const BASE = 'https://pricelists.org/api/v1';

export function exactGtin(variant) {
  const value = String(variant?.gtin ?? variant?.barcode ?? variant?.variantGtin ?? '').replace(/\D/g, '');
  return [8, 12, 13, 14].includes(value.length) ? value : null;
}

export async function researchOffers(variant, {request = fetch, now = Date.now()} = {}) {
  const gtin = exactGtin(variant);
  if (!gtin) return {status: 'NO_GTIN', offers: []};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await request(BASE + '/products/by-gtin/' + gtin, {headers: {accept: 'application/json'}, signal: controller.signal});
    if (response.status === 404) return {status: 'NO_MATCH', gtin, offers: []};
    if (!response.ok) throw new Error('Pricelists HTTP ' + response.status);
    const payload = await response.json();
    const product = payload.data || payload;
    const offers = (product.offers || []).filter(offer => {
      const seen = Date.parse(offer.last_seen_at || offer.updated_at || offer.last_changed_at);
      return offer.in_stock === true && Number.isFinite(Number(offer.price)) && Number(offer.price) > 0 &&
        offer.merchant?.name && Number.isFinite(seen) && seen <= now && now - seen <= 86400000;
    }).map(offer => ({merchant: offer.merchant.name, price: Number(offer.price), currency: offer.currency || product.currency || null, observedAt: offer.last_seen_at || offer.updated_at || offer.last_changed_at, url: offer.url}));
    return {status: offers.length ? 'RECENT_OFFERS' : 'NO_RECENT_OFFERS', gtin, offers, evidenceType: 'ADVERTISED_OFFER'};
  } finally { clearTimeout(timer); }
}
