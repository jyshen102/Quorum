-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Events table
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('meal', 'hangout', 'trip')),
  subtype text, -- primary subtype (first of `subtypes`); kept for back-compat
  subtypes text[] not null default '{}',
  location text,
  description text,
  date_range_start date not null,
  date_range_end date not null,
  time_slots text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'closed')),
  final_date date,
  final_time text,
  slug text unique not null,
  created_at timestamptz not null default now()
);

-- Custom questions table
create table if not exists custom_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  question_text text not null,
  display_order integer not null default 0
);

-- Respondents table
create table if not exists respondents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  submitted_at timestamptz not null default now()
);

-- Responses table (date availability)
create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  respondent_id uuid not null references respondents(id) on delete cascade,
  date_key text not null, -- YYYY-MM-DD
  time_slots text[] not null default '{}'
);

-- Custom answers table
create table if not exists custom_answers (
  id uuid primary key default gen_random_uuid(),
  respondent_id uuid not null references respondents(id) on delete cascade,
  question_id uuid not null references custom_questions(id) on delete cascade,
  answer_text text not null
);

-- Indexes
create index if not exists idx_events_slug on events(slug);
create index if not exists idx_events_subtypes on events using gin (subtypes);
create index if not exists idx_respondents_event_id on respondents(event_id);
create index if not exists idx_responses_respondent_id on responses(respondent_id);
create index if not exists idx_custom_questions_event_id on custom_questions(event_id);
create index if not exists idx_custom_answers_respondent_id on custom_answers(respondent_id);

-- Row Level Security
alter table events enable row level security;
alter table custom_questions enable row level security;
alter table respondents enable row level security;
alter table responses enable row level security;
alter table custom_answers enable row level security;

-- Events: admin can do everything, public can read open events by slug
create policy "Admin full access on events"
  on events for all
  using (auth.role() = 'authenticated');

create policy "Public can read events"
  on events for select
  using (true);

-- Custom questions: admin full access, public can read
create policy "Admin full access on custom_questions"
  on custom_questions for all
  using (auth.role() = 'authenticated');

create policy "Public can read custom_questions"
  on custom_questions for select
  using (true);

-- Respondents: admin full access, anyone can insert
create policy "Admin full access on respondents"
  on respondents for all
  using (auth.role() = 'authenticated');

create policy "Public can insert respondents"
  on respondents for insert
  with check (true);

create policy "Public can read respondents"
  on respondents for select
  using (true);

-- Responses: admin full access, anyone can insert
create policy "Admin full access on responses"
  on responses for all
  using (auth.role() = 'authenticated');

create policy "Public can insert responses"
  on responses for insert
  with check (true);

create policy "Public can read responses"
  on responses for select
  using (true);

-- Custom answers: admin full access, anyone can insert
create policy "Admin full access on custom_answers"
  on custom_answers for all
  using (auth.role() = 'authenticated');

create policy "Public can insert custom_answers"
  on custom_answers for insert
  with check (true);

create policy "Public can read custom_answers"
  on custom_answers for select
  using (true);

-- Enable realtime for admin results view
alter publication supabase_realtime add table respondents;
alter publication supabase_realtime add table responses;
