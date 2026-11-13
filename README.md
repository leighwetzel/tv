# tv

A private friends-and-family app for TV and movie recommendations, at tv.xoleigh.com.

- Requirements: https://claude.ai/artifact/XW68saqwXWNrrDscQHstPi
- Wireframes: https://claude.ai/artifact/K1P41jmdvk5izYa89YUWhk

## Setup

1. Supabase > SQL Editor: run `supabase/migrations/001_init.sql`.
2. Supabase > Edge Functions: deploy `supabase/functions/tmdb/index.ts` as `tmdb`, with secret `TMDB_TOKEN`.
3. Supabase > Authentication: custom SMTP (Resend), Magic link template with `{{ .Token }}`, Site URL `https://tv.xoleigh.com`.
4. GitHub > Settings > Pages: deploy from `main`, folder `/docs`. DNS: CNAME `tv` -> `leighwetzel.github.io`.
5. Leigh and Brian sign in once each, then run `supabase/setup_hosts.sql` with both emails filled in.

## Layout

- `supabase/migrations/` database tables and access rules
- `supabase/functions/tmdb/` server function: TMDB search, streaming info, quick-pick titles
- `docs/` the app (static site served by GitHub Pages)

Title data and streaming info from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming data from JustWatch.
