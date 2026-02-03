<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TimeEntry, Issue, DayGroup } from '../types'
import { useIssuesStore } from '../stores/issues.store'
import { formatTime, formatDuration, formatDate, toLocalDateTimeInput } from '@/utils/format'
import { RCard, RButton, RInput, RText, RSpace, RList, RListItem, RDialog, RPopover } from 'roughness'
import Icon from './Icon.vue'

defineProps<{
  viewMode: 'list' | 'calendar'
}>()

const issuesStore = useIssuesStore()

const entries = ref<(TimeEntry & { issue: Issue })[]>([])
const isLoading = ref(false)

// Date range - default to current month (1st to last day)
const today = new Date()
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

const startDate = ref(monthStart.toISOString().split('T')[0])
const endDate = ref(monthEnd.toISOString().split('T')[0])

// Edit mode - discriminated union for mutually exclusive edit states
type EditMode =
  | { type: 'normal' }
  | { type: 'edit'; entryId: number; issueId: number }
  | { type: 'editNotes'; entryId: number }

const editMode = ref<EditMode>({ type: 'normal' })

// Form data for edit mode (combined time + issue)
const editForm = ref({ startedAt: '', endedAt: '', issueName: '', issueLink: '' })
const notesForm = ref('')

// Bulk delete state
const selectionMode = ref(false)
const selectedIds = ref<Set<number>>(new Set())
const showBulkDeleteConfirm = ref(false)
const bulkDeleteType = ref<'selected' | 'range'>('selected')

// Add entry modal state
const showAddEntryModal = ref(false)

// Actions menu state
const openMenuId = ref<number | null>(null)
const expandedNotesId = ref<number | null>(null)
const successMessage = ref('')
const addEntryForm = ref({
  issueText: '',
  issueLink: '',
  date: today.toISOString().split('T')[0],
  startTime: '09:00',
  endTime: '17:00',
  notes: ''
})

const groupedEntries = computed<DayGroup[]>(() => {
  const groups = new Map<string, DayGroup>()

  entries.value.forEach(entry => {
    const date = entry.startedAt.split('T')[0]

    if (!groups.has(date)) {
      groups.set(date, { date, entries: [], totalSeconds: 0 })
    }

    const group = groups.get(date)!
    group.entries.push(entry)

    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    group.totalSeconds += (end - start) / 1000
  })

  // Sort by date descending
  return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date))
})

async function loadEntries() {
  isLoading.value = true
  try {
    const start = new Date(startDate.value)
    start.setHours(0, 0, 0, 0)

    const end = new Date(endDate.value)
    end.setHours(23, 59, 59, 999)

    entries.value = await window.electronAPI.getTimeEntries(
      start.toISOString(),
      end.toISOString()
    )
  } finally {
    isLoading.value = false
  }
}

function entryDuration(entry: TimeEntry): number {
  const start = new Date(entry.startedAt).getTime()
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
  return (end - start) / 1000
}

// Combined edit function (time + issue)
function startEditing(entry: TimeEntry & { issue: Issue }) {
  editMode.value = { type: 'edit', entryId: entry.id, issueId: entry.issue.id }
  editForm.value = {
    startedAt: toLocalDateTimeInput(entry.startedAt),
    endedAt: entry.endedAt ? toLocalDateTimeInput(entry.endedAt) : '',
    issueName: entry.issue.name,
    issueLink: entry.issue.link || ''
  }
}

function cancelEditing() {
  editMode.value = { type: 'normal' }
}

async function saveEdit() {
  if (editMode.value.type !== 'edit') return

  // Update time entry
  const updates: { startedAt?: string; endedAt?: string } = {}
  if (editForm.value.startedAt) {
    updates.startedAt = new Date(editForm.value.startedAt).toISOString()
  }
  if (editForm.value.endedAt) {
    updates.endedAt = new Date(editForm.value.endedAt).toISOString()
  }
  await window.electronAPI.updateTimeEntry(editMode.value.entryId, updates)

  // Update issue
  await issuesStore.updateIssue(editMode.value.issueId, {
    name: editForm.value.issueName.trim(),
    link: editForm.value.issueLink.trim() || null
  })

  editMode.value = { type: 'normal' }
  await loadEntries()
}

