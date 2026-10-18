import {useState,useEffect,useCallback,useRef,useMemo} from 'react'
import {createApi,STATUSES,PRIORITIES,TEAMS} from './server.js'
const api=createApi({latency:220})
const ST={open:'Open',in_progress:'In progress',needs_approval:'Needs approval',resolved:'Resolved',closed:'Closed'}
const PR={low:'bg-slate-300',medium:'bg-sky-500',high:'bg-signal',critical:'bg-red-600'}
const uid=()=>crypto.randomUUID()
const ago=t=>{const m=Math.round((Date.now()-t)/6e4);return m<1?'just now':m<60?m+'m ago':m<1440?Math.round(m/60)+'h ago':Math.round(m/1440)+'d ago'}
const Btn=({tone='default',...p})=><button {...p} className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${tone==='primary'?'bg-ink text-white hover:bg-slate-700':'border border-line bg-white hover:bg-slate-50'} ${p.className||''}`}/>
const Dot=({p})=><span title={p} className={`inline-block h-2.5 w-2.5 rounded-full ${PR[p]}`}/>

function useToasts(){const [t,set]=useState([]);return[t,useCallback((m,kind='info')=>{const id=uid();set(x=>[...x,{id,m,kind}]);setTimeout(()=>set(x=>x.filter(y=>y.id!==id)),5000)},[])]}

export default function App(){
  const [me,setMe]=useState('u1'),[user,setUser]=useState(null),[users,setUsers]=useState([])
  const [f,setF]=useState({q:'',status:'active',priority:'',team:'',mine:false,attention:false}),[dq,setDq]=useState('')
  const [rows,setRows]=useState([]),[total,setTotal]=useState(0),[next,setNext]=useState(null),[loading,setLoading]=useState(true),[stats,setStats]=useState({})
  const [sel,setSel]=useState(null),[creating,setCreating]=useState(false),[toasts,toast]=useToasts(),[flaky,setFlaky]=useState(false),[notes,setNotes]=useState([])
  const reqId=useRef(0)
  useEffect(()=>{api.users().then(setUsers)},[])
  useEffect(()=>{const t=setTimeout(()=>setDq(f.q),250);return()=>clearTimeout(t)},[f.q])
  const load=useCallback(async(append=false,cursor=0)=>{const id=++reqId.current;setLoading(true)
    const q={...f,q:dq,cursor};Object.keys(q).forEach(k=>!q[k]&&delete q[k])
    const [r,s]=await Promise.all([api.list(me,q),api.stats(me)])
    if(id!==reqId.current)return   // ignore stale responses from slower earlier requests
    setRows(x=>append?[...x,...r.items]:r.items);setTotal(r.total);setNext(r.nextCursor);setStats(s);setLoading(false)},[me,f,dq])
  useEffect(()=>{load()},[load])
  useEffect(()=>{api.me(me).then(setUser);setSel(null);setNotes([])},[me])
  useEffect(()=>{const t=setInterval(async()=>{api.raw.processOutbox({fail:()=>api.cfg.flaky&&Math.random()<.4});setNotes(await api.notifications(me))},4000);return()=>clearInterval(t)},[me])
  useEffect(()=>{api.cfg.flaky=flaky},[flaky])
  const canCreate=user&&Object.values(user.teams).some(r=>r!=='viewer')
  return <div className="min-h-screen">
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5">
      <h1 className="text-lg font-semibold tracking-tight">Newtonite <span className="font-normal text-slate-500">Operations</span></h1>
      <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={flaky} onChange={e=>setFlaky(e.target.checked)}/>Simulate flaky network</label>
        <label className="flex items-center gap-1.5">Acting as
          <select className="rounded-md border border-line bg-white px-2 py-1" value={me} onChange={e=>setMe(e.target.value)}>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <details className="relative"><summary className="cursor-pointer rounded-md border border-line px-2 py-1">Notifications{notes.length>0&&<b className="ml-1 text-teal">{notes.length}</b>}</summary>
          <div className="absolute right-0 mt-1 max-h-72 w-72 overflow-auto rounded-md border border-line bg-white p-2 shadow-lg">{notes.length?notes.map(n=><button key={n.id} onClick={()=>setSel(n.itemId)} className="block w-full border-b border-line py-1.5 text-left text-xs last:border-0 hover:bg-slate-50">{n.text}<span className="block text-slate-400">{ago(n.at)}</span></button>):<p className="p-2 text-xs text-slate-500">Nothing yet. Updates on work you own or created appear here.</p>}</div></details>
        <Btn tone="primary" disabled={!canCreate} onClick={()=>setCreating(true)} title={canCreate?'':'Viewers cannot create work'}>New work item</Btn>
      </div></header>
    <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr_28rem]">
      <section>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Needs attention',stats.attention,()=>setF({...f,attention:true,mine:false,status:'active'}),'text-signal'],['Assigned to me',stats.mine,()=>setF({...f,mine:true,attention:false,status:'active'}),'text-teal'],['Awaiting my approval',stats.approvals,()=>setF({...f,status:'needs_approval',mine:false,attention:false}),'text-ink'],['Unclaimed',stats.unowned,()=>setF({...f,status:'open',mine:false,attention:false}),'text-ink']]
            .map(([l,n,fn,c])=><button key={l} onClick={fn} className="rounded-lg border border-line bg-white p-3 text-left hover:border-slate-400"><div className={`text-2xl font-semibold ${c}`}>{n??'–'}</div><div className="text-xs text-slate-500">{l}</div></button>)}</div>
        <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-line bg-white p-2 text-sm">
          <input aria-label="Search" placeholder="Search title or ID…" className="min-w-40 flex-1 rounded-md border border-line px-2 py-1.5" value={f.q} onChange={e=>setF({...f,q:e.target.value})}/>
          <select aria-label="Status" className="rounded-md border border-line px-2" value={f.status} onChange={e=>setF({...f,status:e.target.value})}><option value="active">Active</option><option value="">All statuses</option>{STATUSES.map(s=><option key={s} value={s}>{ST[s]}</option>)}</select>
          <select aria-label="Priority" className="rounded-md border border-line px-2" value={f.priority} onChange={e=>setF({...f,priority:e.target.value})}><option value="">Any priority</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>
          <select aria-label="Team" className="rounded-md border border-line px-2" value={f.team} onChange={e=>setF({...f,team:e.target.value})}><option value="">All my teams</option>{TEAMS.filter(t=>user?.teams[t]).map(t=><option key={t}>{t}</option>)}</select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.mine} onChange={e=>setF({...f,mine:e.target.checked})}/>Mine</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.attention} onChange={e=>setF({...f,attention:e.target.checked})}/>Attention</label></div>
        <p className="mb-1 text-xs text-slate-500" aria-live="polite">{loading&&!rows.length?'Loading…':`${total} item${total===1?'':'s'} · sorted by what needs attention first`}</p>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
          {rows.map(i=><li key={i.id}><button onClick={()=>setSel(i.id)} className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 ${sel===i.id?'bg-teal/5':''}`}>
            <span className="mt-1.5"><Dot p={i.priority}/></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{i.title}</span>
              <span className="text-xs text-slate-500">{i.id} · {i.team} · {ST[i.status]} · {i.assigneeName||'Unassigned'} · {ago(i.updatedAt)}</span></span>
            <span className="flex flex-col items-end gap-1">{i.reasons.map(r=><span key={r} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">{r}</span>)}</span></button></li>)}
          {!loading&&!rows.length&&<li className="p-8 text-center text-sm text-slate-500">No work matches these filters. Clear a filter or create a new item.</li>}</ul>
        {next!=null&&<Btn className="mt-3 w-full" disabled={loading} onClick={()=>load(true,next)}>{loading?'Loading…':`Load more (${total-rows.length} left)`}</Btn>}
      </section>
      <aside>{sel?<Detail key={sel+me} id={sel} me={me} toast={toast} onClose={()=>setSel(null)} onChange={()=>load()} users={users}/>:<div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-slate-500">Select a work item to see its owner, history and next steps.</div>}</aside>
    </main>
    {creating&&<Create user={user} me={me} toast={toast} onClose={()=>setCreating(false)} onDone={id=>{setCreating(false);load();setSel(id)}}/>}
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 space-y-2" role="status">{toasts.map(t=><div key={t.id} className={`rounded-md px-4 py-2 text-sm text-white shadow-lg ${t.kind==='error'?'bg-red-700':'bg-ink'}`}>{t.m}</div>)}</div>
  </div>}

function Detail({id,me,toast,onClose,onChange,users}){
  const [d,setD]=useState(null),[busy,setBusy]=useState(false),[body,setBody]=useState(''),[stale,setStale]=useState(null),keyRef=useRef({})
  const fetchIt=useCallback(async()=>{try{const r=await api.get(me,id);setD(r);setStale(null);return r}catch(e){toast(e.message,'error')}},[id,me,toast])
  useEffect(()=>{fetchIt()},[fetchIt])
  useEffect(()=>{const t=setInterval(async()=>{try{const r=await api.get(me,id);setD(c=>{if(c&&r.item.version!==c.item.version&&!busy)setStale(r);return c})}catch{}},5000);return()=>clearInterval(t)},[id,me,busy])
  // One idempotency key per *intent*: retries reuse it, a new intent (new args) gets a new key.
  const act=async(name,args,optimistic)=>{const sig=name+JSON.stringify(args);const key=keyRef.current[sig]||(keyRef.current[sig]=uid());const prev=d
    setBusy(true);if(optimistic)setD(c=>({...c,item:{...c.item,...optimistic}}))
    try{await api[name](me,id,{...args,version:d.item.version,key});delete keyRef.current[sig];await fetchIt();onChange()}
    catch(e){setD(prev)                                                    // roll back optimistic guess; server is the authority
      if(e.code==='conflict'){toast(e.message+' Showing latest.','error');await fetchIt();onChange()}
      else if(e.code==='network'){toast(e.message,'error')}             // keep key: pressing again is safe
      else toast(e.message,'error')}
    setBusy(false)}
  if(!d)return <div className="rounded-lg border border-line bg-white p-6 text-sm text-slate-500">Loading…</div>
  const {item:i,history}=d,c=i.can
  const colleague=async()=>{const other=users.find(u=>u.id!==me&&u.teams[i.team]&&u.teams[i.team]!=='viewer');if(!other)return
    try{await api.claim(other.id,id,{});toast(`${other.name} just claimed this (you haven't refreshed).`)}catch(e){toast(e.message,'error')}}
  return <div className="rounded-lg border border-line bg-white">
    <div className="flex items-start gap-2 border-b border-line p-4"><div className="flex-1"><div className="text-xs text-slate-500">{i.id} · {i.team} · v{i.version}</div><h2 className="text-lg font-semibold leading-snug">{i.title}</h2></div><Btn onClick={onClose} aria-label="Close">✕</Btn></div>
    {stale&&<div className="flex items-center justify-between bg-amber-50 px-4 py-2 text-sm text-amber-900">Someone changed this item. <Btn onClick={()=>{setD(stale);setStale(null)}}>Refresh</Btn></div>}
    <div className="space-y-4 p-4 text-sm">
      <p className="text-slate-600">{i.description||'No description provided.'}</p>
      <dl className="grid grid-cols-2 gap-3">
        <div><dt className="text-xs text-slate-500">Status</dt><dd className="font-medium">{ST[i.status]}</dd></div>
        <div><dt className="text-xs text-slate-500">Owner</dt><dd className="font-medium">{i.assigneeName||'Unassigned'}</dd></div>
        <div><dt className="text-xs text-slate-500">Priority</dt><dd className="flex items-center gap-1.5 font-medium"><Dot p={i.priority}/>{i.priority}</dd></div>
        <div><dt className="text-xs text-slate-500">Due</dt><dd className="font-medium">{i.dueAt?new Date(i.dueAt).toLocaleDateString():'None'}</dd></div></dl>
      {i.reasons.length>0&&<div className="rounded-md bg-amber-50 p-2 text-amber-900 ring-1 ring-amber-200"><b>Next: </b>{i.reasons.join(' · ')}</div>}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Btn tone="primary" disabled={busy||!c.claim} title={c.claim?'':'Already owned, closed, or you lack permission'} onClick={()=>act('claim',{},{assigneeId:me,assigneeName:'You',status:i.status==='open'?'in_progress':i.status})}>Take ownership</Btn>
        {c.transitions.map(s=><Btn key={s} disabled={busy} onClick={()=>act('transition',{to:s})}>Move to {ST[s].toLowerCase()}</Btn>)}
        {c.edit&&<select aria-label="Priority" disabled={busy} className="rounded-md border border-line px-2 py-1.5" value={i.priority} onChange={e=>act('setPriority',{priority:e.target.value})}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>}
        {c.assign&&<select aria-label="Assign" disabled={busy} className="rounded-md border border-line px-2 py-1.5" value={i.assigneeId||''} onChange={e=>act('assign',{assigneeId:e.target.value||null})}><option value="">Unassign</option>{users.filter(u=>u.teams[i.team]&&u.teams[i.team]!=='viewer').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        {!c.claim&&!c.edit&&!c.assign&&!c.comment&&<span className="text-xs text-slate-500">You have view-only access to this team.</span>}</div>
      <button onClick={colleague} className="text-xs text-slate-400 underline">Demo: simulate a colleague claiming this</button>
      {c.comment&&<div className="flex gap-2"><input aria-label="Comment" className="flex-1 rounded-md border border-line px-2 py-1.5" placeholder="Add a comment…" value={body} onChange={e=>setBody(e.target.value)}/><Btn disabled={busy||!body.trim()} onClick={async()=>{await act('comment',{body});setBody('')}}>Post</Btn></div>}
      <div><h3 className="mb-2 font-semibold">History</h3><ol className="space-y-2 border-l border-line pl-3">{history.map(e=><li key={e.id} className="text-xs"><b>{e.actorName}</b> {label(e)}<span className="block text-slate-400">{ago(e.at)}</span></li>)}</ol></div>
    </div></div>}
const label=e=>({created:'created this item',claimed:'took ownership',reassigned:'changed the owner',status_changed:`moved ${e.detail.from} → ${e.detail.to}`,priority_changed:`changed priority ${e.detail.from} → ${e.detail.to}`,commented:`commented: “${e.detail.body}”`}[e.type]||e.type)

function Create({user,me,toast,onClose,onDone}){
  const teams=useMemo(()=>TEAMS.filter(t=>user?.teams[t]&&user.teams[t]!=='viewer'),[user])
  const [v,setV]=useState({title:'',description:'',team:teams[0],priority:'medium',days:3}),[busy,setBusy]=useState(false),key=useRef(uid())
  const submit=async e=>{e.preventDefault();if(busy)return;setBusy(true)
    try{const i=await api.create(me,{...v,dueAt:v.days?Date.now()+v.days*864e5:null,key:key.current});toast(`Created ${i.id}`);onDone(i.id)}
    catch(err){toast(err.message,'error');setBusy(false)}}   // key kept: retrying cannot create a duplicate
  const set=k=>e=>setV({...v,[k]:e.target.value}),inp='w-full rounded-md border border-line px-2 py-1.5'
  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"><form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 text-sm">
    <h2 className="text-lg font-semibold">New work item</h2>
    <label className="block">What needs to happen?<input required autoFocus className={inp} value={v.title} onChange={set('title')}/></label>
    <label className="block">Why does it exist?<textarea rows={3} className={inp} value={v.description} onChange={set('description')}/></label>
    <div className="grid grid-cols-3 gap-2"><label>Team<select className={inp} value={v.team} onChange={set('team')}>{teams.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Priority<select className={inp} value={v.priority} onChange={set('priority')}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Due in (days)<input type="number" min="0" className={inp} value={v.days} onChange={set('days')}/></label></div>
    <div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>Cancel</Btn><Btn tone="primary" type="submit" disabled={busy}>{busy?'Creating…':'Create item'}</Btn></div></form></div>}
