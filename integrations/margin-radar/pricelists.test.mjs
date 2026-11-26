import test from 'node:test';
import assert from 'node:assert/strict';
import {researchOffers} from './pricelists.mjs';

test('rejects unidentified variants without contacting feed', async () => {
  const result = await researchOffers({variantSku:'cup'}, {request: () => {throw Error('called');}});
  assert.equal(result.status, 'NO_GTIN');
});

test('keeps only recent in-stock exact GTIN advertised offers', async () => {
  const now = Date.parse('2026-11-26T00:00:00Z');
  const request = async url => {
    assert.match(url, /\/by-gtin\/1234567890123$/);
    return {ok:true,json:async()=>({data:{offers:[
      {price:12,currency:'USD',in_stock:true,merchant:{name:'Shop'},last_seen_at:'2026-11-25T23:00:00Z'},
      {price:30,in_stock:true,merchant:{name:'Old'},last_seen_at:'2026-11-20T00:00:00Z'},
      {price:9,in_stock:false,merchant:{name:'Gone'},last_seen_at:'2026-11-25T23:00:00Z'}
    ]}})};
  };
  const result = await researchOffers({gtin:'1234567890123'},{request,now});
  assert.equal(result.status,'RECENT_OFFERS');
  assert.equal(result.offers.length,1);
  assert.equal(result.evidenceType,'ADVERTISED_OFFER');
});
