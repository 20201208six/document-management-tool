/**
 * 向量语义搜索 —— 基于文本嵌入向量进行语义级别的字幕与片段检索
 *
 * 设计原则：
 * 1. 批量嵌入：对字幕批量计算向量，避免逐条 API 调用
 * 2. 增量更新：新视频导入时自动计算嵌入，已有视频复用缓存
 * 3. 本地缓存：将嵌入向量持久化到 localStorage，跨会话复用
 * 4. 混合检索：语义搜索 + 关键词搜索，结果加权排序
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { computeEmbedding, cosineSimilarity } from '@/services/deepseek'
import type { AIModel } from '@/types/chat'

// ===== 类型定义 =====

/** 嵌入向量条目 */
export interface VectorEntry {
  id: string
  videoId: string
  videoName: string
  /** 原始文本（字幕内容或片段标签） */
  text: string
  /** 嵌入向量（归一化后的浮点数组） */
  embedding: number[]
  /** 来源类型 */
  sourceType: 'subtitle' | 'clip'
  /** 字幕原始时间（仅 subtitle 来源） */
  startTime?: number
  endTime?: number
  /** 片段 ID（仅 clip 来源） */
  clipId?: string
  /** 索引编号（在来源列表中的位置） */
  sourceIndex: number
}

/** 语义搜索结果 */
export interface SemanticSearchResult {
  entry: VectorEntry
  similarity: number
  /** 混合分数：语义相似度 + 关键词匹配加成 */
  hybridScore: number
}

/** 批量嵌入进度 */
export interface EmbeddingProgress {
  total: number
  completed: number
  failed: number
  status: 'idle' | 'running' | 'completed' | 'error'
}

// ===== 本地存储 Key =====
const EMBEDDINGS_KEY = 'creator-embeddings-v1'

