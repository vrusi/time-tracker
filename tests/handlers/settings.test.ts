import { describe, it, expect } from 'vitest'

/**
 * Settings Handler Logic - parsing and idle time calculation.
 * These are critical business rules for app configuration.
 */
describe('Settings Handler Logic', () => {
  describe('settings parsing from storage', () => {
    /**
     * Replicates the settings parsing logic from the handler.
     * SQLite stores all values as strings; this converts to proper types.
     */
    function parseSettings(rawSettings: Record<string, string>) {
      return {
        dailyTargetHours: parseFloat(rawSettings.dailyTargetHours) || 8,
        weeklyTargetHours: parseFloat(rawSettings.weeklyTargetHours) || 40,
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

    it('uses sensible defaults when settings are missing', () => {
      const settings = parseSettings({})

      expect(settings.dailyTargetHours).toBe(8)
      expect(settings.weeklyTargetHours).toBe(40)
      expect(settings.monthlyTargetHours).toBe(160)
      expect(settings.hourlyRate).toBe(18.67)
      expect(settings.currency).toBe('GBP')
      expect(settings.idleThresholdMinutes).toBe(10)
      expect(settings.showEarnings).toBe(false)
      expect(settings.notificationsEnabled).toBe(true)
    })

    it('parses numeric strings to numbers', () => {
      const settings = parseSettings({
        dailyTargetHours: '7.5',
        hourlyRate: '25.50'
      })

      expect(settings.dailyTargetHours).toBe(7.5)
      expect(settings.hourlyRate).toBe(25.50)
    })

    it('falls back to defaults for invalid numbers', () => {
      const settings = parseSettings({
        dailyTargetHours: 'invalid',
        hourlyRate: 'not-a-number'
      })

      expect(settings.dailyTargetHours).toBe(8)
      expect(settings.hourlyRate).toBe(18.67)
    })

    it('parses boolean settings correctly', () => {
      // showEarnings: only true when explicitly 'true'
      expect(parseSettings({ showEarnings: 'true' }).showEarnings).toBe(true)
      expect(parseSettings({ showEarnings: 'false' }).showEarnings).toBe(false)
      expect(parseSettings({}).showEarnings).toBe(false)

      // notificationsEnabled: only false when explicitly 'false'
      expect(parseSettings({ notificationsEnabled: 'true' }).notificationsEnabled).toBe(true)
      expect(parseSettings({ notificationsEnabled: 'false' }).notificationsEnabled).toBe(false)
      expect(parseSettings({}).notificationsEnabled).toBe(true)
    })
  })

  describe('effective idle time calculation', () => {
    /**
     * Handles the case where user manually reset idle but system still
     * reports the old idle time. Uses the time since manual reset instead.
     */
    function getEffectiveIdleTime(
      systemIdleTime: number,
      idleResetTime: number | null,
      clearResetTime: () => void
    ): number {
      if (idleResetTime !== null) {
        const timeSinceReset = Math.floor((Date.now() - idleResetTime) / 1000)
        if (systemIdleTime > timeSinceReset) {
          // System still shows old idle time, use time since reset
          return timeSinceReset
        } else {
          // System idle reset naturally (user activity), clear manual reset
          clearResetTime()
        }
      }
      return systemIdleTime
    }

    it('uses system idle time when no manual reset', () => {
      const result = getEffectiveIdleTime(120, null, () => {})
      expect(result).toBe(120)
    })

    it('uses time since manual reset when more recent than system idle', () => {
      const now = Date.now()
      const resetTime = now - 60000 // 60 seconds ago

      const result = getEffectiveIdleTime(300, resetTime, () => {})

      expect(result).toBeGreaterThanOrEqual(59)
      expect(result).toBeLessThanOrEqual(61)
    })

    it('clears manual reset when user activity is detected', () => {
      let resetCleared = false
      const now = Date.now()
      const resetTime = now - 120000 // 2 minutes ago

      // System idle is 30s (less than 2 minutes since reset)
      // means user was active, should clear the reset
      const result = getEffectiveIdleTime(30, resetTime, () => {
        resetCleared = true
      })

      expect(result).toBe(30)
      expect(resetCleared).toBe(true)
    })
  })
})
