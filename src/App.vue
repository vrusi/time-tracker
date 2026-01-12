<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTrackerStore } from './stores/tracker.store'
import { useIssuesStore } from './stores/issues.store'
import TrackerStatus from './components/TrackerStatus.vue'
import IssueList from './components/IssueList.vue'
import IssueForm from './components/IssueForm.vue'
import HistoryView from './components/HistoryView.vue'
import ExportDialog from './components/ExportDialog.vue'

const trackerStore = useTrackerStore()
const issuesStore = useIssuesStore()

const activeTab = ref<'issues' | 'history'>('issues')
const showExportDialog = ref(false)

onMounted(async () => {
  await issuesStore.loadIssues()
  await trackerStore.loadCurrentTracking()
  trackerStore.setupListeners()
})
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header with tracker status -->
    <header class="bg-white shadow-sm border-b">
      <div class="max-w-4xl mx-auto px-4 py-3">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold text-gray-900">Time Tracker</h1>
          <TrackerStatus />
        </div>
      </div>
    </header>

    <!-- Navigation -->
    <nav class="bg-white border-b">
      <div class="max-w-4xl mx-auto px-4">
        <div class="flex space-x-4">
          <button
            @click="activeTab = 'issues'"
            :class="[
              'px-4 py-3 text-sm font-medium border-b-2 -mb-px',
              activeTab === 'issues'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            ]"
          >
            Issues
          </button>
          <button
            @click="activeTab = 'history'"
            :class="[
              'px-4 py-3 text-sm font-medium border-b-2 -mb-px',
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            ]"
          >
            History
          </button>
          <div class="flex-1" />
          <button
            @click="showExportDialog = true"
            class="px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Export
          </button>
        </div>
      </div>
    </nav>

    <!-- Main content -->
    <main class="max-w-4xl mx-auto px-4 py-6">
      <template v-if="activeTab === 'issues'">
        <IssueForm class="mb-6" />
        <IssueList />
      </template>

      <template v-else-if="activeTab === 'history'">
        <HistoryView />
      </template>
    </main>

    <!-- Export dialog -->
    <ExportDialog
      v-if="showExportDialog"
      @close="showExportDialog = false"
    />
  </div>
</template>
