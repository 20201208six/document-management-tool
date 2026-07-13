/**
 * dataGraphStore - 数据连接画布的状态管理
 *
 * 核心概念：
 * - 节点（GraphNode）：代表文件/文稿/对话/项目等数据实体
 * - 连线（GraphEdge）：用户手动建立的关联关系
 * - AI 上下文注入：读取与当前节点相连的所有节点数据，自动注入 Prompt
 *
 * 设计原则：
 * - 默认全部隔离，只有用户连了线才互通
 * - 连线是双向的（无向图）
 * - 持久化到 localStorage
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type GraphNodeType = 'basic' | 'creator' | 'canvas' | 'unique'

/** 节点类型映射的展示信息 */
export const NODE_TYPE_META: Record<GraphNodeType, { icon: string; label: string; color: string }> = {
  basic:    { icon: '📋', label: '基础模式', color: '#409eff' },
  creator:  { icon: '🎬', label: '创作者模式', color: '#67c23a' },
  canvas:   { icon: '🕸️', label: '画布模式', color: '#e6a23c' },
  unique:   { icon: '📊', label: '独特模式', color: '#1a4cff' },
}

export interface GraphNode {
  id: string
  type: GraphNodeType
  /** 显示标签 */
  label: string
  /** 指向原始数据的 ID */
  sourceId: string
  /** 悬停预览 */
  preview: string
  /** 画布坐标（未布局时为 undefined） */
  x?: number
  y?: number
}

export interface GraphEdge {
  id: string
  source: string  // 节点 ID
  target: string  // 节点 ID
  createdAt: string
}

const STORAGE_KEY = 'copywriting-data-graph'

export const useDataGraphStore = defineStore('dataGraph', () => {
  const nodes = ref<GraphNode[]>(loadNodes())
  const edges = ref<GraphEdge[]>(loadEdges())

  function loadNodes(): GraphNode[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY + '-nodes')
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function loadEdges(): GraphEdge[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY + '-edges')
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY + '-nodes', JSON.stringify(nodes.value))
    localStorage.setItem(STORAGE_KEY + '-edges', JSON.stringify(edges.value))
  }

  // ===== 节点操作 =====

  /** 注册节点（已存在则更新） */
  function upsertNode(node: Omit<GraphNode, 'id'> & { id?: string }) {
    const existing = nodes.value.find(n =>
      n.type === node.type && n.sourceId === node.sourceId
    )
    if (existing) {
      Object.assign(existing, { label: node.label, preview: node.preview })
    } else {
      nodes.value.push({
        id: node.id || `${node.type}_${node.sourceId}`,
        ...node
      })
    }
    save()
  }

  /** 移除节点（及其所有连线） */
  function removeNode(nodeId: string) {
    nodes.value = nodes.value.filter(n => n.id !== nodeId)
    edges.value = edges.value.filter(e => e.source !== nodeId && e.target !== nodeId)
    save()
  }

  /** 更新节点坐标 */
  function updateNodePosition(nodeId: string, x: number, y: number) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (node) {
      node.x = x
      node.y = y
      save()
    }
  }

  /** 获取节点 */
  function getNode(nodeId: string): GraphNode | undefined {
    return nodes.value.find(n => n.id === nodeId)
  }

  // ===== 连线操作 =====

  /** 创建连线（无向边） */
  function connectNodes(sourceId: string, targetId: string) {
    const exists = edges.value.find(e =>
      (e.source === sourceId && e.target === targetId) ||
      (e.source === targetId && e.target === sourceId)
    )
    if (exists) return

    edges.value.push({
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source: sourceId,
      target: targetId,
      createdAt: new Date().toISOString()
    })
    save()
  }

  /** 断开连线 */
  function disconnectNodes(edgeId: string) {
    edges.value = edges.value.filter(e => e.id !== edgeId)
    save()
  }

  /** 获取与某节点相连的所有边 */
  function getEdgesForNode(nodeId: string): GraphEdge[] {
    return edges.value.filter(e => e.source === nodeId || e.target === nodeId)
  }

  /** 获取与某节点相连的所有邻居节点 */
  function getNeighbors(nodeId: string): GraphNode[] {
    const edgeSet = getEdgesForNode(nodeId)
    const neighborIds = new Set<string>()
    for (const e of edgeSet) {
      if (e.source !== nodeId) neighborIds.add(e.source)
      if (e.target !== nodeId) neighborIds.add(e.target)
    }
    return nodes.value.filter(n => neighborIds.has(n.id))
  }

  /** 两个节点是否已连接 */
  function areConnected(nodeA: string, nodeB: string): boolean {
    return edges.value.some(e =>
      (e.source === nodeA && e.target === nodeB) ||
      (e.source === nodeB && e.target === nodeA)
    )
  }

  // ===== 查询 =====

  /** 按类型获取节点 */
  function getNodesByType(type: GraphNodeType): GraphNode[] {
    return nodes.value.filter(n => n.type === type)
  }

  /** 清空画布 */
  function clearAll() {
    nodes.value = []
    edges.value = []
    save()
  }

  return {
    nodes, edges,
    upsertNode, removeNode, updateNodePosition, getNode,
    connectNodes, disconnectNodes, getEdgesForNode, getNeighbors, areConnected,
    getNodesByType, clearAll
  }
})
