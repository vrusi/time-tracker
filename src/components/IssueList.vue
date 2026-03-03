<script setup lang="ts">
import { ref, watch, inject } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import type { Issue, TimeEntry } from '../types'
import { RCard, RButton, RInput, RText, RSpace, RDialog, RPopover, RList, RListItem } from 'roughness'
import Icon from './Icon.vue'
import { formatDuration } from '@/utils/format'

const issuesStore = useIssuesStore()
const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()
const refreshProgress = inject<() => void>('refreshProgress')

const issueTimes = ref<Map<number, number>>(new Map())
const editingIssue = ref<Issue | null>(null)
const editForm = ref({ name: '', link: '' })
const confirmingDeleteId = ref<number | null>(null)

// Bulk delete state
const selectionMode = ref(false)
const selectedIds = ref<Set<number>>(new Set())
const showBulkDeleteConfirm = ref(false)

// Merge state
const mergingIssueId = ref<number | null>(null)

// Actions menu state
const openMenuId = ref<number | null>(null)

// Notes state
const editingNotesId = ref<number | null>(null)
const notesForm = ref('')
const workLogEntries = ref<TimeEntry[]>([])

// Toast state
const toastMessage = ref('')
const toastIsError = ref(false)

function showToast(message: string, isError = false) {
  toastMessage.value = message
  toastIsError.value = isError
  setTimeout(() => { toastMessage.value = '' }, 3000)
}

function openLink(url: string) {
  window.electronAPI.openExternal(url)
}

// Link context menu
const linkMenuUrl = ref<string | null>(null)
const linkMenuStyle = ref<Record<string, string>>({})

function showLinkMenu(e: MouseEvent, url: string) {
  linkMenuUrl.value = url
  linkMenuStyle.value = {
    position: 'fixed',
    left: `${e.clientX}px`,
    top: `${e.clientY}px`
  }
  const close = (ev: MouseEvent) => {
    if (!(ev.target as HTMLElement).closest('.link-context-menu')) {
      closeLinkMenu()
      document.removeEventListener('mousedown', close)
    }
  }
  setTimeout(() => document.addEventListener('mousedown', close), 0)
}

function closeLinkMenu() {
  linkMenuUrl.value = null
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    showToast('Link copied')
  } catch {
    showToast('Failed to copy', true)
  }
}

async function loadIssueTimes() {
  const issueIds = issuesStore.issues.map(i => i.id)
  if (issueIds.length === 0) return

  const times = await window.electronAPI.getIssueTimesBatch(issueIds)
  for (const [id, seconds] of Object.entries(times)) {
    issueTimes.value.set(Number(id), seconds)
  }
}

// Watch for issues to load and reload times when they change
watch(() => issuesStore.issues, loadIssueTimes, { immediate: true })

// Refresh times when tracking stops (e.g., paused from TrackerStatus)
watch(() => trackerStore.isTracking, (isTracking, wasTracking) => {
  if (wasTracking && !isTracking) {
    loadIssueTimes()
  }
})

function isCurrentlyTracking(issue: Issue): boolean {
  return trackerStore.currentIssue?.id === issue.id && trackerStore.isTracking
}

async function toggleTracking(issue: Issue) {
  if (isCurrentlyTracking(issue)) {
    await trackerStore.pauseTracking()
  } else {
    await trackerStore.startTracking(issue.id)
  }
  await loadIssueTimes()
}

function startEditing(issue: Issue) {
  editingIssue.value = issue
  editForm.value = {
    name: issue.name,
    link: issue.link || ''
  }
}

function cancelEditing() {
  editingIssue.value = null
}

async function saveEdit() {
  if (!editingIssue.value) return

  const url = editForm.value.link.trim()
  const issueId = url ? settingsStore.extractIssueId(url) : editingIssue.value.externalId

  if (url && !issueId) {
    showToast('Could not extract issue ID from URL', true)
    return
  }

  try {
    await issuesStore.updateIssue(editingIssue.value.id, {
      externalId: issueId || editingIssue.value.externalId,
      name: editForm.value.name.trim(),
      link: url || null
    })
    editingIssue.value = null
    showToast('Changes saved')
  } catch (err) {
    console.error('Failed to save changes:', err)
    showToast('Failed to save changes', true)
  }
}

