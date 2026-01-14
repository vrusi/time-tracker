import type { Issue, TimeEntry, AppSettings } from '../src/types'

export const createMockIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 1,
  externalId: '#123',
  name: 'Test Issue',
  link: 'https://github.com/org/repo/issues/123',
  notes: null,
  archived: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

export const createMockTimeEntry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 1,
  issueId: 1,
  startedAt: '2024-01-01T09:00:00.000Z',
  endedAt: null,
  pausedReason: null,
  notes: null,
  ...overrides,
})

export const createMockSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  dailyTargetHours: 8,
  monthlyTargetHours: 160,
  hourlyRate: 18.67,
  currency: 'GBP',
  currencySymbol: '£',
  idleThresholdMinutes: 10,
  idleIndicatorMinutes: 0.5,
  issueUrlPattern: 'gitlab',
  customIssuePattern: undefined,
  theme: 'light',
  showEarnings: false,
  notificationsEnabled: true,
  ...overrides,
})
