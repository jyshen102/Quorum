-- Store the peak time-of-day window selected when the poll closes, computed
-- from respondents' time-slot picks on the chosen final_date. Free text so
-- it can hold things like "6:30pm–8pm" or any custom override.
alter table events
  add column if not exists final_time text;
