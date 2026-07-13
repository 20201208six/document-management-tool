<template>
  <div class="search-panel">
    <div class="search-bar">
      <div class="search-input-row">
        <el-input
          v-model="keyword"
          :placeholder="globalMode ? '输入关键词，跨模块搜索所有数据...' : '输入关键词搜索所有文件夹中的文案...'"
          clearable
          size="large"
          @keyup.enter="handleSearch"
          class="search-input"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-tooltip :content="globalMode ? '已开启全局搜索（文件+文稿+对话+项目）' : '仅搜索文件夹中的文件'" placement="bottom">
          <el-button
            size="large"
            :type="globalMode ? 'primary' : 'default'"
            :class="{ 'toggle-active': globalMode }"
            @click="globalMode = !globalMode"
          >
            <el-icon><Connection /></el-icon>
            全局
          </el-button>
        </el-tooltip>
        <el-button type="primary" size="large" @click="handleSearch" :loading="isSearching" :disabled="!keyword.trim()">
          <el-icon><Search /></el-icon>
        </el-button>
      </div>
      <div v-if="expandedTerms.length > 0" class="search-expanded-terms">
        <span class="expanded-label">扩展搜索：</span>
        <el-tag v-for="term in expandedTerms" :key="term" size="small" type="info">{{ term }}</el-tag>
      </div>
    </div>
    <div class="search-hint" v-if="fileStore.folderPaths.length === 0 && !keyword">
      <el-icon :size="48"><Search /></el-icon>
      <p>请先在左侧添加文件夹，然后输入关键词进行搜索</p>
    </div>
    <div class="search-results" v-if="totalResults > 0">
      <div class="result-count">共找到 {{ totalResults }} 条匹配结果</div>

      <!-- 文件结果 -->
      <div v-if="fileResults.length > 0" class="result-section">
        <div class="section-header" @click="fileSectionCollapsed = !fileSectionCollapsed">
          <el-icon><component :is="fileSectionCollapsed ? 'ArrowRight' : 'ArrowDown'" /></el-icon>
          📁 本地文件（{{ fileResults.length }} 条）
        </div>
        <template v-if="!fileSectionCollapsed">
          <div v-for="result in fileResults" :key="result.path" class="result-item">
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
                @click="openFile(result, keyword, match, idx)"
                v-html="highlightMatch(match)"
              ></div>
            </div>
          </div>
        </template>
      </div>

      <!-- 对话结果（仅全局模式） -->
      <div v-if="globalMode && chatResults.length > 0" class="result-section">
        <div class="section-header" @click="chatSectionCollapsed = !chatSectionCollapsed">
          <el-icon><component :is="chatSectionCollapsed ? 'ArrowRight' : 'ArrowDown'" /></el-icon>
          💬 对话记录（{{ chatResults.length }} 条）
        </div>
        <template v-if="!chatSectionCollapsed">
          <div v-for="result in chatResults" :key="result.id" class="result-item result-item--chat">
            <div class="result-header">
              <el-icon><ChatDotSquare /></el-icon>
              <span class="result-name">{{ result.title }}</span>
              <span class="result-meta">{{ result.time }}</span>
            </div>
            <div class="match-line" v-html="highlightMatch(result.snippet)"></div>
          </div>
        </template>
      </div>

      <!-- 文稿结果（仅全局模式） -->
      <div v-if="globalMode && sampleResults.length > 0" class="result-section">
        <div class="section-header" @click="sampleSectionCollapsed = !sampleSectionCollapsed">
          <el-icon><component :is="sampleSectionCollapsed ? 'ArrowRight' : 'ArrowDown'" /></el-icon>
          📊 分析文稿 · {{ uniqueAccounts.length > 0 ? uniqueAccounts.join('、') : '全部' }}（{{ sampleResults.length }} 条）
        </div>
        <template v-if="!sampleSectionCollapsed">
          <div v-for="result in sampleResults" :key="result.id" class="result-item result-item--sample">
            <div class="result-header">
              <el-icon><TrendCharts /></el-icon>
              <span class="result-name">{{ result.title || '(无标题)' }}</span>
              <span class="result-folder-label">{{ result.accountName }}</span>
            </div>
            <div class="match-line" v-html="highlightMatch(result.snippet)"></div>
          </div>
        </template>
      </div>
    </div>
    <div class="no-results" v-else-if="searched && totalResults === 0">
      未找到匹配的结果
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useFileStore } from '@/stores/file'
import { useChatStore } from '@/stores/chat'
import { useUniqueModeStore } from '@/stores/uniqueMode'
import { expandQuery } from '@/services/deepseek'

const fileStore = useFileStore()
const chatStore = useChatStore()
const uniqueStore = useUniqueModeStore()

