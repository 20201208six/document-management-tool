<template>
  <div class="folder-browser">
    <div class="browser-header">
      <span class="title">📁 文件夹浏览</span>
      <el-dropdown trigger="click" @command="handleDropdown">
        <el-button size="small" circle>
          <el-icon><Plus /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="select">选择文件夹</el-dropdown-item>
            <el-dropdown-item command="add-fixed">添加固定路径</el-dropdown-item>
            <el-dropdown-item command="new-file" :disabled="!fileStore.activePathId">新建文件</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip content="刷新所有路径">
        <el-button size="small" circle @click="fileStore.refreshFiles()">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <div class="path-list">
      <div
        v-for="fp in fileStore.folderPaths"
        :key="fp.id"
        class="path-item"
        :class="{ active: fp.id === fileStore.activePathId, invalid: !fp.isValid }"
        @click="fileStore.activePathId = fp.id"
      >
        <div class="path-info">
          <span class="path-label">{{ fp.label }}</span>
          <span class="path-group" v-if="fp.group && fp.group !== '临时'">{{ fp.group }}</span>
          <span class="path-group temp" v-else-if="fp.group === '临时'">临时</span>
          <span class="path-invalid" v-if="!fp.isValid" title="路径无效">⚠</span>
        </div>
        <div class="path-actions">
          <el-button v-if="fp.group !== '临时'" size="small" text @click.stop="editPath(fp)"><el-icon><Edit /></el-icon></el-button>
          <el-button size="small" text @click.stop="fileStore.removeFolderPath(fp.id)"><el-icon><Close /></el-icon></el-button>
        </div>
      </div>
      <div class="no-paths" v-if="fileStore.folderPaths.length === 0" @click="handleSelectFolder">
        <el-icon><FolderAdd /></el-icon>
        <span>点击添加文件夹</span>
      </div>
    </div>

    <div class="quick-search" v-if="fileStore.folderPaths.length > 0 && fileStore.activePathId">
      <el-input
        v-model="searchKeyword"
        placeholder="在当前文件夹中搜索..."
        size="small"
        clearable
        @keyup.enter="doQuickSearch"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
        <template #append>
          <el-button size="small" @click="doQuickSearch" :loading="isSearching">
            <el-icon><Search /></el-icon>
          </el-button>
        </template>
      </el-input>
    </div>

    <div class="search-results" v-if="searchResults.length > 0">
      <div class="search-header">
        <span>搜索结果</span>
        <el-button size="small" text @click="searchResults = []; searchKeyword = ''">清除</el-button>
      </div>
      <div v-for="r in searchResults" :key="r.path" class="search-item" @click="openSearchResult(r)">
        <el-icon><Document /></el-icon>
        <span class="sr-name">{{ r.fileName }}</span>
        <span class="sr-count">{{ r.totalMatches }} 处</span>
      </div>
    </div>

    <!-- 面包屑导航 -->
    <div class="browse-breadcrumb" v-if="fileStore.currentFolder && fileStore.currentFolder !== getRootPath()">
      <el-button size="small" text @click="fileStore.navigateUp()" title="返回上级">
        <el-icon><Back /></el-icon>
      </el-button>
      <el-button size="small" text @click="fileStore.resetBrowsePath()" title="回到根目录">
        🏠 {{ getRootLabel() }}
      </el-button>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-current">{{ getCurrentDirName() }}</span>
    </div>

    <div class="file-list" v-if="fileStore.files.length > 0 && searchResults.length === 0">
      <template v-for="entry in sortedEntries" :key="entry.path">
        <!-- 文件夹 -->
        <div v-if="entry.isDirectory"
          class="file-entry folder-entry"
          @click="handleFolderClick(entry)"
        >
          <el-icon class="file-icon folder-icon"><Folder /></el-icon>
          <div class="file-info">
            <span class="file-name">{{ entry.name }}</span>
          </div>
        </div>
        <!-- 文件 -->
        <div v-else
          class="file-entry"
          :class="{ selected: fileStore.selectedFile?.path === entry.path }"
          @click="handleFileClick(entry)"
        >
          <el-icon class="file-icon"><component :is="getFileIcon(entry)" /></el-icon>
          <div class="file-info">
            <span class="file-name">{{ entry.name }}</span>
            <span class="file-folder" v-if="(entry as any).folderLabel && (entry as any).folderLabel">{{ (entry as any).folderLabel }}</span>
          </div>
          <div class="file-actions" @click.stop>
            <el-button size="small" text @click="openFileLocation(entry)"><el-icon><FolderOpened /></el-icon></el-button>
          </div>
        </div>
      </template>
    </div>

    <el-dialog v-model="showPathDialog" :title="editingPathId ? '编辑路径' : '添加固定路径'" width="460px" :append-to-body="true">
      <el-form :model="pathForm" label-width="70px">
        <el-form-item label="名称">
          <el-input v-model="pathForm.label" placeholder="路径显示名称" />
        </el-form-item>
        <el-form-item label="路径">
          <div style="display:flex;gap:6px;width:100%">
            <el-input v-model="pathForm.path" placeholder="文件夹路径" />
            <el-button size="small" @click="browsePath">浏览</el-button>
          </div>
        </el-form-item>
        <el-form-item label="分组">
          <el-input v-model="pathForm.group" placeholder="分组名称（如：工作、学习）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPathDialog = false">取消</el-button>
        <el-button type="primary" @click="savePath">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCreateDialog" title="新建文件" width="380px" :append-to-body="true">
      <el-form :model="newFileForm" label-width="80px">
        <el-form-item label="文件名">
          <el-input v-model="newFileForm.name" placeholder="请输入文件名" />
        </el-form-item>
        <el-form-item label="文件类型">
          <el-select v-model="newFileForm.type" placeholder="选择文件类型">
            <el-option label="Word 文档 (.docx)" value="docx" />
            <el-option label="Excel 表格 (.xlsx)" value="xlsx" />
            <el-option label="文本文件 (.txt)" value="txt" />
            <el-option label="字幕文件 (.srt)" value="srt" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateFile">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useFileStore } from '@/stores/file'

