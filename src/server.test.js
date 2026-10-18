import {describe,it,expect} from 'vitest'
import {createServer} from './server.js'
const mk=()=>createServer({seed:false})
const base=s=>s.create('u1',{title:'Refund dispute',team:'ops',priority:'high'})
describe('concurrency',()=>{
 it('only one of two simultaneous claims wins',()=>{const s=mk(),i=base(s);s.claim('u2',i.id)
  expect(()=>s.claim('u1',i.id)).toThrow(/Already claimed/);expect(s.get('u1',i.id).item.assigneeId).toBe('u2')})
 it('stale version is rejected and returns current state',()=>{const s=mk(),i=base(s);s.claim('u1',i.id)
  try{s.setPriority('u1',i.id,{version:1,priority:'low'});throw 0}catch(e){expect(e.code).toBe('conflict');expect(e.current.version).toBe(2)}})
})
describe('idempotency',()=>{
 it('repeated create with same key makes one item',()=>{const s=mk();const a=s.create('u1',{title:'x',team:'ops',key:'k'}),b=s.create('u1',{title:'x',team:'ops',key:'k'})
  expect(a.id).toBe(b.id);expect(s.list('u1').total).toBe(1)})
 it('repeated transition with same key writes one audit event',()=>{const s=mk(),i=base(s);s.claim('u1',i.id)
  s.transition('u1',i.id,{version:2,to:'resolved',key:'t1'});s.transition('u1',i.id,{version:2,to:'resolved',key:'t1'})
  expect(s._audit.filter(e=>e.type==='status_changed').length).toBe(1)})
})
describe('authorization & workflow',()=>{
 it('viewer cannot create or claim; outsider cannot see',()=>{const s=mk();expect(()=>s.create('u4',{title:'x',team:'eng'})).toThrow(/Requires member/)
  const i=base(s);expect(()=>s.get('u3',i.id)).toThrow(/not found/);expect(()=>s.claim('u4',i.id)).toThrow(/Requires member/)})
 it('member cannot approve; lead can; illegal jumps rejected',()=>{const s=mk(),i=base(s);s.claim('u2',i.id)
  s.transition('u2',i.id,{version:2,to:'needs_approval'});expect(()=>s.transition('u2',i.id,{version:3,to:'resolved'})).toThrow()
  expect(s.transition('u1',i.id,{version:3,to:'resolved'}).status).toBe('resolved')
  expect(()=>s.transition('u1',i.id,{version:4,to:'open'})).toThrow(/Cannot move/)})
})
describe('async outbox',()=>{
 it('failed deliveries retry; no duplicate notifications',()=>{const s=mk(),i=base(s);s.claim('u2',i.id)
  s.processOutbox({fail:()=>true});expect(s.notifications('u1').length).toBe(0)
  s.processOutbox();s.processOutbox();const n=s.notifications('u1').filter(x=>x.itemId===i.id);expect(new Set(n.map(x=>x.id)).size).toBe(n.length)})
})
