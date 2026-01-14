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
  customIssuePattern: '',
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
    customIssuePattern: s.customIssuePattern || '',
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
      customIssuePattern: form.value.customIssuePattern || undefined,
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
  <RSpace vertical>
    <!-- Work Hours -->
    <RCard>
      <template #title><RText>Work Hours</RText></template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RFormItem label="Daily Target (hours)">
          <input
            v-model.number="form.dailyTargetHours"
            type="number"
            min="1"
            max="24"
            step="0.5"
            class="settings-input"
          />
          <RText size="small" class="text-secondary mt-1 block">Hours per day for progress bar</RText>
        </RFormItem>

        <RFormItem label="Monthly Target (hours)">
          <input
            v-model.number="form.monthlyTargetHours"
            type="number"
            min="1"
            max="744"
            step="1"
            class="settings-input"
          />
          <RText size="small" class="text-secondary mt-1 block">Total hours per month</RText>
        </RFormItem>
      </div>
    </RCard>

    <!-- Appearance -->
    <RCard>
      <template #title><RText>Appearance</RText></template>

      <RFormItem label="Theme">
        <RSpace>
          <RButton
            :filled="form.theme === 'light'"
            @click="form.theme = 'light'"
          >
            Light
          </RButton>
          <RButton
            :filled="form.theme === 'dark'"
            @click="form.theme = 'dark'"
          >
            Dark
          </RButton>
          <RButton
            :filled="form.theme === 'system'"
            @click="form.theme = 'system'"
          >
            System
          </RButton>
        </RSpace>
      </RFormItem>

      <RSpace justify="between" align="center" class="mt-4 pt-4 border-t border-color">
        <div>
          <RText>Desktop Notifications</RText>
          <RText size="small" class="text-secondary block">Show notifications for idle pauses and daily target</RText>
        </div>
        <RSwitch v-model="form.notificationsEnabled" />
      </RSpace>
    </RCard>

    <!-- Earnings -->
    <RCard>
      <template #title><RText>Earnings</RText></template>

      <RSpace justify="between" align="center" class="mb-4">
        <div>
          <RText>Show Earnings Widget</RText>
          <RText size="small" class="text-secondary block">Display earnings on the main screen</RText>
        </div>
        <RSwitch v-model="form.showEarnings" />
      </RSpace>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RFormItem label="Hourly Rate">
          <input
            v-model.number="form.hourlyRate"
            type="number"
            min="0"
            step="0.01"
            class="settings-input"
          />
        </RFormItem>

        <RFormItem label="Currency">
          <select
            v-model="form.currency"
            @change="onCurrencyChange"
            class="settings-select"
          >
            <option v-for="c in currencies" :key="c.code" :value="c.code">
              {{ c.symbol }} - {{ c.name }}
            </option>
          </select>
        </RFormItem>
      </div>
    </RCard>

    <!-- Idle Detection -->
    <RCard>
      <template #title><RText>Idle Detection</RText></template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="settings-field">
          <label class="settings-label">Auto-pause threshold (minutes)</label>
          <input
            v-model.number="form.idleThresholdMinutes"
            type="number"
            min="1"
            max="60"
            step="1"
            class="settings-input"
          />
          <RText size="small" class="text-secondary mt-1 block">Pause tracking after being idle for this long</RText>
        </div>

        <div class="settings-field">
          <label class="settings-label">Warning indicator (minutes)</label>
          <input
            v-model.number="form.idleIndicatorMinutes"
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            class="settings-input"
          />
          <RText size="small" class="text-secondary mt-1 block">Show warning after this many minutes of inactivity</RText>
        </div>
      </div>
    </RCard>

    <!-- Issue Tracker -->
    <RCard>
      <template #title><RText>Issue Tracker</RText></template>

      <RFormItem label="Issue Tracker Type">
        <RSpace wrap>
          <RButton
            v-for="tracker in issueTrackers"
            :key="tracker.value"
            :filled="form.issueUrlPattern === tracker.value"
            @click="form.issueUrlPattern = tracker.value"
          >
            {{ tracker.name }}
          </RButton>
        </RSpace>
      </RFormItem>

      <RText v-if="form.issueUrlPattern !== 'custom'" size="small" class="text-secondary mt-2">
        Example URL: {{ issueTrackers.find(t => t.value === form.issueUrlPattern)?.example }}
      </RText>

      <RFormItem v-if="form.issueUrlPattern === 'custom'" label="Custom Regex Pattern" class="mt-4">
        <RInput
          v-model="form.customIssuePattern"
          placeholder="e.g., /ticket/(\d+)"
        />
        <RText size="small" class="text-secondary mt-1">
          Regex to extract issue ID from URL. Use a capture group for the ID.
        </RText>
      </RFormItem>
    </RCard>

    <!-- Backup & Restore -->
    <RCard>
      <template #title><RText>Backup & Restore</RText></template>

      <RSpace vertical>
        <RSpace justify="between" align="center">
          <div>
            <RText>Export Database</RText>
            <RText size="small" class="text-secondary block">
              Save a backup of this project's data
            </RText>
          </div>
          <RButton @click="exportDatabase">
            Export
          </RButton>
        </RSpace>

        <RSpace justify="between" align="center" class="pt-4 border-t border-color">
          <div>
            <RText>Import Database</RText>
            <RText size="small" class="text-secondary block">
              Restore from a backup file (replaces current data)
            </RText>
          </div>
          <RButton @click="showImportConfirm = true">
            Import
          </RButton>
        </RSpace>
      </RSpace>
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

    <!-- Danger Zone -->
    <RCard class="danger-zone">
      <template #title><RText class="text-danger">Danger Zone</RText></template>

      <RSpace justify="between" align="center">
        <div>
          <RText>Wipe Database</RText>
          <RText size="small" class="text-secondary block">
            Permanently delete all issues and time entries in this project
          </RText>
        </div>
        <RButton color="error" @click="showWipeConfirm = true">
          Wipe Database
        </RButton>
      </RSpace>
    </RCard>

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

    <!-- Save Button -->
    <RSpace justify="end" align="center">
      <RText v-if="saveMessage" :class="saveMessage.includes('Error') ? 'text-danger' : 'text-success'">
        {{ saveMessage }}
      </RText>
      <RButton
        filled
        @click="saveSettings"
        :loading="isSaving"
      >
        {{ isSaving ? 'Saving...' : 'Save Settings' }}
      </RButton>
    </RSpace>
  </RSpace>
</template>

<style scoped>
.text-secondary {
  color: var(--color-text-secondary);
}

.text-success {
  color: var(--color-success);
}

.text-danger {
  color: var(--color-danger);
}

.border-color {
  border-color: var(--color-border);
}

.settings-input,
.settings-select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
}

.settings-input:focus,
.settings-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.settings-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
}

.danger-zone {
  border-color: var(--color-error, #dc2626);
}

.modal-actions {
  margin-top: 1rem;
  justify-content: flex-end;
}
</style>
