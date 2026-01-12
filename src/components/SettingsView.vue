<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings.store'

const settingsStore = useSettingsStore()

// Local form state
const form = ref({
  dailyTargetHours: 8,
  monthlyTargetHours: 160,
  hourlyRate: 18.67,
  currency: 'GBP',
  currencySymbol: '£',
  idleThresholdMinutes: 10,
  idleIndicatorSeconds: 30,
  issueUrlPattern: 'gitlab' as 'gitlab' | 'github' | 'jira' | 'custom',
  customIssuePattern: '',
  theme: 'light' as 'light' | 'dark' | 'system'
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

const issueTrackers = [
  { value: 'gitlab', name: 'GitLab', example: 'https://gitlab.com/.../issues/123' },
  { value: 'github', name: 'GitHub', example: 'https://github.com/.../issues/123' },
  { value: 'jira', name: 'Jira', example: 'https://company.atlassian.net/browse/PROJ-123' },
  { value: 'custom', name: 'Custom Pattern', example: 'Define your own regex' }
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
    idleIndicatorSeconds: s.idleIndicatorSeconds,
    issueUrlPattern: s.issueUrlPattern,
    customIssuePattern: s.customIssuePattern || '',
    theme: s.theme
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
      idleIndicatorSeconds: form.value.idleIndicatorSeconds,
      issueUrlPattern: form.value.issueUrlPattern,
      customIssuePattern: form.value.customIssuePattern || undefined,
      theme: form.value.theme
    })
    saveMessage.value = 'Settings saved!'
    setTimeout(() => { saveMessage.value = '' }, 2000)
  } catch (err) {
    saveMessage.value = 'Error saving settings'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Work Hours -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Work Hours</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Daily Target (hours)
          </label>
          <input
            v-model.number="form.dailyTargetHours"
            type="number"
            min="1"
            max="24"
            step="0.5"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Hours per day for progress bar</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Monthly Target (hours)
          </label>
          <input
            v-model.number="form.monthlyTargetHours"
            type="number"
            min="1"
            max="744"
            step="1"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Total hours per month (e.g., 160 for full-time)</p>
        </div>
      </div>
    </div>

    <!-- Appearance -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Appearance</h3>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Theme
        </label>
        <div class="flex gap-2">
          <button
            @click="form.theme = 'light'"
            :class="[
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border transition-colors',
              form.theme === 'light'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
            ]"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Light
          </button>
          <button
            @click="form.theme = 'dark'"
            :class="[
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border transition-colors',
              form.theme === 'dark'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
            ]"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            Dark
          </button>
          <button
            @click="form.theme = 'system'"
            :class="[
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border transition-colors',
              form.theme === 'system'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
            ]"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            System
          </button>
        </div>
      </div>
    </div>

    <!-- Earnings -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Earnings</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Hourly Rate
          </label>
          <input
            v-model.number="form.hourlyRate"
            type="number"
            min="0"
            step="0.01"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Currency
          </label>
          <select
            v-model="form.currency"
            @change="onCurrencyChange"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option v-for="c in currencies" :key="c.code" :value="c.code">
              {{ c.symbol }} - {{ c.name }} ({{ c.code }})
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Idle Detection -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Idle Detection</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Auto-pause after (minutes)
          </label>
          <input
            v-model.number="form.idleThresholdMinutes"
            type="number"
            min="1"
            max="60"
            step="1"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Tracking pauses after this idle time</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Show idle warning after (seconds)
          </label>
          <input
            v-model.number="form.idleIndicatorSeconds"
            type="number"
            min="5"
            max="300"
            step="5"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Orange indicator appears after this time</p>
        </div>
      </div>
    </div>

    <!-- Issue Tracker -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Issue Tracker</h3>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Issue Tracker Type
          </label>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button
              v-for="tracker in issueTrackers"
              :key="tracker.value"
              @click="form.issueUrlPattern = tracker.value as any"
              :class="[
                'px-4 py-2 text-sm font-medium rounded-md border transition-colors',
                form.issueUrlPattern === tracker.value
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              ]"
            >
              {{ tracker.name }}
            </button>
          </div>
        </div>

        <div v-if="form.issueUrlPattern !== 'custom'" class="text-sm text-gray-500 dark:text-gray-400">
          Example URL: {{ issueTrackers.find(t => t.value === form.issueUrlPattern)?.example }}
        </div>

        <div v-if="form.issueUrlPattern === 'custom'">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Custom Regex Pattern
          </label>
          <input
            v-model="form.customIssuePattern"
            type="text"
            placeholder="e.g., /ticket/(\d+)"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Regex to extract issue ID from URL. Use a capture group for the ID.
          </p>
        </div>
      </div>
    </div>

    <!-- Save Button -->
    <div class="flex items-center justify-end gap-4">
      <span v-if="saveMessage" :class="saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'" class="text-sm">
        {{ saveMessage }}
      </span>
      <button
        @click="saveSettings"
        :disabled="isSaving"
        class="px-6 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors disabled:opacity-50"
      >
        {{ isSaving ? 'Saving...' : 'Save Settings' }}
      </button>
    </div>
  </div>
</template>