// Notes functions
function startEditingNotes(entry: TimeEntry & { issue: Issue }) {
  editMode.value = { type: 'editNotes', entryId: entry.id }
  notesForm.value = entry.notes || ''
}

function cancelEditingNotes() {
  editMode.value = { type: 'normal' }
}

async function saveNotes() {
  if (editMode.value.type !== 'editNotes') return

  await window.electronAPI.updateTimeEntry(editMode.value.entryId, { notes: notesForm.value || undefined })
  editMode.value = { type: 'normal' }
  await loadEntries()
}

// Delete function
async function deleteEntry(entryId: number) {
  await window.electronAPI.deleteTimeEntry(entryId)
  await loadEntries()
  emit('entries-changed')
}

// Merge up/down functions
function getAdjacentEntry(entry: TimeEntry & { issue: Issue }, direction: 'up' | 'down'): (TimeEntry & { issue: Issue }) | null {
  // Flatten all entries in display order (newest first)
  const allEntries = groupedEntries.value.flatMap(g => g.entries)
  const currentIndex = allEntries.findIndex(e => e.id === entry.id)

  if (currentIndex === -1) return null

  // "up" means previous in list (more recent), "down" means next in list (older)
  const adjacentIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

  if (adjacentIndex < 0 || adjacentIndex >= allEntries.length) return null

  return allEntries[adjacentIndex]
}

function canMergeWith(entry: TimeEntry & { issue: Issue }, direction: 'up' | 'down'): boolean {
  return getAdjacentEntry(entry, direction) !== null
}

async function mergeWithAdjacent(entry: TimeEntry & { issue: Issue }, direction: 'up' | 'down') {
  const adjacent = getAdjacentEntry(entry, direction)
  if (!adjacent) return

  try {
    // Target entry (the one we merge INTO) comes first - its issue will be used
    const targetEntry = adjacent
    const ids = [targetEntry.id, entry.id]

    await window.electronAPI.mergeTimeEntries(ids)
    await loadEntries()
    emit('entries-changed')

    successMessage.value = `Merged into "${targetEntry.issue.name}"`
    setTimeout(() => { successMessage.value = '' }, 3000)
  } catch (err) {
    console.error('Failed to merge:', err)
  }
}

// Add entry functions
function openAddEntryModal(prefillDate?: string) {
  addEntryForm.value = {
    issueText: '',
    issueLink: '',
    date: prefillDate || today.toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    notes: ''
  }
  showAddEntryModal.value = true
}

function closeAddEntryModal() {
  showAddEntryModal.value = false
}

async function submitAddEntry() {
  const issueText = addEntryForm.value.issueText.trim()
  if (!issueText) return

  // Find existing issue or create new one
  let issueId: number
  const existingIssue = issuesStore.issues.find(
    i => `${i.externalId} - ${i.name}` === issueText ||
         i.externalId === issueText ||
         i.name === issueText
  )

  if (existingIssue) {
    issueId = existingIssue.id
  } else {
    // Create new issue with the text as name
    const link = addEntryForm.value.issueLink.trim() || null
    // Don't duplicate name as ID - leave ID empty for manual entries
    const newIssue = await issuesStore.createIssue('', issueText, link)
    issueId = newIssue.id
  }

  const startedAt = new Date(`${addEntryForm.value.date}T${addEntryForm.value.startTime}`).toISOString()
  const endedAt = new Date(`${addEntryForm.value.date}T${addEntryForm.value.endTime}`).toISOString()

  await window.electronAPI.createTimeEntry(
    issueId,
    startedAt,
    endedAt,
    addEntryForm.value.notes || undefined
  )

  showAddEntryModal.value = false
  await loadEntries()
  emit('entries-changed')

  // Show success message
  successMessage.value = 'Entry added successfully'
  setTimeout(() => {
    successMessage.value = ''
  }, 3000)
}

