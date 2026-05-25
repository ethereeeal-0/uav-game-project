const Database = require('better-sqlite3');
const path = require('path');

let db;

function getDb() {
  if (db) return db;
  db = new Database(path.join(__dirname, '..', 'game.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema();
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner) REFERENCES teachers(username)
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      classroom_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      password TEXT NOT NULL,
      cash REAL DEFAULT 4500000,
      revenue REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      market_share REAL DEFAULT 2.0,
      target_market TEXT DEFAULT 'domestic',
      brand REAL DEFAULT 50,
      tech_level REAL DEFAULT 1.5,
      ai_maturity REAL DEFAULT 0.8,
      patents INTEGER DEFAULT 1,
      efficiency REAL DEFAULT 70,
      employee_sat REAL DEFAULT 70,
      turnover REAL DEFAULT 8,
      active_clients INTEGER DEFAULT 5,
      score REAL DEFAULT 0,
      intel_accuracy REAL DEFAULT 40,
      risk_tolerance INTEGER DEFAULT 4,
      esg_score REAL DEFAULT 50,
      legal_risk REAL DEFAULT 0,
      production INTEGER DEFAULT 1000,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(classroom_id, code),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      classroom_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('CEO','CIO','COO','CFO','CMO','HR')),
      grade TEXT,
      gender TEXT,
      age INTEGER,
      work_years INTEGER DEFAULT 0,
      role_years INTEGER DEFAULT 0,
      risk_value INTEGER DEFAULT 4,
      last_risk_quarter TEXT,
      decision_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, classroom_id, team_id, role),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    );

    CREATE TABLE IF NOT EXISTS game_state (
      classroom_id TEXT PRIMARY KEY,
      year INTEGER DEFAULT 1,
      quarter INTEGER DEFAULT 1,
      locked INTEGER DEFAULT 0,
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      participant_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      year INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      decisions_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(team_id, participant_id, role, year, quarter),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    );

    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL,
      classroom_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      revenue REAL,
      profit REAL,
      market_share REAL,
      score REAL,
      feedback TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS news_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    );

    CREATE TABLE IF NOT EXISTS hidden_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('public','secret','system','alliance_public','alliance_secret','alliance_system')),
      score INTEGER NOT NULL,
      year INTEGER NOT NULL,
      quarter INTEGER DEFAULT 0,
      half INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id TEXT NOT NULL,
      from_team_id TEXT NOT NULL,
      from_team_name TEXT,
      to_student_id TEXT NOT NULL,
      target_role TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','fired')),
      salary_offer REAL DEFAULT 30,
      cost REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
      FOREIGN KEY (from_team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS alliances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id TEXT NOT NULL,
      from_team_id TEXT NOT NULL,
      to_team_id TEXT NOT NULL,
      field TEXT NOT NULL,
      type TEXT NOT NULL,
      expire_half INTEGER,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
      FOREIGN KEY (from_team_id) REFERENCES teams(id),
      FOREIGN KEY (to_team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS alliance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id TEXT NOT NULL,
      from_team_id TEXT NOT NULL,
      to_team_id TEXT NOT NULL,
      field TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
      FOREIGN KEY (from_team_id) REFERENCES teams(id),
      FOREIGN KEY (to_team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_type TEXT NOT NULL CHECK(user_type IN ('teacher','student')),
      teacher_username TEXT,
      participant_id INTEGER,
      classroom_id TEXT,
      team_id TEXT,
      role TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_teams_classroom ON teams(classroom_id);
    CREATE INDEX IF NOT EXISTS idx_participants_team ON participants(team_id);
    CREATE INDEX IF NOT EXISTS idx_participants_student ON participants(student_id);
    CREATE INDEX IF NOT EXISTS idx_participants_classroom ON participants(classroom_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_team_quarter ON decisions(team_id, year, quarter);
    CREATE INDEX IF NOT EXISTS idx_decisions_classroom ON decisions(classroom_id);
    CREATE INDEX IF NOT EXISTS idx_results_team ON results(team_id);
    CREATE INDEX IF NOT EXISTS idx_results_classroom ON results(classroom_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_ratings_classroom ON ratings(classroom_id);
    CREATE INDEX IF NOT EXISTS idx_offers_classroom ON offers(classroom_id);
    CREATE INDEX IF NOT EXISTS idx_alliances_classroom ON alliances(classroom_id);
  `);

  // Seed admin account
  const admin = db.prepare('SELECT id FROM teachers WHERE username = ?').get('admin');
  if (!admin) {
    db.prepare('INSERT INTO teachers (username, password, is_admin) VALUES (?, ?, 1)').run('admin', 'admin123');
  }
}

module.exports = getDb;
