<template>
  <div class="video-clipper">
    <!-- 顶部工具栏 -->
    <div class="clipper-toolbar">
      <div class="toolbar-left">
        <el-button size="small" @click="triggerFileImport">
          <el-icon><Upload /></el-icon> 选择视频文件
        </el-button>
        <input ref="videoInputRef" type="file" accept="video/*" multiple style="display:none" @change="handleFileImport" />
        <el-button size="small" @click="handleAsr" :disabled="!store.activeVideo || store.activeVideo.asrStatus === 'processing'" :loading="isAsrProcessing">
          <el-icon><Microphone /></el-icon> ASR 转字幕
        </el-button>
        <el-button size="small" @click="showSubtitleMgr = true">
          <el-icon><Management /></el-icon> 字幕管理
        </el-button>
        <el-divider direction="vertical" />
        <el-input v-model="searchInput" size="small" placeholder="搜索字幕/片段..." style="width:180px" clearable @input="onSearch" @clear="store.setSearchQuery('')">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>
      <div class="toolbar-right">
        <span class="clip-count">片段: {{ store.clips.length }} | 轨道: {{ store.timeline.clips.length }} | 总长: {{ store.formatTime(store.timelineTotalDuration) }}</span>
        <el-button size="small" @click="showPathDialog = true" title="设置">
          <el-icon><Setting /></el-icon>
        </el-button>
        <el-button size="small" type="success" @click="handleExport" :disabled="store.timeline.clips.length === 0">
          <el-icon><Connection /></el-icon> 导出到剪映
        </el-button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="clipper-body">
      <!-- 左侧：视频文件夹面板 -->
      <div class="sidebar-panel" :style="{ width: sidebarWidth + 'px' }">
        <VideoFolderBrowser />
      </div>

      <!-- 拖拽调整大小把手 -->
        <div class="resize-handle" @mousedown="startResizeLeft"></div>

      <!-- 中间：视频预览区 -->
      <div class="preview-panel">
        <div v-if="!store.activeVideo" class="preview-empty">
          <el-icon :size="48"><VideoCamera /></el-icon>
          <span>选择一个视频</span>
        </div>
        <div v-else class="preview-body">
          <!-- 播放器（自适应比例） -->
          <div class="video-container" :class="'ratio-' + (store.activeVideo.ratio || '16:9').replace(':', '-')">
            <video
              ref="videoRef"
              :src="store.activeVideo.url"
              class="video-player"
              @timeupdate="onTimeUpdate"
              @loadedmetadata="onMetaLoaded"
              @play="store.setIsPlaying(true)"
              @pause="store.setIsPlaying(false)"
              @error="onVideoError"
            ></video>
          </div>

          <!-- 播放控制栏 -->
          <div class="playback-bar">
            <el-button size="small" circle @click="togglePlay">
              <el-icon><VideoPause v-if="store.isPlaying" /><VideoPlay v-else /></el-icon>
            </el-button>
            <span class="time-current">{{ store.formatTime(store.currentTime) }}</span>

            <!-- 可拖拽进度条 -->
            <div class="seek-bar" ref="seekBarRef" @mousedown="onSeekStart">
              <div class="seek-track">
                <!-- 入出点区域 -->
                <div
                  v-if="store.inPointMs > 0 || store.outPointMs > 0"
                  class="seek-range"
                  :style="rangeStyle"
                ></div>
                <!-- 入点手柄 -->
                <div
                  v-if="store.inPointMs >= 0"
                  class="in-handle"
                  :style="{ left: timeToPercent(store.inPointMs / 1000) + '%' }"
                  @mousedown.stop="onInHandleStart"
                ></div>
                <!-- 出点手柄 -->
                <div
                  v-if="store.outPointMs > 0"
                  class="out-handle"
                  :style="{ left: timeToPercent(store.outPointMs / 1000) + '%' }"
                  @mousedown.stop="onOutHandleStart"
                ></div>
                <!-- 播放进度 -->
                <div class="seek-played" :style="{ width: timeToPercent(store.currentTime) + '%' }"></div>
                <!-- 当前位置指示器 -->
                <div class="seek-cursor" :style="{ left: timeToPercent(store.currentTime) + '%' }"></div>
              </div>
            </div>

            <span class="time-total">{{ store.formatTime(store.videoDuration) }}</span>

            <!-- 播放速度 -->
            <el-select v-model="playbackRate" size="small" style="width:70px" @change="setRate">
              <el-option label="1x" :value="1" />
              <el-option label="0.5x" :value="0.5" />
              <el-option label="1.5x" :value="1.5" />
              <el-option label="2x" :value="2" />
            </el-select>
          </div>

          <!-- 入出点标记区 -->
          <div class="mark-section">
            <div class="mark-buttons">
              <el-button size="small" @click="markIn">
                <el-icon><VideoPlay /></el-icon> 入点 (I)
              </el-button>
              <span class="mark-time">{{ store.inPointMs >= 0 ? store.formatTimeMs(store.inPointMs) : '--:--' }}</span>
              <el-icon><Right /></el-icon>
              <span class="mark-time">{{ store.outPointMs > 0 ? store.formatTimeMs(store.outPointMs) : store.formatTimeMs(store.currentTime * 1000) }}</span>
              <el-button size="small" @click="markOut">
                <el-icon><VideoPause /></el-icon> 出点 (O)
              </el-button>
              <span v-if="store.inPointMs >= 0 && store.outPointMs > 0 && store.outPointMs > store.inPointMs" class="mark-duration">
                时长: {{ ((store.outPointMs - store.inPointMs) / 1000).toFixed(1) }}s
              </span>
            </div>
            <el-button size="small" type="primary" @click="saveClip" :disabled="!(store.inPointMs >= 0 && store.outPointMs > store.inPointMs)">
              保存当前片段
            </el-button>
          </div>
        </div>
      </div>

      <!-- 拖拽把手（右侧面板） -->
      <div class="resize-handle right-handle" @mousedown="startResizeRight"></div>

      <!-- 右侧：字幕/片段列表 -->
      <div class="right-panel" :style="{ width: rightPanelWidth + 'px' }">
        <el-tabs v-model="rightTab" class="right-tabs">
          <el-tab-pane label="字幕" name="subtitles">
            <div class="subtitle-list" @mousemove="onSubDragMove" @mouseup="onSubDragEnd" @mouseenter="subListHovered = true" @mouseleave="subListHovered = false; onSubDragEnd()">
              <!-- 批量操作栏 -->
              <div class="sub-batch-bar" :style="{ visibility: selectedSubIndices.size > 0 ? 'visible' : 'hidden' }">
                <span>已选 {{ selectedSubIndices.size }} 条</span>
                <el-button size="small" type="primary" @click="batchClip">一键加入片段</el-button>
                <el-button size="small" @click="selectedSubIndices.clear()">取消选择</el-button>
              </div>
              <div v-if="displaySubtitles.length === 0" class="panel-empty-sm">
                <span>{{ store.searchQuery ? '无匹配结果' : '请先对视频执行 ASR 转字幕' }}</span>
              </div>
              <div
                v-for="(item, idx) in displaySubtitles"
                :key="item.segment.id"
                class="subtitle-item"
                :class="{ selected: selectedSubIndices.has(idx) }"
                @mousedown.prevent="onSubMouseDown(idx, $event)"
                @click="onSubClick(idx, $event)"
              >
                <span class="sub-time">{{ store.formatTimeMs(item.segment.startTime) }}</span>
                <span class="sub-text">{{ item.segment.text }}</span>
                <el-button size="small" text @click.stop="quickClip(item)">+片段</el-button>
                <el-button size="small" text type="danger" @click.stop="deleteSubtitle(item.videoId, item.segment.id)">删除</el-button>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="片段" name="clips">
            <div class="clip-list" @mousemove="onClipDragMove" @mouseup="onClipDragEnd" @mouseenter="clipListHovered = true" @mouseleave="clipListHovered = false; onClipDragEnd()">
              <!-- 批量操作栏 -->
              <div class="sub-batch-bar" :style="{ visibility: selectedClipIndices.size > 0 ? 'visible' : 'hidden' }">
                <span>已选 {{ selectedClipIndices.size }} 条</span>
                <el-button size="small" type="danger" @click="batchDeleteClips">批量删除</el-button>
                <el-button size="small" @click="selectedClipIndices.clear()">取消选择</el-button>
              </div>
              <div v-if="displayClips.length === 0" class="panel-empty-sm">
                <span>暂无保存的片段</span>
              </div>
              <div
                v-for="(clip, idx) in displayClips"
                :key="clip.id"
                class="clip-item-sm"
                :class="{ selected: selectedClipIndices.has(idx) }"
                draggable="true"
                @dragstart="onClipDrag(clip.id)"
                @mousedown.prevent="onClipMouseDown(idx, $event)"
                @click="onClipClick(idx, $event)"
              >
                <span class="clip-time">{{ store.formatTime(clip.startTime) }} - {{ store.formatTime(clip.endTime) }}</span>
                <span class="clip-dur">{{ clip.duration.toFixed(1) }}s</span>
                <el-button size="small" circle title="预览" @click.stop="previewClip(clip)" @mousedown.stop><el-icon><VideoPlay /></el-icon></el-button>
                <el-button size="small" circle title="加入轨道" @click.stop="store.addToTimeline(clip.id)" @mousedown.stop><el-icon><Plus /></el-icon></el-button>
                <el-button size="small" circle title="删除" @click.stop="batchDeleteOneClip(clip.id)" @mousedown.stop><el-icon><Delete /></el-icon></el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 拖拽把手（底部轨道） -->
    <div class="resize-handle-h" @mousedown="startResizeBottom"></div>

    <!-- 底部：总轨道 -->
    <div class="timeline-bar" :style="{ height: timelineHeight + 'px' }">
      <div class="timeline-header">
        <span>总轨道</span>
        <span class="timeline-total">总时长: {{ store.formatTime(store.timelineTotalDuration) }}</span>
      </div>
      <div
        class="timeline-track"
        @dragover.prevent
        @drop="onTimelineDrop"
      >
        <div v-if="store.timeline.clips.length === 0" class="track-empty">
          将右侧片段拖入此处，或点击 + 加入轨道
        </div>
        <div
          v-for="(clipId, idx) in store.timeline.clips"
          :key="clipId"
          class="track-item"
          draggable="true"
          @dragstart="onTrackDragStart(idx)"
          @dragover.prevent
          @drop="onTrackDrop(idx)"
        >
          <!-- 左拖拽手柄（调整起始时间） -->
          <div
            class="track-handle left"
            @mousedown.stop="onTrackEdgeStart(clipId, 'left', $event)"
          >◀</div>

          <span class="track-num">{{ idx + 1 }}</span>
          <span class="track-label">{{ getClipLabel(clipId) }}</span>

          <!-- 时长信息 -->
          <span class="track-time">
            <span class="track-start">{{ getClipStart(clipId) }}</span>
            <span class="track-sep">-</span>
            <span class="track-end">{{ getClipEnd(clipId) }}</span>
          </span>

          <el-button size="small" circle @click="store.removeFromTimeline(clipId)"><el-icon><Close /></el-icon></el-button>

          <!-- 右拖拽手柄（调整结束时间） -->
          <div
            class="track-handle right"
            @mousedown.stop="onTrackEdgeStart(clipId, 'right', $event)"
          >▶</div>
        </div>
      </div>
    </div>

    <!-- 剪映路径设置弹窗 -->
    <el-dialog v-model="showPathDialog" title="设置" width="480px">
      <el-form label-width="100px">
        <el-form-item label="剪映草稿目录">
          <el-input v-model="pathInput" placeholder="例如: D:\ruanjianxiazai\jianying\JianyingPro Drafts" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPathDialog = false">取消</el-button>
        <el-button type="primary" @click="savePath">保存</el-button>
      </template>
    </el-dialog>

    <!-- 导出进度弹窗 -->
    <el-dialog v-model="showExportDialog" title="导出剪映工程" width="420px" :close-on-click-modal="false">
      <!-- 步骤1：输入名称 -->
      <template v-if="exportStep === 'input'">
        <el-form label-width="80px">
          <el-form-item label="工程名称">
            <el-input v-model="exportName" placeholder="输入新建工程名称" @keyup.enter="startExport" />
          </el-form-item>
        </el-form>
        <div class="dialog-tip">将在剪映草稿目录中创建新的工程文件夹</div>
      </template>

      <!-- 步骤2：导出进度 -->
      <template v-else>
        <div class="export-status">
          <el-icon v-if="exportStatus === 'generating'" class="is-loading" :size="32"><Loading /></el-icon>
          <el-icon v-else-if="exportStatus === 'done'" :size="32" class="export-icon-done"><CircleCheck /></el-icon>
          <el-icon v-else-if="exportStatus === 'error'" :size="32" class="export-icon-error"><CircleClose /></el-icon>
          <p>{{ exportMessage }}</p>
        </div>
      </template>

      <template #footer>
        <template v-if="exportStep === 'input'">
          <el-button @click="showExportDialog = false">取消</el-button>
          <el-button type="primary" @click="startExport" :disabled="!exportName.trim()">开始导出</el-button>
        </template>
        <template v-else>
          <el-button v-if="exportStatus === 'done' || exportStatus === 'error'" @click="showExportDialog = false">关闭</el-button>
          <el-button v-if="exportStatus === 'done'" type="primary" @click="openJY">打开剪映</el-button>
        </template>
      </template>
    </el-dialog>

    <!-- 字幕管理弹窗 -->
    <el-dialog v-model="showSubtitleMgr" title="字幕管理" width="620px" :append-to-body="true" @opened="onSubMgrOpened">
      <!-- 数据存储目录 -->
      <div style="margin-bottom:12px;display:flex;gap:6px;align-items:center">
        <span class="submgr-label">字幕存储目录:</span>
        <el-input v-model="storageInput" size="small" placeholder="ASR 字幕等数据存放路径" style="flex:1" />
        <el-button size="small" @click="saveStoragePath">保存</el-button>
        <el-button size="small" @click="scanStorageSubtitles" :loading="scanningStorage">扫描目录</el-button>
      </div>
      <div v-if="allSubtitleEntries.length === 0" class="submgr-empty">
        暂无已转换的字幕，请先对视频执行 ASR 转字幕
      </div>
      <template v-else>
        <div class="submgr-count">
          共 {{ allSubtitleEntries.length }} 个字幕文件
        </div>
        <div class="sub-mgr-list" v-for="vid in allSubtitleEntries" :key="vid.id">
          <div class="sub-mgr-header" @click="toggleSubMgrExpand(vid.id)">
            <el-icon class="sub-mgr-expand" :class="{ rotated: subMgrExpanded.has(vid.id) }"><ArrowRight /></el-icon>
            <span class="sub-mgr-name">{{ vid.name }}</span>
            <span class="sub-mgr-count">{{ vid.subtitles.length }} 条</span>
            <!-- 磁盘缓存：未链接 -->
            <template v-if="vid.fromDisk && !vid.isImported && !vid.videoPath">
              <span class="submgr-tag submgr-tag-warning">⚠ 未链接视频</span>
              <el-button size="small" @click.stop="linkVideoToSubtitle(vid.diskFile)">链接视频</el-button>
            </template>
            <!-- 磁盘缓存：已链接（纯磁盘条目） -->
            <span v-else-if="vid.fromDisk && !vid.isImported && vid.videoPath" class="submgr-tag submgr-tag-success">已链接</span>
            <!-- 已导入视频：有磁盘缓存（已链接） -->
            <span v-else-if="vid.isImported && vid.fromDisk" class="submgr-tag submgr-tag-success">已链接</span>
            <el-button size="small" text @click.stop="openSubFileLocation(vid.videoPath!)" v-if="vid.videoPath">打开视频位置</el-button>
          </div>
          <div v-show="subMgrExpanded.has(vid.id)" class="sub-mgr-body">
            <div v-for="sub in vid.subtitles" :key="sub.id" class="sub-mgr-item">
              <span class="sub-mgr-time">{{ store.formatTimeMs(sub.startTime) }}</span>
              <span class="sub-mgr-text">{{ sub.text }}</span>
              <el-button size="small" text type="danger" @click="deleteSubtitle(vid.id, sub.id)">删除</el-button>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="showSubtitleMgr = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCreatorModeStore, type VideoClip } from '@/stores/creatorMode'
