import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase, getSetting, setSetting, isSqliteAvailable } from './db-setup'

/**
 * Handler integration tests: Settings persistence with real SQLite.
 * Tests loading, updating, and parsing of settings.
 *
 * Note: These tests require better-sqlite3 native module.
 * They will be skipped in non-Electron test environments.
 */
describe.skipIf(!isSqliteAvailable)('Settings Handlers Integration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  describe('loading settings', () => {
    it('loads default settings from database', () => {
      const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
      const settings: Record<string, string> = {}
      for (const row of rows) {
        settings[row.key] = row.value
      }

      expect(settings.dailyTargetHours).toBe('8')
      expect(settings.monthlyTargetHours).toBe('160')
      expect(settings.hourlyRate).toBe('18.67')
      expect(settings.currency).toBe('GBP')
      expect(settings.currencySymbol).toBe('£')
      expect(settings.idleThresholdMinutes).toBe('10')
      expect(settings.idleIndicatorMinutes).toBe('0.5')
      expect(settings.issueUrlPattern).toBe('gitlab')
      expect(settings.theme).toBe('light')
    })

    it('parses numeric settings correctly', () => {
      const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
      const settings: Record<string, any> = {}
      for (const row of rows) {
        settings[row.key] = row.value
      }

      expect(parseFloat(settings.dailyTargetHours)).toBe(8)
      expect(parseFloat(settings.hourlyRate)).toBe(18.67)
      expect(parseFloat(settings.idleThresholdMinutes)).toBe(10)
      expect(parseFloat(settings.idleIndicatorMinutes)).toBe(0.5)
    })

    it('parses boolean settings correctly', () => {
      setSetting(db, 'showEarnings', 'true')
      setSetting(db, 'notificationsEnabled', 'false')

      expect(getSetting(db, 'showEarnings') === 'true').toBe(true)
      expect(getSetting(db, 'notificationsEnabled') === 'true').toBe(false)
    })
  })

  describe('updating settings', () => {
    it('updates single setting', () => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('dailyTargetHours', '6')

      expect(getSetting(db, 'dailyTargetHours')).toBe('6')
    })

    it('updates multiple settings', () => {
      const updates = {
        dailyTargetHours: '7',
        hourlyRate: '25.50',
        currency: 'USD'
      }

      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      for (const [key, value] of Object.entries(updates)) {
        stmt.run(key, String(value))
      }

      expect(getSetting(db, 'dailyTargetHours')).toBe('7')
      expect(getSetting(db, 'hourlyRate')).toBe('25.50')
      expect(getSetting(db, 'currency')).toBe('USD')
    })

    it('converts values to strings', () => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('idleThresholdMinutes', String(15))

      expect(getSetting(db, 'idleThresholdMinutes')).toBe('15')
    })

    it('handles boolean values as strings', () => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('showEarnings', String(true))

      expect(getSetting(db, 'showEarnings')).toBe('true')
    })
  })

  describe('settings defaults and missing values', () => {
    it('returns undefined for non-existent setting', () => {
      expect(getSetting(db, 'nonExistentSetting')).toBeUndefined()
    })

    it('uses default when parsing fails', () => {
      // Simulate corrupt value
      setSetting(db, 'hourlyRate', 'not-a-number')

      const value = getSetting(db, 'hourlyRate')
      const parsed = parseFloat(value!) || 18.67 // Default

      expect(parsed).toBe(18.67)
    })

    it('handles empty string value', () => {
      setSetting(db, 'customIssuePattern', '')

      const value = getSetting(db, 'customIssuePattern')
      expect(value).toBe('')
    })
  })

  describe('settings schema', () => {
    it('uses TEXT PRIMARY KEY for settings table', () => {
      const tableInfo = db.prepare("PRAGMA table_info(settings)").all() as { name: string; type: string; pk: number }[]

      const keyColumn = tableInfo.find(c => c.name === 'key')
      const valueColumn = tableInfo.find(c => c.name === 'value')

      expect(keyColumn?.type).toBe('TEXT')
      expect(keyColumn?.pk).toBe(1)
      expect(valueColumn?.type).toBe('TEXT')
    })

    it('INSERT OR REPLACE works for updates', () => {
      // Insert initial value
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('testKey', 'initial')
      expect(getSetting(db, 'testKey')).toBe('initial')

      // Update with same key
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('testKey', 'updated')
      expect(getSetting(db, 'testKey')).toBe('updated')

      // Should only have one row for this key
      const count = db.prepare('SELECT COUNT(*) as count FROM settings WHERE key = ?').get('testKey') as { count: number }
      expect(count.count).toBe(1)
    })
  })

  describe('theme settings', () => {
    it('stores and retrieves theme preference', () => {
      setSetting(db, 'theme', 'dark')
      expect(getSetting(db, 'theme')).toBe('dark')

      setSetting(db, 'theme', 'system')
      expect(getSetting(db, 'theme')).toBe('system')
    })
  })

  describe('custom issue pattern', () => {
    it('stores custom regex pattern', () => {
      const pattern = '/issues/(\\d+)'
      setSetting(db, 'customIssuePattern', pattern)

      expect(getSetting(db, 'customIssuePattern')).toBe(pattern)
    })

    it('handles special characters in pattern', () => {
      const pattern = '(?:PROJ|TEAM)-\\d+'
      setSetting(db, 'customIssuePattern', pattern)

      expect(getSetting(db, 'customIssuePattern')).toBe(pattern)
    })
  })
})
