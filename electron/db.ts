import Database from 'better-sqlite3'

let db: Database.Database

function initDatabase(dbPath: string) {
  db = new Database(dbPath)

  // Enable foreign keys
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      link TEXT,
      archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      paused_reason TEXT,
      notes TEXT,
      FOREIGN KEY (issue_id) REFERENCES issues(id)
    );

    CREATE INDEX IF NOT EXISTS idx_time_entries_issue ON time_entries(issue_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_started ON time_entries(started_at);
    CREATE INDEX IF NOT EXISTS idx_issues_archived ON issues(archived);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Insert default settings if not exist
  const defaultSettings = {
    dailyTargetHours: '8',
    weeklyTargetHours: '40',
    monthlyTargetHours: '160',
    hourlyRate: '18.67',
    currency: 'GBP',
    currencySymbol: '£',
    idleThresholdMinutes: '10',
    idleIndicatorMinutes: '0.5',
    issueUrlPattern: 'gitlab'
  }

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value)
  }

  // Migration: Add notes column to time_entries if it doesn't exist
  const timeEntryColumns = db.prepare("PRAGMA table_info(time_entries)").all() as { name: string }[]
  if (!timeEntryColumns.some(col => col.name === 'notes')) {
    db.exec('ALTER TABLE time_entries ADD COLUMN notes TEXT')
  }

  // Migration: Add notes column to issues if it doesn't exist
  const issueColumns = db.prepare("PRAGMA table_info(issues)").all() as { name: string }[]
  if (!issueColumns.some(col => col.name === 'notes')) {
    db.exec('ALTER TABLE issues ADD COLUMN notes TEXT')
  }

  return db
}

function switchDatabase(dbPath: string) {
  if (db) {
    db.close()
  }
  initDatabase(dbPath)
}

function closeDatabase() {
  if (db) {
    db.close()
  }
}

export { db, initDatabase, switchDatabase, closeDatabase }
