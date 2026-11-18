-- Empty schema only. No seed data or personal records.
CREATE TABLE samples (
  metric TEXT NOT NULL, ts TEXT NOT NULL, source TEXT NOT NULL, day TEXT NOT NULL,
  qty REAL, unit TEXT, updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (metric, ts, source)
);
CREATE INDEX samples_day ON samples(day, metric);
CREATE TABLE workouts (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, day TEXT NOT NULL, type TEXT,
  start TEXT, end TEXT, duration_s REAL, distance_km REAL, kcal REAL,
  avg_hr REAL, max_hr REAL, elevation_m REAL, effort REAL, raw TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX workouts_day ON workouts(day);
CREATE TABLE hk_quantity (
  type TEXT NOT NULL, agg TEXT NOT NULL, start TEXT NOT NULL, end TEXT,
  day TEXT NOT NULL, source TEXT NOT NULL, value REAL, unit TEXT,
  updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (type, agg, start, source)
);
CREATE INDEX hk_quantity_day ON hk_quantity(day, type);
CREATE TABLE hk_events (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, type TEXT NOT NULL, value TEXT,
  start TEXT, end TEXT, day TEXT NOT NULL, extra TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX hk_events_type_day ON hk_events(type, day);
CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE meals (
  id TEXT PRIMARY KEY, day TEXT NOT NULL, meal TEXT, time TEXT, title TEXT,
  kcal REAL, protein REAL, carbs REAL, fat REAL, notes TEXT, items TEXT,
  nutrients TEXT, source TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX meals_day ON meals(day, time);
CREATE INDEX meals_source ON meals(source);
CREATE TABLE meal_days (
  day TEXT PRIMARY KEY, day_type TEXT, kcal REAL, kcal_min REAL, kcal_max REAL,
  protein REAL, protein_min REAL, protein_max REAL, notes TEXT, source TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE body_comp (
  day TEXT NOT NULL, source TEXT NOT NULL, key TEXT NOT NULL, value REAL, unit TEXT,
  updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (day, source, key)
);
CREATE INDEX body_comp_day ON body_comp(day);
CREATE TABLE login_fail (
  ip TEXT NOT NULL, win INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (ip, win)
);
CREATE INDEX login_fail_win ON login_fail(win);
