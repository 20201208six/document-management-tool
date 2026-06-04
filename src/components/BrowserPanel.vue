<template>
  <div class="browser-app">
    <!-- 浏览器工具栏 -->
    <div class="browser-toolbar">
      <div class="browser-nav-btns">
        <el-button size="small" circle @click="goBack" :disabled="!canGoBack" title="后退">◀</el-button>
        <el-button size="small" circle @click="goForward" :disabled="!canGoForward" title="前进">▶</el-button>
        <el-button size="small" circle @click="refreshIframe" title="刷新">⟳</el-button>
      </div>
      <div class="browser-url-bar">
        <el-input
          v-model="urlInput"
          size="small"
          placeholder="输入网址或粘贴分享文案（自动提取链接）…"
          @keydown.enter="handleUrlEnter"
          @paste="onUrlPaste"
          clearable
        />
        <el-button size="small" type="primary" @click="handleUrlEnter">访问</el-button>
        <el-button size="small" @click="handleBookmark" title="收藏当前页面">⭐ 收藏</el-button>
      </div>
      <el-button size="small" @click="showBookmarks = !showBookmarks" :type="showBookmarks ? 'primary' : ''">
        📑 书签 ({{ linkStore.bookmarks.length }})
      </el-button>
    </div>

    <!-- 书签快捷栏 -->
    <div v-if="linkStore.bookmarks.length > 0" class="bookmark-strip">
      <span
        v-for="bm in linkStore.bookmarks.slice(0, 15)"
        :key="bm.id"
        class="strip-item"
        @click="navigateTo(bm.url)"
        :title="bm.url"
      >
        {{ bm.name }}
        <el-button size="small" text class="strip-del" @click.stop="linkStore.removeBookmark(bm.id)">×</el-button>
      </span>
    </div>

    <!-- 主区域 -->
    <div class="browser-main" :class="{ 'with-sidebar': showBookmarks }">
      <div class="browser-content">
        <div v-if="!currentUrl" class="browser-welcome">
          <div class="welcome-icon">🌐</div>
          <p>在上方输入网址或粘贴分享链接开始浏览</p>
          <p class="welcome-hint">粘贴抖音/快手分享文案，自动提取链接并打开</p>
        </div>
        <template v-else>
          <div v-if="iframeBlocked" class="browser-blocked">
            <div class="blocked-icon">🔒</div>
            <p>该网站不允许嵌入显示或发生错误</p>
            <el-button type="primary" @click="openExternal(currentUrl)">在外部浏览器打开</el-button>
            <el-button size="small" style="margin-top:8px" @click="retryLoad">🔄 重试加载</el-button>
          </div>
          <webview
            v-show="!iframeBlocked"
            ref="webviewRef"
            :src="currentUrl"
            class="browser-iframe"
            allowpopups
            @dom-ready="onIframeLoad"
            @did-fail-load="onWebviewFail"
            @crashed="onWebviewCrashed"
            @destroyed="onWebviewDestroyed"
          ></webview>
        </template>
      </div>

      <!-- 收藏侧栏 -->
      <div v-if="showBookmarks" class="bookmark-sidebar">
        <div class="bookmark-sidebar-tabs">
          <span :class="{ active: bmTab === 'bookmarks' }" @click="bmTab = 'bookmarks'">📑 书签</span>
          <span :class="{ active: bmTab === 'history' }" @click="bmTab = 'history'">🕐 历史</span>
        </div>

        <!-- 书签视图 -->
        <template v-if="bmTab === 'bookmarks'">
          <div class="bookmark-sidebar-header">
            <span>书签管理</span>
            <el-button size="small" text @click="handleAddCategory">+ 分类</el-button>
          </div>
          <el-input v-model="bmSearch" size="small" placeholder="搜索…" clearable class="bm-search" />
          <div class="bookmark-list">
            <div v-for="cat in linkStore.categories" :key="cat.id" class="bm-category">
              <div class="bm-cat-header" @click="toggleCat(cat.id)" :class="{ collapsed: collapsedCats.has(cat.id) }">
                <el-icon :size="12"><ArrowRight /></el-icon>
                <span class="bm-cat-name" @dblclick.stop="handleRenameCategory(cat)">{{ cat.name }}</span>
                <span class="bm-cat-count">{{ catCount(cat.id) }}</span>
                <el-button size="small" text type="danger" class="bm-cat-del" @click.stop="linkStore.removeCategory(cat.id)">×</el-button>
              </div>
              <div v-show="!collapsedCats.has(cat.id)" class="bm-cat-drop"
                @dragover.prevent @drop.prevent="handleDropBM($event, cat.id)">
                <div v-for="bm in catBookmarks(cat.id)" :key="bm.id" class="bm-item" draggable="true"
                  @dragstart="handleBMDrag($event, bm.id)" @click="navigateTo(bm.url)">
                  <span class="bm-name">{{ bm.name }}</span>
                  <span class="bm-time">{{ formatTime(bm.createdAt) }}</span>
                  <el-button size="small" text type="danger" class="bm-del" @click.stop="linkStore.removeBookmark(bm.id)">×</el-button>
                </div>
              </div>
            </div>
            <div v-if="uncategorized.length > 0" class="bm-category">
              <div v-for="group in uncategorizedGroups" :key="group.date" class="bm-date-group">
                <div class="bm-date-header">{{ group.date }}</div>
                <div v-for="bm in group.items" :key="bm.id" class="bm-item" draggable="true"
                  @dragstart="handleBMDrag($event, bm.id)" @click="navigateTo(bm.url)">
                  <span class="bm-name">{{ bm.name }}</span>
                  <span class="bm-time">{{ formatTime(bm.createdAt) }}</span>
                  <el-button size="small" text type="danger" class="bm-del" @click.stop="linkStore.removeBookmark(bm.id)">×</el-button>
                </div>
              </div>
            </div>
            <div v-if="linkStore.bookmarks.length === 0" class="bm-empty">暂无书签</div>
          </div>
        </template>

        <!-- 历史视图 -->
        <template v-if="bmTab === 'history'">
          <div class="bookmark-sidebar-header">
            <span>🕐 访问历史</span>
            <el-button size="small" text type="danger" v-if="visitHistory.length > 0" @click="visitHistory = []">清空</el-button>
          </div>
          <div v-if="visitHistory.length === 0" class="bm-empty">暂无访问记录</div>
          <div v-else class="bookmark-list">
            <div class="history-timeline">
              <template v-for="(item, idx) in visitHistory" :key="idx">
                <div v-if="idx === 0 || item.dateLabel !== visitHistory[idx-1]?.dateLabel" class="history-date-divider">
                  <span>{{ item.dateLabel }}</span>
                </div>
                <div class="history-item" @click="navigateTo(item.url)" :title="item.url">
                  <span class="history-time">{{ item.time }}</span>
                  <span class="history-title">{{ item.title || item.url }}</span>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useLinkStore } from '@/stores/links'