import { exportJianyingProject, buildProject, openJianying } from '@/services/jianying'
import type { SubtitleSegment } from '@/services/asr'
import VideoFolderBrowser from '@/components/creator/VideoFolderBrowser.vue'

const store = useCreatorModeStore()

// ===== 侧边栏拖拽调整大小 =====
const sidebarWidth = ref(240)
const rightPanelWidth = ref(260)
const timelineHeight = ref(160)
const isResizingLeft = ref(false)
const isResizingRight = ref(false)
const isResizingBottom = ref(false)

function startResizeLeft(e: MouseEvent) {
  isResizingLeft.value = true
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
}

function startResizeRight(e: MouseEvent) {
  isResizingRight.value = true
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
}

function startResizeBottom(e: MouseEvent) {
  isResizingBottom.value = true
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
}

function onResize(e: MouseEvent) {
  if (isResizingLeft.value) {
    sidebarWidth.value = Math.min(480, Math.max(180, e.clientX))
  } else if (isResizingRight.value) {
    rightPanelWidth.value = Math.min(480, Math.max(180, window.innerWidth - e.clientX))
  } else if (isResizingBottom.value) {
    timelineHeight.value = Math.min(400, Math.max(80, window.innerHeight - e.clientY))
  }
}

function stopResize() {
  isResizingLeft.value = false
  isResizingRight.value = false
  isResizingBottom.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

// ===== 视频导入 =====
const videoInputRef = ref<HTMLInputElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)

