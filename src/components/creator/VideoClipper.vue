<template>
  <div class="video-clipper">
    <!-- 顶部工具栏 -->
    <div class="clipper-toolbar">
      <div class="toolbar-left">
        <el-button size="small" @click="triggerImport">
          <el-icon><Upload /></el-icon> 批量导入视频
        </el-button>
        <input ref="videoInputRef" type="file" accept="video/*" multiple style="display:none" @change="handleImport" />
        <el-button size="small" @click="handleAsr" :disabled="!store.activeVideo || store.activeVideo.asrStatus === 'processing'" :loading="isAsrProcessing">
          <el-icon><Microphone /></el-icon> ASR 转字幕
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
      <!-- 左侧：视频列表 -->
      <div class="video-list-panel">
        <div class="panel-header">视频列表 ({{ store.importedVideos.length }})</div>
        <div v-if="store.importedVideos.length === 0" class="panel-empty">
          <span>点击「批量导入视频」开始</span>
        </div>
        <div v-else class="video-list">
          <div
            v-for="video in store.importedVideos"
            :key="video.id"
            class="video-item"
            :class="{ active: store.activeVideoId === video.id }"
            @click="store.setActiveVideo(video.id)"
          >
            <div class="video-thumb">
              <video :src="video.url" muted preload="metadata"></video>
              <span class="video-ratio">{{ video.ratio }}</span>
            </div>
            <div class="video-info">
              <span class="video-name" :title="video.name">{{ video.name }}</span>
              <span class="video-meta">{{ store.formatTime(video.duration) }}</span>
              <span class="asr-badge" :class="'asr-' + video.asrStatus">
                {{ asrLabel(video.asrStatus) }}
              </span>
            </div>
            <el-button class="video-remove" size="small" circle @click.stop="store.removeVideo(video.id)">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>
      </div>

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

      <!-- 右侧：字幕/片段列表 -->
      <div class="right-panel">
        <el-tabs v-model="rightTab" class="right-tabs">
          <el-tab-pane label="字幕" name="subtitles">
            <div class="subtitle-list">
              <div v-if="displaySubtitles.length === 0" class="panel-empty-sm">
                <span>{{ store.searchQuery ? '无匹配结果' : '请先对视频执行 ASR 转字幕' }}</span>
              </div>
              <div
                v-for="item in displaySubtitles"
                :key="item.segment.id"
                class="subtitle-item"
                @click="seekToSub(item.segment.startTime / 1000)"
              >
                <span class="sub-time">{{ store.formatTimeMs(item.segment.startTime) }}</span>
                <span class="sub-text">{{ item.segment.text }}</span>
                <el-button size="small" text @click.stop="quickClip(item)">+片段</el-button>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="片段" name="clips">
            <div class="clip-list">
              <div v-if="displayClips.length === 0" class="panel-empty-sm">
                <span>暂无保存的片段</span>
              </div>
              <div
                v-for="clip in displayClips"
                :key="clip.id"
                class="clip-item-sm"
                draggable="true"
                @dragstart="onClipDrag(clip.id)"
              >
                <span class="clip-time">{{ store.formatTime(clip.startTime) }} - {{ store.formatTime(clip.endTime) }}</span>
                <span class="clip-dur">{{ clip.duration.toFixed(1) }}s</span>
                <el-button size="small" circle title="预览" @click="previewClip(clip)"><el-icon><VideoPlay /></el-icon></el-button>
                <el-button size="small" circle title="加入轨道" @click="store.addToTimeline(clip.id)"><el-icon><Plus /></el-icon></el-button>
                <el-button size="small" circle title="删除" @click="store.removeClip(clip.id)"><el-icon><Delete /></el-icon></el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 底部：总轨道 -->
    <div class="timeline-bar">
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
        <el-form-item label="数据存储目录">
          <el-input v-model="storageInput" placeholder="ASR 字幕等数据存放路径" />
        </el-form-item>
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
          <el-icon v-else-if="exportStatus === 'done'" :size="32" color="#67c23a"><CircleCheck /></el-icon>
          <el-icon v-else-if="exportStatus === 'error'" :size="32" color="#f56c6c"><CircleClose /></el-icon>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useCreatorModeStore, type VideoClip } from '@/stores/creatorMode'
import { exportJianyingProject, buildProject, openJianying } from '@/services/jianying'
import type { SubtitleSegment } from '@/services/asr'

const store = useCreatorModeStore()

// ===== 视频导入 =====
const videoInputRef = ref<HTMLInputElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)

