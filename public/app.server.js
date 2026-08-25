const $ = s => document.querySelector(s);
const app = $('#app');
let me = null;
let token = localStorage.getItem('vikna_token') || null;
let view = 'subreddits';
let currentSub = null;
let currentPost = null;
let chatWith = null;
let ws = null;
let myVotes = [];

// stars bg
const sc = $('#stars');
for(let i=0;i<18;i++){let s=document.createElement('span');s.textContent='۞';s.style.left=Math.random()*100+'%';s.style.top=Math.random()*100+'%';s.style.animationDelay=(Math.random()*5)+'s';s.style.fontSize=(14+Math.random()*18)+'px';sc.appendChild(s);}

function headers(){ const h={'Content-Type':'application/json'}; if(token) h['Authorization']='Bearer '+token; return h; }
async function api(path, opts={}){
  opts.headers = {...headers(), ...(opts.headers||{})};
  if(opts.body && typeof opts.body!=='string') opts.body=JSON.stringify(opts.body);
  const r=await fetch(path, opts);
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||'Error');
  return data;
}
function esc(s){ return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }
function go(v){ view=v; render(); }

async function loadMe(){
  if(!token){ me=null; updateHeader(); return; }
  try{ me=await api('/api/auth/me'); updateHeader(); connectWS(); refreshVotes(); }catch{ token=null; localStorage.removeItem('vikna_token'); me=null; updateHeader(); }
}
function updateHeader(){
  const badge=$('#userBadge'), lb=$('#logoutBtn'), ab=$('#adminBtn'), logb=$('#loginBtn'), bc=$('#broadcastBtn');
  if(me){ badge.textContent='۞ '+me.username+' · '+me.role; lb.classList.remove('hidden'); logb.classList.add('hidden'); if(me.role==='ADMIN'){ab.classList.remove('hidden'); bc.style.display=''}else{ab.classList.add('hidden'); bc.style.display='none'} } 
  else { badge.textContent='۞ UNAUTH'; lb.classList.add('hidden'); ab.classList.add('hidden'); logb.classList.remove('hidden'); bc.style.display='none' }
}
async function refreshVotes(){ if(!me){ myVotes=[]; return; } try{ myVotes=await api('/api/votes/my'); }catch{} }

function voteState(id,type){ const f=myVotes.find(v=>v.target_id===id && v.target_type===type); return f?f.vote:0 }

async function logout(){ try{ await api('/api/auth/logout',{method:'POST'})}catch{} token=null; localStorage.removeItem('vikna_token'); me=null; if(ws) ws.close(); updateHeader(); go('subreddits'); }
window.logout=logout; window.go=go;

// welcome modal
if(localStorage.getItem('vikna_welcomed')) $('#welcomeModal').classList.add('hidden');
window.startAudio=()=>{
  $('#welcomeModal').classList.add('hidden'); localStorage.setItem('vikna_welcomed','1');
  const f=$('#ytAudio'); f.src='https://www.youtube.com/embed/NYzFsFWdVcE?autoplay=1&mute=0&loop=1&playlist=NYzFsFWdVcE&enablejsapi=1';
  $('#audioToggle').textContent='🔊 Mute Audio'; window._muted=false;
}
window.toggleAudio=()=>{
  const f=$('#ytAudio'); if(!f.src){ startAudio(); return } window._muted=!window._muted;
  try{ const u=new URL(f.src); u.searchParams.set('mute', window._muted?'1':'0'); f.src=u.toString(); }catch{}
  $('#audioToggle').textContent= window._muted ? '🔇 Unmute Audio' : '🔊 Mute Audio';
}

// WS
function connectWS(){
  if(!token || ws) return;
  const proto = location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(`${proto}//${location.host}?token=${encodeURIComponent(token)}`);
  ws.onmessage=(e)=>{
    try{
      const d=JSON.parse(e.data);
      if(d.type==='message'){
        // if chat open, refresh
        if(d.message && (d.message.sender_id===chatWith || d.message.receiver_id===chatWith)){
          openChat(chatWith);
        }
        refreshChatUsers(); updateBadge();
      }
      if(d.type==='new_comment' && view==='postDetail' && currentPost && d.post_id===currentPost.id){
        renderPostDetail();
      }
    }catch{}
  };
  ws.onclose=()=>{ ws=null; if(me) setTimeout(connectWS,3000) };
}

