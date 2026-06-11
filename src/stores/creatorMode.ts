import { defineStore } from 'pinia'
import { ref, reactive, computed, watch } from 'vue'
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
  source: 'manual' | 'folder'  // 导入来源：手动选择文件 / 文件夹浏览点击
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
const VIDEO_ROOTS_KEY = 'creator-video-roots'
const VIDEOS_KEY = 'creator-videos'

export const useCreatorModeStore = defineStore('creatorMode', () => {
  // ===== 子模式 =====
  const subMode = ref<CreatorSubMode>('work-state')

  function switchSubMode(mode: CreatorSubMode) {
    subMode.value = mode
  }

  // ===== 视频源管理（批量导入） =====
  const importedVideos = ref<ImportedVideo[]>(loadVideos())
  const activeVideoId = ref<string | null>(null)

  function loadVideos(): ImportedVideo[] {
    try {
      const raw = localStorage.getItem(VIDEOS_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        return arr.map((v: any) => ({
          ...v,
          file: { name: v.name } as File,
          url: v.path ? `file:///${v.path.replace(/\\/g, '/')}` : v.url,
          subtitles: Array.isArray(v.subtitles) ? v.subtitles : [],
          asrStatus: v.asrStatus || 'idle',
          source: v.source || 'manual',
          duration: v.duration || 0,
          width: v.width || 0,
          height: v.height || 0,
          ratio: v.ratio || '16:9'
        }))
      }
    } catch {}
    return []
  }

  function saveVideos() {
    const data = importedVideos.value.map(v => ({
      id: v.id,
      name: v.name,
      path: v.path,
      url: v.url,
      duration: v.duration,
      width: v.width,
      height: v.height,
      ratio: v.ratio,
      subtitles: v.subtitles,
      asrStatus: v.asrStatus,
      asrError: v.asrError,
      source: v.source
    }))
    localStorage.setItem(VIDEOS_KEY, JSON.stringify(data))
  }

  const activeVideo = computed(() =>
    importedVideos.value.find(v => v.id === activeVideoId.value) || null
  )

  function addVideo(file: File, url: string, path: string, source: 'manual' | 'folder' = 'folder') {
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
      asrStatus: 'idle',
      source
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

  /** 尝试恢复已缓存的字幕（只从存储目录加载） */
  async function restoreCachedSubtitles(videoId: string, videoPath: string) {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.readFileAsText || !storagePath.value) return

    const videoName = videoPath.split(/[\\/]/).pop()?.replace(/\.\w+$/, '') || 'unknown'
    const cachePath = `${storagePath.value.replace(/\\/g, '/')}/${videoName}.subtitles.json`

    try {
      const result = await electronAPI.readFileAsText(cachePath)
      if (result.success) {
        const subtitles = JSON.parse(result.content)
        if (Array.isArray(subtitles) && subtitles.length > 0) {
          setVideoSubtitles(videoId, subtitles)
          console.log(`[缓存] 已恢复 ${subtitles.length} 条字幕: ${videoId}`)
        }
      }
    } catch { /* 文件不存在或解析失败 */ }
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
    try { return localStorage.getItem(STORAGE_PATH_KEY) || 'C:\\Users\\Administrator\\Documents\\jianyinwenjian' } catch { return 'C:\\Users\\Administrator\\Documents\\jianyinwenjian' }
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

  // ===== 字幕缓存文件计数 =====
  const subtitleCacheCount = ref(0)

  /** 扫描存储目录中的字幕缓存文件数（递归） */
  async function scanSubtitleCacheCount() {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.listDirectory || !storagePath.value) return

    async function listRecursive(dirPath: string): Promise<string[]> {
      const results: string[] = []
      try {
        const entries = await electronAPI.listDirectory(dirPath)
        for (const entry of entries) {
          if (entry.isFile && entry.name.endsWith('.subtitles.json')) {
            results.push(entry.path)
          } else if (entry.isDirectory) {
            const sub = await listRecursive(entry.path)
            results.push(...sub)
          }
        }
      } catch {}
      return results
    }

    try {
      const files = await listRecursive(storagePath.value)
      subtitleCacheCount.value = files.length
    } catch {
      subtitleCacheCount.value = 0
    }
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

  // ===== 视频文件夹导航（对齐基础模式 FolderPath 结构） =====
  interface VideoFolderPath {
    id: string
    path: string
    label: string
    group: string
    isValid: boolean
  }

  const ORPHAN_FOLDER_ID = '_orphan_videos_'
  const ORPHAN_FOLDER_LABEL = '导入的视频'
  let videoIdCounter = 0
  const videoRootPaths = ref<VideoFolderPath[]>(loadVideoRoots())
  const activeVideoRootId = ref<string>(ORPHAN_FOLDER_ID)
  const videoBrowseStack = ref<string[]>([])
  const videoCurrentFolder = ref<string>('')
  const videoDirEntries = ref<Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>>([])
  const videoDirLoading = ref(false)

  function loadVideoRoots(): VideoFolderPath[] {
    const roots: VideoFolderPath[] = [
      { id: ORPHAN_FOLDER_ID, path: '', label: ORPHAN_FOLDER_LABEL, group: '默认', isValid: true }
    ]
    try {
      const d = localStorage.getItem(VIDEO_ROOTS_KEY)
      if (d) {
        const arr: VideoFolderPath[] = JSON.parse(d)
        videoIdCounter = arr.reduce((max, fp) => Math.max(max, parseInt(fp.id) || 0), 0)
        roots.push(...arr)
      }
    } catch {}
    return roots
  }
  function saveVideoRoots() {
    localStorage.setItem(VIDEO_ROOTS_KEY, JSON.stringify(
      videoRootPaths.value.filter(fp => fp.id !== ORPHAN_FOLDER_ID && fp.group !== '临时')
    ))
  }

  /** 通过系统对话框选择文件夹并设为活动根目录 */
  function setVideoFolder(folderPath: string) {
    const label = folderPath.split(/[/\\]/).pop() || folderPath
    addVideoTempPath(folderPath, label)
  }

  function addVideoTempPath(folderPath: string, label: string) {
    if (!folderPath) return
    const existing = videoRootPaths.value.find(fp => fp.path.toLowerCase() === folderPath.toLowerCase())
    if (existing) {
      activeVideoRootId.value = existing.id
      return
    }
    const id = 'temp_' + Date.now()
    videoRootPaths.value.push({ id, path: folderPath, label, group: '临时', isValid: true })
    activeVideoRootId.value = id
  }

  function addVideoRootPath(fp: { id?: string; path: string; label: string; group?: string; isValid?: boolean }) {
    const p = fp.path.toLowerCase()
    if (!p) return false
    if (videoRootPaths.value.some(v => v.path.toLowerCase() === p)) return false
    const id = fp.id || String(++videoIdCounter)
    videoRootPaths.value.push({
      id,
      path: fp.path,
      label: fp.label || fp.path.split(/[/\\]/).pop() || fp.path,
      group: fp.group || '',
      isValid: fp.isValid !== false
    })
    saveVideoRoots()
    if (!activeVideoRootId.value) activeVideoRootId.value = id
    return true
  }

  function updateVideoRootPath(id: string, data: { path: string; label: string; group: string }) {
    const fp = videoRootPaths.value.find(v => v.id === id)
    if (!fp) return
    fp.path = data.path
    fp.label = data.label || data.path.split(/[/\\]/).pop() || data.path
    fp.group = data.group
    fp.isValid = true
    saveVideoRoots()
  }

  function removeVideoRootPath(id: string) {
    if (id === ORPHAN_FOLDER_ID) return  // 禁止删除默认文件夹
    videoRootPaths.value = videoRootPaths.value.filter(v => v.id !== id)
    if (activeVideoRootId.value === id) {
      activeVideoRootId.value = ORPHAN_FOLDER_ID
    }
    saveVideoRoots()
  }

  const activeVideoRootPath = computed(() =>
    videoRootPaths.value.find(v => v.id === activeVideoRootId.value) || null
  )

  async function refreshVideoDir(dirPath?: string) {
    // 默认「导入的视频」文件夹：显示不在任何真实根文件夹中的视频
    if (activeVideoRootId.value === ORPHAN_FOLDER_ID && !dirPath && !videoCurrentFolder.value) {
      videoDirEntries.value = getOrphanVideoEntries()
      videoDirLoading.value = false
      return
    }

    const target = dirPath || videoCurrentFolder.value || activeVideoRootPath.value?.path || ''
    videoDirLoading.value = true
    try {
      const api = (window as any).electronAPI
      if (!api?.readVideoDirectory || !target) { videoDirEntries.value = []; return }
      videoDirEntries.value = await api.readVideoDirectory(target)
      videoDirEntries.value.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      const root = videoRootPaths.value.find(v => v.id === activeVideoRootId.value)
      if (root) root.isValid = true
    } catch {
      videoDirEntries.value = []
      const root = videoRootPaths.value.find(v => v.id === activeVideoRootId.value)
      if (root) root.isValid = false
    } finally {
      videoDirLoading.value = false
    }
  }

  /** 获取手动导入的视频（通过「选择视频文件」导入的） */
  function getOrphanVideoEntries(): Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }> {
    return importedVideos.value
      .filter(v => v.source === 'manual')
      .map(v => ({
        name: v.name,
        path: v.path,
        isDirectory: false,
        isFile: true
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async function navigateIntoVideoDir(subPath: string) {
    videoBrowseStack.value.push(videoCurrentFolder.value)
    videoCurrentFolder.value = subPath
    await refreshVideoDir(subPath)
  }

  async function navigateUpVideoDir() {
    if (videoBrowseStack.value.length > 0) {
      videoCurrentFolder.value = videoBrowseStack.value.pop()!
      await refreshVideoDir(videoCurrentFolder.value)
    } else {
      videoCurrentFolder.value = ''
      await refreshVideoDir()
    }
  }

  async function navigateHomeVideo() {
    videoBrowseStack.value = []
    videoCurrentFolder.value = ''
    await refreshVideoDir()
  }

  /** 根层级目录条目：所有固定根文件夹 */
  const rootEntries = computed(() => {
    return videoRootPaths.value.map(fp => ({
      name: fp.label,
      path: fp.path,
      isDirectory: true,
      isFile: false
    }))
  })

  // activeVideoRootId 变化时自动刷新
  watch(activeVideoRootId, (newId) => {
    if (newId) {
      videoBrowseStack.value = []
      videoCurrentFolder.value = ''
      if (newId === ORPHAN_FOLDER_ID) {
        videoDirEntries.value = getOrphanVideoEntries()
        videoDirLoading.value = false
      } else {
        refreshVideoDir()
      }
    }
  }, { immediate: true })

  let _videosReady = false

  // 视频列表变化时自动刷新「导入的视频」文件夹
  watch(importedVideos, () => {
    if (activeVideoRootId.value === ORPHAN_FOLDER_ID && !videoBrowseStack.value.length && !videoCurrentFolder.value) {
      videoDirEntries.value = getOrphanVideoEntries()
    }
  }, { deep: true })

  // 视频列表变化时自动持久化（跳过初始化首次触发）
  watch(importedVideos, () => {
    if (!_videosReady) return
    saveVideos()
  }, { deep: true })

  // 标记初始化完成，后续变更才触发持久化
  _videosReady = true

  return {
    // 子模式
    subMode, switchSubMode,

    // 视频源管理
    importedVideos, activeVideoId, activeVideo,
    addVideo, removeVideo, setActiveVideo, setVideoMeta,
    setVideoSubtitles, setAsrStatus, restoreCachedSubtitles,

    // 播放状态
    currentTime, videoDuration, isPlaying,
    setCurrentTime, setVideoDuration, setIsPlaying,

    // 入出点
    inPointMs, outPointMs,

    // 存储
    storagePath, setStoragePath,
    jianyingDraftPath, setJianyingDraftPath,
    subtitleCacheCount, scanSubtitleCacheCount,

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
    setCanvasOffset, setCanvasScale,

    // 视频文件夹导航
    videoRootPaths, activeVideoRootId, activeVideoRootPath,
    setVideoFolder, addVideoRootPath, addVideoTempPath,
    updateVideoRootPath, removeVideoRootPath,
    videoBrowseStack, videoCurrentFolder,
    videoDirEntries, videoDirLoading, rootEntries,
    refreshVideoDir, navigateIntoVideoDir, navigateUpVideoDir, navigateHomeVideo
  }
})
