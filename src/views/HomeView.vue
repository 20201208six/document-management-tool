<template>
  <div class="home-view">
    <div class="sidebar">
      <FolderBrowser />
      <FavoritesPanel />
    </div>
    <div class="main-area">
      <div class="toolbar">
        <el-button-group>
          <el-button size="small" :type="fileStore.activeTab === 'search' ? 'primary' : ''" @click="fileStore.activeTab = 'search'">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button size="small" :type="fileStore.activeTab === 'editor' ? 'primary' : ''" @click="fileStore.activeTab = 'editor'">
            <el-icon><Edit /></el-icon> 编辑
          </el-button>
          <el-button size="small" :type="fileStore.activeTab === 'favorites' ? 'primary' : ''" @click="fileStore.activeTab = 'favorites'">
            <el-icon><Star /></el-icon> 收藏
          </el-button>
          <el-button size="small" :type="fileStore.activeTab === 'browser' ? 'primary' : ''" @click="fileStore.activeTab = 'browser'">
            <el-icon><Link /></el-icon> 浏览
          </el-button>
        </el-button-group>

        <div class="toolbar-actions" v-if="fileStore.activeTab === 'editor' && fileStore.selectedFile">
          <el-button size="small" type="warning" @click="showReplaceDialog = true">
            <el-icon><Operation /></el-icon> 一键替换
          </el-button>
          <el-button size="small" type="success" @click="showCantoneseDialog = true">
            <el-icon><Connection /></el-icon> 普通话转粤语
          </el-button>
          <el-button size="small" @click="toggleFavorite">
            <el-icon><StarFilled v-if="favoritesStore.isFavorite(fileStore.selectedFile.path)" /></el-icon>
            {{ favoritesStore.isFavorite(fileStore.selectedFile.path) ? '取消收藏' : '收藏' }}
          </el-button>
          <el-button size="small" type="primary" @click="handleSave">
            <el-icon><DocumentAdd /></el-icon> 保存
          </el-button>
          <el-button size="small" type="info" @click="injectDocumentToChat">
            <el-icon><MagicStick /></el-icon> AI 分析
          </el-button>
        </div>

        <!-- 对话面板切换按钮 -->
        <div class="toolbar-chat-toggle">
          <el-tooltip :content="chatStore.isPanelOpen ? '收起对话面板' : '展开对话面板'" placement="bottom">
            <el-button
              size="small"
              :type="chatStore.isPanelOpen ? 'primary' : 'default'"
              circle
              @click="chatStore.togglePanel()"
            >
              <el-icon><ChatDotRound /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <div class="content-area">
        <div v-if="fileStore.activeTab === 'search'" class="tab-content">
          <SearchPanel />
        </div>

        <div v-if="fileStore.activeTab === 'editor'" class="tab-content editor-tab">
          <div v-if="fileStore.openTabs.length > 0" class="tab-bar">
            <div
              v-for="tab in fileStore.openTabs"
              :key="tab.path"
              class="tab-item"
              :class="{ active: tab.path === fileStore.activeTabPath, dirty: fileStore.isDirty(tab.path) }"
              @click="handleTabClick(tab.path)"
              @contextmenu.prevent="showTabMenu($event, tab.path)"
            >
              <span class="tab-name">{{ tab.name }}</span>
              <span v-if="fileStore.isDirty(tab.path)" class="tab-dirty">●</span>
              <el-button
                class="tab-close"
                size="small"
                text
                @click.stop="handleTabClose(tab.path)"
              >✕</el-button>
            </div>
          </div>
          <div v-if="!fileStore.selectedFile" class="empty-state">
            <el-icon :size="64"><Document /></el-icon>
            <p>请在左侧选择文件开始编辑</p>
          </div>
          <div v-else-if="fileStore.isLoading" class="loading-state">
            <el-icon class="is-loading" :size="32"><Loading /></el-icon>
            <p>加载中...</p>
          </div>
          <div v-else class="editor-container">
            <div class="editor-header">
              <span class="file-name">{{ fileStore.selectedFile.name }}</span>
              <span class="file-type">{{ fileStore.fileType.toUpperCase() }}</span>
              <span v-if="fileStore.highlightKeyword" class="highlight-badge">
                关键词: {{ fileStore.highlightKeyword }}
                <el-button size="small" text @click="clearHighlight">✕</el-button>
              </span>
            </div>
            <div v-if="showEditorSearch" class="editor-search-bar">
              <el-input
                ref="editorSearchInputRef"
                v-model="editorSearchKeyword"
                placeholder="在文件中搜索..."
                size="small"
                @input="onEditorSearchInput"
                @keydown="onEditorSearchKeydown"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
              <span class="search-match-count" v-if="editorSearchKeyword">
                {{ editorMatches.length > 0 ? (currentEditorMatch + 1) + '/' + editorMatches.length : '0/0' }}
              </span>
              <el-button size="small" circle @click="navigateEditorMatch(-1)" :disabled="editorMatches.length === 0" title="上一个">
                <el-icon><ArrowUp /></el-icon>
              </el-button>
              <el-button size="small" circle @click="navigateEditorMatch(1)" :disabled="editorMatches.length === 0" title="下一个">
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <el-button size="small" circle @click="closeEditorSearch" title="关闭">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <div class="editor-wrapper">
              <div v-if="fileStore.fileType === 'html'" class="rich-toolbar">
                <el-button-group size="small">
                  <el-button @click="execCmd('bold')" title="粗体 Ctrl+B"><strong>B</strong></el-button>
                  <el-button @click="execCmd('italic')" title="斜体 Ctrl+I"><em>I</em></el-button>
                  <el-button @click="execCmd('underline')" title="下划线 Ctrl+U"><u>U</u></el-button>
                </el-button-group>
                <el-select v-model="fontSize" size="small" style="width:72px;margin-left:8px" @change="setFontSize" placeholder="字号">
                  <el-option label="小" value="2" /><el-option label="中" value="3" />
                  <el-option label="大" value="5" /><el-option label="特大" value="7" />
                </el-select>
                <el-button-group size="small" style="margin-left:8px">
                  <el-button @click="execCmd('formatBlock', '<h1>')" title="标题1">H1</el-button>
                  <el-button @click="execCmd('formatBlock', '<h2>')" title="标题2">H2</el-button>
                  <el-button @click="execCmd('formatBlock', '<p>')" title="正文">P</el-button>
                </el-button-group>
                <el-button-group size="small" style="margin-left:8px">
                  <el-button @click="execCmd('insertUnorderedList')" title="无序列表">•</el-button>
                  <el-button @click="execCmd('insertOrderedList')" title="有序列表">1.</el-button>
                </el-button-group>
                <div class="toolbar-divider"></div>
                <input type="color" v-model="textColor" @change="setTextColor" title="文字颜色" class="color-picker" />
                <input type="color" v-model="bgColor" @change="setBgColor" title="背景色" class="color-picker" value="#ffff00" />
                <el-button size="small" @click="formatPainter" title="格式刷" style="margin-left:4px">🖌</el-button>
                <div class="toolbar-divider"></div>
                <el-button-group size="small">
                  <el-button @click="execCmd('undo')" title="撤销 Ctrl+Z">↩</el-button>
                  <el-button @click="execCmd('redo')" title="重做 Ctrl+Y">↪</el-button>
                </el-button-group>
              </div>
              <div v-if="fileStore.fileType === 'html'" class="rich-editor" ref="richEditorRef" contenteditable="true" @input="onRichEdit" @keydown="onRichKeydown" @contextmenu.prevent="onEditorContextMenu"></div>
              <div v-else class="edit-area">
                <textarea
                  ref="textareaRef"
                  v-model="editPlainText"
                  class="editor-textarea"
                  placeholder="在此编辑文案内容..."
                  @contextmenu.prevent="onEditorContextMenu"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <div v-if="fileStore.activeTab === 'favorites'" class="tab-content">
          <DocFavoritesPanel />
        </div>

        <div v-if="fileStore.activeTab === 'browser'" class="tab-content">
          <BrowserPanel />
        </div>
      </div>
    </div>

    <el-dialog v-model="showCreateDialog" title="新建文件" width="420px">
      <el-form :model="newFileForm" label-width="80px">
        <el-form-item label="文件名">
          <el-input v-model="newFileForm.name" placeholder="请输入文件名" />
        </el-form-item>
        <el-form-item label="文件类型">
          <el-select v-model="newFileForm.type" placeholder="选择文件类型">
            <el-option label="Word 文档 (.docx)" value="docx" />
            <el-option label="Excel 表格 (.xlsx)" value="xlsx" />
            <el-option label="文本文件 (.txt)" value="txt" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateFile">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showReplaceDialog" title="内置替换规则" width="560px">
      <el-table :data="replaceRules" size="small" max-height="300">
        <el-table-column prop="from" label="原词" width="180" />
        <el-table-column prop="to" label="替换为" width="180" />
        <el-table-column label="操作" width="80">
          <template #default="{ $index }">
            <el-button size="small" type="danger" text @click="removeRule($index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="add-rule-row">
        <el-input v-model="newRule.from" placeholder="原词" size="small" style="width: 160px" />
        <el-icon><Right /></el-icon>
        <el-input v-model="newRule.to" placeholder="替换为" size="small" style="width: 160px" />
        <el-button size="small" type="primary" @click="addNewRule">添加</el-button>
      </div>
      <template #footer>
        <el-button @click="resetRules">恢复默认</el-button>
        <el-button @click="showReplaceDialog = false">取消</el-button>
        <el-button type="primary" @click="executeReplace">一键执行替换</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCantoneseDialog" title="普通话转粤语" width="480px">
      <div class="cantonese-tip">
        <p>将对当前编辑器中的文本进行转换。</p>
        <el-form label-width="80px" size="small" style="margin-top:12px">
          <el-form-item label="转换模式">
            <el-radio-group v-model="settingsStore.cantoneseMode" @change="settingsStore.saveCantoneseSettings()">
              <el-radio value="dictionary">词库映射</el-radio>
              <el-radio value="api">API 智能转换</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="settingsStore.cantoneseMode === 'api'" label="API 密钥">
            <el-input 
              v-model="settingsStore.cantoneseApiKey" 
              placeholder="输入 DeepSeek API Key (sk-...)" 
              show-password
              @change="settingsStore.saveCantoneseSettings()"
            >
              <template #append>
                <el-tooltip content="前往 DeepSeek 官网获取 API Key">
                  <el-button @click="window.electronAPI.openExternal('https://platform.deepseek.com/api_keys')">
                    获取
                  </el-button>
                </el-tooltip>
              </template>
            </el-input>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="showCantoneseDialog = false">取消</el-button>
        <el-button type="primary" @click="executeCantoneseTranslate" :loading="isTranslating">
          执行转换
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showSavePrompt" title="提示" width="380px" :close-on-click-modal="false">
      <p style="font-size:15px;margin-bottom:12px">当前文档已修改，是否保存更改？</p>
      <p style="color:#909399;font-size:13px">{{ pendingFileName }}</p>
      <template #footer>
        <el-button @click="handleSavePrompt('cancel')">取消</el-button>
        <el-button @click="handleSavePrompt('no')">不保存</el-button>
        <el-button type="primary" @click="handleSavePrompt('save')">保存</el-button>
      </template>
    </el-dialog>

    <div v-if="showContextMenu" class="tab-context-menu" :style="{ left: menuX + 'px', top: menuY + 'px' }">
      <div class="menu-item" @click="handleContextAction('close')">关闭</div>
      <div class="menu-item" @click="handleContextAction('closeOthers')">关闭其他</div>
      <div class="menu-item" @click="handleContextAction('closeAll')">全部关闭</div>
    </div>

    <!-- 编辑器选中文字右键菜单 -->
    <div v-if="showSelectionMenu" class="selection-context-menu" :style="{ left: menuX + 'px', top: menuY + 'px' }">
      <div class="menu-item" @click="bookmarkSelection">⭐ 收藏选中文字</div>
      <div class="menu-item" @click="handleCopySelection">📋 复制</div>
    </div>

    <!-- 智能对话面板 -->
    <ChatPanel />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import FolderBrowser from '@/components/FolderBrowser.vue'
