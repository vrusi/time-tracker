<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTrackerStore } from './stores/tracker.store'
import { useIssuesStore } from './stores/issues.store'
import { useSettingsStore } from './stores/settings.store'
import TrackerStatus from './components/TrackerStatus.vue'
import IssueList from './components/IssueList.vue'
import IssueForm from './components/IssueForm.vue'
import HistoryView from './components/HistoryView.vue'
import ExportDialog from './components/ExportDialog.vue'
import ProgressBars from './components/ProgressBars.vue'
import CalendarView from './components/CalendarView.vue'
import SettingsView from './components/SettingsView.vue'

const trackerStore = useTrackerStore()
const issuesStore = useIssuesStore()
const settingsStore = useSettingsStore()

const activeTab = ref<'issues' | 'history' | 'settings'>('issues')
const historyView = ref<'list' | 'calendar'>('list')
const showExportDialog = ref(false)

onMounted(async () => {
  await settingsStore.loadSettings()
  await issuesStore.loadIssues()
  await trackerStore.loadCurrentTracking()
  trackerStore.setupListeners()
})
</script>

<template>
  <div class="min-h-screen bg-gray-100 dark:bg-gray-900">
    <!-- Header with tracker status -->
    <header class="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
      <div class="max-w-4xl mx-auto px-4 py-3">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Time Tracker</h1>
          <TrackerStatus />
        </div>
      </div>
    </header>

    <!-- Navigation -->
    <nav class="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
      <div class="max-w-4xl mx-auto px-4">
        <div class="flex space-x-4">
          <button
            @click="activeTab = 'issues'"
            :class="[
              'px-4 py-3 text-sm font-medium border-b-2 -mb-px',
              activeTab === 'issues'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            ]"
          >
            Issues
          </button>
          <button
            @click="activeTab = 'history'"
            :class="[
              'px-4 py-3 text-sm font-medium border-b-2 -mb-px',
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            ]"
          >
            History
          </button>
          <button
            @click="activeTab = 'settings'"
            :class="[
              'px-4 py-3 text-sm font-medium border-b-2 -mb-px',
              activeTab === 'settings'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            ]"
          >
            Settings
          </button>
          <div class="flex-1" />
          <button
            @click="showExportDialog = true"
            class="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Export
          </button>
        </div>
      </div>
    </nav>

    <!-- Main content -->
    <main class="max-w-4xl mx-auto px-4 py-6">
      <!-- Progress bars -->
      <ProgressBars class="mb-6" />

      <template v-if="activeTab === 'issues'">
        <IssueForm class="mb-6" />
        <IssueList />
      </template>

      <template v-else-if="activeTab === 'history'">
        <!-- View toggle -->
        <div class="flex justify-end mb-4">
          <div class="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
            <button
              @click="historyView = 'list'"
              :class="[
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                historyView === 'list'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              ]"
            >
              List
            </button>
            <button
              @click="historyView = 'calendar'"
              :class="[
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                historyView === 'calendar'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              ]"
            >
              Calendar
            </button>
          </div>
        </div>

        <HistoryView v-if="historyView === 'list'" />
        <CalendarView v-else />
      </template>

      <template v-else-if="activeTab === 'settings'">
        <SettingsView />
      </template>
    </main>

    <!-- Export dialog -->
    <ExportDialog
      v-if="showExportDialog"
      @close="showExportDialog = false"
    />
  </div>
</template>
