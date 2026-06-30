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

/** 工作流节点类别 */
export type NodeCategory = 'trigger' | 'source' | 'process-ai' | 'process-local' | 'quality' | 'output'

/** 工作流节点 */
export interface WorkflowNode {
  id: string
  type: NodeCategory
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
  // 计划执行（原定时触发）
  cron?: string
  interval?: number
  schedule?: string   // 执行频率说明
  // 读取视频/文件
  filePath?: string
  fileType?: string
  // 批量读取（原读取文件夹）
  folderPath?: string
  fileFilter?: string
  fileTypes?: string   // 文件类型过滤 (视频/文本/字幕/全部)
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
  operation?: 'replace' | 'format' | 'summarize' | 'dedup' | 'keywords' | 'abstract' | 'wordcount'
  pattern?: string
  replacement?: string
  // 重复度检查
  dupThreshold?: number        // 相似度阈值 0-100
  dupMode?: 'exact' | 'semantic' | 'clickbait'  // 检查模式
  // 文案润色
  polishPlatform?: 'douyin' | 'xiaohongshu' | 'shipinhao' | 'kuaishou'
  polishIntensity?: 'low' | 'medium' | 'high'
  // 字幕生成
  speechRate?: number   // 字/分钟
  // 爆款标题生成
  titlePlatform?: 'douyin' | 'xiaohongshu' | 'shipinhao' | 'kuaishou'
  titleCount?: number   // 标题数量 3-10
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

// ===== 节点目录定义（调色板） =====
export interface NodePaletteItem {
  label: string
  type: NodeCategory
  icon: string
  desc?: string
}

/** 调色板分类顺序 */
export const PALETTE_CATEGORIES: Array<{ key: NodeCategory; label: string; color: string }> = [
  { key: 'trigger', label: '触发', color: '#e6a23c' },
  { key: 'source', label: '输入', color: '#67c23a' },
  { key: 'process-ai', label: '处理·AI', color: '#9b59b6' },
  { key: 'process-local', label: '处理·本地', color: '#409eff' },
  { key: 'quality', label: '质检', color: '#f56c6c' },
  { key: 'output', label: '输出', color: '#ff6b35' }
]

/** 节点调色板 */
export const NODE_PALETTE: NodePaletteItem[] = [
  // 触发
  { label: '计划执行', type: 'trigger', icon: '⏰', desc: '定时/计划触发工作流' },
  // 输入
  { label: '读取视频', type: 'source', icon: '📹' },
  { label: '读取文件', type: 'source', icon: '📄' },
  { label: '批量读取', type: 'source', icon: '📁', desc: '批量读取文件夹（支持类型过滤）' },
  { label: '新建文档', type: 'source', icon: '📝' },
  { label: '读取字幕', type: 'source', icon: '💬' },
  // 处理·AI
  { label: 'AI文案生成', type: 'process-ai', icon: '🤖' },
  { label: '文案润色', type: 'process-ai', icon: '✨', desc: '自媒体网感化润色' },
  { label: '爆款标题生成', type: 'process-ai', icon: '🔥', desc: '生成多个爆款标题选项' },
  // 处理·本地
  { label: '文本处理', type: 'process-local', icon: '📝', desc: '替换/整理/去重/关键词/摘要/字数' },
  { label: '字幕生成', type: 'process-local', icon: '🎞️', desc: '按语速从文本生成 SRT 字幕' },
  // 质检
  { label: '重复度检查', type: 'quality', icon: '🔍', desc: '检测重复/语义近似/标题党' },
  // 输出
  { label: '保存文件', type: 'output', icon: '💾' },
  { label: '导出剪映', type: 'output', icon: '🎬' }
]

// ===== 重复度检查（本地算法） =====
const CLICKBAIT_KEYWORDS = [
  '震惊', '必看', '绝了', '惊呆', '史上最', '笑死', '太可怕了',
  '速看', '紧急', '轰动', '爆料', '逆天', '疯传', '99%', '百分之百',
  '不看后悔', '看哭了', '看傻了', '吓尿了', '吓傻了', '哭晕',
  '血的教训', '不转不是', '刚刚曝光', '央视曝光', '真相了',
  '居然', '竟然', '万万没想到', '一定要看', '所有人', '赶紧看',
  '不看亏大了', '内幕', '秘密', '真相', '揭秘', '曝光', '重磅'
]

/** 标题党检测：返回匹配到的关键词列表 */
export function detectClickbait(text: string): string[] {
  const found: string[] = []
  for (const kw of CLICKBAIT_KEYWORDS) {
    if (text.includes(kw)) found.push(kw)
  }
  return Array.from(new Set(found))
}

/** 将文本按句号/问号/感叹号/换行/分号分句，过滤掉太短的片段 */
export function splitSentences(text: string, minLen = 4): string[] {
  if (!text) return []
  // 在句末标点处拆分，保留标点
  const parts = text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[。！？!?；;\n])/)
    .map(s => s.trim())
    .filter(s => s.length >= minLen)
  return parts
}

