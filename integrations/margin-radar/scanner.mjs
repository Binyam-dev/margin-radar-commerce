// Autonomous CJ sourcing pipeline for Crossmart. No unverified item is sent to publishing.
export function score({cost, shipping, sellPrice, feeRate = .136, orderFee = .40, reserve = 2}) {
  for (const value of [cost, shipping, sellPrice, feeRate, orderFee, reserve]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid price input');
  }
  const landed = cost + shipping;
  const net = sellPrice * (1 - feeRate) - landed - orderFee - reserve;
  return {landed: +landed.toFixed(2), net: +net.toFixed(2), roi: landed ? +(net / landed).toFixed(3) : 0};
}

export function qualify({variant, inventory, freight, comparable, now = Date.now()}) {
  const reasons = [];
  const gtin = String(variant?.gtin ?? variant?.barcode ?? variant?.variantGtin ?? '').replace(/[^0-9]/g, '');
  const matchedGtin = String(comparable?.gtin ?? '').replace(/[^0-9]/g, '');
  if (!variant?.vid || !variant?.variantSku || !Number.isFinite(Number(variant.variantSellPrice))) reasons.push('variant missing');
  if (!inventory || Number(inventory.verifiedWarehouse) !== 1 || Number(inventory.cjInventory) < 2) reasons.push('CJ-managed stock under 2');
  if (!freight || !Number.isFinite(Number(freight.totalPostageFee ?? freight.logisticPrice))) reasons.push('freight unavailable');
  if (!gtin || !matchedGtin || gtin !== matchedGtin || !comparable || comparable.matchType !== 'EXACT_GTIN' || comparable.condition !== 'NEW' || comparable.currency !== 'USD' || !Number.isFinite(Number(comparable.price)) || Number(comparable.soldCount) < 3 || !Number.isFinite(Date.parse(comparable.observedAt)) || now - Date.parse(comparable.observedAt) > 86400000 || Date.parse(comparable.observedAt) > now) reasons.push('recent exact GTIN sold comparable missing');
  if (reasons.length) return {qualified:false,reasons};
  const result = score({cost:Number(variant.variantSellPrice),shipping:Number(freight.totalPostageFee ?? freight.logisticPrice),sellPrice:Number(comparable.price)});
  if (result.net < 5 || result.roi < .2) reasons.push('margin below $5 or 20% ROI');
  return {qualified:!reasons.length,reasons,...result};
}

export async function scan({cj, comparable, limit = 8, onCandidate = async () => {}, onRejected = async () => {}}) {
  const products = await cj.products({limit});
  const results = {scanned:0,qualified:0,rejected:0};
  for (const product of products.slice(0,limit)) {
    results.scanned++;
    try {
      const detail = await cj.detail(product.id);
      const variants = (detail.variants || []).flatMap(variant => (variant.inventories || [])
        .filter(inventory => ['US','CN'].includes(inventory.countryCode) && Number(inventory.verifiedWarehouse) === 1 && Number(inventory.cjInventory) >= 2)
        .map(inventory => ({variant,inventory})));
      let accepted = false;
      for (const {variant,inventory} of variants.slice(0,3)) {
        const match = await comparable.findExactSold({product,variant});
        if (!match) continue;
        const freight = (await cj.freight({vid:variant.vid,origin:inventory.countryCode})).sort((a,b) => Number(a.totalPostageFee ?? a.logisticPrice) - Number(b.totalPostageFee ?? b.logisticPrice))[0];
        const decision = qualify({variant,inventory,freight,comparable:match});
        if (decision.qualified) {
          await onCandidate({product,variant,inventory,freight,comparable:match,decision});
          results.qualified++; accepted = true; break;
        }
      }
      if (!accepted) {results.rejected++;await onRejected({product,reason:variants.length?'No variant met exact sold comparison and margin rules':'No verified CJ-managed stock'});}
    } catch (error) {results.rejected++;await onRejected({product,reason:String(error.message || error).slice(0,200)});}
  }
  return results;
}
