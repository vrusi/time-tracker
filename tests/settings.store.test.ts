import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../src/stores/settings.store'
import { mockElectronAPI } from './setup'
import { createMockSettings } from './fixtures'

describe('Settings Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockElectronAPI.getSettings.mockReset()
    mockElectronAPI.updateSettings.mockReset()
  })

  describe('extractIssueId', () => {
    it('extracts GitLab issue ID from URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'

      expect(store.extractIssueId('https://gitlab.com/org/repo/-/issues/123')).toBe('#123')
      expect(store.extractIssueId('https://gitlab.com/group/subgroup/project/-/issues/456')).toBe('#456')
    })

    it('extracts GitHub issue ID from URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'github'

      expect(store.extractIssueId('https://github.com/org/repo/issues/789')).toBe('#789')
      expect(store.extractIssueId('https://github.com/facebook/react/issues/12345')).toBe('#12345')
    })

    it('extracts Jira issue ID from URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'jira'

      expect(store.extractIssueId('https://company.atlassian.net/browse/PROJ-123')).toBe('PROJ-123')
      expect(store.extractIssueId('https://jira.example.com/browse/ABC-999')).toBe('ABC-999')
    })

    it('returns null for invalid URLs', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'

      expect(store.extractIssueId('https://google.com')).toBeNull()
      expect(store.extractIssueId('not a url')).toBeNull()
    })

    it('returns null for empty string', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'
      expect(store.extractIssueId('')).toBeNull()
    })

    it('works with custom pattern', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'custom'
      store.settings.customIssuePattern = '/ticket/(\\d+)'

      expect(store.extractIssueId('https://support.example.com/ticket/42')).toBe('#42')
    })

    it('falls back to default pattern if custom pattern is invalid', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'custom'
      store.settings.customIssuePattern = '[invalid regex'

      // Falls back to /issues/(\d+)
      expect(store.extractIssueId('https://example.com/issues/123')).toBe('#123')
    })

    it('falls back to default pattern if custom pattern is empty', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'custom'
      store.settings.customIssuePattern = ''

      // Falls back to /issues/(\d+)
      expect(store.extractIssueId('https://example.com/issues/456')).toBe('#456')
    })

    it('falls back to default pattern if custom pattern is undefined', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'custom'
      store.settings.customIssuePattern = undefined

      expect(store.extractIssueId('https://example.com/issues/789')).toBe('#789')
    })
  })

  describe('loadSettings', () => {
    it('loads settings from API and sets isLoaded', async () => {
      const store = useSettingsStore()
      const mockSettings = createMockSettings({ dailyTargetHours: 6 })
      mockElectronAPI.getSettings.mockResolvedValue(mockSettings)

      expect(store.isLoaded).toBe(false)

      await store.loadSettings()

      expect(mockElectronAPI.getSettings).toHaveBeenCalled()
      expect(store.settings.dailyTargetHours).toBe(6)
      expect(store.isLoaded).toBe(true)
    })
  })

  describe('updateSettings', () => {
    it('updates settings via API', async () => {
      const store = useSettingsStore()
      const updatedSettings = createMockSettings({ dailyTargetHours: 10 })
      mockElectronAPI.updateSettings.mockResolvedValue(updatedSettings)

      await store.updateSettings({ dailyTargetHours: 10 })

      expect(mockElectronAPI.updateSettings).toHaveBeenCalledWith({ dailyTargetHours: 10 })
      expect(store.settings.dailyTargetHours).toBe(10)
    })

    it('applies theme when theme is updated', async () => {
      const store = useSettingsStore()
      const updatedSettings = createMockSettings({ theme: 'dark' })
      mockElectronAPI.updateSettings.mockResolvedValue(updatedSettings)

      await store.updateSettings({ theme: 'dark' })

      expect(mockElectronAPI.updateSettings).toHaveBeenCalledWith({ theme: 'dark' })
      expect(store.settings.theme).toBe('dark')
    })
  })

  describe('issueIdRegex', () => {
    it('returns gitlab regex for gitlab pattern', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'

      expect(store.issueIdRegex.source).toBe('\\/issues\\/(\\d+)')
    })

    it('returns github regex for github pattern', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'github'

      expect(store.issueIdRegex.source).toBe('\\/issues\\/(\\d+)')
    })

    it('returns jira regex for jira pattern', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'jira'

      expect(store.issueIdRegex.source).toBe('\\/browse\\/([A-Z]+-\\d+)')
    })

    it('returns custom regex when valid', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'custom'
      store.settings.customIssuePattern = '/task/(\\d+)'

      // The regex source escapes forward slashes
      expect(store.issueIdRegex.source).toBe('\\/task\\/(\\d+)')
    })

    it('returns default regex for unknown pattern', () => {
      const store = useSettingsStore()
      // @ts-expect-error testing invalid pattern
      store.settings.issueUrlPattern = 'unknown'

      expect(store.issueIdRegex.source).toBe('\\/issues\\/(\\d+)')
    })
  })
})
