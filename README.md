# 🏆 Family World Cup Sweepstake

A colourful, mobile-first sweepstake app for the family group chat. Create a draw, share one link, everyone joins with their name, then the admin spins two prize wheels live — every player lands **one favourite team** and **one underdog team**. Results are saved and shareable.

No payments, no accounts, no gambling — just family bragging rights.

## What's inside

- **React + Vite** frontend, hash-based routing (works perfectly on Vercel with zero config)
- **Supabase** shared database so cousins on different phones see the same room and results
- **Theatre Mode** draw: real spinning prize wheels with ratchet ticks, crowd claps, confetti and one-liners (mute button included)
- **Room chat** with quick-emoji buttons, live on every phone
- **Auto funny nicknames** for everyone who joins ("Top Bins Specialist", "Nutmeg Ninja"…)
- **Live everywhere**: joins, kicks, edits, each wheel result, and final results all push to every open phone instantly
- **Admin toolkit**: rename, edit teams, kick players, lock/unlock — any time before the draw
- **Quick Draw** fallback for instant results
- Fair-draw guarantees: one team from each pool per player, no duplicates, draws blocked if there aren't enough teams, results never change once saved
- Per-player saving — if the admin's phone refreshes mid-draw, the draw continues where it left off

## Routes

| Route | Screen |
| --- | --- |
| `/#/` | Create a sweepstake |
| `/#/join/:id` | Join with your name (the invite link) |
| `/#/room/:id` | Waiting room + admin controls |
| `/#/draw/:id` | The wheel show (admin PIN required) |
| `/#/results/:id` | Saved results, CSV export, WhatsApp share |

---

## Quick deploy (easiest path — ~5 minutes, one time)

1. Push this folder to a GitHub repo, then on [vercel.com](https://vercel.com) → **Add New → Project** → import it (Vite is auto-detected). Deploy.
2. In your Vercel project → **Storage** tab → **Create Database → Supabase** (the marketplace integration). Accept the defaults — Vercel creates the Supabase project **and adds the keys for you automatically**. Redeploy once.
3. Open the Supabase dashboard it created → **SQL Editor → New query** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.

That's it. Open your Vercel URL, create your sweepstake, and post the link in the group chat. (The app reads `SUPABASE_URL`/`SUPABASE_ANON_KEY`, `NEXT_PUBLIC_*`, or `VITE_*` names — whatever the integration injects works.)

---

## 1. Run locally

```bash
npm install
cp .env.example .env   # fill in your Supabase values (step 2–4)
npm run dev
```

Open the printed `http://localhost:5173` URL. (Without a `.env`, the app still runs using your browser's storage — fine for a quick look, but links won't work across phones until Supabase is connected.)

## 2. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is plenty).
2. Pick any name/password/region and wait for it to provision.

## 3. Run the SQL

1. In your Supabase project, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql).
3. Click **Run**. You should see the `sweepstakes`, `participants` and `results` tables under **Table Editor**.

## 4. Add environment variables

In Supabase, go to **Project Settings → API** and copy:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public key** → `VITE_SUPABASE_ANON_KEY`

Put both in your local `.env` file (copied from `.env.example`).

## 5. Deploy on Vercel

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Vercel auto-detects Vite.
3. Before deploying, open **Environment Variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. Done — your app lives at `https://your-app.vercel.app`.

> Changed an env var later? Re-deploy (Deployments → ⋯ → Redeploy) so Vite picks it up.

## 6. Test the invite link from another phone

1. Open your Vercel URL, create a sweepstake (note your admin PIN).
2. In the waiting room, tap **Copy link** and send it to yourself on WhatsApp.
3. Open that link on a second phone → enter a name → **Join Sweepstake**.
4. Back on the admin phone, the waiting room updates within a few seconds.
5. Tap **Start the draw**, enter the PIN if asked, and run Theatre Mode.
6. After **Finish draw**, open the results link on the second phone — the saved teams are there, and they'll still be there next week.

---

## Notes

- The admin PIN is a convenience lock for a private family app, not bank-grade security — anyone you'd worry about shouldn't be in the group chat anyway. 😄
- The wheel is theatre: winners are drawn fairly *before* the spin, and the wheel always lands on the pre-drawn team.
- Results are protected by unique constraints in the database, so a double-tap or two admin devices can never create duplicate teams.
