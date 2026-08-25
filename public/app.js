const $ = s => document.querySelector(s);
const app = $('#app');
let me = null;
let view = 'subreddits';
let currentSub = null;
let currentPost = null;
let chatWith = null;
let myVotes = [];
let SQL, db;

// stars
const sc = $('#stars');
for(let i=0;i<18;i++){let s=document.createElement('span');s.textContent='۞';s.style.left=Math.random()*100+'%';s.style.top=Math.random()*100+'%';s.style.animationDelay=(Math.random()*5)+'s';s.style.fontSize=(14+Math.random()*18)+'px';sc.appendChild(s);}

function esc(s){ return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }
function go(v){ view=v; render(); }
window.go=go;

// --- DB (sql.js + localStorage) ---
function saveDB(){ const data=db.export(); const b64=btoa(String.fromCharCode(...data)); localStorage.setItem('vikna_db', b64); }
function loadDB(){ const b64=localStorage.getItem('vikna_db'); if(!b64) return null; const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr; }
function q(sql, params=[]){ const r=db.exec(sql, params); if(!r.length) return []; const cols=r[0].columns, vals=r[0].values; return vals.map(row=>Object.fromEntries(row.map((v,i)=>[cols[i],v]))); }
function exec(sql, params=[]){ db.exec(sql, params); saveDB(); }

async function hashPassword(pw, saltB64){
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), c=>c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(20));
  const saltB = btoa(String.fromCharCode(...salt));
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2', salt, iterations:150000, hash:'SHA-256'}, key, 256);
  const hash=Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return {hash, salt:saltB};
}

