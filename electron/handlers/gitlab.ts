import { ipcMain } from 'electron'
import { db } from '../db'
import { getSettings } from './settings'
import type { GitlabIssueInfo } from '../../src/types'

interface ParsedUrl {
  host: string
  projectPath: string
  iid: string
  kind: 'issues' | 'work_items'
}

function parseGitlabUrl(rawUrl: string): ParsedUrl {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Not a valid URL')
  }

  // Path format: /<group>/<...>/<project>/-/issues/<iid> or /-/work_items/<iid>
  const match = url.pathname.match(/^\/(.+)\/-\/(issues|work_items)\/(\d+)/)
  if (!match) {
    throw new Error('URL does not look like a GitLab issue or work item')
  }

  return {
    host: `${url.protocol}//${url.host}`,
    projectPath: match[1],
    kind: match[2] as 'issues' | 'work_items',
    iid: match[3]
  }
}

async function fetchFromApi(host: string, projectPath: string, iid: string, token: string): Promise<{ title: string; description: string; web_url: string }> {
  const encodedPath = encodeURIComponent(projectPath)
  const apiUrl = `${host}/api/v4/projects/${encodedPath}/issues/${iid}`

  const response = await fetch(apiUrl, {
    headers: {
      'PRIVATE-TOKEN': token,
      accept: 'application/json'
    }
  })

  if (response.status === 401) {
    throw new Error('GitLab rejected the token (401). Check the token and read_api scope.')
  }
  if (response.status === 404) {
    throw new Error('Issue not found. The token may lack access to this project.')
  }
  if (!response.ok) {
    throw new Error(`GitLab API error ${response.status}`)
  }

  return await response.json() as { title: string; description: string; web_url: string }
}

export function setupGitlabHandlers() {
  ipcMain.handle('gitlab-fetch-issue', async (_event, url: string): Promise<GitlabIssueInfo> => {
    const settings = getSettings(db)
    const token = settings.gitlabToken?.trim()
    if (!token) {
      throw new Error('GitLab token is not configured. Add it in Settings → GitLab.')
    }

    const parsed = parseGitlabUrl(url)
    const issue = await fetchFromApi(parsed.host, parsed.projectPath, parsed.iid, token)

    return {
      title: issue.title ?? '',
      description: issue.description ?? '',
      webUrl: issue.web_url ?? url
    }
  })
}
