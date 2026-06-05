import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'

/** 视频片段 */
export interface VideoClip {
  id: string
  sourceFile: string
  sourceFileName: string
  startTime: number    // 秒
  endTime: number      // 秒
  duration: number     // 秒
  label: string
  thumbnail?: string
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

const CLIPS_KEY = 'creator-clips'
const TIMELINE_KEY = 'creator-timeline'
const WORKFLOW_KEY = 'creator-workflow'

export const useCreatorModeStore = defineStore('creatorMode', () => {
  // ===== 子模式 =====
  const subMode = ref<CreatorSubMode>('work-state')

  function switchSubMode(mode: CreatorSubMode) {
    subMode.value = mode
  }

  // ===== 视频剪切 =====
  const importedVideo = ref<{ path: string; name: string } | null>(null)
  const videoDuration = ref(0)
  const currentTime = ref(0)
  const isPlaying = ref(false)

  const clips = ref<VideoClip[]>(loadClips())
  const timeline = ref<TimelineTrack>(loadTimeline())

  function loadClips(): VideoClip[] {
    try {
      const data = localStorage.getItem(CLIPS_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function saveClips() {
    localStorage.setItem(CLIPS_KEY, JSON.stringify(clips.value))
  }

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

  function setVideo(path: string, name: string) {
    importedVideo.value = { path, name }
  }

  function setVideoDuration(d: number) {
    videoDuration.value = d
  }

  function setCurrentTime(t: number) {
    currentTime.value = t
  }

  function setIsPlaying(p: boolean) {
    isPlaying.value = p
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  /** 添加片段 */
  function addClip(startTime: number, endTime: number, label?: string): VideoClip {
    const clip: VideoClip = {
      id: 'clip_' + Date.now(),
      sourceFile: importedVideo.value?.path || '',
      sourceFileName: importedVideo.value?.name || '',
      startTime,
      endTime,
      duration: endTime - startTime,
      label: label || `片段 ${formatTime(startTime)}-${formatTime(endTime)}`
    }
    clips.value.push(clip)
    saveClips()
    return clip
  }

  /** 删除片段 */
  function removeClip(clipId: string) {
    clips.value = clips.value.filter(c => c.id !== clipId)
    timeline.value.clips = timeline.value.clips.filter(id => id !== clipId)
    saveClips()
    saveTimeline()
  }

  /** 添加片段到轨道 */
  function addToTimeline(clipId: string) {
    if (!timeline.value.clips.includes(clipId)) {
      timeline.value.clips.push(clipId)
      saveTimeline()
    }
  }

  /** 从轨道移除片段 */
  function removeFromTimeline(clipId: string) {
    timeline.value.clips = timeline.value.clips.filter(id => id !== clipId)
    saveTimeline()
  }

  /** 轨道片段排序 */
  function reorderTimeline(fromIndex: number, toIndex: number) {
    const clips = timeline.value.clips
    const [moved] = clips.splice(fromIndex, 1)
    clips.splice(toIndex, 0, moved)
    saveTimeline()
  }

  /** 获取轨道片段详情 */
  function getTimelineClips(): VideoClip[] {
    return timeline.value.clips
      .map(id => clips.value.find(c => c.id === id))
      .filter((c): c is VideoClip => !!c)
  }

  // ===== 工作流 =====
  const isWorkflowMode = ref(false)
  const workflowNodes = ref<WorkflowNode[]>(loadWorkflowNodes())
  const workflowEdges = ref<WorkflowEdge[]>(loadWorkflowEdges())
  const selectedNodeId = ref<string | null>(null)

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
    const node: WorkflowNode = {
      id: 'node_' + Date.now(),
      type,
      label,
      x,
      y,
      config: {}
    }
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
    if (node) {
      node.x = x
      node.y = y
      saveWorkflow()
    }
  }

  function addEdge(fromNodeId: string, toNodeId: string, label = ''): WorkflowEdge {
    const edge: WorkflowEdge = {
      id: 'edge_' + Date.now(),
      fromNodeId,
      toNodeId,
      label
    }
    workflowEdges.value.push(edge)
    saveWorkflow()
    return edge
  }

  function removeEdge(edgeId: string) {
    workflowEdges.value = workflowEdges.value.filter(e => e.id !== edgeId)
    saveWorkflow()
  }

  function selectNode(nodeId: string | null) {
    selectedNodeId.value = nodeId
  }

  /** 工作流画布偏移 */
  const canvasOffset = reactive({ x: 0, y: 0 })
  const canvasScale = ref(1)

  function setCanvasOffset(x: number, y: number) {
    canvasOffset.x = x
    canvasOffset.y = y
  }

  function setCanvasScale(s: number) {
    canvasScale.value = Math.max(0.3, Math.min(3, s))
  }

  return {
    // 子模式
    subMode,
    switchSubMode,

    // 视频剪切
    importedVideo,
    videoDuration,
    currentTime,
    isPlaying,
    clips,
    timeline,
    setVideo,
    setVideoDuration,
    setCurrentTime,
    setIsPlaying,
    formatTime,
    addClip,
    removeClip,
    addToTimeline,
    removeFromTimeline,
    reorderTimeline,
    getTimelineClips,

    // 工作流
    isWorkflowMode,
    workflowNodes,
    workflowEdges,
    selectedNodeId,
    addNode,
    removeNode,
    updateNodePosition,
    addEdge,
    removeEdge,
    selectNode,
    canvasOffset,
    canvasScale,
    setCanvasOffset,
    setCanvasScale
  }
})
