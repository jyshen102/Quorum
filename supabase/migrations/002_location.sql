-- Add free-text location field for events (e.g. "Joe's Pizza", "TBD", "Sarah's house")
alter table events
  add column if not exists location text;
