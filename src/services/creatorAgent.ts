/**
 * Creator Mode Agent 编排服务
 *
 * 将工作流节点升级为「Agent 节点」：
 * 1. 支持多轮对话循环（生成 → 审核 → 修改 → 再审核）
 * 2. 支持检查点与回滚（断点续传）
 * 3. 支持人机交互中断（用户确认关键步骤）
 * 4. 支持节点级重试与错误恢复
 */

import { eventBus } from '@/services/eventBus'
import type { WorkflowNode, NodeConfig, NodeExecResult } from '@/stores/creatorMode'
import type {} from '@/types/creatorEvents'

// ===== 类型定义 =====

/** Agent 运行模式 */
export type AgentMode = 'automatic' | 'interactive' | 'review'

/** Agent 节点执行上下文 */
export interface AgentContext {
  /** 上游节点的输出（按拓扑顺序） */
  upstreamResults: NodeExecResult[]
  /** 全局环境变量（可跨节点共享） */
  env: Record<string, any>
  /** 检查点数据 */
  checkpoint?: AgentCheckpoint
}

/** Agent 检查点 */
export interface AgentCheckpoint {
  /** 检查点 ID */
  id: string
  /** 已完成节点 ID 列表 */
  completedNodeIds: string[]
  /** 当前执行到第几个节点 */
  currentIndex: number
  /** 全局环境快照 */
  envSnapshot: Record<string, any>
  /** 创建时间 */
  createdAt: number
}

/** Agent 节点执行结果（扩展版） */
export interface AgentNodeResult {
  /** 执行状态 */
  status: 'success' | 'error' | 'paused' | 'skipped'
  /** 最终输出 */
  output: string
  /** 结构化数据 */
  data?: any
  /** 错误信息 */
  error?: string
  /** 是否需要用户确认 */
  needsConfirmation?: boolean
  /** Agent 对话轮次记录 */
  turns?: AgentTurn[]
}

/** Agent 对话轮次 */
export interface AgentTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp: number
}

/** Agent 配置（附加到 NodeConfig） */
export interface AgentConfig {
  /** 运行模式 */
  mode: AgentMode
  /** 最大重试次数 */
  maxRetries: number
  /** 是否启用检查点 */
  enableCheckpoint: boolean
  /** 完成后是否需要用户确认 */
  requireConfirmation: boolean
  /** 最大 AI 对话轮次（interactive 模式下） */
  maxTurns: number
}

// ===== Agent 服务 =====

/** 获取节点的 Agent 配置（合并默认值） */
export function getAgentConfig(node: WorkflowNode): AgentConfig {
  const cfg = (node.config as any)?.agent || {}
  return {
    mode: cfg.mode || 'automatic',
    maxRetries: cfg.maxRetries ?? 2,
    enableCheckpoint: cfg.enableCheckpoint ?? true,
    requireConfirmation: cfg.requireConfirmation ?? false,
    maxTurns: cfg.maxTurns ?? 5
  }
}

/** 设置节点的 Agent 配置 */
export function setAgentConfig(node: WorkflowNode, config: Partial<AgentConfig>): void {
  const current = getAgentConfig(node)
  ;(node.config as any).agent = { ...current, ...config }
}

// ===== 检查点管理 =====

const CHECKPOINT_KEY = 'creator-agent-checkpoint'

/** 待处理审核的存储 */
const pendingReviews = new Map<string, {
  resolve: (feedback: string | null) => void
  output: string
  turn: number
}>()

/**
 * 创建审核等待函数（用于 agentDialogueLoop 的 reviewFn）
 * 返回一个 Promise，当用户提交审核反馈时 resolve。
 */
export function createReviewPause(
  nodeId: string,
  nodeLabel: string,
  maxTurns: number
): (output: string, turn: number) => Promise<string | null> {
  return async (output: string, turn: number) => {
    return new Promise((resolve) => {
      pendingReviews.set(nodeId, { resolve, output, turn })
      eventBus.emit('creator:workflow:agentReviewRequested', {
        nodeId, nodeLabel, output, turn, maxTurns
      })
    })
  }
}

/**
 * 提交 Agent 审核反馈
 * @param nodeId 节点 ID
 * @param approved 是否通过审核
 * @param feedback 反馈/修改意见（approved=false 时必填）
 */
export function submitAgentReview(nodeId: string, approved: boolean, feedback?: string): void {
  const pending = pendingReviews.get(nodeId)
  if (!pending) return
  pendingReviews.delete(nodeId)
  if (approved) {
    pending.resolve(null) // null 表示通过
  } else {
    pending.resolve(feedback || '请修改') // 返回反馈文本
  }
  eventBus.emit('creator:workflow:agentReviewSubmitted', { nodeId, approved, feedback })
}

/** 清除指定节点的待处理审核 */
export function cancelAgentReview(nodeId: string): void {
  const pending = pendingReviews.get(nodeId)
  if (pending) {
    pending.resolve(null) // 取消 = 通过
    pendingReviews.delete(nodeId)
  }
}