/** 批量导入视频到 store */
function importVideoBatch(videoFiles: Array<{ path: string; name: string }>): number {
  let count = 0
  for (const vf of videoFiles) {
    const url = `file:///${vf.path.replace(/\\/g, '/')}`
    const video = store.addVideo({ name: vf.name } as any as File, url, vf.path, 'manual')
    if (!video) continue
    count++
    loadCachedSubtitles(video.id, vf.path)
    detectVideoRatio(video.id, url)
  }
  return count
}

/** 从文件选择：多选视频文件 */
function triggerFileImport() {
  const api = (window as any).electronAPI
  if (api?.selectVideoFile) {
    api.selectVideoFile().then((videoFiles: Array<{ path: string; name: string }> | null) => {
      if (!videoFiles || videoFiles.length === 0) return
      const count = importVideoBatch(videoFiles)
      ElMessage.success(`已导入 ${count} 个视频`)
    })
    return
  }
  videoInputRef.value?.click()
}

/** 通过 video 元素检测视频比例和时长 */
function detectVideoRatio(videoId: string, url: string) {
  const temp = document.createElement('video')
  temp.style.display = 'none'
  document.body.appendChild(temp)
  temp.preload = 'metadata'
  temp.src = url
  temp.onloadedmetadata = () => {
    const w = temp.videoWidth
    const h = temp.videoHeight
    if (w && h) {
      store.setVideoMeta(videoId, temp.duration, w, h)
      console.log(`[比例检测] ${videoId}: ${w}x${h}, ratio=${store.importedVideos.find(v => v.id === videoId)?.ratio}`)
    } else {
      console.warn(`[比例检测] 未能读取分辨率: ${videoId}, videoWidth=${w}, videoHeight=${h}`)
    }
    document.body.removeChild(temp)
  }
  temp.onerror = (e) => {
    console.warn(`[比例检测] 加载失败: ${videoId}`, e)
    document.body.removeChild(temp)
  }
}

/** 浏览器环境：通过 <input> 导入视频 */
function handleFileImport(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  let count = 0
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const url = URL.createObjectURL(file)
    const fullPath: string = (file as any).path || file.name
    const video = store.addVideo(file, url, fullPath, 'manual')
    if (!video) continue
    count++
    loadCachedSubtitles(video.id, fullPath)
    detectVideoRatio(video.id, url)
  }
  ElMessage.success(`已导入 ${count} 个视频`)
  input.value = ''
}

/** 加载字幕缓存：只从存储目录加载 */
async function loadCachedSubtitles(videoId: string, videoPath: string) {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.readFileAsText || !store.storagePath) return

  const videoName = videoPath.split(/[\\/]/).pop()?.replace(/\.\w+$/, '') || 'unknown'
  const cachePath = `${store.storagePath.replace(/\\/g, '/')}/${videoName}.subtitles.json`

  try {
    const result = await electronAPI.readFileAsText(cachePath)
    if (!result.success) return

    const parsed = JSON.parse(result.content)
    const subtitles = parsed.subtitles || parsed
    if (Array.isArray(subtitles) && subtitles.length > 0) {
      store.setVideoSubtitles(videoId, subtitles)
      store.setAsrStatus(videoId, 'done')
      ElMessage.success(`已加载缓存字幕 (${subtitles.length} 条)`)
      console.log(`[缓存] 已加载 ${subtitles.length} 条字幕: ${cachePath}`)
    }
  } catch {
    // 缓存文件不存在或解析失败
  }
}

/** 保存字幕缓存：只保存到存储目录 */
async function saveSubtitlesCache(videoPath: string, subtitles: any[]) {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.createDirectory || !electronAPI?.writeFile || !store.storagePath) return

  const videoName = videoPath.split(/[\\/]/).pop()?.replace(/\.\w+$/, '') || 'unknown'
  const video = store.importedVideos.find(v => v.path === videoPath)
  const cacheData = subtitles.map(s => ({
    id: s.id,
    text: s.text,
    startTime: s.startTime,
    endTime: s.endTime,
    words: s.words || []
  }))
  const wrapper = {
    subtitles: cacheData,
    _meta: {
      videoPath: videoPath,
      videoName: video?.name || videoName,
      videoDuration: video?.duration || 0
    }
  }
  const json = JSON.stringify(wrapper, null, 2)

  try {
    await electronAPI.createDirectory(store.storagePath)
    const cachePath = `${store.storagePath.replace(/\\/g, '/')}/${videoName}.subtitles.json`
    await electronAPI.writeFile(cachePath, json)
    console.log(`[缓存] 已保存: ${cachePath}`)
  } catch (e) {
    console.error('[缓存] 存储目录保存失败:', e)
  }
}

// ===== 播放控制 =====
const playbackRate = ref(1)

function togglePlay() {
  const v = videoRef.value
  if (!v) return
  v.paused ? v.play() : v.pause()
}

function onTimeUpdate() {
  if (videoRef.value) store.setCurrentTime(videoRef.value.currentTime)
}

function onMetaLoaded() {
  if (videoRef.value) {
    store.setVideoDuration(videoRef.value.duration)
    store.setVideoMeta(
      store.activeVideoId!,
      videoRef.value.duration,
      videoRef.value.videoWidth,
      videoRef.value.videoHeight
    )
  }
}

function onVideoError(e: Event) {
  const v = e.target as HTMLVideoElement
  const codeMap: Record<number, string> = {
    1: 'MEDIA_ERR_ABORTED(加载中止)',
    2: 'MEDIA_ERR_NETWORK(网络错误)',
    3: 'MEDIA_ERR_DECODE(解码失败/格式不支持)',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED(源不支持)',
  }
  const code = v.error?.code || 0
  console.error(`[视频错误] code=${code} ${codeMap[code] || ''} src=${v.src.substring(0, 80)}`)
  ElMessage.error(`视频加载失败: ${codeMap[code] || '未知错误'}`)
}

function setRate(rate: number) {
  playbackRate.value = rate
  if (videoRef.value) videoRef.value.playbackRate = rate
}

// ===== 进度条交互 =====
const seekBarRef = ref<HTMLElement | null>(null)
let seekDragging = false
let inDragging = false
let outDragging = false

function timeToPercent(t: number): number {
  if (store.videoDuration <= 0) return 0
  return Math.min(100, (t / store.videoDuration) * 100)
}

function percentToTime(pct: number): number {
  return (pct / 100) * store.videoDuration
}

function onSeekStart(e: MouseEvent) {
  seekDragging = true
  updateSeek(e)
  document.addEventListener('mousemove', onSeekMove)
  document.addEventListener('mouseup', onSeekEnd)
}

function onSeekMove(e: MouseEvent) {
  if (seekDragging) updateSeek(e)
  if (inDragging) updateInHandle(e)
  if (outDragging) updateOutHandle(e)
}

