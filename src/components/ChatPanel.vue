<template>
  <div
    class="chat-panel"
    :class="{ collapsed: !chatStore.isPanelOpen, resizing: isResizing }"
    :style="chatStore.isPanelOpen ? { width: chatStore.panelWidth + 'px', minWidth: chatStore.panelWidth + 'px' } : {}"
  >
    <!-- 拖拽调整宽度的手柄 -->
    <div class="resize-handle" @mousedown="startResize" v-if="chatStore.isPanelOpen"></div>

    <!-- 面板头部 -->
    <div class="chat-panel-header">
      <div class="chat-panel-title">
        <el-icon><ChatDotRound /></el-icon>
        <span>智能对话</span>
        <el-tag v-if="chatStore.currentModel" size="small" type="success" class="model-tag">
          {{ chatStore.currentModel.name }}
        </el-tag>
      </div>

      <div class="chat-panel-header-actions">
        <!-- 新建对话 -->
        <el-button size="small" circle title="新建对话" @click="handleNewSession">
          <el-icon><Plus /></el-icon>
        </el-button>

        <!-- 历史对话 -->
        <el-popover
          placement="bottom"
          :width="340"
          trigger="click"
          v-model:visible="showHistoryPopover"
        >
          <template #reference>
            <el-button size="small" circle title="历史对话">
              <el-icon><Clock /></el-icon>
            </el-button>
          </template>
          <div class="history-panel">
            <!-- 搜索栏 -->
            <div class="history-search">
              <el-input
                v-model="historySearchKeyword"
                size="small"
                placeholder="搜索对话内容..."
                clearable
                :prefix-icon="Search"
              />
            </div>
            <!-- 工具栏 -->
            <div class="history-toolbar">
              <span class="history-toolbar-title">历史对话</span>
              <el-button size="small" text @click="handleAddFolder">
                <el-icon><FolderAdd /></el-icon>
              </el-button>
            </div>

            <!-- 搜索结果 -->
            <div v-if="historySearchKeyword.trim()" class="history-search-results">
              <div v-if="searchResults.length === 0" class="history-empty">
                未找到包含「{{ historySearchKeyword }}」的对话
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

            <!-- 正常列表 -->
            <div v-else>

            <div v-if="allSessions.length === 0" class="history-empty">
              暂无历史对话
            </div>
            <div v-else class="history-list">
              <!-- 置顶 -->
              <div v-if="pinnedSessions.length > 0" class="history-section">
                <div class="history-section-header">
                  <el-icon :size="14"><Top /></el-icon>
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
                    <span class="history-meta">{{ session.messages.length }} 条消息 · {{ formatSessionTime(session.updatedAt) }}</span>
                  </div>
                  <el-button size="small" text class="history-pin" :type="session.pinned ? 'warning' : 'default'" @click.stop="chatStore.togglePinSession(session.id)" title="置顶">
                    <el-icon :size="14"><Top /></el-icon>
                  </el-button>
                  <el-button size="small" text type="danger" class="history-delete" @click.stop="handleDeleteSession(session.id)">
                    <el-icon :size="14"><Delete /></el-icon>
                  </el-button>
                </div>
              </div>

              <!-- 文件夹 -->
              <div v-for="folder in chatStore.folders" :key="folder.id" class="history-section">
                <div
                  class="history-section-header folder-header"
                  :class="{ collapsed: collapsedFolders.has(folder.id) }"
                  @click="toggleFolder(folder.id)"
                >
                  <el-icon :size="12"><ArrowRight /></el-icon>
                  <el-icon :size="14"><Folder /></el-icon>
                  <span class="folder-name" @dblclick.stop="handleRenameFolder(folder)">{{ folder.name }}</span>
                  <span class="folder-count">{{ chatStore.getFolderCount(folder.id) }}</span>
                  <el-button size="small" text type="danger" class="folder-delete" @click.stop="handleDeleteFolder(folder.id)">
                    <el-icon :size="12"><Delete /></el-icon>
                  </el-button>
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
                      <span class="history-meta">{{ session.messages.length }} 条消息 · {{ formatSessionTime(session.updatedAt) }}</span>
                    </div>
                    <el-button size="small" text class="history-pin" :type="session.pinned ? 'warning' : 'default'" @click.stop="chatStore.togglePinSession(session.id)" title="置顶">
                      <el-icon :size="14"><Top /></el-icon>
                    </el-button>
                    <el-button size="small" text type="danger" class="history-delete" @click.stop="handleDeleteSession(session.id)">
                      <el-icon :size="14"><Delete /></el-icon>
                    </el-button>
                  </div>
                  <div v-if="getFolderSessions(folder.id).length === 0" class="folder-empty">
                    拖拽对话到此处
                  </div>
                </div>
              </div>

              <!-- 未分类 -->
              <div v-if="uncategorizedSessions.length > 0" class="history-section">
                <div class="history-section-header">
                  <el-icon :size="14"><ChatLineSquare /></el-icon>
                  <span>未分类</span>
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
                    <span class="history-meta">{{ session.messages.length }} 条消息 · {{ formatSessionTime(session.updatedAt) }}</span>
                  </div>
                  <el-button size="small" text class="history-pin" :type="session.pinned ? 'warning' : 'default'" @click.stop="chatStore.togglePinSession(session.id)" title="置顶">
                    <el-icon :size="14"><Top /></el-icon>
                  </el-button>
                  <el-button size="small" text type="danger" class="history-delete" @click.stop="handleDeleteSession(session.id)">
                    <el-icon :size="14"><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
            </div> <!-- v-else 闭合 -->
          </div>
        </el-popover>

        <!-- 对话收藏 -->
        <el-tooltip placement="bottom">
          <template #content>
            <span>对话收藏 ({{ chatFavoritesStore.count }})</span>
          </template>
          <el-badge :value="chatFavoritesStore.count" :hidden="chatFavoritesStore.count === 0">
            <el-button size="small" circle @click="showFavoritesDialog = true">
              <el-icon><Star /></el-icon>
            </el-button>
          </el-badge>
        </el-tooltip>

        <!-- 显示设置 -->
        <el-popover
          placement="bottom-end"
          :width="240"
          trigger="click"
          v-model:visible="showDisplayPopover"
        >
          <template #reference>
            <el-button size="small" circle title="显示设置">
              <el-icon><Operation /></el-icon>
            </el-button>
          </template>
          <div class="display-settings">
            <div class="setting-item">
              <label>字号</label>
              <el-slider
                v-model="display.fontSize"
                :min="13"
                :max="18"
                :step="1"
                show-input
                size="small"
                @change="onDisplayChange"
              />
            </div>
            <div class="setting-item">
              <label>行高</label>
              <el-slider
                v-model="display.lineHeight"
                :min="1.4"
                :max="2.2"
                :step="0.1"
                show-input
                size="small"
                @change="onDisplayChange"
              />
            </div>
            <div class="setting-item">
              <label>段落间距</label>
              <el-slider
                v-model="display.paragraphSpacing"
                :min="4"
                :max="20"
                :step="1"
                show-input
                size="small"
                @change="onDisplayChange"
              />
            </div>
            <div class="setting-item">
              <label>内边距</label>
              <el-slider
                v-model="display.contentPadding"
                :min="8"
                :max="24"
                :step="1"
                show-input
                size="small"
                @change="onDisplayChange"
              />
            </div>
            <div class="setting-item">
              <label>字体</label>
              <el-select
                v-model="display.fontFamily"
                size="small"
                style="width:100%"
                @change="onDisplayChange"
              >
                <el-option label="微软雅黑（默认）" value="default" />
                <el-option label="宋体" value="SimSun, serif" />
                <el-option label="黑体" value="SimHei, sans-serif" />
                <el-option label="楷体" value="KaiTi, serif" />
                <el-option label="等线" value="DengXian, sans-serif" />
                <el-option label="Consolas" value="Consolas, monospace" />
              </el-select>
            </div>
          </div>
        </el-popover>

        <!-- 收起面板 -->
        <el-tooltip content="收起面板" placement="bottom">
          <el-button size="small" circle @click="chatStore.closePanel()">
            <el-icon><DArrowRight /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 功能开关栏 -->
    <div class="chat-toggle-bar">
      <el-tooltip :content="chatStore.deepThinkingEnabled ? '关闭深度思考' : '开启深度思考'" placement="bottom">
        <el-button
          size="small"
          :type="chatStore.deepThinkingEnabled ? 'primary' : 'default'"
          :class="{ 'toggle-active': chatStore.deepThinkingEnabled }"
          @click="chatStore.toggleDeepThinking()"
        >
          <el-icon><MagicStick /></el-icon>
          深度思考
        </el-button>
      </el-tooltip>

      <el-tooltip content="联网搜索最新信息" placement="bottom">
        <el-button
          size="small"
          :type="chatStore.webSearchEnabled ? 'primary' : 'default'"
          :class="{ 'toggle-active': chatStore.webSearchEnabled }"
          @click="chatStore.toggleWebSearch()"
          :loading="chatStore.isSearching"
        >
          <el-icon><Link /></el-icon>
          联网
        </el-button>
      </el-tooltip>

      <el-tooltip content="上传文件进行分析" placement="bottom">
        <el-button size="small" @click="handleFileUpload" :disabled="isUploading">
          <el-icon><UploadFilled /></el-icon>
        </el-button>
      </el-tooltip>

      <!-- 文档引用指示 -->
      <el-tooltip v-if="chatStore.documentContext" placement="bottom">
        <template #content>
          <div style="max-width:300px">
            <p><strong>引用文档段落：</strong></p>
            <p style="font-size:12px;color:#909399">{{ chatStore.documentContext.description }}</p>
          </div>
        </template>
        <el-tag size="small" type="warning" closable @close="chatStore.clearDocumentContext()">
          已引用文档
        </el-tag>
      </el-tooltip>
    </div>

    <!-- 上传文件提示 -->
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
        '--msg-font-family': display.fontFamily === 'default'
          ? '\'Microsoft YaHei\', \'PingFang SC\', sans-serif'
          : display.fontFamily,
        '--msg-padding': display.contentPadding + 'px'
      }"
    >
      <div v-if="chatStore.messages.length === 0" class="chat-empty">
        <el-icon :size="48"><ChatDotSquare /></el-icon>
        <p class="empty-title">AI 文案智能助手</p>
        <p class="empty-desc">基于 DeepSeek 大模型，为您提供文案创作建议、内容分析和写作辅助</p>
        <div class="empty-suggestions">
          <el-tag
            v-for="sg in suggestions"
            :key="sg"
            class="suggestion-tag"
            @click="inputText = sg; handleSend()"
          >
            {{ sg }}
          </el-tag>
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
      />

      <!-- 自动滚动到底部的锚点 -->
      <div ref="scrollAnchorRef"></div>
    </div>

    <!-- 输入区域 -->
    <div class="chat-input-area">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="2"
        placeholder="输入您的问题，AI 助手将为您解答..."
        resize="none"
        @keydown="handleInputKeydown"
        :disabled="isStreaming"
      />

      <div class="chat-input-actions">
        <span v-if="isStreaming" class="streaming-hint">
          <el-icon class="is-loading"><Loading /></el-icon>
          正在生成回复...
        </span>
        <el-button
          v-if="isStreaming"
          size="small"
          type="danger"
          @click="handleStop"
        >
          停止生成
        </el-button>
        <el-button
          v-else
          size="small"
          type="primary"
          @click="handleSend"
          :disabled="!inputText.trim() && !uploadedFile"
          :loading="isStreaming"
        >
          <el-icon><Promotion /></el-icon>
          发送
        </el-button>
      </div>
    </div>

    <!-- 对话收藏对话框 -->
    <el-dialog v-model="showFavoritesDialog" title="对话收藏" width="680px" destroy-on-close>
      <div class="favorites-search">
        <el-input
          v-model="favoritesSearchKeyword"
          placeholder="搜索收藏内容..."
          clearable
          size="small"
          :prefix-icon="Search"
        />
      </div>
      <div v-if="filteredFavorites.length === 0" class="favorites-empty">
        <p v-if="chatFavoritesStore.count === 0">暂无收藏的对话内容</p>
        <p v-else>未找到匹配的收藏内容</p>
      </div>
      <div v-else class="favorites-list">
        <div
          v-for="fav in filteredFavorites"
          :key="fav.id"
          class="favorite-item"
        >
          <div class="favorite-header">
            <span class="favorite-model">{{ fav.modelName }}</span>
            <span class="favorite-time">{{ fav.addedAt }}</span>
            <el-tag v-if="fav.filePath" size="small" type="info" class="favorite-file">
              {{ fav.filePath.split(/[/\\]/).pop() }}
            </el-tag>
          </div>
          <div class="favorite-question">
            <strong>Q:</strong> {{ fav.question.substring(0, 150) }}{{ fav.question.length > 150 ? '...' : '' }}
          </div>
          <div class="favorite-answer">
            <strong>A:</strong> {{ fav.answer.substring(0, 300) }}{{ fav.answer.length > 300 ? '...' : '' }}
          </div>
          <div class="favorite-actions">
            <el-button size="small" text type="danger" @click="chatFavoritesStore.removeFavorite(fav.messageId)">
              <el-icon><Delete /></el-icon> 取消收藏
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import ChatMessage from '@/components/ChatMessage.vue'
import { useChatStore } from '@/stores/chat'
import { useChatFavoritesStore } from '@/stores/chatFavorites'

