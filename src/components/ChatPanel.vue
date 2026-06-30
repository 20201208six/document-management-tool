<template>
  <div
    class="chat-panel"
    :class="{ collapsed: !chatStore.isPanelOpen, resizing: isResizing }"
    :style="chatStore.isPanelOpen ? { width: chatStore.panelWidth + 'px', minWidth: chatStore.panelWidth + 'px' } : {}"
  >
    <div class="resize-handle" @mousedown="startResize" v-if="chatStore.isPanelOpen"></div>

    <!-- 面板头部 - 全新设计 -->
    <div class="chat-panel-header">
      <div class="chat-panel-title">
        <div class="chat-title-avatar">
          <el-icon :size="20"><ChatDotRound /></el-icon>
        </div>
        <div class="chat-title-text">
          <span class="chat-title-main">AI 智能助手</span>
          <span class="chat-title-sub" v-if="chatStore.currentModel">
            {{ chatStore.currentModel.name }}
          </span>
        </div>
      </div>

      <div class="chat-panel-header-actions">
        <button class="header-action-btn" title="新建对话" @click="handleNewSession">
          <el-icon><EditPen /></el-icon>
        </button>

        <el-popover
          placement="bottom-end"
          :width="320"
          trigger="click"
          v-model:visible="showHistoryPopover"
        >
          <template #reference>
            <button class="header-action-btn" title="历史对话">
              <el-icon><Clock /></el-icon>
            </button>
          </template>
          <div class="history-panel">
            <div class="history-search">
              <el-input
                v-model="historySearchKeyword"
                size="small"
                placeholder="搜索对话..."
                clearable
                :prefix-icon="Search"
              />
            </div>
            <div class="history-toolbar">
              <span class="history-toolbar-title">历史对话</span>
              <el-button size="small" text @click="handleAddFolder">
                <el-icon><FolderAdd /></el-icon>
              </el-button>
            </div>

            <div v-if="historySearchKeyword.trim()" class="history-search-results">
              <div v-if="searchResults.length === 0" class="history-empty">
                未找到「{{ historySearchKeyword }}」
              </div>
              <div
                v-for="(result, idx) in searchResults"
                :key="idx"
                class="history-search-item"
                @click="jumpToMessage(result.sessionId, result.messageId)"
              >
                <div class="history-search-title">{{ getSessionTitle(result.sessionId) }}</div>
                <div class="history-search-preview" v-html="result.highlight"></div>
              </div>
            </div>

            <div v-else class="history-list">
              <div v-if="pinnedSessions.length > 0" class="history-section">
                <div class="history-section-header">
                  <el-icon :size="12"><Top /></el-icon>
                  <span>置顶</span>
                </div>
                <div
                  v-for="session in pinnedSessions"
                  :key="session.id"
                  class="history-item"
                  :class="{ active: session.id === chatStore.currentSessionId }"
                  :style="{ '--session-color': sessionColor(session.id) }"
                  @click="chatStore.switchSession(session.id); showHistoryPopover = false"
                >
                  <div class="history-color-bar"></div>
                  <div class="history-item-main">
                    <span class="history-title">{{ session.title }}</span>
                    <span class="history-meta">{{ session.messages.length }} 条 · {{ formatSessionTime(session.updatedAt) }}</span>
                  </div>
                  <button class="history-mini-btn" :class="{warn:session.pinned}" @click.stop="chatStore.togglePinSession(session.id)">
                    <el-icon :size="12"><Top /></el-icon>
                  </button>
                  <button class="history-mini-btn danger" @click.stop="handleDeleteSession(session.id)">
                    <el-icon :size="12"><Delete /></el-icon>
                  </button>
                </div>
              </div>

              <div v-for="folder in chatStore.folders" :key="folder.id" class="history-section">
                <div
                  class="history-section-header folder-header"
                  :class="{ collapsed: collapsedFolders.has(folder.id) }"
                  @click="toggleFolder(folder.id)"
                >
                  <el-icon :size="12" class="folder-arrow"><ArrowRight /></el-icon>
                  <el-icon :size="13"><Folder /></el-icon>
                  <span class="folder-name" @dblclick.stop="handleRenameFolder(folder)">{{ folder.name }}</span>
                  <span class="folder-count">{{ chatStore.getFolderCount(folder.id) }}</span>
                  <button class="history-mini-btn danger folder-delete" @click.stop="handleDeleteFolder(folder.id)">
                    <el-icon :size="11"><Delete /></el-icon>
                  </button>
                </div>
                <div v-show="!collapsedFolders.has(folder.id)"
                  class="folder-drop-zone"
                  @dragover.prevent="dragOverFolder = folder.id"
                  @dragleave="dragOverFolder = null"
                  @drop.prevent="handleDropToFolder($event, folder.id)"
                  :class="{ 'drag-over': dragOverFolder === folder.id }"
                >
                  <div
                    v-for="session in getFolderSessions(folder.id)"
                    :key="session.id"
                    class="history-item"
                    :draggable="true"
                    :class="{ active: session.id === chatStore.currentSessionId }"
                    :style="{ '--session-color': sessionColor(session.id) }"
                    @dragstart="handleDragStart($event, session.id)"
                    @click="chatStore.switchSession(session.id); showHistoryPopover = false"
                  >
                    <div class="history-color-bar"></div>
                    <div class="history-item-main">
                      <span class="history-title">{{ session.title }}</span>
                      <span class="history-meta">{{ session.messages.length }} 条 · {{ formatSessionTime(session.updatedAt) }}</span>
                    </div>
                    <button class="history-mini-btn" :class="{warn:session.pinned}" @click.stop="chatStore.togglePinSession(session.id)">
                      <el-icon :size="12"><Top /></el-icon>
                    </button>
                    <button class="history-mini-btn danger" @click.stop="handleDeleteSession(session.id)">
                      <el-icon :size="12"><Delete /></el-icon>
                    </button>
                  </div>
                  <div v-if="getFolderSessions(folder.id).length === 0" class="folder-empty">
                    拖拽对话到此
                  </div>
                </div>
              </div>

              <div v-if="uncategorizedSessions.length > 0" class="history-section">
                <div class="history-section-header">
                  <el-icon :size="13"><ChatLineSquare /></el-icon>
                  <span>对话</span>
                </div>
                <div
                  v-for="session in uncategorizedSessions"
                  :key="session.id"
                  class="history-item"
                  :draggable="true"
                  :class="{ active: session.id === chatStore.currentSessionId }"
                  :style="{ '--session-color': sessionColor(session.id) }"
                  @dragstart="handleDragStart($event, session.id)"
                  @click="chatStore.switchSession(session.id); showHistoryPopover = false"
                >
                  <div class="history-color-bar"></div>
                  <div class="history-item-main">
                    <span class="history-title">{{ session.title }}</span>
                    <span class="history-meta">{{ session.messages.length }} 条 · {{ formatSessionTime(session.updatedAt) }}</span>
                  </div>
                  <button class="history-mini-btn" :class="{warn:session.pinned}" @click.stop="chatStore.togglePinSession(session.id)">
                    <el-icon :size="12"><Top /></el-icon>
                  </button>
                  <button class="history-mini-btn danger" @click.stop="handleDeleteSession(session.id)">
                    <el-icon :size="12"><Delete /></el-icon>
                  </button>
                </div>
              </div>

              <div v-if="allSessions.length === 0" class="history-empty">暂无对话记录</div>
            </div>
          </div>
        </el-popover>

        <button class="header-action-btn" :class="{active: showFavoritesDialog}" @click="showFavoritesDialog = true" title="对话收藏">
          <el-badge :value="chatFavoritesStore.count" :hidden="chatFavoritesStore.count === 0" :max="99">
            <el-icon><Star /></el-icon>
          </el-badge>
        </button>

        <el-popover placement="bottom-end" :width="200" trigger="click" v-model:visible="showDisplayPopover">
          <template #reference>
            <button class="header-action-btn" title="显示设置">
              <el-icon><Setting /></el-icon>
            </button>
          </template>
          <div class="display-settings">
            <div class="ds-title">显示设置</div>
            <div class="setting-item">
              <label>字号</label>
              <el-slider v-model="display.fontSize" :min="13" :max="18" :step="1" size="small" @change="onDisplayChange" />
            </div>
            <div class="setting-item">
              <label>行高</label>
              <el-slider v-model="display.lineHeight" :min="1.4" :max="2.2" :step="0.1" size="small" @change="onDisplayChange" />
            </div>
            <div class="setting-item">
              <label>段落间距</label>
              <el-slider v-model="display.paragraphSpacing" :min="4" :max="20" :step="1" size="small" @change="onDisplayChange" />
            </div>
          </div>
        </el-popover>

        <button class="header-action-btn close-btn" title="收起面板" @click="chatStore.closePanel()">
          <el-icon><DArrowRight /></el-icon>
        </button>
      </div>
    </div>

    <!-- 功能开关栏 -->
    <div class="chat-feature-bar">
      <button
        class="feature-chip"
        :class="{ active: chatStore.deepThinkingEnabled }"
        @click="chatStore.toggleDeepThinking()"
        title="深度思考"
      >
        <el-icon :size="13"><MagicStick /></el-icon>
        <span>深度思考</span>
      </button>
      <button
        class="feature-chip"
        :class="{ active: chatStore.webSearchEnabled }"
        @click="chatStore.toggleWebSearch()"
        :disabled="chatStore.isSearching"
        title="联网搜索"
      >
        <el-icon :size="13"><Link /></el-icon>
        <span>联网</span>
      </button>
      <button class="feature-chip" @click="handleFileUpload" :disabled="isUploading" title="上传文件">
        <el-icon :size="13"><UploadFilled /></el-icon>
        <span>文件</span>
      </button>
      <el-tag v-if="chatStore.documentContext" size="small" type="warning" closable class="doc-tag" @close="chatStore.clearDocumentContext()">
        已引用文档
      </el-tag>
    </div>

    <div v-if="uploadedFile" class="uploaded-file-bar">
      <el-icon><Document /></el-icon>
      <span class="uploaded-file-name">{{ uploadedFile.name }}</span>
      <el-button size="small" text type="danger" @click="clearUploadedFile">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>

    <!-- 消息列表 -->
    <div
      class="chat-messages"
      ref="messagesContainerRef"
      :style="{
        '--msg-font-size': display.fontSize + 'px',
        '--msg-line-height': display.lineHeight,
        '--msg-paragraph-spacing': display.paragraphSpacing + 'px',
        '--msg-padding': '16px'
      }"
    >
      <div v-if="chatStore.messages.length === 0" class="chat-welcome">
        <div class="welcome-icon-wrap">
          <el-icon :size="36"><ChatDotRound /></el-icon>
        </div>
        <h3 class="welcome-title">你好，我是 AI 文案助手</h3>
        <p class="welcome-desc">我可以帮你分析文案、优化表达、创作内容、解答疑问</p>
        <div class="welcome-suggestions">
          <button v-for="sg in suggestions" :key="sg" class="suggestion-card" @click="inputText = sg; handleSend()">
            <el-icon :size="14"><Promotion /></el-icon>
            <span>{{ sg }}</span>
          </button>
        </div>
      </div>

      <ChatMessage
        v-for="msg in chatStore.messages"
        :key="msg.id"
        :message="msg"
        @follow-up="handleFollowUp"
        @favorite="chatStore.favoriteMessage($event)"
        @unfavorite="chatStore.unfavoriteMessage($event)"
        @delete="handleDeleteMessage"
        @copy="handleCopyMessage"
      />

      <div ref="scrollAnchorRef"></div>
    </div>

    <!-- 输入区域 - 全新设计 -->
    <div class="chat-input-area">
      <div class="input-wrapper">
        <textarea
          ref="textareaRef"
          v-model="inputText"
          class="chat-textarea"
          placeholder="输入你的问题... (Enter发送，Shift+Enter换行)"
          rows="1"
          @keydown="handleInputKeydown"
          @input="autoResize"
          :disabled="isStreaming"
        ></textarea>
        <div class="input-toolbar">
          <div class="input-toolbar-left">
            <span v-if="isStreaming" class="streaming-hint">
              <span class="typing-dots"><span></span><span></span><span></span></span>
              正在生成...
            </span>
          </div>
          <div class="input-toolbar-right">
            <button v-if="isStreaming" class="send-btn stop-btn" @click="handleStop">
              <el-icon :size="14"><VideoPause /></el-icon>
              <span>停止</span>
            </button>
            <button
              v-else
              class="send-btn"
              :class="{ active: inputText.trim() || uploadedFile }"
              @click="handleSend"
              :disabled="!inputText.trim() && !uploadedFile"
            >
              <el-icon :size="16"><Promotion /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 收藏对话框 -->
    <el-dialog v-model="showFavoritesDialog" title="对话收藏" width="640px" destroy-on-close>
      <div class="favorites-search">
        <el-input v-model="favoritesSearchKeyword" placeholder="搜索收藏..." clearable size="small" :prefix-icon="Search" />
      </div>
      <div v-if="filteredFavorites.length === 0" class="favorites-empty">
        <p v-if="chatFavoritesStore.count === 0">暂无收藏</p>
        <p v-else>未找到匹配内容</p>
      </div>
      <div v-else class="favorites-list">
        <div v-for="fav in filteredFavorites" :key="fav.id" class="favorite-item">
          <div class="favorite-header">
            <span class="favorite-q">Q: {{ fav.question.substring(0, 100) }}{{ fav.question.length > 100 ? '...' : '' }}</span>
            <button class="fav-del-btn" @click="chatFavoritesStore.removeFavorite(fav.messageId)">
              <el-icon :size="12"><Delete /></el-icon>
            </button>
          </div>
          <div class="favorite-a">A: {{ fav.answer.substring(0, 200) }}{{ fav.answer.length > 200 ? '...' : '' }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import ChatMessage from '@/components/ChatMessage.vue'
import { useChatStore } from '@/stores/chat'
import { useChatFavoritesStore } from '@/stores/chatFavorites'

const chatStore = useChatStore()
const chatFavoritesStore = useChatFavoritesStore()

const inputText = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isStreaming = computed(() => chatStore.messages.some(m => m.isStreaming))

const uploadedFile = ref<{ name: string; content: string } | null>(null)
const isUploading = ref(false)

const showFavoritesDialog = ref(false)
const showDisplayPopover = ref(false)
const showHistoryPopover = ref(false)
const favoritesSearchKeyword = ref('')

const collapsedFolders = ref(new Set<string>())
const dragOverFolder = ref<string | null>(null)
const dragSessionId = ref<string | null>(null)
const historySearchKeyword = ref('')

const searchResults = computed(() => {
  const kw = historySearchKeyword.value.trim().toLowerCase()
  if (!kw) return []
  const results: { sessionId: string; messageId: string; highlight: string }[] = []
  for (const s of allSessions.value) {
    for (const m of s.messages) {
      const content = m.content.toLowerCase()
      const idx = content.indexOf(kw)
      if (idx === -1) continue
      const start = Math.max(0, idx - 20)
      const end = Math.min(m.content.length, idx + kw.length + 40)
      let preview = escapeHtml(m.content.substring(start, end))
      const escapedKw = escapeHtml(kw)
      preview = preview.replace(new RegExp(escapedKw, 'gi'), m => `<mark>${m}</mark>`)
      if (start > 0) preview = '…' + preview
      if (end < m.content.length) preview = preview + '…'
      results.push({ sessionId: s.id, messageId: m.id, highlight: preview })
      break
    }
  }
  return results.slice(0, 20)
})

function getSessionTitle(sessionId: string): string {
  return allSessions.value.find(s => s.id === sessionId)?.title || '未知对话'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function jumpToMessage(sessionId: string, messageId: string) {
  chatStore.switchSession(sessionId)
  showHistoryPopover.value = false
  const tryScroll = () => {
    const el = document.querySelector(`[data-msg-id="${messageId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('msg-highlight-flash')
      setTimeout(() => el.classList.remove('msg-highlight-flash'), 2000)
    } else {
      setTimeout(tryScroll, 100)
    }
  }
  nextTick(() => setTimeout(tryScroll, 50))
}

const allSessions = computed(() => chatStore.sessions)
const pinnedSessions = computed(() => allSessions.value.filter(s => s.pinned && !s.folderId))
const uncategorizedSessions = computed(() => allSessions.value.filter(s => !s.pinned && !s.folderId))

function getFolderSessions(folderId: string) {
  return allSessions.value.filter(s => s.folderId === folderId && !s.pinned)
}

function toggleFolder(folderId: string) {
  const s = collapsedFolders.value
  if (s.has(folderId)) s.delete(folderId); else s.add(folderId)
  collapsedFolders.value = new Set(s)
}

function handleDragStart(e: DragEvent, sessionId: string) {
  dragSessionId.value = sessionId
  e.dataTransfer!.effectAllowed = 'move'
}

function handleDropToFolder(e: DragEvent, folderId: string) {
  dragOverFolder.value = null
  if (dragSessionId.value) {
    chatStore.moveSessionToFolder(dragSessionId.value, folderId)
    dragSessionId.value = null
  }
}

function handleAddFolder() {
  ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
    confirmButtonText: '创建', cancelButtonText: '取消', inputPattern: /.+/, inputErrorMessage: '名称不能为空'
  }).then(({ value }) => {
    const name = (value || '').trim()
    if (name) chatStore.createFolder(name)
  }).catch(() => {})
}

function handleDeleteFolder(folderId: string) {
  const count = chatStore.getFolderCount(folderId)
  ElMessageBox.confirm(`删除后 ${count} 个对话将移至「未分类」。`, '删除文件夹',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
  ).then(() => chatStore.deleteFolder(folderId)).catch(() => {})
}

function handleRenameFolder(folder: { id: string; name: string }) {
  ElMessageBox.prompt('请输入新名称', '重命名', {
    confirmButtonText: '确定', cancelButtonText: '取消', inputValue: folder.name, inputPattern: /.+/, inputErrorMessage: '不能为空'
  }).then(({ value }) => {
    if (value) chatStore.renameFolder(folder.id, value.trim())
  }).catch(() => {})
}

const display = reactive({
  fontSize: chatStore.displaySettings.fontSize,
  lineHeight: chatStore.displaySettings.lineHeight,
  paragraphSpacing: chatStore.displaySettings.paragraphSpacing,
})

watch(() => chatStore.displaySettings, (val) => {
  if (val) {
    display.fontSize = val.fontSize
    display.lineHeight = val.lineHeight
    display.paragraphSpacing = val.paragraphSpacing
  }
}, { deep: true })

const messagesContainerRef = ref<HTMLElement | null>(null)
const scrollAnchorRef = ref<HTMLElement | null>(null)

const suggestions = [
  '帮我写一段吸引人的视频开头文案',
  '分析这段文案的问题并优化',
  '生成一个爆款短视频脚本',
  '帮我提炼这个文档的核心观点'
]

const filteredFavorites = computed(() => chatFavoritesStore.searchFavorites(favoritesSearchKeyword.value))

function scrollToBottom() {
  nextTick(() => { scrollAnchorRef.value?.scrollIntoView({ behavior: 'smooth' }) })
}

watch(() => chatStore.messages.length, () => scrollToBottom())
watch(() => chatStore.messages.map(m => m.content).join(''), () => scrollToBottom())

function autoResize() {
  const ta = textareaRef.value
  if (!ta) return
  ta.style.height = 'auto'
  ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text && !uploadedFile.value) return
  if (isStreaming.value) return
  const content = text || (uploadedFile.value ? '请分析以上文件内容' : '')
  inputText.value = ''
  if (textareaRef.value) textareaRef.value.style.height = 'auto'
  const fileContent = uploadedFile.value?.content
  const fileName = uploadedFile.value?.name
  uploadedFile.value = null
  try {
    await chatStore.sendMessage(content, null, fileContent, fileName)
  } catch (e: any) {
    ElMessage.error(e.message || '发送失败')
  }
}

async function handleFollowUp(messageId: string) {
  if (isStreaming.value) return
  const text = inputText.value.trim() || '请进一步说明'
  inputText.value = ''
  try {
    await chatStore.sendMessage(text, messageId)
  } catch (e: any) {
    ElMessage.error(e.message || '追问失败')
  }
}

function handleStop() { chatStore.cancelStream() }

function handleDeleteMessage(messageId: string) {
  ElMessageBox.confirm('确定删除这条消息？追问也会一起删除。', '确认', {
    confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
  }).then(() => { chatStore.deleteMessage(messageId) }).catch(() => {})
}

function handleCopyMessage(content: string) {
  navigator.clipboard.writeText(content).then(() => {
    ElMessage.success('已复制')
  }).catch(() => {
    document.execCommand('copy')
    ElMessage.success('已复制')
  })
}

function handleNewSession() {
  if (chatStore.messages.length === 0) {
    chatStore.currentSessionId = null
    chatStore.getOrCreateSession(null)
    return
  }
  ElMessageBox.confirm('确定新建对话？当前对话将被保存。', '新建对话', {
    confirmButtonText: '新建', cancelButtonText: '取消', type: 'info'
  }).then(() => {
    chatStore.currentSessionId = null
    chatStore.getOrCreateSession(null)
    inputText.value = ''
    uploadedFile.value = null
    chatStore.clearDocumentContext()
  }).catch(() => {})
}

function handleDeleteSession(sessionId: string) {
  const session = chatStore.sessions.find(s => s.id === sessionId)
  if (!session) return
  ElMessageBox.confirm(`确定删除「${session.title}」？此操作不可恢复。`, '删除', {
    confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
  }).then(() => { chatStore.deleteSession(sessionId) }).catch(() => {})
}

function formatSessionTime(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
    return d.toLocaleDateString('zh-CN')
  } catch { return '' }
}

const COLORS = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#7c5cfc', '#00bcd4', '#ff9800', '#9c27b0', '#4caf50']
function sessionColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

async function handleFileUpload() {
  try {
    const filePath = await window.electronAPI.selectFile()
    if (!filePath) return
    isUploading.value = true
    const result = await window.electronAPI.readFileAsText(filePath)
    if (result.success && result.content) {
      const fileName = filePath.split(/[/\\]/).pop() || '未知文件'
      uploadedFile.value = { name: fileName, content: result.content }
      ElMessage.success(`已加载：${fileName}`)
    } else {
      ElMessage.error(result.error || '读取失败')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '上传失败')
  } finally {
    isUploading.value = false
  }
}

function clearUploadedFile() { uploadedFile.value = null }

function handleInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function onDisplayChange() {
  chatStore.updateDisplaySettings({
    fontSize: display.fontSize,
    lineHeight: display.lineHeight,
    paragraphSpacing: display.paragraphSpacing,
    contentPadding: 16,
    fontFamily: 'default'
  })
}

const isResizing = ref(false)
function startResize(e: MouseEvent) {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = chatStore.panelWidth
  function onMouseMove(ev: MouseEvent) { chatStore.setPanelWidth(startWidth + (startX - ev.clientX)) }
  function onMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()
}

onMounted(() => { chatStore.getOrCreateSession(null) })
</script>

<style scoped>
.chat-panel {
  width: 400px;
  min-width: 320px;
  height: 100%;
  background: var(--c-bg-card);
  border-left: 1px solid var(--c-border-light);
  display: flex;
  flex-direction: column;
  transition: width 0.25s cubic-bezier(.4,0,.2,1), min-width 0.25s cubic-bezier(.4,0,.2,1), opacity 0.25s;
  overflow: hidden;
  position: relative;
}

.resize-handle {
  position: absolute;
  left: -3px; top: 0; bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 100;
  background: transparent;
}
.resize-handle::after {
  content: '';
  position: absolute;
  left: 2px; top: 0; bottom: 0;
  width: 2px;
  background: var(--c-border);
  transition: background 0.2s, width 0.2s;
}
.resize-handle:hover::after { background: var(--c-primary); width: 3px; }

.chat-panel.resizing { transition: none !important; user-select: none; }
.chat-panel.collapsed { width: 0; min-width: 0; border-left: none; opacity: 0; }

/* Header */
.chat-panel-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-border-light);
  flex-shrink: 0;
}

.chat-panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-title-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--c-primary), var(--c-accent));
  color: var(--c-primary-text);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--c-primary) 30%, transparent);
}

.chat-title-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.chat-title-main {
  font-weight: 700;
  font-size: 14px;
  color: var(--c-text);
  line-height: 1.3;
}

.chat-title-sub {
  font-size: 11px;
  color: var(--c-text-muted);
  background: var(--c-primary-soft);
  color: var(--c-primary);
  padding: 1px 6px;
  border-radius: 4px;
  align-self: flex-start;
  font-weight: 500;
}

.chat-panel-header-actions {
  display: flex;
  gap: 2px;
  align-items: center;
}

.header-action-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  font-size: 16px;
}
.header-action-btn:hover {
  background: var(--c-bg-hover);
  color: var(--c-text);
}
.header-action-btn.active {
  color: var(--c-primary);
  background: var(--c-primary-soft);
}
.header-action-btn.close-btn:hover {
  color: var(--c-danger);
  background: color-mix(in srgb, var(--c-danger) 8%, transparent);
}

/* Feature bar */
.chat-feature-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--c-border-light);
  flex-shrink: 0;
  flex-wrap: wrap;
  background: var(--c-bg-card);
}

.feature-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--c-border);
  background: var(--c-bg-card);
  color: var(--c-text-sec);
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.feature-chip:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
  background: var(--c-primary-soft);
}
.feature-chip.active {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: var(--c-primary-text);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--c-primary) 25%, transparent);
}
.feature-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.doc-tag {
  margin-left: auto;
  font-size: 11px;
}

/* Uploaded file */
.uploaded-file-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: color-mix(in srgb, var(--c-success) 8%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--c-success) 20%, transparent);
  font-size: 12px;
  color: var(--c-success);
  flex-shrink: 0;
}
.uploaded-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  background: var(--c-bg);
  scroll-behavior: smooth;
}

/* Welcome */
.chat-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 40px 24px;
  text-align: center;
}
.welcome-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--c-primary), var(--c-accent));
  color: var(--c-primary-text);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-primary) 25%, transparent);
}
.welcome-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--c-text);
  margin: 0 0 8px;
}
.welcome-desc {
  font-size: 13px;
  color: var(--c-text-muted);
  margin: 0 0 24px;
  max-width: 280px;
  line-height: 1.6;
}
.welcome-suggestions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 320px;
}
.suggestion-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  background: var(--c-bg-card);
  color: var(--c-text-sec);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  font-family: inherit;
  transition: all var(--transition-fast);
}
.suggestion-card:hover {
  border-color: var(--c-primary);
  background: var(--c-primary-soft);
  color: var(--c-primary);
  transform: translateX(2px);
}

/* Input area */
.chat-input-area {
  padding: 12px;
  background: var(--c-bg-card);
  border-top: 1px solid var(--c-border-light);
  flex-shrink: 0;
}

.input-wrapper {
  border: 1.5px solid var(--c-border);
  border-radius: 16px;
  background: var(--c-bg-sec);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}
.input-wrapper:focus-within {
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-primary) 12%, transparent);
  background: var(--c-bg-card);
}

.chat-textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  padding: 12px 14px 4px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--c-text);
  font-family: inherit;
  max-height: 150px;
  min-height: 24px;
}
.chat-textarea::placeholder {
  color: var(--c-text-muted);
}

.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 8px;
}

.streaming-hint {
  font-size: 12px;
  color: var(--c-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.typing-dots {
  display: inline-flex;
  gap: 2px;
}
.typing-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--c-primary);
  animation: typingBounce 1.2s infinite ease-in-out;
}
.typing-dots span:nth-child(2) { animation-delay: 0.15s; }
.typing-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--c-border);
  color: var(--c-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  font-size: 16px;
}
.send-btn.active {
  background: linear-gradient(135deg, var(--c-primary), var(--c-accent));
  color: var(--c-primary-text);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--c-primary) 30%, transparent);
}
.send-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.send-btn.stop-btn {
  width: auto;
  padding: 0 14px;
  border-radius: 18px;
  background: var(--c-danger);
  color: var(--c-primary-text);
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
}

/* History panel */
.history-panel { display: flex; flex-direction: column; }
.history-search { padding: 0 4px 8px; border-bottom: 1px solid var(--c-border-light); margin-bottom: 8px; }
.history-search-results { max-height: 360px; overflow-y: auto; margin-bottom: 8px; }
.history-search-item {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  margin-bottom: 4px;
  transition: background var(--transition-fast);
}
.history-search-item:hover { background: var(--c-bg-hover); }
.history-search-title { font-size: 12px; font-weight: 600; color: var(--c-primary); margin-bottom: 4px; }
.history-search-preview { font-size: 12px; color: var(--c-text-sec); line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-search-preview :deep(mark) { background: color-mix(in srgb, var(--c-warning) 30%, transparent); color: var(--c-text); padding: 0 2px; border-radius: 2px; }

.history-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 8px; border-bottom: 1px solid var(--c-border-light); margin-bottom: 8px; }
.history-toolbar-title { font-size: 13px; font-weight: 600; color: var(--c-text); }
.history-list { max-height: 400px; overflow-y: auto; }
.history-empty { text-align: center; padding: 24px 0; color: var(--c-text-muted); font-size: 12px; }

.history-section { margin-bottom: 2px; }
.history-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--c-text-muted);
  font-weight: 600;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.folder-header { cursor: pointer; user-select: none; text-transform: none; font-weight: 500; font-size: 12px; }
.folder-header:hover { background: var(--c-bg-hover); }
.folder-arrow { transition: transform 0.2s; }
.folder-header.collapsed .folder-arrow { transform: rotate(-90deg); }
.folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-text-sec); }
.folder-count { font-size: 10px; color: var(--c-text-muted); background: var(--c-bg-hover); padding: 0 6px; border-radius: 10px; }
.folder-delete { visibility: hidden; padding: 0; }
.folder-header:hover .folder-delete { visibility: visible; }

.folder-drop-zone {
  min-height: 20px;
  transition: background 0.2s;
  border-radius: var(--radius-sm);
  border: 1px dashed transparent;
}
.folder-drop-zone.drag-over {
  background: var(--c-primary-soft);
  border-color: var(--c-primary);
}
.folder-empty { text-align: center; font-size: 11px; color: var(--c-text-muted); padding: 8px 0; }

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.history-item:hover { background: var(--c-bg-hover); }
.history-item.active { background: var(--c-primary-soft); }
.history-item.active .history-title { color: var(--c-primary); font-weight: 600; }

.history-color-bar {
  flex-shrink: 0;
  width: 3px;
  height: 24px;
  border-radius: 2px;
  background: var(--session-color);
}
.history-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.history-title { font-size: 12px; color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-meta { font-size: 10px; color: var(--c-text-muted); }

.history-mini-btn {
  visibility: hidden;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all var(--transition-fast);
}
.history-item:hover .history-mini-btn { visibility: visible; }
.history-mini-btn:hover { background: var(--c-bg-hover); color: var(--c-text); }
.history-mini-btn.warn { color: var(--c-warning); }
.history-mini-btn.danger:hover { color: var(--c-danger); background: color-mix(in srgb, var(--c-danger) 10%, transparent); }

/* Display settings */
.display-settings { display: flex; flex-direction: column; gap: 8px; }
.ds-title { font-size: 13px; font-weight: 600; color: var(--c-text); margin-bottom: 4px; }
.display-settings .setting-item { display: flex; flex-direction: column; gap: 2px; }
.display-settings .setting-item label { font-size: 11px; color: var(--c-text-sec); font-weight: 500; }

/* Favorites */
.favorites-search { margin-bottom: 12px; }
.favorites-empty { text-align: center; padding: 32px 0; color: var(--c-text-muted); }
.favorites-list { max-height: 420px; overflow-y: auto; }
.favorite-item {
  padding: 12px;
  border: 1px solid var(--c-border-light);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  background: var(--c-bg-sec);
  transition: border-color var(--transition-fast);
}
.favorite-item:hover { border-color: var(--c-primary); }
.favorite-header { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
.favorite-q {
  font-size: 13px;
  color: var(--c-text);
  font-weight: 500;
  flex: 1;
  line-height: 1.5;
}
.fav-del-btn {
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.fav-del-btn:hover { color: var(--c-danger); background: color-mix(in srgb, var(--c-danger) 8%, transparent); }
.favorite-a { font-size: 12px; line-height: 1.6; color: var(--c-text-sec); }
</style>

<style>
.msg-highlight-flash {
  animation: msg-flash 0.5s ease-in-out 3;
}
@keyframes msg-flash {
  0%, 100% { background-color: transparent; }
  50% { background-color: color-mix(in srgb, var(--c-primary) 20%, transparent); border-radius: 8px; }
}
</style>
