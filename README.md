# ChatShare — Login, Chat & File Sharing by Username

A small full-stack web app with:

- **Sign up / log in** with a **unique username** and password (passwords hashed with bcrypt, sessions via cookies).
- **Live private chat** between any two users, addressed by username (Socket.IO), with history saved to disk.
- **File sharing by username** — pick a user, attach a file, they receive it instantly. Files live in one shared `uploads/` folder on the server.

No external database required — it uses simple JSON files on disk, so it deploys anywhere Node.js runs.

## Project structure

```
chat-file-share/
├── server.js              # Express + Socket.IO backend (auth, chat, file routes)
├── package.json
├── data/                  # users.json, messages.json, files.json (auto-created)
├── uploads/               # the shared folder where uploaded files are stored
└── public/                # frontend (login, register, dashboard)
    ├── login.html
    ├── register.html
    ├── dashboard.html
    ├── css/style.css
    └── js/dashboard.js
```

## Run it locally

```bash
npm install
npm start
```

Then open **http://localhost:3000** — register a couple of accounts (in two different browser tabs/windows or incognito), and chat / send files between them.

Optional environment variables:

| Variable         | Default                          | Purpose                          |
|------------------|-----------------------------------|-----------------------------------|
| `PORT`           | `3000`                            | Port the server listens on       |
| `SESSION_SECRET` | (a default, **change for prod**)  | Secret used to sign session cookies |

## How the pieces work

- **Unique usernames**: `/api/register` rejects a username (case-insensitively) if it's already taken, and only allows `3–20` letters/numbers/`_`/`.`/`-`.
- **Passwords**: hashed with `bcryptjs` before being written to `data/users.json` — plaintext passwords are never stored.
- **Chat**: after login, the client gets a short-lived socket token and connects via Socket.IO. Messages are routed to a room named after the recipient's username (`io.to(username)`), and every message is also appended to `data/messages.json` so history survives restarts.
- **File sharing**: uploads go through `multer` into the shared `uploads/` folder with a randomized on-disk filename (to avoid collisions/overwrites), while `data/files.json` tracks the *original* filename, sender, and recipient. Downloads are only served to the sender or recipient (`/api/files/:id/download` checks the session).

## Deploying

This project is configured and ready for deployment on **Vercel** as well as standard persistent Node hosts.

### Deploying to Vercel

The project includes `vercel.json`, `api/index.js`, and automatic serverless storage adaptations (`/tmp` fallback + HTTP message sending fallback).

#### Option A: Deploy via Vercel CLI (Fastest)
1. Install the Vercel CLI if you haven't:
   ```bash
   npm i -g vercel
   ```
2. In the project directory, run:
   ```bash
   vercel
   ```
3. Follow the prompts (use default settings). For production deployment:
   ```bash
   vercel --prod
   ```

#### Option B: Deploy via GitHub / Vercel Dashboard
1. Push this folder to a GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new) and import your repository.
3. In **Environment Variables**, add:
   - `SESSION_SECRET`: Any random secure string (e.g. `openssl rand -hex 32`).
4. Click **Deploy**.

> **Note on Vercel Serverless**: Vercel functions use an ephemeral `/tmp` filesystem and serverless lambdas. ChatShare has been configured with HTTP fallback and background synchronization to work smoothly on Vercel without persistent WebSocket servers. If you need permanent file uploads and permanent message retention across serverless container re-provisions, you can connect MongoDB/PostgreSQL or deploy to a persistent host like Render/Railway.

### Example: Render.com (For persistent WebSocket & disk)
1. Push this project to a GitHub repo.
2. New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add an environment variable `SESSION_SECRET` with a random value.
5. Add a **Persistent Disk** mounted at `/opt/render/project/src/data` and another at `.../uploads`.

### Example: a plain VPS (Ubuntu)
```bash
git clone <your-repo>
cd chat-file-share
npm install
SESSION_SECRET="$(openssl rand -hex 32)" PORT=3000 npm start
# put nginx or Caddy in front for HTTPS + a domain, and use pm2 or systemd to keep it running
```

## Limitations / things to harden before real production use

- The JSON-file "database" is fine for a small number of users; for heavier use, swap in Postgres/SQLite and use a real object store (S3, etc.) for files.
- There's a single shared `uploads/` folder — that's intentional per the request, but for stricter isolation you could namespace it per-recipient (`uploads/<username>/...`).
- Add rate limiting on `/api/login` and `/api/register` if exposing this publicly.
- Consider enforcing HTTPS-only cookies (`cookie.secure = true`) once deployed behind HTTPS.
