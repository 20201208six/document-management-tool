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
          placeholder="输入网址…"
          @keydown.enter="navigateTo(urlInput)"
          clearable
        />
        <el-button size="small" type="primary" @click="navigateTo(urlInput)">访问</el-button>
        <el-button size="small" @click="handleBookmark" title="收藏当前页面">⭐ 收藏</el-button>
      </div>
      <el-button size="small" @click="showBookmarks = !showBookmarks" :type="showBookmarks ? 'primary' : ''">
        📑 书签 ({{ linkStore.bookmarks.length }})
      </el-button>
    </div>

    <!-- 主区域 -->
    <div class="browser-main" :class="{ 'with-sidebar': showBookmarks }">
      <!-- 网页显示 -->
      <div class="browser-content">
        <div v-if="!currentUrl" class="browser-welcome">
          <div class="welcome-icon">🌐</div>
          <p>在上方输入网址开始浏览</p>
          <p class="welcome-hint">支持收藏链接、分类管理</p>
        </div>
        <template v-else>
          <webview
            v-show="!iframeBlocked"
            ref="webviewRef"
            :src="currentUrl"
            class="browser-iframe"
            @dom-ready="onIframeLoad"
          ></webview>
          <div v-if="iframeBlocked" class="browser-blocked">
            <div class="blocked-icon">🔒</div>
            <p>该网站不允许嵌入显示（X-Frame-Options）</p>
            <p class="blocked-url">{{ currentUrl }}</p>
            <el-button type="primary" @click="openExternal(currentUrl)">
              在外部浏览器打开
            </el-button>
          </div>
        </template>
      </div>

      <!-- 收藏侧栏 -->
      <div v-if="showBookmarks" class="bookmark-sidebar">
        <div class="bookmark-sidebar-header">
          <span>📑 书签</span>
          <el-button size="small" text @click="handleAddCategory">+ 分类</el-button>
        </div>

        <!-- 搜索 -->
        <el-input v-model="bmSearch" size="small" placeholder="搜索书签…" clearable class="bm-search" />

        <div class="bookmark-list">
          <!-- 分类 -->
          <div v-for="cat in linkStore.categories" :key="cat.id" class="bm-category">
            <div class="bm-cat-header" @click="toggleCat(cat.id)" :class="{ collapsed: collapsedCats.has(cat.id) }">
              <el-icon :size="12"><ArrowRight /></el-icon>
              <span class="bm-cat-name" @dblclick.stop="handleRenameCategory(cat)">{{ cat.name }}</span>
              <span class="bm-cat-count">{{ catCount(cat.id) }}</span>
              <el-button size="small" text type="danger" class="bm-cat-del" @click.stop="linkStore.removeCategory(cat.id)">
                <el-icon :size="12"><Delete /></el-icon>
              </el-button>
            </div>
            <div v-show="!collapsedCats.has(cat.id)" class="bm-cat-drop"
              @dragover.prevent @drop.prevent="handleDropBM($event, cat.id)">
              <div v-for="bm in catBookmarks(cat.id)" :key="bm.id" class="bm-item" draggable="true"
                @dragstart="handleBMDrag($event, bm.id)" @click="navigateTo(bm.url)">
                <span class="bm-name">{{ bm.name }}</span>
                <span class="bm-url">{{ bm.url }}</span>
                <el-button size="small" text type="danger" class="bm-del" @click.stop="linkStore.removeBookmark(bm.id)">
                  <el-icon :size="11"><Delete /></el-icon>
                </el-button>
              </div>
            </div>
          </div>

          <!-- 未分类 -->
          <div v-if="uncategorized.length > 0" class="bm-category">
            <div class="bm-cat-header">
              <el-icon :size="12"><Collection /></el-icon>
              <span class="bm-cat-name">未分类</span>
              <span class="bm-cat-count">{{ uncategorized.length }}</span>
            </div>
            <div v-for="bm in uncategorized" :key="bm.id" class="bm-item" draggable="true"
              @dragstart="handleBMDrag($event, bm.id)" @click="navigateTo(bm.url)">
              <span class="bm-name">{{ bm.name }}</span>
              <span class="bm-url">{{ bm.url }}</span>
              <el-button size="small" text type="danger" class="bm-del" @click.stop="linkStore.removeBookmark(bm.id)">
                <el-icon :size="11"><Delete /></el-icon>
              </el-button>
            </div>
          </div>

          <div v-if="filteredBM.length === 0 && linkStore.bookmarks.length > 0" class="bm-empty">
            未找到匹配的书签
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
import type { BookmarkCategory } from '@/stores/links'

