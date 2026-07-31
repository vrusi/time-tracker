import type { Issue } from '../../src/types'

/**
 * Database row type for issues table (snake_case from SQLite)
 */
export interface IssueRow {
  id: number
  external_id: string
  name: string
  link: string | null
  notes: string | null
  slack_message: string | null
  archived: number
  created_at: string
}

/**
 * Maps a database row to an Issue object
 */
export function mapIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    link: row.link,
    notes: row.notes,
    slackMessage: row.slack_message,
    archived: !!row.archived,
    createdAt: row.created_at
  }
}

/**
 * Maps multiple database rows to Issue objects
 */
export function mapIssues(rows: IssueRow[]): Issue[] {
  return rows.map(mapIssue)
}