const fileStore = useFileStore()
const searchKeyword = ref('')
const searchResults = ref<any[]>([])
const isSearching = ref(false)
const showPathDialog = ref(false)
const showCreateDialog = ref(false)
const editingPathId = ref('')
const pathForm = ref({ label: '', path: '', group: '' })
const newFileForm = ref({ name: '', type: 'docx' })

/** 排序：文件夹在前，文件在后 */
const sortedEntries = computed(() => {
  const arr = [...fileStore.files]
  arr.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
  return arr
})

function getRootPath(): string {
  const active = fileStore.folderPaths.find(fp => fp.id === fileStore.activePathId)
  return active?.path || ''
}

function getRootLabel(): string {
  const active = fileStore.folderPaths.find(fp => fp.id === fileStore.activePathId)
  return active?.label || '根目录'
}

function getCurrentDirName(): string {
  const p = fileStore.currentFolder
  if (!p) return ''
  return p.replace(/\\/g, '/').split('/').pop() || p
}

async function handleSelectFolder() {
  const selected = await window.electronAPI.selectFolder()
  if (selected) fileStore.setFolder(selected)
}

function handleDropdown(cmd: string) {
  if (cmd === 'select') handleSelectFolder()
  else if (cmd === 'add-fixed') openAddPath()
  else if (cmd === 'new-file') showCreateDialog.value = true
}

function openAddPath() {
  editingPathId.value = ''
  pathForm.value = { label: '', path: '', group: '' }
  showPathDialog.value = true
}

function editPath(fp: any) {
  editingPathId.value = fp.id
  pathForm.value = { label: fp.label, path: fp.path, group: fp.group }
  showPathDialog.value = true
}

async function browsePath() {
  const selected = await window.electronAPI.selectFolder()
  if (selected) pathForm.value.path = selected
}

function savePath() {
  if (!pathForm.value.path) { ElMessage.warning('请输入路径'); return }
  if (!pathForm.value.label) pathForm.value.label = pathForm.value.path.split(/[/\\]/).pop() || pathForm.value.path
  if (editingPathId.value) {
    fileStore.updateFolderPath(editingPathId.value, pathForm.value)
  } else {
    const ok = fileStore.addFolderPath({ id: '', ...pathForm.value, isValid: true })
    if (!ok) ElMessage.warning('该路径已存在')
  }
  showPathDialog.value = false
}

function handleFileClick(entry: any) {
  fileStore.selectFile(entry)
}

