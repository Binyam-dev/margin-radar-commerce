import {scan} from './scanner.mjs';
import {PriceHistory} from './price-history.mjs';
import {researchOffers} from './pricelists.mjs';

const base = 'https://developers.cjdropshipping.com/api2.0/v1';
const required = name => {const value=process.env[name];if(!value)throw new Error(name+' is required');return value;};
const interval = Math.max(30,Number(process.env.SCAN_INTERVAL_MINUTES)||60)*60000;
const page = Number(process.env.SCAN_PAGE) || 1 + Math.floor(Date.now()/3600000)%5;
let accessToken, expires = 0;
let history;
let lastCall = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function token() {
  if (accessToken && Date.now() < expires) return accessToken;
  const response=await fetch(base+'/authentication/getAccessToken',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:required('CJ_API_KEY')})});
  const data=await response.json();if(!response.ok||!data.result||!data.data?.accessToken)throw Error('CJ authentication failed');
  accessToken=data.data.accessToken;expires=Date.parse(data.data.accessTokenExpiryDate)-60000;return accessToken;
}
async function cj(path,body) {
  for (let attempt=0; attempt<3; attempt++) {
    await pause(Math.max(0, 650-(Date.now()-lastCall)));
    lastCall=Date.now();
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'CJ-Access-Token':await token(),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(response.ok && data.result===true)return data.data;
    if(Number(data.code)!==1600200 && response.status!==429)throw Error('CJ '+path.split('?')[0]+' error '+(data.code||response.status));
    if(attempt===2)throw Error('CJ rate limit persisted for '+path.split('?')[0]);
    await pause((attempt+1)*5000);
  }
}
const supplier={
  async products({limit}) {const data=await cj('/product/listV2?'+new URLSearchParams({page:String(page),size:String(limit),verifiedWarehouse:'1',zonePlatform:'ebay'}));return (data.content||[]).flatMap(x=>x.productList||[]);},
  async detail(id) {
    const detail=await cj('/product/query?pid='+encodeURIComponent(id));
    let researched = 0;
    for (const variant of detail.variants || []) {
      const price=Number(variant.variantSellPrice);
      if (!variant.vid || !Number.isFinite(price) || price<=0) continue;
      const change=history.record({source:'CJ',productId:id,variantId:variant.vid,currency:'USD',price});
      if (change.dropPercent >= 5) console.log(JSON.stringify({event:'supplier_price_drop',variantId:variant.vid,...change,evidenceType:'SUPPLIER_OFFER'}));
      if (process.env.PRICELISTS_RESEARCH === '1' && researched < 2) {
        try {
          const lead = await researchOffers(variant);
          if (lead.status !== 'NO_GTIN') { researched++; await pause(1100); }
          if (lead.status === 'RECENT_OFFERS') console.log(JSON.stringify({event:'price_research',variantId:variant.vid,gtin:lead.gtin,offers:lead.offers,evidenceType:lead.evidenceType,publishable:false}));
        } catch (error) { console.error(JSON.stringify({event:'price_research_error',variantId:variant.vid,message:String(error.message).slice(0,120)})); }
      }
    }
    return detail;
  },
  freight: ({vid,origin})=>cj('/logistic/freightCalculate',{startCountryCode:origin,endCountryCode:'US',products:[{vid,quantity:1}]})
};
const comparator={async findExactSold({product,variant}) {
  // A configured provider must supply an exact, recent sold match. An advertised listing is not a sale.
  if(!process.env.EXACT_SOLD_FEED_URL)return null;
  const url=new URL(required('EXACT_SOLD_FEED_URL'));url.searchParams.set('cjProductId',product.id);url.searchParams.set('cjVariantId',variant.vid);
  const response=await fetch(url,{headers:{...(process.env.EXACT_SOLD_FEED_TOKEN?{authorization:'Bearer '+process.env.EXACT_SOLD_FEED_TOKEN}:{})}});
  if(!response.ok)throw Error('Sold-comparable provider HTTP '+response.status);
  return response.json();
}};
async function crossmartDraft({product,variant,inventory,comparable,decision}) {
  if(!process.env.CROSSMART_API_KEY || !process.env.CROSSMART_WORKSPACE_ID || !process.env.CROSSMART_API_URL)return;
  const endpoint=required('CROSSMART_API_URL').replace(/\/$/,'')+'/workspaces/'+encodeURIComponent(required('CROSSMART_WORKSPACE_ID'))+'/products';
  const response=await fetch(endpoint,{method:'POST',headers:{'x-api-key':required('CROSSMART_API_KEY'),'content-type':'application/json'},body:JSON.stringify({title:product.nameEn || product.productNameEn || 'CJ product',vendor:'CJdropshipping',status:'DRAFT',tags:['margin-radar','cj-supplier','margin-verified'],variants:[{sku:variant.variantSku,price:Number(comparable.price).toFixed(2),quantity:0}]})});
  // Crossmart's 409 means this SKU already exists; never create a duplicate or overstate stock.
  if(!response.ok && response.status!==409)throw Error('Crossmart draft import HTTP '+response.status);
  if(response.ok)console.log(JSON.stringify({event:'draft_created',sku:variant.variantSku,net:decision.net,origin:inventory.countryCode}));
}
async function cycle() {
  const result=await scan({cj:supplier,comparable:comparator,limit:Math.min(20,Math.max(1,Number(process.env.SCAN_PRODUCTS_PER_CYCLE)||8)),onCandidate:crossmartDraft,onRejected:({product,reason})=>console.log(JSON.stringify({event:'rejected',sku:product.sku||product.productSku,reason}))});
  console.log(JSON.stringify({event:'scan_complete',at:new Date().toISOString(),page,...result}));
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
  required('CJ_API_KEY');
  history=new PriceHistory(process.env.PRICE_HISTORY_DB || './data/margin-radar/prices.sqlite');
  do {try{await cycle();}catch(error){console.error(JSON.stringify({event:'scan_error',message:error.message}));process.exitCode=1;}
    if(process.argv.includes('--once'))break;
    await new Promise(resolve=>setTimeout(resolve,interval));
  } while(true);
}
