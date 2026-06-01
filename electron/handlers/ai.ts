import { ipcMain } from 'electron'
import { db } from '../db'
import { getSettings } from './settings'
import type {
  StandupFormatRequest,
  PadTimesheetRequest,
  PadTimesheetResponse,
  DailyBreakdownEntry
} from '../../src/types'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-4-7'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

async function callClaude(apiKey: string, system: string, messages: AnthropicMessage[], maxTokens = 1024): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages
    })
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Claude API error ${response.status}: ${errText.slice(0, 300)}`)
  }

  const data = await response.json() as { content?: { type: string; text: string }[] }
  const text = data.content?.find(c => c.type === 'text')?.text
  if (!text) {
    throw new Error('Claude API returned no text content')
  }
  return text.trim()
}

function requireApiKey(): string {
  const settings = getSettings(db)
  const key = settings.claudeApiKey?.trim()
  if (!key) {
    throw new Error('Claude API key is not configured. Add it in Settings → AI.')
  }
  return key
}

const STANDUP_SYSTEM = `You format work-in-progress lines for a Slack standup.

Output format (one line, plain text, no markdown, no extra explanation):
  <ref> | <area> | <short detail> | <estimate> | %

Where:
- <ref>: the issue URL if provided (raw URL, no angle brackets, no markdown). If no URL, use the issue ID prefixed with "#" (e.g. "#6506").
- <area>: a single lowercase tag like "redesign", "questionnaire", "drive", "ui", "qa", "backend". Infer from the issue name.
- <short detail>: the cleaned-up issue description (keep it concise, lowercase first letter, no trailing period).
- <estimate>: rough effort like "1h", "2h", "4h", "1d", "2d", "1w". Infer conservatively from the task type and name. QA fixes / typos → 1-3h; small components → 2-4h; index pages or larger features → 1d; multi-page redesigns → 1w.
- "%" literally — a bare percent sign that the user will fill in.

Examples:
  https://gitlab.avvoka.com/avvoka/app/-/issues/6491 | redesign | operations tab | 1d | %
  #6506 | redesign | headers & footers index | 1d | %
  #9535 | questionnaire | < and > show as encoded | 4h | %

Output ONLY the formatted line. No quotes, no preamble, no trailing newline.`

const PAD_SYSTEM = `You are a timesheet padding assistant.

You receive a JSON object describing one month of tracked work and a monthly hour target. The total currently tracked hours fall short of the target. Your job: redistribute hours so the per-issue totals sum to the target, while keeping the result plausible.

Rules:
1. The sum of "totalHours" in your output MUST equal "monthlyTargetHours" (within ±0.25h).
2. For days listed in "redistributeDays", subtract the excess above ~8h from those days' tasks (proportionally across that day's tasks). The user did NOT actually work that much.
3. For days listed in "trustedDays" with >9h, leave them alone — the user really worked that.
4. Pad the remaining gap into other tasks using these heuristics:
   - Big design / redesign / index-page tasks can absorb a lot (multiple hours, even many).
   - Small QA / bug-fix / typo tasks should get only modest padding (maybe +0.5–2h).
   - Code review tasks: minimal padding (≤1h) — these don't realistically grow.
   - Prefer spreading padding across multiple tasks rather than dumping on one.
5. Round each issue's final totalHours to the nearest 0.25h.
6. Preserve every issue in the input (don't drop tasks).
7. Do NOT invent new issues / externalIds.

Output STRICT JSON ONLY (no markdown fences, no commentary) matching:
{
  "paddedReport": [{ "externalId": string, "name": string, "totalHours": number }, ...],
  "totalHoursAfter": number,
  "notes": string  // 1-2 sentences explaining what you did
}`

function aggregateBreakdown(breakdown: DailyBreakdownEntry[]): { externalId: string; name: string; totalHours: number }[] {
  const byId = new Map<string, { externalId: string; name: string; totalHours: number }>()
  for (const entry of breakdown) {
    const existing = byId.get(entry.externalId)
    if (existing) {
      existing.totalHours += entry.hours
    } else {
      byId.set(entry.externalId, {
        externalId: entry.externalId,
        name: entry.name,
        totalHours: entry.hours
      })
    }
  }
  return Array.from(byId.values())
}

function parsePadResponse(raw: string): PadTimesheetResponse {
  // Strip code fences if Claude added them despite the instructions
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }

  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed.paddedReport)) {
    throw new Error('Claude response missing paddedReport array')
  }
  return {
    paddedReport: parsed.paddedReport.map((r: any) => ({
      externalId: String(r.externalId ?? ''),
      name: String(r.name ?? ''),
      totalHours: Number(r.totalHours) || 0
    })),
    totalHoursAfter: Number(parsed.totalHoursAfter) || 0,
    notes: String(parsed.notes ?? '')
  }
}

export function setupAiHandlers() {
  ipcMain.handle('ai-format-standup', async (_event, request: StandupFormatRequest): Promise<string> => {
    const apiKey = requireApiKey()
    const userPrompt = JSON.stringify({
      externalId: request.externalId,
      name: request.name,
      link: request.link,
      notes: request.notes ?? null
    })
    return callClaude(apiKey, STANDUP_SYSTEM, [{ role: 'user', content: userPrompt }], 256)
  })

  ipcMain.handle('ai-pad-timesheet', async (_event, request: PadTimesheetRequest): Promise<PadTimesheetResponse> => {
    const apiKey = requireApiKey()

    const issuesSummary = aggregateBreakdown(request.dailyBreakdown)

    const userPayload = {
      year: request.year,
      month: request.month,
      monthlyTargetHours: request.monthlyTargetHours,
      totalHoursBefore: request.totalHoursBefore,
      gapHours: Math.max(0, request.monthlyTargetHours - request.totalHoursBefore),
      trustedDays: request.trustedDays,
      redistributeDays: request.redistributeDays,
      issuesAggregate: issuesSummary,
      dailyBreakdown: request.dailyBreakdown
    }

    const raw = await callClaude(
      apiKey,
      PAD_SYSTEM,
      [{ role: 'user', content: JSON.stringify(userPayload) }],
      4096
    )

    return parsePadResponse(raw)
  })
}