const linkStore = useLinkStore()

const urlInput = ref('')
const currentUrl = ref('')
const iframeRef = ref<HTMLIFrameElement | null>(null)
const webviewRef = ref<any>(null)
const showBookmarks = ref(false)
const bmSearch = ref('')
const collapsedCats = ref(new Set<string>())
const iframeBlocked = ref(false)
let iframeTimeout: ReturnType<typeof setTimeout> | null = null

// 导航历史
const history = ref<string[]>([])
const historyIdx = ref(-1)

const canGoBack = computed(() => historyIdx.value > 0)
const canGoForward = computed(() => historyIdx.value < history.value.length - 1)

function navigateTo(url: string) {
  if (!url) return
  let fixed = url.trim()
  if (!/^https?:\/\//i.test(fixed)) {
    fixed = 'https://' + fixed
  }
  urlInput.value = fixed
  currentUrl.value = fixed
  iframeBlocked.value = false
  // 5秒后若未加载成功，判定为被阻止
  if (iframeTimeout) clearTimeout(iframeTimeout)
  iframeTimeout = setTimeout(() => {
    iframeBlocked.value = true
  }, 5000)
  // 更新历史
  if (historyIdx.value < history.value.length - 1) {
    history.value = history.value.slice(0, historyIdx.value + 1)
  }
  history.value.push(fixed)
  historyIdx.value = history.value.length - 1
}

function goBack() {
  if (canGoBack.value) {
    historyIdx.value--
    const url = history.value[historyIdx.value]
    currentUrl.value = url
    urlInput.value = url
    iframeBlocked.value = false
    if (iframeTimeout) clearTimeout(iframeTimeout)
    iframeTimeout = setTimeout(() => { iframeBlocked.value = true }, 5000)
  }
}

function goForward() {
  if (canGoForward.value) {
    historyIdx.value++
    const url = history.value[historyIdx.value]
    currentUrl.value = url
    urlInput.value = url
    iframeBlocked.value = false
    if (iframeTimeout) clearTimeout(iframeTimeout)
    iframeTimeout = setTimeout(() => { iframeBlocked.value = true }, 5000)
  }
}

function refreshIframe() {
  iframeBlocked.value = false
  if (iframeTimeout) clearTimeout(iframeTimeout)
  iframeTimeout = setTimeout(() => { iframeBlocked.value = true }, 5000)
  if (webviewRef.value) {
    webviewRef.value.reload()
  }
}

function onIframeLoad() {
  if (iframeTimeout) {
    clearTimeout(iframeTimeout)
    iframeTimeout = null
  }
  iframeBlocked.value = false
}

function openExternal(url: string) {
  try {
    window.electronAPI.openExternal(url)
  } catch {
    window.open(url, '_blank')
  }
}

async function handleBookmark() {
  if (!currentUrl.value) {
    ElMessage.warning('请先访问一个页面')
    return
  }
  const { value: name } = await ElMessageBox.prompt('请输入书签名称', '收藏当前页面', {
    confirmButtonText: '收藏',
    cancelButtonText: '取消',
    inputValue: new URL(currentUrl.value).hostname,
    inputPattern: /.+/,
    inputErrorMessage: '名称不能为空'
  }).catch(() => ({ value: '' }))
  if (name) {
    linkStore.addBookmark(currentUrl.value, name.trim())
    ElMessage.success('已收藏')
  }
}

// 分类
function toggleCat(id: string) {
  const s = collapsedCats.value
  s.has(id) ? s.delete(id) : s.add(id)
  collapsedCats.value = new Set(s)
}