// Computed preview duration for add entry form
const addEntryDuration = computed(() => {
  const start = new Date(`${addEntryForm.value.date}T${addEntryForm.value.startTime}`).getTime()
  const end = new Date(`${addEntryForm.value.date}T${addEntryForm.value.endTime}`).getTime()
  if (isNaN(start) || isNaN(end) || end <= start) return ''
  return formatDuration((end - start) / 1000)
})

// Bulk delete functions
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    selectedIds.value.clear()
  }
}

function toggleEntry(id: number) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  // Trigger reactivity
  selectedIds.value = new Set(selectedIds.value)
}

function toggleDay(dayEntries: (TimeEntry & { issue: Issue })[]) {
  const dayIds = dayEntries.map(e => e.id)
  const allSelected = dayIds.every(id => selectedIds.value.has(id))

  if (allSelected) {
    dayIds.forEach(id => selectedIds.value.delete(id))
  } else {
    dayIds.forEach(id => selectedIds.value.add(id))
  }
  // Trigger reactivity
  selectedIds.value = new Set(selectedIds.value)
}

function isDaySelected(dayEntries: (TimeEntry & { issue: Issue })[]): boolean {
  return dayEntries.length > 0 && dayEntries.every(e => selectedIds.value.has(e.id))
}

function confirmBulkDelete(type: 'selected' | 'range') {
  bulkDeleteType.value = type
  showBulkDeleteConfirm.value = true
}

async function executeBulkDelete() {
  let idsToDelete: number[]

  if (bulkDeleteType.value === 'selected') {
    idsToDelete = Array.from(selectedIds.value)
  } else {
    // Delete all in range
    idsToDelete = entries.value.map(e => e.id)
  }

  if (idsToDelete.length > 0) {
    await window.electronAPI.deleteTimeEntries(idsToDelete)
  }

  showBulkDeleteConfirm.value = false
  selectedIds.value.clear()
  selectionMode.value = false
  await loadEntries()
  emit('entries-changed')
}

// Merge functionality
const canMergeSelected = computed(() => {
  if (selectedIds.value.size < 2) return false

  // Get selected entries
  const selectedEntries = entries.value.filter(e => selectedIds.value.has(e.id))
  if (selectedEntries.length < 2) return false

  // Check all entries have the same issue
  const issueIds = new Set(selectedEntries.map(e => e.issue.id))
  return issueIds.size === 1
})

const mergeTooltip = computed(() => {
  if (selectedIds.value.size < 2) return 'Select at least 2 entries to merge'
  if (!canMergeSelected.value) return 'Can only merge entries for the same tracked item'
  return 'Merge selected entries into one'
})

async function mergeSelected() {
  if (!canMergeSelected.value) return

  const ids = Array.from(selectedIds.value)
  try {
    await window.electronAPI.mergeTimeEntries(ids)
    selectedIds.value.clear()
    selectionMode.value = false
    await loadEntries()
    emit('entries-changed')

    // Show success message
    successMessage.value = 'Entries merged successfully'
    setTimeout(() => {
      successMessage.value = ''
    }, 3000)
  } catch (err) {
    console.error('Failed to merge entries:', err)
  }
}

// State message for "you are here" anchor
const stateMessage = computed(() => {
  if (isLoading.value) return 'Loading entries...'
  if (entries.value.length === 0) return 'No entries in selected range'

  // Format date range nicely
  const start = new Date(startDate.value)
  const end = new Date(endDate.value)
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

  const entryCount = entries.value.length
  const entryWord = entryCount === 1 ? 'entry' : 'entries'

  return `Showing ${entryCount} ${entryWord} from ${formatter.format(start)} – ${formatter.format(end)}`
})

