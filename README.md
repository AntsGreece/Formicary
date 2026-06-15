# Formicary — ant colony marketplace

A real, multi-user marketplace for ant keepers. React frontend + Supabase backend
(Postgres database, auth, photo storage). Anyone can browse; logged-in keepers can post listings.

---

## What you do in Claude Code (your machine)

```bash
npm install            # install dependencies
cp .env.local.example .env.local   # then edit .env.local with your two keys (see below)
npm run dev            # start the local dev server → http://localhost:5173
```

`npm run dev` must be restarted after you create or change `.env.local`.

---

## What you do in the Supabase dashboard (one time)

You need a Supabase account — these steps require it and can't be automated from here.

### 1. Create the project
supabase.com → **New project**. Pick a region near you, set a database password, wait ~2 min.

### 2. Get your two keys
**Project Settings → API**. Copy these into `.env.local`:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

### 3. Create the database
Open the **SQL Editor**, paste all of this, and click **Run**:

```sql
create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  user_id     uuid references auth.users(id) on delete cascade,
  keeper      text,
  genus       text not null,
  species     text,
  common      text,
  stage       text,
  workers     int default 0,
  currency    text default '€',
  price       numeric not null,
  locality    text,
  tags        text[] default '{}',
  description text,
  contact     text not null,
  image_url   text
);

alter table public.listings enable row level security;

create policy "Public can read listings"
  on public.listings for select using (true);

create policy "Users insert own listings"
  on public.listings for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own listings"
  on public.listings for update to authenticated
  using (auth.uid() = user_id);

create policy "Users delete own listings"
  on public.listings for delete to authenticated
  using (auth.uid() = user_id);
```

### 4. Create the photo storage bucket
**Storage → New bucket** → name it exactly `listing-photos` → tick **Public bucket** → create.

Then back in the **SQL Editor**, run:

```sql
create policy "Public can view photos"
  on storage.objects for select using (bucket_id = 'listing-photos');

create policy "Users can upload photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos');
```

### 5. (For easy testing) turn off email confirmation
**Authentication → Sign In / Providers → Email** → turn **off** "Confirm email".
This lets you sign up and immediately log in. Turn it back on before launching for real.

---

## Test the full loop locally
1. Click **Log in / Sign up**, create an account, log in.
2. Click **+ List a colony**, fill in genus / price / contact, attach a photo, **Publish**.
3. It appears in the grid. Refresh — still there (it's in the database).
4. Open another browser (or have a friend open it) — they see your listing too.

---

## Deploy to the internet (Vercel)
1. Push this folder to a new GitHub repo (`.env.local` is gitignored, so your keys stay private).
2. vercel.com → **Add New → Project** → import the repo (it auto-detects Vite).
3. In the project's **Environment Variables**, add the same `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. Deploy.
4. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your new Vercel URL.

Every `git push` after that redeploys automatically.

---

## File map
```
formicary/
├── index.html              fonts + root div
├── package.json            dependencies & scripts
├── vite.config.js
├── .env.local.example      copy to .env.local and add your keys
└── src/
    ├── main.jsx            React entry
    ├── supabaseClient.js   reads your env keys
    ├── styles.css          the specimen-card design
    └── App.jsx             the whole app (auth, listings, upload, filters)
```

## Ideas for next
- "My listings" view + delete button (the RLS policies already allow owners to delete).
- Server-side search with `.ilike('genus', '%term%')`.
- A `messages` table so keepers contact each other in-app instead of exposing raw contact details.
- Stripe payments — only once people are actually using it.