const keyword = ref('')
const results = ref<any[]>([])
const isSearching = ref(false)
const searched = ref(false)
const globalMode = ref(false)
const expandedTerms = ref<string[]>([])

// 按来源分组的结果
const fileResults = ref<any[]>([])
const chatResults = ref<{ id: string; title: string; time: string; snippet: string }[]>([])
const sampleResults = ref<{ id: string; title: string; accountName: string; snippet: string }[]>([])

// 折叠状态
const fileSectionCollapsed = ref(false)
const chatSectionCollapsed = ref(false)
const sampleSectionCollapsed = ref(false)

const uniqueAccounts = ref<string[]>([])

const totalResults = ref(0)

async function handleSearch() {
  if (!keyword.value.trim()) return
  isSearching.value = true
  searched.value = true
  expandedTerms.value = []

  try {
    // 查询扩展（异步，不阻塞主搜索）
    const currentModel = chatStore.currentModel
    if (currentModel.apiKey) {
      expandQuery(currentModel, keyword.value).then(terms => {
        expandedTerms.value = terms
      })
    }

    // 收集所有搜索关键词
    const allKeywords = [keyword.value, ...expandedTerms.value]

    // 1. 文件搜索
    const fileResultsList: any[] = []
    const seenPaths = new Set<string>()
    if (fileStore.folderPaths.length > 0) {
      for (const kw of allKeywords) {
        try {
          const kwResults = await fileStore.searchAllPaths(kw)
          for (const r of kwResults) {
            if (!seenPaths.has(r.path)) {
              seenPaths.add(r.path)
              // 标记匹配关键词
              if (kw !== keyword.value) {
                r.matches = (r.matches || []).map((m: string) => `[${kw}] ${m}`)
              }
              fileResultsList.push(r)
            }
          }
        } catch {}
      }
    }
    fileResults.value = fileResultsList

    // 2. 全局模式：搜索对话记录
    chatResults.value = []
    if (globalMode.value && chatStore.sessions.length > 0) {
      for (const session of chatStore.sessions) {
        for (const msg of session.messages) {
          if (msg.isStreaming) continue
          for (const kw of allKeywords) {
            if (msg.content.includes(kw)) {
              const idx = msg.content.indexOf(kw)
              const start = Math.max(0, idx - 30)
              const end = Math.min(msg.content.length, idx + kw.length + 60)
              chatResults.value.push({
                id: msg.id,
                title: session.title || '新对话',
                time: msg.timestamp,
                snippet: msg.content.slice(start, end)
              })
              break
            }
          }
        }
      }
    }

    // 3. 全局模式：搜索文稿库
    sampleResults.value = []
    uniqueAccounts.value = []
    if (globalMode.value) {
      const accounts = uniqueStore.accounts || []
      uniqueAccounts.value = accounts.map((a: any) => a.name || a.id).slice(0, 5)
      const scripts = uniqueStore.scriptRecords || []
      for (const script of scripts) {
        const text = script.content || JSON.stringify(script)
        for (const kw of allKeywords) {
          if (text.includes(kw)) {
            const idx = text.indexOf(kw)
            const start = Math.max(0, idx - 30)
            const end = Math.min(text.length, idx + kw.length + 60)
            sampleResults.value.push({
              id: script.id || '',
              title: text.slice(0, 40).replace(/\n/g, ' '),
              accountName: (script as any).accountName || uniqueAccounts.value[0] || '',
              snippet: text.slice(start, end)
            })
            break
          }
        }
      }
    }

    // 兼容旧逻辑
    results.value = fileResultsList
    totalResults.value = fileResultsList.length + chatResults.value.length + sampleResults.value.length
  } catch (err) {
    results.value = []
    totalResults.value = 0
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

async function openFile(result: any, kw: string, matchText: string, matchIndex: number = -1) {
  try {
    // 如果文件已打开，直接切换标签页
    const existing = fileStore.openTabs.find(t => t.path === result.path)
    if (existing) {
      fileStore.switchToTab(result.path)
    } else {
      const entry = { name: result.fileName, path: result.path, isDirectory: false, isFile: true }
      await fileStore.selectFile(entry)
    }
    fileStore.navigateToSearchResult(kw, matchText, matchIndex)
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

.search-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
}

.toggle-active {
  border-color: #1a4cff;
  color: #1a4cff;
  background: #f4f6ff;
}

.search-expanded-terms {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.expanded-label {
  font-size: 12px;
  color: #909399;
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

.result-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  padding: 6px 0;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 8px;
}

.section-header:hover {
  color: #1a4cff;
}

.result-item {
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.result-item--chat {
  border-left: 3px solid #1a4cff;
}

.result-item--sample {
  border-left: 3px solid #e6a23c;
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
