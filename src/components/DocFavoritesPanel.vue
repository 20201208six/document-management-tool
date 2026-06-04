<template>
  <div class="docfav-panel">
    <!-- 搜索 -->
    <div class="docfav-search">
      <el-input
        v-model="searchKeyword"
        size="small"
        placeholder="搜索收藏内容..."
        clearable
        :prefix-icon="Search"
      />
    </div>

    <!-- 工具栏 -->
    <div class="docfav-toolbar">
      <span class="docfav-title">📌 文档收藏 ({{ docFavStore.snippets.length }})</span>
      <el-button size="small" text @click="handleAddFolder">
        <el-icon><FolderAdd /></el-icon>
      </el-button>
    </div>

    <div v-if="displayedSnippets.length === 0" class="docfav-empty">
      {{ searchKeyword ? '未找到匹配的收藏' : '暂无收藏，选中文字后右键收藏' }}
    </div>
    <div v-else class="docfav-list">
      <!-- 文件夹 -->
      <div v-for="folder in docFavStore.folders" :key="folder.id" class="docfav-section">
        <div class="docfav-folder-header" :class="{ collapsed: collapsedFolders.has(folder.id) }" @click="toggleFolder(folder.id)">
          <el-icon :size="12"><ArrowRight /></el-icon>
          <el-icon :size="14"><Folder /></el-icon>
          <span class="docfav-folder-name" @dblclick.stop="handleRenameFolder(folder)">{{ folder.name }}</span>
          <span class="docfav-folder-count">{{ docFavStore.getFolderCount(folder.id) }}</span>
          <el-button size="small" text type="danger" class="docfav-folder-del" @click.stop="handleDeleteFolder(folder.id)">
            <el-icon :size="12"><Delete /></el-icon>
          </el-button>
        </div>
        <div v-show="!collapsedFolders.has(folder.id)"
          class="docfav-drop-zone"
          @dragover.prevent="dragOverFolder = folder.id"
          @dragleave="dragOverFolder = null"
          @drop.prevent="handleDropToFolder($event, folder.id)"
          :class="{ 'drag-over': dragOverFolder === folder.id }"
        >
          <div
            v-for="snippet in getFolderSnippets(folder.id)"
            :key="snippet.id"
            class="docfav-item"
            :draggable="true"
            @dragstart="handleDragStart($event, snippet.id)"
            @click="navigateToSnippet(snippet)"
          >
            <div class="docfav-item-text">{{ snippet.text }}</div>
            <div class="docfav-item-meta">
              <span>{{ snippet.fileName }}</span>
              <span>{{ snippet.addedAt }}</span>
              <el-button size="small" text type="danger" class="docfav-item-del" @click.stop="docFavStore.removeSnippet(snippet.id)">
                <el-icon :size="12"><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 未分类 -->
      <div v-if="uncategorizedSnippets.length > 0" class="docfav-section">
        <div class="docfav-folder-header">
          <el-icon :size="14"><Document /></el-icon>
          <span class="docfav-folder-name">未分类</span>
          <span class="docfav-folder-count">{{ uncategorizedSnippets.length }}</span>
        </div>
        <div
          v-for="snippet in uncategorizedSnippets"
          :key="snippet.id"
          class="docfav-item"
          :draggable="true"
          @dragstart="handleDragStart($event, snippet.id)"
          @click="navigateToSnippet(snippet)"
        >
          <div class="docfav-item-text">{{ snippet.text }}</div>
          <div class="docfav-item-meta">
            <span>{{ snippet.fileName }}</span>
            <span>{{ snippet.addedAt }}</span>
            <el-button size="small" text type="danger" class="docfav-item-del" @click.stop="docFavStore.removeSnippet(snippet.id)">
              <el-icon :size="12"><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { useDocFavoritesStore } from '@/stores/docFavorites'
import { useFileStore } from '@/stores/file'
import type { DocSnippet, DocFolder } from '@/stores/docFavorites'

const docFavStore = useDocFavoritesStore()
const fileStore = useFileStore()

const searchKeyword = ref('')
const collapsedFolders = ref(new Set<string>())
const dragOverFolder = ref<string | null>(null)
const dragSnippetId = ref<string | null>(null)

const displayedSnippets = computed(() =>
  searchKeyword.value ? docFavStore.searchSnippets(searchKeyword.value) : docFavStore.snippets
)