async function initDB(){
  SQL = await initSqlJs({locateFile: f=>`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`});
  const loaded=loadDB();
  db = loaded ? new SQL.Database(loaded) : new SQL.Database();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, salt TEXT, role TEXT, karma INTEGER DEFAULT 0, created_at TEXT);
    CREATE TABLE IF NOT EXISTS subreddits (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, description TEXT, creator_id INTEGER, created_at TEXT);
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, author_id INTEGER, subreddit_id INTEGER, created_at TEXT, upvotes INTEGER DEFAULT 0, downvotes INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, parent_id INTEGER, author_id INTEGER, content TEXT, created_at TEXT, upvotes INTEGER DEFAULT 0, downvotes INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS votes (user_id INTEGER, target_id INTEGER, target_type TEXT, vote INTEGER, PRIMARY KEY(user_id,target_id,target_type));
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER, receiver_id INTEGER, content TEXT, created_at TEXT, read INTEGER DEFAULT 0);
  `);
  saveDB();
  const f=q("SELECT * FROM users WHERE username='vikna'");
  if(!f.length){ const {hash,salt}=await hashPassword('1342@#..'); exec("INSERT INTO users (username,password_hash,salt,role,karma,created_at) VALUES (?,?,?,?,?,?)", ['vikna',hash,salt,'ADMIN',0,new Date().toISOString()]); }
  const sess=sessionStorage.getItem('vikna_user');
  if(sess){ try{ me=JSON.parse(sess);}catch{} }
  if(localStorage.getItem('vikna_welcomed')) $('#welcomeModal').classList.add('hidden');
  updateHeader(); refreshVotes(); render(); setInterval(updateBadge,2000);
  $('#chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendMsg(); });
  $('#userBadge').addEventListener('click', ()=>{ if(me) go('profile'); });
}

function updateHeader(){
  const badge=$('#userBadge'), lb=$('#logoutBtn'), ab=$('#adminBtn'), logb=$('#loginBtn'), bc=$('#broadcastBtn');
  if(me){ badge.textContent='۞ '+me.username+' · '+me.role; lb.classList.remove('hidden'); logb.classList.add('hidden'); if(me.role==='ADMIN'){ab.classList.remove('hidden'); bc.style.display=''} else {ab.classList.add('hidden'); bc.style.display='none'} }
  else { badge.textContent='۞ UNAUTH'; lb.classList.add('hidden'); ab.classList.add('hidden'); logb.classList.remove('hidden'); bc.style.display='none' }
}
function refreshVotes(){ if(!me){ myVotes=[]; return;} myVotes=q("SELECT target_id,target_type,vote FROM votes WHERE user_id=?", [me.id]); }
function voteState(id,type){ const f=myVotes.find(v=>v.target_id===id && v.target_type===type); return f?f.vote:0 }

window.logout=()=>{ sessionStorage.removeItem('vikna_user'); me=null; updateHeader(); go('subreddits'); };

// welcome + audio
window.startAudio=()=>{
  $('#welcomeModal').classList.add('hidden'); localStorage.setItem('vikna_welcomed','1');
  const f=$('#ytAudio'); f.src='https://www.youtube.com/embed/NYzFsFWdVcE?autoplay=1&mute=0&loop=1&playlist=NYzFsFWdVcE&enablejsapi=1';
  $('#audioToggle').textContent='🔊 Mute Audio'; window._muted=false;
};
window.toggleAudio=()=>{
  const f=$('#ytAudio'); if(!f.src){ startAudio(); return } window._muted=!window._muted;
  try{ const u=new URL(f.src); u.searchParams.set('mute', window._muted?'1':'0'); f.src=u.toString(); }catch{}
  $('#audioToggle').textContent= window._muted ? '🔇 Unmute Audio' : '🔊 Mute Audio';
};

// views
function render(){
  if(view==='auth') return renderAuth();
  if(view==='profile') return renderProfile();
  if(view==='admin') return renderAdmin();
  if(view==='postDetail' && currentPost) return renderPostDetail();
  if(view==='posts' && currentSub) return renderPosts();
  return renderSubreddits();
}

window.togglePw=()=>{
  const i=$('#ap'); const b=$('#eyeBtn');
  if(!i) return; const isPw=i.type==='password'; i.type=isPw?'text':'password';
  if(b) b.textContent=isPw?'🙈':'👁'; i.focus();
};
function renderAuth(mode='login'){
  let m=mode;
  function draw(msg='', ok=''){
    app.innerHTML=`
    <div class="auth-card">
      <div class="auth-head">
        <div class="auth-star">۞</div>
        <h2>${m==='login'?'Welcome back':'Create account'}</h2>
        <p>${m==='login'?'Vikna Communication System · Secure login':'Join Vikna Forum · Founded by Ilyas Sbihan'}</p>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab ${m==='login'?'active':''}" id="tabLogin">Login</button>
        <button class="auth-tab ${m==='register'?'active':''}" id="tabReg">Register</button>
      </div>
      <div class="field">
        <span class="field-icon">👤</span>
        <input id="au" placeholder="Username" autocomplete="username" maxlength="20">
      </div>
      <div class="field">
        <span class="field-icon">🔒</span>
        <input id="ap" type="password" placeholder="Password" autocomplete="${m==='login'?'current-password':'new-password'}" maxlength="72">
        <button class="eye-btn" id="eyeBtn" type="button" onclick="togglePw()" title="Show/Hide password">👁</button>
      </div>
      <div class="auth-msg">${msg?`<div class="err">⚠ ${esc(msg)}</div>`:''}${ok?`<div class="ok">✓ ${esc(ok)}</div>`:''}</div>
      <button class="auth-btn" id="abtn">${m==='login'?'🔓 LOGIN':'✦ CREATE ACCOUNT'}</button>
      <div class="auth-foot">
        Founder: <b>vikna</b> / <code>1342@#..</code>
        <div style="margin-top:10px"><button class="btn outline sm" onclick="go('subreddits')">← Back to forum</button></div>
      </div>
    </div>`;
    $('#tabLogin').onclick=()=>{ m='login'; draw(); };
    $('#tabReg').onclick=()=>{ m='register'; draw(); };
    // focus + enter
    setTimeout(()=>$('#au')?.focus(),30);
    $('#au').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#ap').focus(); });
    $('#ap').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#abtn').click(); });
    $('#abtn').onclick=async()=>{
      const u=$('#au').value.trim(), p=$('#ap').value;
      const btn=$('#abtn'); const orig=btn.textContent;
      if(!u||!p){ draw('Fill username and password'); return; }
      try{
        btn.textContent='⏳ Processing...'; btn.disabled=true;
        if(m==='register'){
          if(p.length<3){ draw('Password min 3 chars'); return; }
          if(q("SELECT id FROM users WHERE username=? COLLATE NOCASE", [u]).length){ draw('Username already taken'); return; }
          if(!/^[a-zA-Z0-9_-]{3,20}$/.test(u)){ draw('Username: 3-20 letters, numbers, _ -'); return; }
          const {hash,salt}=await hashPassword(p);
          exec("INSERT INTO users (username,password_hash,salt,role,karma,created_at) VALUES (?,?,?,?,?,?)", [u,hash,salt,'USER',0,new Date().toISOString()]);
          m='login'; draw('','Account created — now login'); return;
        }else{
          const rows=q("SELECT * FROM users WHERE username=? COLLATE NOCASE", [u]);
          if(!rows.length){ draw('User not found'); return; }
          const row=rows[0]; const {hash}=await hashPassword(p, row.salt);
          if(hash!==row.password_hash){ draw('Invalid password'); return; }
          me={id:row.id, username:row.username, role:row.role, karma:row.karma};
          sessionStorage.setItem('vikna_user', JSON.stringify(me));
          updateHeader(); refreshVotes(); go('subreddits');
        }
      }catch(e){ draw(e.message); }
      finally{ btn.disabled=false; btn.textContent=orig; }
    };
  }
  draw();
}

function renderSubreddits(){
  view='subreddits'; currentSub=null; currentPost=null;
  const subs=q("SELECT s.*, u.username as creator, (SELECT COUNT(*) FROM posts WHERE subreddit_id=s.id) as post_count FROM subreddits s LEFT JOIN users u ON u.id=s.creator_id ORDER BY s.created_at DESC");
  app.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px"><h2 style="font-family:'Russo One',sans-serif;color:var(--gold)">۞ Subreddits</h2><button class="btn sm" onclick="newSub()">+ New Subreddit</button></div>
    <div class="sub-grid">${subs.length?subs.map(s=>`<div class="sub-card" onclick="openSub(${s.id})"><h4>۞ ${esc(s.name)}</h4><p style="font-size:12px;color:var(--muted);margin:6px 0">${esc(s.description||'No description')}</p><div class="meta">by ${esc(s.creator||'?')} · ${s.post_count} posts · ${new Date(s.created_at).toLocaleDateString()}</div></div>`).join(''):`<div class="card" style="text-align:center;color:var(--muted)">No subreddits yet. Create the first one!</div>`}</div>`;
}
window.newSub=async()=>{
  if(!me){ go('auth'); return; }
  const name=prompt('Subreddit name (2-40):'); if(!name) return;
  const desc=prompt('Description:')||'';
  try{ exec("INSERT INTO subreddits (name,description,creator_id,created_at) VALUES (?,?,?,?)", [name.trim().slice(0,40), desc.slice(0,300), me.id, new Date().toISOString()]); renderSubreddits(); }catch(e){ alert('Name already taken'); }
};
window.openSub=(id)=>{ currentSub=q("SELECT * FROM subreddits WHERE id=?", [id])[0]; view='posts'; renderPosts(); };