function confirmDelete(issueId: number) {
  confirmingDeleteId.value = issueId
}

function cancelDelete() {
  confirmingDeleteId.value = null
}

async function archiveIssue(issueId: number) {
  try {
    await issuesStore.archiveIssue(issueId)
    showToast('Item archived')
  } catch (err) {
    console.error('Failed to archive item:', err)
    showToast('Failed to archive item', true)
  }
}

async function restoreIssue(issueId: number) {
  try {
    await issuesStore.unarchiveIssue(issueId)
    showToast('Item restored')
  } catch (err) {
    console.error('Failed to restore item:', err)
    showToast('Failed to restore item', true)
  }
}

async function executeDelete() {
  if (!confirmingDeleteId.value) return
  try {
    await issuesStore.deleteIssue(confirmingDeleteId.value)
    confirmingDeleteId.value = null
    refreshProgress?.()
    showToast('Item deleted')
  } catch (err) {
    console.error('Failed to delete item:', err)
    showToast('Failed to delete item', true)
    confirmingDeleteId.value = null
  }
}

// Merge functions
function startMerging(issueId: number) {
  mergingIssueId.value = issueId
}

function cancelMerging() {
  mergingIssueId.value = null
}

async function executeMerge(targetId: number) {
  if (!mergingIssueId.value) return
  try {
    await window.electronAPI.mergeIssues(mergingIssueId.value, targetId)
    mergingIssueId.value = null
    await issuesStore.loadIssues()
    await loadIssueTimes()
    refreshProgress?.()
    showToast('Items merged')
  } catch (err) {
    console.error('Failed to merge items:', err)
    showToast('Failed to merge items', true)
  }
}

// Notes functions
async function startEditingNotes(issue: Issue) {
  editingNotesId.value = issue.id
  notesForm.value = issue.notes || ''
  // Fetch work log entries for this issue
  workLogEntries.value = await window.electronAPI.getIssueEntries(issue.id)
}

function cancelEditingNotes() {
  editingNotesId.value = null
  workLogEntries.value = []
}

// Save notes on blur (without closing the panel)
async function saveNotesOnBlur() {
  if (!editingNotesId.value) return

  try {
    await issuesStore.updateIssue(editingNotesId.value, { notes: notesForm.value || null })
    showToast('Note saved')
  } catch (err) {
    console.error('Failed to save note:', err)
    showToast('Failed to save note', true)
  }
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function formatEntryDuration(entry: TimeEntry): string {
  if (!entry.endedAt) return 'In progress'
  const start = new Date(entry.startedAt).getTime()
  const end = new Date(entry.endedAt).getTime()
  const seconds = Math.floor((end - start) / 1000)
  return formatDuration(seconds)
}

defineExpose({ loadIssueTimes })

// Bulk delete functions
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    selectedIds.value.clear()
  }
}

function toggleIssue(id: number) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  selectedIds.value = new Set(selectedIds.value)
}

function toggleAll() {
  const displayedIds = issuesStore.displayedIssues.map(i => i.id)
  const allSelected = displayedIds.every(id => selectedIds.value.has(id))

  if (allSelected) {
    displayedIds.forEach(id => selectedIds.value.delete(id))
  } else {
    displayedIds.forEach(id => selectedIds.value.add(id))
  }
  selectedIds.value = new Set(selectedIds.value)
}

function isAllSelected(): boolean {
  const displayedIds = issuesStore.displayedIssues.map(i => i.id)
  return displayedIds.length > 0 && displayedIds.every(id => selectedIds.value.has(id))
}

