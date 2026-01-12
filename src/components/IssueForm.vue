<script setup lang="ts">
import { ref } from 'vue'
import { useIssuesStore } from '../stores/issues.store'

const issuesStore = useIssuesStore()

const externalId = ref('')
const name = ref('')
const link = ref('')
const isSubmitting = ref(false)

async function handleSubmit() {
  if (!externalId.value.trim() || !name.value.trim()) return

  isSubmitting.value = true
  try {
    await issuesStore.createIssue(
      externalId.value.trim(),
      name.value.trim(),
      link.value.trim() || null
    )
    externalId.value = ''
    name.value = ''
    link.value = ''
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="bg-white rounded-lg shadow p-4">
    <h2 class="text-lg font-medium text-gray-900 mb-4">Add New Issue</h2>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Issue ID
        </label>
        <input
          v-model="externalId"
          type="text"
          placeholder="e.g. #1234"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Name
        </label>
        <input
          v-model="name"
          type="text"
          placeholder="Issue description"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Link (optional)
        </label>
        <input
          v-model="link"
          type="url"
          placeholder="https://gitlab.com/..."
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>

    <div class="mt-4 flex justify-end">
      <button
        type="submit"
        :disabled="isSubmitting || !externalId.trim() || !name.trim()"
        class="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ isSubmitting ? 'Adding...' : 'Add Issue' }}
      </button>
    </div>
  </form>
</template>
