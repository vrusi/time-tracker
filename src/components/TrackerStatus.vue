<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'
import { useIssuesStore } from '../stores/issues.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue } from '../types'
import { toLocalDateTimeInput } from '@/utils/format'
import { renderForSlack } from '@/utils/slack'
import { RCard, RButton, RInput, RProgress, RText, RDialog } from 'roughness'
import Icon from './Icon.vue'

const trackerStore = useTrackerStore()
const issuesStore = useIssuesStore()
const settingsStore = useSettingsStore()

// Issue form state
const link = ref('')
const name = ref('')
const isSubmitting = ref(false)
const matchedIssue = ref<Issue | null>(null)

// Description autocomplete state
const showNameSuggestions = ref(false)
const selectedNameSuggestionIndex = ref(-1)

const filteredNameSuggestions = computed(() => {
  const query = name.value.trim().toLowerCase()
  if (!query || matchedIssue.value) return []
  return issuesStore.issues
    .filter(i => !i.archived && i.name.toLowerCase().includes(query))
    .slice(0, 5)
})

function selectNameSuggestion(issue: Issue) {
  matchedIssue.value = issue
  name.value = issue.name
  if (issue.link) link.value = issue.link
  showNameSuggestions.value = false
  selectedNameSuggestionIndex.value = -1
  if (issue.slackMessage) slackMsg.value = issue.slackMessage
}

function handleNameInput() {
  if (matchedIssue.value && name.value !== matchedIssue.value.name) {
    matchedIssue.value = null
  }
  showNameSuggestions.value = name.value.trim().length > 0 && !matchedIssue.value
  selectedNameSuggestionIndex.value = -1
}

function handleNameKeydown(e: KeyboardEvent) {
  if (!showNameSuggestions.value || filteredNameSuggestions.value.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedNameSuggestionIndex.value = Math.min(
      selectedNameSuggestionIndex.value + 1,
      filteredNameSuggestions.value.length - 1
    )
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedNameSuggestionIndex.value = Math.max(selectedNameSuggestionIndex.value - 1, -1)
  } else if (e.key === 'Enter' && selectedNameSuggestionIndex.value >= 0) {
    e.preventDefault()
    selectNameSuggestion(filteredNameSuggestions.value[selectedNameSuggestionIndex.value])
  } else if (e.key === 'Escape') {
    showNameSuggestions.value = false
    selectedNameSuggestionIndex.value = -1
  }
}

function handleNameBlur() {
  setTimeout(() => { showNameSuggestions.value = false }, 150)
}

// Link field autocomplete state
const showLinkSuggestions = ref(false)
const selectedLinkSuggestionIndex = ref(-1)

// Match issues by externalId or name, so one field serves both
// ("105" matches "app#105"; "reflow" matches the name). ID hits rank first.
function matchIssues(query: string, excludeId?: number): Issue[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const idMatches: Issue[] = []
  const nameMatches: Issue[] = []
  for (const i of issuesStore.issues) {
    if (i.archived || i.id === excludeId) continue
    if (i.externalId && i.externalId.toLowerCase().includes(q)) idMatches.push(i)
    else if (i.name.toLowerCase().includes(q)) nameMatches.push(i)
  }
  return [...idMatches, ...nameMatches].slice(0, 5)
}

const filteredLinkSuggestions = computed(() => {
  if (matchedIssue.value) return []
  return matchIssues(link.value)
})

function selectLinkSuggestion(issue: Issue) {
  matchedIssue.value = issue
  name.value = issue.name
  link.value = issue.link || issue.externalId
  showLinkSuggestions.value = false
  selectedLinkSuggestionIndex.value = -1
  if (issue.slackMessage) slackMsg.value = issue.slackMessage
}

function handleLinkInput() {
  if (matchedIssue.value) {
    matchedIssue.value = null
  }
  // If URL changes away from what we last fetched, the suggestion is stale
  if (lastFetchedUrl && link.value.trim() !== lastFetchedUrl) {
    fetchedTitle.value = null
    fetchedDescription.value = null
  }
  showLinkSuggestions.value = link.value.trim().length > 0 && !matchedIssue.value
  selectedLinkSuggestionIndex.value = -1
}

function handleLinkKeydown(e: KeyboardEvent) {
  if (!showLinkSuggestions.value || filteredLinkSuggestions.value.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedLinkSuggestionIndex.value = Math.min(
      selectedLinkSuggestionIndex.value + 1,
      filteredLinkSuggestions.value.length - 1
    )
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedLinkSuggestionIndex.value = Math.max(selectedLinkSuggestionIndex.value - 1, -1)
  } else if (e.key === 'Enter' && selectedLinkSuggestionIndex.value >= 0) {
    e.preventDefault()
    selectLinkSuggestion(filteredLinkSuggestions.value[selectedLinkSuggestionIndex.value])
  } else if (e.key === 'Escape') {
    showLinkSuggestions.value = false
    selectedLinkSuggestionIndex.value = -1
  }
}

function handleLinkBlur() {
  setTimeout(() => { showLinkSuggestions.value = false }, 150)
  tryAutoMatchFromLink()
  void maybeFetchFromGitlab()
}

function tryAutoMatchFromLink() {
  if (matchedIssue.value) return
  const existing = findExistingIssueFromForm()
  if (existing) {
    matchedIssue.value = existing
    if (!name.value.trim()) name.value = existing.name
    if (existing.slackMessage && !slackMsg.value.trim()) {
      slackMsg.value = existing.slackMessage
    }
  }
}

// GitLab auto-fetch
const fetchedTitle = ref<string | null>(null)
const fetchedDescription = ref<string | null>(null)
const isFetchingGitlab = ref(false)
let lastFetchedUrl = ''
let pendingGitlabFetch: Promise<void> | null = null

function looksLikeGitlabUrl(value: string): boolean {
  return /\/-\/(issues|work_items|merge_requests)\/\d+/.test(value) && /^https?:\/\//.test(value)
}