// chat
window.toggleChat=()=>{
  if(!me){ go('auth'); return; }
  $('#chatPanel').classList.toggle('hidden');
  if(!$('#chatPanel').classList.contains('hidden')) refreshChatUsers();
};
async function refreshChatUsers(){
  if(!me) return;
  const users=await api('/api/users');
  const conv=await api('/api/messages/conversations').catch(()=>[]);
  const convIds=new Set(conv.map(c=>c.id));
  // order: conv first, then others
  const ordered=[...conv.map(c=> users.find(u=>u.id===c.id)).filter(Boolean), ...users.filter(u=>u.id!==me.id && !convIds.has(u.id))];
  const list=$('#chatUserList');
  list.innerHTML=ordered.map(u=>{
    const c=conv.find(x=>x.id===u.id);
    const unread=c?.unread||0;
    return `<div class="user-item ${chatWith===u.id?'active':''}" onclick="openChat(${u.id})"><span>${esc(u.username)} ${u.role==='ADMIN'?'۞':''}</span>${unread?`<span style="background:var(--red);color:#fff;font-size:10px;padding:2px 6px;border-radius:10px">${unread}</span>`:''}</div>`;
  }).join('');
  updateBadge();
}
async function updateBadge(){
  if(!me) return;
  try{ const {count}=await api('/api/messages/unread/count'); const b=$('#chatBadge'); if(count>0){b.textContent=count; b.classList.remove('hidden')} else b.classList.add('hidden'); }catch{}
}
window.openChat=async(uid)=>{
  chatWith=uid;
  await api('/api/messages/'+uid); // marks read
  const msgs=await api('/api/messages/'+uid);
  const area=$('#msgArea');
  if(!msgs.length) area.innerHTML='<div style="color:var(--muted);font-size:11px;text-align:center;margin-top:20px">No messages yet</div>';
  else area.innerHTML=msgs.map(m=>`<div class="msg ${m.sender_id===me.id?'sent':'received'}">${esc(m.content)}<div style="font-size:9px;opacity:0.6;margin-top:4px">${new Date(m.created_at).toLocaleTimeString()}</div></div>`).join('');
  area.scrollTop=area.scrollHeight;
  refreshChatUsers();
};
window.sendMsg=async()=>{
  const inp=$('#chatInput'); const t=inp.value.trim(); if(!t||!chatWith) return;
  await api('/api/messages/'+chatWith,{method:'POST',body:{content:t}});
  inp.value=''; openChat(chatWith);
};
$('#chatInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') sendMsg(); });
window.broadcastMsg=async()=>{
  const t=prompt('Broadcast to all users:'); if(!t) return;
  await api('/api/messages/broadcast',{method:'POST',body:{content:t}});
  alert('Broadcast sent');
};

// views
async function render(){
  if(view==='auth') return renderAuth();
  if(view==='profile') return renderProfile();
  if(view==='admin') return renderAdmin();
  if(view==='postDetail' && currentPost) return renderPostDetail();
  if(view==='posts' && currentSub) return renderPosts();
  return renderSubreddits();
}

function renderAuth(mode='login'){
  let m=mode;
  function draw(msg='', ok=''){
    app.innerHTML=`<div class="card auth-wrap" style="text-align:center"><h2>۞ ${m==='login'?'Login':'Register'}</h2>
      <input id="au" placeholder="Username (3-20, a-z0-9_-)" style="margin-top:10px">
      <input id="ap" type="password" placeholder="Password (3-72 chars)" style="margin-top:8px">
      ${msg?`<div class="err">${esc(msg)}</div>`:''}${ok?`<div class="ok">${esc(ok)}</div>`:''}
      <button class="btn" style="width:100%;margin-top:10px" id="abtn">${m==='login'?'Login':'Register'}</button>
      <p style="margin-top:12px"><span class="link" style="color:var(--gold);cursor:pointer" id="sw">${m==='login'?'Create account':'Have account? Login'}</span></p>
      <p style="margin-top:8px"><button class="btn outline sm" onclick="go('subreddits')">← Back</button></p>
      <p style="margin-top:10px;font-size:11px;color:var(--muted)">Founder: vikna / 1342@#..</p>
    </div>`;
    $('#sw').onclick=()=>{ m=m==='login'?'register':'login'; draw(); };
    $('#abtn').onclick=async()=>{
      const u=$('#au').value.trim(), p=$('#ap').value;
      try{
        if(m==='register'){
          await api('/api/auth/register',{method:'POST',body:{username:u,password:p}});
          m='login'; draw('','Account created — now login');
        } else {
          const d=await api('/api/auth/login',{method:'POST',body:{username:u,password:p}});
          token=d.token; localStorage.setItem('vikna_token',token); me=d.user;
          updateHeader(); connectWS(); refreshVotes(); go('subreddits');
        }
      }catch(e){ draw(e.message); }
    };
  }
  draw();
}

