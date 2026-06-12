import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatSession, ChatMessage, AIModel, WebSearchContext, DocumentContext, ChatFolder } from '@/types/chat'
import { DEFAULT_DEEPSEEK_MODEL } from '@/types/chat'
import { generateId, sendChatMessageStream, performWebSearch, analyzeFileContent } from '@/services/deepseek'
import { ElMessage } from 'element-plus'
import { useChatFavoritesStore } from './chatFavorites'

const STORAGE_KEY = 'copywriting-chat-history'
const MODELS_KEY = 'copywriting-chat-models'
const FOLDERS_KEY = 'copywriting-chat-folders'

export const useChatStore = defineStore('chat', () => {
  // ===== 会话管理 =====
  const sessions = ref<ChatSession[]>(loadSessions())
  const currentSessionId = ref<string | null>(null)
  const isPanelOpen = ref(loadPanelOpenState())

  function loadSessions(): ChatSession[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) return []
      const sessions: ChatSession[] = JSON.parse(data)
      // 迁移旧数据：补充 pinned / folderId 字段
      let migrated = false
      for (const s of sessions) {
        if (s.pinned === undefined) { s.pinned = false; migrated = true }
        if (s.folderId === undefined) { s.folderId = null; migrated = true }
      }
      if (migrated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
      }
      return sessions
    } catch {
      return []
    }
  }

  function saveSessions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.value))
  }

  /** 获取当前会话 */
  const currentSession = computed<ChatSession | null>(() => {
    if (!currentSessionId.value) return null
    return sessions.value.find(s => s.id === currentSessionId.value) || null
  })

  /** 获取当前消息列表 */
  const messages = computed<ChatMessage[]>(() => {
    return currentSession.value?.messages || []
  })

  /** 获取或创建会话 */
  function getOrCreateSession(filePath: string | null): ChatSession {
    // 如果有关联文件，查找该文件的会话
    if (filePath) {
      const existing = sessions.value.find(s => s.filePath === filePath)
      if (existing) {
        currentSessionId.value = existing.id
        return existing
      }
    }
    // 如果当前有会话且无文件关联，复用
    if (currentSessionId.value) {
      const existing = sessions.value.find(s => s.id === currentSessionId.value)
      if (existing && !existing.filePath && !filePath) return existing
    }
    // 创建新会话
    const session: ChatSession = {
      id: 'session_' + Date.now(),
      filePath,
      title: filePath ? `文档对话 - ${filePath.split(/[/\\]/).pop()}` : '新对话',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      folderId: null
    }
    sessions.value.push(session)
    currentSessionId.value = session.id
    saveSessions()
    return session
  }

  /** 切换会话 */
  function switchSession(sessionId: string) {
    currentSessionId.value = sessionId
  }

  /** 删除会话 */
  function deleteSession(sessionId: string) {
    sessions.value = sessions.value.filter(s => s.id !== sessionId)
    if (currentSessionId.value === sessionId) {
      currentSessionId.value = sessions.value[0]?.id || null
    }
    saveSessions()
  }

  /** 切换会话置顶 */
  function togglePinSession(sessionId: string) {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      session.pinned = !session.pinned
      saveSessions()
    }
  }

  // ===== 文件夹管理 =====

  const folders = ref<ChatFolder[]>(loadFolders())

  function loadFolders(): ChatFolder[] {
    try {
      const data = localStorage.getItem(FOLDERS_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function saveFolders() {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders.value))
  }

  /** 创建文件夹 */
  function createFolder(name: string): ChatFolder {
    const folder: ChatFolder = {
      id: 'folder_' + Date.now(),
      name: name.trim() || '未命名文件夹',
      createdAt: new Date().toISOString()
    }
    folders.value.push(folder)
    saveFolders()
    return folder
  }

  /** 重命名文件夹 */
  function renameFolder(folderId: string, name: string) {
    const folder = folders.value.find(f => f.id === folderId)
    if (folder) {
      folder.name = name.trim() || '未命名文件夹'
      saveFolders()
    }
  }

  /** 删除文件夹（会话回到根目录） */
  function deleteFolder(folderId: string) {
    folders.value = folders.value.filter(f => f.id !== folderId)
    for (const s of sessions.value) {
      if (s.folderId === folderId) s.folderId = null
    }
    saveFolders()
    saveSessions()
  }

  /** 移动对话到文件夹 */
  function moveSessionToFolder(sessionId: string, folderId: string | null) {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      session.folderId = folderId
      saveSessions()
    }
  }

  /** 获取文件夹下的对话数 */
  function getFolderCount(folderId: string): number {
    return sessions.value.filter(s => s.folderId === folderId).length
  }

  // ===== 消息管理 =====

  /** 添加用户消息并返回消息对象 */
  function addUserMessage(content: string, followUpTo: string | null = null): ChatMessage {
    const session = getOrCreateSession(null)
    const msg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      deepThinking: false,
      reasoningContent: '',
      timestamp: new Date().toLocaleString('zh-CN'),
      followUpTo,
      followUpIds: [],
      isFavorited: false,
      isStreaming: false
    }
    session.messages.push(msg)

    // 首条消息自动设为对话标题（截取前30字）
    if (session.messages.filter(m => m.role === 'user').length === 1) {
      const title = content.replace(/\n/g, ' ').trim().substring(0, 30)
      session.title = title || '新对话'
    }

    // 如果是追问，更新父消息的追问链
    if (followUpTo) {
      const parentMsg = session.messages.find(m => m.id === followUpTo)
      if (parentMsg && !parentMsg.followUpIds.includes(msg.id)) {
        parentMsg.followUpIds.push(msg.id)
      }
    }

    session.updatedAt = new Date().toISOString()
    saveSessions()
    return msg
  }

  /** 添加AI回答占位消息 */
  function addAssistantPlaceholder(deepThinking: boolean): ChatMessage {
    const session = currentSession.value
    if (!session) throw new Error('无当前会话')

    const msg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      deepThinking,
      reasoningContent: '',
      timestamp: new Date().toLocaleString('zh-CN'),
      followUpTo: null,
      followUpIds: [],
      isFavorited: false,
      isStreaming: true
    }
    session.messages.push(msg)
    saveSessions()
    return msg
  }

  /** 更新消息内容 */
  function updateMessageContent(messageId: string, content: string) {
    for (const session of sessions.value) {
      const msg = session.messages.find(m => m.id === messageId)
      if (msg) {
        msg.content = content
        msg.isStreaming = false
        msg.isFavorited = useChatFavoritesStore().isFavorited(messageId)
        session.updatedAt = new Date().toISOString()
        saveSessions()
        return
      }
    }
  }

  /** 删除消息 */
  function deleteMessage(messageId: string) {
    for (const session of sessions.value) {
      const idx = session.messages.findIndex(m => m.id === messageId)
      if (idx === -1) continue

      const msg = session.messages[idx]

      // 从追问链中移除
      if (msg.followUpTo) {
        const parent = session.messages.find(m => m.id === msg.followUpTo)
        if (parent) {
          parent.followUpIds = parent.followUpIds.filter(id => id !== messageId)
        }
      }

      // 递归删除追问链上的消息
      const idsToDelete = new Set<string>([messageId])
      function collectFollowUps(mid: string) {
        const m = session.messages.find(x => x.id === mid)
        if (m) {
          for (const fid of m.followUpIds) {
            idsToDelete.add(fid)
            collectFollowUps(fid)
          }
        }
      }
      for (const fid of msg.followUpIds) {
        idsToDelete.add(fid)
        collectFollowUps(fid)
      }

      session.messages = session.messages.filter(m => !idsToDelete.has(m.id))
      session.updatedAt = new Date().toISOString()
      saveSessions()
      return
    }
  }

  /** 清空当前会话 */
  function clearCurrentSession() {
    if (currentSessionId.value) {
      const session = sessions.value.find(s => s.id === currentSessionId.value)
      if (session) {
        session.messages = []
        session.updatedAt = new Date().toISOString()
        saveSessions()
      }
    }
  }

  // ===== 模型管理 =====

  const models = ref<AIModel[]>(loadModels())

  function loadModels(): AIModel[] {
    try {
      const data = localStorage.getItem(MODELS_KEY)
      if (data) {
        const parsed = JSON.parse(data) as AIModel[]
        // 确保默认模型始终存在
        const hasDefault = parsed.some(m => m.id === 'deepseek-default')
        if (!hasDefault) {
          parsed.unshift({ ...DEFAULT_DEEPSEEK_MODEL })
        }
        return parsed
      }
    } catch {}
    return [{ ...DEFAULT_DEEPSEEK_MODEL }]
  }

  function saveModels() {
    localStorage.setItem(MODELS_KEY, JSON.stringify(models.value))
  }

  /** 获取当前活跃模型 */
  const currentModel = computed<AIModel>(() => {
    return models.value.find(m => m.isDefault) || models.value[0]
  })

  /** 切换默认模型 */
  function setDefaultModel(modelId: string) {
    const model = models.value.find(m => m.id === modelId)
    if (!model) return
    // 如果切换模型，检查 API Key
    if (!model.apiKey) {
      ElMessage.warning(`请先为模型「${model.name}」设置 API Key`)
    }
    models.value.forEach(m => m.isDefault = m.id === modelId)
    saveModels()
  }

  /** 添加自定义模型 */
  function addCustomModel(model: Omit<AIModel, 'id' | 'isDefault'>) {
    const newModel: AIModel = {
      ...model,
      id: 'model_' + Date.now(),
      isDefault: false
    }
    models.value.push(newModel)
    saveModels()
    return newModel
  }

  /** 删除模型 */
  function removeModel(modelId: string) {
    if (modelId === 'deepseek-default') {
      ElMessage.warning('不能删除默认模型')
      return
    }
    models.value = models.value.filter(m => m.id !== modelId)
    saveModels()
  }

  /** 更新模型配置 */
  function updateModel(modelId: string, patch: Partial<AIModel>) {
    const model = models.value.find(m => m.id === modelId)
    if (model) {
      Object.assign(model, patch)
      saveModels()
    }
  }

  /** 设置模型的 API Key（同时同步更新 DeepSeek 默认模型的 Key） */
  function setModelApiKey(modelId: string, apiKey: string) {
    const model = models.value.find(m => m.id === modelId)
    if (model) {
      model.apiKey = apiKey
      saveModels()
    }
  }

  /** 模型列表 */
  const modelList = computed(() => models.value)

  // ===== 深度思考 =====
  const deepThinkingEnabled = ref(false)

  function toggleDeepThinking() {
    deepThinkingEnabled.value = !deepThinkingEnabled.value
  }

  // ===== 联网搜索 =====
  const webSearchEnabled = ref(false)
  const isSearching = ref(false)

  function toggleWebSearch() {
    webSearchEnabled.value = !webSearchEnabled.value
  }

  // ===== 文档上下文 =====
  const documentContext = ref<DocumentContext | null>(null)

  function setDocumentContext(context: DocumentContext | null) {
    documentContext.value = context
  }

  function clearDocumentContext() {
    documentContext.value = null
  }

  // ===== 核心：发送消息 =====
  let currentAbortController: AbortController | null = null
  let currentWaitTimer: ReturnType<typeof setInterval> | null = null

  function cancelStream() {
    console.error('[ChatStore] cancelStream 被调用')
    // 第一步：清理等待计时器
    if (currentWaitTimer) {
      clearInterval(currentWaitTimer)
      currentWaitTimer = null
    }
    // 第二步：abort 网络请求
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
    // 第三步：强制立即停止所有流式消息，不依赖 abort 传播
    const session = currentSession.value
    if (session) {
      let changed = false
      for (const msg of session.messages) {
        if (msg.isStreaming) {
          console.error('[ChatStore] 强制停止流式消息:', msg.id)
          msg.isStreaming = false
          msg.reasoningContent = ''
          if (!msg.content) msg.content = '[已停止]'
          changed = true
        }
      }
      if (changed) saveSessions()
    }
  }

  /**
   * 发送消息
   * @param userContent 用户输入内容
   * @param followUpTo 追问的消息ID
   * @param uploadedFileContent 上传文件的内容（可选）
   * @param uploadedFileName 上传文件的名称（可选）
   */
  async function sendMessage(
    userContent: string,
    followUpTo: string | null = null,
    uploadedFileContent?: string,
    uploadedFileName?: string
  ): Promise<void> {
    const model = currentModel.value
    if (!model.apiKey) {
      ElMessage.warning('请先在模型管理中设置 API Key')
      return
    }

    // 构建用户消息内容
    let finalUserContent = userContent
    if (uploadedFileContent && uploadedFileName) {
      finalUserContent = analyzeFileContent(uploadedFileContent, uploadedFileName, userContent)
    }

    // 添加用户消息
    addUserMessage(finalUserContent, followUpTo)
    const session = currentSession.value
    if (!session) return

    // 处理联网搜索
    let webResults: WebSearchContext | undefined
    if (webSearchEnabled.value) {
      isSearching.value = true
      try {
        const results = await performWebSearch(userContent)
        webResults = { enabled: true, query: userContent, results }
      } catch { /* 搜索失败不影响对话 */ }
      isSearching.value = false
    }

    // 准备文档上下文
    let docContextStr: string | undefined
    if (documentContext.value) {
      docContextStr = `[文件: ${documentContext.value.filePath}]\n[段落: ${documentContext.value.description}]\n${documentContext.value.snippet}`
    }

    // 构建发送给 API 的消息历史（限制长度防止上下文爆炸）
    const apiMessageHistory = buildApiMessageHistory(session.messages)

    // 添加 AI 占位消息并缓存其 ID（通过 store 方法更新，确保响应式触发）
    const assistantMsg = addAssistantPlaceholder(deepThinkingEnabled.value)
    const assistantMsgId = assistantMsg.id

    // 发送流式请求
    let fullContent = ''
    let fullReasoning = ''
    currentAbortController = new AbortController()

    // 节流：使用 rAF 批量更新，避免每个 token 都触发渲染
    let rafId = 0
    function flushUpdate() {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const msg = currentSession.value?.messages.find(m => m.id === assistantMsgId)
        if (!msg?.isStreaming) return
        msg.content = fullContent
        msg.reasoningContent = fullReasoning
      })
    }

    // 等待计时器：长时间无数据时提示用户（所有模式均适用）
    let waitedSeconds = 0
    currentWaitTimer = setInterval(() => {
      waitedSeconds++
      if (waitedSeconds <= 3) return
      const msg = currentSession.value?.messages.find(m => m.id === assistantMsgId)
      if (!msg?.isStreaming) return
      const text = deepThinkingEnabled.value
        ? `深度思考分析中，已等待 ${waitedSeconds} 秒，模型正在内部推理...`
        : `等待服务器响应中，已等待 ${waitedSeconds} 秒...`
      msg.content = text
    }, 1000)

    function clearWaitTimer() {
      if (currentWaitTimer) {
        clearInterval(currentWaitTimer)
        currentWaitTimer = null
      }
      // 清除可能残留的等待提示
      if (!fullContent && !fullReasoning) {
        const msg = currentSession.value?.messages.find(m => m.id === assistantMsgId)
        if (msg) msg.content = ''
      }
    }

    try {
      console.error('[ChatStore] 开始调用 sendChatMessageStream, deepThinking=%s', deepThinkingEnabled.value)
      await sendChatMessageStream(
        model,
        apiMessageHistory,
        (chunk: string) => {
          clearWaitTimer()
          fullContent += chunk
          flushUpdate()
        },
        () => {
          // 流自然结束：仅在未被停止时才更新状态
          const msg = currentSession.value?.messages.find(m => m.id === assistantMsgId)
          console.error('[ChatStore] 流结束, isStreaming=%s, contentLen=%d', msg?.isStreaming, fullContent.length)
          clearWaitTimer()
          if (rafId) cancelAnimationFrame(rafId)
          if (!msg?.isStreaming) { currentAbortController = null; return }
          msg.isStreaming = false
          msg.content = fullContent
          msg.reasoningContent = fullReasoning
          msg.isFavorited = useChatFavoritesStore().isFavorited(msg.id)
          saveSessions()
          currentAbortController = null
        },
        (error: Error) => {
          // 流错误：仅在未被停止时才更新状态
          const msg = currentSession.value?.messages.find(m => m.id === assistantMsgId)
          console.error('[ChatStore] 流错误:', error.message)
          clearWaitTimer()
          if (rafId) cancelAnimationFrame(rafId)
          if (!msg?.isStreaming) { currentAbortController = null; return }
          msg.isStreaming = false
          if (!fullContent) {
            msg.content = `[错误] ${error.message}`
          }
          saveSessions()
          currentAbortController = null
        },
        {
          deepThinking: deepThinkingEnabled.value,
          documentContext: docContextStr,
          webSearch: webResults
        },
        currentAbortController.signal,
        (reasoning: string) => {
          clearWaitTimer()
          fullReasoning += reasoning
          flushUpdate()
        }
      )
    } catch (e: any) {
      const msg = currentSession.value?.messages.find(m => m.id === assistantMsgId)
      console.error('[ChatStore] sendMessage 异常:', e.message || e)
      clearWaitTimer()
      if (rafId) cancelAnimationFrame(rafId)
      if (!msg?.isStreaming) return
      msg.isStreaming = false
      if (!fullContent) {
        msg.content = `[错误] ${e.message || '请求失败'}`
      }
      saveSessions()
      currentAbortController = null
    }
  }

  /** 构建 API 消息历史（限制长度，防止上下文爆炸） */
  function buildApiMessageHistory(messages: ChatMessage[]): ChatMessage[] {
    const valid = messages.filter(m => !m.isStreaming)
    // 限制总字符数约 16K tokens（中文字符约1:1），防止上下文过大
    const MAX_CHARS = 16000
    let totalChars = 0
    const result: ChatMessage[] = []
    // 从后往前保留最近消息
    for (let i = valid.length - 1; i >= 0; i--) {
      const msg = valid[i]
      const len = msg.content.length + (msg.reasoningContent?.length || 0)
      if (totalChars + len > MAX_CHARS && result.length > 1) {
        // 保留至少一条用户消息和助手消息
        break
      }
      totalChars += len
      result.unshift(msg)
    }
    return result
  }

  /** 在会话中更新消息 */
  function updateMessageInSession(messageId: string, content: string, isStreaming: boolean = true, reasoningContent?: string) {
    const session = currentSession.value
    if (!session) return
    const msg = session.messages.find(m => m.id === messageId)
    if (msg) {
      msg.content = content
      msg.isStreaming = isStreaming
      if (reasoningContent !== undefined) {
        msg.reasoningContent = reasoningContent
      }
    }
  }

  // ===== 收藏相关 =====
  const chatFavoritesStore = useChatFavoritesStore()

  /** 收藏消息 */
  function favoriteMessage(messageId: string) {
    const session = currentSession.value
    if (!session) return

    const msgIdx = session.messages.findIndex(m => m.id === messageId)
    if (msgIdx === -1) return

    const msg = session.messages[msgIdx]
    // 找到对应的用户问题（向前查找最近的用户消息）
    let question = ''
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (session.messages[i].role === 'user') {
        question = session.messages[i].content
        break
      }
    }

    const favorite = chatFavoritesStore.addFavorite({
      messageId: msg.id,
      sessionId: session.id,
      content: msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''),
      question,
      answer: msg.content,
      filePath: session.filePath,
      modelName: currentModel.value.name
    })

    msg.isFavorited = true
    saveSessions()
    ElMessage.success('已收藏对话')
    return favorite
  }

  /** 取消收藏 */
  function unfavoriteMessage(messageId: string) {
    chatFavoritesStore.removeFavorite(messageId)
    for (const session of sessions.value) {
      const msg = session.messages.find(m => m.id === messageId)
      if (msg) {
        msg.isFavorited = false
        saveSessions()
        break
      }
    }
    ElMessage.success('已取消收藏')
  }

  // ===== 面板控制 =====
  const PANEL_OPEN_KEY = 'copywriting-chat-panel-open'

  function loadPanelOpenState(): boolean {
    try {
      const val = localStorage.getItem(PANEL_OPEN_KEY)
      return val !== null ? val === 'true' : true // 默认打开
    } catch {
      return true
    }
  }

  function savePanelOpenState() {
    localStorage.setItem(PANEL_OPEN_KEY, String(isPanelOpen.value))
  }

  function togglePanel() {
    isPanelOpen.value = !isPanelOpen.value
    savePanelOpenState()
  }

  function openPanel() {
    isPanelOpen.value = true
    savePanelOpenState()
  }

  function closePanel() {
    isPanelOpen.value = false
    savePanelOpenState()
  }

  // ===== 面板宽度（可拖拽调整，持久化） =====
  const PANEL_WIDTH_KEY = 'copywriting-chat-panel-width'
  const panelWidth = ref(loadPanelWidth())

  function loadPanelWidth(): number {
    try {
      const val = localStorage.getItem(PANEL_WIDTH_KEY)
      const num = parseInt(val || '')
      return (num >= 280 && num <= 700) ? num : 420
    } catch {
      return 420
    }
  }

  function setPanelWidth(width: number) {
    const clamped = Math.max(280, Math.min(700, width))
    panelWidth.value = clamped
    localStorage.setItem(PANEL_WIDTH_KEY, String(clamped))
  }

  // ===== 显示设置（字体、间距等，持久化） =====
  const DISPLAY_KEY = 'copywriting-chat-display-settings'

  interface DisplaySettings {
    fontSize: number      // 13-18
    lineHeight: number    // 1.4-2.2
    paragraphSpacing: number // 4-20
    fontFamily: string
    contentPadding: number  // 8-24
  }

  const displaySettings = ref<DisplaySettings>(loadDisplaySettings())

  function loadDisplaySettings(): DisplaySettings {
    try {
      const data = localStorage.getItem(DISPLAY_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        return {
          fontSize: parsed.fontSize || 14,
          lineHeight: parsed.lineHeight || 1.7,
          paragraphSpacing: parsed.paragraphSpacing ?? 8,
          fontFamily: parsed.fontFamily || 'default',
          contentPadding: parsed.contentPadding ?? 16
        }
      }
    } catch {}
    return { fontSize: 14, lineHeight: 1.7, paragraphSpacing: 8, fontFamily: 'default', contentPadding: 16 }
  }

  function saveDisplaySettings() {
    localStorage.setItem(DISPLAY_KEY, JSON.stringify(displaySettings.value))
  }

  function updateDisplaySettings(patch: Partial<DisplaySettings>) {
    Object.assign(displaySettings.value, patch)
    saveDisplaySettings()
  }

  // ===== ASR 语音识别配置 =====
  const ASR_CONFIG_KEY = 'copywriting-asr-config'

  interface AsrConfig {
    appId: string
    accessToken: string
  }

  const asrConfig = ref<AsrConfig>({ appId: '', accessToken: '' });

  (function loadAsrConfig() {
    try {
      const data = localStorage.getItem(ASR_CONFIG_KEY)
      if (data) Object.assign(asrConfig.value, JSON.parse(data))
    } catch {}
  })()

  function saveAsrConfig() {
    localStorage.setItem(ASR_CONFIG_KEY, JSON.stringify(asrConfig.value))
  }

  function updateAsrConfig(config: Partial<AsrConfig>) {
    Object.assign(asrConfig.value, config)
    saveAsrConfig()
  }

  // ===== 初始化：恢复收藏状态 =====
  function refreshFavoriteStatus() {
    for (const session of sessions.value) {
      for (const msg of session.messages) {
        msg.isFavorited = chatFavoritesStore.isFavorited(msg.id)
      }
    }
  }
  refreshFavoriteStatus()

  return {
    // 会话
    sessions,
    currentSessionId,
    currentSession,
    messages,
    getOrCreateSession,
    switchSession,
    deleteSession,
    clearCurrentSession,
    togglePinSession,

    // 文件夹
    folders,
    createFolder,
    renameFolder,
    deleteFolder,
    moveSessionToFolder,
    getFolderCount,

    // 消息
    addUserMessage,
    addAssistantPlaceholder,
    updateMessageContent,
    deleteMessage,
    sendMessage,
    cancelStream,

    // 模型
    models,
    currentModel,
    modelList,
    setDefaultModel,
    addCustomModel,
    removeModel,
    updateModel,
    setModelApiKey,

    // 功能开关
    deepThinkingEnabled,
    toggleDeepThinking,
    webSearchEnabled,
    toggleWebSearch,
    isSearching,

    // 文档上下文
    documentContext,
    setDocumentContext,
    clearDocumentContext,

    // 收藏
    favoriteMessage,
    unfavoriteMessage,

    // 面板
    isPanelOpen,
    togglePanel,
    openPanel,
    closePanel,
    panelWidth,
    setPanelWidth,
    displaySettings,
    updateDisplaySettings,

    // ASR
    asrConfig,
    updateAsrConfig,
  }
})