const chatStore = useChatStore()
const chatFavoritesStore = useChatFavoritesStore()

// 输入状态
const inputText = ref('')
const isStreaming = computed(() => {
  return chatStore.messages.some(m => m.isStreaming)
})

// 文件上传状态
const uploadedFile = ref<{ name: string; content: string } | null>(null)
const isUploading = ref(false)

// 对话框状态
const showFavoritesDialog = ref(false)
const showDisplayPopover = ref(false)
const showHistoryPopover = ref(false)
const favoritesSearchKeyword = ref('')

// 历史对话 — 文件夹折叠状态
const collapsedFolders = ref(new Set<string>())
const dragOverFolder = ref<string | null>(null)
const dragSessionId = ref<string | null>(null)
const historySearchKeyword = ref('')

// 搜索
const searchResults = computed(() => {
  const kw = historySearchKeyword.value.trim().toLowerCase()
  if (!kw) return []
  const results: { sessionId: string; messageId: string; highlight: string }[] = []
  for (const s of allSessions.value) {
    for (const m of s.messages) {
      const content = m.content.toLowerCase()
      const idx = content.indexOf(kw)
      if (idx === -1) continue
      // 截取关键词周围 60 字的上下文并高亮
      const start = Math.max(0, idx - 20)
      const end = Math.min(m.content.length, idx + kw.length + 40)
      let preview = escapeHtml(m.content.substring(start, end))
      // 高亮所有匹配
      const escapedKw = escapeHtml(kw)
      preview = preview.replace(new RegExp(escapedKw, 'gi'), m => `<mark>${m}</mark>`)
      if (start > 0) preview = '…' + preview
      if (end < m.content.length) preview = preview + '…'
      results.push({ sessionId: s.id, messageId: m.id, highlight: preview })
      break // 每个会话只取第一条匹配
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
  // 轮询直到 DOM 出现，然后滚动
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

// 计算属性
const allSessions = computed(() => chatStore.sessions)

const pinnedSessions = computed(() =>
  allSessions.value.filter(s => s.pinned && !s.folderId)
)

const uncategorizedSessions = computed(() =>
  allSessions.value.filter(s => !s.pinned && !s.folderId)
)

function getFolderSessions(folderId: string) {
  return allSessions.value.filter(s => s.folderId === folderId && !s.pinned)
}

function toggleFolder(folderId: string) {
  const s = collapsedFolders.value
  if (s.has(folderId)) s.delete(folderId); else s.add(folderId)
  // 触发响应式
  collapsedFolders.value = new Set(s)
}

// 拖拽
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

// 文件夹操作
function handleAddFolder() {
  ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
    confirmButtonText: '创建',
    cancelButtonText: '取消',
    inputPattern: /.+/,
    inputErrorMessage: '名称不能为空'
  }).then(({ value }) => {
    const name = (value || '').trim()
    if (name) chatStore.createFolder(name)
  }).catch(() => {})
}

function handleDeleteFolder(folderId: string) {
  const count = chatStore.getFolderCount(folderId)
  ElMessageBox.confirm(
    `删除后文件夹内的 ${count} 个对话将移至「未分类」。`,
    '删除文件夹',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
  ).then(() => chatStore.deleteFolder(folderId)).catch(() => {})
}

function handleRenameFolder(folder: { id: string; name: string }) {
  ElMessageBox.prompt('请输入新名称', '重命名文件夹', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputValue: folder.name,
    inputPattern: /.+/,
    inputErrorMessage: '名称不能为空'
  }).then(({ value }) => {
    const name = (value || '').trim()
    if (name) chatStore.renameFolder(folder.id, name)
  }).catch(() => {})
}

// 显示设置本地状态（v-model 不能直接绑定 store 深层属性）
const display = reactive({
  fontSize: chatStore.displaySettings.fontSize,
  lineHeight: chatStore.displaySettings.lineHeight,
  paragraphSpacing: chatStore.displaySettings.paragraphSpacing,
  contentPadding: chatStore.displaySettings.contentPadding,
  fontFamily: chatStore.displaySettings.fontFamily
})

watch(() => chatStore.displaySettings, (val) => {
  if (val) {
    display.fontSize = val.fontSize
    display.lineHeight = val.lineHeight
    display.paragraphSpacing = val.paragraphSpacing
    display.contentPadding = val.contentPadding
    display.fontFamily = val.fontFamily
  }
}, { deep: true })

// DOM 引用
const messagesContainerRef = ref<HTMLElement | null>(null)
const scrollAnchorRef = ref<HTMLElement | null>(null)

// 建议话题
const suggestions = [
  '帮我分析当前文档的结构和逻辑',
  '如何优化这段文案的表达风格？',
  '为这个主题写一个吸引人的开头',
  '帮我检查这段文案中的语法问题',
  '针对目标受众给出改写建议'
]

// 收藏搜索过滤
const filteredFavorites = computed(() => {
  return chatFavoritesStore.searchFavorites(favoritesSearchKeyword.value)
})

// 自动滚动到底部
function scrollToBottom() {
  nextTick(() => {
    scrollAnchorRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

// 监听消息变化自动滚动
watch(() => chatStore.messages.length, () => scrollToBottom())
watch(() => chatStore.messages.map(m => m.content).join(''), () => scrollToBottom())

// 发送消息
async function handleSend() {
  const text = inputText.value.trim()
  if (!text && !uploadedFile.value) return

  if (isStreaming.value) return

  const content = text || (uploadedFile.value ? '请分析以上文件内容' : '')
  inputText.value = ''

  const fileContent = uploadedFile.value?.content
  const fileName = uploadedFile.value?.name
  uploadedFile.value = null

  try {
    await chatStore.sendMessage(content, null, fileContent, fileName)
  } catch (e: any) {
    ElMessage.error(e.message || '发送失败')
  }
}

// 追问
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

// 停止生成
function handleStop() {
  chatStore.cancelStream()
}

// 删除消息
function handleDeleteMessage(messageId: string) {
  ElMessageBox.confirm('确定要删除这条消息吗？相关追问也会一并删除。', '确认删除', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    chatStore.deleteMessage(messageId)
    ElMessage.success('消息已删除')
  }).catch(() => {})
}

// 新建对话
function handleNewSession() {
  if (chatStore.messages.length === 0) {
    // 空对话直接创建新的
    chatStore.currentSessionId = null
    chatStore.getOrCreateSession(null)
    return
  }
  ElMessageBox.confirm('确定要新建对话吗？当前对话将被保存，可随时查看。', '新建对话', {
    confirmButtonText: '新建',
    cancelButtonText: '取消',
    type: 'info'
  }).then(() => {
    chatStore.currentSessionId = null
    chatStore.getOrCreateSession(null)
    inputText.value = ''
    uploadedFile.value = null
    chatStore.clearDocumentContext()
  }).catch(() => {})
}

// 删除历史会话
function handleDeleteSession(sessionId: string) {
  const session = chatStore.sessions.find(s => s.id === sessionId)
  if (!session) return
  ElMessageBox.confirm(`确定要删除「${session.title}」吗？删除后不可恢复。`, '删除对话', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    chatStore.deleteSession(sessionId)
    ElMessage.success('对话已删除')
  }).catch(() => {})
}

// 格式化时间
function formatSessionTime(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
    return d.toLocaleDateString('zh-CN')
  } catch {
    return ''
  }
}

// 根据 session ID 生成唯一主题色
const COLORS = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#7c5cfc', '#00bcd4', '#ff9800', '#9c27b0', '#4caf50']
function sessionColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

// 文件上传
async function handleFileUpload() {
  try {
    const filePath = await window.electronAPI.selectFile()
    if (!filePath) return

    isUploading.value = true
    const result = await window.electronAPI.readFileAsText(filePath)
    if (result.success && result.content) {
      const fileName = filePath.split(/[/\\]/).pop() || '未知文件'
      uploadedFile.value = { name: fileName, content: result.content }
      ElMessage.success(`已加载文件：${fileName}`)
    } else {
      ElMessage.error(result.error || '读取文件失败')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '上传失败')
  } finally {
    isUploading.value = false
  }
}

// 清除上传文件
function clearUploadedFile() {
  uploadedFile.value = null
}

// 键盘事件
function handleInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// 显示设置变更
function onDisplayChange() {
  chatStore.updateDisplaySettings({ ...display })
}

// ===== 面板拖拽调整宽度 =====
const isResizing = ref(false)

function startResize(e: MouseEvent) {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = chatStore.panelWidth

  function onMouseMove(ev: MouseEvent) {
    // 面板在右侧，向左拖拽 = clientX 变小 = 面板变宽
    const delta = startX - ev.clientX
    chatStore.setPanelWidth(startWidth + delta)
  }

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

// 初始化会话
onMounted(() => {
  chatStore.getOrCreateSession(null)
})
</script>

<style scoped>
.chat-panel {
  width: 420px;
  min-width: 420px;
  height: 100%;
  background: #fff;
  border-left: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  transition: width 0.3s, min-width 0.3s, opacity 0.3s;
  overflow: hidden;
  position: relative;
}

/* 拖拽手柄 */
.resize-handle {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 100;
  background: transparent;
  transition: background 0.2s;
}

.resize-handle::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #e4e7ed;
  transition: background 0.2s, width 0.2s;
}

.resize-handle:hover {
  background: rgba(64, 158, 255, 0.08);
}

.resize-handle:hover::after {
  background: #409eff;
  width: 3px;
}

.resize-handle:active {
  background: rgba(64, 158, 255, 0.12);
}

.resize-handle:active::after {
  background: #409eff;
  width: 3px;
}

.chat-panel.resizing {
  transition: none !important;
  user-select: none;
}

.chat-panel.collapsed {
  width: 0;
  min-width: 0;
  border-left: none;
}

.chat-panel-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid #f0f2f5;
  background: #fafafa;
  flex-shrink: 0;
}

