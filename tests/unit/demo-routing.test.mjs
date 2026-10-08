import test from 'node:test';
import assert from 'node:assert/strict';
import {demoDepartmentWorking,demoRoutingApplies,demoRequestReady,validDemoTimeZone} from '../../lib/demo-routing.mjs';
test('08:00 is inclusive; 17:00 is exclusive in the selected demo time zone',()=>{
 for(const [iso,expected] of [['2026-10-08T05:59:59Z',false],['2026-10-08T06:00:00Z',true],['2026-10-08T14:59:59Z',true],['2026-10-08T15:00:00Z',false]]) assert.equal(demoDepartmentWorking('Europe/Berlin',new Date(iso)),expected);
});
test('Australia and Germany route the same instant according to their local shift',()=>{
 const now=new Date('2026-10-08T22:00:00Z');
 assert.equal(demoDepartmentWorking('Australia/Sydney',now),true);
 assert.equal(demoDepartmentWorking('Europe/Berlin',now),false);
});
test('future-day requests wait until the following local day at 08:00',()=>{
 const r={serviceTime:'tomorrow',createdAtIso:'2026-10-08T08:00:00Z'};
 assert.equal(demoRequestReady(r,'Europe/Berlin',new Date('2026-10-08T09:00:00Z')),false);
 assert.equal(demoRequestReady(r,'Europe/Berlin',new Date('2026-10-09T05:59:00Z')),false);
 assert.equal(demoRequestReady(r,'Europe/Berlin',new Date('2026-10-09T06:00:00Z')),true);
});
test('browser-zone override cannot affect a real hotel or non-test request',()=>{
 assert.equal(demoRoutingApplies('aquamarine',true,'901'),false);
 assert.equal(demoRoutingApplies('demo',false,'901'),false);
 assert.equal(demoRoutingApplies('demo',true,'902'),false);
 assert.equal(demoRoutingApplies('demo',true,'901'),true);
 assert.equal(validDemoTimeZone('invalid/zone'),null);
});
