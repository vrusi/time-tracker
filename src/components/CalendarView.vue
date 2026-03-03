<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { RCard, RButton, RText, RSpace, RPopover, RInput } from 'roughness'
import { useIssuesStore } from '../stores/issues.store'
import { formatHours, formatTime, formatDuration, toLocalDateTimeInput } from '../utils/format'
import {
  calculateDailyTotals,
  generateCalendarWeeks,
  getHoursClass,
  isToday,
  isWeekend,
  toLocalDateStr,
  type TimeEntryWithIssue
} from '../utils/calendar'
import Icon from './Icon.vue'

const issuesStore = useIssuesStore()

const entries = ref<TimeEntryWithIssue[]>([])
const isLoading = ref(false)
const expandedDate = ref<string | null>(null)

// Edit mode - discriminated union for mutually exclusive edit states
type EditMode =
  | { type: 'normal' }
  | { type: 'edit'; entryId: number; issueId: number }
  | { type: 'editNotes'; entryId: number }

const editMode = ref<EditMode>({ type: 'normal' })
const editForm = ref({ startedAt: '', endedAt: '', issueName: '', issueLink: '' })
const notesForm = ref('')
const openMenuId = ref<number | null>(null)
const expandedNotesId = ref<number | null>(null)
const toastMessage = ref('')
const toastIsError = ref(false)

// Current month/year selection
const currentDate = ref(new Date())
const year = computed(() => currentDate.value.getFullYear())
const month = computed(() => currentDate.value.getMonth())

const monthName = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
})

// Days of week header (Mon-Sun)
const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Calculate daily totals from entries
const dailyTotals = computed(() => calculateDailyTotals(entries.value))

// Entries for the expanded day, sorted by startedAt ascending (chronological)
const expandedDayEntries = computed(() => {
  if (!expandedDate.value) return []
  return entries.value
    .filter(e => toLocalDateStr(new Date(e.startedAt)) === expandedDate.value)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
})

function toggleDay(dateStr: string) {
  if (expandedDate.value === dateStr) {
    expandedDate.value = null
  } else {
    expandedDate.value = dateStr
  }
  // Reset action state when toggling
  editMode.value = { type: 'normal' }
  openMenuId.value = null
}

// Build calendar grid
const calendarWeeks = computed(() => generateCalendarWeeks(year.value, month.value))

async function loadEntries() {
  isLoading.value = true
  try {
    const start = new Date(year.value, month.value, 1)
    const end = new Date(year.value, month.value + 1, 0, 23, 59, 59, 999)

    entries.value = await window.electronAPI.getTimeEntries(
      start.toISOString(),
      end.toISOString()
    )
  } finally {
    isLoading.value = false
  }
}

function prevMonth() {
  currentDate.value = new Date(year.value, month.value - 1, 1)
}

function nextMonth() {
  currentDate.value = new Date(year.value, month.value + 1, 1)
}

function goToToday() {
  currentDate.value = new Date()
}

// Monthly totals
const monthTotal = computed(() => {
  return entries.value.reduce((total, entry) => {
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    return total + (end - start) / 1000
  }, 0)
})

// Entry duration helper
function entryDuration(entry: TimeEntryWithIssue): number {
  const start = new Date(entry.startedAt).getTime()
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
  return (end - start) / 1000
}

// Toast notification
function showToast(message: string, isError = false) {
  toastMessage.value = message
  toastIsError.value = isError
  setTimeout(() => { toastMessage.value = '' }, 3000)
}

// Edit functions
function startEditing(entry: TimeEntryWithIssue) {
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

  try {
    const updates: { startedAt?: string; endedAt?: string } = {}
    if (editForm.value.startedAt) {
      updates.startedAt = new Date(editForm.value.startedAt).toISOString()
    }
    if (editForm.value.endedAt) {
      updates.endedAt = new Date(editForm.value.endedAt).toISOString()
    }
    await window.electronAPI.updateTimeEntry(editMode.value.entryId, updates)

    await issuesStore.updateIssue(editMode.value.issueId, {
      name: editForm.value.issueName.trim(),
      link: editForm.value.issueLink.trim() || null
    })

    editMode.value = { type: 'normal' }
    await loadEntries()
    emit('entries-changed')
    showToast('Entry updated')
  } catch (err) {
    console.error('Failed to save edit:', err)
    showToast('Failed to save changes', true)
  }
}

// Notes functions
function startEditingNotes(entry: TimeEntryWithIssue) {
  editMode.value = { type: 'editNotes', entryId: entry.id }
  notesForm.value = entry.notes || ''
}

function cancelEditingNotes() {
  editMode.value = { type: 'normal' }
}

