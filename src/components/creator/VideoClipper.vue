<template>
  <div class="video-clipper">
    <!-- 视频源 + 预览区 -->
    <div class="clipper-main">
      <!-- 视频源面板 -->
      <div class="source-panel">
        <div class="panel-header">视频源</div>
        <div v-if="!store.importedVideo" class="source-empty">
          <el-button @click="triggerImport">
            <el-icon><Upload /></el-icon>
            导入视频
          </el-button>
          <input
            ref="videoInputRef"
            type="file"
            accept="video/*"
            style="display:none"
            @change="handleVideoImport"
          />
          <p class="hint">支持 MP4、MOV、AVI 等格式</p>
        </div>
        <div v-else class="source-info">
          <div class="video-file">
            <el-icon><VideoCamera /></el-icon>
            <span class="video-name">{{ store.importedVideo.name }}</span>
          </div>
          <el-button size="small" text type="danger" @click="clearVideo">移除</el-button>
        </div>
      </div>

      <!-- 预览区 -->
      <div class="preview-panel">
        <div class="panel-header">预览</div>
        <div v-if="!store.importedVideo" class="preview-empty">
          <el-icon :size="40"><VideoCamera /></el-icon>
          <span>请先导入视频文件</span>
        </div>
        <div v-else class="preview-body">
          <video
            ref="videoRef"
            :src="videoUrl"
            class="video-player"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMeta"
            @play="store.setIsPlaying(true)"
            @pause="store.setIsPlaying(false)"
          ></video>

          <!-- 播放控制 -->
          <div class="video-controls">
            <div class="control-bar">
              <el-button size="small" circle @click="togglePlay">
                <el-icon><VideoPause v-if="store.isPlaying" /><VideoPlay v-else /></el-icon>
              </el-button>
              <span class="time-display">
                {{ store.formatTime(store.currentTime) }} / {{ store.formatTime(store.videoDuration) }}
              </span>
              <div class="seek-bar" @click="seekVideo">
                <div class="seek-fill" :style="{ width: seekPercent + '%' }"></div>
              </div>
            </div>
          </div>

          <!-- 标记控制 -->
          <div class="mark-controls">
            <div class="mark-row">
              <el-button size="small" @click="markStart">
                <el-icon><VideoPlay /></el-icon> 设为开始
              </el-button>
              <span class="mark-time">{{ store.formatTime(markStartTime) }}</span>
              <span class="mark-sep">→</span>
              <span class="mark-time">{{ store.formatTime(markEndTime > 0 ? markEndTime : store.currentTime) }}</span>
              <el-button size="small" @click="markEnd">
                <el-icon><VideoPause /></el-icon> 设为结束
              </el-button>
            </div>
            <el-button size="small" type="primary" @click="saveClip" :disabled="markStartTime < 0">
              保存当前片段
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 片段列表 + 总轨道 -->
    <div class="clipper-bottom">
      <!-- 片段列表 -->
      <div class="clips-panel">
        <div class="panel-header">
          <span>片段列表 ({{ store.clips.length }})</span>
        </div>
        <div v-if="store.clips.length === 0" class="panel-empty-sm">
          <span>暂无片段，请从视频中标记并保存</span>
        </div>
        <div v-else class="clips-list">
          <div
            v-for="clip in store.clips"
            :key="clip.id"
            class="clip-item"
          >
            <span class="clip-idx">{{ store.formatTime(clip.startTime) }} - {{ store.formatTime(clip.endTime) }}</span>
            <span class="clip-label">{{ clip.label }}</span>
            <span class="clip-dur">{{ clip.duration.toFixed(1) }}s</span>
            <el-button size="small" circle title="播放片段" @click="playClip(clip)">
              <el-icon><VideoPlay /></el-icon>
            </el-button>
            <el-button size="small" circle title="加入轨道" @click="store.addToTimeline(clip.id)">
              <el-icon><Plus /></el-icon>
            </el-button>
            <el-button size="small" circle title="删除" @click="store.removeClip(clip.id)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>

      <!-- 总轨道 -->
      <div class="timeline-panel">
        <div class="panel-header">
          <span>总轨道</span>
          <el-button size="small" type="success" @click="exportToJianying" :disabled="store.timeline.clips.length === 0">
            <el-icon><Connection /></el-icon> 导出到剪映
          </el-button>
        </div>
        <div v-if="store.timeline.clips.length === 0" class="panel-empty-sm">
          <span>将片段加入轨道进行组合编排</span>
        </div>
        <div v-else class="timeline-track">
          <div
            v-for="(clipId, idx) in store.timeline.clips"
            :key="clipId"
            class="track-item"
            draggable="true"
            @dragstart="onDragStart(idx)"
            @dragover.prevent
            @drop="onDrop(idx)"
          >
            <span class="track-num">{{ idx + 1 }}</span>
            <span class="track-label">{{ getClipLabel(clipId) }}</span>
            <span class="track-time">{{ getClipTime(clipId) }}</span>
            <el-button size="small" circle title="移除" @click="store.removeFromTimeline(clipId)">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
          <div class="track-total">
            总时长：{{ totalDuration.toFixed(1) }}s
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useCreatorModeStore, type VideoClip } from '@/stores/creatorMode'

