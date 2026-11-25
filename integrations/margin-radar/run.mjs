import {scan} from './scanner.mjs';

const base = 'https://developers.cjdropshipping.com/api2.0/v1';
const required = name => {const value=process.env[name];if(!value)throw new Error(name+' is required');return value;};
const interval = Math.max(30,Number(process.env.SCAN_INTERVAL_MINUTES)||60)*60000;
let accessToken, expires = 0;
async function token() {
  if (accessToken && Date.now() < expires) return accessToken;
  const response=await fetch(base+'/authentication/getAccessToken',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:required('CJ_API_KEY')})});
  const data=await response.json();if(!response.ok||!data.result||!data.data?.accessToken)throw Error('CJ authentication failed');
  accessToken=data.data.accessToken;expires=Date.parse(data.data.accessTokenExpiryDate)-60000;return accessToken;
}
async function cj(path,body) {
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'CJ-Access-Token':await token(),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok||data.result!==true)throw Error('CJ '+path.split('?')[0]+' error '+(data.code||response.status));return data.data;
}
const supplier={
  async products({limit}) {const data=await cj('/product/listV2?'+new URLSearchParams({page:'1',size:String(limit),verifiedWarehouse:'1',zonePlatform:'ebay'}));return (data.content||[]).flatMap(x=>x.productList||[]);},
  detail: id=>cj('/product/query?pid='+encodeURIComponent(id)),
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
  console.log(JSON.stringify({event:'scan_complete',at:new Date().toISOString(),...result}));
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
  required('CJ_API_KEY');
  do {try{await cycle();}catch(error){console.error(JSON.stringify({event:'scan_error',message:error.message}));process.exitCode=1;}
    if(process.argv.includes('--once'))break;
    await new Promise(resolve=>setTimeout(resolve,interval));
  } while(true);
}
