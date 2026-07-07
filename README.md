# S&H Services — Job Tracker

Mobile-first job tracking app for S&H Services Spokane LLC.
Connected to Supabase for real-time shared data.

---

## Deploy to Vercel (free, 5 minutes)

### Option A — Drag & Drop (easiest)

1. Go to https://vercel.com and sign up for a free account
2. From your dashboard click **Add New → Project**
3. Choose **"Upload"** and drag this entire folder in
4. Click **Deploy**
5. Vercel gives you a URL like `sh-job-tracker.vercel.app`
6. Share that URL with your team — they bookmark it or tap
   **Share → Add to Home Screen** on their phone

### Option B — GitHub (best for updates)

1. Create a free GitHub account at https://github.com
2. Create a new repository called `sh-job-tracker`
3. Upload all these files to it
4. Go to https://vercel.com → Add New → Project → Import from GitHub
5. Select your repo and click Deploy
6. Future updates: just push to GitHub and Vercel auto-redeploys

---

## Local development (optional)

```bash
npm install
npm run dev
```

Then open http://localhost:5173

---

## Stack

- React 18 + Vite
- Supabase (Postgres database)
- SheetJS (Excel export)
- No other dependencies
