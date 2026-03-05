<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'
import { useIssuesStore } from '../stores/issues.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue } from '../types'
import { toLocalDateTimeInput } from '@/utils/format'
import { RCard, RButton, RInput, RProgress, RText } from 'roughness'
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

const filteredLinkSuggestions = computed(() => {
  const query = link.value.trim().toLowerCase()
  if (!query || matchedIssue.value) return []
  // Match issues whose externalId contains the typed text (e.g. "105" matches "app#105", "reflow#105")
  return issuesStore.issues
    .filter(i => !i.archived && i.externalId && i.externalId.toLowerCase().includes(query))
    .slice(0, 5)
})

function selectLinkSuggestion(issue: Issue) {
  matchedIssue.value = issue
  name.value = issue.name
  link.value = issue.link || issue.externalId
  showLinkSuggestions.value = false
  selectedLinkSuggestionIndex.value = -1
}

function handleLinkInput() {
  if (matchedIssue.value) {
    matchedIssue.value = null
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
}

const submitTooltip = computed(() => {
  return matchedIssue.value
    ? 'Resume tracking existing tracked item'
    : 'Start tracking this tracked item'
})

async function handleFormSubmit() {
  let url = link.value.trim() || null
  const issueName = name.value.trim() || 'Untitled'

  isSubmitting.value = true
  try {
    let issue: Issue

    if (matchedIssue.value) {
      // Use existing issue
      issue = matchedIssue.value
    } else {
      // Create new issue
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
      issue = await issuesStore.createIssue(externalId, issueName, url)
    }

    // Start tracking
    await trackerStore.startTracking(issue.id)
    link.value = ''
    name.value = ''
    matchedIssue.value = null
  } finally {
    isSubmitting.value = false
  }
}

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
    try {
      await issuesStore.updateIssue(trackerStore.currentIssue.id, {
        name: editForm.value.name.trim(),
        externalId: editForm.value.externalId.trim(),
        link: editForm.value.link.trim() || null
      })

      // Update start time if changed
      if (trackerStore.currentEntry && editForm.value.startedAt) {
        const newStart = new Date(editForm.value.startedAt)
        if (newStart.getTime() > Date.now()) {
          showToast('Start time cannot be in the future', true)
          return
        }
        const newStartedAt = newStart.toISOString()
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
              @click="trackerStore.startTracking(trackerStore.lastTrackedIssue!.id)"
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
        <form @submit.prevent="handleFormSubmit" class="hero-form">
          <div class="link-input-wrapper">
            <input
              v-model="link"
              type="text"
              placeholder="Link or ID (e.g. project#123)"
              class="field-input url-input"
              autocomplete="off"
              @input="handleLinkInput"
              @keydown="handleLinkKeydown"
              @blur="handleLinkBlur"
              @focus="handleLinkInput"
            />
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
                  placeholder="ID (e.g. app#123)"
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
              color="error"
              @click="pauseWithNotes"
              title="Stop tracking"
            >
              Pause
            </RButton>
          </div>
        </div>

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
      </div>
    </template>

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
  align-items: center;
  min-height: 4.5rem;
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

.edit-time-input {
  font-size: 0.85em !important;
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
</style>