watch([startDate, endDate], loadEntries)
onMounted(() => {
  loadEntries()
  issuesStore.loadIssues()
})

const emit = defineEmits<{
  (e: 'entries-changed'): void
  (e: 'view-change', view: 'list' | 'calendar'): void
}>()

// Expose for parent component
defineExpose({ openAddEntryModal, loadEntries })
</script>

<template>
  <div class="history-list">
    <!-- Success message -->
    <div v-if="successMessage" class="success-toast">
      {{ successMessage }}
    </div>

    <!-- Main History card with unified header -->
    <RCard>
      <template #title>
        <div class="card-header">
          <div class="header-left">
            <span class="card-title">History</span>
            <div class="view-toggle" :class="{ 'demoted': selectionMode }">
              <RButton size="small" :class="{ 'view-active': viewMode === 'list' }" @click="$emit('view-change', 'list')" :disabled="selectionMode">
                List
              </RButton>
              <RButton size="small" :class="{ 'view-active': viewMode === 'calendar' }" @click="$emit('view-change', 'calendar')" :disabled="selectionMode">
                Calendar
              </RButton>
            </div>
          </div>
          <div class="header-right">
            <RButton size="small" filled @click="openAddEntryModal" title="Add a manual time entry" :class="{ 'demoted': selectionMode }" :disabled="selectionMode">
              + Add Entry
            </RButton>
            <RButton
              size="small"
              :filled="selectionMode"
              @click="toggleSelectionMode"
            >
              {{ selectionMode ? 'Cancel' : 'Select' }}
            </RButton>
            <template v-if="selectionMode">
              <RButton
                size="small"
                color="success"
                :disabled="!canMergeSelected"
                :title="mergeTooltip"
                @click="mergeSelected"
              >
                Merge ({{ selectedIds.size }})
              </RButton>
              <RButton
                size="small"
                color="error"
                :disabled="selectedIds.size === 0"
                @click="confirmBulkDelete('selected')"
              >
                Delete ({{ selectedIds.size }})
              </RButton>
              <RButton
                size="small"
                class="btn-secondary-danger"
                :disabled="entries.length === 0"
                @click="confirmBulkDelete('range')"
              >
                Delete all {{ entries.length }}
              </RButton>
            </template>
            <!-- Date filter - hidden in selection mode (state sentence shows the range) -->
            <template v-if="!selectionMode">
              <span class="date-label">From</span>
              <input v-model="startDate" type="date" class="date-input" />
              <span class="date-label">to</span>
              <input v-model="endDate" type="date" class="date-input" />
            </template>
          </div>
        </div>
      </template>

      <!-- State sentence - shows what you're viewing -->
      <div class="state-sentence">
        <RText class="text-secondary">
          {{ stateMessage }}
        </RText>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="p-8 text-center">
        <RText class="text-secondary">Loading...</RText>
      </div>

      <!-- Empty state -->
      <div v-else-if="groupedEntries.length === 0" class="p-8 text-center">
        <RText class="text-secondary">No time entries for this period.</RText>
      </div>

      <!-- Entries grouped by day -->
      <div v-else class="entries-container">
        <RCard
          v-for="group in groupedEntries"
          :key="group.date"
          class="day-card"
        >
          <template #title>
            <RSpace justify="space-between" class="w-full">
              <RSpace align="center">
                <input
                  v-if="selectionMode"
                  type="checkbox"
                  :checked="isDaySelected(group.entries)"
                  @change="toggleDay(group.entries)"
                  class="bulk-checkbox"
                />
                <RText>{{ formatDate(group.date) }}</RText>
              </RSpace>
              <RSpace align="center">
                <RText class="text-secondary">Total: {{ formatDuration(group.totalSeconds) }}</RText>
                <RButton
                  v-if="!selectionMode"
                  size="small"
                  class="day-add-btn"
                  @click.stop="openAddEntryModal(group.date)"
                  title="Add entry for this day"
                >
                  +
                </RButton>
              </RSpace>
            </RSpace>
          </template>

          <RList>
            <RListItem
              v-for="entry in group.entries"
              :key="entry.id"
              class="entry-item"
            >
              <!-- Edit mode (combined time + issue) -->
              <form v-if="editMode.type === 'edit' && editMode.entryId === entry.id" @submit.prevent="saveEdit" class="edit-form">
                <div class="edit-grid">
                  <label class="edit-label">Item</label>
                  <input
                    v-model="editForm.issueName"
                    type="text"
                    class="date-input"
                    placeholder="Description"
                    required
                  />
                  <label class="edit-label">Link</label>
                  <input
                    v-model="editForm.issueLink"
                    type="text"
                    class="date-input"
                    placeholder="URL (optional)"
                  />
                  <label class="edit-label">Start</label>
                  <input
                    v-model="editForm.startedAt"
                    type="datetime-local"
                    class="date-input"
                    required
                  />
                  <label class="edit-label">End</label>
                  <input
                    v-model="editForm.endedAt"
                    type="datetime-local"
                    class="date-input"
                  />
                </div>
                <div class="edit-actions">
                  <RButton type="submit" size="small" filled>Save</RButton>
                  <RButton type="button" size="small" @click="cancelEditing">Cancel</RButton>
                </div>
              </form>

              <!-- Edit notes mode -->
              <div v-else-if="editMode.type === 'editNotes' && editMode.entryId === entry.id" class="space-y-2 w-full">
                <RText class="text-sm">
                  <span class="text-secondary">{{ entry.issue.externalId }}</span> {{ entry.issue.name }}
                </RText>
                <RInput
                  v-model="notesForm"
                  :lines="4"
                  placeholder="Add notes about what you worked on..."
                />
                <RSpace>
                  <RButton size="small" filled @click="saveNotes">Save Notes</RButton>
                  <RButton size="small" @click="cancelEditingNotes">Cancel</RButton>
                </RSpace>
              </div>

              <!-- Normal display mode -->
              <div v-else class="flex items-center gap-4 w-full">
                <input
                  v-if="selectionMode"
                  type="checkbox"
                  :checked="selectedIds.has(entry.id)"
                  @change="toggleEntry(entry.id)"
                  class="bulk-checkbox"
                />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <RText class="text-secondary">{{ entry.issue.externalId }}</RText>
                    <RText>{{ entry.issue.name }}</RText>
                  </div>
                  <RText size="small" class="text-secondary">
                    {{ formatTime(entry.startedAt) }} - {{ entry.endedAt ? formatTime(entry.endedAt) : 'ongoing' }}
                    <span v-if="entry.pausedReason" class="ml-2">({{ entry.pausedReason }})</span>
                    <button
                      v-if="entry.notes"
                      class="notes-toggle"
                      @click="expandedNotesId = expandedNotesId === entry.id ? null : entry.id"
                      title="Show notes"
                    >
                      <Icon name="note" :size="12" />
                    </button>
                  </RText>
                  <RText v-if="entry.notes && expandedNotesId === entry.id" size="small" class="text-secondary italic block mt-1 entry-notes">
                    {{ entry.notes }}
                  </RText>
                </div>
                <RText class="font-medium">
                  {{ formatDuration(entryDuration(entry)) }}
                </RText>

                <!-- Actions dropdown menu -->
                <div class="entry-actions" v-if="!selectionMode">
                  <RPopover
                    trigger="click"
                    side="bottom"
                    align="end"
                    :open="openMenuId === entry.id"
                    @update:open="(v: boolean) => openMenuId = v ? entry.id : null"
                  >
                    <template #anchor>
                      <RButton
                        size="small"
                        title="Actions"
                        class="menu-trigger"
                      >
                        <span class="menu-dots">&#8942;</span>
                      </RButton>
                    </template>

                    <div class="actions-menu">
                      <!-- Notes -->
                      <button class="menu-item" @click="startEditingNotes(entry); openMenuId = null">
                        <Icon name="note" :size="16" />
                        <span>Notes</span>
                      </button>

                      <!-- Edit (combined time + issue) -->
                      <button class="menu-item" @click="startEditing(entry); openMenuId = null">
                        <Icon name="pencil" :size="16" />
                        <span>Edit</span>
                      </button>

                      <div class="menu-divider"></div>

                      <!-- Merge up -->
                      <button
                        class="menu-item"
                        :class="{ 'menu-item-disabled': !canMergeWith(entry, 'up') }"
                        :disabled="!canMergeWith(entry, 'up')"
                        @click="mergeWithAdjacent(entry, 'up'); openMenuId = null"
                      >
                        <Icon name="merge" :size="16" />
                        <span>Merge up</span>
                      </button>

                      <!-- Merge down -->
                      <button
                        class="menu-item"
                        :class="{ 'menu-item-disabled': !canMergeWith(entry, 'down') }"
                        :disabled="!canMergeWith(entry, 'down')"
                        @click="mergeWithAdjacent(entry, 'down'); openMenuId = null"
                      >
                        <Icon name="merge" :size="16" />
                        <span>Merge down</span>
                      </button>

                      <div class="menu-divider"></div>

                      <!-- Delete -->
                      <button class="menu-item menu-item-danger" @click="deleteEntry(entry.id); openMenuId = null">
                        <Icon name="delete" :size="16" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </RPopover>
                </div>
              </div>
            </RListItem>
          </RList>
        </RCard>
      </div>
    </RCard>

    <!-- Bulk Delete Confirmation Dialog -->
    <RDialog v-model:open="showBulkDeleteConfirm">
      <template #title>Delete Entries?</template>
      <RText>
        This will permanently delete
        {{ bulkDeleteType === 'selected' ? selectedIds.size : entries.length }}
        time {{ (bulkDeleteType === 'selected' ? selectedIds.size : entries.length) === 1 ? 'entry' : 'entries' }}.
        This cannot be undone.
      </RText>
      <RSpace class="modal-actions">
        <RButton @click="showBulkDeleteConfirm = false">Cancel</RButton>
        <RButton color="error" filled @click="executeBulkDelete">Delete</RButton>
      </RSpace>
    </RDialog>

    <!-- Add Entry Dialog -->
    <RDialog v-model:open="showAddEntryModal">
      <template #title>Add Manual Entry</template>

      <form @submit.prevent="submitAddEntry" class="dialog-form">
        <div class="form-group">
          <label class="form-label">Tracked item (select existing or type new)</label>
          <input
            v-model="addEntryForm.issueText"
            list="issue-suggestions"
            class="select-input"
            placeholder="Type description or select from list"
            required
          />
          <datalist id="issue-suggestions">
            <option v-for="issue in issuesStore.issues" :key="issue.id" :value="`${issue.externalId} - ${issue.name}`" />
          </datalist>
        </div>

        <div class="form-group">
          <label class="form-label">Link (optional, for new tracked items)</label>
          <input
            v-model="addEntryForm.issueLink"
            type="text"
            class="select-input"
            placeholder="www.example.com or https://..."
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input
              v-model="addEntryForm.date"
              type="date"
              class="date-input"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label">Start</label>
            <input
              v-model="addEntryForm.startTime"
              type="time"
              class="date-input"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label">End</label>
            <input
              v-model="addEntryForm.endTime"
              type="time"
              class="date-input"
              required
            />
          </div>
          <div class="form-group duration-display" v-if="addEntryDuration">
            <label class="form-label">Duration</label>
            <span class="duration-value">{{ addEntryDuration }}</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea
            v-model="addEntryForm.notes"
            class="notes-input"
            rows="3"
            placeholder="What did you work on?"
          ></textarea>
        </div>

        <div class="form-actions">
          <RButton type="button" @click="closeAddEntryModal">Cancel</RButton>
          <RButton type="submit" filled :disabled="!addEntryForm.issueText.trim()">Add Entry</RButton>
        </div>
      </form>
    </RDialog>
  </div>
