import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PriceHistory} from './price-history.mjs';

test('keeps history after restart and compares only the same source, variant and currency',()=>{
  const dir=mkdtempSync(join(tmpdir(),'radar-history-'));
  const path=join(dir,'prices.sqlite');
  const row={source:'CJ',productId:'p1',variantId:'v1',currency:'USD',price:10};
  let store=new PriceHistory(path);
  try {
    assert.equal(store.record(row).previousPrice,null);
    store.record({...row,currency:'EUR',price:50});
    store.record({...row,variantId:'v2',price:99});
    store.close();store=new PriceHistory(path);
    assert.deepEqual(store.record({...row,price:8}),{price:8,previousPrice:10,dropPercent:20});
    const history=store.history(row);
    assert.equal(history.length,2);
    assert.equal(history[0].evidenceType,'SUPPLIER_OFFER');
    assert.throws(()=>store.record({...row,price:NaN}));
    assert.throws(()=>store.record({...row,price:-1}));
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