// A URL or a bare ID ("app#123", "PROJ-12") is a link; anything else typed in the
// first field is treated as an item name.
function looksLikeIdentifier(value: string): boolean {
  return /^https?:\/\//.test(value) || settingsStore.parseBareId(value) !== null
}

async function fetchGitlabInfo(url: string): Promise<{ title: string | null; description: string | null }> {
  if (!looksLikeGitlabUrl(url) || !settingsStore.settings.gitlabToken) {
    return { title: null, description: null }
  }
  try {
    const info = await window.electronAPI.gitlabFetchIssue(url)
    return { title: info.title || null, description: info.description || null }
  } catch (err) {
    console.error('GitLab fetch failed:', err)
    showToast(err instanceof Error ? err.message : 'GitLab fetch failed', true)
    return { title: null, description: null }
  }
}

function maybeFetchFromGitlab(): Promise<void> {
  // If a fetch is already in flight, return its promise — concurrent callers wait on the same fetch
  if (pendingGitlabFetch) return pendingGitlabFetch

  const url = link.value.trim()
  if (!url || url === lastFetchedUrl) return Promise.resolve()
  if (matchedIssue.value) return Promise.resolve()
  if (!looksLikeGitlabUrl(url)) return Promise.resolve()
  if (!settingsStore.settings.gitlabToken) return Promise.resolve()

  lastFetchedUrl = url
  isFetchingGitlab.value = true

  pendingGitlabFetch = (async () => {
    try {
      const info = await window.electronAPI.gitlabFetchIssue(url)
      fetchedTitle.value = info.title || null
      if (!name.value.trim() && info.title) {
        name.value = info.title
      }
      fetchedDescription.value = info.description || null
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'GitLab fetch failed'
      console.error('GitLab fetch failed:', err)
      showToast(msg, true)
    } finally {
      isFetchingGitlab.value = false
      pendingGitlabFetch = null
    }
  })()

  // After fetch, also generate the Slack message if Advanced is open
  pendingGitlabFetch.then(() => { void autoGenerateSlackMessage() })

  return pendingGitlabFetch
}

const submitTooltip = computed(() => {
  return matchedIssue.value
    ? 'Resume tracking existing tracked item'
    : 'Start tracking this tracked item'
})

const showNotes = ref(false)
const currentNotes = ref('')

// Toast state
const toastMessage = ref('')
const toastIsError = ref(false)

function showToast(message: string, isError = false) {
  toastMessage.value = message
  toastIsError.value = isError
  setTimeout(() => { toastMessage.value = '' }, 3000)
}

// Edit issue while tracking
const isEditingIssue = ref(false)
const editForm = ref({ name: '', externalId: '', link: '', startedAt: '' })
const editNameInput = ref<HTMLInputElement | null>(null)

function startEditingIssue() {
  if (trackerStore.currentIssue) {
    editForm.value = {
      name: trackerStore.currentIssue.name,
      externalId: trackerStore.currentIssue.externalId || '',
      link: trackerStore.currentIssue.link || '',
      startedAt: trackerStore.currentEntry ? toLocalDateTimeInput(trackerStore.currentEntry.startedAt) : ''
    }
    isEditingIssue.value = true
    nextTick(() => {
      editNameInput.value?.focus()
    })
  }
}

async function saveIssueEdit() {
  if (trackerStore.currentIssue && editForm.value.name.trim()) {
    // Validate start time before saving anything
    if (trackerStore.currentEntry && editForm.value.startedAt) {
      const newStart = new Date(editForm.value.startedAt)
      if (newStart.getTime() > Date.now()) {
        showToast('Start time cannot be in the future', true)
        return
      }
    }

    try {
      await issuesStore.updateIssue(trackerStore.currentIssue.id, {
        name: editForm.value.name.trim(),
        externalId: editForm.value.externalId.trim(),
        link: editForm.value.link.trim() || null
      })

      // Update start time if changed
      if (trackerStore.currentEntry && editForm.value.startedAt) {
        const newStartedAt = new Date(editForm.value.startedAt).toISOString()
        if (newStartedAt !== trackerStore.currentEntry.startedAt) {
          await window.electronAPI.updateTimeEntry(trackerStore.currentEntry.id, {
            startedAt: newStartedAt
          })
          trackerStore.currentEntry.startedAt = newStartedAt
        }
      }

      await trackerStore.refreshCurrentIssue()
      showToast('Updated')
    } catch (err) {
      console.error('Failed to update issue:', err)
      showToast('Failed to update', true)
    }
  }
  isEditingIssue.value = false
}

function cancelEditingIssue() {
  isEditingIssue.value = false
}

// Save notes on blur
async function saveNotesOnBlur() {
  if (trackerStore.currentEntry && currentNotes.value.trim()) {
    try {
      await window.electronAPI.updateTimeEntry(trackerStore.currentEntry.id, {
        notes: currentNotes.value.trim()
      })
      showToast('Note saved')
    } catch (err) {
      console.error('Failed to save note:', err)
      showToast('Failed to save note', true)
    }
  }
}

// Save notes to current entry when pausing
async function pauseWithNotes() {
  try {
    if (trackerStore.currentEntry && currentNotes.value.trim()) {
      await window.electronAPI.updateTimeEntry(trackerStore.currentEntry.id, {
        notes: currentNotes.value.trim()
      })
    }
    currentNotes.value = ''
    showNotes.value = false
    await trackerStore.pauseTracking()
  } catch (err) {
    console.error('Failed to pause tracking:', err)
    showToast('Failed to pause tracking', true)
  }
}

// Reset notes when tracking changes
watch(() => trackerStore.currentEntry?.id, () => {
  currentNotes.value = ''
  showNotes.value = false
})

// Handle idle time recovery
async function handleRecoverIdleTime() {
  try {
    await trackerStore.recoverIdleTime()
    showToast('Idle time recovered')
  } catch (err) {
    console.error('Failed to recover idle time:', err)
    showToast('Failed to recover idle time', true)
  }
}

// Standup formatting
const showStandupDialog = ref(false)
const isFormattingStandup = ref(false)
const standupText = ref('')
const standupError = ref('')

