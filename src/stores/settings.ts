import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ReplaceRule {
  from: string
  to: string
}

const DEFAULT_RULES: ReplaceRule[] = [
  { from: '搵', to: '稳' },
  { from: '㗎', to: '嘅' },
  { from: '吓', to: '下' },
  { from: '喇', to: '啦' },
  { from: '碌', to: '刷' },
  { from: '噉', to: '咁' },
]

const STORAGE_KEY = 'copywriting-replace-rules'

export const useSettingsStore = defineStore('settings', () => {
  const replaceRules = ref<ReplaceRule[]>(loadRules())
  const cantoneseApiKey = ref('')
  const cantoneseMode = ref<'api' | 'dictionary'>('dictionary')

  function loadRules(): ReplaceRule[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : [...DEFAULT_RULES]
    } catch {
      return [...DEFAULT_RULES]
    }
  }

  function saveRules() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(replaceRules.value))
  }

  function addRule(from: string, to: string) {
    replaceRules.value.push({ from, to })
    saveRules()
  }

  function removeRule(index: number) {
    replaceRules.value.splice(index, 1)
    saveRules()
  }

  function resetRules() {
    replaceRules.value = [...DEFAULT_RULES]
    saveRules()
  }

  function applyReplaceRules(text: string): { result: string; count: number } {
    let result = text
    let count = 0
    for (const rule of replaceRules.value) {
      const occurrences = result.split(rule.from).length - 1
      count += occurrences
      result = result.split(rule.from).join(rule.to)
    }
    return { result, count }
  }

  return {
    replaceRules,
    cantoneseApiKey,
    cantoneseMode,
    addRule,
    removeRule,
    resetRules,
    applyReplaceRules,
  }
})
