<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'
import { useIssuesStore } from '../stores/issues.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue } from '../types'
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

// Watch link changes to find existing issues
watch(link, (url) => {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) {
    matchedIssue.value = null
    return
  }

  // Check by exact link match first
  let existing = issuesStore.issues.find(i => i.link === trimmedUrl)

  // If no link match, try matching by extracted ID
  if (!existing) {
    const extractedId = settingsStore.extractIssueId(trimmedUrl)
    if (extractedId) {
      existing = issuesStore.issues.find(i => i.externalId === extractedId)
    }
  }

  if (existing) {
    matchedIssue.value = existing
    name.value = existing.name
  } else {
    matchedIssue.value = null
  }
})

const submitTooltip = computed(() => {
  return matchedIssue.value
    ? 'Resume tracking existing tracked item'
    : 'Start tracking this tracked item'
})

async function handleFormSubmit() {
  const url = link.value.trim() || null
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
        externalId = settingsStore.extractIssueId(url) || ''
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

// Edit issue name while tracking
const isEditingName = ref(false)
const editedName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

function startEditingName() {
  if (trackerStore.currentIssue) {
    editedName.value = trackerStore.currentIssue.name
    isEditingName.value = true
    nextTick(() => {
      nameInput.value?.focus()
      nameInput.value?.select()
    })
  }
}

async function saveIssueName() {
  if (trackerStore.currentIssue && editedName.value.trim()) {
    try {
      await issuesStore.updateIssue(trackerStore.currentIssue.id, {
        name: editedName.value.trim()
      })
      // Refresh the current issue in tracker store
      await trackerStore.refreshCurrentIssue()
      showToast('Name updated')
    } catch (err) {
      console.error('Failed to update name:', err)
      showToast('Failed to update name', true)
    }
  }
  isEditingName.value = false
}

function cancelEditingName() {
  isEditingName.value = false
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
          <input
            v-model="link"
            type="text"
            placeholder="Link to tracked item"
            class="field-input url-input"
          />
          <input
            v-model="name"
            type="text"
            placeholder="Item description"
            class="field-input name-input"
          />
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
            <RText v-if="trackerStore.currentIssue.externalId" class="issue-id">{{ trackerStore.currentIssue.externalId }}</RText>
            <template v-if="isEditingName">
              <input
                v-model="editedName"
                type="text"
                class="edit-name-input"
                @blur="saveIssueName"
                @keyup.enter="saveIssueName"
                @keyup.escape="cancelEditingName"
                ref="nameInput"
              />
            </template>
            <template v-else>
              <RText class="issue-name editable" @click="startEditingName" title="Click to edit name">
                {{ trackerStore.currentIssue.name }}
                <Icon name="pencil" :size="12" class="edit-hint" />
              </RText>
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

.url-input {
  flex: 1;
  min-width: 0;
}

.name-input {
  flex: 2;
  min-width: 0;
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

.issue-name.editable {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.issue-name.editable:hover {
  text-decoration: underline;
  text-decoration-style: dotted;
}

.edit-hint {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.issue-name.editable:hover .edit-hint {
  opacity: 0.5;
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