async function saveNotes() {
  if (editMode.value.type !== 'editNotes') return

  try {
    await window.electronAPI.updateTimeEntry(editMode.value.entryId, { notes: notesForm.value || undefined })
    editMode.value = { type: 'normal' }
    await loadEntries()
    emit('entries-changed')
    showToast('Notes saved')
  } catch (err) {
    console.error('Failed to save notes:', err)
    showToast('Failed to save notes', true)
  }
}

// Delete function
async function deleteEntry(entryId: number) {
  try {
    await window.electronAPI.deleteTimeEntry(entryId)
    await loadEntries()
    emit('entries-changed')
    showToast('Entry deleted')
  } catch (err) {
    console.error('Failed to delete entry:', err)
    showToast('Failed to delete entry', true)
  }
}

// Merge functions - adjacency scoped to expanded day entries (chronological order)
function getAdjacentEntry(entry: TimeEntryWithIssue, direction: 'up' | 'down'): TimeEntryWithIssue | null {
  const dayEntries = expandedDayEntries.value
  const currentIndex = dayEntries.findIndex(e => e.id === entry.id)
  if (currentIndex === -1) return null

  // "up" = earlier entry (previous in chronological list), "down" = later entry
  const adjacentIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (adjacentIndex < 0 || adjacentIndex >= dayEntries.length) return null

  return dayEntries[adjacentIndex]
}

function canMergeWith(entry: TimeEntryWithIssue, direction: 'up' | 'down'): boolean {
  return getAdjacentEntry(entry, direction) !== null
}

async function mergeWithAdjacent(entry: TimeEntryWithIssue, direction: 'up' | 'down') {
  const adjacent = getAdjacentEntry(entry, direction)
  if (!adjacent) return

  try {
    const targetEntry = adjacent
    const ids = [targetEntry.id, entry.id]

    await window.electronAPI.mergeTimeEntries(ids)
    await loadEntries()
    emit('entries-changed')
    showToast(`Merged into "${targetEntry.issue.name}"`)
  } catch (err) {
    console.error('Failed to merge:', err)
    showToast('Failed to merge entries', true)
  }
}

watch([year, month], loadEntries)
onMounted(loadEntries)

const emit = defineEmits<{
  (e: 'view-change', view: 'list' | 'calendar'): void
  (e: 'add-entry', date: string): void
  (e: 'entries-changed'): void
}>()

function handleAddEntry(dateStr: string) {
  expandedDate.value = null
  emit('add-entry', dateStr)
}

defineExpose({ loadEntries })
</script>

