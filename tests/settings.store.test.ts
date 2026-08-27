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
      it('extracts project name and issue number from GitLab URLs', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'gitlab'

        expect(store.extractIssueId('https://gitlab.com/org/repo/-/issues/123')).toBe('repo#123')
        expect(store.extractIssueId('https://gitlab.com/group/subgroup/project/-/issues/456')).toBe('project#456')
        expect(store.extractIssueId('https://gitlab.avvoka.com/avvoka/avvoka-reflow/-/issues/43')).toBe('avvoka-reflow#43')
        expect(store.extractIssueId('https://gitlab.avvoka.com/avvoka/app/-/issues/6620')).toBe('app#6620')
      })

      it('extracts merge request IDs with a "!" separator', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'gitlab'

        expect(store.extractIssueId('https://gitlab.com/org/repo/-/merge_requests/1234')).toBe('repo!1234')
        expect(store.extractIssueId('https://gitlab.avvoka.com/avvoka/app/-/merge_requests/12')).toBe('app!12')
        expect(store.extractIssueId('https://gitlab.com/group/sub/project/-/merge_requests/7/diffs')).toBe('project!7')
      })
    })

    describe('GitHub URLs', () => {
      it('extracts repo name and issue number from GitHub URLs', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'github'

        expect(store.extractIssueId('https://github.com/org/repo/issues/789')).toBe('repo#789')
        expect(store.extractIssueId('https://github.com/facebook/react/issues/12345')).toBe('react#12345')
      })

      it('extracts pull request IDs with a "!" separator', () => {
        const store = useSettingsStore()
        store.settings.issueUrlPattern = 'github'

        expect(store.extractIssueId('https://github.com/org/repo/pull/789')).toBe('repo!789')
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

  describe('bare issue ID parsing', () => {
    it('parses project#number format', () => {
      const store = useSettingsStore()
      expect(store.parseBareId('app#123')).toEqual({ prefix: 'app', number: '123', kind: 'issue' })
      expect(store.parseBareId('my-project#42')).toEqual({ prefix: 'my-project', number: '42', kind: 'issue' })
      expect(store.parseBareId('reflow#1')).toEqual({ prefix: 'reflow', number: '1', kind: 'issue' })
    })

    it('parses project!number as a merge request', () => {
      const store = useSettingsStore()
      expect(store.parseBareId('app!1234')).toEqual({ prefix: 'app', number: '1234', kind: 'merge_request' })
      expect(store.parseBareId('my-project!42')).toEqual({ prefix: 'my-project', number: '42', kind: 'merge_request' })
    })

    it('parses JIRA-style PROJ-123 format', () => {
      const store = useSettingsStore()
      expect(store.parseBareId('PROJ-123')).toEqual({ prefix: 'PROJ', number: '123', kind: 'issue' })
      expect(store.parseBareId('ABC-999')).toEqual({ prefix: 'ABC', number: '999', kind: 'issue' })
    })

    it('returns null for URLs and other non-bare inputs', () => {
      const store = useSettingsStore()
      expect(store.parseBareId('https://gitlab.com/org/repo/-/issues/123')).toBeNull()
      expect(store.parseBareId('just some text')).toBeNull()
      expect(store.parseBareId('')).toBeNull()
      expect(store.parseBareId('123')).toBeNull()
    })
  })

  describe('building issue URLs from bare IDs', () => {
    it('builds GitLab URL from bare ID and base URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'
      store.settings.issueBaseUrl = 'https://gitlab.com/my-org'

      expect(store.buildIssueUrl('app#222')).toBe('https://gitlab.com/my-org/app/-/issues/222')
    })

    it('builds GitLab merge request URL from bare "!" ID', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'
      store.settings.issueBaseUrl = 'https://gitlab.com/my-org'

      expect(store.buildIssueUrl('app!1234')).toBe('https://gitlab.com/my-org/app/-/merge_requests/1234')
    })

    it('builds GitHub URL from bare ID and base URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'github'
      store.settings.issueBaseUrl = 'https://github.com/my-org'

      expect(store.buildIssueUrl('repo#42')).toBe('https://github.com/my-org/repo/issues/42')
      expect(store.buildIssueUrl('repo!42')).toBe('https://github.com/my-org/repo/pull/42')
    })

    it('builds Jira URL from bare ID and base URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'jira'
      store.settings.issueBaseUrl = 'https://company.atlassian.net'

      expect(store.buildIssueUrl('PROJ-123')).toBe('https://company.atlassian.net/browse/PROJ-123')
    })

    it('returns null for a merge request ID under the Jira pattern', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'jira'
      store.settings.issueBaseUrl = 'https://company.atlassian.net'

      expect(store.buildIssueUrl('app!12')).toBeNull()
    })

    it('strips trailing slashes from base URL', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'
      store.settings.issueBaseUrl = 'https://gitlab.com/org/'

      expect(store.buildIssueUrl('app#1')).toBe('https://gitlab.com/org/app/-/issues/1')
    })

    it('returns null when base URL is missing', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'
      store.settings.issueBaseUrl = undefined

      expect(store.buildIssueUrl('app#1')).toBeNull()
    })

    it('returns null for invalid bare ID', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'gitlab'
      store.settings.issueBaseUrl = 'https://gitlab.com/org'

      expect(store.buildIssueUrl('not-a-bare-id')).toBeNull()
    })

    it('returns null for custom pattern', () => {
      const store = useSettingsStore()
      store.settings.issueUrlPattern = 'custom'
      store.settings.issueBaseUrl = 'https://example.com'

      expect(store.buildIssueUrl('app#1')).toBeNull()
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