const uncategorizedSnippets = computed(() =>
  displayedSnippets.value.filter(s => !s.folderId)
)

function getFolderSnippets(folderId: string): DocSnippet[] {
  return displayedSnippets.value.filter(s => s.folderId === folderId)
}

function toggleFolder(folderId: string) {
  const s = collapsedFolders.value
  s.has(folderId) ? s.delete(folderId) : s.add(folderId)
  collapsedFolders.value = new Set(s)
}

// 拖拽
function handleDragStart(e: DragEvent, snippetId: string) {
  dragSnippetId.value = snippetId
  e.dataTransfer!.effectAllowed = 'move'
}

function handleDropToFolder(_e: DragEvent, folderId: string) {
  dragOverFolder.value = null
  if (dragSnippetId.value) {
    docFavStore.moveSnippetToFolder(dragSnippetId.value, folderId)
    dragSnippetId.value = null
  }
}

// 文件夹操作
function handleAddFolder() {
  ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
    confirmButtonText: '创建', cancelButtonText: '取消',
    inputPattern: /.+/, inputErrorMessage: '名称不能为空'
  }).then(({ value }) => {
    const name = (value || '').trim()
    if (name) docFavStore.createFolder(name)
  }).catch(() => {})
}

function handleDeleteFolder(folderId: string) {
  ElMessageBox.confirm('删除后收藏内容回到「未分类」。', '删除文件夹', {
    confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
  }).then(() => docFavStore.deleteFolder(folderId)).catch(() => {})
}

function handleRenameFolder(folder: DocFolder) {
  ElMessageBox.prompt('请输入新名称', '重命名文件夹', {
    confirmButtonText: '确定', cancelButtonText: '取消',
    inputValue: folder.name, inputPattern: /.+/, inputErrorMessage: '名称不能为空'
  }).then(({ value }) => {
    const name = (value || '').trim()
    if (name) docFavStore.renameFolder(folder.id, name)
  }).catch(() => {})
}

/** 打开收藏对应的文件并尝试选中文字 */
async function navigateToSnippet(snippet: DocSnippet) {
  // 如果文件已打开，直接切到标签页
  const existingTab = fileStore.openTabs.find(t => t.path === snippet.filePath)
  if (existingTab) {
    fileStore.switchToTab(snippet.filePath)
    fileStore.activeTab = 'editor'
    // 等待 DOM 渲染后定位文字
    await tryFindAndSelect(snippet.text)
    return
  }

  // 文件未打开，先导航到文件夹再打开
  const pathParts = snippet.filePath.replace(/\\/g, '/').split('/')
  pathParts.pop()
  const folderPath = pathParts.join('\\')
  await fileStore.setFolder(folderPath)
  const fileEntry = fileStore.files.find(f => f.path === snippet.filePath)
  if (fileEntry) {
    await fileStore.selectFile(fileEntry)
    fileStore.activeTab = 'editor'
    await tryFindAndSelect(snippet.text)
  } else {
    ElMessage.warning('文件不存在或已被移动')
  }
}

/** 带重试的文字定位 */
async function tryFindAndSelect(text: string, maxRetries = 10, interval = 200) {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, interval))
    if (findAndSelectText(text)) return
  }
  ElMessage.info('未在文档中找到该收藏文字（内容可能已被修改）')
}

/** 在编辑器中查找并选中文字，返回是否成功 */
function findAndSelectText(text: string): boolean {
  // 先找 HTML 富文本编辑器
  const richEditor = document.querySelector('.rich-editor') as HTMLElement
  if (richEditor) {
    return findInRichEditor(richEditor, text)
  }
  // 纯文本编辑器
  const textarea = document.querySelector('.editor-textarea') as HTMLTextAreaElement
  if (textarea) {
    return findInTextarea(textarea, text)
  }
  return false
}

function findInTextarea(t: HTMLTextAreaElement, text: string): boolean {
  const idx = t.value.indexOf(text)
  if (idx === -1) return false
  t.focus()
  t.setSelectionRange(idx, idx + text.length)
  t.scrollTop = t.scrollHeight * (idx / t.value.length)
  // 高亮闪烁
  flashElement(t)
  return true
}