function catCount(catId: string): number {
  return linkStore.bookmarks.filter(b => b.category === catId).length
}

const filteredBM = computed(() => {
  const kw = bmSearch.value.toLowerCase()
  if (!kw) return linkStore.bookmarks
  return linkStore.bookmarks.filter(b =>
    b.name.toLowerCase().includes(kw) || b.url.toLowerCase().includes(kw)
  )
})

const uncategorized = computed(() => filteredBM.value.filter(b => !b.category))

function catBookmarks(catId: string) {
  return filteredBM.value.filter(b => b.category === catId)
}

function handleAddCategory() {
  ElMessageBox.prompt('分类名称', '新建分类', {
    confirmButtonText: '创建', cancelButtonText: '取消',
    inputPattern: /.+/, inputErrorMessage: '名称不能为空'
  }).then(({ value }) => {
    if (value?.trim()) linkStore.addCategory(value.trim())
  }).catch(() => {})
}

function handleRenameCategory(cat: BookmarkCategory) {
  ElMessageBox.prompt('新名称', '重命名', {
    confirmButtonText: '确定', cancelButtonText: '取消',
    inputValue: cat.name, inputPattern: /.+/, inputErrorMessage: '名称不能为空'
  }).then(({ value }) => {
    if (value?.trim()) linkStore.renameCategory(cat.id, value.trim())
  }).catch(() => {})
}

let dragBmId: string | null = null
function handleBMDrag(e: DragEvent, bmId: string) {
  dragBmId = bmId
  e.dataTransfer!.effectAllowed = 'move'
}
function handleDropBM(_e: DragEvent, catId: string) {
  if (dragBmId) {
    linkStore.moveBookmarkToCategory(dragBmId, catId)
    dragBmId = null
  }
}
</script>

<style scoped>
.browser-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

/* 工具栏 */
.browser-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f5f6f8;
  border-bottom: 1px solid #e0e3e8;
  flex-shrink: 0;
}

.browser-nav-btns {
  display: flex;
  gap: 4px;
}

.browser-url-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.browser-url-bar .el-input { flex: 1; }

/* 主区域 */
.browser-main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.browser-content {
  flex: 1;
  position: relative;
  min-width: 0;
}

.browser-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
  gap: 8px;
}

.welcome-icon { font-size: 48px; }
.welcome-hint { font-size: 12px; color: #c0c4cc; }

.browser-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.browser-blocked {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: #909399;
}

.blocked-icon { font-size: 40px; }

.blocked-url {
  font-size: 12px;
  color: #c0c4cc;
  word-break: break-all;
  max-width: 400px;
  text-align: center;
}

/* 收藏侧栏 */
.bookmark-sidebar {
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid #e0e3e8;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}

.bookmark-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid #ebeef5;
}

.bm-search { padding: 8px 12px; }

.bookmark-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.bm-category { margin-bottom: 2px; }

.bm-cat-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  font-size: 11px;
  color: #909399;
  cursor: pointer;
  user-select: none;
}

.bm-cat-header:hover { background: #f0f2f5; }
.bm-cat-header .el-icon:first-child { transition: transform 0.2s; }
.bm-cat-header.collapsed .el-icon:first-child { transform: rotate(-90deg); }

.bm-cat-name {
  flex: 1;
  font-size: 11px;
  color: #606266;
}

.bm-cat-count {
  font-size: 10px;
  color: #c0c4cc;
  background: #eee;
  padding: 0 5px;
  border-radius: 8px;
}

.bm-cat-del { visibility: hidden; padding: 0; }
.bm-cat-header:hover .bm-cat-del { visibility: visible; }

.bm-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 18px;
  cursor: pointer;
  transition: background 0.1s;
}

.bm-item:hover { background: #ecf5ff; }

.bm-name {
  font-size: 12px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

.bm-url {
  flex: 1;
  font-size: 10px;
  color: #c0c4cc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-del { visibility: hidden; padding: 0; }
.bm-item:hover .bm-del { visibility: visible; }

.bm-empty {
  text-align: center;
  padding: 20px;
  color: #c0c4cc;
  font-size: 12px;
}
</style>