/** 字符级 Jaccard 相似度（用字符 bigram 集合） */
export function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const setA = new Set<string>()
  const setB = new Set<string>()
  for (let i = 0; i < a.length - 1; i++) setA.add(a.slice(i, i + 2))
  for (let i = 0; i < b.length - 1; i++) setB.add(b.slice(i, i + 2))
  if (setA.size === 0 || setB.size === 0) {
    // 单字符退化
    for (const ch of a) setA.add(ch)
    for (const ch of b) setB.add(ch)
  }
  let inter = 0
  for (const x of setA) if (setB.has(x)) inter++
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}

/** 语义近似：启发式——对长句（>=20 字）计算相似度阈值降低，作为"疑似重复" */
export function isSemanticSimilar(a: string, b: string): boolean {
  if (a.length < 10 || b.length < 10) return false
  // 长度接近（0.6~1.5倍）且共享高频非停用词比例高
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length)
  if (lenRatio < 0.5) return false
  // 简单关键词交集
  const tokenize = (s: string) => new Set(s.replace(/[的了是在和与及或不也都就会能要我你他她它这那啊吧吗呢哦]/g, '').split('').filter(ch => /[\u4e00-\u9fa5a-zA-Z0-9]/.test(ch)))
  const ta = tokenize(a), tb = tokenize(b)
  let inter = 0
  for (const x of ta) if (tb.has(x)) inter++
  const union = ta.size + tb.size - inter
  return union > 0 && inter / union > 0.55
}

export interface DuplicatePair {
  seg1: string
  seg2: string
  similarity: number
  kind: 'exact' | 'semantic'
}

export interface DuplicationReport {
  rate: number        // 重复率百分比 0-100
  duplicates: DuplicatePair[]
  clickbaitWords: string[]
  status: 'pass' | 'warn' | 'fail'
  segmentCount: number
  duplicatedSegmentCount: number
  summary: string
}

/**
 * 重复度检查核心函数
 * @param text 输入文本
 * @param threshold 相似度阈值 0-100
 * @param mode 检查模式
 */