const store = useCreatorModeStore()

const videoRef = ref<HTMLVideoElement | null>(null)
const videoInputRef = ref<HTMLInputElement | null>(null)
const videoUrl = ref('')
const markStartTime = ref(-1)
const markEndTime = ref(-1)
let dragIdx = -1

const seekPercent = computed(() => {
  if (store.videoDuration <= 0) return 0
  return (store.currentTime / store.videoDuration) * 100
})

const totalDuration = computed(() => {
  return store.getTimelineClips().reduce((sum, c) => sum + c.duration, 0)
})

function triggerImport() {
  videoInputRef.value?.click()
}

function handleVideoImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const url = URL.createObjectURL(file)
  videoUrl.value = url
  store.setVideo(url, file.name)
  markStartTime.value = -1
  markEndTime.value = -1
}

function clearVideo() {
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  videoUrl.value = ''
  store.setVideo('', '')
  store.setVideoDuration(0)
  store.setCurrentTime(0)
  markStartTime.value = -1
  markEndTime.value = -1
}

function togglePlay() {
  const video = videoRef.value
  if (!video) return
  if (video.paused) video.play()
  else video.pause()
}

function onTimeUpdate() {
  if (videoRef.value) {
    store.setCurrentTime(videoRef.value.currentTime)
  }
}

function onLoadedMeta() {
  if (videoRef.value) {
    store.setVideoDuration(videoRef.value.duration)
  }
}

function seekVideo(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  if (videoRef.value) {
    videoRef.value.currentTime = pct * store.videoDuration
  }
}

function markStart() {
  markStartTime.value = store.currentTime
  markEndTime.value = -1
  ElMessage.success(`开始标记: ${store.formatTime(store.currentTime)}`)
}

function markEnd() {
  markEndTime.value = store.currentTime
  ElMessage.success(`结束标记: ${store.formatTime(store.currentTime)}`)
}

function saveClip() {
  const start = markStartTime.value
  const end = markEndTime.value > 0 ? markEndTime.value : store.currentTime
  if (start < 0 || end <= start) {
    ElMessage.warning('请先标记开始和结束时间')
    return
  }
  const clip = store.addClip(start, end)
  ElMessage.success(`已保存: ${clip.label}`)
  markStartTime.value = -1
  markEndTime.value = -1
}

function playClip(clip: VideoClip) {
  if (!videoRef.value) return
  videoRef.value.currentTime = clip.startTime
  videoRef.value.play()
  // 在结束时间停止
  const checkEnd = setInterval(() => {
    if (!videoRef.value || videoRef.value.currentTime >= clip.endTime) {
      videoRef.value?.pause()
      clearInterval(checkEnd)
    }
  }, 100)
}

