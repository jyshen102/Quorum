-- Allow multiple subtypes per event (e.g. a meal that's both "Lunch" and "Birthday")
-- Strategy: introduce `subtypes text[]`, backfill from legacy `subtype` column.
-- The legacy `subtype` column stays as the "primary" subtype for back-compat.

alter table events
  add column if not exists subtypes text[] not null default '{}';

-- Backfill existing rows
update events
   set subtypes = array[subtype]
 where (subtypes is null or array_length(subtypes, 1) is null)
   and subtype is not null
   and subtype <> '';

-- Helpful index for filtering by subtype membership
create index if not exists idx_events_subtypes on events using gin (subtypes);