export function checkDuplication(
  text: string,
  threshold: number = 70,
  mode: 'exact' | 'semantic' | 'clickbait' = 'exact'
): DuplicationReport {
  const segs = splitSentences(text)
  const duplicates: DuplicatePair[] = []
  const dupSegIndices = new Set<number>()
  const threshold01 = Math.max(0, Math.min(1, threshold / 100))

  if (mode === 'exact' || mode === 'semantic') {
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const a = segs[i], b = segs[j]
        // 跳过过短句
        if (a.length < 4 || b.length < 4) continue
        const sim = jaccardSimilarity(a, b)
        if (mode === 'exact' && sim >= threshold01) {
          duplicates.push({ seg1: a, seg2: b, similarity: sim, kind: 'exact' })
          dupSegIndices.add(i); dupSegIndices.add(j)
        } else if (mode === 'semantic') {
          // 语义模式下：先按较低阈值查相似
          const semanticThreshold = Math.max(0.4, threshold01 - 0.2)
          if (sim >= semanticThreshold || isSemanticSimilar(a, b)) {
            const kind: 'exact' | 'semantic' = sim >= threshold01 ? 'exact' : 'semantic'
            duplicates.push({ seg1: a, seg2: b, similarity: sim, kind })
            dupSegIndices.add(i); dupSegIndices.add(j)
          }
        }
      }
    }
  }

  const clickbaitWords = (mode === 'clickbait' || mode === 'semantic') ? detectClickbait(text) : []

  const rate = segs.length === 0 ? 0 : Math.round((dupSegIndices.size / segs.length) * 100)
  let status: 'pass' | 'warn' | 'fail' = 'pass'
  if (rate >= threshold || (mode === 'clickbait' && clickbaitWords.length > 0)) status = 'warn'
  if (rate >= Math.min(threshold + 20, 90) || duplicates.some(d => d.similarity >= 0.9 && d.kind === 'exact')) status = 'fail'

  const issues: string[] = []
  if (rate > 0) issues.push(`重复率 ${rate}%`)
  if (duplicates.length > 0) issues.push(`${duplicates.length} 处疑似重复`)
  if (clickbaitWords.length > 0) issues.push(`标题党词 ${clickbaitWords.length} 个`)
  const summary = issues.length === 0 ? '✅ 通过：未检测到明显问题' : `⚠️ ${issues.join('；')}`

  return {
    rate,
    duplicates: duplicates.slice(0, 50), // 防止过多
    clickbaitWords,
    status,
    segmentCount: segs.length,
    duplicatedSegmentCount: dupSegIndices.size,
    summary
  }
}

// ===== SRT 字幕生成（本地） =====
export interface SrtCue {
  index: number
  start: string
  end: string
  text: string
}

export function srtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

