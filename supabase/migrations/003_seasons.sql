-- Seasons: a review can say how far you got ("through season 3").
-- Changing the season counts as a fresh review and moves the card back to the top.
alter table public.ratings add column if not exists season int check (season between 1 and 100);

create or replace function public.ratings_touch()
returns trigger language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.rating is distinct from old.rating
       or new.season is distinct from old.season
       or (coalesce(old.note, '') = '' and coalesce(new.note, '') <> '') then
      new.activity_at := now();
    else
      new.activity_at := old.activity_at;
    end if;
  end if;
  return new;
end;
$$;