<template>
  <div class="calendar-wrapper">
  <!-- Toast notification -->
  <div v-if="toastMessage" :class="['toast', toastIsError ? 'toast-error' : 'toast-success']">
    {{ toastMessage }}
  </div>

  <RCard>
    <template #title>
      <div class="card-header">
        <div class="header-left">
          <span class="card-title">History</span>
          <div class="view-toggle">
            <RButton size="small" @click="emit('view-change', 'list')">
              List
            </RButton>
            <RButton size="small" class="view-active" @click="emit('view-change', 'calendar')">
              Calendar
            </RButton>
          </div>
        </div>
        <div class="header-right">
          <RButton @click="prevMonth">←</RButton>
          <div class="text-center month-display">
            <RText class="font-semibold">{{ monthName }}</RText>
            <RText size="small" class="text-secondary block">
              Total: {{ formatHours(monthTotal) || '0h' }}
            </RText>
          </div>
          <RSpace>
            <RButton size="small" @click="goToToday">Today</RButton>
            <RButton @click="nextMonth">→</RButton>
          </RSpace>
        </div>
      </div>
    </template>

    <!-- Loading -->
    <div v-if="isLoading" class="p-8 text-center">
      <RText class="text-secondary">Loading...</RText>
    </div>

    <!-- Calendar grid -->
    <div v-else class="calendar-grid">
      <!-- Week day headers -->
      <div class="grid grid-cols-7 gap-1 mb-2">
        <div
          v-for="day in weekDays"
          :key="day"
          class="text-center text-sm font-medium text-secondary py-2"
        >
          {{ day }}
        </div>
      </div>

      <!-- Calendar weeks -->
      <div class="grid gap-1">
        <div
          v-for="(week, weekIndex) in calendarWeeks"
          :key="weekIndex"
          class="grid grid-cols-7 gap-1"
        >
          <div
            v-for="dayInfo in week"
            :key="dayInfo.dateStr"
            :class="[
              'calendar-day',
              !dayInfo.isCurrentMonth && 'other-month',
              isToday(dayInfo.dateStr) && 'today',
              isWeekend(dayInfo.date) && dayInfo.isCurrentMonth && 'weekend',
              dailyTotals.get(dayInfo.dateStr) && 'has-entries',
              expandedDate === dayInfo.dateStr && 'expanded'
            ]"
            @click="dayInfo.isCurrentMonth && toggleDay(dayInfo.dateStr)"
            @dblclick="dayInfo.isCurrentMonth && handleAddEntry(dayInfo.dateStr)"
          >
            <div class="flex justify-between items-start">
              <span
                :class="[
                  'font-medium',
                  !dayInfo.isCurrentMonth && 'text-secondary',
                  isToday(dayInfo.dateStr) && 'text-accent'
                ]"
              >
                {{ dayInfo.day }}
              </span>
              <span
                v-if="dailyTotals.get(dayInfo.dateStr)"
                :class="['hours-badge', getHoursClass(dailyTotals.get(dayInfo.dateStr) || 0)]"
              >
                {{ formatHours(dailyTotals.get(dayInfo.dateStr) || 0) }}
              </span>
            </div>

            <!-- Expanded per-entry breakdown -->
            <div
              v-if="expandedDate === dayInfo.dateStr"
              class="issue-breakdown"
              @click.stop
            >
              <template v-for="entry in expandedDayEntries" :key="entry.id">
                <!-- Edit mode -->
                <form v-if="editMode.type === 'edit' && editMode.entryId === entry.id" @submit.prevent="saveEdit" class="entry-edit-form">
                  <div class="edit-grid">
                    <label class="edit-label">Item</label>
                    <input
                      v-model="editForm.issueName"
                      type="text"
                      class="edit-input"
                      placeholder="Description"
                      required
                    />
                    <label class="edit-label">Link</label>
                    <input
                      v-model="editForm.issueLink"
                      type="text"
                      class="edit-input"
                      placeholder="URL (optional)"
                    />
                    <label class="edit-label">Start</label>
                    <input
                      v-model="editForm.startedAt"
                      type="datetime-local"
                      class="edit-input"
                      required
                    />
                    <label class="edit-label">End</label>
                    <input
                      v-model="editForm.endedAt"
                      type="datetime-local"
                      class="edit-input"
                    />
                  </div>
                  <div class="edit-actions">
                    <RButton type="submit" size="small" filled>Save</RButton>
                    <RButton type="button" size="small" @click="cancelEditing">Cancel</RButton>
                  </div>
                </form>

                <!-- Notes edit mode -->
                <div v-else-if="editMode.type === 'editNotes' && editMode.entryId === entry.id" class="entry-notes-form">
                  <RText size="small">
                    <span class="text-secondary">{{ entry.issue.externalId }}</span> {{ entry.issue.name }}
                  </RText>
                  <RInput
                    v-model="notesForm"
                    :lines="3"
                    placeholder="Add notes about what you worked on..."
                  />
                  <div class="edit-actions">
                    <RButton size="small" filled @click="saveNotes">Save Notes</RButton>
                    <RButton size="small" @click="cancelEditingNotes">Cancel</RButton>
                  </div>
                </div>

                <!-- Normal display mode -->
                <div v-else class="entry-row">
                  <div class="entry-info">
                    <div class="entry-header">
                      <span class="issue-id">{{ entry.issue.externalId }}</span>
                      <span class="issue-name">{{ entry.issue.name }}</span>
                    </div>
                    <span class="entry-time text-secondary">
                      {{ formatTime(entry.startedAt) }} - {{ entry.endedAt ? formatTime(entry.endedAt) : 'ongoing' }}
                      <button
                        v-if="entry.notes"
                        class="notes-toggle"
                        @click.stop="expandedNotesId = expandedNotesId === entry.id ? null : entry.id"
                        title="Show notes"
                      >
                        <Icon name="note" :size="12" />
                      </button>
                    </span>
                    <RText v-if="entry.notes && expandedNotesId === entry.id" size="small" class="text-secondary italic entry-notes-text">
                      {{ entry.notes }}
                    </RText>
                  </div>
                  <span class="entry-duration">{{ formatDuration(entryDuration(entry)) }}</span>

                  <!-- Actions dropdown menu -->
                  <div class="entry-actions">
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
                        <button class="menu-item" @click="startEditingNotes(entry); openMenuId = null">
                          <Icon name="note" :size="16" />
                          <span>Notes</span>
                        </button>

                        <button class="menu-item" @click="startEditing(entry); openMenuId = null">
                          <Icon name="pencil" :size="16" />
                          <span>Edit</span>
                        </button>

                        <div class="menu-divider"></div>

                        <button
                          class="menu-item"
                          :class="{ 'menu-item-disabled': !canMergeWith(entry, 'up') }"
                          :disabled="!canMergeWith(entry, 'up')"
                          @click="mergeWithAdjacent(entry, 'up'); openMenuId = null"
                        >
                          <Icon name="merge" :size="16" />
                          <span>Merge up</span>
                        </button>

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

                        <button class="menu-item menu-item-danger" @click="deleteEntry(entry.id); openMenuId = null">
                          <Icon name="delete" :size="16" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </RPopover>
                  </div>
                </div>
              </template>

              <RButton
                size="small"
                class="add-entry-btn"
                @click="handleAddEntry(dayInfo.dateStr)"
              >
                + Add entry for this day
              </RButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </RCard>
  </div>
