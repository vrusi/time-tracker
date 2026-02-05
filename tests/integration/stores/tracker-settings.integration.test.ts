import { describe, it, expect, vi } from 'vitest'
import { useTrackerStore } from '../../../src/stores/tracker.store'
import { useSettingsStore } from '../../../src/stores/settings.store'
import { setupStoreIntegration } from './setup'
import { mockElectronAPI } from '../../setup'
import { createMockSettings } from '../../fixtures'

/**
 * Integration tests: Tracker + Settings stores working together.
 * Tests idle detection thresholds and their coordination.
 */
describe('Tracker + Settings Integration', () => {
  setupStoreIntegration()

  describe('idle threshold coordination', () => {
    it('tracker uses settings store idle indicator threshold for isIdle', () => {
      const tracker = useTrackerStore()
      const settings = useSettingsStore()

      // Default is 0.5 minutes = 30 seconds
      expect(settings.settings.idleIndicatorMinutes).toBe(0.5)

      tracker.idleSeconds = 29
      expect(tracker.isIdle).toBe(false)

      tracker.idleSeconds = 30
      expect(tracker.isIdle).toBe(true)
    })

    it('tracker idle threshold updates when settings change', async () => {
      const tracker = useTrackerStore()
      const settings = useSettingsStore()

      // Initially 10 minutes = 600 seconds
      expect(tracker.idleThresholdSeconds).toBe(600)

      // Update settings
      mockElectronAPI.updateSettings.mockResolvedValue(
        createMockSettings({ idleThresholdMinutes: 5 })
      )
      await settings.updateSettings({ idleThresholdMinutes: 5 })

      // Tracker should reflect new threshold
      expect(tracker.idleThresholdSeconds).toBe(300)
    })

    it('idle indicator threshold updates when settings change', async () => {
      const tracker = useTrackerStore()
      const settings = useSettingsStore()

      // Default 0.5 min = 30s, so 30s is idle
      tracker.idleSeconds = 30
      expect(tracker.isIdle).toBe(true)

      // Change to 1 minute
      mockElectronAPI.updateSettings.mockResolvedValue(
        createMockSettings({ idleIndicatorMinutes: 1 })
      )
      await settings.updateSettings({ idleIndicatorMinutes: 1 })

      // 30 seconds should no longer be considered idle
      expect(tracker.isIdle).toBe(false)

      // 60 seconds should be idle
      tracker.idleSeconds = 60
      expect(tracker.isIdle).toBe(true)
    })
  })

  describe('idle progress calculation uses settings', () => {
    it('calculates progress relative to threshold from settings', () => {
      const tracker = useTrackerStore()
      const settings = useSettingsStore()

      // Default threshold is 10 minutes = 600 seconds
      expect(settings.settings.idleThresholdMinutes).toBe(10)

      tracker.idleSeconds = 300 // 5 minutes
      expect(tracker.idleProgress).toBe(50) // 50% of threshold

      tracker.idleSeconds = 600 // 10 minutes
      expect(tracker.idleProgress).toBe(100) // 100% of threshold
    })

    it('progress clamps at 100%', () => {
      const tracker = useTrackerStore()

      // Exceed threshold
      tracker.idleSeconds = 900 // 15 minutes, threshold is 10
      expect(tracker.idleProgress).toBe(100)
    })

    it('progress updates when settings threshold changes', async () => {
      const tracker = useTrackerStore()
      const settings = useSettingsStore()

      tracker.idleSeconds = 300 // 5 minutes

      // With 10 min threshold: 50%
      expect(tracker.idleProgress).toBe(50)

      // Change to 5 min threshold
      mockElectronAPI.updateSettings.mockResolvedValue(
        createMockSettings({ idleThresholdMinutes: 5 })
      )
      await settings.updateSettings({ idleThresholdMinutes: 5 })

      // Same idle time is now 100%
      expect(tracker.idleProgress).toBe(100)
    })
  })

  describe('settings loading affects tracker', () => {
    it('tracker reflects settings after loadSettings', async () => {
      const tracker = useTrackerStore()
      const settings = useSettingsStore()

      // Mock backend returns custom settings
      mockElectronAPI.getSettings.mockResolvedValue(
        createMockSettings({
          idleThresholdMinutes: 15,
          idleIndicatorMinutes: 2
        })
      )

      await settings.loadSettings()

      // Tracker should use loaded settings
      expect(tracker.idleThresholdSeconds).toBe(900) // 15 min
      expect(settings.settings.idleIndicatorMinutes).toBe(2)

      // Test idle detection with new indicator
      tracker.idleSeconds = 119
      expect(tracker.isIdle).toBe(false)
      tracker.idleSeconds = 120
      expect(tracker.isIdle).toBe(true)
    })
  })
})