function renderPosts(){
  refreshVotes();
  const posts=q("SELECT p.*, u.username as author, (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comment_count FROM posts p LEFT JOIN users u ON u.id=p.author_id WHERE p.subreddit_id=? ORDER BY p.created_at DESC", [currentSub.id]);
  app.innerHTML=`<div class="view-nav"><button onclick="go('subreddits')">← All Subreddits</button><span style="background:var(--gold);color:#000;padding:6px 12px;border-radius:20px;font-family:'Russo One',sans-serif;font-size:12px">۞ ${esc(currentSub.name)}</span></div>
    <div class="card"><p style="color:var(--muted);font-size:12px">${esc(currentSub.description||'')}</p><div style="margin-top:10px"><button class="btn sm" onclick="newPost()">+ New Post</button></div></div>
    ${posts.length?posts.map(p=>{
      const score=(p.upvotes||0)-(p.downvotes||0); const vs=voteState(p.id,'post');
      return `<div class="post-row" onclick="openPost(${p.id})"><div style="font-family:'Russo One',sans-serif;color:var(--gold)">${esc(p.title)}</div><div style="font-size:12px;color:var(--muted);margin:4px 0;white-space:pre-wrap">${esc((p.content||'').slice(0,160))}${(p.content||'').length>160?'…':''}</div><div class="meta">by ${esc(p.author||'?')} · ${p.comment_count} comments · ${new Date(p.created_at).toLocaleString()}</div><div class="vote-bar" onclick="event.stopPropagation()"><button class="vote-btn ${vs===1?'active up':''}" onclick="doVote('post',${p.id},1)">▲</button><span style="font-size:12px;min-width:22px;text-align:center">${score}</span><button class="vote-btn ${vs===-1?'active down':''}" onclick="doVote('post',${p.id},-1)">▼</button></div></div>`;
    }).join(''):`<div class="card" style="text-align:center;color:var(--muted)">No posts yet.</div>`}`;
}
window.newPost=()=>{
  if(!me){ go('auth'); return; }
  const title=prompt('Post title:'); if(!title) return;
  const content=prompt('Content:')||'';
  exec("INSERT INTO posts (title,content,author_id,subreddit_id,created_at) VALUES (?,?,?,?,?)", [title.slice(0,120), content.slice(0,5000), me.id, currentSub.id, new Date().toISOString()]);
  renderPosts();
};
window.openPost=(id)=>{ currentPost=q("SELECT * FROM posts WHERE id=?", [id])[0]; view='postDetail'; renderPostDetail(); };

