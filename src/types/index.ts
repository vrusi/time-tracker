export interface Issue {
  id: number
  externalId: string
  name: string
  link: string | null
  notes: string | null
  archived: boolean
  createdAt: string
}

export interface TimeEntry {
  id: number
  issueId: number
  startedAt: string
  endedAt: string | null
  pausedReason: 'manual' | 'idle' | 'switched' | null
  notes: string | null
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

export interface Project {
  id: string
  name: string
  dbFile: string
  createdAt: string
}

export interface ProjectsConfig {
  activeProjectId: string
  projects: Project[]
}

export interface TrackingRecoveryInfo {
  entry: TimeEntry
  issue: Issue
  lastSeenAt: string
  totalElapsedSeconds: number
  elapsedSinceLastSeenSeconds: number
}

export interface IdleRecoveryInfo {
  entryId: number
  idleDurationSeconds: number
  pausedAt: string
}

export interface IdleRecoveryResult {
  entryId: number
  recoveredSeconds: number
  newEndTime: string
}

export interface AppSettings {
  dailyTargetHours: number
  weeklyTargetHours: number
  monthlyTargetHours: number
  hourlyRate: number
  currency: string
  currencySymbol: string
  idleThresholdMinutes: number
  idleIndicatorMinutes: number
  issueUrlPattern: 'gitlab' | 'github' | 'jira' | 'custom'
  issueBaseUrl?: string
  customIssuePattern?: string
  theme: 'light' | 'dark' | 'system'
  showEarnings: boolean
  notificationsEnabled: boolean
  claudeApiKey?: string
  slackBotToken?: string
  slackChannel?: string
  gitlabToken?: string
}

export interface GitlabIssueInfo {
  title: string
  description: string
  webUrl: string
}

export interface DailyBreakdownEntry {
  date: string
  externalId: string
  name: string
  hours: number
}

export interface StandupFormatRequest {
  externalId: string
  name: string
  link: string | null
  notes?: string | null
}

export interface PadTimesheetRequest {
  year: number
  month: number
  monthlyTargetHours: number
  totalHoursBefore: number
  dailyBreakdown: DailyBreakdownEntry[]
  trustedDays: string[]
  redistributeDays: string[]
}

export interface PadTimesheetResponse {
  paddedReport: { externalId: string; name: string; totalHours: number }[]
  totalHoursAfter: number
  notes: string
}

// IPC API exposed to renderer
export interface ElectronAPI {
  // Issues
  getIssues: (includeArchived?: boolean) => Promise<Issue[]>
  createIssue: (issue: Omit<Issue, 'id' | 'createdAt'>) => Promise<Issue>
  updateIssue: (id: number, updates: Partial<Pick<Issue, 'externalId' | 'name' | 'link' | 'notes'>>) => Promise<Issue>
  archiveIssue: (id: number) => Promise<void>
  unarchiveIssue: (id: number) => Promise<void>
  deleteIssue: (id: number) => Promise<void>
  mergeIssues: (sourceId: number, targetId: number) => Promise<void>

  // Tracking
  startTracking: (issueId: number) => Promise<TimeEntry>
  pauseTracking: (reason?: 'manual' | 'switched') => Promise<TimeEntry | null>
  getCurrentTracking: () => Promise<{ entry: TimeEntry; issue: Issue } | null>

  // Recovery
  checkTrackingRecovery: () => Promise<TrackingRecoveryInfo | null>
  resolveTrackingRecovery: (action: 'keep-all' | 'end-at-close' | 'discard', customEndTime?: string) => Promise<{ entry: TimeEntry; issue: Issue } | null>

  // Idle recovery
  getIdleRecoveryInfo: () => Promise<IdleRecoveryInfo | null>
  recoverIdleTime: () => Promise<IdleRecoveryResult | null>
  dismissIdleRecovery: () => Promise<void>

  // Presence mode
  getPresenceMode: () => Promise<boolean>
  setPresenceMode: (enabled: boolean) => Promise<void>

  // History
  getTimeEntries: (startDate: string, endDate: string) => Promise<(TimeEntry & { issue: Issue })[]>
  getIssueTime: (issueId: number) => Promise<number>
  getIssueTimesBatch: (issueIds: number[]) => Promise<Record<number, number>>
  getIssueEntries: (issueId: number) => Promise<TimeEntry[]>

  // Time entry management
  createTimeEntry: (issueId: number, startedAt: string, endedAt: string, notes?: string) => Promise<TimeEntry>
  updateTimeEntry: (id: number, updates: { startedAt?: string; endedAt?: string; notes?: string }) => Promise<TimeEntry>
  deleteTimeEntry: (id: number) => Promise<void>
  deleteTimeEntries: (ids: number[]) => Promise<void>
  mergeTimeEntries: (ids: number[]) => Promise<TimeEntry>
  deleteIssues: (ids: number[]) => Promise<void>
  wipeDatabase: () => Promise<void>
  exportDatabase: () => Promise<boolean>
  importDatabase: () => Promise<boolean>

  // Export
  exportMonth: (year: number, month: number) => Promise<MonthlyReport[]>
  getDailyBreakdown: (year: number, month: number) => Promise<DailyBreakdownEntry[]>

  // AI
  aiFormatStandup: (request: StandupFormatRequest) => Promise<string>
  aiPadTimesheet: (request: PadTimesheetRequest) => Promise<PadTimesheetResponse>

  // Slack
  slackPostMessage: (text: string) => Promise<void>

  // GitLab
  gitlabFetchIssue: (url: string) => Promise<GitlabIssueInfo>

  // Idle
  getIdleTime: () => Promise<number>
  resetIdleTime: () => Promise<void>

  // Settings
  getSettings: () => Promise<AppSettings>
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>

  // Projects
  getProjects: () => Promise<ProjectsConfig>
  getActiveProject: () => Promise<Project>
  createProject: (name: string) => Promise<Project>
  switchProject: (id: string) => Promise<Project>
  renameProject: (id: string, name: string) => Promise<Project>
  deleteProject: (id: string) => Promise<void>

  // Shell
  openExternal: (url: string) => Promise<void>

  // Events from main process
  onIdlePause: (callback: () => void) => void
  onTrackingUpdate: (callback: (data: { entry: TimeEntry; issue: Issue } | null) => void) => void
  onPresenceModeChange: (callback: (enabled: boolean) => void) => void
  onIdleUpdate: (callback: (seconds: number) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
