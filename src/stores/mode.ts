import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { AppMode } from '@/types/mode'

const MODE_KEY = 'copywriting-app-mode'

export const useModeStore = defineStore('mode', () => {
  const currentMode = ref<AppMode>(loadMode())

  function loadMode(): AppMode {
    try {
      const val = localStorage.getItem(MODE_KEY)
      if (val === 'unique' || val === 'creator' || val === 'basic') return val
    } catch {}
    return 'basic'
  }

  function saveMode() {
    localStorage.setItem(MODE_KEY, currentMode.value)
  }

  function switchMode(mode: AppMode) {
    if (currentMode.value === mode) return
    currentMode.value = mode
    saveMode()
  }

  // 自动持久化
  watch(currentMode, saveMode)

  return {
    currentMode,
    switchMode
  }
})
