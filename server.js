import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import validator from 'validator';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vikna-ilyas-sbihan-2026-super-secret-jwt-key-change-in-prod-32chars!';
const JWT_EXPIRES = '7d';
const BCRYPT_ROUNDS = 12;

// --- DB ---
const db = new DatabaseSync(path.join(__dirname, 'vikna.db'));
db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','ADMIN')),
  karma INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subreddits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subreddit_id INTEGER NOT NULL REFERENCES subreddits(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS votes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')),
  vote INTEGER NOT NULL CHECK(vote IN (1,-1)),
  PRIMARY KEY(user_id,target_id,target_type)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id,receiver_id);
`);

// founder
const founder = db.prepare("SELECT id FROM users WHERE username='vikna'").get();
if (!founder) {
  const hash = bcrypt.hashSync('1342@#..', BCRYPT_ROUNDS);
  db.prepare("INSERT INTO users (username,password_hash,role,karma,created_at) VALUES (?,?,?,?,?)").run('vikna', hash, 'ADMIN', 0, new Date().toISOString());
  console.log('✓ Founder vikna created');
}

// --- middleware ---
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// rate limiters
const loginLimiter = rateLimit({ windowMs: 60*1000, max: 10, message: { error: 'Too many attempts, try later' } });
const generalLimiter = rateLimit({ windowMs: 60*1000, max: 120 });

// helpers
function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
function auth(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT id,username,role,karma,created_at FROM users WHERE id=?").get(payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}
function adminOnly(req,res,next){ if(req.user.role!=='ADMIN') return res.status(403).json({error:'Admin only'}); next(); }
function sanitize(s, max=5000){ if(typeof s!=='string') return ''; s=validator.escape(s.trim()); if(s.length>max) s=s.slice(0,max); return s; }
function cleanUsername(u){
  u = u.trim();
  if(!validator.isLength(u,{min:3,max:20})) throw new Error('Username 3-20 chars');
  if(!validator.isAlphanumeric(u.replace(/[_-]/g,''))) throw new Error('Username alphanumeric + _ - only');
  return u;
}

// --- Auth routes ---
app.post('/api/auth/register', loginLimiter, (req,res)=>{
  try{
    let {username,password}=req.body;
    if(!username||!password) return res.status(400).json({error:'Missing fields'});
    username=cleanUsername(username);
    if(!validator.isLength(password,{min:3,max:72})) return res.status(400).json({error:'Password 3-72 chars'});
    const exists=db.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE").get(username);
    if(exists) return res.status(409).json({error:'Username already taken'});
    const hash=bcrypt.hashSync(password,BCRYPT_ROUNDS);
    const r=db.prepare("INSERT INTO users (username,password_hash,role,karma,created_at) VALUES (?,?,?,?,?)").run(username,hash,'USER',0,new Date().toISOString());
    res.json({id:r.lastInsertRowid,username});
  }catch(e){ res.status(400).json({error:e.message}) }
});

app.post('/api/auth/login', loginLimiter, (req,res)=>{
  const {username,password}=req.body;
  if(!username||!password) return res.status(400).json({error:'Missing fields'});
  const user=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(username.trim());
  if(!user) return res.status(401).json({error:'User not found'});
  if(!bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:'Invalid password'});
  const token=signToken(user);
  res.cookie('token',token,{httpOnly:true,secure:false,sameSite:'lax',maxAge:7*24*60*60*1000});
  res.json({token,user:{id:user.id,username:user.username,role:user.role,karma:user.karma,created_at:user.created_at}});
});

app.post('/api/auth/logout', (req,res)=>{ res.clearCookie('token'); res.json({ok:true}) });
app.get('/api/auth/me', auth, (req,res)=> res.json(req.user));
app.post('/api/auth/change-password', auth, (req,res)=>{
  const {oldPassword,newPassword}=req.body;
  if(!oldPassword||!newPassword) return res.status(400).json({error:'Missing'});
  if(!validator.isLength(newPassword,{min:3,max:72})) return res.status(400).json({error:'Password 3-72 chars'});
  const full=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if(!bcrypt.compareSync(oldPassword,full.password_hash)) return res.status(401).json({error:'Old password incorrect'});
  const hash=bcrypt.hashSync(newPassword,BCRYPT_ROUNDS);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash,req.user.id);
  res.json({ok:true});
});
app.delete('/api/auth/account', auth, (req,res)=>{
  if(req.user.username.toLowerCase()==='vikna') return res.status(403).json({error:'Founder cannot be deleted'});
  const id=req.user.id;
  db.prepare("DELETE FROM votes WHERE user_id=?").run(id);
  db.prepare("DELETE FROM messages WHERE sender_id=? OR receiver_id=?").run(id,id);
  db.prepare("DELETE FROM comments WHERE author_id=?").run(id);
  db.prepare("DELETE FROM posts WHERE author_id=?").run(id);
  db.prepare("DELETE FROM subreddits WHERE creator_id=?").run(id);
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  res.clearCookie('token');
  res.json({ok:true});
});

// subreddits
app.get('/api/subreddits', (req,res)=>{
  const rows=db.prepare(`SELECT s.*, u.username as creator,
    (SELECT COUNT(*) FROM posts WHERE subreddit_id=s.id) as post_count
    FROM subreddits s LEFT JOIN users u ON u.id=s.creator_id ORDER BY s.created_at DESC`).all();
  res.json(rows);
});
app.post('/api/subreddits', auth, (req,res)=>{
  let {name,description}=req.body;
  if(!name) return res.status(400).json({error:'Name required'});
  name=sanitize(name,40); description=sanitize(description||'',300);
  if(!validator.isLength(name,{min:2,max:40})) return res.status(400).json({error:'Name 2-40 chars'});
  try{
    const r=db.prepare("INSERT INTO subreddits (name,description,creator_id,created_at) VALUES (?,?,?,?)").run(name,description,req.user.id,new Date().toISOString());
    res.json({id:r.lastInsertRowid,name,description});
  }catch(e){ res.status(409).json({error:'Name already taken'}) }
});
app.get('/api/subreddits/:id', (req,res)=>{
  const r=db.prepare("SELECT s.*, u.username as creator FROM subreddits s LEFT JOIN users u ON u.id=s.creator_id WHERE s.id=?").get(req.params.id);
  if(!r) return res.status(404).json({error:'Not found'});
  res.json(r);
});
app.delete('/api/subreddits/:id', auth, adminOnly, (req,res)=>{
  const id=req.params.id;
  db.prepare("DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE subreddit_id=?)").run(id);
  db.prepare("DELETE FROM posts WHERE subreddit_id=?").run(id);
  db.prepare("DELETE FROM subreddits WHERE id=?").run(id);
  res.json({ok:true});
});

// posts
app.get('/api/subreddits/:id/posts', (req,res)=>{
  const rows=db.prepare(`SELECT p.*, u.username as author,
    (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comment_count
    FROM posts p LEFT JOIN users u ON u.id=p.author_id WHERE p.subreddit_id=? ORDER BY p.created_at DESC`).all(req.params.id);
  res.json(rows);
});
app.post('/api/subreddits/:id/posts', auth, (req,res)=>{
  let {title,content}=req.body;
  if(!title) return res.status(400).json({error:'Title required'});
  title=sanitize(title,120); content=sanitize(content||'',5000);
  const r=db.prepare("INSERT INTO posts (title,content,author_id,subreddit_id,created_at) VALUES (?,?,?,?,?)").run(title,content,req.user.id,req.params.id,new Date().toISOString());
  res.json({id:r.lastInsertRowid,title,content});
});
app.get('/api/posts/:id', (req,res)=>{
  const p=db.prepare(`SELECT p.*, u.username as author, s.name as subreddit_name FROM posts p
    LEFT JOIN users u ON u.id=p.author_id LEFT JOIN subreddits s ON s.id=p.subreddit_id WHERE p.id=?`).get(req.params.id);
  if(!p) return res.status(404).json({error:'Not found'});
  res.json(p);
});
app.delete('/api/posts/:id', auth, (req,res)=>{
  const p=db.prepare("SELECT author_id FROM posts WHERE id=?").get(req.params.id);
  if(!p) return res.status(404).json({error:'Not found'});
  if(req.user.role!=='ADMIN' && p.author_id!==req.user.id) return res.status(403).json({error:'Forbidden'});
  db.prepare("DELETE FROM comments WHERE post_id=?").run(req.params.id);
  db.prepare("DELETE FROM votes WHERE target_id=? AND target_type='post'").run(req.params.id);
  db.prepare("DELETE FROM posts WHERE id=?").run(req.params.id);
  res.json({ok:true});
});
app.get('/api/posts', (req,res)=>{
  const rows=db.prepare(`SELECT p.*, u.username as author, s.name as subreddit_name,
    (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comment_count
    FROM posts p LEFT JOIN users u ON u.id=p.author_id LEFT JOIN subreddits s ON s.id=p.subreddit_id ORDER BY p.created_at DESC LIMIT 50`).all();
  res.json(rows);
});

// comments
app.get('/api/posts/:id/comments', (req,res)=>{
  const rows=db.prepare(`SELECT c.*, u.username as author FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.post_id=? ORDER BY c.created_at ASC`).all(req.params.id);
  res.json(rows);
});
app.post('/api/posts/:id/comments', auth, (req,res)=>{
  let {content,parent_id}=req.body;
  if(!content) return res.status(400).json({error:'Content required'});
  content=sanitize(content,2000);
  const r=db.prepare("INSERT INTO comments (post_id,parent_id,author_id,content,created_at) VALUES (?,?,?,?,?)").run(req.params.id, parent_id||null, req.user.id, content, new Date().toISOString());
  const row=db.prepare(`SELECT c.*, u.username as author FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.id=?`).get(r.lastInsertRowid);
  // notify WS
  broadcastWS({type:'new_comment', post_id: Number(req.params.id), comment: row});
  res.json(row);
});
app.delete('/api/comments/:id', auth, (req,res)=>{
  const c=db.prepare("SELECT author_id FROM comments WHERE id=?").get(req.params.id);
  if(!c) return res.status(404).json({error:'Not found'});
  if(req.user.role!=='ADMIN' && c.author_id!==req.user.id) return res.status(403).json({error:'Forbidden'});
  db.prepare("DELETE FROM votes WHERE target_id=? AND target_type='comment'").run(req.params.id);
  db.prepare("DELETE FROM comments WHERE id=?").run(req.params.id);
  res.json({ok:true});
});

// voting
app.post('/api/vote', auth, (req,res)=>{
  const {target_id,target_type,vote}=req.body;
  if(![1,-1].includes(vote)) return res.status(400).json({error:'Invalid vote'});
  if(!['post','comment'].includes(target_type)) return res.status(400).json({error:'Invalid type'});
  const table = target_type==='post'?'posts':'comments';
  const exists=db.prepare(`SELECT id, author_id FROM ${table} WHERE id=?`).get(target_id);
  if(!exists) return res.status(404).json({error:'Target not found'});
  const prev=db.prepare("SELECT vote FROM votes WHERE user_id=? AND target_id=? AND target_type=?").get(req.user.id,target_id,target_type);
  if(prev){
    if(prev.vote===vote) return res.json({ok:true,msg:'Already voted'});
    // revert
    if(prev.vote===1) db.prepare(`UPDATE ${table} SET upvotes=upvotes-1 WHERE id=?`).run(target_id);
    else db.prepare(`UPDATE ${table} SET downvotes=downvotes-1 WHERE id=?`).run(target_id);
    db.prepare("UPDATE users SET karma=karma-? WHERE id=?").run(prev.vote, exists.author_id);
    db.prepare("UPDATE votes SET vote=? WHERE user_id=? AND target_id=? AND target_type=?").run(vote,req.user.id,target_id,target_type);
  } else {
    db.prepare("INSERT INTO votes (user_id,target_id,target_type,vote) VALUES (?,?,?,?)").run(req.user.id,target_id,target_type,vote);
  }
  if(vote===1) db.prepare(`UPDATE ${table} SET upvotes=upvotes+1 WHERE id=?`).run(target_id);
  else db.prepare(`UPDATE ${table} SET downvotes=downvotes+1 WHERE id=?`).run(target_id);
  db.prepare("UPDATE users SET karma=karma+? WHERE id=?").run(vote, exists.author_id);
  const updated=db.prepare(`SELECT upvotes,downvotes FROM ${table} WHERE id=?`).get(target_id);
  res.json({ok:true,score:updated.upvotes-updated.downvotes,upvotes:updated.upvotes,downvotes:updated.downvotes});
});
app.get('/api/votes/my', auth, (req,res)=>{
  const rows=db.prepare("SELECT target_id,target_type,vote FROM votes WHERE user_id=?").all(req.user.id);
  res.json(rows);
});

// messages
app.get('/api/users', auth, (req,res)=>{
  const rows=db.prepare("SELECT id,username,role,karma,created_at FROM users ORDER BY username").all();
  res.json(rows);
});
app.get('/api/messages/conversations', auth, (req,res)=>{
  const rows=db.prepare(`
    SELECT u.id, u.username,
      (SELECT content FROM messages WHERE (sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id) ORDER BY created_at DESC LIMIT 1) as last_msg,
      (SELECT created_at FROM messages WHERE (sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id) ORDER BY created_at DESC LIMIT 1) as last_at,
      (SELECT COUNT(*) FROM messages WHERE sender_id=u.id AND receiver_id=? AND read=0) as unread
    FROM users u WHERE u.id!=? AND EXISTS (SELECT 1 FROM messages WHERE (sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id))
    ORDER BY last_at DESC
  `).all(req.user.id,req.user.id,req.user.id,req.user.id,req.user.id,req.user.id,req.user.id,req.user.id);
  res.json(rows);
});
app.get('/api/messages/:uid', auth, (req,res)=>{
  const uid=Number(req.params.uid);
  db.prepare("UPDATE messages SET read=1 WHERE sender_id=? AND receiver_id=?").run(uid,req.user.id);
  const rows=db.prepare(`SELECT * FROM messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY created_at ASC`).all(req.user.id,uid,uid,req.user.id);
  res.json(rows);
});
app.post('/api/messages/:uid', auth, (req,res)=>{
  const uid=Number(req.params.uid);
  let {content}=req.body;
  if(!content) return res.status(400).json({error:'Empty'});
  content=sanitize(content,2000);
  const target=db.prepare("SELECT id FROM users WHERE id=?").get(uid);
  if(!target) return res.status(404).json({error:'User not found'});
  const r=db.prepare("INSERT INTO messages (sender_id,receiver_id,content,created_at,read) VALUES (?,?,?,?,?)").run(req.user.id,uid,content,new Date().toISOString(),0);
  const msg=db.prepare("SELECT * FROM messages WHERE id=?").get(r.lastInsertRowid);
  // ws push
  pushToUser(uid,{type:'message',message:msg});
  pushToUser(req.user.id,{type:'message',message:msg});
  res.json(msg);
});
app.post('/api/messages/broadcast', auth, adminOnly, (req,res)=>{
  let {content}=req.body;
  if(!content) return res.status(400).json({error:'Empty'});
  content=sanitize(content,2000);
  const users=db.prepare("SELECT id FROM users WHERE id!=?").all(req.user.id);
  for(const u of users){
    db.prepare("INSERT INTO messages (sender_id,receiver_id,content,created_at,read) VALUES (?,?,?,?,?)").run(req.user.id,u.id,content,new Date().toISOString(),0);
    pushToUser(u.id,{type:'message',message:{sender_id:req.user.id,receiver_id:u.id,content,created_at:new Date().toISOString()}});
  }
  res.json({sent:users.length});
});
app.get('/api/messages/unread/count', auth, (req,res)=>{
  const c=db.prepare("SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND read=0").get(req.user.id).c;
  res.json({count:c});
});

// admin
app.get('/api/admin/stats', auth, adminOnly, (req,res)=>{
  res.json({
    users: db.prepare("SELECT COUNT(*) as c FROM users").get().c,
    subreddits: db.prepare("SELECT COUNT(*) as c FROM subreddits").get().c,
    posts: db.prepare("SELECT COUNT(*) as c FROM posts").get().c,
    comments: db.prepare("SELECT COUNT(*) as c FROM comments").get().c,
    messages: db.prepare("SELECT COUNT(*) as c FROM messages").get().c,
  });
});
app.get('/api/admin/users', auth, adminOnly, (req,res)=>{
  res.json(db.prepare("SELECT id,username,role,karma,created_at FROM users ORDER BY id").all());
});
app.patch('/api/admin/users/:id/role', auth, adminOnly, (req,res)=>{
  const {role}=req.body;
  if(!['USER','ADMIN'].includes(role)) return res.status(400).json({error:'Invalid role'});
  const u=db.prepare("SELECT username FROM users WHERE id=?").get(req.params.id);
  if(!u) return res.status(404).json({error:'Not found'});
  if(u.username==='vikna') return res.status(403).json({error:'Founder protected'});
  db.prepare("UPDATE users SET role=? WHERE id=?").run(role,req.params.id);
  res.json({ok:true});
});
app.delete('/api/admin/users/:id', auth, adminOnly, (req,res)=>{
  const u=db.prepare("SELECT username FROM users WHERE id=?").get(req.params.id);
  if(!u) return res.status(404).json({error:'Not found'});
  if(u.username==='vikna') return res.status(403).json({error:'Founder protected'});
  const id=Number(req.params.id);
  db.prepare("DELETE FROM votes WHERE user_id=?").run(id);
  db.prepare("DELETE FROM messages WHERE sender_id=? OR receiver_id=?").run(id,id);
  db.prepare("DELETE FROM comments WHERE author_id=?").run(id);
  db.prepare("DELETE FROM posts WHERE author_id=?").run(id);
  db.prepare("DELETE FROM subreddits WHERE creator_id=?").run(id);
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  res.json({ok:true});
});

// fallback SPA
app.get('*', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

// --- WebSocket ---
const server = createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map(); // userId -> Set(ws)

function pushToUser(uid,payload){
  const set=clients.get(uid);
  if(set) for(const ws of set) if(ws.readyState===1) ws.send(JSON.stringify(payload));
}
function broadcastWS(payload){
  for(const set of clients.values()) for(const ws of set) if(ws.readyState===1) ws.send(JSON.stringify(payload));
}
wss.on('connection', (ws,req)=>{
  // auth via token query or cookie
  const url=new URL(req.url,'http://localhost');
  let token=url.searchParams.get('token') || req.headers.cookie?.match(/token=([^;]+)/)?.[1];
  if(!token){ ws.close(1008,'No token'); return; }
  try{ token=decodeURIComponent(token);}catch{}
  try{
    const payload=jwt.verify(token,JWT_SECRET);
    ws.userId=payload.id;
    if(!clients.has(ws.userId)) clients.set(ws.userId,new Set());
    clients.get(ws.userId).add(ws);
    ws.on('close',()=> clients.get(ws.userId)?.delete(ws));
    ws.send(JSON.stringify({type:'connected'}));
  }catch{ ws.close(1008,'Bad token'); }
});

server.listen(PORT, ()=> console.log(`۞ Vikna Forum running on http://localhost:${PORT}`));