.chat-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.model-tag {
  font-size: 11px;
}

.chat-panel-header-actions {
  display: flex;
  gap: 4px;
}

/* 功能开关栏 */
.chat-toggle-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f2f5;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toggle-active {
  border-color: #409eff;
}

/* 上传文件提示 */
.uploaded-file-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f0f9eb;
  border-bottom: 1px solid #e1f3d8;
  font-size: 12px;
  color: #67c23a;
  flex-shrink: 0;
}

.uploaded-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 消息列表 */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  background: #f0f2f5;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
  text-align: center;
  gap: 8px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #606266;
  margin-top: 12px;
}

.empty-desc {
  font-size: 13px;
  max-width: 280px;
  line-height: 1.6;
}

.empty-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
  justify-content: center;
  max-width: 320px;
}

.suggestion-tag {
  cursor: pointer;
  font-size: 12px;
}

.suggestion-tag:hover {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

/* 输入区域 */
.chat-input-area {
  border-top: 1px solid #e8eaed;
  padding: 12px 16px 14px;
  background: #fff;
  flex-shrink: 0;
}

.chat-input-area :deep(.el-textarea__inner) {
  font-size: 14px;
  line-height: 1.6;
  border-radius: 12px;
  border-color: #e0e3e8;
  background: #f5f6f8;
  padding: 10px 14px;
  transition: border-color 0.2s, background 0.2s;
}

.chat-input-area :deep(.el-textarea__inner:focus) {
  border-color: #409eff;
  background: #fff;
}

.chat-input-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 8px;
  gap: 10px;
  padding: 0 2px;
}

