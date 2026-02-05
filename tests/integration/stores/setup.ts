import { vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mockElectronAPI } from '../../setup'
import { createMockSettings } from '../../fixtures'

export function setupStoreIntegration() {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())

    // Reset all mocks
    Object.values(mockElectronAPI).forEach(mock => {
      if (typeof mock.mockReset === 'function') mock.mockReset()
    })

    // Setup defaults
    mockElectronAPI.getCurrentTracking.mockResolvedValue(null)
    mockElectronAPI.getPresenceMode.mockResolvedValue(false)
    mockElectronAPI.getSettings.mockResolvedValue(createMockSettings())
    mockElectronAPI.getIssues.mockResolvedValue([])
    mockElectronAPI.getIdleRecoveryInfo.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })
}

/**
 * Simulates an IPC event by calling the registered handler.
 * Use this to test how stores react to backend events.
 */
export function getIPCHandler<T extends keyof typeof mockElectronAPI>(
  eventName: T
): ((...args: any[]) => void) | undefined {
  const calls = mockElectronAPI[eventName].mock.calls
  if (calls.length === 0) return undefined
  return calls[0][0]
}
