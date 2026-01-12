<script setup lang="ts">
import { ref } from 'vue'
import { useIssuesStore } from '../stores/issues.store'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'

const issuesStore = useIssuesStore()
const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()

const link = ref('')
const name = ref('')
const isSubmitting = ref(false)

async function handleSubmit() {
  const url = link.value.trim()
  const issueName = name.value.trim()

  if (!url || !issueName) return

  const issueId = settingsStore.extractIssueId(url)
  if (!issueId) {
    alert('Could not extract issue ID from URL. Check your issue tracker settings.')
    return
  }

  isSubmitting.value = true
  try {
    const newIssue = await issuesStore.createIssue(
      issueId,
      issueName,
      url
    )
    // Auto-start tracking the new issue
    await trackerStore.startTracking(newIssue.id)
    link.value = ''
    name.value = ''
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
    <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Add New Issue</h2>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Issue URL
        </label>
        <input
          v-model="link"
          type="url"
          placeholder="Paste issue URL from your tracker"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name
        </label>
        <input
          v-model="name"
          type="text"
          placeholder="Issue description"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        />
      </div>
    </div>

    <div class="mt-4 flex justify-end">
      <button
        type="submit"
        :disabled="isSubmitting || !link.trim() || !name.trim()"
        class="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ isSubmitting ? 'Adding...' : 'Add Issue' }}
      </button>
    </div>
  </form>
</template>
