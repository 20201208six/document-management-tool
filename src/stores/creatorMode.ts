import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import type { SubtitleSegment } from '@/services/asr'

// ===== 类型定义 =====

/** 视频片段（入出点编辑后的片段） */
export interface VideoClip {
  id: string
  sourceFile: string
  sourceFileName: string
  startTime: number    // 秒
  endTime: number      // 秒
  duration: number     // 秒
  label: string
}

/** 导入的视频源 */
export interface ImportedVideo {
  id: string
  file: File
  url: string           // blob URL
  name: string
  path: string          // 完整路径
  duration: number      // 秒
  width: number
  height: number
  ratio: string         // '9:16' | '16:9' | '1:1' | 'custom'
  subtitles: SubtitleSegment[]
  asrStatus: 'idle' | 'processing' | 'done' | 'error'
  asrError?: string
}

/** 时间轨道 */
export interface TimelineTrack {
  id: string
  clips: string[]       // clip ids
  label: string
}

/** 工作流节点 */
export interface WorkflowNode {
  id: string
  type: 'trigger' | 'source' | 'process' | 'output'
  label: string
  x: number
  y: number
  config: Record<string, any>
}

/** 工作流连线 */
export interface WorkflowEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  label: string
}

/** 创作者模式子模式 */
export type CreatorSubMode = 'work-state' | 'workflow'

// ===== 本地存储 Key =====
const CLIPS_KEY = 'creator-clips-v2'
const TIMELINE_KEY = 'creator-timeline-v2'
const WORKFLOW_KEY = 'creator-workflow'
const STORAGE_PATH_KEY = 'creator-storage-path'
const JIANYING_PATH_KEY = 'creator-jianying-path'
const SEARCH_KEY = 'creator-search-history'

