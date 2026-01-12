import { vi } from 'vitest'

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

  // Handsoff mode
  getHandsoffMode: vi.fn().mockResolvedValue(false),
  setHandsoffMode: vi.fn(),

  // History
  getTimeEntries: vi.fn().mockResolvedValue([]),
  getIssueTime: vi.fn().mockResolvedValue(0),

  // Time entry management
  createTimeEntry: vi.fn(),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),

  // Export
  exportMonth: vi.fn().mockResolvedValue([]),

  // Idle
  getIdleTime: vi.fn().mockResolvedValue(0),
  resetIdleTime: vi.fn(),

  // Settings
  getSettings: vi.fn().mockResolvedValue({
    dailyTargetHours: 8,
    monthlyTargetHours: 160,
    hourlyRate: 18.67,
    currency: 'GBP',
    currencySymbol: '£',
    idleThresholdMinutes: 10,
    idleIndicatorSeconds: 30,
    issueUrlPattern: 'gitlab',
    theme: 'light',
    showEarnings: false,
    notificationsEnabled: true,
  }),
  updateSettings: vi.fn(),

  // Events - these are callbacks, return cleanup functions
  onIdlePause: vi.fn(),
  onTrackingUpdate: vi.fn(),
  onHandsoffModeChange: vi.fn(),
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

// Reset all mocks before each test
export function resetMocks() {
  Object.values(mockElectronAPI).forEach(mock => {
    if (typeof mock.mockReset === 'function') {
      mock.mockReset()
    }
  })
}
