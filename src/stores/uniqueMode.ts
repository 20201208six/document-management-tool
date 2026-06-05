import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** 平台账号信息 */
export interface PlatformAccount {
  platform: string
  accountName: string
  followers: number
  avgViews: number
  avgLikes: number
  recentTrend: 'up' | 'down' | 'stable'
  topTags: string[]
}

/** 用户画像 */
export interface UserProfile {
  ageGroup: string
  genderRatio: string
  interests: string[]
  activeHours: string
  contentPreference: string[]
}

/** 文案分析结果 */
export interface CopywritingAnalysis {
  openingScore: number      // 开头吸引力 0-100
  openingFeedback: string
  logicScore: number         // 中间逻辑 0-100
  logicFeedback: string
  endingScore: number        // 结尾收束 0-100
  endingFeedback: string
  toneScore: number          // 语气适配 0-100
  toneFeedback: string
  viralElements: string[]
  suggestions: string[]
}

/** 独特模式对话消息 */
export interface UniqueMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  analysis?: CopywritingAnalysis
  timestamp: string
}

/** 文案建议 */
export interface CopywritingSuggestion {
  id: string
  title: string
  content: string
  estimatedTraffic: string
  platform: string
  highlight: string
}

const ACCOUNT_KEY = 'unique-mode-account'
const MESSAGES_KEY = 'unique-mode-messages'

export const useUniqueModeStore = defineStore('uniqueMode', () => {
  // ===== 账号管理 =====
  const accountName = ref(loadAccount())
  const isLoadingAccount = ref(false)
  const platformAccounts = ref<PlatformAccount[]>([])
  const userProfile = ref<UserProfile | null>(null)

  function loadAccount(): string {
    try {
      return localStorage.getItem(ACCOUNT_KEY) || ''
    } catch { return '' }
  }

  function saveAccount() {
    localStorage.setItem(ACCOUNT_KEY, accountName.value)
  }

  function setAccount(name: string) {
    accountName.value = name
    saveAccount()
  }

  /** 模拟跨平台搜索账号 */
  async function searchAccount(name: string): Promise<void> {
    isLoadingAccount.value = true
    setAccount(name)

    // 模拟搜索延迟
    await new Promise(r => setTimeout(r, 800))

    platformAccounts.value = [
      { platform: '抖音', accountName: name, followers: 125000, avgViews: 85000, avgLikes: 4200, recentTrend: 'up', topTags: ['文案', '情感', '生活'] },
      { platform: '小红书', accountName: name, followers: 68000, avgViews: 45000, avgLikes: 3200, recentTrend: 'stable', topTags: ['文案', '治愈', '成长'] },
      { platform: '快手', accountName: name, followers: 92000, avgViews: 62000, avgLikes: 2800, recentTrend: 'down', topTags: ['文案', '励志', '情感'] }
    ]

    userProfile.value = {
      ageGroup: '18-35岁',
      genderRatio: '女性 62% / 男性 38%',
      interests: ['情感文案', '治愈系内容', '个人成长', '生活记录'],
      activeHours: '晚间 20:00-23:00',
      contentPreference: ['短文案', '图文结合', '故事型内容']
    }

    isLoadingAccount.value = false
  }

  // ===== 对话管理 =====
  const messages = ref<UniqueMessage[]>(loadMessages())

  function loadMessages(): UniqueMessage[] {
    try {
      const data = localStorage.getItem(MESSAGES_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function saveMessages() {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.value))
  }

  function addMessage(role: 'user' | 'assistant' | 'system', content: string, analysis?: CopywritingAnalysis) {
    const msg: UniqueMessage = {
      id: 'umsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      role,
      content,
      analysis,
      timestamp: new Date().toLocaleString('zh-CN')
    }
    messages.value.push(msg)
    saveMessages()
    return msg
  }

  function clearMessages() {
    messages.value = []
    saveMessages()
  }

  /** 获取对话历史文本（用于 AI 上下文） */
  const conversationHistory = computed(() => {
    return messages.value.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n')
  })

  // ===== 文案建议 =====
  const suggestions = ref<CopywritingSuggestion[]>([])
  const isGeneratingSuggestion = ref(false)

  async function generateSuggestions(): Promise<void> {
    isGeneratingSuggestion.value = true
    await new Promise(r => setTimeout(r, 1200))

    suggestions.value = [
      {
        id: 'sug_1',
        title: '情绪共鸣型开头',
        content: '你有没有发现，那些真正打动人心的文案，从来不讲道理，只讲感受...',
        estimatedTraffic: '预计提升 30%-45%',
        platform: '抖音/小红书',
        highlight: '情绪切入，高完播率'
      },
      {
        id: 'sug_2',
        title: '悬念反转型文案',
        content: '我以为我什么都懂了，直到昨天看到这句话...',
        estimatedTraffic: '预计提升 20%-35%',
        platform: '抖音/快手',
        highlight: '强悬念，提升停留时长'
      }
    ]
    isGeneratingSuggestion.value = false
  }

  // ===== 分析状态 =====
  const isAnalyzing = ref(false)

  return {
    // 账号
    accountName,
    isLoadingAccount,
    platformAccounts,
    userProfile,
    setAccount,
    searchAccount,

    // 对话
    messages,
    conversationHistory,
    addMessage,
    clearMessages,

    // 建议
    suggestions,
    isGeneratingSuggestion,
    generateSuggestions,

    // 分析
    isAnalyzing
  }
})
