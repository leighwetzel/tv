# tv

A private friends-and-family app for TV and movie recommendations, at tv.xoleigh.com.

- Requirements: https://claude.ai/artifact/XW68saqwXWNrrDscQHstPi
- Wireframes: https://claude.ai/artifact/K1P41jmdvk5izYa89YUWhk

## Setup

1. Supabase > SQL Editor: run `supabase/migrations/001_init.sql`.
2. Leigh and Brian sign in to the app once each.
3. Supabase > SQL Editor: run `supabase/setup_hosts.sql` with your two emails filled in.

## Layout

- `supabase/migrations/` database tables and access rules
- `web/` the app (static site)

Title data and streaming info from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming data from JustWatch.
