<script setup lang="ts">
import { ref, watch, onMounted, inject } from 'vue'
import { useSettingsStore } from '../stores/settings.store'
import { RCard, RButton, RInput, RText, RSpace, RSwitch, RFormItem, RDialog } from 'roughness'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'

const settingsStore = useSettingsStore()
const issuesStore = useIssuesStore()
const trackerStore = useTrackerStore()
const refreshProgress = inject<() => void>('refreshProgress')

// Wipe database state
const showWipeConfirm = ref(false)
const isWiping = ref(false)

// Import state
const showImportConfirm = ref(false)
const isImporting = ref(false)

// Local form state
const form = ref({
  dailyTargetHours: 8,
  monthlyTargetHours: 160,
  hourlyRate: 18.67,
  currency: 'GBP',
  currencySymbol: '£',
  idleThresholdMinutes: 10,
  idleIndicatorMinutes: 0.5,
  issueUrlPattern: 'gitlab' as 'gitlab' | 'github' | 'jira' | 'custom',
  customIssuePattern: '' as string,
  theme: 'light' as 'light' | 'dark' | 'system',
  showEarnings: false,
  notificationsEnabled: true
})

const isSaving = ref(false)
const saveMessage = ref('')

const currencies = [
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' }
]

const issueTrackers: { value: 'gitlab' | 'github' | 'jira' | 'custom'; name: string; example: string }[] = [
  { value: 'gitlab', name: 'GitLab', example: 'https://gitlab.com/.../issues/123' },
  { value: 'github', name: 'GitHub', example: 'https://github.com/.../issues/123' },
  { value: 'jira', name: 'Jira', example: 'https://company.atlassian.net/browse/PROJ-123' },
  { value: 'custom', name: 'Custom', example: 'Define your own regex' }
]

// Load settings into form
onMounted(() => {
  if (settingsStore.isLoaded) {
    syncFormFromStore()
  }
})

watch(() => settingsStore.settings, syncFormFromStore, { deep: true })

function syncFormFromStore() {
  const s = settingsStore.settings
  form.value = {
    dailyTargetHours: s.dailyTargetHours,
    monthlyTargetHours: s.monthlyTargetHours,
    hourlyRate: s.hourlyRate,
    currency: s.currency,
    currencySymbol: s.currencySymbol,
    idleThresholdMinutes: s.idleThresholdMinutes,
    idleIndicatorMinutes: s.idleIndicatorMinutes,
    issueUrlPattern: s.issueUrlPattern,
    customIssuePattern: (s.customIssuePattern && s.customIssuePattern !== 'undefined') ? s.customIssuePattern : '',
    theme: s.theme,
    showEarnings: s.showEarnings,
    notificationsEnabled: s.notificationsEnabled
  }
}

function onCurrencyChange() {
  const currency = currencies.find(c => c.code === form.value.currency)
  if (currency) {
    form.value.currencySymbol = currency.symbol
  }
}

async function saveSettings() {
  isSaving.value = true
  saveMessage.value = ''

  try {
    await settingsStore.updateSettings({
      dailyTargetHours: form.value.dailyTargetHours,
      monthlyTargetHours: form.value.monthlyTargetHours,
      hourlyRate: form.value.hourlyRate,
      currency: form.value.currency,
      currencySymbol: form.value.currencySymbol,
      idleThresholdMinutes: form.value.idleThresholdMinutes,
      idleIndicatorMinutes: form.value.idleIndicatorMinutes,
      issueUrlPattern: form.value.issueUrlPattern,
      customIssuePattern: form.value.customIssuePattern?.trim() || undefined,
      theme: form.value.theme,
      showEarnings: form.value.showEarnings,
      notificationsEnabled: form.value.notificationsEnabled
    })
    saveMessage.value = 'Settings saved!'
    setTimeout(() => { saveMessage.value = '' }, 2000)
  } catch (err) {
    saveMessage.value = 'Error saving settings'
  } finally {
    isSaving.value = false
  }
}

async function exportDatabase() {
  const success = await window.electronAPI.exportDatabase()
  if (success) {
    saveMessage.value = 'Database exported successfully'
    setTimeout(() => { saveMessage.value = '' }, 2000)
  }
}

async function importDatabase() {
  isImporting.value = true
  try {
    // Stop any active tracking
    if (trackerStore.isTracking) {
      await trackerStore.pauseTracking()
    }
    trackerStore.clearState()

    const success = await window.electronAPI.importDatabase()
    if (success) {
      // Reload all stores
      await issuesStore.loadIssues()
      await settingsStore.loadSettings()
      refreshProgress?.()

      showImportConfirm.value = false
      saveMessage.value = 'Database imported successfully'
      setTimeout(() => { saveMessage.value = '' }, 2000)
    }
  } catch (err) {
    saveMessage.value = 'Error importing database'
  } finally {
    isImporting.value = false
    showImportConfirm.value = false
  }
}

