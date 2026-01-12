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
    mockElectronAPI.startTracking.mockReset()
    mockElectronAPI.pauseTracking.mockReset()
    mockElectronAPI.setHandsoffMode.mockReset()
    mockElectronAPI.resetIdleTime.mockReset()
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

    it('handles issue not found', async () => {
      const store = useTrackerStore()
      const mockEntry = createMockTimeEntry({ issueId: 999 })

      mockElectronAPI.startTracking.mockResolvedValue(mockEntry)
      mockElectronAPI.getIssues.mockResolvedValue([])

      await store.startTracking(999)

      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toBeNull()
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

  describe('toggleHandsoffMode', () => {
    it('toggles handsoff mode on', async () => {
      const store = useTrackerStore()
      store.handsoffMode = false

      await store.toggleHandsoffMode()

      expect(mockElectronAPI.setHandsoffMode).toHaveBeenCalledWith(true)
      expect(store.handsoffMode).toBe(true)
    })

    it('toggles handsoff mode off', async () => {
      const store = useTrackerStore()
      store.handsoffMode = true

      await store.toggleHandsoffMode()

      expect(mockElectronAPI.setHandsoffMode).toHaveBeenCalledWith(false)
      expect(store.handsoffMode).toBe(false)
    })
  })

  describe('resetIdle', () => {
    it('calls API and resets idle seconds', async () => {
      const store = useTrackerStore()
      store.idleSeconds = 120

      await store.resetIdle()

      expect(mockElectronAPI.resetIdleTime).toHaveBeenCalled()
      expect(store.idleSeconds).toBe(0)
    })
  })

  describe('loadCurrentTracking', () => {
    it('loads active tracking session', async () => {
      const store = useTrackerStore()
      const mockEntry = createMockTimeEntry()
      const mockIssue = createMockIssue()

      mockElectronAPI.getCurrentTracking.mockResolvedValue({
        entry: mockEntry,
        issue: mockIssue,
      })
      mockElectronAPI.getHandsoffMode.mockResolvedValue(true)

      await store.loadCurrentTracking()

      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toEqual(mockIssue)
      expect(store.handsoffMode).toBe(true)
    })

    it('handles no active tracking', async () => {
      const store = useTrackerStore()
      mockElectronAPI.getCurrentTracking.mockResolvedValue(null)

      await store.loadCurrentTracking()

      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
    })
  })
})