</template>

<style scoped>
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.card-title {
  font-weight: 600;
  font-size: 1.1rem;
}

/* Demote secondary controls in selection mode */
.demoted {
  opacity: 0.3;
  pointer-events: none;
}

.card-header :deep(.r-button) {
  font-size: 0.8rem;
}

/* State sentence - "you are here" anchor */
.state-sentence {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.5rem;
}

/* Entries container */
.entries-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.day-card {
  --r-card-padding: 0.5rem;
  overflow: visible;
}

/* Ensure card internals allow popover overflow */
.day-card :deep(.r-card__body) {
  overflow: visible;
}

.date-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.entry-item {
  padding: 0.75rem 0;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem 0;
  width: 100%;
}

.edit-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 0.75rem;
  align-items: center;
}

.edit-label {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  text-align: right;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.date-input,
.select-input {
  padding: 0.4rem 0.6rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.85rem;
  /* Match roughness sketchy style */
  box-shadow: 1px 1px 0 var(--color-border);
}

.date-input:focus,
.select-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 1px 1px 0 var(--color-accent);
}

.date-input:hover,
.select-input:hover {
  border-color: var(--color-text-secondary);
}

/* Style datetime-local picker to match app theme */
.date-input::-webkit-calendar-picker-indicator {
  cursor: pointer;
  filter: opacity(0.6);
}

