import { ipcMain } from 'electron'
import { db } from '../db'
import { getSettings } from './settings'
import { renderForSlack } from '../../src/utils/slack'

const SLACK_POST_URL = 'https://slack.com/api/chat.postMessage'

interface SlackResponse {
  ok: boolean
  error?: string
  warning?: string
}

export function setupSlackHandlers() {
  ipcMain.handle('slack-post-message', async (_event, text: string): Promise<void> => {
    const settings = getSettings(db)
    const token = settings.slackBotToken?.trim()
    const channel = settings.slackChannel?.trim()

    if (!token) {
      throw new Error('Slack OAuth token is not configured. Add it in Settings → Slack.')
    }
    if (!channel) {
      throw new Error('Slack channel is not configured. Add it in Settings → Slack.')
    }
    if (!text || !text.trim()) {
      throw new Error('Cannot post an empty message')
    }

    const rendered = renderForSlack(text)
    console.log(`[slack] posting to ${channel}: ${rendered}`)

    const response = await fetch(SLACK_POST_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ channel, text: rendered })
    })

    if (!response.ok) {
      throw new Error(`Slack HTTP error ${response.status}`)
    }

    const data = await response.json() as SlackResponse
    console.log(`[slack] response:`, data)
    if (!data.ok) {
      throw new Error(`Slack error: ${data.error ?? 'unknown'}`)
    }
  })
}
