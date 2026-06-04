<template>
  <div class="browser-panel">
    <!-- 输入区域 -->
    <div class="browser-input-area">
      <div class="browser-input-row">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="2"
          placeholder="粘贴包含链接的文本，自动提取链接…"
          resize="none"
          @paste="onPaste"
          @keydown="onInputKeydown"
        />
        <el-button type="primary" @click="handleAdd" :disabled="!inputText.trim()" style="height: auto; align-self: stretch;">
          <el-icon><Plus /></el-icon>
        </el-button>
      </div>
      <div v-if="extractedPreview.length > 0" class="extract-preview">
        <el-tag
          v-for="(url, i) in extractedPreview"
          :key="i"
          type="success"
          size="small"
          closable
          @close="extractedPreview.splice(i, 1)"
        >
          {{ url.length > 50 ? url.substring(0, 50) + '…' : url }}
        </el-tag>
      </div>
    </div>

    <!-- 视频预览 / iframe -->
    <div v-if="activeLink" class="browser-preview">
      <div class="preview-header">
        <span>{{ activeLink.title }}</span>
        <el-button size="small" text @click="openExternal(activeLink.url)">🔗 外部打开</el-button>
        <el-button size="small" text @click="activeLink = null">✕ 关闭</el-button>
      </div>
      <iframe
        v-if="activeLink"
        :src="activeLink.url"
        class="preview-iframe"
        sandbox="allow-scripts allow-same-origin allow-popups"
      ></iframe>
    </div>

    <!-- 链接表格 -->
    <div class="browser-table-wrap">
      <div v-if="linkStore.links.length === 0" class="browser-empty">
        暂无链接，复制一段包含链接的文字并粘贴到上方输入框
      </div>
      <div v-else>
        <!-- 搜索 & 排序 -->
        <div class="browser-tools">
          <el-input v-model="searchKeyword" size="small" placeholder="搜索…" clearable style="width: 200px" />
          <el-button size="small" @click="sortAsc = !sortAsc">{{ sortAsc ? '↑ 最早' : '↓ 最新' }}</el-button>
          <el-button size="small" type="danger" text @click="handleClearAll">清空全部</el-button>
        </div>

        <!-- 按日期分组 -->
        <div v-for="group in filteredGroups" :key="group.date" class="link-group">
          <div class="link-group-header">{{ group.date }}</div>
          <div
            v-for="link in group.items"
            :key="link.id"
            class="link-item"
            @click="activeLink = link"
          >
            <div class="link-item-main">
              <span class="link-title">{{ link.title }}</span>
              <span class="link-url">{{ link.url }}</span>
            </div>
            <div class="link-item-actions">
              <span class="link-time">{{ link.createdAt.split(' ')[1] || '' }}</span>
              <el-button size="small" text @click.stop="openExternal(link.url)">🔗</el-button>
              <el-button size="small" text type="danger" @click.stop="linkStore.removeLink(link.id)">🗑</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useLinkStore } from '@/stores/links'

const linkStore = useLinkStore()

const inputText = ref('')
const extractedPreview = ref<string[]>([])
const activeLink = ref<any>(null)
const searchKeyword = ref('')
const sortAsc = ref(false)

function onPaste() {
  // 粘贴后立即提取预览
  setTimeout(() => {
    extractedPreview.value = linkStore.extractUrls(inputText.value)
  }, 100)
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleAdd()
  }
}

function handleAdd() {
  const text = inputText.value.trim()
  if (!text) return
  const added = linkStore.addLink(text)
  if (added.length > 0) {
    ElMessage.success(`已保存 ${added.length} 个链接`)
    inputText.value = ''
    extractedPreview.value = []
  } else {
    const urls = linkStore.extractUrls(text)
    if (urls.length === 0) {
      ElMessage.warning('未检测到链接')
    } else {
      ElMessage.info('链接已存在')
    }
  }
}

function openExternal(url: string) {
  try {
    window.electronAPI.openExternal(url)
  } catch {
    window.open(url, '_blank')
  }
}

function handleClearAll() {
  ElMessageBox.confirm('确定清空全部链接？', '确认', {
    confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning'
  }).then(() => {
    linkStore.clearAll()
    ElMessage.success('已清空')
  }).catch(() => {})
}

const filteredGroups = computed(() => {
  const kw = searchKeyword.value.toLowerCase()
  let filtered = kw
    ? linkStore.links.filter(l =>
        l.title.toLowerCase().includes(kw) ||
        l.url.toLowerCase().includes(kw) ||
        l.rawText.toLowerCase().includes(kw)
      )
    : linkStore.links

  // 排序
  const sorted = [...filtered].sort((a, b) => {
    const cmp = a.createdAt.localeCompare(b.createdAt)
    return sortAsc.value ? cmp : -cmp
  })

  // 按日期分组
  const groups: { date: string; items: typeof sorted }[] = []
  const seen = new Set<string>()
  for (const link of sorted) {
    const date = link.createdAt.split(' ')[0] || link.createdAt
    if (!seen.has(date)) {
      seen.add(date)
      groups.push({ date, items: [] })
    }
    groups.find(g => g.date === date)!.items.push(link)
  }
  return groups
})
</script>

<style scoped>
.browser-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f6f8;
}

.browser-input-area {
  padding: 16px 20px 12px;
  background: #fff;
  border-bottom: 1px solid #e8eaed;
}

.browser-input-row {
  display: flex;
  gap: 10px;
}

.extract-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

/* 视频预览 */
.browser-preview {
  margin: 12px 20px;
  border: 1px solid #e8eaed;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid #ebeef5;
  font-size: 13px;
  color: #303133;
}

.preview-header span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-iframe {
  width: 100%;
  height: 400px;
  border: none;
}

/* 表格 */
.browser-table-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.browser-empty {
  text-align: center;
  padding: 60px 0;
  color: #909399;
  font-size: 14px;
}

.browser-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  position: sticky;
  top: 0;
  background: #f5f6f8;
  z-index: 1;
}

.link-group {
  margin-bottom: 14px;
}

.link-group-header {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  padding: 4px 6px;
  border-bottom: 1px solid #e8eaed;
  margin-bottom: 4px;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  background: #fff;
  margin-bottom: 4px;
  border: 1px solid #ebeef5;
}

.link-item:hover {
  background: #ecf5ff;
}

.link-item-main {
  flex: 1;
  min-width: 0;
}

.link-title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-url {
  display: block;
  font-size: 11px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.link-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.link-item:hover .link-item-actions {
  opacity: 1;
}

.link-time {
  font-size: 11px;
  color: #c0c4cc;
}
</style>