async function openStandupDialog() {
  if (!trackerStore.currentIssue) return

  showStandupDialog.value = true
  standupText.value = ''
  standupError.value = ''

  const issue = trackerStore.currentIssue
  if (issue.slackMessage) {
    standupText.value = issue.slackMessage
    try {
      await navigator.clipboard.writeText(issue.slackMessage)
      showToast('Copied saved standup — edit & re-copy if needed')
    } catch {
      // ignore
    }
    return
  }

  if (!settingsStore.settings.claudeApiKey) {
    showToast('Add a Claude API key in Settings → AI', true)
    return
  }

  isFormattingStandup.value = true
  try {
    const formatted = await window.electronAPI.aiFormatStandup({
      externalId: issue.externalId,
      name: issue.name,
      link: issue.link,
      notes: issue.notes ?? null
    })
    standupText.value = formatted
    await saveSlackMessageToIssue(issue.id, formatted)
    try {
      await navigator.clipboard.writeText(formatted)
      showToast('Copied — edit & re-copy if needed')
    } catch {
      // Clipboard might fail silently in dev; user can still click Copy
    }
  } catch (err) {
    console.error('Failed to format standup line:', err)
    standupError.value = err instanceof Error ? err.message : 'Failed to format'
  } finally {
    isFormattingStandup.value = false
  }
}

async function copyStandupText() {
  try {
    await navigator.clipboard.writeText(standupText.value)
    showToast('Copied to clipboard')
    showStandupDialog.value = false
  } catch {
    showToast('Failed to copy', true)
  }
}

const isPostingToSlack = ref(false)
const canPostToSlack = computed(() =>
  !!settingsStore.settings.slackBotToken && !!settingsStore.settings.slackChannel
)

// Advanced form (expand below quick)
const showAdvanced = ref(false)
const slackMsg = ref('')
const isGeneratingSlackMsg = ref(false)

// Inline standup proposal (shown after Quick Start)
const showInlineProposal = ref(false)
const proposalText = ref('')
const isGeneratingProposal = ref(false)
const isPostingProposal = ref(false)
const proposalError = ref('')

function findExistingIssueFromForm(): Issue | null {
  if (matchedIssue.value) return matchedIssue.value
  const url = link.value.trim()
  if (!url) return null
  const linkMatch = issuesStore.issues.find(i => i.link && i.link === url)
  if (linkMatch) return linkMatch
  if (!looksLikeIdentifier(url)) {
    // Free text in the first field is a name, not an ID — match it as one.
    return issuesStore.issues.find(i => !i.archived && i.name.toLowerCase() === url.toLowerCase()) || null
  }
  const externalId = settingsStore.parseBareId(url)
    ? url
    : settingsStore.extractIssueId(url)
  if (externalId) {
    const idMatch = issuesStore.issues.find(i => i.externalId === externalId)
    if (idMatch) return idMatch
  }
  return null
}

async function saveSlackMessageToIssue(issueId: number, message: string) {
  const trimmed = message.trim()
  try {
    await issuesStore.updateIssue(issueId, { slackMessage: trimmed || null })
    if (trackerStore.currentIssue?.id === issueId) {
      await trackerStore.refreshCurrentIssue()
    }
  } catch (err) {
    console.warn('Failed to save Slack message:', err)
  }
}

async function autoGenerateSlackMessage() {
  if (!showAdvanced.value) return
  if (!link.value.trim()) return
  if (slackMsg.value.trim()) return

  const existing = findExistingIssueFromForm()
  if (existing?.slackMessage) {
    slackMsg.value = existing.slackMessage
    return
  }

  if (!settingsStore.settings.claudeApiKey) return

  isGeneratingSlackMsg.value = true
  try {
    // The first field holds a link/ID or a plain name — never feed a name to the ID parser.
    const raw = link.value.trim()
    const isIdentifier = looksLikeIdentifier(raw)
    const externalId = isIdentifier ? settingsStore.extractIssueId(raw) || '' : ''
    const formatted = await window.electronAPI.aiFormatStandup({
      externalId,
      name: name.value.trim() || (isIdentifier ? externalId || 'Untitled' : raw),
      link: isIdentifier ? raw : null,
      notes: fetchedDescription.value
    })
    slackMsg.value = formatted
  } catch (err) {
    console.warn('Auto-generate Slack message failed:', err)
  } finally {
    isGeneratingSlackMsg.value = false
  }
}

function toggleAdvanced() {
  showAdvanced.value = !showAdvanced.value
  if (showAdvanced.value) void autoGenerateSlackMessage()
}

// Turn whatever was typed (link, bare ID, or plain name) into an issue,
// reusing an existing one whenever it maps to the same link, ID, or name.
async function resolveIssue(rawInput: string, explicitName: string, description: string | null): Promise<Issue> {
  let url: string | null = rawInput.trim() || null
  let issueName = explicitName.trim()

  if (url && !looksLikeIdentifier(url)) {
    if (!issueName) issueName = url
    url = null
  }

  let externalId = ''
  if (url) {
    const parsed = settingsStore.parseBareId(url)
    if (parsed) {
      externalId = url
      url = settingsStore.buildIssueUrl(url)
    } else {
      externalId = settingsStore.extractIssueId(url) || ''
    }
  }

  // Reuse an existing issue if the link, externalId, or name already maps to one.
  // This keeps a saved Slack message attached to the same item across re-pastes.
  const existing = issuesStore.issues.find(i =>
    (url && i.link === url) ||
    (externalId && i.externalId === externalId) ||
    (!url && !externalId && !!issueName && i.name.toLowerCase() === issueName.toLowerCase())
  )
  if (existing) return existing

  if (!issueName) issueName = externalId || 'Untitled'
  return issuesStore.createIssue(externalId, issueName, url, description)
}

async function createAndStart(): Promise<Issue> {
  const issue = matchedIssue.value
    ?? await resolveIssue(link.value, name.value, fetchedDescription.value)
  await trackerStore.startTracking(issue.id)
  return issue
}