function triggerImport() {
  const api = (window as any).electronAPI
  if (api?.selectVideoFile) {
    api.selectVideoFile().then((videoFiles: Array<{ path: string; name: string }> | null) => {
      if (!videoFiles || videoFiles.length === 0) return
      let count = 0
      for (const vf of videoFiles) {
        // 使用 file:// 协议直接播放本地视频
        const url = `file:///${vf.path.replace(/\\/g, '/')}`
        const video = store.addVideo({ name: vf.name } as any as File, url, vf.path)
        if (!video) continue  // 重复跳过
        count++
        // 尝试加载缓存的字幕文件
        loadCachedSubtitles(video.id, vf.path)
        // 异步检测视频比例
        detectVideoRatio(video.id, url)
      }
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
  temp.muted = true
  temp.crossOrigin = 'anonymous'
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

function handleImport(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  let count = 0
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const url = URL.createObjectURL(file)
    // @ts-ignore
    const fullPath: string = file.path || file.name
    const video = store.addVideo(file, url, fullPath)
    if (!video) continue  // 重复跳过
    count++

    // 尝试加载缓存的字幕文件
    loadCachedSubtitles(video.id, fullPath)
    // 异步检测视频比例
    detectVideoRatio(video.id, url)
  }
  ElMessage.success(`已导入 ${count} 个视频`)
  input.value = ''
}

/** 尝试加载字幕缓存：先查存储目录，再查视频旁边 */
async function loadCachedSubtitles(videoId: string, videoPath: string) {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.readFileAsText) return

  const videoName = videoPath.split(/[\\/]/).pop()?.replace(/\.\w+$/, '') || 'unknown'

  // 构建候选路径列表
  const candidates: string[] = []
  if (store.storagePath) {
    candidates.push(`${store.storagePath.replace(/\\/g, '/')}/${videoName}.subtitles.json`)
  }
  // 视频旁边（可靠兜底）
  candidates.push(videoPath.replace(/\.\w+$/, '.subtitles.json'))

  for (const cachePath of candidates) {
    try {
      const result = await electronAPI.readFileAsText(cachePath)
      if (!result.success) continue

      const subtitles = JSON.parse(result.content)
      if (Array.isArray(subtitles) && subtitles.length > 0) {
        store.setVideoSubtitles(videoId, subtitles)
        store.setAsrStatus(videoId, 'done')
        ElMessage.success(`已加载缓存字幕 (${subtitles.length} 条)`)
        console.log(`[缓存] 已加载 ${subtitles.length} 条字幕: ${cachePath}`)
        return
      }
    } catch {
      // 继续下一个候选
    }
  }
}

/** 保存字幕缓存：同时保存到存储目录和视频旁边 */
async function saveSubtitlesCache(videoPath: string, subtitles: any[]) {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.createDirectory || !electronAPI?.writeFile) return

  const videoName = videoPath.split(/[\\/]/).pop()?.replace(/\.\w+$/, '') || 'unknown'
  const cacheData = subtitles.map(s => ({
    id: s.id,
    text: s.text,
    startTime: s.startTime,
    endTime: s.endTime,
    words: s.words || []
  }))
  const json = JSON.stringify(cacheData, null, 2)

  // 保存到视频旁边（可靠兜底）
  const adjacentPath = videoPath.replace(/\.\w+$/, '.subtitles.json')
  try {
    await electronAPI.writeFile(adjacentPath, json)
    console.log(`[缓存] 已保存: ${adjacentPath}`)
  } catch (e) {
    console.error('[缓存] 视频旁保存失败:', e)
  }

  // 保存到存储目录
  if (store.storagePath) {
    try {
      await electronAPI.createDirectory(store.storagePath)
      const cachePath = `${store.storagePath.replace(/\\/g, '/')}/${videoName}.subtitles.json`
      await electronAPI.writeFile(cachePath, json)
      console.log(`[缓存] 已保存: ${cachePath}`)
    } catch (e) {
      console.error('[缓存] 存储目录保存失败:', e)
    }
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

// ===== 搜索 =====
const searchInput = ref('')
const storageInput = ref(store.storagePath)

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
  store.setStoragePath(storageInput.value)
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
          // 字幕时间必须在片段的起止范围内
          if (sub.startTime >= clip.startTime && sub.endTime <= clip.endTime) {
            allSubs.push({
              text: sub.text,
              startMs: Math.round((sub.startTime - clip.startTime) * 1000),
              endMs: Math.round((sub.endTime - clip.startTime) * 1000)
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
  background: #f5f6fa;
}

/* 工具栏 */
.clipper-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
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

.storage-label { font-size: 12px; color: #909399; white-space: nowrap; }

.clip-count {
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}

/* 主体 */
.clipper-body {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
}

/* 视频列表 */
.video-list-panel {
  width: 200px;
  min-width: 200px;
  background: #fff;
  border-right: 1px solid #f0f2f5;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #f0f2f5;
}

.panel-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #c0c4cc; font-size: 12px; padding: 16px; }
.panel-empty-sm { display: flex; align-items: center; justify-content: center; color: #c0c4cc; font-size: 12px; padding: 20px; }

.video-list { flex: 1; overflow-y: auto; }

.video-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid #fafafa;
  cursor: pointer;
  transition: background 0.15s;
}
.video-item:hover { background: #f5f7fa; }
.video-item.active { background: #ecf5ff; }

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
  color: #303133;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.video-meta { font-size: 11px; color: #909399; }
.asr-badge { font-size: 10px; padding: 0 4px; border-radius: 2px; }
.asr-idle { color: #c0c4cc; }
.asr-processing { color: #e6a23c; }
.asr-done { color: #67c23a; background: #f0f9eb; }
.asr-error { color: #f56c6c; background: #fef0f0; }

.video-remove { opacity: 0; flex-shrink: 0; }
.video-item:hover .video-remove { opacity: 1; }

/* 预览区 */
.preview-panel {
  flex: 1;
  background: #fff;
  border-right: 1px solid #f0f2f5;
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
  color: #c0c4cc;
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
  border-top: 1px solid #f0f2f5;
  background: #fafafa;
}

.time-current, .time-total {
  font-size: 12px;
  font-family: monospace;
  color: #606266;
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
  background: #e4e7ed;
  border-radius: 2px;
  position: relative;
}

.seek-played {
  position: absolute;
  top: 0; left: 0;
  height: 100%;
  background: #409eff;
  border-radius: 2px;
  pointer-events: none;
}

.seek-range {
  position: absolute;
  top: -2px;
  height: 8px;
  background: rgba(64,158,255,0.2);
  border: 1px solid rgba(64,158,255,0.5);
  border-radius: 2px;
  pointer-events: none;
}

.seek-cursor {
  position: absolute;
  top: -4px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #409eff;
  margin-left: -6px;
  pointer-events: none;
  z-index: 2;
}

.in-handle, .out-handle {
  position: absolute;
  top: -6px;
  width: 10px; height: 16px;
  background: #e6a23c;
  border-radius: 3px;
  margin-left: -5px;
  cursor: col-resize;
  z-index: 3;
}
.out-handle { background: #67c23a; }

.mark-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-top: 1px solid #f0f2f5;
  background: #fafafa;
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
  color: #606266;
  font-size: 12px;
  min-width: 50px;
}

.mark-duration {
  color: #409eff;
  font-size: 12px;
  font-weight: 500;
}

/* 右侧面板 */
.right-panel {
  width: 260px;
  min-width: 260px;
  background: #fff;
  border-left: 1px solid #f0f2f5;
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
.subtitle-item:hover, .clip-item-sm:hover { background: #f5f7fa; }

.sub-time { font-family: monospace; color: #409eff; min-width: 55px; font-size: 11px; }
.sub-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #606266; }

.clip-time { font-family: monospace; color: #409eff; font-size: 11px; min-width: 90px; }
.clip-dur { color: #909399; font-size: 11px; min-width: 30px; }

/* 底部轨道 */
.timeline-bar {
  background: #fff;
  border-top: 1px solid #e4e7ed;
  padding: 6px 12px;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}
.timeline-total { color: #909399; font-weight: 400; }

.timeline-track {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  min-height: 38px;
  align-items: center;
  padding: 2px 0;
}

.track-empty { color: #c0c4cc; font-size: 12px; padding: 8px; }

.track-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #ecf5ff;
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
  background: #409eff;
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}

.track-label { max-width: 100px; overflow: hidden; text-overflow: ellipsis; color: #303133; }
.track-time { font-family: monospace; color: #909399; font-size: 11px; display: flex; gap: 2px; align-items: center; }
.track-start { color: #e6a23c; }
.track-sep { color: #c0c4cc; }
.track-end { color: #67c23a; }

/* 时长拖拽手柄 */
.track-handle {
  width: 16px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  font-size: 8px;
  cursor: col-resize;
  opacity: 0;
  transition: opacity 0.15s;
  user-select: none;
  flex-shrink: 0;
}
.track-item:hover .track-handle { opacity: 1; }
.track-handle:hover { color: #409eff; background: rgba(64,158,255,0.1); }
.track-handle.left { border-radius: 6px 0 0 6px; }
.track-handle.right { border-radius: 0 6px 6px 0; }

/* 路径设置弹窗 */
.dialog-tip {
  padding: 8px 0;
  font-size: 12px;
  color: #909399;
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
.export-status p { font-size: 14px; color: #606266; }
</style>