function onSeekEnd() {
  seekDragging = false
  inDragging = false
  outDragging = false
  document.removeEventListener('mousemove', onSeekMove)
  document.removeEventListener('mouseup', onSeekEnd)
}

function updateSeek(e: MouseEvent) {
  const bar = seekBarRef.value
  if (!bar || !videoRef.value) return
  const rect = bar.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  videoRef.value.currentTime = pct * store.videoDuration
}

function onInHandleStart(e: MouseEvent) {
  inDragging = true
  document.addEventListener('mousemove', onSeekMove)
  document.addEventListener('mouseup', onSeekEnd)
  e.preventDefault()
}

function onOutHandleStart(e: MouseEvent) {
  outDragging = true
  document.addEventListener('mousemove', onSeekMove)
  document.addEventListener('mouseup', onSeekEnd)
  e.preventDefault()
}

function updateInHandle(e: MouseEvent) {
  const bar = seekBarRef.value
  if (!bar) return
  const rect = bar.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const ms = pct * store.videoDuration * 1000
  store.inPointMs = Math.min(ms, store.outPointMs > 0 ? store.outPointMs - 100 : Infinity)
}

function updateOutHandle(e: MouseEvent) {
  const bar = seekBarRef.value
  if (!bar) return
  const rect = bar.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const ms = pct * store.videoDuration * 1000
  store.outPointMs = Math.max(ms, store.inPointMs + 100)
}

const rangeStyle = computed(() => {
  const start = timeToPercent(store.inPointMs / 1000)
  const end = timeToPercent(store.outPointMs / 1000)
  return { left: start + '%', width: (end - start) + '%' }
})

// ===== 入出点标记 =====
function markIn() {
  store.inPointMs = Math.round(store.currentTime * 1000)
  if (store.outPointMs > 0 && store.inPointMs >= store.outPointMs) store.outPointMs = 0
  ElMessage.success(`入点: ${store.formatTime(store.currentTime)}`)
}

function markOut() {
  const ms = Math.round(store.currentTime * 1000)
  if (store.inPointMs >= 0 && ms <= store.inPointMs) {
    ElMessage.warning('出点必须在入点之后')
    return
  }
  store.outPointMs = ms
  ElMessage.success(`出点: ${store.formatTime(store.currentTime)}`)
}

function saveClip() {
  if (!(store.inPointMs >= 0 && store.outPointMs > store.inPointMs)) return
  const start = store.inPointMs / 1000
  const end = store.outPointMs / 1000
  store.addClip(start, end)
  ElMessage.success(`已保存片段: ${store.formatTime(start)} - ${store.formatTime(end)}`)
  store.inPointMs = 0
  store.outPointMs = 0
}

// ===== 字幕操作 =====
function seekToSub(sec: number) {
  if (videoRef.value) {
    videoRef.value.currentTime = sec
  }
}

function quickClip(item: { segment: SubtitleSegment }) {
  const start = item.segment.startTime / 1000
  const end = item.segment.endTime / 1000
  store.addClip(start, end, item.segment.text)
  ElMessage.success(`已添加片段: ${item.segment.text.substring(0, 20)}...`)
}

function batchClip() {
  const items = [...selectedSubIndices.value]
    .sort((a, b) => a - b)
    .map(i => displaySubtitles.value[i])
    .filter(Boolean)
  if (items.length === 0) return

  for (const item of items) {
    const start = item.segment.startTime / 1000
    const end = item.segment.endTime / 1000
    store.addClip(start, end, item.segment.text)
  }
  ElMessage.success(`已批量添加 ${items.length} 个片段`)
  selectedSubIndices.value.clear()
}

// ===== 搜索 =====
const searchInput = ref('')
const storageInput = ref(store.storagePath)

// ===== 字幕多选 =====
const selectedSubIndices = ref(new Set<number>())
const dragSelecting = ref(false)
const dragStartIdx = ref(-1)
const lastClickIdx = ref(-1)
const subListHovered = ref(false)

// ===== 片段多选 =====
const selectedClipIndices = ref(new Set<number>())
const clipDragSelecting = ref(false)
const clipDragStartIdx = ref(-1)
const clipLastClickIdx = ref(-1)
const clipListHovered = ref(false)

onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown)
  // 初始化可用字幕条计数
  store.scanSubtitleCacheCount()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
})

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault()
    if (subListHovered.value && rightTab.value === 'subtitles') {
      const sel = new Set<number>()
      for (let i = 0; i < displaySubtitles.value.length; i++) sel.add(i)
      selectedSubIndices.value = sel
    } else if (clipListHovered.value && rightTab.value === 'clips') {
      const sel = new Set<number>()
      for (let i = 0; i < displayClips.value.length; i++) sel.add(i)
      selectedClipIndices.value = sel
    }
  }
}

function onSubMouseDown(idx: number, e: MouseEvent) {
  // Ctrl 不阻止默认（留给 click 处理），其他情况开始拖拽预判
  if (e.ctrlKey || e.metaKey) return
  dragSelecting.value = true
  dragStartIdx.value = idx
}

function onSubDragMove(e: MouseEvent) {
  if (!dragSelecting.value) return
  const container = (e.currentTarget as HTMLElement)
  const items = container.querySelectorAll('.subtitle-item')
  let endIdx = dragStartIdx.value
  items.forEach((el, i) => {
    const rect = el.getBoundingClientRect()
    if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
      endIdx = i
    }
  })
  // 框选范围
  const min = Math.min(dragStartIdx.value, endIdx)
  const max = Math.max(dragStartIdx.value, endIdx)
  const sel = new Set<number>()
  for (let i = min; i <= max; i++) sel.add(i)
  selectedSubIndices.value = sel
}

function onSubDragEnd() {
  dragSelecting.value = false
}

function onSubClick(idx: number, e: MouseEvent) {
  const item = displaySubtitles.value[idx]
  if (!item) return

  if (e.shiftKey && lastClickIdx.value >= 0) {
    // Shift 范围选择
    const min = Math.min(lastClickIdx.value, idx)
    const max = Math.max(lastClickIdx.value, idx)
    const sel = new Set<number>()
    for (let i = min; i <= max; i++) sel.add(i)
    selectedSubIndices.value = sel
  } else if (e.ctrlKey || e.metaKey) {
    // Ctrl 切换选择
    const sel = new Set(selectedSubIndices.value)
    if (sel.has(idx)) sel.delete(idx)
    else sel.add(idx)
    selectedSubIndices.value = sel
    lastClickIdx.value = idx
  } else if (dragSelecting.value) {
    // 拖拽结束（mouseup 会触发 click，此时 selectedSubIndices 已在 onSubDragMove 中设置）
    // 保持框选结果不变
  } else {
    // 普通点击：清除选择，跳转播放
    if (!selectedSubIndices.value.has(idx)) {
      selectedSubIndices.value.clear()
    }
    seekToSub(item.segment.startTime / 1000)
  }
  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !dragSelecting.value) {
    lastClickIdx.value = idx
  }
}

// ===== 片段多选处理 =====
function onClipMouseDown(idx: number, e: MouseEvent) {
  if (e.ctrlKey || e.metaKey) return
  clipDragSelecting.value = true
  clipDragStartIdx.value = idx
}

function onClipDragMove(e: MouseEvent) {
  if (!clipDragSelecting.value) return
  const container = (e.currentTarget as HTMLElement)
  const items = container.querySelectorAll('.clip-item-sm')
  let endIdx = clipDragStartIdx.value
  items.forEach((el, i) => {
    const rect = el.getBoundingClientRect()
    if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
      endIdx = i
    }
  })
  const min = Math.min(clipDragStartIdx.value, endIdx)
  const max = Math.max(clipDragStartIdx.value, endIdx)
  const sel = new Set<number>()
  for (let i = min; i <= max; i++) sel.add(i)
  selectedClipIndices.value = sel
}

function onClipDragEnd() {
  clipDragSelecting.value = false
}