export const useVectorIndexStore = defineStore('vectorIndex', () => {
  // ===== 状态 =====
  const entries = ref<VectorEntry[]>([])
  const isBuilding = ref(false)
  const progress = ref<EmbeddingProgress>({ total: 0, completed: 0, failed: 0, status: 'idle' })
  const lastSearchQuery = ref('')
  const lastSearchResults = ref<SemanticSearchResult[]>([])

  // ===== 嵌入缓存（跨会话持久化） =====
  const embeddingCache = ref<Map<string, number[]>>(loadCache())

  function loadCache(): Map<string, number[]> {
    try {
      const raw = localStorage.getItem(EMBEDDINGS_KEY)
      if (raw) {
        const arr = JSON.parse(raw) as Array<{ key: string; vec: number[] }>
        return new Map(arr.map(item => [item.key, item.vec]))
      }
    } catch {}
    return new Map()
  }

  function saveCache() {
    try {
      const arr = Array.from(embeddingCache.value.entries()).map(([key, vec]) => ({
        key,
        vec: vec.slice(0, 128) // 压缩存储：只保留前 128 维（可调）
      }))
      localStorage.setItem(EMBEDDINGS_KEY, JSON.stringify(arr))
    } catch {}
  }

  /** 为文本生成缓存键 */
  function cacheKey(videoId: string, text: string, sourceIndex: number): string {
    // 取视频 ID + 文本前 80 字 + 索引号作为唯一标识
    const snippet = text.slice(0, 80).replace(/\s+/g, '')
    return `${videoId}::${sourceIndex}::${snippet}`
  }

  // ===== 构建向量索引 =====

  /**
   * 从视频字幕构建向量索引
   * @param subtitles 字幕列表 { videoId, videoName, text, startTime, endTime }[]
   * @param model AI 模型配置（用于获取 API Key）
   */
  async function buildFromSubtitles(
    subtitles: Array<{
      videoId: string
      videoName: string
      text: string
      startTime: number
      endTime: number
    }>,
    model?: Pick<AIModel, 'apiUrl' | 'apiKey'>
  ): Promise<void> {
    if (subtitles.length === 0) return

    // 过滤掉已有缓存的条目
    const needsEmbedding: Array<{
      index: number
      key: string
      text: string
    }> = []
    const newEntries: VectorEntry[] = []

    subtitles.forEach((sub, i) => {
      const key = cacheKey(sub.videoId, sub.text, i)
      const cached = embeddingCache.value.get(key)
      const entry: VectorEntry = {
        id: `vec_${sub.videoId}_${i}`,
        videoId: sub.videoId,
        videoName: sub.videoName,
        text: sub.text,
        embedding: cached || [],
        sourceType: 'subtitle',
        startTime: sub.startTime,
        endTime: sub.endTime,
        sourceIndex: i
      }
      newEntries.push(entry)

      if (!cached) {
        needsEmbedding.push({ index: i, key, text: sub.text })
      }
    })

    // 如果所有条目都有缓存，直接使用
    if (needsEmbedding.length === 0) {
      entries.value = newEntries
      return
    }

    // 分批计算嵌入
    isBuilding.value = true
    progress.value = {
      total: needsEmbedding.length,
      completed: 0,
      failed: 0,
      status: 'running'
    }

    // 获取 API 配置
    const chatStore = await import('@/stores/chat').then(m => m.useChatStore())
    const apiModel = model || (chatStore.currentModel || chatStore.models.find(m => m.isDefault))
    if (!apiModel?.apiKey) {
      // 没有 API Key，回退到无嵌入模式（仅关键词搜索）
      console.warn('[向量索引] 未配置 API Key，跳过嵌入计算，仅支持关键词搜索')
      entries.value = newEntries
      isBuilding.value = false
      progress.value.status = 'completed'
      return
    }

    const BATCH_SIZE = 3 // 每批同时计算的嵌入数
    for (let batchStart = 0; batchStart < needsEmbedding.length; batchStart += BATCH_SIZE) {
      const batch = needsEmbedding.slice(batchStart, batchStart + BATCH_SIZE)

      // 并行计算本批次
      const results = await Promise.allSettled(
        batch.map(async ({ index, key, text }) => {
          const vec = await computeEmbedding(text, apiModel, 'text-embedding-3-small')
          if (vec) {
            embeddingCache.value.set(key, vec)
            newEntries[index].embedding = vec
            return { index, success: true }
          }
          return { index, success: false }
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.success) progress.value.completed++
          else progress.value.failed++
        } else {
          progress.value.failed++
        }
      }

      // 短暂间隔避免 API 限流
      if (batchStart + BATCH_SIZE < needsEmbedding.length) {
        await new Promise(r => setTimeout(r, 100))
      }
    }

    entries.value = newEntries
    saveCache()
    isBuilding.value = false
    progress.value.status = 'completed'
  }

  /**
   * 从片段构建向量索引（追加到现有索引）
   */
  async function buildFromClips(
    clips: Array<{
      clipId: string
      videoId: string
      videoName: string
      text: string
      startTime: number
      endTime: number
    }>,
    model?: Pick<AIModel, 'apiUrl' | 'apiKey'>
  ): Promise<void> {
    if (clips.length === 0) return

    const chatStore = await import('@/stores/chat').then(m => m.useChatStore())
    const apiModel = model || (chatStore.currentModel || chatStore.models.find(m => m.isDefault))
    if (!apiModel?.apiKey) return

    const newEntries: VectorEntry[] = []
    const needsEmbedding: Array<{ entry: VectorEntry; key: string }> = []

    clips.forEach((clip, i) => {
      const key = cacheKey(clip.videoId, clip.text, i)
      const cached = embeddingCache.value.get(key)
      const entry: VectorEntry = {
        id: `clip_${clip.clipId}`,
        videoId: clip.videoId,
        videoName: clip.videoName,
        text: clip.text,
        embedding: cached || [],
        sourceType: 'clip',
        startTime: clip.startTime,
        endTime: clip.endTime,
        clipId: clip.clipId,
        sourceIndex: i
      }
      newEntries.push(entry)

      if (!cached && clip.text.trim()) {
        needsEmbedding.push({ entry, key })
      }
    })

    // 批量计算嵌入
    const BATCH_SIZE = 3
    for (let batchStart = 0; batchStart < needsEmbedding.length; batchStart += BATCH_SIZE) {
      const batch = needsEmbedding.slice(batchStart, batchStart + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async ({ entry, key }) => {
          const vec = await computeEmbedding(entry.text, apiModel, 'text-embedding-3-small')
          if (vec) {
            embeddingCache.value.set(key, vec)
            entry.embedding = vec
          }
        })
      )
      // 短暂间隔
      if (batchStart + BATCH_SIZE < needsEmbedding.length) {
        await new Promise(r => setTimeout(r, 100))
      }
    }

    entries.value.push(...newEntries)
    saveCache()
  }

  // ===== 语义搜索 =====

  /**
   * 混合检索：语义相似度 + 关键词匹配
   * @param query 搜索词
   * @param topK 返回前 K 条
   * @param model AI 模型配置
   */
  async function semanticSearch(
    query: string,
    topK = 10,
    model?: Pick<AIModel, 'apiUrl' | 'apiKey'>
  ): Promise<SemanticSearchResult[]> {
    const q = query.trim()
    if (!q) {
      lastSearchResults.value = []
      return []
    }

    lastSearchQuery.value = q

    // 如果没有向量条目，返回空
    if (entries.value.length === 0) {
      lastSearchResults.value = []
      return []
    }

    // 检查是否有可用的嵌入条目
    const hasEmbeddings = entries.value.some(e => e.embedding.length > 0)
    if (!hasEmbeddings) {
      // 纯关键词搜索回退
      const results = keywordOnlySearch(q, topK)
      lastSearchResults.value = results
      return results
    }

    // 获取 query 的嵌入向量
    const chatStore = await import('@/stores/chat').then(m => m.useChatStore())
    const apiModel = model || (chatStore.currentModel || chatStore.models.find(m => m.isDefault))
    let queryEmbedding: number[] | null = null

    if (apiModel?.apiKey) {
      queryEmbedding = await computeEmbedding(q, apiModel, 'text-embedding-3-small')
    }

    // 混合评分
    const queryLower = q.toLowerCase()
    const keywords = q.split(/\s+/).filter(k => k.length >= 2)

    const scored: SemanticSearchResult[] = entries.value
      .filter(e => e.embedding.length > 0)
      .map(e => {
        // 语义相似度
        const semanticScore = queryEmbedding
          ? cosineSimilarity(queryEmbedding, e.embedding)
          : 0

        // 关键词匹配加成
        let keywordBoost = 0
        const textLower = e.text.toLowerCase()
        if (textLower.includes(queryLower)) {
          keywordBoost = 0.3 // 完全匹配加成
        } else {
          let matchedKeywords = 0
          for (const kw of keywords) {
            if (textLower.includes(kw)) matchedKeywords++
          }
          keywordBoost = matchedKeywords > 0 ? matchedKeywords / keywords.length * 0.2 : 0
        }

        return {
          entry: e,
          similarity: semanticScore,
          hybridScore: semanticScore * 0.7 + keywordBoost * 0.3
        }
      })
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, topK)
      .filter(s => s.hybridScore > 0.1)

    lastSearchResults.value = scored
    return scored
  }

  /** 纯关键词搜索（无嵌入时的回退方案） */
  function keywordOnlySearch(query: string, topK: number): SemanticSearchResult[] {
    const q = query.toLowerCase()
    const keywords = q.split(/\s+/).filter(k => k.length >= 2)

    return entries.value
      .map(e => {
        const textLower = e.text.toLowerCase()
        let score = 0
        if (textLower.includes(q)) {
          score = 0.8
        } else {
          let matched = 0
          for (const kw of keywords) {
            if (textLower.includes(kw)) matched++
          }
          score = keywords.length > 0 ? matched / keywords.length * 0.5 : 0
        }
        return { entry: e, similarity: score, hybridScore: score }
      })
      .filter(s => s.hybridScore > 0)
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, topK)
  }

  // ===== 工具 =====

  /** 查询某视频的所有嵌入条目 */
  function entriesForVideo(videoId: string): VectorEntry[] {
    return entries.value.filter(e => e.videoId === videoId)
  }

  /** 清除所有数据 */
  function clearAll() {
    entries.value = []
    embeddingCache.value.clear()
    lastSearchResults.value = []
    localStorage.removeItem(EMBEDDINGS_KEY)
  }

  /** 清除某视频的嵌入缓存 */
  function clearForVideo(videoId: string) {
    entries.value = entries.value.filter(e => e.videoId !== videoId)
    // 清除对应缓存
    const keysToRemove: string[] = []
    for (const [key] of embeddingCache.value) {
      if (key.startsWith(videoId + '::')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => embeddingCache.value.delete(k))
    saveCache()
  }

  // ===== 统计 =====
  const embeddedCount = computed(() =>
    entries.value.filter(e => e.embedding.length > 0).length
  )

  const totalEntryCount = computed(() => entries.value.length)

  return {
    // 状态
    entries,
    isBuilding,
    progress,
    lastSearchQuery,
    lastSearchResults,

    // 操作
    buildFromSubtitles,
    buildFromClips,
    semanticSearch,
    clearAll,
    clearForVideo,
    entriesForVideo,

    // 统计
    embeddedCount,
    totalEntryCount
  }
})
