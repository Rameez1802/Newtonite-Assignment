// Simulated backend. All rules live HERE, never in the UI. Swap for a real API (see ENGINEERING_DECISIONS.md).
export class ApiError extends Error{
  constructor(code,message,extra={}){super(message);this.code=code;Object.assign(this,extra)}}
export const STATUSES=['open','in_progress','needs_approval','resolved','closed']
export const PRIORITIES=['low','medium','high','critical']
const FLOW={open:['in_progress'],in_progress:['open','needs_approval','resolved'],needs_approval:['in_progress','resolved'],resolved:['in_progress','closed'],closed:[]}
const RANK={viewer:0,member:1,lead:2}
const DAY=864e5
export const TEAMS=['ops','eng','finance']
const USERS=[
 {id:'u1',name:'Vedansh',teams:{ops:'lead',eng:'member'}},
 {id:'u2',name:'Shreya',teams:{ops:'member',finance:'member'}},
 {id:'u3',name:'Siddharth',teams:{eng:'lead',finance:'viewer'}},
 {id:'u4',name:'Rohan',teams:{eng:'viewer',ops:'viewer'}},
 {id:'u5',name:'Aisha',teams:{ops:'lead',eng:'lead',finance:'lead'}}]

export function createServer({seed=true,latency=0,now=()=>Date.now()}={}){
  const items=new Map(),audit=[],outbox=[],notes=[],noteKeys=new Set(),idem=new Map()
  let seq=1,iseq=1
  const user=id=>USERS.find(u=>u.id===id)||(()=>{throw new ApiError('unauthenticated','Unknown user')})()
  const role=(u,t)=>u.teams[t]||null
  const need=(u,t,min)=>{const r=role(u,t);if(r===null||RANK[r]<RANK[min])throw new ApiError('forbidden',`Requires ${min} role in ${t}`)}
  const find=(u,id)=>{const it=items.get(id);if(!it||role(u,it.team)===null)throw new ApiError('not_found','Work item not found');return it}
  const own=(u,it)=>it.assigneeId===u.id||role(u,it.team)==='lead'
  const perms=(u,it)=>{const r=RANK[role(u,it.team)];return{claim:r>=1&&!it.assigneeId&&it.status!=='closed',
    edit:r>=1&&own(u,it)&&it.status!=='closed',assign:r>=2,comment:r>=1,
    transitions:r>=1&&own(u,it)?FLOW[it.status].filter(s=>!(it.status==='needs_approval'&&s==='resolved')||r>=2):[]}}
  const reasons=(u,it)=>{const o=[];if(it.status==='closed'||it.status==='resolved')return o
    if(it.dueAt&&it.dueAt<now())o.push('Overdue')
    if(!it.assigneeId&&PRIORITIES.indexOf(it.priority)>=2)o.push('Unowned and urgent')
    if(it.status==='needs_approval'&&role(u,it.team)==='lead')o.push('Needs your approval')
    if(it.assigneeId===u.id&&it.status==='in_progress'&&now()-it.updatedAt>3*DAY)o.push('Stale for 3+ days');return o}
  const view=(u,it)=>({...it,assigneeName:it.assigneeId?user(it.assigneeId).name:null,reasons:reasons(u,it),can:perms(u,it)})
  const log=(it,actor,type,detail={})=>{const e={id:seq++,itemId:it.id,actor:actor.id,actorName:actor.name,type,detail,at:now()}
    audit.push(e);outbox.push({id:e.id,attempts:0,done:false})}   // same "transaction": event + outbox row
  const once=(key,fn)=>{if(key&&idem.has(key))return idem.get(key);const r=fn();if(key)idem.set(key,r);return r}
  const touch=it=>{it.version++;it.updatedAt=now()}
  const mutate=(uid,id,version,fn)=>{const u=user(uid),it=find(u,id)
    if(version!==it.version)throw new ApiError('conflict','This item changed since you loaded it.',{current:view(u,it)})
    fn(u,it);touch(it);return view(u,it)}
  const S={
    create(uid,{title,description='',team,priority='medium',dueAt=null,key}){const u=user(uid)
      return once(key,()=>{if(!title?.trim())throw new ApiError('invalid','Title is required')
        if(!PRIORITIES.includes(priority))throw new ApiError('invalid','Bad priority');need(u,team,'member')
        const it={id:'W-'+(1000+iseq++),title:title.trim(),description,team,priority,status:'open',assigneeId:null,creatorId:u.id,dueAt,version:1,createdAt:now(),updatedAt:now()}
        items.set(it.id,it);log(it,u,'created',{title:it.title,priority});return view(u,it)})},
    claim(uid,id,{version,key}={}){const u=user(uid),it=find(u,id);need(u,it.team,'member')
      return once(key,()=>{if(it.assigneeId===u.id)return view(u,it)      // idempotent re-claim
        if(it.assigneeId)throw new ApiError('conflict',`Already claimed by ${user(it.assigneeId).name}`,{current:view(u,it)})
        return mutate(uid,id,it.version,(u,it)=>{it.assigneeId=u.id;if(it.status==='open')it.status='in_progress';log(it,u,'claimed')})})},
    assign(uid,id,{version,assigneeId,key}){return once(key,()=>mutate(uid,id,version,(u,it)=>{need(u,it.team,'lead')
      if(assigneeId&&role(user(assigneeId),it.team)===null)throw new ApiError('invalid','Assignee is not on this team')
      log(it,u,'reassigned',{from:it.assigneeId,to:assigneeId});it.assigneeId=assigneeId||null}))},
    transition(uid,id,{version,to,key}){return once(key,()=>mutate(uid,id,version,(u,it)=>{
      if(!perms(u,it).transitions.includes(to))throw new ApiError(FLOW[it.status].includes(to)?'forbidden':'bad_transition',`Cannot move ${it.status} → ${to}`)
      log(it,u,'status_changed',{from:it.status,to});it.status=to}))},
    setPriority(uid,id,{version,priority,key}){return once(key,()=>mutate(uid,id,version,(u,it)=>{
      if(!perms(u,it).edit)throw new ApiError('forbidden','Only the owner or a lead can change priority');if(!PRIORITIES.includes(priority))throw new ApiError('invalid','Bad priority')
      log(it,u,'priority_changed',{from:it.priority,to:priority});it.priority=priority}))},
    comment(uid,id,{body,key}){const u=user(uid),it=find(u,id);need(u,it.team,'member')
      return once(key,()=>{if(!body?.trim())throw new ApiError('invalid','Comment is empty');log(it,u,'commented',{body:body.trim()});return view(u,it)})}, // no version bump: comments never conflict
    get(uid,id){const u=user(uid),it=find(u,id)
      return{item:view(u,it),history:audit.filter(e=>e.itemId===id).slice(-100).reverse()}},
    list(uid,{q='',status,priority,team,mine,attention,cursor=0,limit=20}={}){const u=user(uid);q=q.toLowerCase()
      let r=[...items.values()].filter(it=>role(u,it.team)!==null&&(!status||(status==='active'?it.status!=='closed'&&it.status!=='resolved':it.status===status))&&(!priority||it.priority===priority)&&(!team||it.team===team)
        &&(!mine||it.assigneeId===u.id)&&(!q||it.title.toLowerCase().includes(q)||it.id.toLowerCase()===q))
      let v=r.map(it=>view(u,it));if(attention)v=v.filter(i=>i.reasons.length)
      v.sort((a,b)=>b.reasons.length-a.reasons.length||PRIORITIES.indexOf(b.priority)-PRIORITIES.indexOf(a.priority)||b.updatedAt-a.updatedAt)
      return{items:v.slice(cursor,cursor+limit),total:v.length,nextCursor:cursor+limit<v.length?cursor+limit:null}},
    stats(uid){const u=user(uid),all=[...items.values()].filter(it=>role(u,it.team)!==null).map(it=>view(u,it))
      return{attention:all.filter(i=>i.reasons.length).length,mine:all.filter(i=>i.assigneeId===u.id&&!['closed','resolved'].includes(i.status)).length,
        unowned:all.filter(i=>!i.assigneeId&&i.status==='open').length,approvals:all.filter(i=>i.reasons.includes('Needs your approval')).length}},
    me(uid){const u=user(uid);return{...u}},users:()=>USERS,
    notifications:uid=>notes.filter(n=>n.to===uid).slice(-30).reverse(),
    // At-least-once worker: retries failures, dedupes deliveries by (event,recipient).
    processOutbox({fail=()=>false}={}){let done=0,failed=0
      for(const o of outbox){if(o.done)continue
        try{if(fail(o))throw new Error('delivery failed');const e=audit.find(a=>a.id===o.id),it=items.get(e.itemId)
          for(const to of new Set([it.assigneeId,it.creatorId]))if(to&&to!==e.actor&&!noteKeys.has(`${o.id}:${to}`)){
            noteKeys.add(`${o.id}:${to}`);notes.push({id:`${o.id}:${to}`,to,itemId:it.id,text:`${e.actorName} ${e.type.replace('_',' ')} on ${it.id}`,at:e.at})}
          o.done=true;done++}catch{o.attempts++;failed++}}
      return{done,failed,pending:outbox.filter(o=>!o.done).length}},
    _audit:audit}
  if(seed){const t=['Payment stuck in review','Prod API latency spike','Customer refund dispute','Compliance data request','Vendor invoice mismatch','Login failures on mobile','Access approval: contractor','Chargeback investigation','DB failover drill follow-up','Reconcile weekly ledger']
    for(let i=0;i<150;i++){const team=TEAMS[i%3],c=USERS.filter(u=>u.teams[team]&&u.teams[team]!=='viewer'),cr=c[i%c.length]
      const it={id:'W-'+(1000+iseq++),title:`${t[i%10]} #${i+1}`,description:'Seeded example item.',team,priority:PRIORITIES[(i*7)%4],
        status:STATUSES[(i*3)%5],assigneeId:i%4===0?null:c[(i+1)%c.length].id,creatorId:cr.id,dueAt:now()+(i%9-3)*DAY,version:1,createdAt:now()-i*3600e3,updatedAt:now()-i*5400e3}
      if(it.status==='open')it.assigneeId=i%2?null:it.assigneeId;items.set(it.id,it);audit.push({id:seq++,itemId:it.id,actor:cr.id,actorName:cr.name,type:'created',detail:{title:it.title},at:it.createdAt})}}
  return S}

// Async facade: simulated network latency + JSON boundary (no shared references with UI).
export function createApi(opts={}){const s=createServer(opts),sleep=ms=>new Promise(r=>setTimeout(r,ms)),api={cfg:{latency:opts.latency??200,flaky:false},raw:s}
  for(const k of Object.keys(s))if(typeof s[k]==='function'&&!k.startsWith('_'))api[k]=async(...a)=>{await sleep(api.cfg.latency)
    if(api.cfg.flaky&&Math.random()<.3&&['claim','transition','comment','create','assign','setPriority'].includes(k)){
      if(Math.random()<.5)throw new ApiError('network','Request lost — safe to retry')
      const r=s[k](...a);throw new ApiError('network','Response lost — safe to retry (server applied it once)',{applied:r})}   // retry w/ same key is deduped
    return JSON.parse(JSON.stringify(s[k](...a)??null))}
  return api}