function onClipClick(idx: number, e: MouseEvent) {
  const clip = displayClips.value[idx]
  if (!clip) return

  if (e.shiftKey && clipLastClickIdx.value >= 0) {
    const min = Math.min(clipLastClickIdx.value, idx)
    const max = Math.max(clipLastClickIdx.value, idx)
    const sel = new Set<number>()
    for (let i = min; i <= max; i++) sel.add(i)
    selectedClipIndices.value = sel
  } else if (e.ctrlKey || e.metaKey) {
    const sel = new Set(selectedClipIndices.value)
    if (sel.has(idx)) sel.delete(idx)
    else sel.add(idx)
    selectedClipIndices.value = sel
    clipLastClickIdx.value = idx
  } else if (clipDragSelecting.value) {
    // 拖拽结束，保持框选结果
  } else {
    if (!selectedClipIndices.value.has(idx)) {
      selectedClipIndices.value.clear()
    }
  }
  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !clipDragSelecting.value) {
    clipLastClickIdx.value = idx
  }
}

function batchDeleteClips() {
  const ids = [...selectedClipIndices.value]
    .sort((a, b) => b - a) // 从后往前删避免索引错位
    .map(i => displayClips.value[i]?.id)
    .filter(Boolean)
  for (const id of ids) {
    store.removeClip(id)
  }
  ElMessage.success(`已删除 ${ids.length} 个片段`)
  selectedClipIndices.value.clear()
}

function batchDeleteOneClip(clipId: string) {
  store.removeClip(clipId)
  selectedClipIndices.value.clear()
}

function onSearch(val: string) {
  store.setSearchQuery(val)
}

const displaySubtitles = computed(() => {
  if (store.searchQuery) return store.searchedSubtitles
  if (!store.activeVideo) return []
  return store.activeVideo.subtitles.map(s => ({
    videoId: store.activeVideoId!,
    videoName: store.activeVideo!.name,
    segment: s
  }))
})

const displayClips = computed(() => {
  if (store.searchQuery) return store.searchedClips
  return store.clips
})

// ===== 右侧 Tab =====
const rightTab = ref('subtitles')

// ===== ASR =====
const isAsrProcessing = ref(false)

async function handleAsr() {
  const video = store.activeVideo
  if (!video) return

  isAsrProcessing.value = true
  store.setAsrStatus(video.id, 'processing')

  try {
    const electronAPI = (window as any).electronAPI
    if (electronAPI?.runAsr) {
      // Electron 端：真实 ASR
      const resultJson = await electronAPI.runAsr(video.path)
      const result = JSON.parse(resultJson)
      const subtitles = result.utterances?.map((u: any) => ({
        id: 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        text: u.text,
        startTime: u.start_time,
        endTime: u.end_time,
        words: u.words || []
      })) || []
      store.setVideoSubtitles(video.id, subtitles)
      store.setAsrStatus(video.id, 'done')
      // 保存字幕缓存到视频旁边
      saveSubtitlesCache(video.path, subtitles)
      ElMessage.success(`ASR 完成: ${subtitles.length} 条字幕 (已缓存)`)
    } else {
      // 浏览器模式：模拟 ASR 用于开发测试
      ElMessage.info('浏览器模式：使用模拟字幕数据')
      await simulateAsr(video.id, video.duration)
    }
  } catch (e: any) {
    store.setAsrStatus(video.id, 'error', e.message || 'ASR 失败')
    ElMessage.error('ASR 处理失败: ' + (e.message || '未知错误'))
  }
  isAsrProcessing.value = false
}

/** 浏览器模式模拟 ASR */
async function simulateAsr(videoId: string, durationSec: number) {
  await new Promise(r => setTimeout(r, 1200))

  // 根据视频时长生成模拟字幕（每 3 秒一条）
  const count = Math.max(3, Math.floor(durationSec / 3))
  const subtitles: any[] = []
  const samples = [
    '大家好，欢迎来到今天的分享',
    '今天我们要聊的话题非常重要',
    '首先让我们来看一下这个数据',
    '这个现象其实很有意思',
    '我们可以从多个角度来分析',
    '接下来我给大家详细解释一下',
    '不知道你们有没有这样的经历',
    '这个问题的关键在于理解本质',
    '其实答案比想象中要简单',
    '最后我们来总结一下今天的要点',
    '如果你觉得有帮助记得点赞关注',
    '我们下期再见',
    '这个方法非常实用',
    '建议大家收藏起来慢慢看',
    '这里是重点，注意听哦',
    '很多人都会犯这个错误',
    '让我用一个例子来说明',
    '你学会了吗',
    '这个技巧能帮你省不少时间',
    '感谢大家的收看'
  ]

  for (let i = 0; i < count; i++) {
    const start = i * 3000
    const end = Math.min(start + 2800, durationSec * 1000)
    subtitles.push({
      id: 'sim_' + i,
      text: samples[i % samples.length],
      startTime: start,
      endTime: end,
      words: []
    })
  }

  store.setVideoSubtitles(videoId, subtitles)
  ElMessage.success(`模拟 ASR 完成: ${subtitles.length} 条字幕`)
}

// ===== 片段操作 =====
function previewClip(clip: VideoClip) {
  if (videoRef.value) {
    videoRef.value.currentTime = clip.startTime
    videoRef.value.play()
  }
}

let dragClipId = ''
function onClipDrag(clipId: string) { dragClipId = clipId }

function onTimelineDrop() {
  if (dragClipId) store.addToTimeline(dragClipId)
  dragClipId = ''
}

let dragTrackIdx = -1
function onTrackDragStart(idx: number) { dragTrackIdx = idx }
function onTrackDrop(idx: number) {
  if (dragTrackIdx >= 0 && dragTrackIdx !== idx) {
    store.reorderTimeline(dragTrackIdx, idx)
  }
  dragTrackIdx = -1
}

function getClipLabel(clipId: string): string {
  return store.clips.find(c => c.id === clipId)?.label || '未知'
}

function getClipFullTime(clipId: string): string {
  const clip = store.clips.find(c => c.id === clipId)
  return clip ? `${store.formatTime(clip.startTime)}-${store.formatTime(clip.endTime)}` : ''
}

function getClipStart(clipId: string): string {
  const clip = store.clips.find(c => c.id === clipId)
  return clip ? store.formatTime(clip.startTime) : '--'
}

function getClipEnd(clipId: string): string {
  const clip = store.clips.find(c => c.id === clipId)
  return clip ? store.formatTime(clip.endTime) : '--'
}

// ===== 轨道片段时长拖拽编辑 =====
let edgeClipId = ''
let edgeSide: 'left' | 'right' = 'left'
let edgeStartX = 0
let edgeOrigStart = 0
let edgeOrigEnd = 0

function onTrackEdgeStart(clipId: string, side: 'left' | 'right', e: MouseEvent) {
  edgeClipId = clipId
  edgeSide = side
  edgeStartX = e.clientX
  const clip = store.clips.find(c => c.id === clipId)
  if (clip) {
    edgeOrigStart = clip.startTime
    edgeOrigEnd = clip.endTime
  }
  document.addEventListener('mousemove', onTrackEdgeMove)
  document.addEventListener('mouseup', onTrackEdgeEnd)
  e.preventDefault()
}

function onTrackEdgeMove(e: MouseEvent) {
  const clip = store.clips.find(c => c.id === edgeClipId)
  if (!clip) return
  const dx = e.clientX - edgeStartX
  const dSeconds = dx * 0.02 // 每像素约 0.02 秒

  if (edgeSide === 'left') {
    const newStart = Math.max(0, edgeOrigStart + dSeconds)
    if (newStart < clip.endTime - 0.1) {
      store.updateClipTime(edgeClipId, newStart, clip.endTime)
    }
  } else {
    const newEnd = Math.max(edgeOrigStart + 0.1, edgeOrigEnd + dSeconds)
    store.updateClipTime(edgeClipId, clip.startTime, newEnd)
  }
}

function onTrackEdgeEnd() {
  edgeClipId = ''
  document.removeEventListener('mousemove', onTrackEdgeMove)
  document.removeEventListener('mouseup', onTrackEdgeEnd)
}

// ===== 剪映路径设置 =====
const showPathDialog = ref(false)
const pathInput = ref(store.jianyingDraftPath)

function savePath() {
  store.setJianyingDraftPath(pathInput.value)
  showPathDialog.value = false
  ElMessage.success('设置已保存')
}