function renderPostDetail(){
  refreshVotes();
  const p=q("SELECT p.*, u.username as author, s.name as subreddit_name FROM posts p LEFT JOIN users u ON u.id=p.author_id LEFT JOIN subreddits s ON s.id=p.subreddit_id WHERE p.id=?", [currentPost.id])[0];
  if(!p){ view='posts'; return render(); }
  currentPost=p;
  const comments=q("SELECT c.*, u.username as author FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.post_id=? ORDER BY c.created_at ASC", [p.id]);
  const score=(p.upvotes||0)-(p.downvotes||0); const vs=voteState(p.id,'post');
  function tree(list,parent=null){
    return list.filter(c=> (c.parent_id||null)==parent).map(c=>{
      const cs=(c.upvotes||0)-(c.downvotes||0); const cv=voteState(c.id,'comment');
      return `<div class="comment ${parent?'reply':''}"><div style="font-size:11px;color:var(--gold)">${esc(c.author||'?')} · <span style="color:var(--muted)">${new Date(c.created_at).toLocaleString()}</span> ${me && (me.role==='ADMIN'||me.id===c.author_id)?`<span style="color:#ff6b6b;cursor:pointer;margin-left:8px" onclick="delComment(${c.id})">delete</span>`:''}</div><div style="font-size:13px;margin:6px 0;white-space:pre-wrap">${esc(c.content)}</div><div class="vote-bar"><button class="vote-btn ${cv===1?'active up':''}" onclick="doVote('comment',${c.id},1)">▲</button><span style="font-size:11px">${cs}</span><button class="vote-btn ${cv===-1?'active down':''}" onclick="doVote('comment',${c.id},-1)">▼</button><span style="margin-left:10px;color:var(--gold);cursor:pointer" onclick="replyC(${c.id})">Reply</span></div>${tree(list,c.id)}</div>`;
    }).join('');
  }
  app.innerHTML=`<div class="view-nav"><button onclick="go('posts')">← Back to ${esc(p.subreddit_name||'posts')}</button></div>
    <div class="card"><h2>۞ ${esc(p.title)}</h2><div class="meta">by ${esc(p.author||'?')} in ۞ ${esc(p.subreddit_name||'?')} · ${new Date(p.created_at).toLocaleString()} ${me && (me.role==='ADMIN'||me.id===p.author_id)?`<button class="btn red sm" style="margin-left:8px" onclick="delPost(${p.id})">Delete</button>`:''}</div><p style="margin:14px 0;white-space:pre-wrap;line-height:1.6">${esc(p.content||'')}</p><div class="vote-bar"><button class="vote-btn ${vs===1?'active up':''}" onclick="doVote('post',${p.id},1)">▲ Upvote</button><span style="font-weight:700">${score} score</span><button class="vote-btn ${vs===-1?'active down':''}" onclick="doVote('post',${p.id},-1)">▼ Downvote</button></div></div>
    <div class="card"><h3>Comments</h3><textarea id="ci" placeholder="Write a comment..."></textarea><button class="btn sm" style="margin-top:8px" onclick="postC()">Post Comment</button><div style="margin-top:14px">${comments.length?tree(comments):'<p style="color:var(--muted);font-size:12px">No comments yet.</p>'}</div></div>`;
}
window.postC=()=>{
  if(!me){ go('auth'); return; }
  const v=$('#ci').value.trim(); if(!v) return;
  exec("INSERT INTO comments (post_id,parent_id,author_id,content,created_at) VALUES (?,?,?,?,?)", [currentPost.id, null, me.id, v.slice(0,2000), new Date().toISOString()]);
  renderPostDetail();
};
window.replyC=(pid)=>{
  if(!me){ go('auth'); return; }
  const t=prompt('Reply:'); if(!t) return;
  exec("INSERT INTO comments (post_id,parent_id,author_id,content,created_at) VALUES (?,?,?,?,?)", [currentPost.id, pid, me.id, t.slice(0,2000), new Date().toISOString()]);
  renderPostDetail();
};
window.delComment=(id)=>{ if(!confirm('Delete?')) return; exec("DELETE FROM votes WHERE target_id=? AND target_type='comment'", [id]); exec("DELETE FROM comments WHERE id=?", [id]); renderPostDetail(); };
window.delPost=(id)=>{ if(!confirm('Delete?')) return; exec("DELETE FROM comments WHERE post_id=?", [id]); exec("DELETE FROM votes WHERE target_id=? AND target_type='post'", [id]); exec("DELETE FROM posts WHERE id=?", [id]); view='posts'; render(); };
window.doVote=(type,id,v)=>{
  if(!me){ go('auth'); return; }
  const table=type==='post'?'posts':'comments';
  const exists=q(`SELECT id, author_id FROM ${table} WHERE id=?`, [id])[0]; if(!exists) return;
  const prev=q("SELECT vote FROM votes WHERE user_id=? AND target_id=? AND target_type=?", [me.id,id,type])[0];
  if(prev){
    if(prev.vote===v) return;
    if(prev.vote===1) exec(`UPDATE ${table} SET upvotes=upvotes-1 WHERE id=?`, [id]); else exec(`UPDATE ${table} SET downvotes=downvotes-1 WHERE id=?`, [id]);
    exec("UPDATE users SET karma=karma-? WHERE id=?", [prev.vote, exists.author_id]);
    exec("UPDATE votes SET vote=? WHERE user_id=? AND target_id=? AND target_type=?", [v, me.id, id, type]);
  }else{
    exec("INSERT INTO votes (user_id,target_id,target_type,vote) VALUES (?,?,?,?)", [me.id, id, type, v]);
  }
  if(v===1) exec(`UPDATE ${table} SET upvotes=upvotes+1 WHERE id=?`, [id]); else exec(`UPDATE ${table} SET downvotes=downvotes+1 WHERE id=?`, [id]);
  exec("UPDATE users SET karma=karma+? WHERE id=?", [v, exists.author_id]);
  const fresh=q("SELECT karma FROM users WHERE id=?", [me.id])[0]; if(fresh) me.karma=fresh.karma;
  refreshVotes(); if(view==='postDetail') renderPostDetail(); else renderPosts();
};

