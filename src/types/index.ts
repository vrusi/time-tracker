export interface Issue {
  id: number
  externalId: string
  name: string
  link: string | null
  archived: boolean
  createdAt: string
}

export interface TimeEntry {
  id: number
  issueId: number
  startedAt: string
  endedAt: string | null
  pausedReason: 'manual' | 'idle' | 'switched' | null
}

export interface IssueWithTime extends Issue {
  totalSeconds: number
  isTracking: boolean
}

export interface DayGroup {
  date: string
  entries: (TimeEntry & { issue: Issue })[]
  totalSeconds: number
}

export interface MonthlyReport {
  issueId: number
  externalId: string
  name: string
  totalHours: number
}

// IPC API exposed to renderer
export interface ElectronAPI {
  // Issues
  getIssues: (includeArchived?: boolean) => Promise<Issue[]>
  createIssue: (issue: Omit<Issue, 'id' | 'createdAt'>) => Promise<Issue>
  updateIssue: (id: number, updates: Partial<Pick<Issue, 'externalId' | 'name' | 'link'>>) => Promise<Issue>
  archiveIssue: (id: number) => Promise<void>
  unarchiveIssue: (id: number) => Promise<void>

  // Tracking
  startTracking: (issueId: number) => Promise<TimeEntry>
  pauseTracking: (reason?: 'manual' | 'switched') => Promise<TimeEntry | null>
  getCurrentTracking: () => Promise<{ entry: TimeEntry; issue: Issue } | null>

  // Handsoff mode
  getHandsoffMode: () => Promise<boolean>
  setHandsoffMode: (enabled: boolean) => Promise<void>

  // History
  getTimeEntries: (startDate: string, endDate: string) => Promise<(TimeEntry & { issue: Issue })[]>
  getIssueTime: (issueId: number) => Promise<number>

  // Export
  exportMonth: (year: number, month: number) => Promise<MonthlyReport[]>

  // Events from main process
  onIdlePause: (callback: () => void) => void
  onTrackingUpdate: (callback: (data: { entry: TimeEntry; issue: Issue } | null) => void) => void
  onHandsoffModeChange: (callback: (enabled: boolean) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
