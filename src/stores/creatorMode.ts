import { defineStore } from 'pinia'
import { ref, reactive, computed, watch } from 'vue'
import type { SubtitleSegment } from '@/services/asr'
import { eventBus } from '@/services/eventBus'
import type {} from '@/types/creatorEvents'
import { getAgentConfig, saveCheckpoint, loadCheckpoint, clearCheckpoint, executeAgentNode, agentDialogueLoop, createReviewPause, cancelAgentReview } from '@/services/creatorAgent'

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
  fps: number           // 视频帧率（ASR 时从视频检测，0 表示未知）
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
  config: NodeConfig
}

/** 工作流连线 */
export interface WorkflowEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  label: string
}

/** 节点执行状态 */
export type NodeExecStatus = 'idle' | 'running' | 'success' | 'error'

/** 节点执行结果 */
export interface NodeExecResult {
  status: NodeExecStatus
  output: string       // 输出内容
  error?: string       // 错误信息
  data?: any           // 结构化输出数据
}

/** 节点配置类型（根据节点 label 不同） */
export interface NodeConfig {
  // 定时触发
  cron?: string
  interval?: number
  // 读取视频/文件
  filePath?: string
  fileType?: string
  // 读取文件夹
  folderPath?: string
  fileFilter?: string
  recursive?: boolean
  // 新建文档
  docFileName?: string
  docContent?: string
  docOutputPath?: string
  docFileType?: 'txt' | 'md' | 'json' | 'srt' | 'csv'
  // AI文案生成
  prompt?: string
  modelId?: string
  // 文本处理
  operation?: 'replace' | 'format' | 'summarize'
  pattern?: string
  replacement?: string
  // 格式转换
  targetFormat?: 'srt' | 'txt' | 'json' | 'md'
  // 保存文件
  outputPath?: string
  fileName?: string
  // 导出剪映
  projectName?: string
  draftPath?: string
  // 执行结果（运行时填充）
  result?: NodeExecResult
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
    eventBus.emit('creator:ui:subModeChanged', { mode })
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
      source,
      fps: 0
    }
    importedVideos.value.push(video)
    if (!activeVideoId.value) activeVideoId.value = id
    eventBus.emit('creator:video:imported', { videoId: id, videoName: file.name, videoPath: path })
    return video
  }

  function removeVideo(videoId: string) {
    const video = importedVideos.value.find(v => v.id === videoId)
    if (video?.url) URL.revokeObjectURL(video.url)
    importedVideos.value = importedVideos.value.filter(v => v.id !== videoId)
    if (activeVideoId.value === videoId) {
      activeVideoId.value = importedVideos.value[0]?.id || null
    }
    eventBus.emit('creator:video:removed', { videoId, videoName: video?.name || '未知' })
  }

  function setActiveVideo(videoId: string) {
    activeVideoId.value = videoId
    const video = importedVideos.value.find(v => v.id === videoId)
    eventBus.emit('creator:video:activated', { videoId, videoName: video?.name || null })
  }

  function setVideoMeta(videoId: string, duration: number, width: number, height: number) {
    const video = importedVideos.value.find(v => v.id === videoId)
    if (!video) return
    video.duration = duration
    video.width = width
    video.height = height
    video.ratio = calcRatio(width, height)
    eventBus.emit('creator:video:metaLoaded', { videoId, duration, width, height, ratio: video.ratio })
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
    eventBus.emit('creator:asr:completed', { videoId, subtitleCount: subtitles.length })
  }

  function setAsrStatus(videoId: string, status: ImportedVideo['asrStatus'], error?: string) {
    const video = importedVideos.value.find(v => v.id === videoId)
    if (!video) return
    video.asrStatus = status
    if (error) video.asrError = error
    if (status === 'processing') {
      eventBus.emit('creator:asr:started', { videoId, videoName: video.name })
    } else if (status === 'error') {
      eventBus.emit('creator:asr:error', { videoId, error: error || '未知错误' })
    }
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
    eventBus.emit('creator:clip:created', { clipId: clip.id, startTime, endTime, label: clip.label })
    return clip
  }

  function removeClip(clipId: string) {
    clips.value = clips.value.filter(c => c.id !== clipId)
    timeline.value.clips = timeline.value.clips.filter(id => id !== clipId)
    saveClips()
    saveTimeline()
    eventBus.emit('creator:clip:removed', { clipId })
  }

  function updateClipTime(clipId: string, start: number, end: number) {
    const clip = clips.value.find(c => c.id === clipId)
    if (clip) {
      clip.startTime = start
      clip.endTime = end
      clip.duration = end - start
      clip.label = `${formatTime(start)} - ${formatTime(end)}`
      saveClips()
      eventBus.emit('creator:clip:updated', { clipId, startTime: start, endTime: end })
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
      eventBus.emit('creator:track:clipAdded', { clipId })
    }
  }

  function removeFromTimeline(clipId: string) {
    timeline.value.clips = timeline.value.clips.filter(id => id !== clipId)
    saveTimeline()
    eventBus.emit('creator:track:clipRemoved', { clipId })
  }

  function reorderTimeline(fromIndex: number, toIndex: number) {
    const arr = timeline.value.clips
    const [moved] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, moved)
    saveTimeline()
    eventBus.emit('creator:track:reordered', { fromIndex, toIndex })
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
    eventBus.emit('creator:search:changed', { query: q })
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
    eventBus.emit('creator:workflow:nodeAdded', { nodeId: node.id, type, label })
    return node
  }

  function removeNode(nodeId: string) {
    const node = workflowNodes.value.find(n => n.id === nodeId)
    workflowNodes.value = workflowNodes.value.filter(n => n.id !== nodeId)
    workflowEdges.value = workflowEdges.value.filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId)
    saveWorkflow()
    if (node) eventBus.emit('creator:workflow:nodeRemoved', { nodeId, label: node.label })
  }

  function updateNodePosition(nodeId: string, x: number, y: number) {
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node) { node.x = x; node.y = y; saveWorkflow() }
    eventBus.emit('creator:workflow:nodeMoved', { nodeId, x, y })
  }

  function edgeExists(fromNodeId: string, toNodeId: string): boolean {
    return workflowEdges.value.some(e => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId)
  }

  function addEdge(fromNodeId: string, toNodeId: string, label = ''): WorkflowEdge | null {
    if (edgeExists(fromNodeId, toNodeId)) return null
    // 防止循环引用：检查 toNodeId 是否已经可以到达 fromNodeId
    if (canReach(toNodeId, fromNodeId)) return null
    const edge: WorkflowEdge = { id: 'edge_' + Date.now(), fromNodeId, toNodeId, label }
    workflowEdges.value.push(edge)
    saveWorkflow()
    eventBus.emit('creator:workflow:edgeAdded', { edgeId: edge.id, fromNodeId, toNodeId })
    return edge
  }

  function removeEdge(edgeId: string) {
    workflowEdges.value = workflowEdges.value.filter(e => e.id !== edgeId)
    saveWorkflow()
    eventBus.emit('creator:workflow:edgeRemoved', { edgeId })
  }

  function removeEdgesForNode(nodeId: string) {
    workflowEdges.value = workflowEdges.value.filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId)
    saveWorkflow()
  }

  function selectNode(nodeId: string | null) { 
    selectedNodeId.value = nodeId 
    eventBus.emit('creator:workflow:nodeSelected', { nodeId })
  }
  function setCanvasOffset(x: number, y: number) { canvasOffset.x = x; canvasOffset.y = y }
  function setCanvasScale(s: number) { canvasScale.value = Math.max(0.3, Math.min(3, s)) }

  // ===== 节点配置 =====
  function updateNodeConfig(nodeId: string, config: Partial<NodeConfig>) {
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node) {
      node.config = { ...node.config, ...config }
      saveWorkflow()
      eventBus.emit('creator:workflow:nodeConfigured', { nodeId, label: node.label })
    }
  }

  function setNodeResult(nodeId: string, status: NodeExecStatus, output: string, error?: string, data?: any) {
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node) {
      node.config.result = { status, output, error, data }
      saveWorkflow()
    }
  }

  function resetAllNodeResults() {
    for (const node of workflowNodes.value) {
      delete node.config.result
    }
    saveWorkflow()
  }

  // ===== DAG 拓扑排序 =====
  function getTopologicalOrder(): WorkflowNode[] {
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()
    const nodeMap = new Map(workflowNodes.value.map(n => [n.id, n]))

    for (const node of workflowNodes.value) {
      inDegree.set(node.id, 0)
      adjacency.set(node.id, [])
    }
    for (const edge of workflowEdges.value) {
      if (nodeMap.has(edge.fromNodeId) && nodeMap.has(edge.toNodeId)) {
        adjacency.get(edge.fromNodeId)!.push(edge.toNodeId)
        inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) || 0) + 1)
      }
    }

    const queue: string[] = []
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) queue.push(nodeId)
    }

    const result: WorkflowNode[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      const node = nodeMap.get(current)
      if (node) result.push(node)
      for (const neighbor of adjacency.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) queue.push(neighbor)
      }
    }

    return result
  }

  function getUpstreamResults(nodeId: string): NodeExecResult[] {
    const upstreamEdges = workflowEdges.value.filter(e => e.toNodeId === nodeId)
    return upstreamEdges
      .map(e => workflowNodes.value.find(n => n.id === e.fromNodeId))
      .filter((n): n is WorkflowNode => !!n && !!n.config.result)
      .map(n => n.config.result!)
  }

  function canReach(fromId: string, toId: string): boolean {
    const visited = new Set<string>()
    const adjacency = new Map<string, string[]>()
    for (const node of workflowNodes.value) {
      adjacency.set(node.id, [])
    }
    for (const edge of workflowEdges.value) {
      const arr = adjacency.get(edge.fromNodeId)
      if (arr) arr.push(edge.toNodeId)
    }
    function dfs(current: string): boolean {
      if (current === toId) return true
      visited.add(current)
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor) && dfs(neighbor)) return true
      }
      return false
    }
    return dfs(fromId)
  }

  // ===== 工作流执行引擎 =====
  const isWorkflowRunning = ref(false)
  const workflowLogs = ref<string[]>([])

  function addWorkflowLog(msg: string) {
    workflowLogs.value.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
  }

  async function executeWorkflow(resumeFromCheckpoint = false) {
    if (isWorkflowRunning.value) return
    isWorkflowRunning.value = true
    workflowLogs.value = []

    // 检查点恢复
    let startIndex = 0
    if (resumeFromCheckpoint) {
      const checkpoint = loadCheckpoint()
      if (checkpoint && checkpoint.completedNodeIds.length > 0) {
        // 恢复已完成节点的状态
        for (const nodeId of checkpoint.completedNodeIds) {
          const node = workflowNodes.value.find(n => n.id === nodeId)
          if (node) {
            setNodeResult(nodeId, 'success', '(从检查点恢复)')
          }
        }
        startIndex = checkpoint.currentIndex
        addWorkflowLog(`从检查点恢复: 已完成 ${checkpoint.completedNodeIds.length} 个节点，从第 ${startIndex + 1} 个开始`)
      } else {
        addWorkflowLog('未找到检查点，从头开始执行')
      }
    }

    const ordered = getTopologicalOrder()
    if (ordered.length === 0) {
      addWorkflowLog('画布中没有节点')
      isWorkflowRunning.value = false
      return
    }

    // 如果不是从检查点恢复，重置所有结果
    if (!resumeFromCheckpoint || startIndex === 0) {
      resetAllNodeResults()
    }

    addWorkflowLog(`开始执行工作流 (共 ${ordered.length} 个节点)`)
    eventBus.emit('creator:workflow:executionStarted', { totalNodes: ordered.length })

    let successCount = 0
    let errorCount = 0

    for (let i = startIndex; i < ordered.length; i++) {
      const node = ordered[i]
      setNodeResult(node.id, 'running', '执行中...')
      addWorkflowLog(`执行节点: ${node.label}`)
      eventBus.emit('creator:workflow:nodeExecutionStarted', { nodeId: node.id, label: node.label })
      await new Promise(r => setTimeout(r, 200))

      try {
        const upstreamResults = getUpstreamResults(node.id)
        const agentConfig = getAgentConfig(node)

        // Agent 模式：使用 agent 执行引擎（支持重试）
        let result: { output: string; data?: any }
        if (agentConfig.maxRetries > 0) {
          const agentResult = await executeAgentNode(node, {
            upstreamResults,
            env: {},
            checkpoint: resumeFromCheckpoint ? loadCheckpoint() || undefined : undefined
          }, executeNodeCore)
          if (agentResult.status === 'error') throw new Error(agentResult.error)
          result = { output: agentResult.output, data: agentResult.data }
        } else {
          result = await executeNodeCore(node, upstreamResults)
        }

        setNodeResult(node.id, 'success', result.output, undefined, result.data)
        addWorkflowLog(`  ✓ ${node.label} 完成`)
        eventBus.emit('creator:workflow:nodeExecutionCompleted', {
          nodeId: node.id, label: node.label,
          result: { status: 'success', output: result.output, data: result.data }
        })
        successCount++

        // 保存检查点
        if (agentConfig.enableCheckpoint && i < ordered.length - 1) {
          saveCheckpoint({
            id: 'ckpt_' + Date.now(),
            completedNodeIds: ordered.slice(0, i + 1).map(n => n.id),
            currentIndex: i + 1,
            envSnapshot: {},
            createdAt: Date.now()
          })
        }
      } catch (e: any) {
        const errMsg = e.message || String(e)
        setNodeResult(node.id, 'error', '', errMsg)
        addWorkflowLog(`  ✗ ${node.label} 失败: ${errMsg}`)
        eventBus.emit('creator:workflow:nodeExecutionCompleted', {
          nodeId: node.id, label: node.label,
          result: { status: 'error', output: '', error: errMsg }
        })
        errorCount++

        // 失败时保留检查点（已完成节点），方便重试
        if (i > 0) {
          saveCheckpoint({
            id: 'ckpt_' + Date.now(),
            completedNodeIds: ordered.slice(0, i).map(n => n.id),
            currentIndex: i,
            envSnapshot: {},
            createdAt: Date.now()
          })
        }
      }
    }

    // 全部执行完毕，清除检查点
    clearCheckpoint()
    isWorkflowRunning.value = false
    addWorkflowLog('工作流执行完毕')
    eventBus.emit('creator:workflow:executionCompleted', { successCount, errorCount })
  }

  /**
   * 单独重试一个失败的节点
   */
  async function retryNode(nodeId: string) {
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (!node || !node.config.result || node.config.result.status !== 'error') return

    const upstreamResults = getUpstreamResults(nodeId)
    setNodeResult(nodeId, 'running', '重试中...')
    addWorkflowLog(`重试节点: ${node.label}`)
    eventBus.emit('creator:workflow:nodeExecutionStarted', { nodeId: node.id, label: node.label })

    try {
      const result = await executeNodeCore(node, upstreamResults)
      setNodeResult(nodeId, 'success', result.output, undefined, result.data)
      addWorkflowLog(`  ✓ ${node.label} 重试成功`)
      eventBus.emit('creator:workflow:nodeExecutionCompleted', {
        nodeId: node.id, label: node.label,
        result: { status: 'success', output: result.output, data: result.data }
      })
    } catch (e: any) {
      const errMsg = e.message || String(e)
      setNodeResult(nodeId, 'error', '', errMsg)
      addWorkflowLog(`  ✗ ${node.label} 重试失败: ${errMsg}`)
      eventBus.emit('creator:workflow:nodeExecutionCompleted', {
        nodeId: node.id, label: node.label,
        result: { status: 'error', output: '', error: errMsg }
      })
    }
  }

  /** 从检查点恢复执行 */
  async function resumeWorkflow() {
    await executeWorkflow(true)
  }

  /** 核心节点执行函数（独立于 agent 重试逻辑） */
  async function executeNodeCore(
    node: WorkflowNode,
    upstreamResults: NodeExecResult[]
  ): Promise<{ output: string; data?: any }> {
    return executeNode(node, upstreamResults)
  }

  async function executeNode(
    node: WorkflowNode,
    upstreamResults: NodeExecResult[]
  ): Promise<{ output: string; data?: any }> {
    const cfg = node.config
    const api = (window as any).electronAPI

    switch (node.label) {
      // ===== 触发器 =====
      case '定时触发':
        return { output: '触发信号已发出', data: { triggered: true, timestamp: Date.now() } }

      // ===== 数据源 =====
      case '读取视频': {
        const filePath = cfg.filePath
        if (!filePath) throw new Error('未配置文件路径')
        if (!api?.readFileAsText) throw new Error('文件系统 API 不可用')
        const res = await api.readFileAsText(filePath)
        if (!res.success) throw new Error(res.error || '读取失败')
        const videoName = filePath.split(/[\\/]/).pop() || filePath
        return {
          output: `已读取视频文件: ${videoName}`,
          data: { filePath, fileName: videoName, content: res.content }
        }
      }

      case '读取文件': {
        const filePath = cfg.filePath
        if (!filePath) throw new Error('未配置文件路径')
        if (!api?.readFileAsText) throw new Error('文件系统 API 不可用')
        const res = await api.readFileAsText(filePath)
        if (!res.success) throw new Error(res.error || '读取失败')
        const fileName = filePath.split(/[\\/]/).pop() || filePath
        return {
          output: `已读取文件: ${fileName}`,
          data: { filePath, fileName, content: res.content }
        }
      }

      case '读取文件夹': {
        const folderPath = cfg.folderPath
        if (!folderPath) throw new Error('未配置文件夹路径')
        if (!api?.listDirectory) throw new Error('文件系统 API 不可用')

        const fileFilter = cfg.fileFilter || ''
        const recursive = cfg.recursive || false
        const filters = fileFilter.split(',').map(f => f.trim()).filter(Boolean)

        async function listRecursive(dirPath: string): Promise<any[]> {
          const results: any[] = []
          try {
            const entries = await api!.listDirectory(dirPath)
            for (const entry of entries) {
              if (entry.isFile) {
                const ext = '.' + entry.name.split('.').pop()?.toLowerCase()
                const match = filters.length === 0 || filters.some(f => {
                  if (f.startsWith('*.')) return ext === f.slice(1)
                  return entry.name.includes(f)
                })
                if (match) results.push({ name: entry.name, path: entry.path, type: 'file' })
              } else if (entry.isDirectory && recursive) {
                const sub = await listRecursive(entry.path)
                results.push(...sub)
              }
            }
          } catch {}
          return results
        }

        const files = await listRecursive(folderPath)
        const folderName = folderPath.split(/[\\/]/).pop() || folderPath
        const fileList = files.map(f => f.name).join(', ')

        return {
          output: `已读取文件夹: ${folderName} (${files.length} 个文件)`,
          data: { folderPath, folderName, files, fileList, fileCount: files.length }
        }
      }

      case '读取字幕': {
        const allVideos = importedVideos.value.filter(v => v.subtitles.length > 0)
        if (allVideos.length === 0) throw new Error('没有可用的字幕数据，请先在「工作状态」中为视频进行语音识别')

        // 汇总所有视频的字幕
        const allSubs: Array<{ videoId: string; videoName: string; text: string; startTime: number; endTime: number }> = []
        for (const video of allVideos) {
          for (const seg of video.subtitles) {
            allSubs.push({
              videoId: video.id,
              videoName: video.name,
              text: seg.text,
              startTime: seg.startTime,
              endTime: seg.endTime
            })
          }
        }

        // 按视频名 + 时间排序
        allSubs.sort((a, b) => a.videoName.localeCompare(b.videoName) || a.startTime - b.startTime)

        const fullText = allSubs.map(s => `[${s.videoName}] ${s.text}`).join('\n')

        // 生成 SRT 格式（跨视频合并）
        const srtContent = allSubs.map((s, i) => {
          const sTime = formatTimeMs(s.startTime)
          const eTime = formatTimeMs(s.endTime)
          return `${i + 1}\n${sTime} --> ${eTime}\n[${s.videoName}] ${s.text}\n`
        }).join('\n')

        return {
          output: `已读取全部字幕: ${allVideos.length} 个视频, 共 ${allSubs.length} 条`,
          data: {
            videoCount: allVideos.length,
            subtitleCount: allSubs.length,
            content: fullText,
            srtContent,
            subtitles: allSubs
          }
        }
      }

      case '新建文档': {
        const docFileName = cfg.docFileName
        const docOutputPath = cfg.docOutputPath
        const docFileType = cfg.docFileType || 'txt'
        const docContent = cfg.docContent || ''

        if (!docFileName) throw new Error('未配置文件名')
        if (!docOutputPath) throw new Error('未配置输出目录')
        if (!api?.writeFile || !api?.createDirectory) throw new Error('文件系统 API 不可用')

        // 确保目录存在
        await api.createDirectory(docOutputPath)

        // 根据类型生成默认模板内容
        let content = docContent
        if (!content.trim()) {
          switch (docFileType) {
            case 'md':
              content = `# ${docFileName.replace(/\.\w+$/, '')}\n\n`
              break
            case 'json':
              content = '{\n  \n}\n'
              break
            case 'csv':
              content = '列1,列2,列3\n'
              break
            case 'srt':
              content = '1\n00:00:00,000 --> 00:00:02,000\n\n\n'
              break
            default:
              content = ''
          }
        }

        // 确保文件名有正确的扩展名
        const ext = `.${docFileType}`
        const finalName = docFileName.endsWith(ext) ? docFileName : docFileName + ext
        const fullPath = `${docOutputPath.replace(/\\/g, '/')}/${finalName}`

        await api.writeFile(fullPath, content)
        return {
          output: `文档已创建: ${finalName}`,
          data: { fileName: finalName, filePath: fullPath, content, fileType: docFileType }
        }
      }

      // ===== 处理节点 =====
      case 'AI文案生成': {
        const prompt = cfg.prompt
        if (!prompt) throw new Error('未配置 AI 提示词')
        // 收集上游内容作为上下文
        let context = ''
        for (const r of upstreamResults) {
          if (r.data?.content) context += `\n---\n${r.data.content}`
          else if (r.output) context += `\n${r.output}`
        }

        const fullPrompt = context
          ? `基于以下内容，${prompt}\n\n内容：\n${context}`
          : prompt

        // 动态导入 DeepSeek 服务
        const deepseek = await import('@/services/deepseek')

        // 获取模型配置
        const chatStore = (await import('@/stores/chat')).useChatStore()
        const modelKey = cfg.modelId || 'deepseek-default'
        let model: any = chatStore.models.find(m => m.id === modelKey)
        if (!model) {
          model = chatStore.currentModel
        }
        if (!model) {
          model = {
            id: 'deepseek-default',
            name: 'DeepSeek V4 Pro',
            provider: 'deepseek',
            apiUrl: 'https://api.deepseek.com/chat/completions',
            apiKey: '',
            supportDeepThinking: true,
            isDefault: true,
            modelParam: 'deepseek-v4-pro'
          }
        }

        // Agent 模式判断
        const agentCfg = getAgentConfig(node)
        if (agentCfg.mode === 'interactive' || agentCfg.mode === 'review') {
          // 使用 Agent 对话循环
          const result = await agentDialogueLoop(
            fullPrompt,
            { upstreamResults, env: {} },
            createReviewPause(node.id, node.label, agentCfg.maxTurns),
            async (promptText, _ctx) => {
              const response = await deepseek.sendChatMessage(model, [
                { id: 'temp', role: 'user', content: promptText, deepThinking: false, reasoningContent: '', timestamp: '', followUpTo: null, followUpIds: [], isFavorited: false, isStreaming: false }
              ])
              return response
            },
            agentCfg.maxTurns
          )
          if (result.status === 'error') throw new Error(result.error)
          return { output: result.output, data: { prompt: fullPrompt, aiResponse: result.output, agentTurns: result.turns } }
        }

        // 自动模式：直接生成
        const response = await deepseek.sendChatMessage(model, [
          { id: 'temp', role: 'user', content: fullPrompt, deepThinking: false, reasoningContent: '', timestamp: '', followUpTo: null, followUpIds: [], isFavorited: false, isStreaming: false }
        ])
        return { output: response, data: { prompt: fullPrompt, aiResponse: response } }
      }

      case '文本处理': {
        const operation = cfg.operation || 'replace'
        let outputText = ''
        // 从上游获取文本内容
        let inputText = ''
        for (const r of upstreamResults) {
          if (r.data?.content) inputText += r.data.content + '\n'
          else if (r.data?.aiResponse) inputText += r.data.aiResponse + '\n'
          else if (r.output) inputText += r.output + '\n'
        }
        if (!inputText.trim()) throw new Error('没有可处理的输入文本')

        switch (operation) {
          case 'replace': {
            const pattern = cfg.pattern || ''
            const replacement = cfg.replacement || ''
            if (!pattern) throw new Error('未配置替换模式')
            outputText = inputText.replace(new RegExp(pattern, 'g'), replacement)
            return {
              output: `文本替换完成 (匹配 ${pattern})`,
              data: { inputText, outputText, operation: 'replace' }
            }
          }
          case 'format': {
            outputText = inputText.trim().split('\n').filter(l => l.trim()).map(l => l.trim()).join('\n')
            return {
              output: '文本格式化完成',
              data: { inputText, outputText, operation: 'format' }
            }
          }
          case 'summarize': {
            // 简单截断摘要
            const lines = inputText.trim().split('\n').filter(l => l.trim())
            outputText = lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n...(已截断)' : '')
            return {
              output: `文本摘要完成 (${lines.length} 行 → ${Math.min(lines.length, 5)} 行)`,
              data: { inputText, outputText, operation: 'summarize' }
            }
          }
          default:
            throw new Error(`未知的文本操作: ${operation}`)
        }
      }

      case '格式转换': {
        const targetFormat = cfg.targetFormat || 'txt'
        let inputText = ''
        for (const r of upstreamResults) {
          if (r.data?.content) inputText += r.data.content + '\n'
          else if (r.data?.outputText) inputText += r.data.outputText + '\n'
          else if (r.data?.aiResponse) inputText += r.data.aiResponse + '\n'
          else if (r.output) inputText += r.output + '\n'
        }
        if (!inputText.trim()) throw new Error('没有可转换的输入内容')

        let outputText = ''
        switch (targetFormat) {
          case 'txt':
            outputText = inputText
            break
          case 'json':
            outputText = JSON.stringify({ content: inputText.trim(), timestamp: Date.now() }, null, 2)
            break
          case 'md':
            outputText = inputText.trim().split('\n').map(l => l.trim() ? `- ${l.trim()}` : '').join('\n')
            break
          case 'srt': {
            const lines = inputText.trim().split('\n').filter(l => l.trim())
            outputText = lines.map((l, i) => `${i + 1}\n00:00:${String(i).padStart(2, '0')},000 --> 00:00:${String(i + 1).padStart(2, '0')},000\n${l}\n`).join('\n')
            break
          }
          default:
            throw new Error(`不支持的格式: ${targetFormat}`)
        }
        return {
          output: `已转换为 ${targetFormat.toUpperCase()} 格式`,
          data: { inputText, outputText, targetFormat }
        }
      }

      // ===== 输出节点 =====
      case '保存文件': {
        const outputPath = cfg.outputPath
        const fileName = cfg.fileName || 'output.txt'
        if (!outputPath) throw new Error('未配置输出路径')
        // 收集上游内容
        let content = ''
        for (const r of upstreamResults) {
          if (r.data?.outputText) content += r.data.outputText
          else if (r.data?.aiResponse) content += r.data.aiResponse
          else if (r.data?.content) content += r.data.content
          else if (r.output) content += r.output
        }
        if (!content.trim()) throw new Error('没有可保存的内容')

        const fullPath = `${outputPath.replace(/\\/g, '/')}/${fileName}`
        if (!api?.writeFile) throw new Error('文件系统 API 不可用')
        await api.writeFile(fullPath, content)
        return {
          output: `文件已保存: ${fullPath}`,
          data: { savedPath: fullPath, content }
        }
      }

      case '导出剪映': {
        const projectName = cfg.projectName || '草稿项目'
        const draftPath = cfg.draftPath
        // 从上游收集字幕和视频信息
        let subtitleText = ''
        let videoFiles: string[] = []
        for (const r of upstreamResults) {
          if (r.data?.content || r.data?.outputText || r.data?.aiResponse) {
            subtitleText += (r.data?.outputText || r.data?.aiResponse || r.data?.content || '') + '\n'
          }
          if (r.data?.filePath) videoFiles.push(r.data.filePath)
        }

        const { exportJianyingProject, buildProject } = await import('@/services/jianying')

        const subtitleLines = subtitleText.trim().split('\n').filter(l => l.trim())
        const clips = videoFiles.map((f, i) => ({
          sourceFile: f,
          sourceFileName: f.split(/[\\/]/).pop() || `video_${i}`,
          startMs: 0,
          endMs: 10000,
          width: 1080,
          height: 1920
        }))
        const subtitles = subtitleLines.map((text, i) => ({
          text,
          startMs: i * 2000,
          endMs: (i + 1) * 2000
        }))

        const project = buildProject(clips, subtitles, projectName)
        const result = await exportJianyingProject(project, draftPath)
        if (!result.success) throw new Error(result.error || '导出失败')
        return {
          output: `剪映工程已导出: ${result.draftDir}`,
          data: { draftDir: result.draftDir, projectName }
        }
      }

      default:
        throw new Error(`未知的节点类型: ${node.label}`)
    }
  }

  function stopWorkflow() {
    isWorkflowRunning.value = false
    // 取消所有正在等待 Agent 审核的节点
    for (const node of workflowNodes.value) {
      if (node.config.result?.status === 'running') {
        cancelAgentReview(node.id)
        setNodeResult(node.id, 'error', '', '工作流已被用户中止')
      }
    }
    addWorkflowLog('工作流已被用户中止')
    eventBus.emit('creator:workflow:executionStopped', {})
  }

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
    addEdge, removeEdge, removeEdgesForNode, selectNode,
    edgeExists, updateNodeConfig, setNodeResult, resetAllNodeResults,
    getTopologicalOrder, getUpstreamResults,
    isWorkflowRunning, workflowLogs,
    executeWorkflow, executeNode, stopWorkflow,
    // Agent 功能
    retryNode, resumeWorkflow, executeNodeCore,
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
