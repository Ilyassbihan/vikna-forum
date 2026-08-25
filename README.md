<img src="https://capsule-render.vercel.app/api?type=waving&color=8b0000&height=220&section=header&text=Vikna%20Forum&fontSize=62&fontColor=d4af37&fontAlignY=35&desc=Andalus%20·%20Secure%20Cryptographic%20Forum&descAlignY=55&descAlign=50&animation=fadeIn" width="100%"/>

<p align="center">
  <a href="https://github.com/ilyas/vikna-forum/actions/workflows/jekyll-gh-pages.yml"><img src="https://github.com/ilyas/vikna-forum/actions/workflows/jekyll-gh-pages.yml/badge.svg" alt="pages"/></a>
  <img src="https://img.shields.io/badge/Node-26.7-339933?logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-3.53-003B57?logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/Security-bcrypt%20%2B%20JWT%20%2B%20Helmet-d4af37" />
  <img src="https://img.shields.io/badge/License-MIT-8b0000" />
  <img src="https://img.shields.io/badge/Founded%20by-Ilyas%20Sbihan-231815?style=flat&labelColor=8b0000&color=d4af37" />
</p>

<p align="center">
  <img src="https://readme-typing-svg.herokuapp.com?font=Roboto+Mono&size=16&duration=3000&pause=800&color=D4AF37&center=true&vCenter=true&width=700&lines=%E2%9E%9E+Vikna+Communication+System+%C2%B7+Founded+by+Ilyas+Sbihan;Secure+%E2%80%A2+Private+%E2%80%A2+Impenetrable;Andalus+%2F+Moorish+%E2%80%94+deep+red+%23+gold+%E2%80%94+built+for+kings" alt="typing" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/۞-VIKNA-1a1210?style=for-the-badge&labelColor=8b0000&color=d4af37" />
  &nbsp;
  <img src="https://img.shields.io/badge/LIVE-DEMO-d4af37?style=for-the-badge&labelColor=1a1210&color=8b0000" />
</p>

---

### ✦ ۞ What is Vikna?

> **Private forum, Reddit-style — built like a vault.**  
> Deep red & gold Andalus theme • Realtime chat • Voting & Karma • Admin control • Ambient audio • Founder-protected

```
۞ ILYAS SBIHAN · VIKNA — Secure Cryptographic Messaging Platform
Your communications are encrypted and private.
```

<p align="center">
  <img src="https://raw.githubusercontent.com/platane/snk/output/github-contribution-grid-snake-dark.svg" width="95%" alt="snake"/>
</p>

---

### 🎬 Live Preview

<p align="center">
  <img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="700" alt="demo gif"/>
  <br/>
  <em>subreddits → posts → threaded comments → votes → real-time DMs</em>
</p>

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Subreddits │────▶│    Posts     │────▶│  Post Detail    │
│  ۞ Andalus  │     │  ▲ 12  ▼ 2  │     │  💬 threaded    │
│  + New      │     │  24 comments │     │  reply → reply  │
└─────────────┘     └──────────────┘     └─────────────────┘
         ▲                    ▲                     ▲
         └────────── 💬 Private Messages (WS live) ──┘
```

---

### ⚡ Features

| | Feature | Detail |
|---|---|---|
| 🏛️ | **Andalus Theme** | `#8b0000` + `#d4af37`, `۞` starfield pulse, Russo One + Roboto Mono, glass header |
| 🔐 | **Impenetrable Auth** | `bcryptjs` 12 rounds, `JWT` httpOnly, `helmet` HSTS/CSP, rate-limit, validator sanitize |
| 📱 | **Forum** | subreddits, posts, truncated cards, vote arrows, comment counts |
| 💬 | **Threads** | nested replies (`parent_id`), vote on comments, author karma `±1` |
| 👤 | **Profile** | karma, join date, change password (old→new), delete account (founder protected) |
| ⚙️ | **Admin Panel** | tabs: Users/Subreddits/Posts/Comments/Stats, promote/demote, cascade deletes |
| 💌 | **Smart Chat** | floating bubble + unread badge, `ws` realtime, user list by `latest_msg`, `📢 All` broadcast (admin) |
| 🎵 | **Audio** | welcome modal → hidden YouTube `NYzFsFWdVcE` (Belisarius Slowed), `loop=1`, mute toggle bottom-center |