async function executeBulkDelete() {
  const idsToDelete = Array.from(selectedIds.value)

  try {
    // Stop tracking if any selected issue is currently being tracked
    if (trackerStore.currentIssue && selectedIds.value.has(trackerStore.currentIssue.id)) {
      await trackerStore.pauseTracking()
    }

    if (idsToDelete.length > 0) {
      await window.electronAPI.deleteIssues(idsToDelete)
      await issuesStore.loadIssues()
    }

    showBulkDeleteConfirm.value = false
    selectedIds.value.clear()
    selectionMode.value = false
    refreshProgress?.()
    showToast(`Deleted ${idsToDelete.length} ${idsToDelete.length === 1 ? 'item' : 'items'}`)
  } catch (err) {
    console.error('Failed to delete items:', err)
    showToast('Failed to delete items', true)
    showBulkDeleteConfirm.value = false
  }
}
</script>

<template>
  <RCard>
    <template #title>
      <div class="card-header">
        <div class="header-left">
          <span class="card-title">Tracked Items</span>
          <div class="view-toggle">
            <RButton
              size="small"
              :class="{ 'view-active': !issuesStore.showArchived }"
              @click="issuesStore.showArchived = false"
            >
              Active
            </RButton>
            <RButton
              size="small"
              :class="{ 'view-active': issuesStore.showArchived }"
              @click="issuesStore.showArchived = true"
            >
              Archived
            </RButton>
          </div>
        </div>
        <div class="header-right">
          <RButton
            size="small"
            :filled="selectionMode"
            @click="toggleSelectionMode"
          >
            {{ selectionMode ? 'Cancel' : 'Select' }}
          </RButton>
          <template v-if="selectionMode">
            <input
              type="checkbox"
              :checked="isAllSelected()"
              @change="toggleAll"
              class="bulk-checkbox"
              title="Select all"
            />
            <RButton
              size="small"
              color="error"
              :disabled="selectedIds.size === 0"
              @click="showBulkDeleteConfirm = true"
            >
              Delete{{ selectedIds.size > 0 ? ` (${selectedIds.size})` : '' }}
            </RButton>
          </template>
        </div>
      </div>
    </template>

    <div v-if="issuesStore.isLoading" class="p-8 text-center">
      <RText class="text-secondary">Loading...</RText>
    </div>

    <div v-else-if="issuesStore.displayedIssues.length === 0" class="p-8 text-center">
      <RText class="text-secondary">
        {{ issuesStore.showArchived ? 'Archived tracked items will appear here.' : 'No tracked items yet. Start tracking from the hero area above!' }}
      </RText>
    </div>

    <RList v-else class="issues-list">
      <RListItem
        v-for="issue in issuesStore.displayedIssues"
        :key="issue.id"
        class="issue-item"
      >
        <!-- Edit mode -->
        <form v-if="editingIssue?.id === issue.id" @submit.prevent="saveEdit" class="flex items-center gap-3 w-full">
          <RInput
            v-model="editForm.link"
            placeholder="Link to tracked item"
            class="w-48"
          />
          <RInput
            v-model="editForm.name"
            placeholder="Item description"
            class="flex-1"
          />
          <RButton type="submit" size="small" filled>Save</RButton>
          <RButton type="button" size="small" @click="cancelEditing">Cancel</RButton>
        </form>

        <!-- Notes edit mode -->
        <div v-else-if="editingNotesId === issue.id" class="notes-panel w-full">
          <div class="notes-header">
            <div class="notes-header-info">
              <span v-if="issue.externalId" class="notes-issue-id">{{ issue.externalId }}</span>
              <span class="notes-issue-name">{{ issue.name }}</span>
            </div>
            <button class="close-btn" @click="cancelEditingNotes" title="Close">&times;</button>
          </div>

          <!-- Issue notes -->
          <div class="notes-card">
            <div class="notes-card-header">
              <Icon name="note" :size="14" />
              <span class="notes-card-title">Notes</span>
            </div>
            <RInput
              v-model="notesForm"
              :lines="4"
              placeholder="Add notes about this tracked item..."
              @focusout="saveNotesOnBlur"
              class="notes-textarea"
            />
            <div class="notes-hint">
              <RText size="small" class="text-secondary">Auto-saves when you click away</RText>
            </div>
          </div>

          <!-- Work log -->
          <div class="notes-card">
            <div class="notes-card-header">
              <Icon name="clock" :size="14" />
              <span class="notes-card-title">Work Log</span>
              <span class="notes-card-badge">{{ workLogEntries.length }}</span>
            </div>
            <div v-if="workLogEntries.length === 0" class="work-log-empty">
              <RText size="small" class="text-secondary">No time entries yet. Start tracking to build your work log.</RText>
            </div>
            <div v-else class="work-log">
              <div
                v-for="entry in workLogEntries"
                :key="entry.id"
                class="work-log-entry"
              >
                <div class="work-log-header">
                  <span class="work-log-date">{{ formatDateTime(entry.startedAt) }}</span>
                  <span class="work-log-duration">{{ formatEntryDuration(entry) }}</span>
                </div>
                <div v-if="entry.notes" class="work-log-notes">{{ entry.notes }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Normal display mode -->
        <div v-else class="issue-row">
          <!-- Top row: checkbox (selection mode) + title + actions + play button -->
          <div class="issue-main">
            <!-- Checkbox for selection mode (left side) -->
            <div v-if="selectionMode" class="checkbox-slot">
              <input
                type="checkbox"
                :checked="selectedIds.has(issue.id)"
                @change="toggleIssue(issue.id)"
                class="bulk-checkbox"
              />
            </div>

            <!-- Issue title and metadata -->
            <div class="issue-info">
              <div class="issue-title">
                <span v-if="issue.externalId" class="issue-id">{{ issue.externalId }}</span>
                <span class="issue-name">{{ issue.name }}</span>
                <span v-if="issue.notes" class="notes-indicator" title="Has notes">
                  <Icon name="note" :size="12" />
                </span>
              </div>
              <div class="issue-meta">
                Total: {{ formatDuration(issueTimes.get(issue.id) || 0) }}
              </div>
            </div>

            <!-- Action buttons (always present, faded in selection mode) -->
            <div class="action-buttons" :class="{ 'selection-mode': selectionMode }">
              <!-- Primary action: open link (always visible if exists) -->
              <span v-if="issue.link" class="link-btn-wrapper">
                <RButton
                  size="small"
                  title="Open in browser"
                  @click.stop="openLink(issue.link!)"
                  @contextmenu.stop.prevent="showLinkMenu($event, issue.link!)"
                  :disabled="selectionMode"
                >
                  <span class="link-icon">↗</span>
                </RButton>
                <ul
                  v-if="linkMenuUrl === issue.link"
                  class="link-context-menu"
                  :style="linkMenuStyle"
                >
                  <li @mousedown.prevent="openLink(linkMenuUrl!); closeLinkMenu()">Open in browser</li>
                  <li @mousedown.prevent="copyLink(linkMenuUrl!); closeLinkMenu()">Copy link</li>
                </ul>
              </span>

              <!-- Inline edit & notes buttons for currently tracked issue -->
              <template v-if="isCurrentlyTracking(issue)">
                <RButton
                  size="small"
                  title="Notes"
                  class="inline-action-btn"
                  @click="startEditingNotes(issue)"
                >
                  <Icon name="note" :size="16" />
                </RButton>
                <RButton
                  size="small"
                  title="Edit"
                  class="inline-action-btn"
                  @click="startEditing(issue)"
                >
                  <Icon name="pencil" :size="16" />
                </RButton>
              </template>

              <!-- Actions dropdown menu -->
              <RPopover
                trigger="click"
                side="bottom"
                align="end"
                :open="openMenuId === issue.id"
                @update:open="(v: boolean) => openMenuId = v ? issue.id : null"
              >
                <template #anchor>
                  <RButton
                    size="small"
                    title="Actions"
                    :disabled="selectionMode"
                    class="menu-trigger"
                  >
                    <span class="menu-dots">⋮</span>
                  </RButton>
                </template>

                <div class="actions-menu">
                  <!-- Notes -->
                  <button class="menu-item" @click="startEditingNotes(issue); openMenuId = null">
                    <Icon name="note" :size="16" />
                    <span>Notes</span>
                  </button>

                  <!-- Edit -->
                  <button class="menu-item" @click="startEditing(issue); openMenuId = null">
                    <Icon name="pencil" :size="16" />
                    <span>Edit</span>
                  </button>

                  <!-- Merge -->
                  <template v-if="mergingIssueId !== issue.id">
                    <button class="menu-item" @click.stop="startMerging(issue.id)">
                      <span class="menu-icon-text">⤵</span>
                      <span>Merge</span>
                    </button>
                  </template>
                  <div v-else class="merge-select-inline">
                    <select @change="(e) => { if ((e.target as HTMLSelectElement).value) { executeMerge(Number((e.target as HTMLSelectElement).value)); openMenuId = null } }" class="merge-dropdown">
                      <option value="">Merge into...</option>
                      <option v-for="target in issuesStore.issues.filter(i => i.id !== issue.id)" :key="target.id" :value="target.id">
                        {{ target.externalId || target.name }}
                      </option>
                    </select>
                    <button class="menu-item-small" @click="cancelMerging">✕</button>
                  </div>

                  <div class="menu-divider"></div>

                  <!-- Archive/Restore/Delete -->
                  <template v-if="issue.archived">
                    <button class="menu-item" @click="restoreIssue(issue.id); openMenuId = null">
                      <span class="menu-icon-text">↩</span>
                      <span>Restore</span>
                    </button>
                    <button class="menu-item menu-item-danger" @click="confirmDelete(issue.id); openMenuId = null">
                      <Icon name="delete" :size="16" />
                      <span>Delete</span>
                    </button>
                  </template>
                  <button
                    v-else
                    class="menu-item"
                    @click="archiveIssue(issue.id); openMenuId = null"
                  >
                    <Icon name="box" :size="16" />
                    <span>Archive</span>
                  </button>
                </div>
              </RPopover>
            </div>

            <!-- Play/Pause button (right side, hidden in selection mode) -->
            <div v-if="!selectionMode" class="play-slot">
              <RButton
                @click="toggleTracking(issue)"
                :disabled="issue.archived"
                :color="isCurrentlyTracking(issue) ? 'error' : 'success'"
                :class="{ 'btn-archived': issue.archived }"
                :title="issue.archived ? 'Restore tracked item to track' : (isCurrentlyTracking(issue) ? 'Stop tracking' : 'Start tracking')"
              >
                <Icon :name="isCurrentlyTracking(issue) ? 'pause' : 'play'" :size="16" />
              </RButton>
            </div>
          </div><!-- end issue-main -->
        </div>
      </RListItem>
    </RList>

    <!-- Bulk Delete Confirmation Dialog -->
    <RDialog v-model:open="showBulkDeleteConfirm">
      <template #title>Delete Tracked Items?</template>
      <RText>
        This will permanently delete {{ selectedIds.size }}
        {{ selectedIds.size === 1 ? 'tracked item' : 'tracked items' }} and all their time entries.
        This cannot be undone.
      </RText>
      <RSpace class="modal-actions">
        <RButton @click="showBulkDeleteConfirm = false">Cancel</RButton>
        <RButton color="error" filled @click="executeBulkDelete">Delete</RButton>
      </RSpace>
    </RDialog>

    <!-- Single Issue Delete Confirmation Dialog -->
    <RDialog :open="confirmingDeleteId !== null" @update:open="(v: boolean) => !v && cancelDelete()">
      <template #title>Delete Tracked Item?</template>
      <RText>Are you sure? This is forever.</RText>
      <RSpace class="modal-actions">
        <RButton @click="cancelDelete">Cancel</RButton>
        <RButton color="error" filled @click="executeDelete">Delete</RButton>
      </RSpace>
    </RDialog>

    <!-- Toast notification -->
    <div v-if="toastMessage" class="toast" :class="toastIsError ? 'toast-error' : 'toast-success'">
      {{ toastMessage }}
    </div>
  </RCard>
</template>

<style scoped>
/* Issue item styling - RListItem provides the bullet marker */
.issue-item {
  padding: 0.5rem 0;
}

/* Make link icon same size as other icons */
.link-btn-wrapper {
  position: relative;
}

.link-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.75rem;
}

