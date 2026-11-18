# TV Rex

A private friends-and-family app for TV and movie recommendations, at tv.xoleigh.com.

- Requirements: https://claude.ai/artifact/XW68saqwXWNrrDscQHstPi
- Wireframes: https://claude.ai/artifact/K1P41jmdvk5izYa89YUWhk
- Design system (shared with Wiki Walk): https://claude.ai/artifact/NAri4bivLWLCAAtqF83fmG

## Setup

1. Supabase > SQL Editor: run every file in `supabase/migrations/`, in number order (001 to 020).
2. Supabase > Edge Functions secrets: `TMDB_TOKEN` (TMDB read access token) and `RESEND_API_KEY` (Resend, sending access).
   The functions deploy themselves from GitHub (`.github/workflows/deploy-functions.yml`, needs the `SUPABASE_ACCESS_TOKEN` Actions secret).
3. Supabase > Authentication: custom SMTP through Resend (sender `TV Rex <tv@xoleigh.com>`), sign-in email templates with `{{ .Token }}`, Site URL `https://tv.xoleigh.com`.
4. GitHub > Settings > Pages: deploy from `main`, folder `/docs`. DNS: CNAME `tv` -> `leighwetzel.github.io`.
5. Leigh signs in once, then runs `supabase/setup_hosts.sql` with her email filled in. Leigh is the only host.
6. GitHub > Settings > Secrets and variables > Actions: `DIGEST_KEY` (the Sunday email job's key; the function stores only its hash).

## Layout

- `supabase/migrations/` database tables and access rules
- `supabase/functions/tmdb/` server function: TMDB search, title details, streaming info
- `supabase/functions/digest/` the Sunday email (rules at the top of the file)
- `.github/workflows/weekly-email.yml` sends the Sunday email at 8 a.m. Pacific; Run workflow > test sends Leigh a copy
- `docs/` the app (static site served by GitHub Pages)

Title data and streaming info from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming data from JustWatch.

## Releasing changes

Bump the `?v=` number on `style.css` and `app.js` in `docs/index.html` with every change. Browsers cache both files, and the app reloads itself only when that number changes.