function findInRichEditor(container: HTMLElement, text: string): boolean {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let firstIdx = -1
  let firstNode: Text | null = null
  const plainText: string[] = []
  const nodes: Text[] = []

  // 第一遍：收集所有文本节点和纯文本
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent) {
      nodes.push(node)
      plainText.push(node.textContent)
    }
  }
  const fullText = plainText.join('')

  // 先在完整纯文本中查找
  let pos = fullText.indexOf(text)
  if (pos === -1) {
    // 尝试忽略多余空白进行匹配
    const normalized = fullText.replace(/\s+/g, ' ').trim()
    const normText = text.replace(/\s+/g, ' ').trim()
    pos = normalized.indexOf(normText)
  }
  if (pos === -1) {
    // 尝试匹配前20个字符
    const shortText = text.substring(0, Math.min(20, text.length)).replace(/\s+/g, ' ').trim()
    if (shortText.length >= 5) {
      pos = fullText.replace(/\s+/g, ' ').trim().indexOf(shortText)
    }
  }
  if (pos === -1) return false

  // 定位到对应文本节点
  let offset = 0
  let targetNode: Text | null = null
  let targetOffset = 0
  for (let i = 0; i < nodes.length; i++) {
    const len = nodes[i].textContent!.length
    if (offset + len > pos) {
      targetNode = nodes[i]
      targetOffset = pos - offset
      break
    }
    offset += len
  }

  if (targetNode) {
    const range = document.createRange()
    const endPos = Math.min(targetOffset + text.length, targetNode.textContent!.length)
    range.setStart(targetNode, targetOffset)
    range.setEnd(targetNode, endPos)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // 滚动到选区
    const rect = range.getBoundingClientRect()
    container.scrollTop += rect.top - container.getBoundingClientRect().top - 100
    // 高亮闪烁
    flashElement(container.querySelector('.msg-bubble') || container)
  }
  return true
}

/** 高亮闪烁 */
function flashElement(el: Element | HTMLElement) {
  el.classList.add('docfav-highlight')
  setTimeout(() => el.classList.remove('docfav-highlight'), 2000)
}
</script>

<style scoped>
.docfav-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.docfav-search {
  padding: 8px 12px;
  border-bottom: 1px solid #ebeef5;
}

.docfav-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid #ebeef5;
}

.docfav-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.docfav-empty {
  text-align: center;
  padding: 40px 16px;
  color: #909399;
  font-size: 13px;
}

.docfav-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.docfav-section {
  margin-bottom: 2px;
}

.docfav-folder-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: #909399;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}

.docfav-folder-header:hover {
  background: #f5f7fa;
}

.docfav-folder-header .el-icon:first-child {
  transition: transform 0.2s;
}

.docfav-folder-header.collapsed .el-icon:first-child {
  transform: rotate(-90deg);
}

.docfav-folder-name {
  flex: 1;
  font-size: 12px;
  color: #606266;
}

.docfav-folder-count {
  font-size: 11px;
  color: #c0c4cc;
  background: #f5f7fa;
  padding: 0 6px;
  border-radius: 10px;
}

.docfav-folder-del {
  visibility: hidden;
  padding: 0;
}

.docfav-folder-header:hover .docfav-folder-del {
  visibility: visible;
}

.docfav-drop-zone {
  min-height: 24px;
  transition: background 0.2s;
  border-radius: 4px;
}

.docfav-drop-zone.drag-over {
  background: #ecf5ff;
}

.docfav-item {
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  margin: 2px 4px;
}

.docfav-item:hover {
  background: #f0f5ff;
}

.docfav-item-text {
  font-size: 13px;
  color: #303133;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

.docfav-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: #909399;
}

.docfav-item-meta span:first-child {
  color: #409eff;
}

.docfav-item-meta span:nth-child(2) {
  flex: 1;
}

.docfav-item-del {
  visibility: hidden;
  padding: 0;
}

.docfav-item:hover .docfav-item-del {
  visibility: visible;
}
</style>

<style>
/* 文字收藏跳转高亮 */
.docfav-highlight {
  animation: docfav-flash 0.5s ease-in-out 3;
}

@keyframes docfav-flash {
  0%, 100% { background-color: transparent; }
  50% { background-color: #fff3cd; }
}

/* textarea 高亮 */
textarea.docfav-highlight {
  outline: 3px solid #ffc107;
  outline-offset: -2px;
}

/* HTML 编辑器高亮 */
.rich-editor.docfav-highlight {
  box-shadow: 0 0 0 3px #ffc107;
  border-radius: 4px;
}
</style>
