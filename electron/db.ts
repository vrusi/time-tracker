import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

function initDatabase() {
  const dbPath = join(app.getPath('userData'), 'time-tracker.db')
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
      FOREIGN KEY (issue_id) REFERENCES issues(id)
    );

    CREATE INDEX IF NOT EXISTS idx_time_entries_issue ON time_entries(issue_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_started ON time_entries(started_at);
    CREATE INDEX IF NOT EXISTS idx_issues_archived ON issues(archived);
  `)

  return db
}

export { db, initDatabase }