.chat-input-actions .el-button {
  border-radius: 8px;
  font-weight: 500;
}

.streaming-hint {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 收藏对话框 */
.favorites-search {
  margin-bottom: 12px;
}

.favorites-empty {
  text-align: center;
  padding: 40px 0;
  color: #909399;
}

.favorites-list {
  max-height: 480px;
  overflow-y: auto;
}

.favorite-item {
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  margin-bottom: 10px;
  background: #fafafa;
}

.favorite-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.favorite-model {
  font-size: 12px;
  color: #409eff;
  font-weight: 600;
}

.favorite-time {
  font-size: 11px;
  color: #c0c4cc;
  margin-left: auto;
}

.favorite-file {
  font-size: 11px;
}

.favorite-question,
.favorite-answer {
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
  margin-bottom: 4px;
}

.favorite-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

/* 显示设置弹窗 */
.display-settings {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.display-settings .setting-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.display-settings .setting-item label {
  font-size: 12px;
  color: #606266;
  font-weight: 500;
}

/* 历史对话列表 */
.history-panel {
  display: flex;
  flex-direction: column;
}

.history-search {
  padding: 0 4px 8px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 8px;
}

.history-search-results {
  max-height: 360px;
  overflow-y: auto;
  margin-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
  padding-bottom: 8px;
}

.history-search-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.history-search-item:hover {
  background: #f0f5ff;
}

.history-search-title {
  font-size: 12px;
  font-weight: 600;
  color: #409eff;
  margin-bottom: 4px;
}

.history-search-preview {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-search-preview :deep(mark) {
  background: #fff3cd;
  color: #856404;
  padding: 1px 2px;
  border-radius: 2px;
}

.history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 8px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 8px;
}

.history-toolbar-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.history-list {
  max-height: 420px;
  overflow-y: auto;
}

.history-empty {
  text-align: center;
  padding: 24px 0;
  color: #909399;
  font-size: 13px;
}

.history-section {
  margin-bottom: 2px;
}

.history-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12px;
  color: #909399;
  font-weight: 500;
  border-radius: 4px;
}

.folder-header {
  cursor: pointer;
  user-select: none;
}

.folder-header:hover {
  background: #f5f7fa;
}

.folder-header .el-icon:first-child {
  transition: transform 0.2s;
}

.folder-header.collapsed .el-icon:first-child {
  transform: rotate(-90deg);
}

.folder-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #606266;
}