/** 是否有待处理的审核 */
export function hasPendingReview(nodeId: string): boolean {
  return pendingReviews.has(nodeId)
}

/** 保存检查点 */
export function saveCheckpoint(checkpoint: AgentCheckpoint): void {
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint))
    eventBus.emit('creator:workflow:nodeExecutionCompleted', {
      nodeId: 'checkpoint',
      label: '检查点已保存',
      result: {
        status: 'success',
        output: `节点 ${checkpoint.currentIndex + 1}/${checkpoint.completedNodeIds.length} 个已完成`,
        data: checkpoint
      }
    })
  } catch {}
}

/** 加载最近检查点 */
export function loadCheckpoint(): AgentCheckpoint | null {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** 删除检查点 */
export function clearCheckpoint(): void {
  localStorage.removeItem(CHECKPOINT_KEY)
}

// ===== Agent 执行引擎 =====

/**
 * Agent 执行单个节点
 *
 * 与普通 executeNode 的区别：
 * - 支持重试机制
 * - 支持 interactive 模式下的用户中断
 * - 自动记录对话轮次
 */
export async function executeAgentNode(
  node: WorkflowNode,
  context: AgentContext,
  executeFn: (node: WorkflowNode, upstream: NodeExecResult[]) => Promise<{ output: string; data?: any }>
): Promise<AgentNodeResult> {
  const agentConfig = getAgentConfig(node)
  const turns: AgentTurn[] = []
  let lastError: Error | null = null

  // 重试循环
  for (let attempt = 0; attempt <= agentConfig.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // 重试延迟
        await new Promise(r => setTimeout(r, 500 * attempt))
        turns.push({
          role: 'system',
          content: `🔄 第 ${attempt + 1} 次尝试...`,
          timestamp: Date.now()
        })
      }

      // 执行节点
      const result = await executeFn(node, context.upstreamResults)
      turns.push({
        role: 'assistant',
        content: result.output,
        timestamp: Date.now()
      })

      return {
        status: 'success',
        output: result.output,
        data: result.data,
        turns
      }
    } catch (e: any) {
      lastError = e
      turns.push({
        role: 'system',
        content: `❌ 第 ${attempt + 1} 次尝试失败: ${e.message || String(e)}`,
        timestamp: Date.now()
      })

      if (attempt < agentConfig.maxRetries) {
        console.warn(`[Agent] 节点「${node.label}」第 ${attempt + 1} 次失败，${agentConfig.maxRetries - attempt} 次重试剩余`)
      }
    }
  }

  return {
    status: 'error',
    output: '',
    error: lastError?.message || '未知错误',
    turns
  }
}

/**
 * Agent 对话循环（用于 AI 生成类节点）
 *
 * 模式：AI 生成 → 展示给用户 → 用户反馈 → AI 修改 → ...
 * 适用于「AI文案生成」节点需要用户审核的场景
 *
 * @param initialPrompt 初始提示词
 * @param context 上游上下文
 * @param reviewFn 用户审核回调（返回修改意见，返回 null 表示通过）
 * @param generateFn AI 生成回调
 * @param maxTurns 最大对话轮次
 */
export async function agentDialogueLoop(
  initialPrompt: string,
  context: AgentContext,
  reviewFn: (output: string, turn: number) => Promise<string | null>,
  generateFn: (prompt: string, context: AgentContext) => Promise<string>,
  maxTurns: number = 3
): Promise<AgentNodeResult> {
  const turns: AgentTurn[] = []
  let currentPrompt = initialPrompt
  let finalOutput = ''

  for (let turn = 0; turn < maxTurns; turn++) {
    turns.push({
      role: 'user',
      content: currentPrompt,
      timestamp: Date.now()
    })

    // AI 生成
    const output = await generateFn(currentPrompt, context)
    finalOutput = output
    turns.push({
      role: 'assistant',
      content: output,
      timestamp: Date.now()
    })

    // 用户审核
    const feedback = await reviewFn(output, turn + 1)
    if (feedback === null) {
      // 审核通过
      return {
        status: 'success',
        output: finalOutput,
        data: { turns, approvedAt: turn + 1 },
        turns
      }
    }

    // 根据反馈修改
    currentPrompt = `根据以下反馈修改你的输出：\n${feedback}\n\n原始输出：\n${output}`
    turns.push({
      role: 'system',
      content: `📝 用户反馈: ${feedback}`,
      timestamp: Date.now()
    })
  }

  return {
    status: 'success',
    output: finalOutput,
    data: { turns, approvedAt: -1, warning: `已达到最大 ${maxTurns} 轮，请手动确认` },
    turns
  }
}

/**
 * 判断节点是否支持 Agent 模式
 */
export function supportsAgentMode(node: WorkflowNode): boolean {
  // AI 生成节点和文本处理节点支持 Agent 模式
  const agentCapable = ['AI文案生成', '文本处理', '格式转换']
  return agentCapable.includes(node.label)
}