function resetForm() {
  link.value = ''
  name.value = ''
  slackMsg.value = ''
  matchedIssue.value = null
  fetchedTitle.value = null
  fetchedDescription.value = null
  lastFetchedUrl = ''
}

async function handleQuickStart() {
  if (!link.value.trim() && !name.value.trim()) return

  isSubmitting.value = true
  let issue: Issue | null = null
  let snapUrl = ''
  let snapDesc: string | null = null
  try {
    // Ensure GitLab fetch finished (handles the case where user clicks Start before blur completes)
    await maybeFetchFromGitlab()
    snapUrl = link.value.trim()
    snapDesc = fetchedDescription.value
    issue = await createAndStart()
    resetForm()
  } finally {
    isSubmitting.value = false
  }

  if (!issue) return

  await showStandupProposalFor(issue, snapUrl, snapDesc)
}

async function showStandupProposalFor(issue: Issue, snapUrl: string, snapDesc: string | null) {
  showInlineProposal.value = true
  proposalText.value = ''
  proposalError.value = ''

  // If we already have a saved Slack message for this issue, reuse it — no Claude call.
  if (issue.slackMessage) {
    proposalText.value = issue.slackMessage
    return
  }

  isGeneratingProposal.value = true
  try {
    const formatted = await window.electronAPI.aiFormatStandup({
      externalId: issue.externalId,
      name: issue.name,
      link: issue.link || snapUrl,
      notes: snapDesc || issue.notes
    })
    proposalText.value = formatted
    await saveSlackMessageToIssue(issue.id, formatted)
  } catch (err) {
    proposalError.value = err instanceof Error ? err.message : 'Failed to generate'
  } finally {
    isGeneratingProposal.value = false
  }
}

// --- Switch to another item mid-session -------------------------------------
// The running entry is closed by the backend (reason "switched"), so its time is
// kept; only the live timer restarts on the new item.
const switchQuery = ref('')
const isSwitching = ref(false)
const showSwitchSuggestions = ref(false)
const selectedSwitchIndex = ref(-1)

const filteredSwitchSuggestions = computed(() =>
  matchIssues(switchQuery.value, trackerStore.currentIssue?.id)
)

function handleSwitchInput() {
  showSwitchSuggestions.value = switchQuery.value.trim().length > 0
  selectedSwitchIndex.value = -1
}

function handleSwitchKeydown(e: KeyboardEvent) {
  if (!showSwitchSuggestions.value || filteredSwitchSuggestions.value.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedSwitchIndex.value = Math.min(
      selectedSwitchIndex.value + 1,
      filteredSwitchSuggestions.value.length - 1
    )
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedSwitchIndex.value = Math.max(selectedSwitchIndex.value - 1, -1)
  } else if (e.key === 'Escape') {
    showSwitchSuggestions.value = false
    selectedSwitchIndex.value = -1
  }
}

function handleSwitchBlur() {
  setTimeout(() => { showSwitchSuggestions.value = false }, 150)
}

async function saveCurrentNotes() {
  if (trackerStore.currentEntry && currentNotes.value.trim()) {
    try {
      await window.electronAPI.updateTimeEntry(trackerStore.currentEntry.id, {
        notes: currentNotes.value.trim()
      })
    } catch (err) {
      console.error('Failed to save note:', err)
    }
  }
}

async function switchToIssue(issue: Issue) {
  if (issue.id === trackerStore.currentIssue?.id) {
    resetSwitchForm()
    return
  }
  isSwitching.value = true
  try {
    // Notes belong to the entry we are leaving — flush them before it closes.
    await saveCurrentNotes()
    currentNotes.value = ''
    showNotes.value = false
    await trackerStore.startTracking(issue.id)
    resetSwitchForm()
    showToast(`Switched to ${issue.externalId || issue.name}`)
  } catch (err) {
    console.error('Failed to switch tracked item:', err)
    showToast('Failed to switch', true)
    return
  } finally {
    isSwitching.value = false
  }

  await showStandupProposalFor(issue, issue.link || '', issue.notes ?? null)
}

function resetSwitchForm() {
  switchQuery.value = ''
  showSwitchSuggestions.value = false
  selectedSwitchIndex.value = -1
}

async function handleSwitchSubmit() {
  if (isSwitching.value) return

  const highlighted = selectedSwitchIndex.value >= 0
    ? filteredSwitchSuggestions.value[selectedSwitchIndex.value]
    : null
  if (highlighted) {
    await switchToIssue(highlighted)
    return
  }

  const raw = switchQuery.value.trim()
  if (!raw) return

  // Exact link hit — no need to ask GitLab about an item we already know.
  const known = issuesStore.issues.find(i => i.link === raw)
  if (known) {
    await switchToIssue(known)
    return
  }

  isSwitching.value = true
  let info: { title: string | null; description: string | null }
  let issue: Issue
  try {
    info = await fetchGitlabInfo(raw)
    issue = await resolveIssue(raw, info.title || '', info.description)
  } finally {
    isSwitching.value = false
  }
  await switchToIssue(issue)
}

