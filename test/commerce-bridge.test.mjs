import test from 'node:test';
import assert from 'node:assert/strict';
import {commerceOrderPayload} from '../cloudflare/src/commerce-bridge.mjs';

const paid=()=>({
  orderId:'12345678',sellerId:'seller-1',status:'paid',
  paymentApproved:true,paymentRejected:false,cancelled:false,fraudRisk:false,
  buyerFirstName:'Comprador',
  raw:{currency_id:'BRL',order_items:[{item:{id:'MLB99999999'},quantity:1}]}
});
test('P5: creates a signed-ready purchase envelope only from paid order and approved item mapping',()=>{
  const result=commerceOrderPayload(paid(),'seller-1',{'MLB99999999':'ARTISYS-PDV-NEXUS'},'Cliente@example.com');
  assert.equal(result.source,'mercadolivre');
  assert.equal(result.seller,'seller-1');
  assert.equal(result.paymentConfirmed,true);
  assert.deepEqual(result.lines,[{id:'MLB99999999',sku:'ARTISYS-PDV-NEXUS',quantity:1}]);
  assert.equal(result.email,'cliente@example.com');
});
test('P5: rejects pending, cancelled, fraud, wrong seller and unknown SKU without issuing',()=>{
  for(const patch of [{status:'pending'},{cancelled:true},{fraudRisk:true},{paymentApproved:false},{paymentRejected:true}]){
    assert.equal(commerceOrderPayload({...paid(),...patch},'seller-1',{'MLB99999999':'ARTISYS-PDV-NEXUS'},'buyer@example.com').error,'payment_not_eligible');
  }
  assert.equal(commerceOrderPayload(paid(),'another-seller',{},'buyer@example.com').error,'wrong_seller');
  assert.equal(commerceOrderPayload(paid(),'seller-1',{},'buyer@example.com').error,'no_mapped_software_items');
  assert.equal(commerceOrderPayload(paid(),'seller-1',{'MLB99999999':'ARTISYS-PDV-NEXUS'},'').error,'buyer_email_not_verified');
});