import FavoritesPanel from '@/components/FavoritesPanel.vue'
import DocFavoritesPanel from '@/components/DocFavoritesPanel.vue'
import BrowserPanel from '@/components/BrowserPanel.vue'
import SearchPanel from '@/components/SearchPanel.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import { useFileStore } from '@/stores/file'
import { useFavoritesStore } from '@/stores/favorites'
import { useDocFavoritesStore } from '@/stores/docFavorites'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore, type ReplaceRule } from '@/stores/settings'
import cantoneseDict from '@/data/cantonese-dict.json'

const fileStore = useFileStore()
const favoritesStore = useFavoritesStore()
const docFavStore = useDocFavoritesStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()

const editorContent = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const richEditorRef = ref<HTMLElement | null>(null)
const editPlainText = ref('')

function htmlToPlain(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || ''
}

function syncPlainToStore() {
  if (!fileStore.activeTabPath) return
  if (fileStore.fileType === 'html' && richEditorRef.value) {
    fileStore.updateTabContent(fileStore.activeTabPath, richEditorRef.value.innerHTML)
  } else if (fileStore.activeTabPath) {
    fileStore.updateTabContent(fileStore.activeTabPath, editPlainText.value)
  }
}

function onRichEdit() {
  if (richEditorRef.value) {
    editorContent.value = richEditorRef.value.innerHTML
  }
}