// ===== ASR 状态标签 =====
function asrLabel(status: string): string {
  const map: Record<string, string> = { idle: '未处理', processing: '识别中', done: '已识别', error: '失败' }
  return map[status] || status
}

// ===== 导出 =====
const showExportDialog = ref(false)

// ===== 字幕管理 =====
const showSubtitleMgr = ref(false)
const subMgrExpanded = ref(new Set<string>())
const scanningStorage = ref(false)
const storageSubtitleFiles = ref<Array<{ fileName: string; filePath: string; subtitles: SubtitleSegment[]; videoPath?: string }>>([])

const SUB_LINK_KEY = 'creator-subtitle-links'

/** 加载持久化的链接映射 */
function loadSubtitleLinks(): Map<string, string> {
  try {
    const raw = localStorage.getItem(SUB_LINK_KEY)
    if (raw) return new Map(JSON.parse(raw))
  } catch {}
  return new Map()
}

/** 保存持久化的链接映射 */
function saveSubtitleLinks(links: Map<string, string>) {
  localStorage.setItem(SUB_LINK_KEY, JSON.stringify([...links]))
}

const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v', '.3gp']

function onSubMgrOpened() {
  storageInput.value = store.storagePath
  scanStorageSubtitles()
}

/** 递归列出目录中所有文件（含子目录） */
async function listDirectoryRecursive(dirPath: string): Promise<Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>> {
  const api = (window as any).electronAPI
  if (!api?.listDirectory) return []
  const results: Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }> = []
  try {
    const entries = await api.listDirectory(dirPath)
    for (const entry of entries) {
      results.push(entry)
      if (entry.isDirectory) {
        const sub = await listDirectoryRecursive(entry.path)
        results.push(...sub)
      }
    }
  } catch {}
  return results
}

async function scanStorageSubtitles() {
  const api = (window as any).electronAPI
  if (!api?.listDirectory || !storageInput.value) return
  scanningStorage.value = true
  const results: typeof storageSubtitleFiles.value = []
  try {
    const dirPath = storageInput.value
    // 递归扫描目录，包括子文件夹
    const allFiles = await listDirectoryRecursive(dirPath)

    // 收集所有视频文件用于自动匹配
    const videoFiles = new Set<string>()
    for (const f of allFiles) {
      const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase()
      if (VIDEO_EXTS.includes(ext)) {
        const baseName = f.name.substring(0, f.name.lastIndexOf('.'))
        videoFiles.add(baseName)
      }
    }

    const jsonFiles = allFiles.filter((f: any) => f.isFile && f.name.endsWith('.subtitles.json'))
    const savedLinks = loadSubtitleLinks()
    for (const jf of jsonFiles) {
      try {
        const result = await api.readFileAsText(jf.path)
        if (result.success) {
          const parsed = JSON.parse(result.content)
          // 兼容新旧格式
          const subs = parsed.subtitles || parsed
          const meta = parsed._meta
          if (Array.isArray(subs) && subs.length > 0) {
            const videoName = jf.name.replace('.subtitles.json', '')
            // 链接优先级：1.缓存文件内_meta  2.持久化链接映射  3.同目录同名匹配
            let videoPath: string | undefined
            if (meta?.videoPath) {
              videoPath = meta.videoPath
            } else if (savedLinks.has(jf.path)) {
              videoPath = savedLinks.get(jf.path)
            } else if (videoFiles.has(videoName)) {
              const found = allFiles.find((f: any) =>
                f.name.startsWith(videoName + '.') &&
                VIDEO_EXTS.includes(f.name.substring(f.name.lastIndexOf('.')).toLowerCase())
              )
              if (found) videoPath = found.path
            }
            results.push({ fileName: videoName, filePath: jf.path, subtitles: subs, videoPath })
          }
        }
      } catch {}
    }
  } catch {}
  storageSubtitleFiles.value = results
  store.subtitleCacheCount = results.length
  scanningStorage.value = false
}

function getSubtitleDuration(subtitles: SubtitleSegment[]): number {
  if (subtitles.length === 0) return 0
  return subtitles[subtitles.length - 1].endTime / 1000
}

async function detectVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    const temp = document.createElement('video')
    temp.style.display = 'none'
    document.body.appendChild(temp)
    temp.preload = 'metadata'
    temp.src = `file:///${videoPath.replace(/\\/g, '/')}`
    temp.onloadedmetadata = () => {
      const d = temp.duration
      document.body.removeChild(temp)
      resolve(isNaN(d) ? 0 : d)
    }
    temp.onerror = () => {
      document.body.removeChild(temp)
      resolve(0)
    }
    setTimeout(() => {
      if (document.body.contains(temp)) { document.body.removeChild(temp); resolve(0) }
    }, 5000)
  })
}

async function linkVideoToSubtitle(diskFilePath: string) {
  const api = (window as any).electronAPI
  if (!api?.selectVideoFile) return

  // 找到源数据
  const sf = storageSubtitleFiles.value.find(s => s.filePath === diskFilePath)
  if (!sf) return

  const files = await api.selectVideoFile()
  if (!files || files.length === 0) return

  const selectedPath = files[0].path
  const selectedName = files[0].name

  // 防呆1：文件扩展名校验
  const ext = selectedName.substring(selectedName.lastIndexOf('.')).toLowerCase()
  if (!VIDEO_EXTS.includes(ext)) {
    ElMessage.error(`${selectedName} 不是视频文件，请重新选择`)
    return
  }

  // 防呆2：避免同一个视频链接到多个字幕
  const duplicate = storageSubtitleFiles.value.find(
    s => s.filePath !== diskFilePath && s.videoPath === selectedPath
  )
  if (duplicate) {
    ElMessage.error(`此视频已链接到字幕「${duplicate.fileName}」，一个视频只能对应一份字幕，请重新链接`)
    return
  }

  // 防呆3：名称不匹配
  const existing = store.importedVideos.find(v => v.path === selectedPath)
  if (existing && existing.name !== sf.fileName) {
    ElMessage.error(`视频名称与字幕名称不匹配：\n视频: ${existing.name}\n字幕: ${sf.fileName}\n请重新选择正确的视频文件`)
    return
  }

  // 防呆4：时长对比（误差不超过 1%）
  const subDuration = getSubtitleDuration(sf.subtitles)
  const videoDuration = await detectVideoDuration(selectedPath)
  if (subDuration > 0 && videoDuration > 0) {
    const diff = Math.abs(subDuration - videoDuration)
    const ratio = diff / Math.max(subDuration, videoDuration)
    if (ratio > 0.01) {
      ElMessage.error(
        `视频时长与字幕不匹配：\n视频时长: ${store.formatTime(videoDuration)}\n字幕时长: ${store.formatTime(subDuration)}\n差异: ${(ratio * 100).toFixed(1)}%，超过 1% 容差，请重新链接`
      )
      return
    }
  } else if (subDuration > 0 && videoDuration === 0) {
    ElMessage.error('无法读取视频时长，文件可能损坏，请重新选择')
    return
  }

  // 修改源数据并持久化链接
  sf.videoPath = selectedPath
  const links = loadSubtitleLinks()
  links.set(diskFilePath, selectedPath)
  saveSubtitleLinks(links)
  importLinkedVideo(sf)
  ElMessage.success(`已链接: ${selectedName}`)
}

function importLinkedVideo(sf: { fileName: string; filePath: string; subtitles: SubtitleSegment[]; videoPath?: string }) {
  if (!sf.videoPath) return
  const existing = store.importedVideos.find(v => v.path === sf.videoPath)
  if (existing) {
    existing.subtitles = sf.subtitles
    existing.asrStatus = 'done'
    store.setActiveVideo(existing.id)
  } else {
    const url = `file:///${sf.videoPath!.replace(/\\/g, '/')}`
    const video = store.addVideo({ name: sf.fileName } as any as File, url, sf.videoPath!, 'manual')
    if (video) {
      video.subtitles = sf.subtitles
      video.asrStatus = 'done'
      store.setActiveVideo(video.id)
    }
  }
}

function saveStoragePath() {
  store.setStoragePath(storageInput.value)
  ElMessage.success('字幕存储目录已保存')
  scanStorageSubtitles()
}

