/**
 * Creator Mode 事件类型定义
 *
 * 通过 TypeScript 的 declaration merging 扩展 EventMap 接口。
 * 导入此文件即可自动注册所有 Creator Mode 事件的类型。
 */

import type { EventMap } from '@/services/eventBus'
import type { ImportedVideo, VideoClip, WorkflowNode, WorkflowEdge, NodeExecResult } from '@/stores/creatorMode'

declare module '@/services/eventBus' {
  interface EventMap {
    // ===== 视频管理事件 =====
    /** 视频已导入 */
    'creator:video:imported': { videoId: string; videoName: string; videoPath: string }
    /** 视频已移除 */
    'creator:video:removed': { videoId: string; videoName: string }
    /** 当前活跃视频切换 */
    'creator:video:activated': { videoId: string | null; videoName: string | null }
    /** 视频元数据加载完成（分辨率、时长） */
    'creator:video:metaLoaded': { videoId: string; duration: number; width: number; height: number; ratio: string }

    // ===== ASR 事件 =====
    /** ASR 开始处理 */
    'creator:asr:started': { videoId: string; videoName: string }
    /** ASR 处理进度（预留） */
    'creator:asr:progress': { videoId: string; progress: number }
    /** ASR 处理完成 */
    'creator:asr:completed': { videoId: string; subtitleCount: number }
    /** ASR 处理失败 */
    'creator:asr:error': { videoId: string; error: string }

    // ===== 片段管理事件 =====
    /** 片段已创建 */
    'creator:clip:created': { clipId: string; startTime: number; endTime: number; label: string }
    /** 片段已更新（时间变更） */
    'creator:clip:updated': { clipId: string; startTime: number; endTime: number }
    /** 片段已删除 */
    'creator:clip:removed': { clipId: string }

    // ===== 轨道事件 =====
    /** 片段已加入时间轨道 */
    'creator:track:clipAdded': { clipId: string }
    /** 片段已从时间轨道移除 */
    'creator:track:clipRemoved': { clipId: string }
    /** 时间轨道重排 */
    'creator:track:reordered': { fromIndex: number; toIndex: number }

    // ===== 工作流事件 =====
    /** 节点已添加 */
    'creator:workflow:nodeAdded': { nodeId: string; type: string; label: string }
    /** 节点已删除 */
    'creator:workflow:nodeRemoved': { nodeId: string; label: string }
    /** 节点位置更新 */
    'creator:workflow:nodeMoved': { nodeId: string; x: number; y: number }
    /** 节点配置更新 */
    'creator:workflow:nodeConfigured': { nodeId: string; label: string }
    /** 连线已添加 */
    'creator:workflow:edgeAdded': { edgeId: string; fromNodeId: string; toNodeId: string }
    /** 连线已移除 */
    'creator:workflow:edgeRemoved': { edgeId: string }
    /** 工作流开始执行 */
    'creator:workflow:executionStarted': { totalNodes: number }
    /** 工作流执行完毕 */
    'creator:workflow:executionCompleted': { successCount: number; errorCount: number }
    /** 工作流执行中止 */
    'creator:workflow:executionStopped': {}
    /** 单个节点开始执行 */
    'creator:workflow:nodeExecutionStarted': { nodeId: string; label: string }
    /** 单个节点执行完成 */
    'creator:workflow:nodeExecutionCompleted': { nodeId: string; label: string; result: NodeExecResult }
    /** 节点已选中 */
    'creator:workflow:nodeSelected': { nodeId: string | null }

    // ===== Agent 交互事件 =====
    /** Agent 需要用户审核/反馈 */
    'creator:workflow:agentReviewRequested': { nodeId: string; nodeLabel: string; output: string; turn: number; maxTurns: number }
    /** 用户提交审核反馈 */
    'creator:workflow:agentReviewSubmitted': { nodeId: string; approved: boolean; feedback?: string }

    // ===== 搜索事件 =====
    /** 搜索词变更 */
    'creator:search:changed': { query: string }

    // ===== 导出事件 =====
    /** 开始导出剪映工程 */
    'creator:export:started': { projectName: string }
    /** 导出进度 */
    'creator:export:progress': { message: string }
    /** 导出完成 */
    'creator:export:completed': { projectName: string; draftDir: string }
    /** 导出失败 */
    'creator:export:error': { error: string }

    // ===== UI 事件 =====
    /** 子模式切换 */
    'creator:ui:subModeChanged': { mode: 'work-state' | 'workflow' }
    /** 面板尺寸变更 */
    'creator:ui:panelResized': { panel: 'sidebar' | 'rightPanel' | 'timeline'; width: number }
  }
}

export {}