function execCmd(cmd: string, value?: string) {
  document.execCommand(cmd, false, value)
  richEditorRef.value?.focus()
  onRichEdit()
}

const fontSize = ref('')
const textColor = ref('#000000')
const bgColor = ref('#ffff00')
let formatPainterHTML = ''

function setFontSize() {
  if (fontSize.value) { execCmd('fontSize', fontSize.value); fontSize.value = '' }
}

function setTextColor() {
  execCmd('foreColor', textColor.value)
}

function setBgColor() {
  execCmd('backColor', bgColor.value)
}

function formatPainter() {
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed) {
    formatPainterHTML = getSelectedHTML()
    ElMessage.success('格式已复制，请选中目标文字后再次点击格式刷')
    return
  }
  if (formatPainterHTML && sel) {
    const range = sel.getRangeAt(0)
    const span = document.createElement('span')
    span.innerHTML = formatPainterHTML
    range.deleteContents()
    range.insertNode(span.cloneNode(true))
    formatPainterHTML = ''
    onRichEdit()
  }
}

function getSelectedHTML(): string {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return ''
  const range = sel.getRangeAt(0)
  const container = document.createElement('div')
  container.appendChild(range.cloneContents())
  return container.innerHTML
}

function onRichKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); execCmd('bold') }
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); execCmd('italic') }
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); execCmd('underline') }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); execCmd('undo') }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); execCmd('redo') }
}
const showReplaceDialog = ref(false)
const showCantoneseDialog = ref(false)
const isTranslating = ref(false)