function handleFolderClick(entry: any) {
  fileStore.navigateIntoDir(entry.path)
}

function getFileIcon(entry: any) {
  const ext = entry.name.split('.').pop()?.toLowerCase()
  if (ext === 'docx' || ext === 'doc') return 'Document'
  if (ext === 'xlsx' || ext === 'xls') return 'Grid'
  if (ext === 'srt') return 'VideoCamera'
  if (ext === 'json') return 'DataBoard'
  return 'Memo'
}

function openFileLocation(entry: any) {
  window.electronAPI.openFileLocation(entry.path)
}

async function doQuickSearch() {
  if (!searchKeyword.value.trim()) return
  const active = fileStore.folderPaths.find(fp => fp.id === fileStore.activePathId)
  if (!active || !active.isValid) {
    searchResults.value = []
    return
  }
  isSearching.value = true
  try {
    searchResults.value = await window.electronAPI.searchInFiles(active.path, searchKeyword.value)
  } catch {
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

async function openSearchResult(result: any) {
  const kw = searchKeyword.value
  searchResults.value = []
  searchKeyword.value = ''
  const entry = { name: result.fileName, path: result.path, isDirectory: false, isFile: true }
  await fileStore.selectFile(entry)
  const firstMatch = result.matches && result.matches.length > 0 ? result.matches[0] : ''
  fileStore.navigateToSearchResult(kw, firstMatch)
}

async function handleCreateFile() {
  const { name, type } = newFileForm.value
  if (!name.trim()) { ElMessage.warning('请输入文件名'); return }
  let finalName = name
  if (!finalName.includes('.')) finalName += '.' + type
  const result = await fileStore.createFile(finalName, type)
  if (result.success) {
    showCreateDialog.value = false
    newFileForm.value = { name: '', type: 'docx' }
    ElMessage.success('文件创建成功')
  } else {
    ElMessage.error(result.error || '创建失败')
  }
}
</script>

<style scoped>
.folder-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.browser-header {
  padding: 12px 12px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.browser-header .title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  flex: 1;
}

.path-list {
  padding: 0 8px;
  max-height: 160px;
  overflow-y: auto;
}

.path-item {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
  font-size: 13px;
}

.path-item:hover { background: #f0f2f5; }
.path-item.active { background: #e6f0ff; }
.path-item.invalid .path-label { color: #f56c6c; text-decoration: line-through; }

.path-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.path-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #303133;
}

.path-group {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  background: #e6f0ff;
  color: #409eff;
  white-space: nowrap;
}

.path-group.temp {
  background: #fef0f0;
  color: #f56c6c;
}

.path-invalid { color: #f56c6c; font-size: 12px; }

.path-actions {
  visibility: hidden;
  display: flex;
  gap: 2px;
}

.path-item:hover .path-actions { visibility: visible; }

.no-paths {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0;
  color: #909399;
  cursor: pointer;
  font-size: 13px;
  gap: 8px;
}

.no-paths:hover { color: #409eff; }

.quick-search {
  padding: 8px 12px;
}

.search-results {
  padding: 0 12px;
}

.search-header {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.search-header span:first-child { flex: 1; }

.search-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 13px;
  border-radius: 4px;
}

.search-item:hover { background: #f0f2f5; }

.sr-name { color: #409eff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.sr-folder { color: #909399; font-size: 11px; }
.sr-count { color: #909399; font-size: 11px; white-space: nowrap; }

/* 面包屑导航 */
.browse-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  font-size: 13px;
  background: #f0f5ff;
  border-bottom: 1px solid #d9ecff;
}

.breadcrumb-sep {
  color: #c0c4cc;
  margin: 0 2px;
}

.breadcrumb-current {
  color: #303133;
  font-weight: 500;
}

/* 文件夹条目样式 */
.folder-entry {
  background: #fafbfc;
}

.folder-entry:hover {
  background: #ecf5ff;
}

.folder-icon {
  color: #e6a23c !important;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.file-entry {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.file-entry:hover { background: #f0f2f5; }
.file-entry.selected { background: #e6f0ff; }

.file-icon { margin-right: 6px; color: #409eff; }

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #303133;
}

.file-folder {
  font-size: 11px;
  color: #909399;
}

.file-actions {
  visibility: hidden;
}

.file-entry:hover .file-actions { visibility: visible; }
</style>
