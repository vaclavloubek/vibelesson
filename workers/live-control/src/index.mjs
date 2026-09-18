const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function b64bytes(value) {
  const s = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
async function verify(token, secret, sid) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || !secret) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('HMAC', key, b64bytes(sig), encoder.encode(payload))) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(b64bytes(payload)));
    if (v?.v !== 1 || v.sid !== sid || !['teacher','student'].includes(v.role) || typeof v.sub !== 'string' || v.exp <= Math.floor(Date.now()/1000)) return null;
    return v;
  } catch { return null; }
}
function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }
function publicBlock(block){
  if (!block || typeof block !== 'object') return null;
  const out={}; for (const k of ['id','type','title','durationMinutes','instructions','options','items','dataTable','revealText','points']) if (block[k] !== undefined) out[k]=block[k];
  return out;
}

export class LiveSession {
  constructor(ctx, env) {
    this.ctx=ctx; this.env=env; this.sql=ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS snapshots(scope TEXT PRIMARY KEY,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,operation_id TEXT NOT NULL UNIQUE,actor_role TEXT NOT NULL,actor_sub TEXT NOT NULL,event_type TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL);`);
    });
  }
  read(scope){ const rows=[...this.sql.exec('SELECT state,revision FROM snapshots WHERE scope=?',scope)]; return rows.length ? {state:JSON.parse(rows[0].state),revision:Number(rows[0].revision)} : null; }
  write(scope,state){ const rev=(this.read(scope)?.revision??0)+1; this.sql.exec(`INSERT INTO snapshots(scope,state,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET state=excluded.state,revision=excluded.revision,updated_at=excluded.updated_at`,scope,JSON.stringify(state),rev,Date.now()); return rev; }
  broadcast(){ for(const ws of this.ctx.getWebSockets()) try{ws.send(JSON.stringify({type:'invalidate'}));}catch{} }
  updateStudents(teacher){
    const blocks=Array.isArray(teacher?.lessonSnapshot?.blocks)?teacher.lessonSnapshot.blocks:[]; const idx=typeof teacher.activeBlockId==='string'?blocks.findIndex(b=>b?.id===teacher.activeBlockId):-1;
    const active=idx>=0?publicBlock(blocks[idx]):null;
    for(const row of this.sql.exec("SELECT scope,state FROM snapshots WHERE scope LIKE 'student:%'")){
      const s=JSON.parse(row.state); s.status=teacher.status; s.activeBlock=teacher.status==='live'?active:null; s.activeBlockIndex=teacher.status==='live'&&idx>=0?idx:null; s.totalBlocks=blocks.length; s.resultsRevealed=Boolean(teacher.resultsRevealed); s.timer=clone(teacher.timer??null); this.write(row.scope,s);
    }
  }
  teacherAction(state,action){
    const n=clone(state); const blocks=Array.isArray(n?.lessonSnapshot?.blocks)?n.lessonSnapshot.blocks:[]; const idx=typeof n.activeBlockId==='string'?blocks.findIndex(b=>b?.id===n.activeBlockId):-1;
    if(action==='start'&&n.status==='lobby'&&blocks.length){n.status='live';n.activeBlockId=blocks[0].id;n.resultsRevealed=false;n.timer=blocks[0].type==='timer'?{status:'idle',remainingSeconds:Number(blocks[0].durationMinutes||0)*60,syncedAt:new Date().toISOString()}:null;}
    else if((action==='next'||action==='previous')&&n.status==='live'&&idx>=0){const t=idx+(action==='next'?1:-1);if(t>=0&&t<blocks.length){n.activeBlockId=blocks[t].id;n.resultsRevealed=false;n.timer=blocks[t].type==='timer'?{status:'idle',remainingSeconds:Number(blocks[t].durationMinutes||0)*60,syncedAt:new Date().toISOString()}:null;}}
    else if(action==='end') n.status='ended';
    else if(action==='reveal_results') n.resultsRevealed=true;
    else if(action==='reveal_scoreboard') n.scoreboardRevealed=true;
    else if(action==='hide_scoreboard') n.scoreboardRevealed=false;
    else if(action==='timer_start'&&n.timer) n.timer={...n.timer,status:'running',syncedAt:new Date().toISOString()};
    else if(action==='timer_pause'&&n.timer) n.timer={...n.timer,status:'paused',syncedAt:new Date().toISOString()};
    else if(action==='timer_reset'&&n.timer){const b=idx>=0?blocks[idx]:null;n.timer={status:'idle',remainingSeconds:Number(b?.durationMinutes||0)*60,syncedAt:new Date().toISOString()};}
    return n;
  }
  studentResponse(scope,p){
    const sr=this.read(scope); if(!sr||sr.state?.activeBlock?.id!==p?.blockId) return null;
    const s=clone(sr.state); s.myResponse=clone(p.answer); s.myResponseSubmitted=p.responseAction==='submit'; this.write(scope,s);
    const tr=this.read('teacher'); if(tr){const t=clone(tr.state);t.responses=Array.isArray(t.responses)?t.responses:[];const i=t.responses.findIndex(r=>r.participantId===p.participantId);const row={participantId:p.participantId,displayName:s.participantDisplayName??'Student',answer:clone(p.answer),updatedAt:new Date().toISOString()};if(i>=0)t.responses[i]=row;else t.responses.push(row);this.write('teacher',t);}
    return s;
  }
  async fetch(req){
    const u=new URL(req.url); const sid=req.headers.get('X-Syllonaut-Session')||''; if(!sid)return json({error:'Missing session.'},400);
    if(u.pathname==='/mirror'||u.pathname==='/server-event'){
      if(req.headers.get('X-Syllonaut-Bootstrap')!==this.env.BOOTSTRAP_SECRET)return json({error:'Unauthorized.'},401);
      const b=await req.json();
      if(u.pathname==='/mirror'){if(typeof b?.scope!=='string')return json({error:'Invalid scope.'},400);const revision=this.write(b.scope,b.state);this.broadcast();return json({ok:true,revision});}
      if(typeof b?.operationId!=='string')return json({error:'Missing operation id.'},400);
      if([...this.sql.exec('SELECT seq FROM events WHERE operation_id=?',b.operationId)].length)return json({ok:true,duplicate:true,state:this.read('teacher')?.state??null});
      const tr=this.read('teacher');if(!tr)return json({error:'Teacher snapshot is not ready.'},409);const t=b.type==='teacher.action'?this.teacherAction(tr.state,b.payload?.action):tr.state;
      this.sql.exec('INSERT INTO events(operation_id,actor_role,actor_sub,event_type,payload,created_at) VALUES(?,?,?,?,?,?)',b.operationId,'server','vercel',String(b.type||''),JSON.stringify(b.payload??null),Date.now());this.write('teacher',t);this.updateStudents(t);this.broadcast();return json({ok:true,state:t});
    }
    const auth=req.headers.get('Authorization')||''; const cap=await verify(auth.startsWith('Bearer ')?auth.slice(7):'',this.env.CAPABILITY_SECRET,sid); if(!cap)return json({error:'Unauthorized.'},401);
    const scope=cap.role==='teacher'?'teacher':`student:${cap.sub}`;
    if(u.pathname==='/state'&&req.method==='GET'){const r=this.read(scope);return r?json({state:r.state,revision:r.revision}):json({error:'Snapshot is not ready.'},404);}
    if(u.pathname==='/event'&&req.method==='POST'){
      const b=await req.json();if(typeof b?.operationId!=='string')return json({error:'Invalid operation id.'},400);
      if([...this.sql.exec('SELECT seq FROM events WHERE operation_id=?',b.operationId)].length)return json({ok:true,duplicate:true,state:this.read(scope)?.state??null});
      let n=null;
      if(cap.role==='teacher'&&b.type==='teacher.action'){const tr=this.read('teacher');if(!tr)return json({error:'Teacher snapshot is not ready.'},409);n=this.teacherAction(tr.state,b.payload?.action);this.write('teacher',n);this.updateStudents(n);}
      else if(cap.role==='student'&&b.type==='student.response'){n=this.studentResponse(scope,{...b.payload,participantId:cap.sub});if(!n)return json({error:'Response does not match active block.'},409);}
      else return json({error:'Unsupported event.'},400);
      this.sql.exec('INSERT INTO events(operation_id,actor_role,actor_sub,event_type,payload,created_at) VALUES(?,?,?,?,?,?)',b.operationId,cap.role,cap.sub,String(b.type),JSON.stringify(b.payload??null),Date.now());this.broadcast();return json({ok:true,state:n});
    }
    if(u.pathname==='/websocket'&&req.headers.get('Upgrade')==='websocket'){const pair=new WebSocketPair();const [client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({scope});return new Response(null,{status:101,webSocket:client});}
    return json({error:'Not found.'},404);
  }
  webSocketMessage(ws,msg){if(String(msg)==='ping')ws.send('pong');}
}
function origin(req,env){const o=req.headers.get('Origin');if(!o)return null;return String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).includes(o)?o:null;}
function cors(res,o){if(!o||res.status===101)return res;const h=new Headers(res.headers);h.set('Access-Control-Allow-Origin',o);h.set('Vary','Origin');h.set('Access-Control-Allow-Headers','Authorization, Content-Type');h.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});}
export default {async fetch(req,env){const o=origin(req,env);if(req.method==='OPTIONS')return o?new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':o,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Max-Age':'600'}}):new Response(null,{status:403});
  const u=new URL(req.url);const m=u.pathname.match(/^\/v1\/sessions\/([0-9a-f-]{36})(\/(?:mirror|server-event|state|event|websocket))$/i);if(!m)return cors(json({error:'Not found.'},404),o);const sid=m[1];const id=env.LIVE_SESSIONS.idFromName(sid);const stub=env.LIVE_SESSIONS.get(id);const h=new Headers(req.headers);h.set('X-Syllonaut-Session',sid);const f=new Request(`https://live.internal${m[2]}`,{method:req.method,headers:h,body:['GET','HEAD'].includes(req.method)?undefined:req.body});return cors(await stub.fetch(f),o);}};