const newFileForm = ref({ name: '', type: 'docx' })
const newRule = ref({ from: '', to: '' })
const replaceRules = ref<ReplaceRule[]>([...settingsStore.replaceRules])
const showCreateDialog = ref(false)

const showSavePrompt = ref(false)
const pendingFilePath = ref('')
const pendingFileName = ref('')
let pendingResolve: ((action: string) => void) | null = null
const showContextMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const menuTabPath = ref('')

// 编辑器选中文字右键菜单
const showSelectionMenu = ref(false)
let pendingSelectedText = ''

function onEditorContextMenu(e: MouseEvent) {
  const sel = window.getSelection()
  const text = sel?.toString().trim()
  if (!text) {
    closeSelectionMenu()
    return
  }
  pendingSelectedText = text
  menuX.value = e.clientX
  menuY.value = e.clientY
  showSelectionMenu.value = true
  setTimeout(() => document.addEventListener('click', closeSelectionMenu), 0)
}

function closeSelectionMenu() {
  showSelectionMenu.value = false
  pendingSelectedText = ''
  document.removeEventListener('click', closeSelectionMenu)
}

function bookmarkSelection() {
  const fileName = fileStore.openTabs.find(t => t.path === fileStore.activeTabPath)?.name || '未知文件'
  docFavStore.addSnippet(pendingSelectedText, fileStore.activeTabPath, fileName)
  ElMessage.success(`已收藏：${pendingSelectedText.substring(0, 30)}${pendingSelectedText.length > 30 ? '...' : ''}`)
  closeSelectionMenu()
}

function handleCopySelection() {
  navigator.clipboard.writeText(pendingSelectedText).then(() => {
    ElMessage.success('已复制到剪贴板')
  }).catch(() => {
    document.execCommand('copy')
  })
  closeSelectionMenu()
}

function dirtyCheck(path: string): Promise<string> {
  if (fileStore.isDirty(path)) {
    return new Promise((resolve) => {
      pendingFilePath.value = path
      const tab = fileStore.openTabs.find(t => t.path === path)
      pendingFileName.value = tab?.name || path
      pendingResolve = resolve
      showSavePrompt.value = true
    })
  }
  return Promise.resolve('no')
}

function handleSavePrompt(action: string) {
  showSavePrompt.value = false
  if (pendingResolve) {
    pendingResolve(action)
    pendingResolve = null
  }
}

async function handleTabClick(path: string) {
  if (path === fileStore.activeTabPath) return
  document.removeEventListener('click', closeContextMenu)
  showContextMenu.value = false
  syncPlainToStore()
  if (fileStore.isActiveDirty()) {
    const action = await dirtyCheck(fileStore.activeTabPath)
    if (action === 'cancel') return
    if (action === 'save') {
      const content = fileStore.fileContent
      await fileStore.saveFile(content)
    }
  }
  fileStore.switchToTab(path)
}

