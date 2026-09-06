'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const a=require('../services/activity');
const {alertText}=require('../services/activityTelegram');
process.env.ACTIVITY_SIGNING_SECRET='test-only-secret-with-at-least-32-characters';
test('consent, bots and public page allowlist fail closed',()=>{
  for(const body of [{page:'/'},{page:'/',consent:'denied'},{page:'/admin',consent:'granted'},{page:'/?password=secret',consent:'granted'}]) assert.equal(a.safeEvent(body),null);
  assert.equal(a.safeEvent({page:'/',consent:'granted'},'Googlebot'),null);
});
test('arbitrary payloads and raw headers cannot enter safe metadata',()=>{
  const safe=a.safeEvent({page:'/',consent:'granted',password:'secret',seed:'secret',metadata:{cookie:'secret'},ip:'1.2.3.4'},'Chrome secret');
  assert.deepEqual(safe,{page:'/',device:'Desktop',browser:'Chrome',os:'Other',consent:'granted'});
});
test('signed state rejects tampering and expiration',()=>{
  const state=a.signState(17);
  assert.equal(a.verifyState(state).referral,17);
  assert.equal(a.verifyState(state+'x'),null);
  assert.equal(a.verifyState(state+'.extra'),null);
  const old=Date.now; Date.now=()=>old()+2*86400000;
  try { assert.equal(a.verifyState(state),null); } finally {Date.now=old;}
});
test('Level 2 scope cannot be overridden by query parameters',()=>{
  const f=a.filters({id:2,role:'level2'},{operator:1,referral:"' OR 1=1",role:'level1'});
  assert.match(f.sql,/scoped.operator_id = \?/);
  assert.equal(f.params[0],2);
  assert.ok(!f.sql.includes("' OR 1=1"));
  assert.throws(()=>a.level1({role:'level2'}),{status:403});
});
test('alert formatter omits session, submitted content, chat and raw IP',()=>{
  const text=alertText({id:'evt_1',event_type:'visit',created_at:new Date(),device:'Mobile',browser:'Chrome',password:'secret',ip:'1.2.3.4',session_id:'secret',chat_id:'secret'});
  assert.ok(!text.includes('secret')); assert.ok(!text.includes('1.2.3.4')); assert.match(text,/Referral: Direct/);
});