function removeStorageSubFile(filePath: string) {
  const api = (window as any).electronAPI
  if (api?.deleteFile) {
    api.deleteFile(filePath)
    storageSubtitleFiles.value = storageSubtitleFiles.value.filter(s => s.filePath !== filePath)
    // 清理持久化链接
    const links = loadSubtitleLinks()
    if (links.delete(filePath)) saveSubtitleLinks(links)
    ElMessage.success('已删除缓存文件')
  }
}

function openSubFileLocation(filePath: string) {
  const api = (window as any).electronAPI
  if (api?.openFileLocation) {
    api.openFileLocation(filePath)
  }
}

// 合并导入的视频 + 磁盘缓存
const allSubtitleEntries = computed(() => {
  const entries: Array<{
    id: string; name: string; subtitles: SubtitleSegment[]
    fromDisk?: boolean; diskFile?: string; videoPath?: string; isImported?: boolean
  }> = []

  // 来自 importedVideos（仅当有对应磁盘缓存时才显示）
  for (const v of store.importedVideos) {
    if (v.asrStatus === 'done' && v.subtitles.length > 0) {
      // 查找对应的磁盘缓存文件（用于显示链接状态）
      // sf.fileName 不含扩展名，v.name 含扩展名，需统一比较
      const videoBaseName = v.name.replace(/\.\w+$/, '')
      const diskCache = storageSubtitleFiles.value.find(sf =>
        sf.fileName === videoBaseName ||
        (sf.videoPath && v.path && sf.videoPath.replace(/\\/g, '/') === v.path.replace(/\\/g, '/'))
      )
      // 只有在磁盘缓存中找到对应文件时才加入列表
      if (diskCache) {
        entries.push({
          id: v.id,
          name: v.name,
          subtitles: [...v.subtitles],
          fromDisk: true,
          diskFile: diskCache.filePath,
          videoPath: diskCache.videoPath || v.path,
          isImported: true
        })
      }
    }
  }

  // 来自磁盘缓存的（不在 importedVideos 中的）
  for (const sf of storageSubtitleFiles.value) {
    if (!store.importedVideos.some(v => {
      const videoBaseName = v.name.replace(/\.\w+$/, '')
      return videoBaseName === sf.fileName ||
        v.path.includes(sf.fileName) ||
        (sf.videoPath && v.path && sf.videoPath.replace(/\\/g, '/') === v.path.replace(/\\/g, '/'))
    })) {
      entries.push({
        id: 'disk_' + sf.fileName,
        name: sf.fileName,
        subtitles: sf.subtitles,
        fromDisk: true,
        diskFile: sf.filePath,
        videoPath: sf.videoPath,
        isImported: false
      })
    }
  }

  return entries
})

function toggleSubMgrExpand(videoId: string) {
  const s = subMgrExpanded.value
  if (s.has(videoId)) s.delete(videoId)
  else s.add(videoId)
}

function deleteSubtitle(videoId: string, subId: string) {
  const video = store.importedVideos.find(v => v.id === videoId)
  if (!video) return
  video.subtitles = video.subtitles.filter(s => s.id !== subId)
  ElMessage.success('已删除字幕')
}

function clearVideoSubtitles(videoId: string) {
  const video = store.importedVideos.find(v => v.id === videoId)
  if (!video) return
  video.subtitles = []
  video.asrStatus = 'idle'
  ElMessage.success('已清除全部字幕')
}
const exportStep = ref<'input' | 'progress'>('input')
const exportName = ref('')
const exportStatus = ref<'generating' | 'done' | 'error'>('generating')
const exportMessage = ref('')

function handleExport() {
  if (store.timeline.clips.length === 0) {
    ElMessage.warning('轨道为空，请先添加片段')
    return
  }
  exportName.value = `剪映工程_${new Date().toLocaleDateString()}`
  exportStep.value = 'input'
  showExportDialog.value = true
}

async function startExport() {
  const name = exportName.value.trim()
  if (!name) return

  exportStep.value = 'progress'
  exportStatus.value = 'generating'
  exportMessage.value = '正在生成剪映工程文件...'

  try {
    const timelineClips = store.getTimelineClips()
    // 只收集轨道片段时间范围内的字幕（从源视频中过滤匹配）
    const allSubs: Array<{ text: string; startMs: number; endMs: number }> = []
    for (const clip of timelineClips) {
      const srcVideo = store.importedVideos.find(v => v.path === clip.sourceFile)
      if (srcVideo) {
        for (const sub of srcVideo.subtitles) {
          // 字幕时间（毫秒）需转为秒后与片段时间比较
          const subStartSec = sub.startTime / 1000
          const subEndSec = sub.endTime / 1000
          if (subStartSec >= clip.startTime && subEndSec <= clip.endTime) {
            allSubs.push({
              text: sub.text,
              startMs: Math.round((subStartSec - clip.startTime) * 1000),
              endMs: Math.round((subEndSec - clip.startTime) * 1000)
            })
          }
        }
      }
    }

    const av = store.activeVideo
    const canvasW = av?.width || 1080
    const canvasH = av?.height || 1920

    const project = buildProject(
      timelineClips.map(c => ({
        sourceFile: c.sourceFile,
        sourceFileName: c.sourceFileName,
        startMs: Math.round(c.startTime * 1000),
        endMs: Math.round(c.endTime * 1000)
      })),
      allSubs,
      name,
      canvasW,
      canvasH
    )

    const result = await exportJianyingProject(project, store.jianyingDraftPath, (msg) => {
      exportMessage.value = msg
    })

    if (result.success) {
      exportStatus.value = 'done'
      exportMessage.value = `工程已生成: ${name}\n位置: ${result.draftDir}`
    } else {
      exportStatus.value = 'error'
      exportMessage.value = '导出失败: ' + (result.error || '未知错误')
    }
  } catch (e: any) {
    exportStatus.value = 'error'
    exportMessage.value = '导出失败: ' + (e.message || String(e))
  }
}

function openJY() {
  openJianying()
  showExportDialog.value = false
}

// 同步存储路径输入
watch(() => store.storagePath, (v) => { storageInput.value = v })

// 切换视频时强制重新加载 video 元素（flush: 'post' 确保 DOM 已更新）
watch(() => store.activeVideoId, () => {
  if (videoRef.value) {
    videoRef.value.load()
  }
}, { flush: 'post' })
</script>

<style scoped>
.video-clipper {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--c-bg-sec);
}

/* 工具栏 */
.clipper-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-border);
  gap: 8px;
  min-height: 42px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.storage-setting {
  display: flex;
  align-items: center;
  gap: 4px;
}

.storage-label { font-size: 12px; color: var(--c-text-muted); white-space: nowrap; }

.clip-count {
  font-size: 12px;
  color: var(--c-text-muted);
  font-family: monospace;
}

/* 主体 */
.clipper-body {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
  user-select: none;
}

/* 侧边栏面板 */
.sidebar-panel {
  min-width: 180px;
  max-width: 480px;
  flex-shrink: 0;
  flex-grow: 0;
  background: var(--c-bg-card);
  border-right: 1px solid var(--c-border-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 拖拽把手 */
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.15s;
}

.resize-handle:hover {
  background: var(--c-primary);
}

/* 水平拖拽把手 */
.resize-handle-h {
  height: 4px;
  cursor: row-resize;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.15s;
}

.resize-handle-h:hover {
  background: var(--c-primary);
}

/* 视频列表 */
.video-list-panel {
  width: 240px;
  min-width: 240px;
  background: var(--c-bg-card);
  border-right: 1px solid var(--c-border-light);
  display: flex;
  flex-direction: column;
}

.panel-empty-sm { display: flex; align-items: center; justify-content: center; color: var(--c-text-muted); font-size: 12px; padding: 20px; }

.video-list { flex: 1; overflow-y: auto; }

.video-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--c-border-light);
  cursor: pointer;
  transition: background 0.15s;
}
.video-item:hover { background: var(--c-bg-hover); }
.video-item.active { background: var(--c-primary-soft); }

.video-thumb {
  width: 48px;
  height: 32px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  position: relative;
  flex-shrink: 0;
}
.video-thumb video {
  width: 100%; height: 100%; object-fit: cover; opacity: 0.7;
}
.video-ratio {
  position: absolute;
  bottom: 2px; right: 2px;
  background: rgba(0,0,0,0.7);
  color: #fff;
  font-size: 10px;
  padding: 0 3px;
  border-radius: 2px;
}