async function handleTabClose(path: string) {
  document.removeEventListener('click', closeContextMenu)
  showContextMenu.value = false
  if (path === fileStore.activeTabPath) syncPlainToStore()
  if (fileStore.isDirty(path)) {
    const action = await dirtyCheck(path)
    if (action === 'cancel') return
    if (action === 'save') {
      fileStore.activeTabPath = path
      await fileStore.saveFile(fileStore.fileContent)
    }
  }
  fileStore.closeTab(path)
}

function showTabMenu(e: MouseEvent, path: string) {
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuTabPath.value = path
  showContextMenu.value = true
  setTimeout(() => document.addEventListener('click', closeContextMenu), 0)
}

function closeContextMenu() {
  showContextMenu.value = false
  document.removeEventListener('click', closeContextMenu)
}

function handleContextAction(action: string) {
  closeContextMenu()
  if (action === 'close') handleTabClose(menuTabPath.value)
  else if (action === 'closeOthers') { fileStore.closeOtherTabs(menuTabPath.value) }
  else if (action === 'closeAll') { fileStore.closeAllTabs() }
}

const renderedHtml = computed(() => {
  if (fileStore.fileType !== 'html') return ''
  let html = editorContent.value || '<p style="color:#909399">空文档</p>'
  const kw = fileStore.highlightKeyword || editorSearchKeyword.value
  if (kw) {
    const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    html = html.replace(new RegExp(`(${escapedKw})(?![^<]*>)`, 'gi'), '<mark class="srch-hl">$1</mark>')
  }
  return html
})

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

watch(() => fileStore.fileContent, (val) => {
  editorContent.value = val || ''
  editPlainText.value = fileStore.fileType === 'html' ? htmlToPlain(val || '') : (val || '')
  nextTick(() => setRichContent(val || ''))
})

let pendingRichContent = ''
watch(richEditorRef, (el) => {
  if (el && pendingRichContent) {
    el.innerHTML = pendingRichContent
    pendingRichContent = ''
  }
})

function setRichContent(html: string) {
  if (fileStore.fileType !== 'html') return
  if (richEditorRef.value) {
    richEditorRef.value.innerHTML = html
  } else {
    pendingRichContent = html
  }
}

function syncScroll() {}

function clearHighlight() {
  fileStore.highlightKeyword = ''
  fileStore.highlightMatchText = ''
  closeEditorSearch()
}

const showEditorSearch = ref(false)
const editorSearchKeyword = ref('')
const editorSearchInputRef = ref<any>(null)
const currentEditorMatch = ref(0)

const editorMatches = computed(() => {
  const text = fileStore.fileType === 'html' ? (richEditorRef.value?.textContent || '') : editPlainText.value
  const kw = editorSearchKeyword.value
  if (!kw || !text) return [] as { pos: number; line: number }[]
  const positions: { pos: number; line: number }[] = []
  const lines = text.split('\n')
  let globalPos = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let idx = 0
    const lower = line.toLowerCase()
    const lowerKw = kw.toLowerCase()
    while ((idx = lower.indexOf(lowerKw, idx)) !== -1) {
      positions.push({ pos: globalPos + idx, line: i })
      idx += lowerKw.length
    }
    globalPos += line.length + 1
  }
  return positions
})

function openEditorSearch() {
  if (!fileStore.selectedFile) return
  showEditorSearch.value = true
  currentEditorMatch.value = 0
  nextTick(() => {
    editorSearchInputRef.value?.focus()
  })
}

function closeEditorSearch() {
  showEditorSearch.value = false
  editorSearchKeyword.value = ''
  currentEditorMatch.value = 0
}

function onEditorSearchInput() {
  currentEditorMatch.value = 0
  if (editorMatches.value.length > 0) {
    scrollToEditorMatch(0)
  }
}

function navigateEditorMatch(direction: number) {
  if (editorMatches.value.length === 0) return
  const total = editorMatches.value.length
  currentEditorMatch.value = ((currentEditorMatch.value + direction) % total + total) % total
  scrollToEditorMatch(currentEditorMatch.value)
}

function scrollToEditorMatch(index: number) {
  if (fileStore.fileType === 'html') {
    const el = richEditorRef.value
    if (!el || index >= editorMatches.value.length) return
    const m = editorMatches.value[index]
    const kw = editorSearchKeyword.value
    findAndSelectText(el, kw, m.pos)
    return
  }
  const ta = textareaRef.value
  if (!ta || index >= editorMatches.value.length) return
  const m = editorMatches.value[index]
  const kw = editorSearchKeyword.value
  ta.scrollTop = m.line * 24
  ta.focus()
  ta.setSelectionRange(m.pos, m.pos + kw.length)
}

