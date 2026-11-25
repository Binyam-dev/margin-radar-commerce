import test from 'node:test';
import assert from 'node:assert/strict';
import {score,qualify,scan} from './scanner.mjs';

const now=Date.now();
const variant={vid:'cj-variant-1',variantSku:'CJ-ABC',variantSellPrice:7};
const inventory={countryCode:'US',verifiedWarehouse:1,cjInventory:12};
const freight={logisticPrice:3,logisticName:'Ground'};
const comparable={matchType:'EXACT_GTIN',condition:'NEW',currency:'USD',price:25,soldCount:5,observedAt:new Date(now-3600000).toISOString()};
test('fee, shipping and reserve enter net margin',()=>assert.deepEqual(score({cost:7,shipping:3,sellPrice:25}),{landed:10,net:9.2,roi:.92}));
test('requires exact sold evidence and real CJ-managed stock',()=>{
 assert.equal(qualify({variant,inventory,freight,comparable,now}).qualified,true);
 assert.equal(qualify({variant,inventory,freight,comparable:{...comparable,matchType:'TITLE_SIMILAR'},now}).qualified,false);
 assert.equal(qualify({variant,inventory:{...inventory,cjInventory:0},freight,comparable,now}).qualified,false);
 assert.equal(qualify({variant,inventory,freight,comparable:{...comparable,observedAt:new Date(now-90000000).toISOString()},now}).qualified,false);
});
test('pipeline imports a qualified candidate once and never imports an unmatched product',async()=>{
 let freightCalls=0;const imported=[];
 const cj={products:async()=>[{id:'one'},{id:'two'}],detail:async id=>({variants:[{...variant,vid:id,inventories:[inventory]}]}),freight:async()=>{freightCalls++;return [freight]}};
 const result=await scan({cj,comparable:{findExactSold:async({product})=>product.id==='one'?comparable:null},onCandidate:async c=>imported.push(c),limit:2});
 assert.deepEqual(result,{scanned:2,qualified:1,rejected:1});assert.equal(freightCalls,1);assert.equal(imported.length,1);
});
