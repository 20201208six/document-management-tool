<template>
  <div class="search-panel">
    <div class="search-bar">
      <el-input
        v-model="keyword"
        placeholder="输入关键词搜索所有文件夹中的文案..."
        clearable
        size="large"
        @keyup.enter="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
        <template #append>
          <el-button type="primary" @click="handleSearch" :loading="isSearching" :disabled="!keyword.trim()">
            全局搜索
          </el-button>
        </template>
      </el-input>
    </div>
    <div class="search-hint" v-if="fileStore.folderPaths.length === 0 && !keyword">
      <el-icon :size="48"><Search /></el-icon>
      <p>请先在左侧添加文件夹，然后输入关键词进行全局搜索</p>
    </div>
    <div class="search-results" v-if="results.length > 0">
      <div class="result-count">找到 {{ results.length }} 个匹配文件</div>
      <div
        v-for="result in results"
        :key="result.path"
        class="result-item"
      >
        <div class="result-header">
          <el-icon><Document /></el-icon>
          <span class="result-name" @click="openFile(result, keyword, '')" style="cursor:pointer;color:#409eff">{{ result.fileName }}</span>
          <span class="result-folder-label">{{ result.folderLabel || '' }}</span>
          <span class="result-meta">({{ result.totalMatches }} 处匹配)</span>
          <el-tooltip content="打开文件位置">
            <el-button size="small" text @click="openLocation(result.path)">
              <el-icon><FolderOpened /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
        <div class="result-matches">
          <div
            v-for="(match, idx) in result.matches"
            :key="idx"
            class="match-line"
            @click="openFile(result, keyword, match)"
            v-html="highlightMatch(match)"
          ></div>
        </div>
      </div>
    </div>
    <div class="no-results" v-else-if="searched && results.length === 0">
      未找到匹配的文案
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useFileStore } from '@/stores/file'

const fileStore = useFileStore()
const keyword = ref('')
const results = ref<any[]>([])
const isSearching = ref(false)
const searched = ref(false)

async function handleSearch() {
  if (!keyword.value.trim()) return
  if (fileStore.folderPaths.length === 0) return
  isSearching.value = true
  searched.value = true
  try {
    results.value = await fileStore.searchAllPaths(keyword.value)
  } catch (err) {
    results.value = []
  } finally {
    isSearching.value = false
  }
}

function highlightMatch(text: string): string {
  if (!keyword.value) return text
  const escaped = keyword.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<span class="highlight">$1</span>'
  )
}

async function openFile(result: any, kw: string, matchText: string) {
  try {
    // 如果文件已打开，直接切换标签页
    const existing = fileStore.openTabs.find(t => t.path === result.path)
    if (existing) {
      fileStore.switchToTab(result.path)
      fileStore.activeTab = 'search'
    } else {
      const entry = { name: result.fileName, path: result.path, isDirectory: false, isFile: true }
      await fileStore.selectFile(entry)
    }
    fileStore.navigateToSearchResult(kw, matchText)
  } catch (err) {
    console.error('打开文件失败:', err)
  }
}

async function openLocation(filePath: string) {
  await window.electronAPI.openFileLocation(filePath)
}
</script>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-bar {
  margin-bottom: 16px;
}

.search-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #909399;
  gap: 12px;
}

.search-results {
  flex: 1;
  overflow-y: auto;
}

.result-count {
  font-size: 13px;
  color: #606266;
  margin-bottom: 12px;
}

.result-item {
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.result-name {
  font-weight: 600;
  font-size: 14px;
}

.result-meta {
  font-size: 12px;
  color: #909399;
}

.result-folder-label {
  font-size: 11px;
  color: #409eff;
  background: #ecf5ff;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.result-matches {
  padding-left: 8px;
  border-left: 2px solid #e4e7ed;
}

.match-line {
  font-size: 13px;
  color: #606266;
  padding: 2px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.match-line:hover {
  background: #f5f7fa;
}

.match-line :deep(.highlight) {
  background: #fef08a;
  padding: 1px 2px;
  border-radius: 2px;
  font-weight: 600;
  color: #303133;
}

.no-results {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #909399;
  font-size: 14px;
}
</style>