async function wipeDatabase() {
  isWiping.value = true
  try {
    // Stop any active tracking
    if (trackerStore.isTracking) {
      await trackerStore.pauseTracking()
    }
    trackerStore.clearState()

    // Wipe database
    await window.electronAPI.wipeDatabase()

    // Reload stores
    await issuesStore.loadIssues()
    refreshProgress?.()

    showWipeConfirm.value = false
    saveMessage.value = 'Database wiped successfully'
    setTimeout(() => { saveMessage.value = '' }, 2000)
  } catch (err) {
    saveMessage.value = 'Error wiping database'
  } finally {
    isWiping.value = false
  }
}
</script>

<template>
  <div class="settings-view">
    <!-- Main Settings Card (same container model as Track/History) -->
    <RCard>
      <template #title>
        <div class="card-header">
          <span class="card-title">Settings</span>
          <div class="header-actions">
            <span v-if="saveMessage" :class="['save-message', saveMessage.includes('Error') ? 'error' : 'success']">
              {{ saveMessage }}
            </span>
            <RButton size="small" filled @click="saveSettings" :loading="isSaving">
              {{ isSaving ? 'Saving...' : 'Save' }}
            </RButton>
          </div>
        </div>
      </template>

      <!-- ═══════════════════════════════════════════════════════════════
           SECTION: Tracking
           ═══════════════════════════════════════════════════════════════ -->
      <div class="section">
        <div class="section-header">Tracking</div>

        <div class="setting-row">
          <div class="setting-label">Daily Target</div>
          <div class="setting-control">
            <input v-model.number="form.dailyTargetHours" type="number" min="1" max="24" step="0.5" class="input-number" />
            <span class="input-unit">hours</span>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">Monthly Target</div>
          <div class="setting-control">
            <input v-model.number="form.monthlyTargetHours" type="number" min="1" max="744" step="1" class="input-number" />
            <span class="input-unit">hours</span>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            Idle Warning
            <span class="setting-hint">Show indicator after inactivity</span>
          </div>
          <div class="setting-control">
            <input v-model.number="form.idleIndicatorMinutes" type="number" min="0.1" max="10" step="0.1" class="input-number" />
            <span class="input-unit">min</span>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            Auto-Pause
            <span class="setting-hint">Stop tracking after idle</span>
          </div>
          <div class="setting-control">
            <input v-model.number="form.idleThresholdMinutes" type="number" min="1" max="60" step="1" class="input-number" />
            <span class="input-unit">min</span>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════
           SECTION: Display
           ═══════════════════════════════════════════════════════════════ -->
      <div class="section">
        <div class="section-header">Display</div>

        <div class="setting-row">
          <div class="setting-label">Theme</div>
          <div class="setting-control">
            <div class="segmented-control">
              <button :class="['segment', form.theme === 'light' && 'active']" @click="form.theme = 'light'">Light</button>
              <button :class="['segment', form.theme === 'dark' && 'active']" @click="form.theme = 'dark'">Dark</button>
              <button :class="['segment', form.theme === 'system' && 'active']" @click="form.theme = 'system'">System</button>
            </div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            Notifications
            <span class="setting-hint">Idle pauses and daily target alerts</span>
          </div>
          <div class="setting-control">
            <RSwitch v-model="form.notificationsEnabled" />
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            Show Earnings
            <span class="setting-hint">Display on main screen</span>
          </div>
          <div class="setting-control">
            <RSwitch v-model="form.showEarnings" />
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">Hourly Rate</div>
          <div class="setting-control">
            <input v-model.number="form.hourlyRate" type="number" min="0" step="0.01" class="input-number input-wide" />
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">Currency</div>
          <div class="setting-control">
            <select v-model="form.currency" @change="onCurrencyChange" class="input-select">
              <option v-for="c in currencies" :key="c.code" :value="c.code">{{ c.symbol }} {{ c.name }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════
           SECTION: Integrations
           ═══════════════════════════════════════════════════════════════ -->
      <div class="section">
        <div class="section-header">Integrations</div>

        <div class="setting-row">
          <div class="setting-label">
            Issue Tracker
            <span class="setting-hint">Extract IDs from URLs</span>
          </div>
          <div class="setting-control">
            <div class="tracker-buttons">
              <button
                v-for="tracker in issueTrackers"
                :key="tracker.value"
                :class="['tracker-btn', form.issueUrlPattern === tracker.value && 'active']"
                @click="form.issueUrlPattern = tracker.value"
              >{{ tracker.name }}</button>
            </div>
          </div>
        </div>

        <div v-if="form.issueUrlPattern === 'custom'" class="setting-row">
          <div class="setting-label">
            Custom Pattern
            <span class="setting-hint">Regex with capture group</span>
          </div>
          <div class="setting-control">
            <input v-model="form.customIssuePattern" type="text" class="input-text" placeholder="/ticket/(\d+)" />
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════
           SECTION: Data
           ═══════════════════════════════════════════════════════════════ -->
      <div class="section">
        <div class="section-header">Data</div>

        <div class="setting-row">
          <div class="setting-label">
            Export Backup
            <span class="setting-hint">Download .json file</span>
          </div>
          <div class="setting-control">
            <RButton size="small" @click="exportDatabase">Export</RButton>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            Import Backup
            <span class="setting-hint">Restore from .json (replaces data)</span>
          </div>
          <div class="setting-control">
            <RButton size="small" @click="showImportConfirm = true">Import</RButton>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════
           SECTION: Danger Zone (visually separated)
           ═══════════════════════════════════════════════════════════════ -->
      <div class="section danger-section">
        <div class="section-header danger-header">Danger Zone</div>

        <div class="setting-row">
          <div class="setting-label">
            Wipe Database
            <span class="setting-hint">Delete all issues and time entries</span>
          </div>
          <div class="setting-control">
            <RButton size="small" color="error" @click="showWipeConfirm = true">Wipe</RButton>
          </div>
        </div>
      </div>
    </RCard>

    <!-- Import Confirmation Dialog -->
    <RDialog v-model:open="showImportConfirm">
      <template #title>Import Database?</template>
      <RText>
        This will replace ALL current data with the imported backup.
        Any unsaved changes will be lost. This cannot be undone.
      </RText>
      <RSpace class="modal-actions">
        <RButton @click="showImportConfirm = false">Cancel</RButton>
        <RButton color="warning" filled @click="importDatabase" :disabled="isImporting">
          {{ isImporting ? 'Importing...' : 'Import' }}
        </RButton>
      </RSpace>
    </RDialog>

    <!-- Wipe Confirmation Dialog -->
    <RDialog v-model:open="showWipeConfirm">
      <template #title>Wipe Database?</template>
      <RText>
        This will permanently delete ALL issues and time entries in this project.
        This action cannot be undone.
      </RText>
      <RSpace class="modal-actions">
        <RButton @click="showWipeConfirm = false">Cancel</RButton>
        <RButton color="error" filled @click="wipeDatabase" :disabled="isWiping">
          {{ isWiping ? 'Wiping...' : 'Delete Everything' }}
        </RButton>
      </RSpace>
    </RDialog>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════
   Settings View - Same container model as Track/History
   ═══════════════════════════════════════════════════════════════ */

.settings-view {
  margin-top: 1rem;
}

/* ═══════════════════════════════════════════════════════════════
   Card Header (matches IssueList/HistoryView)
   ═══════════════════════════════════════════════════════════════ */

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.card-title {
  font-weight: 600;
  font-size: 1.1rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.save-message {
  font-size: 0.85rem;
}

.save-message.success {
  color: var(--color-success);
}

.save-message.error {
  color: var(--color-error);
}

/* ═══════════════════════════════════════════════════════════════
   Sections (like day groups in History)
   ═══════════════════════════════════════════════════════════════ */

.section {
  padding: 0.5rem 0;
}

.section:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.section-header {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  padding: 0.5rem 0;
  margin-bottom: 0.25rem;
}

/* Danger section styling */
.danger-section {
  background: var(--color-bg-secondary);
  margin: 0 -1rem;
  padding: 0.5rem 1rem;
  margin-top: 0.5rem;
}

.danger-header {
  color: var(--color-error);
}

/* ═══════════════════════════════════════════════════════════════
   Setting Rows - Two column grid: label | control
   ═══════════════════════════════════════════════════════════════ */

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  min-height: 2.5rem;
}

.setting-label {
  flex: 1;
  font-size: 0.9rem;
  color: var(--color-text);
}

.setting-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: normal;
  margin-top: 0.125rem;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* ═══════════════════════════════════════════════════════════════
   Input Elements
   ═══════════════════════════════════════════════════════════════ */

.input-number {
  width: 70px;
  padding: 0.35rem 0.5rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.9rem;
  text-align: right;
}

.input-number.input-wide {
  width: 100px;
}

.input-number:focus {
  outline: none;
  border-color: var(--color-accent);
}

.input-unit {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  min-width: 35px;
}

.input-select {
  padding: 0.35rem 0.5rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.85rem;
  min-width: 140px;
}

.input-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.input-text {
  width: 160px;
  padding: 0.35rem 0.5rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.85rem;
}

.input-text:focus {
  outline: none;
  border-color: var(--color-accent);
}

/* ═══════════════════════════════════════════════════════════════
   Segmented Control
   ═══════════════════════════════════════════════════════════════ */

.segmented-control {
  display: flex;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}

.segment {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  font-family: inherit;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.segment:not(:last-child) {
  border-right: 1px solid var(--color-border);
}

.segment:hover {
  background: var(--color-bg-secondary);
}

.segment.active {
  background: var(--color-accent);
  color: var(--color-bg);
}

/* ═══════════════════════════════════════════════════════════════
   Tracker Buttons (radio-style)
   ═══════════════════════════════════════════════════════════════ */

.tracker-buttons {
  display: flex;
  gap: 0.25rem;
}

.tracker-btn {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  font-family: inherit;
  background: transparent;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s ease;
}

.tracker-btn:hover {
  opacity: 0.8;
}

.tracker-btn.active {
  opacity: 1;
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-bg);
}

/* ═══════════════════════════════════════════════════════════════
   Modal
   ═══════════════════════════════════════════════════════════════ */

.modal-actions {
  margin-top: 1rem;
  justify-content: flex-end;
}
</style>
