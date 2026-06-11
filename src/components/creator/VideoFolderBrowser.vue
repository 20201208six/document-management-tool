<template>
  <div class="folder-browser">
    <div class="browser-header">
      <span class="title">🎬 视频文件夹</span>
      <el-dropdown trigger="click" @command="handleDropdown">
        <el-button size="small" circle>
          <el-icon><Plus /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="select">选择文件夹</el-dropdown-item>
            <el-dropdown-item command="add-fixed">添加固定路径</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip content="刷新">
        <el-button size="small" circle @click="store.refreshVideoDir()">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <!-- 路径列表 -->
    <div class="path-list">
      <div
        v-for="fp in store.videoRootPaths"
        :key="fp.id"
        class="path-item"
        :class="{ active: fp.id === store.activeVideoRootId, invalid: !fp.isValid, default: fp.id === '_orphan_videos_' }"
        @click="store.activeVideoRootId = fp.id"
      >
        <div class="path-info">
          <span class="path-icon" v-if="fp.id === '_orphan_videos_'">📥</span>
          <span class="path-label">{{ fp.label }}</span>
          <span class="path-group" v-if="fp.group && fp.group !== '临时' && fp.id !== '_orphan_videos_'">{{ fp.group }}</span>
          <span class="path-group temp" v-else-if="fp.group === '临时'">临时</span>
          <span class="path-group default" v-else-if="fp.id === '_orphan_videos_'">默认</span>
          <span class="path-invalid" v-if="!fp.isValid" title="路径无效">⚠</span>
        </div>
        <div class="path-actions" v-if="fp.id !== '_orphan_videos_'">
          <el-button v-if="fp.group !== '临时'" size="small" text @click.stop="editPath(fp)"><el-icon><Edit /></el-icon></el-button>
          <el-button size="small" text @click.stop="store.removeVideoRootPath(fp.id)"><el-icon><Close /></el-icon></el-button>
        </div>
      </div>
      <div class="no-paths" v-if="store.videoRootPaths.length === 0" @click="handleSelectFolder">
        <el-icon><FolderAdd /></el-icon>
        <span>点击添加文件夹</span>
      </div>
    </div>

    <!-- 面包屑导航 -->
    <div class="browse-breadcrumb" v-if="store.videoCurrentFolder && store.videoCurrentFolder !== getRootPath()">
      <el-button size="small" text @click="store.navigateUpVideoDir()" title="返回上级">
        <el-icon><Back /></el-icon>
      </el-button>
      <el-button size="small" text @click="store.navigateHomeVideo()" title="回到根目录">
        🏠 {{ getRootLabel() }}
      </el-button>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-current">{{ getCurrentDirName() }}</span>
    </div>

    <!-- 文件/文件夹列表 -->
    <div class="file-list">
      <div v-if="store.videoDirLoading" class="no-paths"><span>加载中...</span></div>
      <div v-else-if="currentEntries.length === 0 && !store.videoDirLoading" class="no-paths" @click="!getRootPath() && handleSelectFolder()">
        <span>此文件夹为空</span>
      </div>
      <template v-else v-for="entry in sortedEntries" :key="entry.path">
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
        <!-- 视频文件 -->
        <div v-else
          class="file-entry"
          :class="{ selected: isActiveVideo(entry.path) }"
          @click="handleVideoClick(entry)"
        >
          <span class="asr-dot" :class="'asr-' + getAsrStatus(entry.path)" :title="getAsrTitle(entry.path)"></span>
          <el-icon class="file-icon"><VideoCamera /></el-icon>
          <div class="file-info">
            <span class="file-name">{{ entry.name }}</span>
            <span class="file-folder">{{ getVideoMeta(entry.path) }}</span>
          </div>
          <el-icon class="file-delete" v-if="isManualVideo(entry.path)" @click.stop="handleVideoDelete(entry)" :size="16"><Delete /></el-icon>
        </div>
      </template>
    </div>

    <!-- 添加/编辑路径弹窗 -->
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
          <el-input v-model="pathForm.group" placeholder="分组名称（如：素材、项目）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPathDialog = false">取消</el-button>
        <el-button type="primary" @click="savePath">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useCreatorModeStore } from '@/stores/creatorMode'

const store = useCreatorModeStore()

const showPathDialog = ref(false)
const editingPathId = ref('')
const pathForm = ref({ label: '', path: '', group: '' })

/** 根层级条目：固定根文件夹 + 孤立视频 */
const currentEntries = computed(() => {
  if (store.videoCurrentFolder || !store.activeVideoRootId) {
    return store.videoDirEntries
  }
  // 根层级：文件夹条目 + 属于当前激活根文件夹的不孤立视频
  return store.videoDirEntries
})

const sortedEntries = computed(() => {
  const arr = [...currentEntries.value]
  arr.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
  return arr
})

function getRootPath(): string {
  return store.activeVideoRootPath?.path || ''
}

function getRootLabel(): string {
  return store.activeVideoRootPath?.label || '根目录'
}

function getCurrentDirName(): string {
  const p = store.videoCurrentFolder
  if (!p) return ''
  return p.replace(/\\/g, '/').split('/').pop() || p
}