.folder-count {
  font-size: 11px;
  color: #c0c4cc;
  background: #f5f7fa;
  padding: 0 6px;
  border-radius: 10px;
}

.folder-delete {
  visibility: hidden;
  padding: 0;
}

.folder-header:hover .folder-delete {
  visibility: visible;
}

.folder-drop-zone {
  min-height: 28px;
  transition: background 0.2s;
  border-radius: 6px;
  border: 1px dashed transparent;
}

.folder-drop-zone.drag-over {
  background: #ecf5ff;
  border-color: #409eff;
}

.folder-empty {
  text-align: center;
  font-size: 11px;
  color: #c0c4cc;
  padding: 8px 0;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.history-item:hover {
  background: #f5f7fa;
}

.history-item.active {
  background: #ecf5ff;
}

.history-item.active .history-title {
  color: #409eff;
}

.history-color-bar {
  flex-shrink: 0;
  width: 3px;
  height: 28px;
  border-radius: 2px;
  background: var(--session-color);
}

.history-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-title {
  font-size: 13px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  font-size: 11px;
  color: #909399;
}

.history-pin,
.history-delete {
  visibility: hidden;
  padding: 0;
}

.history-item:hover .history-pin,
.history-item:hover .history-delete {
  visibility: visible;
}

.history-delete:hover {
  color: #f56c6c !important;
}
</style>

<style>
/* 搜索跳转高亮闪烁 */
.msg-highlight-flash {
  animation: msg-flash 0.5s ease-in-out 3;
}

@keyframes msg-flash {
  0%, 100% { background-color: transparent; }
  50% { background-color: #fff3cd; border-radius: 8px; }
}
</style>