function findAndSelectText(root: Node, kw: string, targetPos: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let curPos = 0
  let node: Text | null
  while ((node = walker.nextNode() as Text)) {
    const lower = node.textContent?.toLowerCase() || ''
    let idx = 0
    while ((idx = lower.indexOf(kw.toLowerCase(), idx)) !== -1) {
      if (curPos + idx === targetPos) {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + kw.length)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        const el = node.parentElement
        el?.scrollIntoView({ block: 'center' })
        ;(root as HTMLElement).focus()
        return
      }
      idx += kw.length
    }
    curPos += node.textContent?.length || 0
  }
}

function onEditorSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    navigateEditorMatch(e.shiftKey ? -1 : 1)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeEditorSearch()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    navigateEditorMatch(-1)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    navigateEditorMatch(1)
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    if (fileStore.activeTab === 'editor' && fileStore.selectedFile) {
      e.preventDefault()
      openEditorSearch()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

function findEditorMatchIndex(matchText: string): number {
  const matches = editorMatches.value
  if (!matchText || matches.length === 0) return 0
  const text = fileStore.fileType === 'html' ? (richEditorRef.value?.textContent || '') : editPlainText.value
  const lines = text.split('\n')
  const trimmedMatch = matchText.trim()
  const lineIdx = lines.findIndex(l => l.includes(trimmedMatch))
  if (lineIdx < 0) return 0
  const idx = matches.findIndex(m => m.line === lineIdx)
  return idx >= 0 ? idx : 0
}

watch(() => fileStore.searchJumpId, () => {
  const kw = fileStore.highlightKeyword
  if (!kw) return
  showEditorSearch.value = true
  editorSearchKeyword.value = kw
  nextTick(() => {
    // 延迟确保编辑器 DOM 完全渲染（HTML 富文本需要 innerHTML 生效）
    setTimeout(() => {
      if (editorMatches.value.length > 0) {
        currentEditorMatch.value = findEditorMatchIndex(fileStore.highlightMatchText)
        scrollToEditorMatch(currentEditorMatch.value)
      }
    }, 100)
  })
})

function toggleFavorite() {
  const file = fileStore.selectedFile
  if (!file) return
  if (favoritesStore.isFavorite(file.path)) {
    favoritesStore.removeFavorite(file.path)
    ElMessage.success('已取消收藏')
  } else {
    favoritesStore.addFavorite(file.name, file.path)
    ElMessage.success('已添加到收藏夹')
  }
}

async function handleSave() {
  syncPlainToStore()
  const content = fileStore.fileContent
  if (!content || content === '<p></p>') {
    ElMessage.warning('内容为空')
    return
  }
  const result = await fileStore.saveFile(content)
  if (result.success) {
    ElMessage.success('保存成功')
  } else {
    ElMessage.error(result.error || '保存失败')
  }
}

async function handleCreateFile() {
  const { name, type } = newFileForm.value
  if (!name.trim()) {
    ElMessage.warning('请输入文件名')
    return
  }
  let finalName = name
  if (!finalName.includes('.')) {
    finalName += '.' + type
  }
  const result = await fileStore.createFile(finalName, type)
  if (result.success) {
    ElMessage.success('文件创建成功')
    showCreateDialog.value = false
    newFileForm.value = { name: '', type: 'docx' }
  } else {
    ElMessage.error(result.error || '创建失败')
  }
}

function addNewRule() {
  if (!newRule.value.from || !newRule.value.to) {
    ElMessage.warning('请填写原词和替换词')
    return
  }
  replaceRules.value.push({ from: newRule.value.from, to: newRule.value.to })
  settingsStore.addRule(newRule.value.from, newRule.value.to)
  newRule.value = { from: '', to: '' }
}

function removeRule(index: number) {
  replaceRules.value.splice(index, 1)
  settingsStore.removeRule(index)
}

function resetRules() {
  replaceRules.value = [...settingsStore.replaceRules]
  settingsStore.resetRules()
  ElMessage.success('已恢复默认替换规则')
}

function getPlainText(): string {
  if (fileStore.fileType === 'html') return richEditorRef.value?.textContent || ''
  return editPlainText.value
}

/** 获取当前文档纯文本内容供AI分析 */
function getCurrentDocText(): string {
  if (!fileStore.selectedFile) return ''
  syncPlainToStore()
  const content = fileStore.fileContent
  if (fileStore.fileType === 'html') {
    const div = document.createElement('div')
    div.innerHTML = content
    return div.textContent || ''
  }
  return content
}

/** 将当前文档内容注入对话上下文 */
function injectDocumentToChat() {
  if (!fileStore.selectedFile) {
    ElMessage.warning('请先打开一个文档')
    return
  }
  const text = getCurrentDocText()
  if (!text.trim()) {
    ElMessage.warning('文档内容为空')
    return
  }
  chatStore.setDocumentContext({
    snippet: text.substring(0, 4000),
    filePath: fileStore.selectedFile.path,
    description: `文档「${fileStore.selectedFile.name}」的完整内容`
  })
  ElMessage.success('文档内容已注入对话上下文，AI 将基于此文档进行分析')
  chatStore.openPanel()
}

function executeReplace() {
  const text = getPlainText()
  if (!text) {
    ElMessage.warning('编辑器内容为空')
    return
  }
  settingsStore.replaceRules = [...replaceRules.value]
  const { result, count } = settingsStore.applyReplaceRules(text)
  editPlainText.value = result
  syncPlainToStore()
  showReplaceDialog.value = false
  if (count > 0) {
    ElMessage.success(`替换完成，共修改 ${count} 处`)
  } else {
    ElMessage.info('未找到可替换的内容')
  }
}

async function executeCantoneseTranslate() {
  const text = getPlainText()
  if (!text) {
    ElMessage.warning('编辑器内容为空')
    return
  }
  isTranslating.value = true
  try {
    let result = text
    let count = 0

    if (settingsStore.cantoneseMode === 'api' && settingsStore.cantoneseApiKey) {
      // DeepSeek API 智能转换
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settingsStore.cantoneseApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是一个粤语翻译专家。请将用户输入的普通话文本转换为地道粤语口语表达。只输出转换后的粤语文本，不要添加任何解释或额外内容。' },
            { role: 'user', content: text }
          ],
          temperature: 0.3,
          max_tokens: 4096
        })
      })
      const data = await response.json()
      if (data.choices && data.choices.length > 0) {
        result = data.choices[0].message.content
        count = 1
      } else if (data.error) {
        throw new Error(data.error.message || 'API 请求失败')
      }
    } else if (settingsStore.cantoneseMode === 'api') {
      ElMessage.warning('请先填写 DeepSeek API 密钥')
      isTranslating.value = false
      return
    } else {
      // 词库映射模式
      const dict = cantoneseDict as Record<string, string>
      const sortedKeys = Object.keys(dict).sort((a, b) => b.length - a.length)
      for (const key of sortedKeys) {
        if (result.includes(key)) {
          const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
          const matches = result.match(regex)
          if (matches) count += matches.length
          result = result.replace(regex, dict[key])
        }
      }
    }

    editPlainText.value = result
    syncPlainToStore()
    showCantoneseDialog.value = false
    ElMessage.success(`粤语转换完成${typeof count === 'number' ? '，共转换 ' + count + ' 处' : ''}`)
  } catch (e: any) {
    ElMessage.error(e.message || '转换失败，请检查 API 密钥')
  } finally {
    isTranslating.value = false
  }
}
</script>

