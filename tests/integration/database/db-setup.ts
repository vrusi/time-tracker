/**
 * Database Integration Test Setup
 *
 * These tests verify SQL queries and database operations directly against
 * an in-memory SQLite database. They do NOT call actual handler functions
 * from electron/handlers/ because:
 *
 * 1. Handlers import Electron-specific modules (BrowserWindow, ipcMain, etc.)
 *    that cannot run in Vitest's Node environment
 * 2. Handlers have side effects (notifications, window updates) beyond DB operations
 *
 * What these tests verify:
 * - SQL query correctness (joins, filters, ordering)
 * - Data transformations via mappers
 * - Schema constraints (foreign keys, defaults)
 * - Complex operations (merge, bulk delete, crash recovery)
 *
 * For handler-level testing (mocking the database and verifying handlers call
 * the right queries), see tests/handlers/*.test.ts
 */
import type Database from 'better-sqlite3'

// Check if better-sqlite3 is available and usable synchronously at module load.
// This is a native module compiled for Electron's Node version, which may differ
// from the Node version used by vitest. Tests will be skipped if unavailable.
let BetterSqlite3: typeof import('better-sqlite3').default | null = null
let sqliteAvailable = false

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('better-sqlite3')
  BetterSqlite3 = module.default || module
  // Try to actually create a database to verify the native module works
  const testDb = new BetterSqlite3(':memory:')
  testDb.close()
  sqliteAvailable = true
} catch {
  // Native module not available or incompatible - tests will be skipped
  sqliteAvailable = false
}

export const isSqliteAvailable = sqliteAvailable

/**
 * Schema matches electron/db.ts exactly.
 * Includes notes column which was added via migration.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    link TEXT,
    notes TEXT,
    slack_message TEXT,
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
`

const DEFAULT_SETTINGS = {
  dailyTargetHours: '8',
  weeklyTargetHours: '40',
  monthlyTargetHours: '160',
  hourlyRate: '18.67',
  currency: 'GBP',
  currencySymbol: '£',
  idleThresholdMinutes: '10',
  idleIndicatorMinutes: '0.5',
  issueUrlPattern: 'gitlab',
  theme: 'light',
  showEarnings: 'false',
  notificationsEnabled: 'true'
}

export function createTestDatabase(): Database.Database {
  if (!BetterSqlite3) {
    throw new Error('better-sqlite3 not available - run in Electron environment')
  }
  const db = new BetterSqlite3(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  // Insert default settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, value)
  }

  return db
}

export interface SeedIssueOptions {
  id?: number
  externalId?: string
  name?: string
  link?: string | null
  notes?: string | null
  archived?: boolean
  createdAt?: string
}

export function seedIssue(db: Database.Database, options: SeedIssueOptions = {}): number {
  const {
    externalId = '#123',
    name = 'Test Issue',
    link = null,
    notes = null,
    archived = false,
    createdAt = new Date().toISOString()
  } = options

  const result = db.prepare(`
    INSERT INTO issues (external_id, name, link, notes, archived, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(externalId, name, link, notes, archived ? 1 : 0, createdAt)

  return result.lastInsertRowid as number
}

export interface SeedTimeEntryOptions {
  issueId: number
  startedAt?: string
  endedAt?: string | null
  pausedReason?: 'manual' | 'idle' | 'switched' | null
  notes?: string | null
}

export function seedTimeEntry(db: Database.Database, options: SeedTimeEntryOptions): number {
  const {
    issueId,
    startedAt = new Date().toISOString(),
    endedAt = null,
    pausedReason = null,
    notes = null
  } = options

  const result = db.prepare(`
    INSERT INTO time_entries (issue_id, started_at, ended_at, paused_reason, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(issueId, startedAt, endedAt, pausedReason, notes)

  return result.lastInsertRowid as number
}

export function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}