import type { Bookmark, BookmarkCategory } from '@/stores/links'

const linkStore = useLinkStore()

const urlInput = ref('')
const currentUrl = ref('')
const webviewRef = ref<any>(null)
const showBookmarks = ref(false)
const bmTab = ref<'bookmarks' | 'history'>('bookmarks')
interface VisitEntry { url: string; title: string; time: string; dateLabel: string }
const visitHistory = ref<VisitEntry[]>([])
const bmSearch = ref('')
const collapsedCats = ref(new Set<string>())
const iframeBlocked = ref(false)
let iframeTimeout: ReturnType<typeof setTimeout> | null = null

// 导航历史
const history = ref<string[]>([])
const historyIdx = ref(-1)

const canGoBack = computed(() => historyIdx.value > 0)
const canGoForward = computed(() => historyIdx.value < history.value.length - 1)

/** URL 输入：自动提取链接并导航（不自动收藏） */
function handleUrlEnter() {
  const raw = urlInput.value.trim()
  if (!raw) return
  const extracted = linkStore.extractUrl(raw)
  if (extracted) {
    addToHistory(extracted, raw)
    navigateTo(extracted)
  } else if (/^https?:\/\//i.test(raw) || /^[\w-]+\.\w/.test(raw)) {
    navigateTo(raw)
  } else {
    ElMessage.warning('未检测到链接，请粘贴包含 https:// 链接的文本')
  }
}

function onUrlPaste() {
  setTimeout(() => {
    const raw = urlInput.value.trim()
    const extracted = linkStore.extractUrl(raw)
    if (extracted) {
      addToHistory(extracted, raw)
      navigateTo(extracted)
      urlInput.value = extracted
    }
  }, 50)
}

/** 添加到访问历史 */
function addToHistory(url: string, rawText: string) {
  const clean = rawText.replace(url, '').replace(/\s+/g, ' ').trim()
  const title = clean.substring(0, 40) || url
  const now = new Date()
  const entry: VisitEntry = {
    url,
    title,
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    dateLabel: now.toLocaleDateString('zh-CN')
  }
  visitHistory.value.unshift(entry)
  // 最多保留 50 条
  if (visitHistory.value.length > 50) visitHistory.value = visitHistory.value.slice(0, 50)
}