/** 从纯文本按标点分句 + 语速估算时间戳，生成 SRT */
export function generateSrtFromText(text: string, speechRate: number = 250): { srt: string; cues: SrtCue[]; duration: number } {
  const clean = (text || '').replace(/\r\n/g, '\n').trim()
  // 按换行/句号/问号/感叹号/分号分句
  const sentences = clean
    .split(/(?<=[。！？!?；;])|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  const cps = Math.max(1, speechRate) / 60  // 字/秒
  let t = 0
  const cues: SrtCue[] = []
  sentences.forEach((s, i) => {
    const dur = Math.max(1.0, s.length / cps) // 每条至少 1 秒
    cues.push({
      index: i + 1,
      start: srtTime(t),
      end: srtTime(t + dur),
      text: s
    })
    t += dur + 0.15 // 句间 150ms 间隔
  })
  const srt = cues.map(c => `${c.index}\n${c.start} --> ${c.end}\n${c.text}\n`).join('\n')
  return { srt, cues, duration: t }
}

/** 从上游结果中拼接输入文本 */
export function collectInputText(upstreamResults: NodeExecResult[]): string {
  let text = ''
  for (const r of upstreamResults) {
    if (r.data?.outputText) text += r.data.outputText + '\n'
    else if (r.data?.aiResponse) text += r.data.aiResponse + '\n'
    else if (r.data?.polishedText) text += r.data.polishedText + '\n'
    else if (r.data?.srt && typeof r.data?.srt === 'string') text += r.data.srt + '\n'
    else if (r.data?.content) text += r.data.content + '\n'
    else if (r.data?.titles && Array.isArray(r.data.titles)) text += r.data.titles.join('\n') + '\n'
    else if (r.output) text += r.output + '\n'
  }
  return text
}

// ===== AI 调用公共辅助 =====
async function callAI(prompt: string, modelId?: string): Promise<string> {
  const { sendChatMessage } = await import('@/services/deepseek')
  const { useChatStore } = await import('@/stores/chat')
  const chatStore = useChatStore()
  let model: any = null
  if (modelId) model = chatStore.models.find((m: any) => m.id === modelId)
  if (!model) model = chatStore.currentModel
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
  const response = await sendChatMessage(model, [
    { id: 'wf_' + Date.now(), role: 'user', content: prompt, deepThinking: false, reasoningContent: '', timestamp: '', followUpTo: null, followUpIds: [], isFavorited: false, isStreaming: false }
  ])
  return response
}

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

  function addNode(type: NodeCategory, label: string, x: number, y: number): WorkflowNode {
    const node: WorkflowNode = { id: 'node_' + Date.now(), type, label, x, y, config: {} }
    // 为节点设置默认配置
    switch (label) {
      case '计划执行':
        node.config = { interval: 60, schedule: '每60秒执行一次' }
        break
      case '批量读取':
        node.config = { fileTypes: 'all', fileFilter: '', recursive: false }
        break
      case '重复度检查':
        node.config = { dupThreshold: 70, dupMode: 'exact' }
        break
      case '文案润色':
        node.config = { polishPlatform: 'douyin', polishIntensity: 'medium' }
        break
      case '字幕生成':
        node.config = { speechRate: 250 }
        break
      case '爆款标题生成':
        node.config = { titlePlatform: 'douyin', titleCount: 5 }
        break
      case '文本处理':
        node.config = { operation: 'format' }
        break
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
    if (node) { node.x = x; node.y = y; saveWorkflow() }
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
    return edge
  }

  function removeEdge(edgeId: string) {
    workflowEdges.value = workflowEdges.value.filter(e => e.id !== edgeId)
    saveWorkflow()
  }

  function removeEdgesForNode(nodeId: string) {
    workflowEdges.value = workflowEdges.value.filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId)
    saveWorkflow()
  }

  function selectNode(nodeId: string | null) { selectedNodeId.value = nodeId }
  function setCanvasOffset(x: number, y: number) { canvasOffset.x = x; canvasOffset.y = y }
  function setCanvasScale(s: number) { canvasScale.value = Math.max(0.3, Math.min(3, s)) }

  // ===== 节点配置 =====
  function updateNodeConfig(nodeId: string, config: Partial<NodeConfig>) {
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node) {
      node.config = { ...node.config, ...config }
      saveWorkflow()
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

  async function executeWorkflow() {
    if (isWorkflowRunning.value) return
    isWorkflowRunning.value = true
    workflowLogs.value = []
    resetAllNodeResults()

    const ordered = getTopologicalOrder()
    if (ordered.length === 0) {
      addWorkflowLog('画布中没有节点')
      isWorkflowRunning.value = false
      return
    }

    addWorkflowLog(`开始执行工作流 (共 ${ordered.length} 个节点)`)

    for (const node of ordered) {
      setNodeResult(node.id, 'running', '执行中...')
      addWorkflowLog(`执行节点: ${node.label}`)
      await new Promise(r => setTimeout(r, 200)) // 短暂延迟让 UI 更新

      try {
        const upstreamResults = getUpstreamResults(node.id)
        const result = await executeNode(node, upstreamResults)
        setNodeResult(node.id, 'success', result.output, undefined, result.data)
        addWorkflowLog(`  ✓ ${node.label} 完成`)
      } catch (e: any) {
        const errMsg = e.message || String(e)
        setNodeResult(node.id, 'error', '', errMsg)
        addWorkflowLog(`  ✗ ${node.label} 失败: ${errMsg}`)
      }
    }

    isWorkflowRunning.value = false
    addWorkflowLog('工作流执行完毕')
  }

  async function executeNode(
    node: WorkflowNode,
    upstreamResults: NodeExecResult[]
  ): Promise<{ output: string; data?: any }> {
    const cfg = node.config
    const api = (window as any).electronAPI
    const inputText = collectInputText(upstreamResults)

    switch (node.label) {
      // ===== 触发器 =====
      case '计划执行':
      case '定时触发': {
        // 兼容旧节点
        return {
          output: '触发信号已发出',
          data: {
            triggered: true,
            timestamp: Date.now(),
            schedule: cfg.schedule || `每 ${cfg.interval || 60} 秒执行一次`
          }
        }
      }

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

      case '批量读取':
      case '读取文件夹': {
        const folderPath = cfg.folderPath
        if (!folderPath) throw new Error('未配置文件夹路径')
        if (!api?.listDirectory) throw new Error('文件系统 API 不可用')

        const fileFilter = cfg.fileFilter || ''
        const recursive = cfg.recursive || false
        const fileTypes = (cfg.fileTypes || 'all').toLowerCase()
        // 类型过滤扩展名
        const typeExtMap: Record<string, string[]> = {
          video: ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v'],
          text:  ['.txt', '.md', '.doc', '.docx', '.pdf'],
          subtitle: ['.srt', '.vtt', '.ass', '.ssa', '.lrc']
        }

        async function listRecursive(dirPath: string): Promise<any[]> {
          const results: any[] = []
          try {
            const entries = await api!.listDirectory(dirPath)
            for (const entry of entries) {
              if (entry.isFile) {
                const ext = '.' + (entry.name.split('.').pop() || '').toLowerCase()
                let typeMatch = true
                if (fileTypes !== 'all' && typeExtMap[fileTypes]) {
                  typeMatch = typeExtMap[fileTypes].includes(ext)
                }
                let filterMatch = true
                if (fileFilter.trim()) {
                  const filters = fileFilter.split(',').map(f => f.trim()).filter(Boolean)
                  filterMatch = filters.some(f => {
                    if (f.startsWith('*.')) return ext === f.slice(1)
                    return entry.name.includes(f)
                  })
                }
                if (typeMatch && filterMatch) results.push({ name: entry.name, path: entry.path, type: 'file', ext })
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
        // 拼接所有文本类文件内容
        let combinedContent = ''
        if (fileTypes === 'text' || fileTypes === 'all') {
          for (const f of files) {
            if (['.txt', '.md', '.srt', '.vtt', '.ass'].includes(f.ext)) {
              try {
                const r = await api.readFileAsText(f.path)
                if (r.success) combinedContent += `\n--- ${f.name} ---\n${r.content}\n`
              } catch {}
            }
          }
        }

        return {
          output: `已批量读取: ${folderName} (${files.length} 个文件)`,
          data: { folderPath, folderName, files, fileList, fileCount: files.length, content: combinedContent }
        }
      }

      case '读取字幕': {
        const allVideos = importedVideos.value.filter(v => v.subtitles.length > 0)
        if (allVideos.length === 0) throw new Error('没有可用的字幕数据，请先在「工作状态」中为视频进行语音识别')

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

        allSubs.sort((a, b) => a.videoName.localeCompare(b.videoName) || a.startTime - b.startTime)
        const fullText = allSubs.map(s => `[${s.videoName}] ${s.text}`).join('\n')
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

        await api.createDirectory(docOutputPath)

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

        const ext = `.${docFileType}`
        const finalName = docFileName.endsWith(ext) ? docFileName : docFileName + ext
        const fullPath = `${docOutputPath.replace(/\\/g, '/')}/${finalName}`

        await api.writeFile(fullPath, content)
        return {
          output: `文档已创建: ${finalName}`,
          data: { fileName: finalName, filePath: fullPath, content, fileType: docFileType }
        }
      }

      // ===== 处理·AI =====
      case 'AI文案生成': {
        const prompt = cfg.prompt
        if (!prompt) throw new Error('未配置 AI 提示词')
        let context = inputText
        const fullPrompt = context.trim()
          ? `基于以下内容，${prompt}\n\n内容：\n${context}`
          : prompt
        const response = await callAI(fullPrompt, cfg.modelId)
        return { output: truncateForOutput(response, 80), data: { prompt: fullPrompt, aiResponse: response, content: response } }
      }

      case '文案润色': {
        if (!inputText.trim()) throw new Error('没有可润色的输入文本，请先连接上游文本节点')
        const platformMap: Record<string, string> = {
          douyin: '抖音', xiaohongshu: '小红书', shipinhao: '视频号', kuaishou: '快手'
        }
        const intensityMap: Record<string, string> = {
          low: '轻度（保留原味，仅修正错字语病）',
          medium: '中度（增加网感金句，适合大众）',
          high: '重度（爆梗密集，强情绪钩子，极致网感）'
        }
        const platform = platformMap[cfg.polishPlatform || 'douyin']
        const intensity = intensityMap[cfg.polishIntensity || 'medium']
        const prompt = `你是一位资深自媒体文案编辑，擅长${platform}平台的爆款文案。请将以下文案进行润色，要求：
1. 目标平台：${platform}（符合该平台语气、话题、emoji使用习惯）
2. 网感强度：${intensity}
3. 保留原文核心信息，不要凭空捏造事实
4. 语言口语化、有节奏感，适当使用 emoji 和话题标签
5. 直接输出润色后的文案，不要加解释说明。

原文：
${inputText}`
        const response = await callAI(prompt, cfg.modelId)
        return {
          output: truncateForOutput(response, 80),
          data: { polishedText: response, aiResponse: response, content: response, platform: cfg.polishPlatform, intensity: cfg.polishIntensity }
        }
      }

      case '爆款标题生成': {
        if (!inputText.trim()) throw new Error('没有可生成标题的输入文本，请先连接上游内容节点')
        const platformMap: Record<string, string> = {
          douyin: '抖音', xiaohongshu: '小红书', shipinhao: '视频号', kuaishou: '快手'
        }
        const platform = platformMap[cfg.titlePlatform || 'douyin']
        const count = Math.max(3, Math.min(10, cfg.titleCount || 5))
        const prompt = `你是一位资深${platform}爆款标题策划师。请根据以下文案内容，生成 ${count} 个${platform}平台风格的爆款标题。
要求：
1. 标题要有强钩子、数字/反差/悬念/利益点
2. 符合${platform}平台的调性，长度适合该平台（抖音 15-25 字、小红书 15-20 字+emoji）
3. 每条标题单独一行，以"1. ""2. "…编号
4. 不要加解释说明。

文案内容：
${inputText.slice(0, 3000)}`
        const response = await callAI(prompt, cfg.modelId)
        // 解析编号标题
        const titles = response.split(/\n+/).map(l => l.replace(/^\s*\d+[\.、\)]\s*/, '').trim()).filter(Boolean)
        return {
          output: `已生成 ${titles.length} 个${platform}爆款标题`,
          data: { titles, aiResponse: response, content: titles.join('\n'), titleCount: titles.length, platform: cfg.titlePlatform }
        }
      }

      // ===== 处理·本地 =====
      case '文本处理': {
        const operation = cfg.operation || 'format'
        if (!inputText.trim()) throw new Error('没有可处理的输入文本')
        let outputText = ''
        let summary = ''

        switch (operation) {
          case 'replace': {
            const pattern = cfg.pattern || ''
            const replacement = cfg.replacement || ''
            if (!pattern) throw new Error('未配置替换模式')
            outputText = inputText.replace(new RegExp(pattern, 'g'), replacement)
            summary = `文本替换完成 (匹配 ${pattern})`
            break
          }
          case 'format': {
            outputText = inputText.trim().split('\n').filter(l => l.trim()).map(l => l.trim()).join('\n')
            summary = '文本格式化完成'
            break
          }
          case 'summarize': {
            const lines = inputText.trim().split('\n').filter(l => l.trim())
            outputText = lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n...(已截断)' : '')
            summary = `文本摘要完成 (${lines.length} 行 → ${Math.min(lines.length, 5)} 行)`
            break
          }
          case 'dedup': {
            // 行级去重（去除完全重复行，保留首次出现）
            const lines = inputText.split('\n')
            const seen = new Set<string>()
            const out: string[] = []
            for (const l of lines) {
              const k = l.trim()
              if (!k) { out.push(l); continue }
              if (!seen.has(k)) { seen.add(k); out.push(l) }
            }
            outputText = out.join('\n')
            summary = `去重完成 (原 ${lines.length} 行 → ${out.length} 行)`
            break
          }
          case 'keywords': {
            // 简易关键词提取：按词频统计中文 2-4 字片段
            const text = inputText.replace(/\s+/g, '')
            const stop = new Set(['的','了','是','在','我','你','他','她','它','这','那','和','与','或','不','也','都','就','会','能','要','有','一','个','上','下','里','中','把','被','让','给','对','到','去','说','着','过','吗','呢','啊','吧','呀','哦','很','最','又','再'])
            const freq = new Map<string, number>()
            for (let n = 2; n <= 4; n++) {
              for (let i = 0; i <= text.length - n; i++) {
                const w = text.slice(i, i + n)
                if (/^[\u4e00-\u9fa5]+$/.test(w) && ![...w].some(c => stop.has(c))) {
                  freq.set(w, (freq.get(w) || 0) + 1)
                }
              }
            }
            const kws = [...freq.entries()].filter(([,c]) => c >= 2).sort((a,b) => b[1]-a[1]).slice(0, 20).map(([w]) => w)
            outputText = kws.join('、')
            summary = `关键词提取完成 (${kws.length} 个)`
            break
          }
          case 'abstract': {
            // 简易摘要：取分数最高的若干句（基于词频）
            const sents = splitSentences(inputText, 6)
            const text = inputText.replace(/\s+/g, '')
            const freq = new Map<string, number>()
            for (let i = 0; i < text.length - 1; i++) {
              const ch = text[i]
              if (/[\u4e00-\u9fa5]/.test(ch)) freq.set(ch, (freq.get(ch)||0)+1)
            }
            const scored = sents.map(s => {
              let score = 0
              for (const ch of s) if (freq.has(ch)) score += freq.get(ch)!
              return { s, score: score / Math.max(s.length, 1) }
            }).sort((a,b) => b.score - a.score)
            const topCount = Math.max(3, Math.min(6, Math.ceil(sents.length * 0.2)))
            outputText = scored.slice(0, topCount).map(x => x.s).join('\n')
            summary = `摘要生成完成 (${sents.length} 句 → ${topCount} 句)`
            break
          }
          case 'wordcount': {
            const chars = inputText.replace(/\s/g, '').length
            const cnChars = (inputText.match(/[\u4e00-\u9fa5]/g) || []).length
            const words = inputText.trim().split(/\s+/).filter(Boolean).length
            const lines = inputText.split('\n').length
            outputText = `字数统计：
  总字符数（不含空格）：${chars}
  中文字符数：${cnChars}
  分词数（空白分隔）：${words}
  段落/行数：${lines}
  预估阅读时长：${Math.max(1, Math.ceil(chars / 400))} 分钟

===== 原文 =====
${inputText}`
            summary = `字数统计：约 ${chars} 字`
            break
          }
          default:
            throw new Error(`未知的文本操作: ${operation}`)
        }
        return {
          output: summary,
          data: { inputText, outputText, operation, content: outputText }
        }
      }

      case '字幕生成': {
        if (!inputText.trim()) throw new Error('没有可生成字幕的输入文本')
        const rate = cfg.speechRate || 250
        const { srt, cues, duration } = generateSrtFromText(inputText, rate)
        return {
          output: `字幕已生成：${cues.length} 条，总时长 ${duration.toFixed(1)} 秒（语速 ${rate} 字/分钟）`,
          data: { srt, cues, duration, speechRate: rate, content: srt, outputText: srt }
        }
      }

      // ===== 质检 =====
      case '重复度检查': {
        if (!inputText.trim()) throw new Error('没有可检查的输入文本')
        const threshold = typeof cfg.dupThreshold === 'number' ? cfg.dupThreshold : 70
        const mode = cfg.dupMode || 'exact'
        const report = checkDuplication(inputText, threshold, mode)
        // 构造可读报告
        const lines: string[] = []
        lines.push(`=== 重复度检查报告 ===`)
        lines.push(`模式：${mode === 'exact' ? '精确重复' : mode === 'semantic' ? '语义近似' : '标题党检测'}`)
        lines.push(`重复率：${report.rate}% (阈值 ${threshold}%)`)
        lines.push(`分句数：${report.segmentCount}，疑似重复段：${report.duplicatedSegmentCount}`)
        lines.push(`结果：${report.summary}`)
        if (report.clickbaitWords.length > 0) {
          lines.push(`\n⚠️ 检测到标题党词汇：${report.clickbaitWords.join('、')}`)
        }
        if (report.duplicates.length > 0) {
          lines.push(`\n疑似重复片段（前 10 条）：`)
          report.duplicates.slice(0, 10).forEach((d, i) => {
            lines.push(`${i + 1}. [${d.kind === 'exact' ? '精确' : '语义'} ${(d.similarity * 100).toFixed(0)}%]`)
            lines.push(`   A: ${truncateForOutput(d.seg1, 60)}`)
            lines.push(`   B: ${truncateForOutput(d.seg2, 60)}`)
          })
        }
        const reportText = lines.join('\n')
        // 质检状态：warn/fail 也作为 success 节点返回（不中断流程），通过 data 暴露问题
        return {
          output: report.summary,
          data: {
            report: reportText,
            content: reportText,
            outputText: reportText,
            ...report,
            // 明确标记质检结果供后续节点/UI 使用
            qualityPassed: report.status === 'pass',
            qualityStatus: report.status,
            duplicates: report.duplicates,
            clickbaitWords: report.clickbaitWords
          }
        }
      }

      // ===== 输出 =====
      case '保存文件': {
        const outputPath = cfg.outputPath
        const fileName = cfg.fileName || 'output.txt'
        if (!outputPath) throw new Error('未配置输出路径')
        let content = ''
        for (const r of upstreamResults) {
          if (r.data?.outputText) content += r.data.outputText
          else if (r.data?.srt) content += r.data.srt
          else if (r.data?.polishedText) content += r.data.polishedText
          else if (r.data?.titles && Array.isArray(r.data.titles)) content += r.data.titles.join('\n') + '\n'
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
        let subtitleText = ''
        let videoFiles: string[] = []
        for (const r of upstreamResults) {
          if (r.data?.srt) subtitleText += r.data.srt + '\n'
          else if (r.data?.outputText) subtitleText += r.data.outputText + '\n'
          else if (r.data?.aiResponse) subtitleText += r.data.aiResponse + '\n'
          else if (r.data?.content) subtitleText += r.data.content + '\n'
          if (r.data?.filePath) videoFiles.push(r.data.filePath)
          if (r.data?.files && Array.isArray(r.data.files)) {
            for (const f of r.data.files) if (f.path && (f.ext === '.mp4' || f.ext === '.mov')) videoFiles.push(f.path)
          }
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

      // ===== 兼容：旧"格式转换"节点（如有残留画布数据）=====
      case '格式转换': {
        const targetFormat = (cfg.targetFormat || 'txt') as string
        if (!inputText.trim()) throw new Error('没有可转换的输入内容')
        let outputText = ''
        switch (targetFormat) {
          case 'txt': outputText = inputText; break
          case 'json': outputText = JSON.stringify({ content: inputText.trim(), timestamp: Date.now() }, null, 2); break
          case 'md': outputText = inputText.trim().split('\n').map(l => l.trim() ? `- ${l.trim()}` : '').join('\n'); break
          case 'srt': {
            const { srt } = generateSrtFromText(inputText, 250)
            outputText = srt
            break
          }
          default: outputText = inputText
        }
        return {
          output: `已转换为 ${targetFormat.toUpperCase()} 格式（该节点已合并至"文本处理/字幕生成"）`,
          data: { inputText, outputText, targetFormat, content: outputText }
        }
      }

      default:
        throw new Error(`未知的节点类型: ${node.label}`)
    }
  }

  function truncateForOutput(text: string, max: number): string {
    if (!text) return ''
    const oneLine = text.replace(/\s+/g, ' ').trim()
    return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine
  }

  function stopWorkflow() {
    isWorkflowRunning.value = false
    addWorkflowLog('工作流已被用户中止')
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

    // 节点调色板
    NODE_PALETTE, PALETTE_CATEGORIES,
    checkDuplication, generateSrtFromText, splitSentences, jaccardSimilarity, detectClickbait,
    collectInputText,

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