export const useCreatorModeStore = defineStore('creatorMode', () => {
  // ===== 子模式 =====
  const subMode = ref<CreatorSubMode>('work-state')

  function switchSubMode(mode: CreatorSubMode) {
    subMode.value = mode
  }

  // ===== 视频源管理（批量导入） =====
  const importedVideos = ref<ImportedVideo[]>([])
  const activeVideoId = ref<string | null>(null)

  const activeVideo = computed(() =>
    importedVideos.value.find(v => v.id === activeVideoId.value) || null
  )

  function addVideo(file: File, url: string, path: string) {
    // 去重：判断路径是否已存在
    if (importedVideos.value.some(v => v.path === path)) return null
    const id = 'vid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const video: ImportedVideo = {
      id,
      file,
      url,
      name: file.name,
      path,
      duration: 0,
      width: 0,
      height: 0,
      ratio: '16:9',
      subtitles: [],
      asrStatus: 'idle'
    }
    importedVideos.value.push(video)
    if (!activeVideoId.value) activeVideoId.value = id
    return video
  }

  function removeVideo(videoId: string) {
    const video = importedVideos.value.find(v => v.id === videoId)
    if (video?.url) URL.revokeObjectURL(video.url)
    importedVideos.value = importedVideos.value.filter(v => v.id !== videoId)
    if (activeVideoId.value === videoId) {
      activeVideoId.value = importedVideos.value[0]?.id || null
    }
  }

  function setActiveVideo(videoId: string) {
    activeVideoId.value = videoId
  }

  function setVideoMeta(videoId: string, duration: number, width: number, height: number) {
    const video = importedVideos.value.find(v => v.id === videoId)
    if (!video) return
    video.duration = duration
    video.width = width
    video.height = height
    video.ratio = calcRatio(width, height)
  }

  function calcRatio(w: number, h: number): string {
    if (w === 0 || h === 0) return '16:9'
    const r = w / h
    // 16:9 = 1.777..., 1:1 = 1.0, 9:16 = 0.5625
    // 阈值取相邻比例的中点
    if (r >= 1.39) return '16:9'
    if (r >= 0.78) return '1:1'
    return '9:16'
  }

  /** 设置视频 ASR 字幕 */
  function setVideoSubtitles(videoId: string, subtitles: SubtitleSegment[]) {
    const video = importedVideos.value.find(v => v.id === videoId)
    if (!video) return
    video.subtitles = subtitles
    video.asrStatus = 'done'
  }

  function setAsrStatus(videoId: string, status: ImportedVideo['asrStatus'], error?: string) {
    const video = importedVideos.value.find(v => v.id === videoId)
    if (!video) return
    video.asrStatus = status
    if (error) video.asrError = error
  }

  // ===== 视频播放状态 =====
  const currentTime = ref(0)
  const videoDuration = ref(0)
  const isPlaying = ref(false)

  // ===== 入出点标记（毫秒精度） =====
  const inPointMs = ref(0)
  const outPointMs = ref(0)

  // ===== 存储文件夹 =====
  const storagePath = ref(loadStoragePath())
  const jianyingDraftPath = ref(loadJianyingPath())

  function loadStoragePath(): string {
    try { return localStorage.getItem(STORAGE_PATH_KEY) || '' } catch { return '' }
  }

  function loadJianyingPath(): string {
    try { return localStorage.getItem(JIANYING_PATH_KEY) || 'D:\\ruanjianxiazai\\jianying\\JianyingPro Drafts' } catch { return 'D:\\ruanjianxiazai\\jianying\\JianyingPro Drafts' }
  }

  function setStoragePath(path: string) {
    storagePath.value = path
    localStorage.setItem(STORAGE_PATH_KEY, path)
  }

  function setJianyingDraftPath(path: string) {
    jianyingDraftPath.value = path
    localStorage.setItem(JIANYING_PATH_KEY, path)
  }

  // ===== 片段管理 =====
  const clips = ref<VideoClip[]>(loadClips())

  function loadClips(): VideoClip[] {
    try {
      const data = localStorage.getItem(CLIPS_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function saveClips() {
    localStorage.setItem(CLIPS_KEY, JSON.stringify(clips.value))
  }

  function addClip(startTime: number, endTime: number, label?: string): VideoClip {
    const av = activeVideo.value
    const clip: VideoClip = {
      id: 'clip_' + Date.now(),
      sourceFile: av?.path || '',
      sourceFileName: av?.name || '',
      startTime,
      endTime,
      duration: endTime - startTime,
      label: label || `${formatTime(startTime)} - ${formatTime(endTime)}`
    }
    clips.value.push(clip)
    saveClips()
    return clip
  }

  function removeClip(clipId: string) {
    clips.value = clips.value.filter(c => c.id !== clipId)
    timeline.value.clips = timeline.value.clips.filter(id => id !== clipId)
    saveClips()
    saveTimeline()
  }

  function updateClipTime(clipId: string, start: number, end: number) {
    const clip = clips.value.find(c => c.id === clipId)
    if (clip) {
      clip.startTime = start
      clip.endTime = end
      clip.duration = end - start
      clip.label = `${formatTime(start)} - ${formatTime(end)}`
      saveClips()
    }
  }

  // ===== 时间轨道 =====
  const timeline = ref<TimelineTrack>(loadTimeline())

  function loadTimeline(): TimelineTrack {
    try {
      const data = localStorage.getItem(TIMELINE_KEY)
      return data ? JSON.parse(data) : { id: 'track_1', clips: [], label: '主轨道' }
    } catch {
      return { id: 'track_1', clips: [], label: '主轨道' }
    }
  }

  function saveTimeline() {
    localStorage.setItem(TIMELINE_KEY, JSON.stringify(timeline.value))
  }

  function addToTimeline(clipId: string) {
    if (!timeline.value.clips.includes(clipId)) {
      timeline.value.clips.push(clipId)
      saveTimeline()
    }
  }

  function removeFromTimeline(clipId: string) {
    timeline.value.clips = timeline.value.clips.filter(id => id !== clipId)
    saveTimeline()
  }

  function reorderTimeline(fromIndex: number, toIndex: number) {
    const arr = timeline.value.clips
    const [moved] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, moved)
    saveTimeline()
  }

  function getTimelineClips(): VideoClip[] {
    return timeline.value.clips
      .map(id => clips.value.find(c => c.id === id))
      .filter((c): c is VideoClip => !!c)
  }

  /** 轨道总时长（秒） */
  const timelineTotalDuration = computed(() =>
    getTimelineClips().reduce((sum, c) => sum + c.duration, 0)
  )

  // ===== 搜索 =====
  const searchQuery = ref('')
  const searchHistory = ref<string[]>(loadSearchHistory())

  function loadSearchHistory(): string[] {
    try {
      const data = localStorage.getItem(SEARCH_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  /** 获取所有字幕片段（跨所有视频） */
  const allSubtitles = computed(() => {
    const result: Array<{
      videoId: string
      videoName: string
      segment: SubtitleSegment
    }> = []
    for (const video of importedVideos.value) {
      for (const seg of video.subtitles) {
        result.push({ videoId: video.id, videoName: video.name, segment: seg })
      }
    }
    return result
  })

  /** 搜索字幕 */
  const searchedSubtitles = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return allSubtitles.value
    return allSubtitles.value.filter(s =>
      s.segment.text.toLowerCase().includes(q) ||
      s.videoName.toLowerCase().includes(q)
    )
  })

  /** 搜索片段 */
  const searchedClips = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return clips.value
    return clips.value.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.sourceFileName.toLowerCase().includes(q)
    )
  })

  function setSearchQuery(q: string) {
    searchQuery.value = q
    if (q && !searchHistory.value.includes(q)) {
      searchHistory.value.unshift(q)
      if (searchHistory.value.length > 20) searchHistory.value.pop()
      localStorage.setItem(SEARCH_KEY, JSON.stringify(searchHistory.value))
    }
  }

  // ===== 格式工具 =====
  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function formatTimeMs(ms: number): string {
    return formatTime(ms / 1000) + '.' + Math.floor((ms % 1000) / 100)
  }

  function setCurrentTime(t: number) { currentTime.value = t }
  function setVideoDuration(d: number) { videoDuration.value = d }
  function setIsPlaying(p: boolean) { isPlaying.value = p }

  // ===== 工作流（保留） =====
  const workflowNodes = ref<WorkflowNode[]>(loadWorkflowNodes())
  const workflowEdges = ref<WorkflowEdge[]>(loadWorkflowEdges())
  const selectedNodeId = ref<string | null>(null)
  const canvasOffset = reactive({ x: 0, y: 0 })
  const canvasScale = ref(1)

  function loadWorkflowNodes(): WorkflowNode[] {
    try {
      const data = localStorage.getItem(WORKFLOW_KEY + '_nodes')
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function loadWorkflowEdges(): WorkflowEdge[] {
    try {
      const data = localStorage.getItem(WORKFLOW_KEY + '_edges')
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function saveWorkflow() {
    localStorage.setItem(WORKFLOW_KEY + '_nodes', JSON.stringify(workflowNodes.value))
    localStorage.setItem(WORKFLOW_KEY + '_edges', JSON.stringify(workflowEdges.value))
  }

  function addNode(type: WorkflowNode['type'], label: string, x: number, y: number): WorkflowNode {
    const node: WorkflowNode = { id: 'node_' + Date.now(), type, label, x, y, config: {} }
    workflowNodes.value.push(node)
    saveWorkflow()
    return node
  }

  function removeNode(nodeId: string) {
    workflowNodes.value = workflowNodes.value.filter(n => n.id !== nodeId)
    workflowEdges.value = workflowEdges.value.filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId)
    saveWorkflow()
  }

  function updateNodePosition(nodeId: string, x: number, y: number) {
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node) { node.x = x; node.y = y; saveWorkflow() }
  }

  function addEdge(fromNodeId: string, toNodeId: string, label = ''): WorkflowEdge {
    const edge: WorkflowEdge = { id: 'edge_' + Date.now(), fromNodeId, toNodeId, label }
    workflowEdges.value.push(edge)
    saveWorkflow()
    return edge
  }

  function removeEdge(edgeId: string) {
    workflowEdges.value = workflowEdges.value.filter(e => e.id !== edgeId)
    saveWorkflow()
  }

  function selectNode(nodeId: string | null) { selectedNodeId.value = nodeId }
  function setCanvasOffset(x: number, y: number) { canvasOffset.x = x; canvasOffset.y = y }
  function setCanvasScale(s: number) { canvasScale.value = Math.max(0.3, Math.min(3, s)) }

  return {
    // 子模式
    subMode, switchSubMode,

    // 视频源管理
    importedVideos, activeVideoId, activeVideo,
    addVideo, removeVideo, setActiveVideo, setVideoMeta,
    setVideoSubtitles, setAsrStatus,

    // 播放状态
    currentTime, videoDuration, isPlaying,
    setCurrentTime, setVideoDuration, setIsPlaying,

    // 入出点
    inPointMs, outPointMs,

    // 存储
    storagePath, setStoragePath,
    jianyingDraftPath, setJianyingDraftPath,

    // 片段
    clips, addClip, removeClip, updateClipTime,

    // 轨道
    timeline, addToTimeline, removeFromTimeline,
    reorderTimeline, getTimelineClips, timelineTotalDuration,

    // 搜索
    searchQuery, searchHistory, searchedSubtitles, searchedClips,
    setSearchQuery,

    // 工具
    formatTime, formatTimeMs,

    // 工作流
    workflowNodes, workflowEdges, selectedNodeId,
    addNode, removeNode, updateNodePosition,
    addEdge, removeEdge, selectNode,
    canvasOffset, canvasScale,
    setCanvasOffset, setCanvasScale
  }
})
