-- Beck Recruiting core schema (SQLite; portable to Postgres)

CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY,
  cfbd_id INTEGER UNIQUE,
  name TEXT NOT NULL UNIQUE,
  mascot TEXT,
  conference TEXT,
  division TEXT,            -- fbs | fcs | ii | iii | naia | juco
  city TEXT,
  state TEXT,
  website TEXT,
  staff_directory_url TEXT, -- e.g. https://godeacs.com/sports/football/coaches
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coaches (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL,
  title TEXT,               -- Head Coach, Offensive Coordinator, RB Coach, Recruiting Coordinator, ...
  position_group TEXT,      -- QB | RB | WR | TE | OL | DL | LB | DB | ST | RC | HC | other
  email TEXT,
  phone TEXT,
  twitter TEXT,
  source TEXT NOT NULL DEFAULT 'manual',  -- cfbd | staff_directory | import | manual
  active INTEGER NOT NULL DEFAULT 1,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, first_name, last_name)
);
CREATE INDEX IF NOT EXISTS idx_coaches_school ON coaches(school_id);
CREATE INDEX IF NOT EXISTS idx_coaches_email ON coaches(email);

CREATE TABLE IF NOT EXISTS athletes (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  grad_year INTEGER,
  position TEXT,            -- QB, RB, WR, TE, OL, DL, EDGE, LB, CB, S, K, P, LS
  height_in REAL,
  weight_lb REAL,
  measurables TEXT,         -- JSON: {"forty": 4.62, "vertical": 34, "bench": 15, ...}
  gpa REAL,
  sat INTEGER,
  act INTEGER,
  ncaa_id TEXT,
  high_school TEXT,
  city TEXT,
  state TEXT,
  film_url TEXT,            -- Hudl highlight link
  transcript_url TEXT,
  email TEXT,
  phone TEXT,
  twitter TEXT,
  guardian_email TEXT,      -- parent/guardian consent contact (athletes are minors)
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | sending | sent | paused
  target_filter TEXT,       -- JSON: {"divisions": ["fcs","ii"], "states": ["OH","PA"], "positionGroups": ["RB","RC","HC"]}
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  athlete_id INTEGER NOT NULL REFERENCES athletes(id),
  coach_id INTEGER NOT NULL REFERENCES coaches(id),
  token TEXT NOT NULL UNIQUE,             -- open/click tracking token
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | queued | sent | failed
  provider_message_id TEXT,
  error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(campaign_id, coach_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id);

CREATE TABLE IF NOT EXISTS message_events (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id),
  type TEXT NOT NULL,       -- open | click | reply | bounce | opt_out
  meta TEXT,                -- JSON: user agent, ip hash, etc.
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_message ON message_events(message_id);

-- Written level projections (the Sophomore Recruiting Kickoff deliverable).
-- Levels: p4 | g5 | fcs | d2 | d3 | naia | juco
CREATE TABLE IF NOT EXISTS projections (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id),
  level TEXT NOT NULL,
  projected_by TEXT NOT NULL,     -- evaluator name (e.g. "Coach Aaron Beck")
  notes TEXT,                     -- written assessment
  film_plan TEXT,                 -- what the junior cutup needs to show
  academic_notes TEXT,            -- eligibility / grad timeline / early enrollment
  projected_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projections_athlete ON projections(athlete_id);

-- Certified measurables: "laser-timed, coach-certified numbers colleges actually trust".
-- Outreach only cites verified values.
CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id),
  metric TEXT NOT NULL,           -- forty | vertical | bench | squat | height | weight | shuttle | broad
  value REAL NOT NULL,
  method TEXT,                    -- laser | electronic | coach_certified
  verified_by TEXT NOT NULL,      -- staff member who signed off
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(athlete_id, metric)
);

-- Signing outcomes: feeds "The Receipts" (% signed at or above projected level)
-- and the twice-a-year college follow-up call list.
CREATE TABLE IF NOT EXISTS signings (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) UNIQUE,
  school_id INTEGER REFERENCES schools(id),
  school_name TEXT,               -- free text when the school isn't in the DB (NAIA/JUCO)
  level TEXT NOT NULL,            -- p4 | g5 | fcs | d2 | d3 | naia | juco | none
  signed_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Global opt-out list: a coach who opts out is suppressed for every campaign, forever.
CREATE TABLE IF NOT EXISTS suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