async function renderSubreddits(){
  view='subreddits'; currentSub=null; currentPost=null;
  const subs=await api('/api/subreddits');
  app.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px"><h2 style="font-family:'Russo One',sans-serif;color:var(--gold)">۞ Subreddits</h2><button class="btn sm" onclick="newSub()">+ New Subreddit</button></div>
    <div class="sub-grid">${subs.length?subs.map(s=>`<div class="sub-card" onclick="openSub(${s.id})"><h4>۞ ${esc(s.name)}</h4><p style="font-size:12px;color:var(--muted);margin:6px 0">${esc(s.description||'No description')}</p><div class="meta">by ${esc(s.creator||'?')} · ${s.post_count} posts · ${new Date(s.created_at).toLocaleDateString()}</div></div>`).join(''):`<div class="card" style="text-align:center;color:var(--muted)">No subreddits yet. Create the first one!</div>`}</div>`;
}
window.newSub=async()=>{
  if(!me){ go('auth'); return }
  const name=prompt('Subreddit name (2-40):'); if(!name) return;
  const desc=prompt('Description:')||'';
  try{ await api('/api/subreddits',{method:'POST',body:{name,description:desc}}); renderSubreddits(); }catch(e){ alert(e.message) }
};
window.openSub=async(id)=>{
  const s=await api('/api/subreddits/'+id); currentSub=s; view='posts'; renderPosts();
};

async function renderPosts(){
  await refreshVotes();
  const posts=await api('/api/subreddits/'+currentSub.id+'/posts');
  app.innerHTML=`<div class="view-nav"><button onclick="go('subreddits')">← All Subreddits</button><span style="background:var(--gold);color:#000;padding:6px 12px;border-radius:20px;font-family:'Russo One',sans-serif;font-size:12px">۞ ${esc(currentSub.name)}</span></div>
    <div class="card"><p style="color:var(--muted);font-size:12px">${esc(currentSub.description||'')}</p><div style="margin-top:10px"><button class="btn sm" onclick="newPost()">+ New Post</button></div></div>
    ${posts.length?posts.map(p=>{
      const score=(p.upvotes||0)-(p.downvotes||0); const vs=voteState(p.id,'post');
      return `<div class="post-row" onclick="openPost(${p.id})"><div style="font-family:'Russo One',sans-serif;color:var(--gold)">${esc(p.title)}</div><div style="font-size:12px;color:var(--muted);margin:4px 0;white-space:pre-wrap">${esc((p.content||'').slice(0,160))}${(p.content||'').length>160?'…':''}</div><div class="meta">by ${esc(p.author||'?')} · ${p.comment_count} comments · ${new Date(p.created_at).toLocaleString()}</div><div class="vote-bar" onclick="event.stopPropagation()"><button class="vote-btn ${vs===1?'active up':''}" onclick="doVote('post',${p.id},1)">▲</button><span style="font-size:12px;min-width:22px;text-align:center">${score}</span><button class="vote-btn ${vs===-1?'active down':''}" onclick="doVote('post',${p.id},-1)">▼</button></div></div>`;
    }).join(''):`<div class="card" style="text-align:center;color:var(--muted)">No posts yet.</div>`}`;
}
window.newPost=async()=>{
  if(!me){ go('auth'); return }
  const title=prompt('Post title:'); if(!title) return;
  const content=prompt('Content:')||'';
  await api('/api/subreddits/'+currentSub.id+'/posts',{method:'POST',body:{title,content}});
  renderPosts();
};
window.openPost=async(id)=>{
  const p=await api('/api/posts/'+id); currentPost=p; view='postDetail'; renderPostDetail();
};

async function renderPostDetail(){
  await refreshVotes();
  const p=await api('/api/posts/'+currentPost.id); currentPost=p;
  const comments=await api('/api/posts/'+p.id+'/comments');
  const score=(p.upvotes||0)-(p.downvotes||0); const vs=voteState(p.id,'post');
  function tree(list,parent=null){
    return list.filter(c=> (c.parent_id||null)==parent).map(c=>{
      const cs=(c.upvotes||0)-(c.downvotes||0); const cv=voteState(c.id,'comment');
      return `<div class="comment ${parent?'reply':''}"><div style="font-size:11px;color:var(--gold)">${esc(c.author||'?')} · <span style="color:var(--muted)">${new Date(c.created_at).toLocaleString()}</span> ${me && (me.role==='ADMIN'||me.id===c.author_id)?`<span style="color:#ff6b6b;cursor:pointer;margin-left:8px" onclick="delComment(${c.id})">delete</span>`:''}</div><div style="font-size:13px;margin:6px 0;white-space:pre-wrap">${esc(c.content)}</div><div class="vote-bar"><button class="vote-btn ${cv===1?'active up':''}" onclick="doVote('comment',${c.id},1)">▲</button><span style="font-size:11px">${cs}</span><button class="vote-btn ${cv===-1?'active down':''}" onclick="doVote('comment',${c.id},-1)">▼</button><span class="link" style="margin-left:10px;color:var(--gold);cursor:pointer" onclick="replyC(${c.id})">Reply</span></div>${tree(list,c.id)}</div>`;
    }).join('');
  }
  app.innerHTML=`<div class="view-nav"><button onclick="view='posts';render()">← Back to ${esc(p.subreddit_name||'posts')}</button></div>
    <div class="card"><h2>۞ ${esc(p.title)}</h2><div class="meta">by ${esc(p.author||'?')} in ۞ ${esc(p.subreddit_name||'?')} · ${new Date(p.created_at).toLocaleString()} ${me && (me.role==='ADMIN'||me.id===p.author_id)?`<button class="btn red sm" style="margin-left:8px" onclick="delPost(${p.id})">Delete</button>`:''}</div><p style="margin:14px 0;white-space:pre-wrap;line-height:1.6">${esc(p.content||'')}</p><div class="vote-bar"><button class="vote-btn ${vs===1?'active up':''}" onclick="doVote('post',${p.id},1)">▲ Upvote</button><span style="font-weight:700">${score} score</span><button class="vote-btn ${vs===-1?'active down':''}" onclick="doVote('post',${p.id},-1)">▼ Downvote</button></div></div>
    <div class="card"><h3>Comments</h3><textarea id="ci" placeholder="Write a comment..."></textarea><button class="btn sm" style="margin-top:8px" onclick="postC()">Post Comment</button><div style="margin-top:14px">${comments.length?tree(comments):'<p style="color:var(--muted);font-size:12px">No comments yet.</p>'}</div></div>`;
}
window.postC=async()=>{
  if(!me){ go('auth'); return }
  const v=$('#ci').value.trim(); if(!v) return;
  await api('/api/posts/'+currentPost.id+'/comments',{method:'POST',body:{content:v}});
  renderPostDetail();
};
window.replyC=async(pid)=>{
  if(!me){ go('auth'); return }
  const t=prompt('Reply:'); if(!t) return;
  await api('/api/posts/'+currentPost.id+'/comments',{method:'POST',body:{content:t,parent_id:pid}});
  renderPostDetail();
};
window.delComment=async(id)=>{ if(!confirm('Delete comment?'))return; await api('/api/comments/'+id,{method:'DELETE'}); renderPostDetail(); };
window.delPost=async(id)=>{ if(!confirm('Delete post?'))return; await api('/api/posts/'+id,{method:'DELETE'}); view='posts'; render(); };
window.doVote=async(type,id,v)=>{
  if(!me){ go('auth'); return }
  await api('/api/vote',{method:'POST',body:{target_id:id,target_type:type,vote:v}});
  await refreshVotes();
  if(view==='postDetail') renderPostDetail(); else renderPosts();
};

async function renderProfile(){
  if(!me){ go('auth'); return }
  const u=await api('/api/auth/me');
  app.innerHTML=`<div class="card" style="text-align:center"><h2>۞ ${esc(u.username)}</h2><p class="meta">Role: ${u.role} · Karma: ${u.karma} · Joined: ${new Date(u.created_at).toLocaleDateString()}</p>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn sm" onclick="changePw()">Change Password</button>${u.username!=='vikna'?'<button class="btn red sm" onclick="delAcc()">Delete Account</button>':''}</div></div>
    <div style="text-align:center"><button class="btn outline sm" onclick="go('subreddits')">← Back</button></div>`;
}
window.changePw=async()=>{
  const oldP=prompt('Old password:'); if(oldP===null) return;
  const np=prompt('New password (min 3):'); if(!np||np.length<3){alert('min 3');return}
  const c=prompt('Confirm:'); if(c!==np){alert('Mismatch');return}
  try{ await api('/api/auth/change-password',{method:'POST',body:{oldPassword:oldP,newPassword:np}}); alert('Password changed'); }catch(e){ alert(e.message) }
};
window.delAcc=async()=>{
  if(!confirm('Delete account and all content?')) return;
  await api('/api/auth/account',{method:'DELETE'}); token=null; localStorage.removeItem('vikna_token'); me=null; updateHeader(); go('subreddits');
};

async function renderAdmin(){
  if(!me||me.role!=='ADMIN'){ go('subreddits'); return }
  app.innerHTML=`<h2 style="font-family:'Russo One',sans-serif;color:var(--gold);margin-bottom:12px">⚙️ Admin Panel</h2>
    <div class="tabs"><button id="tU" class="active" onclick="adminTab('users')">Users</button><button id="tS" onclick="adminTab('subreddits')">Subreddits</button><button id="tP" onclick="adminTab('posts')">Posts</button><button id="tC" onclick="adminTab('comments')">Comments</button><button id="tSt" onclick="adminTab('stats')">Stats</button></div>
    <div class="card" id="ac"></div><div style="text-align:center;margin-top:10px"><button class="btn outline sm" onclick="go('subreddits')">← Back</button></div>`;
  adminTab('users');
}
window.adminTab=async(t)=>{
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  const map={users:'tU',subreddits:'tS',posts:'tP',comments:'tC',stats:'tSt'}; const el=document.getElementById(map[t]); if(el) el.classList.add('active');
  const c=$('#ac');
  if(t==='users'){
    const users=await api('/api/admin/users');
    c.innerHTML=`<table><tr><th>ID</th><th>Username</th><th>Role</th><th>Karma</th><th>Actions</th></tr>${users.map(u=>`<tr><td>${u.id}</td><td>${esc(u.username)} ${u.username==='vikna'?'۞':''}</td><td>${u.role}</td><td>${u.karma}</td><td>${u.username==='vikna'?'protected':`<button class="btn sm" onclick="mkR(${u.id},'ADMIN')">Admin</button> <button class="btn sm ghost" onclick="mkR(${u.id},'USER')">User</button> <button class="btn sm red" onclick="delU(${u.id})">Delete</button>`}</td></tr>`).join('')}</table>`;
  } else if(t==='subreddits'){
    const subs=await api('/api/subreddits');
    c.innerHTML=`<table><tr><th>ID</th><th>Name</th><th>Creator</th><th>Action</th></tr>${subs.map(s=>`<tr><td>${s.id}</td><td>${esc(s.name)}</td><td>${esc(s.creator||'?')}</td><td><button class="btn sm red" onclick="delS(${s.id})">Delete</button></td></tr>`).join('')||'<tr><td colspan=4>none</td></tr>'}</table>`;
  } else if(t==='posts'){
    const posts=await api('/api/posts');
    c.innerHTML=`<table><tr><th>ID</th><th>Title</th><th>Author</th><th>Action</th></tr>${posts.slice(0,50).map(p=>`<tr><td>${p.id}</td><td>${esc(p.title).slice(0,40)}</td><td>${esc(p.author||'?')}</td><td><button class="btn sm red" onclick="delPostAdmin(${p.id})">Delete</button></td></tr>`).join('')||'<tr><td colspan=4>none</td></tr>'}</table>`;
  } else if(t==='comments'){
    // fetch all posts then comments? simplify: show message
    c.innerHTML=`<p style="color:var(--muted)">Use post detail to moderate comments. Admin can delete any comment from its post view.</p>`;
  } else if(t==='stats'){
    const s=await api('/api/admin/stats');
    c.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;text-align:center">${Object.entries(s).map(([k,v])=>`<div style="background:var(--card2);padding:16px;border-radius:12px;border:1px solid var(--border)"><div style="font-family:'Russo One',sans-serif;color:var(--gold);font-size:24px">${v}</div><div style="font-size:11px;color:var(--muted)">${k}</div></div>`).join('')}</div>`;
  }
};
window.mkR=async(id,role)=>{ await api('/api/admin/users/'+id+'/role',{method:'PATCH',body:{role}}); adminTab('users'); };
window.delU=async(id)=>{ if(!confirm('Delete user?'))return; await api('/api/admin/users/'+id,{method:'DELETE'}); adminTab('users'); };
window.delS=async(id)=>{ if(!confirm('Delete subreddit & all posts?'))return; await api('/api/subreddits/'+id,{method:'DELETE'}); adminTab('subreddits'); };
window.delPostAdmin=async(id)=>{ if(!confirm('Delete post?'))return; await api('/api/posts/'+id,{method:'DELETE'}); adminTab('posts'); };

// init
await loadMe();
render();
setInterval(updateBadge,3000);
