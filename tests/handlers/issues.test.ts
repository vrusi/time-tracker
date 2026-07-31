import { describe, it, expect } from 'vitest'
import { mapIssue, mapIssues, type IssueRow } from '../../electron/mappers/issue.mapper'

/**
 * Issue Mapper - transforms database rows to domain objects.
 * This is the testable boundary between SQLite and the app.
 */
describe('Issue Mapper', () => {
  describe('mapIssue', () => {
    it('transforms database row to Issue domain object', () => {
      const row: IssueRow = {
        id: 1,
        external_id: '#123',
        name: 'Test Issue',
        link: 'https://example.com',
        notes: 'Some notes',
        slack_message: null,
        archived: 0,
        created_at: '2024-01-01T00:00:00.000Z'
      }

      const issue = mapIssue(row)

      expect(issue).toEqual({
        id: 1,
        externalId: '#123',
        name: 'Test Issue',
        link: 'https://example.com',
        notes: 'Some notes',
        slackMessage: null,
        archived: false,
        createdAt: '2024-01-01T00:00:00.000Z'
      })
    })

    it('converts SQLite integer boolean to JavaScript boolean', () => {
      const archived: IssueRow = {
        id: 1, external_id: '#1', name: 'Archived',
        link: null, notes: null, archived: 1, created_at: '2024-01-01T00:00:00.000Z'
      }

      const active: IssueRow = {
        id: 2, external_id: '#2', name: 'Active',
        link: null, notes: null, slack_message: null, archived: 0, created_at: '2024-01-01T00:00:00.000Z'
      }

      expect(mapIssue(archived).archived).toBe(true)
      expect(mapIssue(active).archived).toBe(false)
    })

    it('preserves null values for optional fields', () => {
      const row: IssueRow = {
        id: 1, external_id: '#1', name: 'No Link',
        link: null, notes: null, slack_message: null, archived: 0, created_at: '2024-01-01T00:00:00.000Z'
      }

      const issue = mapIssue(row)

      expect(issue.link).toBeNull()
      expect(issue.notes).toBeNull()
    })
  })

  describe('mapIssues', () => {
    it('transforms array of database rows', () => {
      const rows: IssueRow[] = [
        { id: 1, external_id: '#1', name: 'Issue 1', link: null, notes: null, archived: 0, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 2, external_id: '#2', name: 'Issue 2', link: null, notes: null, archived: 1, created_at: '2024-01-02T00:00:00.000Z' }
      ]

      const issues = mapIssues(rows)

      expect(issues).toHaveLength(2)
      expect(issues[0].externalId).toBe('#1')
      expect(issues[1].externalId).toBe('#2')
      expect(issues[0].archived).toBe(false)
      expect(issues[1].archived).toBe(true)
    })

    it('returns empty array for empty input', () => {
      expect(mapIssues([])).toEqual([])
    })
  })
})