// profile + admin + chat
function renderProfile(){
  if(!me){ go('auth'); return; }
  const u=q("SELECT * FROM users WHERE id=?", [me.id])[0];
  app.innerHTML=`<div class="card" style="text-align:center"><h2>۞ ${esc(u.username)}</h2><p class="meta">Role: ${u.role} · Karma: ${u.karma} · Joined: ${new Date(u.created_at).toLocaleDateString()}</p>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn sm" onclick="changePw()">Change Password</button>${u.username!=='vikna'?'<button class="btn red sm" onclick="delAcc()">Delete Account</button>':''}</div></div>
    <div style="text-align:center"><button class="btn outline sm" onclick="go('subreddits')">← Back</button></div>`;
}
window.changePw=async()=>{
  const oldP=prompt('Old password:'); if(oldP===null) return;
  const row=q("SELECT * FROM users WHERE id=?", [me.id])[0];
  const {hash}=await hashPassword(oldP, row.salt);
  if(hash!==row.password_hash){ alert('Old incorrect'); return; }
  const np=prompt('New password (min 3):'); if(!np||np.length<3){ alert('min 3'); return; }
  const c=prompt('Confirm:'); if(c!==np){ alert('Mismatch'); return; }
  const nh=await hashPassword(np);
  exec("UPDATE users SET password_hash=?, salt=? WHERE id=?", [nh.hash, nh.salt, me.id]); alert('Password changed');
};
window.delAcc=()=>{
  if(!confirm('Delete account and all content?')) return;
  const id=me.id;
  exec("DELETE FROM votes WHERE user_id=?", [id]);
  exec("DELETE FROM messages WHERE sender_id=? OR receiver_id=?", [id,id]);
  exec("DELETE FROM comments WHERE author_id=?", [id]);
  exec("DELETE FROM posts WHERE author_id=?", [id]);
  exec("DELETE FROM subreddits WHERE creator_id=?", [id]);
  exec("DELETE FROM users WHERE id=?", [id]);
  sessionStorage.removeItem('vikna_user'); me=null; updateHeader(); go('subreddits');
};

