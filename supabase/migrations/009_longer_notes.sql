-- Notes were capped at 200 characters ("one-line note"). Lift that so people can write a real review.
-- 5,000 characters is a safety ceiling, not a design limit; the feed shows 4 lines with Read more.
alter table public.ratings drop constraint if exists ratings_note_check;
alter table public.ratings add constraint ratings_note_check check (char_length(note) <= 5000);
