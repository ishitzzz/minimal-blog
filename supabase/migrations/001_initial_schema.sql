-- ============================================================
-- Minimal Blog — Supabase Database Schema
-- Migration: 001_initial_schema
-- Created:   2026-03-21
-- ============================================================

-- Enable the uuid-ossp extension for auto-generated UUIDs
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. POSTS
-- ============================================================
create table public.posts (
  id          uuid primary key default uuid_generate_v4(),
  slug        text not null unique,
  title       text not null,
  date        date not null default current_date,
  excerpt     text,
  body        text,                           -- rich HTML
  polaroids   jsonb default '[]'::jsonb,      -- array of polaroid objects
                                              --   { url, alt, rotation, left, top, title, body }
  glass_config jsonb default '{}'::jsonb,     -- CSS custom-property overrides
                                              --   { blur_radius, refraction_warp, card_tint, font_size, … }
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.posts.polaroids is
  'JSON array of polaroid image objects. Each object: '
  '{ "url": "<storage URL>", "alt": "<alt text>", '
  '"rotation": <degrees>, "left": <% from left>, "top": <% from top>, '
  '"title": "<click-open title>", "body": "<click-open body>" }';

comment on column public.posts.glass_config is
  'JSON object of CSS custom-property overrides for the glass card. '
  'Example keys: blur_radius, refraction_warp, card_tint, font_size.';

-- ============================================================
-- 2. IMAGES
-- ============================================================
create table public.images (
  id            uuid primary key default uuid_generate_v4(),
  filename      text not null,
  url           text not null,                -- full public Supabase Storage URL
  alt           text,
  width         integer,
  height        integer,
  uploaded_at   timestamptz not null default now()
);

comment on table public.images is
  'Library of every image uploaded through the dashboard, searchable by the editor.';

-- ============================================================
-- 3. ANALYTICS_SESSIONS
-- ============================================================
create table public.analytics_sessions (
  id            uuid primary key default uuid_generate_v4(),
  ip_hash       text not null,                -- one-way hash; raw IP is never stored
  country_code  text,
  city          text,
  user_agent    text,
  referrer      text,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  visit_count   integer not null default 1,
  pages_visited jsonb default '[]'::jsonb     -- ordered array of page slugs
);

comment on column public.analytics_sessions.ip_hash is
  'SHA-256 (or similar) hash of the visitor''s IP address. The raw IP is never stored.';

comment on column public.analytics_sessions.pages_visited is
  'JSON array of page slug strings visited during this session, in chronological order.';

-- ============================================================
-- 4. ANALYTICS_EVENTS
-- ============================================================
create table public.analytics_events (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references public.analytics_sessions (id) on delete cascade,
  event_type    text not null
                  check (event_type in (
                    'page_view',
                    'story_read',
                    'card_click',
                    'scroll_depth',
                    'polaroid_click',
                    'back_navigate'
                  )),
  page_slug     text,
  metadata      jsonb default '{}'::jsonb,    -- event-specific data
                                              --   e.g. { "scroll_pct": 75 } or { "card_index": 2 }
  created_at    timestamptz not null default now()
);

comment on column public.analytics_events.event_type is
  'One of: page_view, story_read, card_click, scroll_depth, polaroid_click, back_navigate.';

comment on column public.analytics_events.metadata is
  'Arbitrary JSON payload for event-specific data, e.g. scroll percentage or card index.';

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_posts_slug             on public.posts (slug);
create index idx_posts_published        on public.posts (published);
create index idx_sessions_ip_hash       on public.analytics_sessions (ip_hash);
create index idx_events_session_id      on public.analytics_events (session_id);
create index idx_events_event_type      on public.analytics_events (event_type);
create index idx_events_created_at      on public.analytics_events (created_at);

-- ============================================================
-- AUTO-UPDATE  updated_at  ON POSTS
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_posts_updated_at
  before update on public.posts
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- ROW-LEVEL SECURITY
-- All tables are accessible ONLY via the service_role key.
-- The anon and authenticated roles are denied all access so
-- the frontend can never touch the database directly.
-- ============================================================

-- — Posts —
alter table public.posts enable row level security;

create policy "Service role full access on posts"
  on public.posts
  for all
  using  (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

-- — Images —
alter table public.images enable row level security;

create policy "Service role full access on images"
  on public.images
  for all
  using  (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

-- — Analytics Sessions —
alter table public.analytics_sessions enable row level security;

create policy "Service role full access on analytics_sessions"
  on public.analytics_sessions
  for all
  using  (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

-- — Analytics Events —
alter table public.analytics_events enable row level security;

create policy "Service role full access on analytics_events"
  on public.analytics_events
  for all
  using  (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

-- ============================================================
-- Done.
-- ============================================================