function getClipLabel(clipId: string): string {
  return store.clips.find(c => c.id === clipId)?.label || '未知片段'
}

function getClipTime(clipId: string): string {
  const clip = store.clips.find(c => c.id === clipId)
  return clip ? `${store.formatTime(clip.startTime)}-${store.formatTime(clip.endTime)}` : ''
}

function onDragStart(idx: number) {
  dragIdx = idx
}

function onDrop(idx: number) {
  if (dragIdx >= 0 && dragIdx !== idx) {
    store.reorderTimeline(dragIdx, idx)
  }
  dragIdx = -1
}

function exportToJianying() {
  const timelineClips = store.getTimelineClips()
  if (timelineClips.length === 0) {
    ElMessage.warning('轨道为空')
    return
  }

  // 生成剪映兼容的草稿数据
  const draftData = {
    version: '4.0.0',
    tracks: [
      {
        id: 'track_main',
        type: 'video',
        segments: timelineClips.map((clip, idx) => ({
          id: `seg_${idx}`,
          sourceFile: clip.sourceFileName,
          startTime: clip.startTime * 1000000, // 剪映使用微秒
          endTime: clip.endTime * 1000000,
          duration: clip.duration * 1000000,
          label: clip.label
        }))
      }
    ]
  }

  const json = JSON.stringify(draftData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const downloadUrl = URL.createObjectURL(blob)

  // 下载到本地
  const a = document.createElement('a')
  a.href = downloadUrl
  a.download = 'jianying_draft.json'
  a.click()
  URL.revokeObjectURL(downloadUrl)

  ElMessage.success('已导出剪映项目文件，请在剪映中导入')
}
</script>

<style scoped>
.video-clipper {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 12px;
  overflow: hidden;
}

.clipper-main {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.source-panel {
  width: 200px;
  min-width: 200px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-panel {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.source-empty, .preview-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #c0c4cc;
}

.hint {
  font-size: 12px;
  color: #c0c4cc;
}

.source-info {
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.video-file {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.video-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.preview-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.video-player {
  width: 100%;
  max-height: 280px;
  background: #000;
}

.video-controls {
  padding: 8px 12px;
}

.control-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-display {
  font-size: 12px;
  color: #606266;
  font-family: monospace;
  min-width: 110px;
}

.seek-bar {
  flex: 1;
  height: 4px;
  background: #e4e7ed;
  border-radius: 2px;
  cursor: pointer;
}

.seek-fill {
  height: 100%;
  background: #409eff;
  border-radius: 2px;
}

.mark-controls {
  padding: 8px 12px;
  border-top: 1px solid #f0f2f5;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mark-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mark-time {
  font-size: 13px;
  font-family: monospace;
  color: #606266;
}

.mark-sep {
  color: #c0c4cc;
}

/* 底部区域 */
.clipper-bottom {
  display: flex;
  gap: 12px;
  height: 200px;
  min-height: 200px;
}

.clips-panel, .timeline-panel {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-empty-sm {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  font-size: 13px;
}

.clips-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.clip-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.clip-item:hover { background: #f5f7fa; }

.clip-idx {
  font-family: monospace;
  color: #409eff;
  min-width: 90px;
}

.clip-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clip-dur {
  color: #909399;
  min-width: 40px;
}

.timeline-track {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.track-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #ecf5ff;
  border-radius: 4px;
  font-size: 12px;
  cursor: grab;
}

.track-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}

.track-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-time {
  font-family: monospace;
  color: #909399;
  font-size: 11px;
}

.track-total {
  padding: 6px 8px;
  font-size: 12px;
  color: #606266;
  text-align: right;
  border-top: 1px solid #f0f2f5;
  margin-top: auto;
}
</style>