.date-input::-webkit-calendar-picker-indicator:hover {
  filter: opacity(1);
}

.select-input {
  width: 100%;
}

/* Dialog form styles */
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-row {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
}

.duration-display {
  justify-content: flex-end;
}

.duration-value {
  font-weight: 600;
  padding: 0.5rem 0;
}

.notes-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-family: inherit;
  resize: vertical;
  box-shadow: 1px 1px 0 var(--color-border);
}

.notes-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 1px 1px 0 var(--color-accent);
}

.notes-input:hover {
  border-color: var(--color-text-secondary);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.success-toast {
  background: var(--color-success);
  color: white;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  text-align: center;
  font-weight: 500;
}

.bulk-toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn-secondary-danger {
  opacity: 0.6;
}

.btn-secondary-danger:hover {
  opacity: 1;
}

/* Entry actions - ghosted by default, visible on hover */
.entry-actions {
  display: flex;
  gap: 0.25rem;
  position: relative;
}

/* Ensure popover content appears above everything */
.entry-actions :deep(.r-popover__content) {
  z-index: 9999 !important;
}

/* Menu trigger button */
.menu-trigger {
  opacity: 0.4;
  transition: opacity 0.15s ease;
}

.entry-item:hover .menu-trigger {
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
  position: relative;
  z-index: 9999;
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

.menu-item-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.menu-item-disabled:hover {
  background-color: transparent;
}

.menu-divider {
  height: 1px;
  margin: 0.25rem 0;
  background-color: var(--color-border, rgba(0, 0, 0, 0.1));
}

/* Day-level add button - subtle, appears on hover */
.day-add-btn {
  opacity: 0.3;
  transition: opacity 0.15s ease;
  padding: 0 0.5rem;
  min-width: unset;
}

.day-card:hover .day-add-btn {
  opacity: 0.7;
}

.day-add-btn:hover {
  opacity: 1 !important;
}

.notes-toggle {
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.6;
  padding: 0 0.25rem;
  vertical-align: middle;
}

.notes-toggle:hover {
  opacity: 1;
}

.entry-notes {
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  max-height: 4rem;
  overflow-y: auto;
}

</style>