---

### 🧱 Stack

<p align="center">
  <img src="https://skillicons.dev/icons?i=nodejs,express,sqlite,js,html,css&theme=dark" />
</p>

```
Backend  → Node 26 · Express 4 · node:sqlite (WAL) · bcryptjs · jsonwebtoken · helmet · cors · express-rate-limit · ws · validator
Frontend → Vanilla SPA · /public/style.css · /public/app.js · sql.js fallback for GitHub Pages
DB       → vikna.db (users, subreddits, posts, comments, votes, messages)
Deploy   → GitHub Pages via .github/workflows/jekyll-gh-pages.yml  +  VPS via `node server.js`
```

---

### 🚀 Quick Start

```bash
# 1 — clone
git clone https://github.com/ilyas/vikna-forum.git
cd vikna-forum

# 2 — install
npm install

# 3 — run (http://localhost:3000)
npm start
# or dev watch
npm run dev
```

**Founder login**
```
username: vikna
password: 1342@#..
```

> Founder is auto-created on first launch, `role=ADMIN`, cannot be deleted/demoted.

---

### 🌐 GitHub Pages (static)

This repo is Pages-ready. `server.js` runs locally/VPS, but `public/` is pure static and deploys via Jekyll workflow.

```bash
git push origin main
# → .github/workflows/jekyll-gh-pages.yml builds ./public → https://ilyas.github.io/vikna-forum/
```

Enable: **Repo → Settings → Pages → Source: GitHub Actions**

*On Pages the `/api/*` calls fallback to `sql.js` + `localStorage` (PBKDF2 150k) — no server needed.*

---

### 🔒 Security Model

```
password → bcrypt(12) → stored hash          (never plain)
login    → JWT (7d) → httpOnly Secure SameSite=lax cookie
headers  → helmet(HSTS, X-Frame SAMEORIGIN, CSP off for YT)
input    → validator.escape + length caps + prepared statements (no SQLi / XSS)
founder  → username==vikna → protected in every DELETE / role PATCH
rate     → login 10/min, global 120/min
```

Tested:
```
curl -X POST /api/auth/login -d '{"username":"vikna\" OR 1=1 --"}' → User not found ✓
<script>alert(1)</ → &lt;script&gt;alert(1) ✓
```

---

### 📂 Structure

```
democa/
├── server.js              # Express + SQLite + JWT + WS
├── package.json
├── vikna.db               # WAL SQLite (gitignored in prod)
├── public/
│   ├── index.html         # shell (relative ./ paths for Pages)
│   ├── style.css          # Andalus theme + stars pulse + shimmer
│   └── app.js             # SPA router (subreddits/posts/comments/chat/admin)
└── .github/workflows/
    └── jekyll-gh-pages.yml # Pages deploy (source: ./public)
```

---

### 🎨 Theme

```css
--red:  #8b0000   --gold: #d4af37
--dark: #0b0808   --card: #1a1210
font-title: Russo One   font-body: Roboto Mono + Inter
bg: repeating ۞ stars (5s pulse) + linear-gradient header
```

---

### 🛠️ API (when running Node)

```
POST /api/auth/register  {username,password}
POST /api/auth/login     {username,password} → {token,user}
GET  /api/auth/me        → user
POST /api/subreddits     {name,description}
GET  /api/subreddits/:id/posts
POST /api/posts/:id/comments  {content,parent_id}
POST /api/vote           {target_id,target_type,vote}
GET  /api/messages/:uid   POST /api/messages/:uid  + WS ws://host?token=
```

---

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=1a1210&height=120&section=footer&text=%20۞%20VIKNA%20&fontSize=30&fontColor=d4af37&fontAlignY=65&animation=fadeIn" width="100%"/>
  <br/>
  <b>Vikna Forum</b> — Secure Cryptographic Messaging Platform · Founded by <b>Ilyas Sbihan</b><br/>
  <code>© 2026 Vikna Communication System · Andalus Star ۞</code>
</p>