<style scoped>
.home-view {
  display: flex;
  width: 100%;
  height: 100vh;
  background: #f5f6fa;
}

.sidebar {
  width: 300px;
  min-width: 300px;
  height: 100%;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  gap: 12px;
}

.toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.toolbar-chat-toggle {
  display: flex;
  gap: 8px;
  margin-left: 8px;
}

.content-area {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.tab-content {
  height: 100%;
}

.editor-tab {
  display: flex;
  flex-direction: column;
}

.empty-state, .loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
  gap: 16px;
}

.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.editor-header {
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-name {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}

.file-type {
  font-size: 12px;
  color: #909399;
  background: #f0f2f5;
  padding: 2px 8px;
  border-radius: 4px;
}

.highlight-badge {
  margin-left: auto;
  font-size: 12px;
  color: #e6a23c;
  background: #fdf6ec;
  padding: 2px 10px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.editor-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #fafafa;
  border-bottom: 1px solid #e4e7ed;
}

.editor-search-bar .el-input {
  width: 240px;
}

.search-match-count {
  font-size: 12px;
  color: #909399;
  min-width: 40px;
  text-align: center;
}

.editor-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rich-toolbar {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid #e4e7ed;
  background: #fafafa;
  gap: 6px;
  flex-wrap: wrap;
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  background: #dcdfe6;
  margin: 0 4px;
}

.color-picker {
  width: 28px;
  height: 28px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 2px;
  cursor: pointer;
  background: #fff;
}

.rich-editor {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  font-size: 15px;
  line-height: 1.8;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #303133;
  outline: none;
  min-height: 300px;
}

.rich-editor h1 { font-size: 24px; font-weight: 700; margin: 20px 0 10px; line-height: 1.3; }
.rich-editor h2 { font-size: 20px; font-weight: 600; margin: 16px 0 8px; line-height: 1.35; }
.rich-editor h3 { font-size: 17px; font-weight: 600; margin: 14px 0 6px; }
.rich-editor p { margin: 0 0 6px; }
.rich-editor strong { font-weight: 700; }
.rich-editor em { font-style: italic; }
.rich-editor ul, .rich-editor ol { margin: 4px 0 6px 0; padding-left: 24px; }
.rich-editor li { margin-bottom: 2px; }
.rich-editor blockquote { margin: 8px 0; padding: 6px 16px; border-left: 3px solid #409eff; background: #f5f7fa; }
.rich-editor table { border-collapse: collapse; margin: 8px 0; width: 100%; }
.rich-editor td, .rich-editor th { border: 1px solid #e4e7ed; padding: 6px 10px; }
.rich-editor mark.srch-hl { background: #fef08a; padding: 1px 2px; border-radius: 2px; }

.editor-mode-bar {
  display: none;
}

.tab-bar {
  display: flex;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  overflow-x: auto;
  white-space: nowrap;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px 6px 14px;
  font-size: 13px;
  cursor: pointer;
  border-right: 1px solid #e4e7ed;
  background: #f0f2f5;
  color: #606266;
  min-width: 0;
  max-width: 200px;
}

.tab-item:hover { background: #e8eaed; }
.tab-item.active { background: #fff; color: #303133; border-bottom: 2px solid #409eff; margin-bottom: -1px; }
.tab-item.dirty .tab-name { font-style: italic; }

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-dirty {
  color: #e6a23c;
  font-size: 14px;
  line-height: 1;
}

.tab-close {
  visibility: hidden;
  padding: 0 2px;
  font-size: 12px;
  color: #909399;
  min-height: auto;
}

.tab-item:hover .tab-close { visibility: visible; }
.tab-close:hover { color: #f56c6c; }

.tab-context-menu,
.selection-context-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  padding: 4px 0;
  min-width: 120px;
}

.menu-item {
  padding: 7px 16px;
  font-size: 13px;
  cursor: pointer;
  color: #303133;
}

.menu-item:hover { background: #f0f2f5; }

.edit-area, .preview-area {
  flex: 1;
  overflow-y: auto;
}

.editor-textarea {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  font-size: 15px;
  line-height: 26px;
  font-family: 'Microsoft YaHei', sans-serif;
  padding: 16px 20px;
  color: #303133;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.preview-area {
  padding: 16px 20px;
  font-size: 15px;
  line-height: 1.8;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #303133;
}

.preview-area :deep(h1) { font-size: 24px; font-weight: 700; margin: 20px 0 10px; line-height: 1.3; }
.preview-area :deep(h2) { font-size: 20px; font-weight: 600; margin: 16px 0 8px; line-height: 1.35; }
.preview-area :deep(h3) { font-size: 17px; font-weight: 600; margin: 14px 0 6px; }
.preview-area :deep(p) { margin: 0 0 6px; }
.preview-area :deep(br) { display: block; content: ''; margin-top: 4px; }
.preview-area :deep(strong) { font-weight: 700; }
.preview-area :deep(em) { font-style: italic; }
.preview-area :deep(ul), .preview-area :deep(ol) { margin: 4px 0 6px 0; padding-left: 24px; }
.preview-area :deep(li) { margin-bottom: 2px; }
.preview-area :deep(blockquote) { margin: 8px 0; padding: 6px 16px; border-left: 3px solid #409eff; background: #f5f7fa; }
.preview-area :deep(table) { border-collapse: collapse; margin: 8px 0; width: 100%; }
.preview-area :deep(td), .preview-area :deep(th) { border: 1px solid #e4e7ed; padding: 6px 10px; }
.preview-area :deep(code) { background: #f0f2f5; padding: 1px 4px; border-radius: 3px; font-family: Consolas, monospace; font-size: 14px; }
.preview-area :deep(pre) { background: #f5f7fa; padding: 12px 16px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
.preview-area :deep(hr) { border: none; border-top: 1px solid #e4e7ed; margin: 16px 0; }
.preview-area :deep(a) { color: #409eff; }
.preview-area :deep(mark.srch-hl) { background: #fef08a; color: #303133; padding: 1px 2px; border-radius: 2px; }

.add-rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 0 16px;
}

.cantonese-tip {
  padding: 10px 0;
}
</style>
