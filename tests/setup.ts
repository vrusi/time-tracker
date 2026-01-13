import { vi } from 'vitest'
import { createMockSettings } from './fixtures'

// Mock electronAPI for all tests
export const mockElectronAPI = {
  // Issues
  getIssues: vi.fn().mockResolvedValue([]),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  archiveIssue: vi.fn(),
  unarchiveIssue: vi.fn(),
  deleteIssue: vi.fn(),

  // Tracking
  startTracking: vi.fn(),
  pauseTracking: vi.fn(),
  getCurrentTracking: vi.fn().mockResolvedValue(null),

  // Presence mode
  getPresenceMode: vi.fn().mockResolvedValue(false),
  setPresenceMode: vi.fn(),

  // History
  getTimeEntries: vi.fn().mockResolvedValue([]),
  getIssueTime: vi.fn().mockResolvedValue(0),
  getIssueEntries: vi.fn().mockResolvedValue([]),

  // Time entry management
  createTimeEntry: vi.fn(),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),

  // Export
  exportMonth: vi.fn().mockResolvedValue([]),

  // Idle
  getIdleTime: vi.fn().mockResolvedValue(0),
  resetIdleTime: vi.fn(),

  // Settings - use fixture for default values
  getSettings: vi.fn().mockResolvedValue(createMockSettings()),
  updateSettings: vi.fn(),

  // Events
  onIdlePause: vi.fn(),
  onTrackingUpdate: vi.fn(),
  onPresenceModeChange: vi.fn(),
  onIdleUpdate: vi.fn(),
}

// Apply mock globally
vi.stubGlobal('window', {
  electronAPI: mockElectronAPI,
  matchMedia: vi.fn(() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
  setInterval: vi.fn(() => 1),
  clearInterval: vi.fn(),
  setTimeout: vi.fn(() => 1),
  clearTimeout: vi.fn(),
})