</template>

<style scoped>
.text-secondary {
  color: var(--color-text-secondary);
}

.text-accent {
  color: var(--color-accent);
}

/* Card header styling (matches IssueList/HistoryView) */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-title {
  font-weight: 600;
  font-size: 1.1rem;
}

.view-toggle {
  display: flex;
  gap: 0.5rem;
}

/* Both buttons look similar, inactive one is faded */
.view-toggle > :not(.view-active) {
  opacity: 0.5;
}

.card-header :deep(.r-button) {
  font-size: 0.8rem;
}

.month-display {
  min-width: 140px;
}

.calendar-day {
  min-height: 60px;
  padding: 0.5rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
}

.calendar-day.other-month {
  background: var(--color-bg-secondary);
  opacity: 0.6;
}

.calendar-day.weekend {
  background: var(--color-bg-secondary);
}

.calendar-day.today {
  border-color: var(--color-accent);
  border-width: 3px;
}

.hours-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-weight: 500;
}

.hours-great {
  background: var(--color-success);
  color: var(--color-bg);
}

.hours-good {
  background: var(--color-accent);
  color: var(--color-bg);
}

.hours-ok {
  background: var(--color-warning);
  color: var(--color-bg);
}

.hours-low {
  background: var(--color-border);
  color: var(--color-text-secondary);
}

.calendar-day.has-entries {
  cursor: pointer;
  transition: transform 0.15s ease;
}

.calendar-day.has-entries:hover {
  transform: scale(1.05);
  z-index: 1;
}

.calendar-day.expanded {
  transform: scale(1.05);
  z-index: 1;
}

.calendar-day {
  position: relative;
}

.issue-breakdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  min-width: 300px;
  max-width: 400px;
  margin-top: 0.25rem;
  padding: 0.75rem;
  background: var(--color-bg);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

/* Per-entry row layout */
.entry-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  padding: 0.375rem 0;
}

.entry-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.5rem;
  margin-bottom: 0.125rem;
}

.entry-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.issue-id {
  color: var(--color-accent);
  font-weight: 500;
  flex-shrink: 0;
}

.issue-name {
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-time {
  font-size: 0.75rem;
}

.entry-duration {
  color: var(--color-text-secondary);
  font-weight: 500;
  flex-shrink: 0;
  font-size: 0.8rem;
}

.entry-notes-text {
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  max-height: 3rem;
  overflow-y: auto;
}

/* Actions dropdown */
.entry-actions {
  display: flex;
  gap: 0.25rem;
  position: relative;
  flex-shrink: 0;
}

.entry-actions :deep(.r-popover__content) {
  z-index: 9999 !important;
}

.menu-trigger {
  opacity: 0.4;
  transition: opacity 0.15s ease;
}

.entry-row:hover .menu-trigger {
  opacity: 1;
}

.menu-dots {
  font-size: 1.1rem;
  line-height: 1;
  font-weight: bold;
}

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

/* Compact edit/notes forms for popup context */
.entry-edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.125rem;
}

.entry-notes-form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.125rem;
}

.edit-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.375rem 0.5rem;
  align-items: center;
}

.edit-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-align: right;
}

.edit-input {
  padding: 0.25rem 0.4rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  box-shadow: 1px 1px 0 var(--color-border);
}

.edit-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 1px 1px 0 var(--color-accent);
}

.edit-input:hover {
  border-color: var(--color-text-secondary);
}

.edit-input::-webkit-calendar-picker-indicator {
  cursor: pointer;
  filter: opacity(0.6);
}

.edit-input::-webkit-calendar-picker-indicator:hover {
  filter: opacity(1);
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
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

.add-entry-btn {
  width: 100%;
  margin-top: 0.5rem;
}

/* Toast notification */
.toast {
  position: fixed;
  top: 1rem;
  right: 1rem;
  color: white;
  padding: 0.75rem 1.25rem;
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
</style>
