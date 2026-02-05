import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../src/stores/settings.store'
import { mockElectronAPI } from './setup'
import { createMockSettings } from './fixtures'

/**
 * Settings Store - manages app configuration and issue URL parsing.
 * Tests focus on issue ID extraction behavior (critical for issue linking).
 */
describe('Settings Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockElectronAPI.getSettings.mockReset()
    mockElectronAPI.updateSettings.mockReset()
  })

  describe('issue ID extraction', () => {
    describe('GitLab URLs', () => {
      it('extracts issue number from various GitLab URL formats', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'gitlab'

        expect(store.extractIssueId('https://gitlab.com/org/repo/-/issues/123')).toBe('#123')
        expect(store.extractIssueId('https://gitlab.com/group/subgroup/project/-/issues/456')).toBe('#456')
      })
    })

    describe('GitHub URLs', () => {
      it('extracts issue number from GitHub URLs', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'github'

        expect(store.extractIssueId('https://github.com/org/repo/issues/789')).toBe('#789')
        expect(store.extractIssueId('https://github.com/facebook/react/issues/12345')).toBe('#12345')
      })
    })

    describe('Jira URLs', () => {
      it('extracts ticket ID from Jira/Atlassian URLs', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'jira'

        expect(store.extractIssueId('https://company.atlassian.net/browse/PROJ-123')).toBe('PROJ-123')
        expect(store.extractIssueId('https://jira.example.com/browse/ABC-999')).toBe('ABC-999')
      })
    })

    describe('custom patterns', () => {
      it('supports user-defined regex patterns', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'custom'
        store.settings.customIssuePattern = '/ticket/(\\d+)'

        expect(store.extractIssueId('https://support.example.com/ticket/42')).toBe('#42')
      })

      it('falls back to default when custom pattern is invalid', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'custom'
        store.settings.customIssuePattern = '[invalid regex'

        expect(store.extractIssueId('https://example.com/issues/123')).toBe('#123')
      })

      it('falls back to default when custom pattern is empty or undefined', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'custom'

        store.settings.customIssuePattern = ''
        expect(store.extractIssueId('https://example.com/issues/456')).toBe('#456')

        store.settings.customIssuePattern = undefined
        expect(store.extractIssueId('https://example.com/issues/789')).toBe('#789')
      })
    })

    describe('invalid URLs', () => {
      it('returns null for URLs that do not match any pattern', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'gitlab'

        expect(store.extractIssueId('https://google.com')).toBeNull()
        expect(store.extractIssueId('not a url')).toBeNull()
        expect(store.extractIssueId('')).toBeNull()
      })
    })
  })

  describe('settings persistence', () => {
    it('loads settings from backend and marks as loaded', async () => {
      const store = useSettingsStore()
      const mockSettings = createMockSettings({ dailyTargetHours: 6 })
      mockElectronAPI.getSettings.mockResolvedValue(mockSettings)

      expect(store.isLoaded).toBe(false)

      await store.loadSettings()

      expect(store.settings.dailyTargetHours).toBe(6)
      expect(store.isLoaded).toBe(true)
    })

    it('persists setting changes to backend', async () => {
      const store = useSettingsStore()
      const updatedSettings = createMockSettings({ dailyTargetHours: 10 })
      mockElectronAPI.updateSettings.mockResolvedValue(updatedSettings)

      await store.updateSettings({ dailyTargetHours: 10 })

      expect(mockElectronAPI.updateSettings).toHaveBeenCalledWith({ dailyTargetHours: 10 })
      expect(store.settings.dailyTargetHours).toBe(10)
    })
  })
})
