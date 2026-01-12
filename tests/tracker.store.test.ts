import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTrackerStore } from '../src/stores/tracker.store'
import { useSettingsStore } from '../src/stores/settings.store'
import { mockElectronAPI } from './setup'
import { createMockIssue, createMockTimeEntry } from './fixtures'

describe('Tracker Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockElectronAPI.getCurrentTracking.mockResolvedValue(null)
    mockElectronAPI.getHandsoffMode.mockResolvedValue(false)
  })

  describe('initial state', () => {
    it('starts with no active tracking', () => {
      const store = useTrackerStore()
      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
      expect(store.isTracking).toBe(false)
      expect(store.handsoffMode).toBe(false)
      expect(store.elapsedSeconds).toBe(0)
      expect(store.formattedTime).toBe('00:00:00')
    })
  })

  describe('isIdle', () => {
    it('returns false when idle seconds below threshold', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()
      settingsStore.settings.idleIndicatorSeconds = 30
      store.idleSeconds = 29
      expect(store.isIdle).toBe(false)
    })

    it('returns true when idle seconds at or above threshold', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()
      settingsStore.settings.idleIndicatorSeconds = 30
      store.idleSeconds = 30
      expect(store.isIdle).toBe(true)
    })
  })

  describe('startTracking', () => {
    it('calls API and updates state', async () => {
      const store = useTrackerStore()
      const mockEntry = createMockTimeEntry()
      const mockIssue = createMockIssue()

      mockElectronAPI.startTracking.mockResolvedValue(mockEntry)
      mockElectronAPI.getIssues.mockResolvedValue([mockIssue])

      await store.startTracking(1)

      expect(mockElectronAPI.startTracking).toHaveBeenCalledWith(1)
      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toEqual(mockIssue)
      expect(store.isTracking).toBe(true)
    })
  })

  describe('pauseTracking', () => {
    it('calls API and clears state', async () => {
      const store = useTrackerStore()
      store.currentEntry = createMockTimeEntry()
      store.currentIssue = createMockIssue()

      await store.pauseTracking()

      expect(mockElectronAPI.pauseTracking).toHaveBeenCalledWith('manual')
      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
      expect(store.isTracking).toBe(false)
    })
  })
})
