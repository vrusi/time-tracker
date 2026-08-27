import { ipcMain } from 'electron'
import { db } from '../db'
import { getSettings } from './settings'
import type { GitlabIssueInfo } from '../../src/types'

interface ParsedUrl {
  host: string
  projectPath: string
  iid: string
  kind: 'issues' | 'work_items' | 'merge_requests'
}

function parseGitlabUrl(rawUrl: string): ParsedUrl {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Not a valid URL')
  }

  // Path format: /<group>/<...>/<project>/-/issues/<iid>, /-/work_items/<iid> or /-/merge_requests/<iid>
  const match = url.pathname.match(/^\/(.+)\/-\/(issues|work_items|merge_requests)\/(\d+)/)
  if (!match) {
    throw new Error('URL does not look like a GitLab issue, work item or merge request')
  }

  return {
    host: `${url.protocol}//${url.host}`,
    projectPath: match[1],
    kind: match[2] as ParsedUrl['kind'],
    iid: match[3]
  }
}

async function fetchFromApi(host: string, projectPath: string, iid: string, token: string, kind: ParsedUrl['kind']): Promise<{ title: string; description: string; web_url: string }> {
  const encodedPath = encodeURIComponent(projectPath)
  // Work items share the issues endpoint; merge requests have their own
  const resource = kind === 'merge_requests' ? 'merge_requests' : 'issues'
  const apiUrl = `${host}/api/v4/projects/${encodedPath}/${resource}/${iid}`

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
    throw new Error('Item not found. The token may lack access to this project.')
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
    const issue = await fetchFromApi(parsed.host, parsed.projectPath, parsed.iid, token, parsed.kind)

    return {
      title: issue.title ?? '',
      description: issue.description ?? '',
      webUrl: issue.web_url ?? url
    }
  })
}