async function handleStartAndSend() {
  const message = slackMsg.value.trim()
  if (!message) {
    showToast('Standup message is empty', true)
    return
  }
  if (!canPostToSlack.value) {
    showToast('Configure Slack in Settings → Slack', true)
    return
  }

  isSubmitting.value = true
  try {
    const issue = await createAndStart()
    await saveSlackMessageToIssue(issue.id, message)
    try {
      await window.electronAPI.slackPostMessage(message)
      showToast(`Posted to ${settingsStore.settings.slackChannel}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Slack post failed'
      showToast(msg, true)
    }
    resetForm()
    showAdvanced.value = false
  } finally {
    isSubmitting.value = false
  }
}

async function handleStartWithoutSending() {
  if (!link.value.trim() && !name.value.trim()) return
  isSubmitting.value = true
  try {
    await createAndStart()
    resetForm()
    showAdvanced.value = false
  } finally {
    isSubmitting.value = false
  }
}

async function sendInlineProposal() {
  if (!proposalText.value.trim()) return
  if (!canPostToSlack.value) {
    showToast('Configure Slack in Settings → Slack', true)
    return
  }
  isPostingProposal.value = true
  try {
    if (trackerStore.currentIssue) {
      await saveSlackMessageToIssue(trackerStore.currentIssue.id, proposalText.value)
    }
    await window.electronAPI.slackPostMessage(proposalText.value)
    showToast(`Posted to ${settingsStore.settings.slackChannel}`)
    showInlineProposal.value = false
    proposalText.value = ''
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Slack post failed'
    showToast(msg, true)
  } finally {
    isPostingProposal.value = false
  }
}

function dismissInlineProposal() {
  showInlineProposal.value = false
  proposalText.value = ''
  proposalError.value = ''
}

async function resumeFromPaused() {
  const issueId = trackerStore.lastTrackedIssue?.id
  if (!issueId) return
  await trackerStore.startTracking(issueId)
  // After resuming, surface the saved Slack message (if any) so it can be re-sent.
  const issue = issuesStore.issues.find(i => i.id === issueId) || trackerStore.currentIssue
  if (issue?.slackMessage) {
    proposalText.value = issue.slackMessage
    proposalError.value = ''
    showInlineProposal.value = true
  }
}

async function postStandupToSlack() {
  if (!standupText.value.trim()) return
  isPostingToSlack.value = true
  try {
    if (trackerStore.currentIssue) {
      await saveSlackMessageToIssue(trackerStore.currentIssue.id, standupText.value)
    }
    await window.electronAPI.slackPostMessage(standupText.value)
    showToast(`Posted to ${settingsStore.settings.slackChannel}`)
    showStandupDialog.value = false
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to post to Slack'
    console.error('Slack post failed:', err)
    showToast(msg, true)
  } finally {
    isPostingToSlack.value = false
  }
}

async function regenerateStandup() {
  if (!trackerStore.currentIssue) return
  if (!settingsStore.settings.claudeApiKey) {
    showToast('Add a Claude API key in Settings → AI', true)
    return
  }
  standupError.value = ''
  isFormattingStandup.value = true
  try {
    const issue = trackerStore.currentIssue
    const formatted = await window.electronAPI.aiFormatStandup({
      externalId: issue.externalId,
      name: issue.name,
      link: issue.link,
      notes: issue.notes ?? null
    })
    standupText.value = formatted
    await saveSlackMessageToIssue(issue.id, formatted)
    try {
      await navigator.clipboard.writeText(formatted)
      showToast('Copied')
    } catch {
      // ignore
    }
  } catch (err) {
    standupError.value = err instanceof Error ? err.message : 'Failed to format'
  } finally {
    isFormattingStandup.value = false
  }
}
</script>

<template>
  <RCard class="tracker-hero">
    <!-- Paused state - show last tracked issue -->
    <template v-if="(!trackerStore.isTracking || !trackerStore.currentIssue) && trackerStore.lastTrackedIssue">
      <div class="paused-content">
        <div class="tracker-row">
          <div class="issue-info">
            <RText v-if="trackerStore.lastTrackedIssue.externalId" class="issue-id">{{ trackerStore.lastTrackedIssue.externalId }}</RText>
            <RText class="issue-name">{{ trackerStore.lastTrackedIssue.name }}</RText>
          </div>
          <div class="timer-section">
            <span class="timer-display paused">{{ trackerStore.formattedPausedTime }}</span>
            <span class="status-badge">{{ trackerStore.pauseReason === 'idle' ? 'Idle' : 'Paused' }}</span>
          </div>
          <div class="action-buttons">
            <RButton
              size="small"
              color="success"
              @click="resumeFromPaused"
              title="Resume tracking"
            >
              <Icon name="play" :size="16" />
            </RButton>
            <RButton
              size="small"
              @click="trackerStore.clearLastTracked()"
              title="Dismiss"
            >
              X
            </RButton>
          </div>
        </div>

        <!-- Idle recovery option -->
        <div v-if="trackerStore.canRecoverIdleTime" class="idle-recovery-section">
          <div class="idle-recovery-prompt">
            <RText size="small">
              Were you actually working? Recover {{ trackerStore.formattedRecoverableIdleTime }} of idle time?
            </RText>
            <div class="idle-recovery-buttons">
              <RButton size="small" color="success" @click="handleRecoverIdleTime">
                Yes, recover
              </RButton>
              <RButton size="small" @click="trackerStore.dismissIdleRecovery()">
                No, discard
              </RButton>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Not tracking state (no last issue) - show issue form -->
    <template v-else-if="!trackerStore.isTracking || !trackerStore.currentIssue">
      <div class="not-tracking-form">
        <form @submit.prevent="handleQuickStart" class="hero-form">
          <div class="link-input-wrapper">
            <input
              v-model="link"
              type="text"
              placeholder="Paste link, type an ID, or describe the work"
              class="field-input url-input"
              autocomplete="off"
              @input="handleLinkInput"
              @keydown="handleLinkKeydown"
              @blur="handleLinkBlur"
              @focus="handleLinkInput"
            />
            <span v-if="isFetchingGitlab" class="gitlab-fetch-spinner" title="Fetching from GitLab…">⟳</span>
            <ul v-if="showLinkSuggestions && filteredLinkSuggestions.length > 0" class="suggestions-dropdown">
              <li
                v-for="(issue, index) in filteredLinkSuggestions"
                :key="issue.id"
                class="suggestion-item"
                :class="{ 'suggestion-active': index === selectedLinkSuggestionIndex }"
                @mousedown.prevent="selectLinkSuggestion(issue)"
              >
                <span v-if="issue.externalId" class="suggestion-id">{{ issue.externalId }}</span>
                <span class="suggestion-name">{{ issue.name }}</span>
              </li>
            </ul>
          </div>
          <span class="submit-wrapper" :title="submitTooltip">
            <RButton
              type="submit"
              size="small"
              color="success"
              :loading="isSubmitting"
            >
              <Icon name="play" :size="16" />
              {{ isSubmitting ? '...' : (matchedIssue ? 'Resume' : 'Start') }}
            </RButton>
          </span>
        </form>

        <div
          class="quick-hint"
          :class="{ 'quick-hint-suggested': fetchedTitle, 'quick-hint-loading': isFetchingGitlab }"
        >
          <template v-if="isFetchingGitlab">
            <span>⟳ Fetching title from GitLab…</span>
          </template>
          <template v-else-if="fetchedTitle">
            <span class="quick-hint-label">Suggested name (from GitLab)</span>
            <strong class="quick-hint-title">{{ fetchedTitle }}</strong>
            <span class="quick-hint-sub">Click Start to save with this name, or expand "More options" to edit.</span>
          </template>
          <template v-else>
            <span>Slack standup will generate here after you start tracking.</span>
          </template>
        </div>

        <button type="button" class="advanced-toggle" @click="toggleAdvanced">
          {{ showAdvanced ? '▴' : '▾' }} More options
        </button>

        <div v-if="showAdvanced" class="advanced-form">
          <div class="name-input-wrapper">
            <input
              v-model="name"
              type="text"
              placeholder="Item description"
              class="field-input name-input"
              autocomplete="off"
              @input="handleNameInput"
              @keydown="handleNameKeydown"
              @blur="handleNameBlur"
              @focus="handleNameInput"
            />
            <ul v-if="showNameSuggestions && filteredNameSuggestions.length > 0" class="suggestions-dropdown">
              <li
                v-for="(issue, index) in filteredNameSuggestions"
                :key="issue.id"
                class="suggestion-item"
                :class="{ 'suggestion-active': index === selectedNameSuggestionIndex }"
                @mousedown.prevent="selectNameSuggestion(issue)"
              >
                <span v-if="issue.externalId" class="suggestion-id">{{ issue.externalId }}</span>
                <span class="suggestion-name">{{ issue.name }}</span>
              </li>
            </ul>
          </div>

          <div class="advanced-slack-row">
            <textarea
              v-model="slackMsg"
              class="standup-textarea"
              rows="2"
              placeholder="Slack standup message (auto-filled from link)"
              spellcheck="false"
            ></textarea>
            <span v-if="isGeneratingSlackMsg" class="gitlab-fetch-spinner" title="Generating…">⟳</span>
          </div>
          <div v-if="slackMsg && renderForSlack(slackMsg) !== slackMsg" class="slack-preview">
            <span class="slack-preview-label">Will send as:</span>
            <code class="slack-preview-text">{{ renderForSlack(slackMsg) }}</code>
          </div>

          <div class="advanced-actions">
            <RButton
              type="button"
              size="small"
              filled
              color="success"
              :loading="isSubmitting"
              :disabled="!canPostToSlack"
              :title="canPostToSlack ? 'Start tracking and post to Slack' : 'Configure Slack in Settings → Slack'"
              @click="handleStartAndSend"
            >
              Start & Send
            </RButton>
            <RButton
              type="button"
              size="small"
              :loading="isSubmitting"
              @click="handleStartWithoutSending"
            >
              Start without sending
            </RButton>
          </div>
        </div>
      </div>
    </template>

    <!-- Actively tracking -->
    <template v-else>
      <div class="tracking-content">
        <div class="tracker-row">
          <div class="issue-info">
            <template v-if="!isEditingIssue">
              <RText v-if="trackerStore.currentIssue.externalId" class="issue-id">{{ trackerStore.currentIssue.externalId }}</RText>
              <RText class="issue-name">{{ trackerStore.currentIssue.name }}</RText>
            </template>
            <template v-else>
              <form class="edit-issue-form" @submit.prevent="saveIssueEdit">
                <input
                  v-model="editForm.name"
                  type="text"
                  class="edit-name-input"
                  placeholder="Name"
                  ref="editNameInput"
                  required
                />
                <input
                  v-model="editForm.externalId"
                  type="text"
                  class="edit-name-input edit-id-input"
                  placeholder="ID (e.g. app#123 or app!45)"
                />
                <input
                  v-model="editForm.link"
                  type="text"
                  class="edit-name-input edit-link-input"
                  placeholder="Link (optional)"
                />
                <div class="edit-start-time">
                  <label class="edit-start-label">Started at</label>
                  <input
                    v-model="editForm.startedAt"
                    type="datetime-local"
                    class="edit-name-input edit-time-input"
                  />
                </div>
                <div class="edit-issue-actions">
                  <RButton type="submit" size="small" filled>Save</RButton>
                  <RButton type="button" size="small" @click="cancelEditingIssue">Cancel</RButton>
                </div>
              </form>
            </template>
          </div>
          <div class="timer-section">
            <span class="timer-display">{{ trackerStore.formattedTime }}</span>
            <span class="status-dot" :class="trackerStore.isIdle && !trackerStore.presenceMode ? 'idle' : 'active'"></span>
          </div>
          <div class="action-buttons">
            <RButton
              size="small"
              :class="['subtle-btn', trackerStore.presenceMode && 'subtle-btn-active']"
              @click="trackerStore.togglePresenceMode()"
              :title="trackerStore.presenceMode ? 'Presence mode ON - idle detection disabled. Click to disable.' : 'Enable presence mode - disables idle detection'"
            >
              <Icon name="presence" :size="16" />
            </RButton>
            <RButton
              size="small"
              :class="['subtle-btn', showNotes && 'subtle-btn-active']"
              @click="showNotes = !showNotes"
              title="Add notes to this time entry (saved when you pause)"
            >
              <Icon name="note" :size="16" />
            </RButton>
            <RButton
              size="small"
              :class="['subtle-btn', isEditingIssue && 'subtle-btn-active']"
              @click="isEditingIssue ? cancelEditingIssue() : startEditingIssue()"
              title="Edit tracked item"
            >
              <Icon name="pencil" :size="16" />
            </RButton>
            <RButton
              size="small"
              class="subtle-btn"
              @click="openStandupDialog"
              title="Copy for Slack standup"
            >
              <span class="standup-icon">#</span>
            </RButton>
            <RButton
              size="small"
              color="error"
              @click="pauseWithNotes"
              title="Stop tracking"
            >
              Pause
            </RButton>
          </div>
        </div>

        <!-- Switch to another item without losing the tracked time -->
        <form v-if="!isEditingIssue" class="switch-form" @submit.prevent="handleSwitchSubmit">
          <label class="switch-label" for="switch-input">Switch to</label>
          <div class="switch-input-wrapper">
            <input
              id="switch-input"
              v-model="switchQuery"
              type="text"
              placeholder="ID, name, or link…"
              class="field-input switch-input"
              autocomplete="off"
              @input="handleSwitchInput"
              @keydown="handleSwitchKeydown"
              @blur="handleSwitchBlur"
              @focus="handleSwitchInput"
            />
            <ul v-if="showSwitchSuggestions && filteredSwitchSuggestions.length > 0" class="suggestions-dropdown">
              <li
                v-for="(issue, index) in filteredSwitchSuggestions"
                :key="issue.id"
                class="suggestion-item"
                :class="{ 'suggestion-active': index === selectedSwitchIndex }"
                @mousedown.prevent="switchToIssue(issue)"
              >
                <span v-if="issue.externalId" class="suggestion-id">{{ issue.externalId }}</span>
                <span class="suggestion-name">{{ issue.name }}</span>
              </li>
            </ul>
          </div>
          <RButton
            type="submit"
            size="small"
            :loading="isSwitching"
            :disabled="!switchQuery.trim() || isSwitching"
            title="Keep the time tracked so far and start tracking another item"
          >
            {{ isSwitching ? '...' : 'Switch' }}
          </RButton>
        </form>

        <!-- Idle progress bar (when idle) -->
        <div v-if="trackerStore.isIdle && !trackerStore.presenceMode" class="idle-section">
          <div class="idle-header">
            <RText size="small" class="text-warning">
              Idle {{ trackerStore.formattedIdleTime }} - auto-pause in {{ Math.ceil((trackerStore.idleThresholdSeconds - trackerStore.idleSeconds) / 60) }} min
            </RText>
            <RButton size="small" @click="trackerStore.resetIdle()">I'm back</RButton>
          </div>
          <div class="idle-progress-wrapper">
            <RProgress :value="trackerStore.idleProgress / 100" color="warning" />
          </div>
        </div>

        <!-- Notes input -->
        <div v-if="showNotes" class="notes-section">
          <RInput
            v-model="currentNotes"
            :lines="2"
            placeholder="Notes for this session..."
            @focusout="saveNotesOnBlur"
          />
        </div>

        <!-- Inline standup proposal -->
        <div v-if="showInlineProposal" class="inline-proposal">
          <div class="inline-proposal-header">
            <RText size="small" class="text-secondary">Proposed standup</RText>
            <span v-if="isGeneratingProposal" class="gitlab-fetch-spinner" title="Generating…">⟳</span>
          </div>
          <div v-if="proposalError" class="standup-error">
            <RText>{{ proposalError }}</RText>
          </div>
          <textarea
            v-else
            v-model="proposalText"
            class="standup-textarea"
            rows="2"
            :placeholder="isGeneratingProposal ? 'Claude is formatting…' : 'Edit if needed'"
            spellcheck="false"
          ></textarea>
          <div v-if="proposalText && renderForSlack(proposalText) !== proposalText" class="slack-preview">
            <span class="slack-preview-label">Will send as:</span>
            <code class="slack-preview-text">{{ renderForSlack(proposalText) }}</code>
          </div>
          <div class="inline-proposal-actions">
            <RButton size="small" @click="dismissInlineProposal">Dismiss</RButton>
            <RButton
              size="small"
              filled
              color="success"
              :disabled="!proposalText || isGeneratingProposal || isPostingProposal || !canPostToSlack"
              :title="canPostToSlack ? `Post to ${settingsStore.settings.slackChannel}` : 'Configure Slack in Settings → Slack'"
              @click="sendInlineProposal"
            >
              {{ isPostingProposal ? 'Posting…' : 'Send to Slack' }}
            </RButton>
          </div>
        </div>
      </div>
    </template>

    <!-- Standup format dialog -->
    <RDialog v-model:open="showStandupDialog">
      <template #title>Copy for Slack Standup</template>
      <div class="standup-dialog">
        <div v-if="isFormattingStandup" class="standup-loading">
          <RText class="text-secondary">Formatting with Claude…</RText>
        </div>
        <div v-else-if="standupError" class="standup-error">
          <RText>{{ standupError }}</RText>
        </div>
        <template v-else>
          <RText size="small" class="text-secondary">
            Tweak as needed (fill in the <code>%</code>), then re-copy if you changed it.
          </RText>
          <textarea
            v-model="standupText"
            class="standup-textarea"
            rows="3"
            spellcheck="false"
          ></textarea>
          <div v-if="standupText && renderForSlack(standupText) !== standupText" class="slack-preview">
            <span class="slack-preview-label">Will send as:</span>
            <code class="slack-preview-text">{{ renderForSlack(standupText) }}</code>
          </div>
        </template>

        <div class="standup-actions">
          <RButton size="small" @click="regenerateStandup" :disabled="isFormattingStandup">
            Regenerate
          </RButton>
          <RButton size="small" @click="showStandupDialog = false">
            Close
          </RButton>
          <RButton
            size="small"
            filled
            @click="postStandupToSlack"
            :disabled="!standupText || isFormattingStandup || isPostingToSlack || !canPostToSlack"
            :title="canPostToSlack ? `Post to ${settingsStore.settings.slackChannel}` : 'Configure Slack in Settings → Slack'"
          >
            {{ isPostingToSlack ? 'Posting…' : 'Post to Slack' }}
          </RButton>
          <RButton
            size="small"
            filled
            color="success"
            @click="copyStandupText"
            :disabled="!standupText || isFormattingStandup"
          >
            Copy
          </RButton>
        </div>
      </div>
    </RDialog>

    <!-- Toast notification -->
    <div v-if="toastMessage" class="toast" :class="toastIsError ? 'toast-error' : 'toast-success'">
      {{ toastMessage }}
    </div>
  </RCard>
</template>

<style scoped>
.tracker-hero {
  --r-card-padding: 0.75rem;
  min-height: 6rem;
  position: relative;
  z-index: 10;
  overflow: visible;
}

.tracker-hero :deep(> *) {
  overflow: visible;
}

.not-tracking-form {
  display: flex;
  flex-direction: column;
  min-height: 4.5rem;
  justify-content: center;
}

.hero-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.field-input {
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.9rem;
  box-sizing: border-box;
  box-shadow: 1px 1px 0 var(--color-border);
}

.link-input-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
}

.link-input-wrapper .url-input {
  width: 100%;
}

.gitlab-fetch-spinner {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1rem;
  color: var(--color-text-secondary);
  animation: spin 1s linear infinite;
  pointer-events: none;
}

@keyframes spin {
  from { transform: translateY(-50%) rotate(0deg); }
  to { transform: translateY(-50%) rotate(360deg); }
}

.url-input {
  flex: 1;
  min-width: 0;
}

.name-input-wrapper {
  position: relative;
  flex: 2;
  min-width: 0;
}

.name-input-wrapper .name-input {
  width: 100%;
}

.name-input {
  flex: 2;
  min-width: 0;
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-text);
}

.suggestion-item:hover,
.suggestion-active {
  background: var(--color-accent);
  color: white;
}

.suggestion-id {
  flex-shrink: 0;
  font-size: 0.75rem;
  opacity: 0.7;
  font-family: ui-monospace, monospace;
}

.suggestion-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 1px 1px 0 var(--color-accent);
}

.field-input:hover {
  border-color: var(--color-text-secondary);
}

.field-input::placeholder {
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.submit-wrapper {
  flex-shrink: 0;
}

.tracker-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.switch-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.switch-label {
  flex-shrink: 0;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.switch-input-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
}

.switch-input {
  width: 100%;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
}

.tracking-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.issue-info {
  flex: 1;
  min-width: 0;
  min-height: 3.5rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.issue-id {
  display: block;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.issue-name {
  display: block;
}


.edit-name-input {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-accent);
  border-radius: 3px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: inherit;
  width: 100%;
  box-sizing: border-box;
}

.edit-name-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb, 100, 100, 200), 0.2);
}

.edit-id-input,
.edit-link-input {
  font-size: 0.85em;
}

.edit-issue-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
}

.edit-start-time {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.edit-start-label {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

input.edit-time-input {
  font-size: 0.85em;
}

.edit-issue-actions {
  display: flex;
  gap: 0.5rem;
}

.timer-display.paused {
  opacity: 0.6;
}

.status-badge {
  font-size: 0.65rem;
  padding: 0.125rem 0.35rem;
  border-radius: 3px;
  text-transform: uppercase;
  font-weight: 500;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.timer-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.timer-display {
  font-family: ui-monospace, monospace;
  font-size: 1.75rem;
  font-weight: bold;
  letter-spacing: 0.05em;
  color: var(--color-text);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-dot.active {
  background-color: var(--color-success);
}

.status-dot.idle {
  background-color: var(--color-warning);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 160px;
  justify-content: flex-end;
}


/* Subtle icon buttons - muted until hover/active */
.subtle-btn {
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.subtle-btn:hover {
  opacity: 1;
}

.subtle-btn-active {
  opacity: 1;
  --r-button-color: var(--color-warning) !important;
}

/* Pause button - red without stripes */
.pause-btn {
  --r-button-color: var(--color-error) !important;
}

.idle-section {
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.idle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.idle-progress-wrapper {
  width: 100%;
}

.idle-progress-wrapper :deep(.r-progress) {
  width: 100%;
}

.notes-section {
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.toast {
  position: fixed;
  top: 1rem;
  right: 1rem;
  padding: 0.75rem 1.25rem;
  color: white;
  border-radius: 4px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  animation: slideIn 0.2s ease-out;
}

.toast-success {
  background: var(--color-success);
}

.toast-error {
  background: var(--color-danger);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(1rem);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.text-success {
  color: var(--color-success);
}

.text-warning {
  color: var(--color-warning);
}

.paused-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.idle-recovery-section {
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.idle-recovery-prompt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.idle-recovery-buttons {
  display: flex;
  gap: 0.5rem;
}

.standup-icon {
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  height: 1rem;
}

.standup-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 480px;
}

.standup-loading,
.standup-error {
  padding: 1rem 0;
}

.standup-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  resize: vertical;
  box-sizing: border-box;
}

.standup-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}

.standup-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.quick-hint {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-secondary);
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  font-style: italic;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.quick-hint-suggested {
  border-style: solid;
  border-color: var(--color-accent, var(--color-border));
  font-style: normal;
}

.quick-hint-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
}

.quick-hint-title {
  color: var(--color-text);
  font-size: 0.95rem;
  font-weight: 600;
}

.quick-hint-sub {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}

.advanced-toggle {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.8rem;
  padding: 0.25rem 0;
  margin-top: 0.5rem;
  text-align: left;
}

.advanced-toggle:hover {
  color: var(--color-text);
}

.advanced-form {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.advanced-slack-row {
  position: relative;
  display: flex;
  align-items: stretch;
}

.advanced-slack-row .standup-textarea {
  flex: 1;
  padding-right: 2rem;
}

.advanced-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.inline-proposal {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.inline-proposal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.inline-proposal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.slack-preview {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.4rem 0.6rem;
  background: var(--color-bg);
  border-left: 2px solid var(--color-accent, var(--color-border));
  border-radius: 2px;
}

.slack-preview-label {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.slack-preview-text {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-all;
  background: transparent;
  padding: 0;
}

.text-secondary {
  color: var(--color-text-secondary);
}

code {
  padding: 0.05rem 0.3rem;
  background: var(--color-bg-secondary);
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  font-size: 0.85em;
}
</style>