function isActiveVideo(filePath: string): boolean {
  return store.activeVideo?.path === filePath
}

function getVideoMeta(filePath: string): string {
  const v = store.importedVideos.find(v => v.path === filePath)
  if (!v) return ''
  const parts: string[] = []
  if (v.duration > 0) parts.push(store.formatTime(v.duration))
  if (v.ratio && v.ratio !== '16:9') parts.push(v.ratio)
  if (v.asrStatus === 'done' && v.subtitles.length > 0) parts.push(`${v.subtitles.length}字幕`)
  return parts.join(' ')
}

function getAsrStatus(filePath: string): string {
  const v = store.importedVideos.find(v => v.path === filePath)
  return v?.asrStatus || 'idle'
}

function getAsrTitle(filePath: string): string {
  const v = store.importedVideos.find(v => v.path === filePath)
  if (!v) return ''
  const map: Record<string, string> = {
    idle: '未转字幕',
    processing: '转写中...',
    done: `已完成 (${v.subtitles.length} 条字幕)`,
    error: '转写失败'
  }
  return map[v.asrStatus] || ''
}

function isManualVideo(filePath: string): boolean {
  const v = store.importedVideos.find(v => v.path === filePath)
  return v?.source === 'manual'
}

async function handleSelectFolder() {
  const api = (window as any).electronAPI
  if (!api?.selectFolder) return
  const selected = await api.selectFolder()
  if (selected) store.setVideoFolder(selected)
}

function handleDropdown(cmd: string) {
  if (cmd === 'select') handleSelectFolder()
  else if (cmd === 'add-fixed') openAddPath()
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
  const api = (window as any).electronAPI
  if (!api?.selectFolder) return
  const selected = await api.selectFolder()
  if (selected) pathForm.value.path = selected
}

function savePath() {
  if (!pathForm.value.path) { ElMessage.warning('请输入路径'); return }
  if (!pathForm.value.label) pathForm.value.label = pathForm.value.path.split(/[/\\]/).pop() || pathForm.value.path
  if (editingPathId.value) {
    store.updateVideoRootPath(editingPathId.value, pathForm.value)
  } else {
    const ok = store.addVideoRootPath({ path: pathForm.value.path, label: pathForm.value.label, group: pathForm.value.group })
    if (!ok) ElMessage.warning('该路径已存在')
  }
  showPathDialog.value = false
}

function handleFolderClick(entry: { path: string }) {
  store.navigateIntoVideoDir(entry.path)
}

function handleVideoClick(entry: { path: string; name: string }) {
  const existing = store.importedVideos.find(v => v.path === entry.path)
  if (existing) {
    store.setActiveVideo(existing.id)
  } else {
    // 导入单个视频
    const url = `file:///${entry.path.replace(/\\/g, '/')}`
    const video = store.addVideo({ name: entry.name } as any as File, url, entry.path)
    if (video) {
      store.setActiveVideo(video.id)
      store.restoreCachedSubtitles(video.id, entry.path)
    }
  }
}

function handleVideoDelete(entry: { path: string; name: string }) {
  const video = store.importedVideos.find(v => v.path === entry.path)
  if (video) {
    store.removeVideo(video.id)
    ElMessage.success(`已删除: ${video.name}`)
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
  padding: 10px 10px 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.browser-header .title {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
  flex: 1;
}

.path-list {
  padding: 0 6px;
  max-height: 140px;
  overflow-y: auto;
}

.path-item {
  display: flex;
  align-items: center;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1px;
  font-size: 12px;
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
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: #e6f0ff;
  color: #409eff;
  white-space: nowrap;
}

.path-group.temp {
  background: #fef0f0;
  color: #f56c6c;
}

.path-group.default {
  background: #f0f9eb;
  color: #67c23a;
}

.path-icon { font-size: 14px; flex-shrink: 0; }

.path-item.default .path-label { color: #67c23a; font-weight: 500; }

.path-invalid { color: #f56c6c; font-size: 11px; }

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
  padding: 20px 0;
  color: #909399;
  cursor: pointer;
  font-size: 12px;
  gap: 6px;
}

.no-paths:hover { color: #409eff; }

/* 面包屑导航 */
.browse-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 12px;
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

/* 文件列表 */
.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 6px;
}

.file-entry {
  display: flex;
  align-items: center;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.file-entry:hover { background: #f0f2f5; }
.file-entry.selected { background: #e6f0ff; }

.file-delete {
  visibility: hidden;
  color: #f56c6c;
  flex-shrink: 0;
  cursor: pointer;
}

.file-entry:hover .file-delete { visibility: visible; }

/* ASR 状态指示点 */
.asr-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: 4px;
}
.asr-dot.asr-idle { background: #dcdfe6; }
.asr-dot.asr-processing { background: #409eff; animation: asr-pulse 1.2s ease-in-out infinite; }
.asr-dot.asr-done { background: #67c23a; }
.asr-dot.asr-error { background: #f56c6c; }

@keyframes asr-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.file-icon { margin-right: 6px; color: #409eff; }

.folder-entry { background: #fafbfc; }
.folder-entry:hover { background: #ecf5ff; }
.folder-icon { color: #e6a23c !important; }

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
  font-size: 10px;
  color: #909399;
}
</style>