function navigateTo(url: string) {
  if (!url) return
  let fixed = url.trim()
  if (!/^https?:\/\//i.test(fixed)) fixed = 'https://' + fixed
  urlInput.value = fixed
  currentUrl.value = fixed
  iframeBlocked.value = false
  if (iframeTimeout) clearTimeout(iframeTimeout)
  iframeTimeout = setTimeout(() => { iframeBlocked.value = true }, 8000)
  if (historyIdx.value < history.value.length - 1) {
    history.value = history.value.slice(0, historyIdx.value + 1)
  }
  history.value.push(fixed)
  historyIdx.value = history.value.length - 1
}

function goBack() {
  if (!canGoBack.value) return
  historyIdx.value--
  const url = history.value[historyIdx.value]
  currentUrl.value = url; urlInput.value = url
  resetBlockedTimer()
}

function goForward() {
  if (!canGoForward.value) return
  historyIdx.value++
  const url = history.value[historyIdx.value]
  currentUrl.value = url; urlInput.value = url
  resetBlockedTimer()
}

function resetBlockedTimer() {
  iframeBlocked.value = false
  if (iframeTimeout) clearTimeout(iframeTimeout)
  iframeTimeout = setTimeout(() => { iframeBlocked.value = true }, 8000)
}

function refreshIframe() {
  resetBlockedTimer()
  if (webviewRef.value) webviewRef.value.reload()
}

function onIframeLoad() {
  if (iframeTimeout) { clearTimeout(iframeTimeout); iframeTimeout = null }
  iframeBlocked.value = false
}

function onWebviewFail() {
  iframeBlocked.value = true
}

function onWebviewCrashed() {
  iframeBlocked.value = true
}

function onWebviewDestroyed() {
  // webview 被销毁，不额外操作
}

function retryLoad() {
  iframeBlocked.value = false
  navigateTo(currentUrl.value)
}

function openExternal(url: string) {
  try { window.electronAPI.openExternal(url) } catch { window.open(url, '_blank') }
}

async function handleBookmark() {
  if (!currentUrl.value) { ElMessage.warning('请先访问一个页面'); return }
  const { value: name } = await ElMessageBox.prompt('书签名称', '收藏', {
    confirmButtonText: '收藏', cancelButtonText: '取消',
    inputValue: new URL(currentUrl.value).hostname,
    inputPattern: /.+/, inputErrorMessage: '名称不能为空'
  }).catch(() => ({ value: '' }))
  if (name) { linkStore.addBookmark(currentUrl.value, name.trim()); ElMessage.success('已收藏') }
}

// ===== 以下为书签侧栏逻辑 =====

// 分类
const uncategorizedGroups = computed(() => {
  const groups: { date: string; items: Bookmark[] }[] = []
  const seen = new Set<string>()
  for (const bm of uncategorized.value) {
    const d = bm.createdAt.split(' ')[0] || bm.createdAt
    if (!seen.has(d)) { seen.add(d); groups.push({ date: d, items: [] }) }
    groups[groups.length - 1].items.push(bm)
  }
  return groups
})

function formatTime(createdAt: string) {
  return createdAt.split(' ')[1] || createdAt
}

// 分类
function toggleCat(id: string) { const s = collapsedCats.value; s.has(id) ? s.delete(id) : s.add(id); collapsedCats.value = new Set(s) }
function catCount(catId: string) { return linkStore.bookmarks.filter(b => b.category === catId).length }
const filteredBM = computed(() => {
  const kw = bmSearch.value.toLowerCase()
  return kw ? linkStore.bookmarks.filter(b => b.name.toLowerCase().includes(kw) || b.url.toLowerCase().includes(kw)) : linkStore.bookmarks
})
const uncategorized = computed(() => filteredBM.value.filter(b => !b.category))
function catBookmarks(catId: string) { return filteredBM.value.filter(b => b.category === catId) }

function handleAddCategory() {
  ElMessageBox.prompt('分类名称', '新建', {
    confirmButtonText: '创建', cancelButtonText: '取消',
    inputPattern: /.+/, inputErrorMessage: '名称不能为空'
  }).then(({ value }) => { if (value?.trim()) linkStore.addCategory(value.trim()) }).catch(() => {})
}

function handleRenameCategory(cat: BookmarkCategory) {
  ElMessageBox.prompt('新名称', '重命名', {
    confirmButtonText: '确定', cancelButtonText: '取消',
    inputValue: cat.name, inputPattern: /.+/
  }).then(({ value }) => { if (value?.trim()) linkStore.renameCategory(cat.id, value.trim()) }).catch(() => {})
}

let dragBmId: string | null = null
function handleBMDrag(e: DragEvent, bmId: string) { dragBmId = bmId; e.dataTransfer!.effectAllowed = 'move' }
function handleDropBM(_e: DragEvent, catId: string) {
  if (dragBmId) { linkStore.moveBookmarkToCategory(dragBmId, catId); dragBmId = null }
}
</script>

<style scoped>
.browser-app { display: flex; flex-direction: column; height: 100%; background: #fff; }
.browser-toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f5f6f8; border-bottom: 1px solid #e0e3e8; flex-shrink: 0; }
.browser-nav-btns { display: flex; gap: 4px; }
.browser-url-bar { display: flex; align-items: center; gap: 6px; flex: 1; }
.browser-url-bar .el-input { flex: 1; }

/* 书签快捷栏 */
.bookmark-strip {
  display: flex;
  gap: 6px;
  padding: 6px 14px;
  background: #fafbfc;
  border-bottom: 1px solid #ebeef5;
  overflow-x: auto;
  flex-shrink: 0;
}

.strip-item {
  font-size: 11px;
  color: #409eff;
  background: #ecf5ff;
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s;
}

.strip-item:hover { background: #d9ecff; }

.strip-del {
  visibility: hidden;
  margin-left: 2px;
  font-size: 12px;
}

.strip-item:hover .strip-del { visibility: visible; }

/* 主区域 */
.browser-main { display: flex; flex: 1; min-height: 0; }
.browser-content { flex: 1; position: relative; min-width: 0; }
.browser-welcome { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #909399; gap: 8px; }
.welcome-icon { font-size: 48px; }
.welcome-hint { font-size: 12px; color: #c0c4cc; }
.browser-iframe { width: 100%; height: 100%; border: none; }
.browser-blocked { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: #909399; }
.blocked-icon { font-size: 40px; }

/* 收藏侧栏 */
.bookmark-sidebar { width: 280px; flex-shrink: 0; border-left: 1px solid #e0e3e8; display: flex; flex-direction: column; background: #fafafa; }

.bookmark-sidebar-tabs {
  display: flex;
  border-bottom: 1px solid #ebeef5;
}

.bookmark-sidebar-tabs span {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  font-size: 13px;
  cursor: pointer;
  color: #909399;
  transition: color 0.15s, border-color 0.15s;
  border-bottom: 2px solid transparent;
}

.bookmark-sidebar-tabs span.active {
  color: #409eff;
  border-bottom-color: #409eff;
}
.bookmark-sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; font-weight: 600; font-size: 13px; border-bottom: 1px solid #ebeef5; }
.bm-search { padding: 8px 12px; }
.bookmark-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.bm-category { margin-bottom: 2px; }
.bm-cat-header { display: flex; align-items: center; gap: 4px; padding: 5px 12px; font-size: 11px; color: #909399; cursor: pointer; user-select: none; }
.bm-cat-header:hover { background: #f0f2f5; }
.bm-cat-header .el-icon:first-child { transition: transform 0.2s; }
.bm-cat-header.collapsed .el-icon:first-child { transform: rotate(-90deg); }
.bm-cat-name { flex: 1; font-size: 11px; color: #606266; }
.bm-cat-count { font-size: 10px; color: #c0c4cc; background: #eee; padding: 0 5px; border-radius: 8px; }
.bm-cat-del { visibility: hidden; padding: 0; }
.bm-cat-header:hover .bm-cat-del { visibility: visible; }

.bm-item { display: flex; align-items: center; gap: 6px; padding: 5px 18px; cursor: pointer; transition: background 0.1s; }
.bm-item:hover { background: #ecf5ff; }
.bm-name { font-size: 12px; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px; }
.bm-time { flex: 1; font-size: 10px; color: #c0c4cc; white-space: nowrap; }
.bm-url { flex: 1; font-size: 10px; color: #c0c4cc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-del { visibility: hidden; padding: 0; }
.bm-item:hover .bm-del { visibility: visible; }

.bm-date-group { margin-bottom: 4px; }
.bm-date-header { font-size: 10px; color: #c0c4cc; padding: 2px 18px; font-weight: 600; }

.bm-empty { text-align: center; padding: 20px; color: #c0c4cc; font-size: 12px; }

/* 历史时间轴（侧栏内） */
.history-timeline {
  border-left: 2px solid #e0e3e8;
  padding-left: 14px;
  margin: 8px 0 8px 12px;
}

.history-date-divider {
  font-size: 10px;
  color: #c0c4cc;
  font-weight: 600;
  margin: 8px 0 4px -20px;
  padding-left: 6px;
}

.history-date-divider span {
  background: #fafafa;
  padding: 0 4px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  cursor: pointer;
  font-size: 12px;
  transition: color 0.15s;
}

.history-item:hover { color: #409eff; }

.history-time {
  font-size: 10px;
  color: #c0c4cc;
  white-space: nowrap;
  font-family: monospace;
  min-width: 42px;
}

.history-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #606266;
  flex: 1;
}

.history-item:hover .history-title { color: #409eff; }
</style>