.link-context-menu {
  position: fixed;
  z-index: 1000;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 140px;
}

.link-context-menu li {
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-text);
}

.link-context-menu li:hover {
  background: var(--color-accent);
  color: white;
}


.issue-row {
  width: 100%;
}

.issue-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

/* Fixed-width slot for checkbox in selection mode (left side) */
.checkbox-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  flex-shrink: 0;
}

/* Fixed-width slot for play button (right side) */
.play-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  flex-shrink: 0;
  margin-left: 0.5rem;
}

/* Archived issues - grayed out play button */
.btn-archived {
  opacity: 0.3 !important;
  filter: grayscale(1);
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* Fade all actions in selection mode */
.action-buttons.selection-mode {
  opacity: 0.2;
  pointer-events: none;
}

/* Inline action buttons for currently tracked issue - always fully visible */
.inline-action-btn {
  opacity: 1;
}

/* Menu trigger button */
.menu-trigger {
  opacity: 0.4;
  transition: opacity 0.15s ease;
}

.issue-item:hover .menu-trigger {
  opacity: 1;
}

.menu-dots {
  font-size: 1.25rem;
  line-height: 1;
  font-weight: bold;
}

/* Actions dropdown menu */
.actions-menu {
  display: flex;
  flex-direction: column;
  min-width: 140px;
  padding: 0.25rem 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.menu-item:hover {
  background-color: var(--color-bg-secondary, rgba(0, 0, 0, 0.05));
}

.menu-item-danger {
  color: var(--r-color-error, #e53935);
}

.menu-item-danger:hover {
  background-color: rgba(229, 57, 53, 0.1);
}

.menu-icon-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  font-size: 1rem;
}

.menu-divider {
  height: 1px;
  margin: 0.25rem 0;
  background-color: var(--color-border, rgba(0, 0, 0, 0.1));
}

.merge-select-inline {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
}

.menu-item-small {
  padding: 0.25rem 0.5rem;
  border: none;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  cursor: pointer;
}


/* Issue info styling */
.issue-info {
  flex: 1;
  min-width: 0;
}

.issue-title {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: baseline;
}

.issue-id {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.issue-name {
  color: var(--color-text);
}

.notes-indicator {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-secondary);
  opacity: 0.6;
  margin-left: 0.25rem;
}

.issue-meta {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

/* Notes panel layout */
.notes-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem 0;
}

.notes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.notes-header-info {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.notes-issue-id {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.notes-issue-name {
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.close-btn:hover {
  background-color: var(--color-bg-secondary, rgba(0, 0, 0, 0.05));
  color: var(--color-text);
}

/* Notes card sections */
.notes-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
}

.notes-card-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--color-text-secondary);
}

.notes-card-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.notes-card-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.05rem 0.4rem;
  border-radius: 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  margin-left: auto;
}

.notes-textarea :deep(textarea) {
  min-height: 5rem;
}

.notes-hint {
  text-align: right;
  opacity: 0.7;
}

.work-log-empty {
  padding: 1rem 0.5rem;
  text-align: center;
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

/* Work log entries */
.work-log {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow-y: auto;
}

.work-log-entry {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.work-log-entry:first-child {
  padding-top: 0;
}

.work-log-entry:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.work-log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.work-log-date {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.work-log-duration {
  font-size: 0.8rem;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  color: var(--color-text-secondary);
}

.work-log-notes {
  font-size: 0.825rem;
  color: var(--color-text);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  padding-left: 0.25rem;
}

.merge-dropdown {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  min-width: 120px;
}

.card-title {
  font-weight: 600;
  font-size: 1.1rem;
}

.card-header :deep(.r-button) {
  font-size: 0.8rem;
}

</style>
