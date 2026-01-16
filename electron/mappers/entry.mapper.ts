import type { Issue, TimeEntry } from '../../src/types'
import { mapIssue, type IssueRow } from './issue.mapper'

/**
 * Database row type for time_entries table (snake_case from SQLite)
 */
export interface TimeEntryRow {
  id: number
  issue_id: number
  started_at: string
  ended_at: string | null
  paused_reason: 'manual' | 'idle' | 'switched' | null
  notes: string | null
}

/**
 * Database row type for time entries joined with issues
 */
export interface TimeEntryWithIssueRow extends TimeEntryRow {
  external_id: string
  name: string
  link: string | null
  issue_notes: string | null
  archived: number
  issue_created_at: string
}

/**
 * Maps a database row to a TimeEntry object
 */
export function mapTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    issueId: row.issue_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    pausedReason: row.paused_reason,
    notes: row.notes
  }
}

/**
 * Maps multiple database rows to TimeEntry objects
 */
export function mapTimeEntries(rows: TimeEntryRow[]): TimeEntry[] {
  return rows.map(mapTimeEntry)
}

/**
 * Maps a joined time entry + issue row to TimeEntry with embedded Issue
 */
export function mapTimeEntryWithIssue(row: TimeEntryWithIssueRow): TimeEntry & { issue: Issue } {
  return {
    id: row.id,
    issueId: row.issue_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    pausedReason: row.paused_reason,
    notes: row.notes,
    issue: {
      id: row.issue_id,
      externalId: row.external_id,
      name: row.name,
      link: row.link,
      notes: row.issue_notes,
      archived: !!row.archived,
      createdAt: row.issue_created_at
    }
  }
}

/**
 * Maps multiple joined rows to TimeEntry with Issue objects
 */
export function mapTimeEntriesWithIssue(rows: TimeEntryWithIssueRow[]): (TimeEntry & { issue: Issue })[] {
  return rows.map(mapTimeEntryWithIssue)
}

/**
 * Combines a TimeEntryRow and IssueRow into a tracking result
 */
export function mapTrackingResult(entry: TimeEntryRow, issue: IssueRow): { entry: TimeEntry; issue: Issue } {
  return {
    entry: mapTimeEntry(entry),
    issue: mapIssue(issue)
  }
}