function renderAdmin(){
  if(!me||me.role!=='ADMIN'){ go('subreddits'); return; }
  app.innerHTML=`<h2 style="font-family:'Russo One',sans-serif;color:var(--gold);margin-bottom:12px">⚙️ Admin Panel</h2>
    <div class="tabs"><button id="tU" class="active" onclick="adminTab('users')">Users</button><button id="tS" onclick="adminTab('subreddits')">Subreddits</button><button id="tP" onclick="adminTab('posts')">Posts</button><button id="tSt" onclick="adminTab('stats')">Stats</button></div>
    <div class="card" id="ac"></div><div style="text-align:center;margin-top:10px"><button class="btn outline sm" onclick="go('subreddits')">← Back</button></div>`;
  adminTab('users');
}
window.adminTab=(t)=>{
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  const map={users:'tU', subreddits:'tS', posts:'tP', stats:'tSt'}; document.getElementById(map[t])?.classList.add('active');
  const c=$('#ac');
  if(t==='users'){
    const users=q("SELECT * FROM users ORDER BY id");
    c.innerHTML=`<table><tr><th>ID</th><th>Username</th><th>Role</th><th>Karma</th><th>Actions</th></tr>${users.map(u=>`<tr><td>${u.id}</td><td>${esc(u.username)} ${u.username==='vikna'?'۞':''}</td><td>${u.role}</td><td>${u.karma}</td><td>${u.username==='vikna'?'protected':`<button class="btn sm" onclick="mkR(${u.id},'ADMIN')">Admin</button> <button class="btn sm ghost" onclick="mkR(${u.id},'USER')">User</button> <button class="btn sm red" onclick="delU(${u.id})">Delete</button>`}</td></tr>`).join('')}</table>`;
  }else if(t==='subreddits'){
    const subs=q("SELECT s.*, u.username as creator FROM subreddits s LEFT JOIN users u ON u.id=s.creator_id ORDER BY s.id DESC");
    c.innerHTML=`<table><tr><th>ID</th><th>Name</th><th>Creator</th><th>Action</th></tr>${subs.map(s=>`<tr><td>${s.id}</td><td>${esc(s.name)}</td><td>${esc(s.creator||'?')}</td><td><button class="btn sm red" onclick="delS(${s.id})">Delete</button></td></tr>`).join('')||'<tr><td colspan=4>none</td></tr>'}</table>`;
  }else if(t==='posts'){
    const posts=q("SELECT p.*, u.username as author FROM posts p LEFT JOIN users u ON u.id=p.author_id ORDER BY p.id DESC LIMIT 50");
    c.innerHTML=`<table><tr><th>ID</th><th>Title</th><th>Author</th><th>Action</th></tr>${posts.map(p=>`<tr><td>${p.id}</td><td>${esc(p.title).slice(0,40)}</td><td>${esc(p.author||'?')}</td><td><button class="btn sm red" onclick="delP(${p.id})">Delete</button></td></tr>`).join('')||'<tr><td colspan=4>none</td></tr>'}</table>`;
  }else if(t==='stats'){
    const s={users:q("SELECT COUNT(*) as c FROM users")[0].c, subreddits:q("SELECT COUNT(*) as c FROM subreddits")[0].c, posts:q("SELECT COUNT(*) as c FROM posts")[0].c, comments:q("SELECT COUNT(*) as c FROM comments")[0].c, messages:q("SELECT COUNT(*) as c FROM messages")[0].c};
    c.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;text-align:center">${Object.entries(s).map(([k,v])=>`<div style="background:var(--card2);padding:16px;border-radius:12px;border:1px solid var(--border)"><div style="font-family:'Russo One',sans-serif;color:var(--gold);font-size:24px">${v}</div><div style="font-size:11px;color:var(--muted)">${k}</div></div>`).join('')}</div>`;
  }
};
window.mkR=(id,role)=>{ const u=q("SELECT username FROM users WHERE id=?", [id])[0]; if(u.username==='vikna'){ alert('Founder protected'); return; } exec("UPDATE users SET role=? WHERE id=?", [role,id]); adminTab('users'); };
window.delU=(id)=>{ const u=q("SELECT username FROM users WHERE id=?", [id])[0]; if(u.username==='vikna'){ alert('Founder protected'); return; } if(!confirm('Delete?')) return; exec("DELETE FROM votes WHERE user_id=?", [id]); exec("DELETE FROM messages WHERE sender_id=? OR receiver_id=?", [id,id]); exec("DELETE FROM comments WHERE author_id=?", [id]); exec("DELETE FROM posts WHERE author_id=?", [id]); exec("DELETE FROM subreddits WHERE creator_id=?", [id]); exec("DELETE FROM users WHERE id=?", [id]); adminTab('users'); };
window.delS=(id)=>{ if(!confirm('Delete?')) return; exec("DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE subreddit_id=?)", [id]); exec("DELETE FROM posts WHERE subreddit_id=?", [id]); exec("DELETE FROM subreddits WHERE id=?", [id]); adminTab('subreddits'); };
window.delP=(id)=>{ if(!confirm('Delete?')) return; exec("DELETE FROM comments WHERE post_id=?", [id]); exec("DELETE FROM votes WHERE target_id=? AND target_type='post'", [id]); exec("DELETE FROM posts WHERE id=?", [id]); adminTab('posts'); };

