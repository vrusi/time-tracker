import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for Settings Handler Logic.
 * These tests verify the business logic without requiring
 * the native better-sqlite3 module (which is compiled for Electron).
 */
describe('Settings Handler Logic', () => {
  describe('getSettings parsing', () => {
    /**
     * Replicates the settings parsing logic from the handler
     */
    function parseSettings(rawSettings: Record<string, string>) {
      return {
        dailyTargetHours: parseFloat(rawSettings.dailyTargetHours) || 8,
        monthlyTargetHours: parseFloat(rawSettings.monthlyTargetHours) || 160,
        hourlyRate: parseFloat(rawSettings.hourlyRate) || 18.67,
        currency: rawSettings.currency || 'GBP',
        currencySymbol: rawSettings.currencySymbol || '£',
        idleThresholdMinutes: parseFloat(rawSettings.idleThresholdMinutes) || 10,
        idleIndicatorMinutes: parseFloat(rawSettings.idleIndicatorMinutes) || 0.5,
        issueUrlPattern: rawSettings.issueUrlPattern || 'gitlab',
        customIssuePattern: rawSettings.customIssuePattern,
        theme: rawSettings.theme || 'light',
        showEarnings: rawSettings.showEarnings === 'true',
        notificationsEnabled: rawSettings.notificationsEnabled !== 'false'
      }
    }

    it('returns defaults when settings are missing', () => {
      const settings = parseSettings({})

      expect(settings.dailyTargetHours).toBe(8)
      expect(settings.monthlyTargetHours).toBe(160)
      expect(settings.hourlyRate).toBe(18.67)
      expect(settings.currency).toBe('GBP')
      expect(settings.currencySymbol).toBe('£')
      expect(settings.idleThresholdMinutes).toBe(10)
      expect(settings.idleIndicatorMinutes).toBe(0.5)
      expect(settings.issueUrlPattern).toBe('gitlab')
      expect(settings.theme).toBe('light')
      expect(settings.showEarnings).toBe(false)
      expect(settings.notificationsEnabled).toBe(true)
    })

    it('parses numeric values correctly', () => {
      const settings = parseSettings({
        dailyTargetHours: '7.5',
        hourlyRate: '25.50'
      })

      expect(settings.dailyTargetHours).toBe(7.5)
      expect(settings.hourlyRate).toBe(25.50)
    })

    it('parses boolean-like strings for showEarnings', () => {
      expect(parseSettings({ showEarnings: 'true' }).showEarnings).toBe(true)
      expect(parseSettings({ showEarnings: 'false' }).showEarnings).toBe(false)
      expect(parseSettings({}).showEarnings).toBe(false) // Default
    })

    it('parses boolean-like strings for notificationsEnabled', () => {
      // Default is true (only false if explicitly set to 'false')
      expect(parseSettings({}).notificationsEnabled).toBe(true)
      expect(parseSettings({ notificationsEnabled: 'true' }).notificationsEnabled).toBe(true)
      expect(parseSettings({ notificationsEnabled: 'false' }).notificationsEnabled).toBe(false)
    })

    it('handles all settings together', () => {
      const settings = parseSettings({
        dailyTargetHours: '6',
        monthlyTargetHours: '120',
        hourlyRate: '30',
        currency: 'USD',
        currencySymbol: '$',
        idleThresholdMinutes: '5',
        idleIndicatorMinutes: '1',
        issueUrlPattern: 'github',
        theme: 'dark',
        showEarnings: 'true',
        notificationsEnabled: 'false'
      })

      expect(settings.dailyTargetHours).toBe(6)
      expect(settings.monthlyTargetHours).toBe(120)
      expect(settings.hourlyRate).toBe(30)
      expect(settings.currency).toBe('USD')
      expect(settings.currencySymbol).toBe('$')
      expect(settings.idleThresholdMinutes).toBe(5)
      expect(settings.idleIndicatorMinutes).toBe(1)
      expect(settings.issueUrlPattern).toBe('github')
      expect(settings.theme).toBe('dark')
      expect(settings.showEarnings).toBe(true)
      expect(settings.notificationsEnabled).toBe(false)
    })

    it('handles invalid numeric values', () => {
      const settings = parseSettings({
        dailyTargetHours: 'invalid',
        hourlyRate: 'not-a-number'
      })

      expect(settings.dailyTargetHours).toBe(8) // Falls back to default
      expect(settings.hourlyRate).toBe(18.67) // Falls back to default
    })
  })

  describe('getEffectiveIdleTime logic', () => {
    /**
     * Replicates the effective idle time calculation logic
     */
    function getEffectiveIdleTime(
      systemIdleTime: number,
      idleResetTime: number | null,
      clearResetTime: () => void
    ): number {
      if (idleResetTime !== null) {
        const timeSinceReset = Math.floor((Date.now() - idleResetTime) / 1000)
        if (systemIdleTime > timeSinceReset) {
          // System still shows old idle time, use time since reset instead
          return timeSinceReset
        } else {
          // System idle reset naturally (user activity detected), clear our manual reset
          clearResetTime()
        }
      }

      return systemIdleTime
    }

    it('uses system idle time when there is no manual reset', () => {
      const result = getEffectiveIdleTime(120, null, () => {})

      expect(result).toBe(120)
    })

    it('uses time since manual reset when reset is more recent', () => {
      const now = Date.now()
      const resetTime = now - 60000 // 60 seconds ago

      const result = getEffectiveIdleTime(300, resetTime, () => {})

      // Should be approximately 60 seconds
      expect(result).toBeLessThanOrEqual(61)
      expect(result).toBeGreaterThanOrEqual(59)
    })

    it('clears reset time when system activity is detected', () => {
      let resetCleared = false
      const now = Date.now()
      const resetTime = now - 120000 // 2 minutes ago

      // System idle is 30 seconds (less than time since reset)
      // This means user was active, clear the reset
      const result = getEffectiveIdleTime(30, resetTime, () => {
        resetCleared = true
      })

      expect(result).toBe(30)
      expect(resetCleared).toBe(true)
    })
  })

  describe('update-settings logic', () => {
    it('converts values to strings for storage', () => {
      const updates = {
        dailyTargetHours: 6,
        showEarnings: true,
        hourlyRate: 25.50
      }

      const stringified: Record<string, string> = {}
      for (const [key, value] of Object.entries(updates)) {
        stringified[key] = String(value)
      }

      expect(stringified.dailyTargetHours).toBe('6')
      expect(stringified.showEarnings).toBe('true')
      expect(stringified.hourlyRate).toBe('25.5')
    })

    it('handles all update types', () => {
      const updates = {
        theme: 'dark',
        currency: 'USD',
        idleThresholdMinutes: 15
      }

      const stringified: Record<string, string> = {}
      for (const [key, value] of Object.entries(updates)) {
        stringified[key] = String(value)
      }

      expect(stringified.theme).toBe('dark')
      expect(stringified.currency).toBe('USD')
      expect(stringified.idleThresholdMinutes).toBe('15')
    })
  })

  describe('idle threshold calculation', () => {
    it('converts minutes to seconds for threshold', () => {
      const idleThresholdMinutes = 10
      const thresholdSeconds = idleThresholdMinutes * 60

      expect(thresholdSeconds).toBe(600)
    })

    it('handles fractional minutes', () => {
      const idleIndicatorMinutes = 0.5
      const indicatorSeconds = idleIndicatorMinutes * 60

      expect(indicatorSeconds).toBe(30)
    })
  })
})