.video-info {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.video-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--c-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.video-meta { font-size: 11px; color: var(--c-text-muted); }
.folder-name { line-height: 1.6; }
.asr-badge { font-size: 10px; padding: 0 4px; border-radius: 2px; }
.asr-idle { color: var(--c-text-muted); }
.asr-processing { color: var(--c-warning); }
.asr-done { color: var(--c-success); background: color-mix(in srgb, var(--c-success) 10%, transparent); }
.asr-error { color: var(--c-danger); background: color-mix(in srgb, var(--c-danger) 10%, transparent); }

.video-remove { opacity: 0; flex-shrink: 0; }
.video-item:hover .video-remove { opacity: 1; }

/* 预览区 */
.preview-panel {
  flex: 1;
  background: var(--c-bg-card);
  border-right: 1px solid var(--c-border-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--c-text-muted);
}

.preview-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.video-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  overflow: hidden;
  min-height: 200px;
}
.video-container.ratio-9-16 { aspect-ratio: 9 / 16; max-height: 100%; }
.video-container.ratio-16-9 { aspect-ratio: 16 / 9; max-height: 100%; }
.video-container.ratio-1-1 { aspect-ratio: 1 / 1; max-height: 100%; }
.video-container video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.playback-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid var(--c-border-light);
  background: var(--c-bg-sec);
}

.time-current, .time-total {
  font-size: 12px;
  font-family: monospace;
  color: var(--c-text-sec);
  min-width: 48px;
}

.seek-bar {
  flex: 1;
  height: 24px;
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 0 2px;
}

.seek-track {
  flex: 1;
  height: 4px;
  background: var(--c-border);
  border-radius: 2px;
  position: relative;
}

.seek-played {
  position: absolute;
  top: 0; left: 0;
  height: 100%;
  background: var(--c-primary);
  border-radius: 2px;
  pointer-events: none;
}

.seek-range {
  position: absolute;
  top: -2px;
  height: 8px;
  background: color-mix(in srgb, var(--c-primary) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-primary) 50%, transparent);
  border-radius: 2px;
  pointer-events: none;
}

.seek-cursor {
  position: absolute;
  top: -4px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--c-primary);
  margin-left: -6px;
  pointer-events: none;
  z-index: 2;
}

.in-handle, .out-handle {
  position: absolute;
  top: -6px;
  width: 10px; height: 16px;
  background: var(--c-warning);
  border-radius: 3px;
  margin-left: -5px;
  cursor: col-resize;
  z-index: 3;
}
.out-handle { background: var(--c-success); }

.mark-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-top: 1px solid var(--c-border-light);
  background: var(--c-bg-sec);
  gap: 8px;
}

.mark-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.mark-time {
  font-family: monospace;
  color: var(--c-text-sec);
  font-size: 12px;
  min-width: 50px;
}

.mark-duration {
  color: var(--c-primary);
  font-size: 12px;
  font-weight: 500;
}

/* 右侧面板 */
.right-panel {
  min-width: 180px;
  max-width: 480px;
  flex-shrink: 0;
  flex-grow: 0;
  background: var(--c-bg-card);
  border-left: 1px solid var(--c-border-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.right-tabs :deep(.el-tabs__header) { margin: 0; padding: 0 8px; }
.right-tabs :deep(.el-tabs__content) { flex: 1; overflow: hidden; }
.right-tabs :deep(.el-tab-pane) { height: 100%; overflow-y: auto; }

.subtitle-list, .clip-list {
  padding: 4px;
}

.subtitle-item, .clip-item-sm {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.subtitle-item:hover, .clip-item-sm:hover { background: var(--c-bg-hover); }
.subtitle-item.selected { background: var(--c-primary-soft); outline: 1px solid color-mix(in srgb, var(--c-primary) 30%, transparent); outline-offset: -1px; }
.clip-item-sm.selected { background: color-mix(in srgb, var(--c-danger) 10%, transparent); outline: 1px solid color-mix(in srgb, var(--c-danger) 10%, transparent); outline-offset: -1px; }

.sub-batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--c-primary-soft);
  border-bottom: 1px solid color-mix(in srgb, var(--c-primary) 30%, transparent);
  font-size: 12px;
  height: 36px;
  box-sizing: border-box;
}

.sub-time { font-family: monospace; color: var(--c-primary); min-width: 55px; font-size: 11px; }
.sub-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-text-sec); }

.clip-time { font-family: monospace; color: var(--c-primary); font-size: 11px; min-width: 90px; }
.clip-dur { color: var(--c-text-muted); font-size: 11px; min-width: 30px; }

/* 底部轨道 */
.timeline-bar {
  background: var(--c-bg-card);
  border-top: 1px solid var(--c-border);
  padding: 6px 12px;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text);
  margin-bottom: 4px;
}
.timeline-total { color: var(--c-text-muted); font-weight: 400; }

.timeline-track {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  min-height: 38px;
  align-items: center;
  padding: 2px 0;
}

.track-empty { color: var(--c-text-muted); font-size: 12px; padding: 8px; }

.track-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--c-primary-soft);
  border-radius: 6px;
  font-size: 12px;
  cursor: grab;
  white-space: nowrap;
  flex-shrink: 0;
}
.track-item:active { cursor: grabbing; }

.track-num {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--c-primary);
  color: var(--c-primary-text);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}

.track-label { max-width: 100px; overflow: hidden; text-overflow: ellipsis; color: var(--c-text); }
.track-time { font-family: monospace; color: var(--c-text-muted); font-size: 11px; display: flex; gap: 2px; align-items: center; }
.track-start { color: var(--c-warning); }
.track-sep { color: var(--c-text-muted); }
.track-end { color: var(--c-success); }

/* 时长拖拽手柄 */
.track-handle {
  width: 16px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-text-muted);
  font-size: 8px;
  cursor: col-resize;
  opacity: 0;
  transition: opacity 0.15s;
  user-select: none;
  flex-shrink: 0;
}
.track-item:hover .track-handle { opacity: 1; }
.track-handle:hover { color: var(--c-primary); background: color-mix(in srgb, var(--c-primary) 10%, transparent); }
.track-handle.left { border-radius: 6px 0 0 6px; }
.track-handle.right { border-radius: 0 6px 6px 0; }

/* 路径设置弹窗 */
.dialog-tip {
  padding: 8px 0;
  font-size: 12px;
  color: var(--c-text-muted);
  text-align: center;
}

/* 导出弹窗 */
.export-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
}
.export-status p { font-size: 14px; color: var(--c-text-sec); }
.export-icon-done { color: var(--c-success); }
.export-icon-error { color: var(--c-danger); }

/* 字幕管理弹窗 */
.sub-mgr-list {
  margin-bottom: 4px;
}

.sub-mgr-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--c-bg-sec);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.sub-mgr-header:hover { background: var(--c-primary-soft); }

.sub-mgr-expand {
  transition: transform 0.2s;
  font-size: 12px;
}
.sub-mgr-expand.rotated { transform: rotate(90deg); }

.sub-mgr-name { font-weight: 500; color: var(--c-text); }
.sub-mgr-count { color: var(--c-primary); font-size: 12px; margin-left: auto; margin-right: 8px; }

.sub-mgr-body {
  padding: 4px 0 4px 20px;
  max-height: 240px;
  overflow-y: auto;
}

.sub-mgr-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  font-size: 12px;
  border-radius: 3px;
}
.sub-mgr-item:hover { background: var(--c-bg-hover); }

.sub-mgr-time {
  font-family: monospace;
  color: var(--c-primary);
  min-width: 55px;
  font-size: 11px;
  flex-shrink: 0;
}

.sub-mgr-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-text-sec);
}

/* 字幕管理：内联样式抽离 */
.submgr-label { font-size: 12px; color: var(--c-text-sec); white-space: nowrap; }
.submgr-empty { text-align: center; color: var(--c-text-muted); padding: 20px; }
.submgr-count { margin-bottom: 8px; color: var(--c-text-sec); font-size: 13px; }
.submgr-tag { font-size: 11px; }
.submgr-tag-warning { color: var(--c-warning); }
.submgr-tag-success { color: var(--c-success); }
</style>