// chat
window.toggleChat=()=>{
  if(!me){ go('auth'); return; }
  $('#chatPanel').classList.toggle('hidden');
  if(!$('#chatPanel').classList.contains('hidden')) refreshChatUsers();
};
function refreshChatUsers(){
  if(!me) return;
  const all=q("SELECT id, username, role FROM users WHERE id!=? ORDER BY username", [me.id]);
  const conv=q("SELECT u.id, (SELECT COUNT(*) FROM messages WHERE sender_id=u.id AND receiver_id=? AND read=0) as unread, (SELECT created_at FROM messages WHERE (sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id) ORDER BY created_at DESC LIMIT 1) as last_at FROM users u WHERE u.id!=? ORDER BY last_at DESC", [me.id, me.id, me.id, me.id]);
  const ord=new Map(conv.map(c=>[c.id,c]));
  const ordered=[...all].sort((a,b)=> (ord.get(b.id)?.last_at||'') > (ord.get(a.id)?.last_at||'') ? 1 : -1);
  const list=$('#chatUserList');
  list.innerHTML=ordered.map(u=>{
    const unread=ord.get(u.id)?.unread||0;
    return `<div class="user-item ${chatWith===u.id?'active':''}" onclick="openChat(${u.id})"><span>${esc(u.username)} ${u.role==='ADMIN'?'۞':''}</span>${unread?`<span style="background:var(--red);color:#fff;font-size:10px;padding:2px 6px;border-radius:10px">${unread}</span>`:''}</div>`;
  }).join('') || '<div style="padding:10px;color:var(--muted);font-size:11px">No users</div>';
  updateBadge();
}
function updateBadge(){
  if(!me) return;
  const c=q("SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND read=0", [me.id])[0].c;
  const b=$('#chatBadge'); if(c>0){ b.textContent=c; b.classList.remove('hidden'); } else b.classList.add('hidden');
}
window.openChat=(uid)=>{
  chatWith=uid;
  exec("UPDATE messages SET read=1 WHERE sender_id=? AND receiver_id=?", [uid, me.id]);
  refreshChatUsers();
  const msgs=q("SELECT * FROM messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY created_at ASC", [me.id, uid, uid, me.id]);
  const area=$('#msgArea');
  if(!msgs.length) area.innerHTML='<div style="color:var(--muted);font-size:11px;text-align:center;margin-top:20px">No messages yet</div>';
  else area.innerHTML=msgs.map(m=>`<div class="msg ${m.sender_id===me.id?'sent':'received'}">${esc(m.content)}<div style="font-size:9px;opacity:0.6;margin-top:4px">${new Date(m.created_at).toLocaleTimeString()}</div></div>`).join('');
  area.scrollTop=area.scrollHeight;
};
window.sendMsg=()=>{
  if(!me){ go('auth'); return; }
  const inp=$('#chatInput'); const t=inp.value.trim(); if(!t||!chatWith) return;
  if(!q("SELECT id FROM users WHERE id=?", [chatWith]).length){ alert('User not found'); return; }
  exec("INSERT INTO messages (sender_id,receiver_id,content,created_at,read) VALUES (?,?,?,?,?)", [me.id, chatWith, t.slice(0,2000), new Date().toISOString(), 0]);
  inp.value=''; openChat(chatWith);
};
window.broadcastMsg=()=>{
  if(!me||me.role!=='ADMIN') return;
  const t=prompt('Broadcast to all:'); if(!t) return;
  const users=q("SELECT id FROM users WHERE id!=?", [me.id]);
  users.forEach(u=> exec("INSERT INTO messages (sender_id,receiver_id,content,created_at,read) VALUES (?,?,?,?,?)", [me.id, u.id, t.slice(0,2000), new Date().toISOString(), 0]));
  alert('Sent to '+users.length+' users'); refreshChatUsers();
};

initDB();
