import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { ElMessage, ElMessageBox } from 'element-plus'
import { buildModelRequestBody } from '@/services/deepseek'

// ===== 类型定义 =====

/** 平台账号信息 */
export interface PlatformAccount {
  platform: string
  accountName: string
  followers: number
  avgViews: number
  avgLikes: number
  recentTrend: 'up' | 'down' | 'stable'
  topTags: string[]
}

/** 用户画像 */
export interface UserProfile {
  ageGroup: string
  genderRatio: string
  interests: string[]
  activeHours: string
  contentPreference: string[]
}

/** 文案分析结果 */
export interface CopywritingAnalysis {
  openingScore: number
  openingFeedback: string
  logicScore: number
  logicFeedback: string
  endingScore: number
  endingFeedback: string
  toneScore: number
  toneFeedback: string
  viralElements: string[]
  suggestions: string[]
}

/** 独特模式对话消息 */
export interface UniqueMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  analysis?: CopywritingAnalysis
  timestamp: string
}

/** 文案建议 */
export interface CopywritingSuggestion {
  id: string
  title: string
  content: string
  estimatedTraffic: string
  platform: string
  highlight: string
}

// ===== 点赞预测相关类型 =====

/** 账号 */
export interface Account {
  id: string
  name: string
  createdAt: string
}

/** 支持的平台 */
export type Platform = '抖音' | '视频号' | '小红书' | '快手'

/** 平台配置 */
export const PLATFORM_CONFIG: Record<Platform, { label: string; icon: string }> = {
  '抖音': { label: '抖音', icon: '🎵' },
  '视频号': { label: '视频号', icon: '📺' },
  '小红书': { label: '小红书', icon: '📕' },
  '快手': { label: '快手', icon: '📱' }
}

/** 平台评分锚定指南（纯算法规则，不包含受众描述） */
export const PLATFORM_SCORING_GUIDE: Record<Platform, string> = {
  '抖音': `【平台算法规则·抖音】
- 核心分发：算法推荐为主，完播率决定是否进入下一流量池
- 关键权重：完播率 > 停留时长 > 互动率（点赞/评论/转发）
- 钩子要求：前3秒完播率直接决定推流规模，必须在极短时间内让受众产生"不可划走"的感觉
- 节奏要求：快节奏、高密度输出，每5-8秒需要一个信息点或情绪点来维持停留
- 互动要求：评论和转发信号强于单纯点赞，触发讨论的内容比触发认同的内容推得更远`,

  '视频号': `【平台算法规则·视频号】
- 核心分发：社交关系链推荐为主（微信好友圈），熟人传播优先
- 关键权重：点赞/收藏权重高于完播率，社交推荐信号强
- 钩子要求：信任感优先于刺激感，不需要过度夸张，可用"一个真实的经历/发现"开头
- 节奏要求：允许深度展开和较慢节奏，但必须有清晰的结构感
- 互动要求：收藏率是关键指标，被收藏意味着受众认为"值得回看"`,

  '小红书': `【平台算法规则·小红书】
- 核心分发：搜索流量占比高 + 推荐流双引擎
- 关键权重：收藏率 + 搜索关键词匹配 + 笔记质量评分
- 钩子要求：标题和首图决定点击，需要"身份标签+具体利益"的组合，而非纯粹冲突
- 结构要求：信息结构化（分点/步骤/清单），实用导向，方便受众收藏和日后检索
- 互动要求：收藏 >> 点赞，被收藏的内容持续获得搜索流量`,

  '快手': `【平台算法规则·快手】
- 核心分发：关注关系和同城推荐优先，社区粘性强于算法推荐
- 关键权重：关注转化率 + 评论区互动深度 + 直播联动
- 钩子要求：真实感开场优先，"老铁们"式的亲近感，不宜过度精致或"端着"
- 节奏要求：允许更生活化的叙事节奏，对话感重于节奏感
- 互动要求：评论区的真实对话深度比评论数量更重要`
}

/** 7维评分维度（受众需求锚定，存储时×20映射为0-100） */
export interface ScoringDimensions {
  hook: number         // 开场钩子 0-100
  empathy: number      // 代入共鸣 0-100
  density: number      // 信息密度 0-100
  structure: number    // 叙事结构 0-100
  originality: number  // 稀缺独创 0-100
  socialResonance: number // 社会共振 0-100
  polish: number       // 执行质量 0-100
}

/** 评分维度标签配置 */
export const SCORING_DIMENSION_CONFIG: Array<{
  key: keyof ScoringDimensions
  label: string
  desc: string
  color: string
  /** Likert 5级锚定描述 */
  rubric: string[]
}> = [
  { key: 'hook', label: '开场钩子', desc: '前3秒能否让受众划不走', color: '#f56c6c', rubric: [
    '无具体指向，泛泛而谈，受众没有任何"这是在对我说"的感觉',
    '提到了一个普遍话题但没对准具体困惑，受众可能好奇但不一定被击中',
    '明确指向了某个群体共有的困境，受众产生"这说的是我的事"的识别感',
    '精准命中受众心中正在纠结但还没想清楚的问题，受众感到"你怎么知道我在想这个"',
    '一击命中受众最隐秘的困惑，产生强烈的被看穿感和不可划走的本能反应'
  ]},
  { key: 'empathy', label: '沉浸共鸣', desc: '是否让受众觉得「这说的就是我」', color: '#e6a23c', rubric: [
    '与受众无关的抽象话题，没有任何代入路径',
    '泛泛涉及了可能与受众相关的话题，但停留在表面',
    '说出了受众心里知道但没表达出来的感受，产生"对，就是这样"的认可',
    '不仅说出了受众的感受，还帮他们理清了情绪的来龙去脉，产生被解读的深层满足',
    '受众感到"这个人说出了我一直想说但说不清的东西"，产生强烈的精神连接'
  ]},
  { key: 'density', label: '干货密度', desc: '每段是否都在提供新知，不注水', color: '#9b59b6', rubric: [
    '翻来覆去讲一个已知道理，没有任何新认知',
    '有1个有价值的角度但展开拖沓，信息稀疏',
    '2-3个递进的解释角度，每个角度都有信息增量',
    '持续提供新的理解框架，每个段落都让受众对问题的理解更进一层',
    '全程高密度输出，受众感觉"每句话都在刷新我对这个问题的认知"'
  ]},
  { key: 'structure', label: '节奏掌控', desc: '受众是否经历了「被戳中→被解读→被点醒」', color: '#1abc9c', rubric: [
    '流水账，没有情绪引导，受众看完没有感受变化',
    '有基本的结构但缺乏情绪起伏，受众看完和看完前感觉差不多',
    '有清晰的起承转合，受众经历了从困惑到理解的感受变化',
    '结构精心设计，受众经历了被理解→被解释→被给予希望的完整情绪弧线',
    '情绪路径如大师布局，受众经历多轮"啊！原来是这个原因→那我该怎么做→原来如此"的认知升级'
  ]},
  { key: 'originality', label: '人设差异', desc: '换个同行来讲，是否就没这个味儿了', color: '#e74c3c', rubric: [
    '重复同赛道常见观点，换个同行也能讲，无差异',
    '有个人经历但不独特，同行用类似角度也能覆盖',
    '有独特的解读角度或案例组合，同行不太容易复制',
    '"只有这个人能讲"的内容，结合了独特的经验/案例/表达方式',
    '开创性洞察，为赛道带来了全新的理解维度，受众从未听过这个角度的解读'
  ]},
  { key: 'socialResonance', label: '传播共鸣', desc: '是否让受众产生「必须转给谁看」的冲动', color: '#3498db', rubric: [
    '纯个人琐事，与任何群体性困境无关',
    '提及了某个社会话题但没有切中痛点，共鸣面窄',
    '触及了一个具体的人群困境，相关群体能对号入座',
    '准确命名了一个"人人都感觉到但没人说清"的人生阶段困境，具备自发传播动力',
    '击中了某一人生阶段核心的未被言说的集体隐痛，让受众产生"终于有人说出来了"的转发冲动'
  ]},
  { key: 'polish', label: '可信背书', desc: '是否让人觉得你说的有根据、不忽悠', color: '#409eff', rubric: [
    '语言粗糙/夸张/无根据，受众感到"这是忽悠"',
    '基本通顺但缺乏可信度背书，受众半信半疑',
    '语言流畅工整，有一定可信度支撑（如引经据典/案例佐证）',
    '文字考究有节制，引用/案例/逻辑完整，受众感到"这个人是真懂的"',
    '每个论断都建立在可感知的根基上，受众感到"这不是在说服我，是在帮我看到真相"'
  ]}
]

/** 旧版9维评分（用于数据迁移） */
export interface LegacyScoringDimensions {
  openingHook?: number
  characterScene?: number
  emotionalPeak?: number
  audienceEngagement?: number
  viewpointCompression?: number
  structureClarity?: number
  contentScarcity?: number
  accountMatch?: number
  lowLikeRisk?: number
}

/** 将旧版9维映射为新版7维 */
export function migrateScores(legacy: LegacyScoringDimensions): ScoringDimensions {
  return {
    hook: legacy.openingHook ?? 60,
    empathy: Math.round(((legacy.characterScene ?? 60) + (legacy.audienceEngagement ?? 60)) / 2),
    density: Math.round(((legacy.viewpointCompression ?? 60) + (legacy.contentScarcity ?? 60)) / 2),
    structure: legacy.structureClarity ?? 60,
    originality: legacy.contentScarcity ?? 60,
    socialResonance: legacy.accountMatch ?? 60,
    polish: legacy.emotionalPeak ?? 60
  }
}

/** 判断数据是否为新版7维 */
export function isOldFormat(scores: any): boolean {
  return scores && ('openingHook' in scores || 'lowLikeRisk' in scores)
}

/** 默认评分 */
export function defaultScores(): ScoringDimensions {
  return { hook: 60, empathy: 60, density: 60, structure: 60, originality: 60, socialResonance: 60, polish: 60 }
}

/** 计算综合评分（加权平均，无反向计分维度） */
export function calcCompositeScore(scores: ScoringDimensions, customWeights?: Record<string, number>): number {
  const wt = customWeights || {}
  const weights: Record<keyof ScoringDimensions, number> = {
    hook: (wt['hook'] ?? 18) / 100,
    empathy: (wt['empathy'] ?? 14) / 100,
    density: (wt['density'] ?? 16) / 100,
    structure: (wt['structure'] ?? 14) / 100,
    originality: (wt['originality'] ?? 16) / 100,
    socialResonance: (wt['socialResonance'] ?? 12) / 100,
    polish: (wt['polish'] ?? 10) / 100
  }
  let total = 0
  for (const dim of SCORING_DIMENSION_CONFIG) {
    total += scores[dim.key] * weights[dim.key]
  }
  return Math.round(total)
}

/** 录入的一条文稿记录 */
export interface ScriptRecord {
  id: string
  content: string
  platform: Platform
  link: string
  actualLikes: number
  /** 播放量 */
  views?: number
  /** 点赞率（自动计算：likes/views） */
  likeRate?: number
  tags: string[]
  /** 7维评分 */
  scores: ScoringDimensions
  /** 综合评分 */
  compositeScore: number
  /** AI 分析结果文本 */
  analysis: string
  createdAt: string
  updatedAt: string
  /** 评分时使用的模型标识（用于跨模型迁移检测） */
  modelVersion?: string
  /** 内容拆解结果（录入时自动生成） */
  decomposition?: ContentDecomposition
  /** 评分时是否已注入受众画像（画像变更时用于触发重评分） */
  scoredWithProfile?: boolean
}

/** 拆解聚合分析结果 */
export interface DecompositionAnalysis {
  /** 钩子技巧排行（按出现次数） */
  hookTechniques: Array<{ technique: string; count: number; avgLikes: number }>
  /** 点赞引爆点类型排行 */
  likeTriggerTypes: Array<{ type: string; count: number; avgLikes: number }>
  /** 评论引导技巧排行 */
  commentBaitTechniques: Array<{ technique: string; count: number; avgLikes: number }>
  /** 高效组合发现 */
  effectiveCombos: Array<{ hook: string; trigger: string; bait: string; avgLikes: number; count: number }>
  /** AI 综合分析文本 */
  aiInsight: string
  /** 生成时间 */
  generatedAt: string
}

/** AI 归纳的规律总结 */
export interface PatternSummary {
  totalCount: number
  platformCounts: Record<string, number>
  platformAvgLikes: Record<string, number>
  overallAvgLikes: number
  topScriptId: string | null
  bottomScriptId: string | null
  /** 高赞文稿共性特征 */
  highLikePatterns: string[]
  /** 低赞文稿共性缺陷 */
  lowLikePatterns: string[]
  /** 各维度平均分（高赞 vs 低赞） */
  dimensionAverages: {
    high: ScoringDimensions
    low: ScoringDimensions
  }
  /** 平台差异说明 */
  platformDifferences: string
  /** 关键词推荐 */
  keywordInsights: string
  generatedAt: string
}

/** 写作框架 */
export interface WritingFramework {
  /** 平台通用框架 */
  universal: string
  /** 各平台定制建议 */
  platformSpecific: Record<string, string>
  /** 爆款标题公式 */
  titleFormulas: string[]
  /** 高赞结构模板 */
  structureTemplates: string[]
  /** 避坑指南 */
  pitfalls: string[]
  generatedAt: string
}

/** 概率分布桶 */
export interface BucketProb {
  bucket: string
  label: string
  probability: number
  isHeadline: boolean
}

/** 点赞预测结果 */
export interface PredictionResult {
  /** 预估点赞量范围 */
  minLikes: number
  maxLikes: number
  /** 新文稿7维评分 */
  scores: ScoringDimensions
  /** 综合评分 */
  compositeScore: number
  /** 各维度分析 */
  dimensionAnalysis: string[]
  /** 预测依据 */
  reasons: string[]
  /** 参考的具体样本 */
  referencedSamples: Array<{
    scriptId: string
    snippet: string
    actualLikes: number
    compositeScore: number
    platform: Platform
    similarityReason: string
  }>
  /** 改进建议 */
  suggestions: string[]
  /** 概率分布 */
  bucketProbabilities?: BucketProb[]
  /** 置信度 */
  confidence?: string
  /** 反事实分析 */
  counterfactuals?: string[]
  predictedAt: string
}

/** 预测日志条目（不可变，用于复盘校准） */
export interface PredictionLogEntry {
  id: string
  content: string
  contentHash: string
  platform: Platform
  result: PredictionResult
  predictedAt: string
  actualLikes?: number
  /** 实际播放量 */
  actualViews?: number
  retroAt?: string
  retroNote?: string
  /** 实际 vs 预测中枢的偏差百分比 */
  deviation?: number
}

/** 权重变更日志 */
export interface WeightChangeLogEntry {
  id: string
  timestamp: string
  oldWeights: Record<string, number>
  newWeights: Record<string, number>
  trigger: 'manual' | 'bump' | 'reset'
  note?: string
}

/** 进化看板指标 */
export interface EvolutionMetrics {
  /** 样本库总数 */
  totalScripts: number
  /** 预测总数 */
  totalPredictions: number
  /** 已复盘数 */
  totalRetros: number
  /** 权重变更次数 */
  weightChanges: number
  /** 最后权重变更时间 */
  lastWeightChangeAt: string | null
  /** 整体主桶命中率 */
  overallHitRate: number | null
  /** 早期（最早5条）命中率 */
  earlyHitRate: number | null
  /** 近期（最近5条）命中率 */
  recentHitRate: number | null
  /** 脱靶率变化趋势描述 */
  trendDescription: string
  /** 样本增长关键节点 */
  sampleMilestone: string
}

/** 多维关联分析结果 */
export interface ContentAnalysisResult {
  /** 样本总数 */
  totalSamples: number
  /** 播放-点赞 Pearson 相关系数 */
  viewsLikesCorrelation: number | null
  /** 文案长度-点赞相关系数 */
  lengthLikesCorrelation: number | null
  /** 文案长度-播放相关系数 */
  lengthViewsCorrelation: number | null
  /** 综合分-点赞相关系数 */
  scoreLikesCorrelation: number | null
  /** 综合分-播放相关系数 */
  scoreViewsCorrelation: number | null
  /** 平均点赞率 */
  avgLikeRate: number
  /** 各点赞率区间分布 */
  likeRateDistribution: Array<{ range: string; count: number; pct: number }>
  /** 异常点（标准化残差 > 2） */
  outliers: Array<{
    id: string
    snippet: string
    likes: number
    views?: number
    compositeScore: number
    reason: string
  }>
  /** 关键影响因素排名（按相关系数绝对值降序） */
  keyFactors: Array<{ factor: string; correlation: number; significance: 'high' | 'medium' | 'low' }>
  /** 各维度×点赞 相关系数（按绝对值降序，反映该账号"什么维度最驱动点赞"） */
  dimensionLikesCorrelation: Array<{ key: string; label: string; correlation: number; significance: 'high' | 'medium' | 'low' }>
  /** 各维度×播放 相关系数（反映"什么维度最影响平台推流"） */
  dimensionViewsCorrelation: Array<{ key: string; label: string; correlation: number; significance: 'high' | 'medium' | 'low' }>
  /** 文案长度 */
  contentLength: number
  /** 标签分布统计 */
  tagDistribution: Record<string, number>
  /** 各平台指标对比 */
  platformMetrics: Array<{
    platform: string
    count: number
    avgViews: number
    avgLikes: number
    avgLikeRate: number
    avgScore: number
  }>
  /** AI 生成的文字分析报告 */
  aiReport?: string
  generatedAt: string
  /** 模型标识（取样本中出现最多的模型版本） */
  modelVersion?: string
  /** 样本是否来自多个不同模型（影响相关性可信度） */
  mixedModel?: boolean
  /** 模型无关特征（本地计算，不依赖 AI，可用于跨模型比较） */
  modelAgnosticFactors?: Array<{
    factor: string
    /** 与点赞的相关性 */
    likesCorrelation: number
    /** 与播放的相关性 */
    viewsCorrelation: number | null
    significance: 'high' | 'medium' | 'low'
  }>
}

/** 内容拆解结果（开关、钩子、评论引导） */
export interface ContentDecomposition {
  /** 开头钩子分析 */
  openingHook: {
    text: string
    technique: string
    strength: 'strong' | 'medium' | 'weak'
    analysis: string
  }
  /** 点赞引爆点 */
  likeTriggers: Array<{
    point: string
    triggerType: string
    expectedImpact: 'high' | 'medium' | 'low'
    analysis: string
  }>
  /** 评论引导 */
  commentBaits: Array<{
    bait: string
    technique: string
    expectedEngagement: 'high' | 'medium' | 'low'
    analysis: string
  }>
  /** 整体拆解总结 */
  overallAnalysis: string
}

/** 独立校验结果 */
export interface CrossAuditResult {
  /** 主模型评分 */
  primaryScores: ScoringDimensions
  /** 校验模型评分 */
  auditScores: ScoringDimensions
  /** 各维度差异 */
  dimensionDiffs: Array<{
    key: string
    label: string
    primary: number
    audit: number
    diff: number
    flag: 'ok' | 'warn' | 'alert'
  }>
  /** 综合分差异 */
  compositeDiff: number
  /** 最终可信度 high | medium | low */
  credibility: 'high' | 'medium' | 'low'
  /** 差异说明 */
  note: string
}

/** 跨模型权重升级审计结果 */
export interface CrossAuditWeightResult {
  /** 外部模型是否同意升级 */
  passed: boolean
  /** 外部模型判定理由 */
  verdict: string
  /** 外部模型建议（如不同意会写原因） */
  advice?: string
}

/** 评分分歧：单维度3轮评分差异过大的标记 */
export interface ScoringDisagreement {
  key: string
  label: string
  /** 3轮的原始分值 (0-100) */
  runs: number[]
  /** 极差 */
  range: number
}

/** 权重升级的排序一致性审核结果 */
export interface WeightValidationResult {
  /** 是否通过（validateWeightProposal：相邻对正确率 >= 80% 且 >= 旧权重） */
  passed: boolean
  /** 旧权重在验证池中的排序正确数 */
  oldCorrect: number
  /** 新权重的排序正确数 */
  newCorrect: number
  /** 验证池总对（N个样本有 N-1 个相邻对） */
  totalPairs: number
  /** 旧权重正确率 */
  oldRate: number
  /** 新权重正确率 */
  newRate: number
  /** 每对详情 */
  pairs: Array<{
    aOld: number; aNew: number; bOld: number; bNew: number
    aLikes: number; bLikes: number; oldOk: boolean; newOk: boolean
  }>
  /** 建议文字 */
  recommendation: string
  /** 审核结论（PASS / FAIL / TIE） */
  verdict: string
  /** 旧权重 Spearman 秩相关系数 ×100（百分比） */
  oldRankCorrelation: number
  /** 新权重 Spearman 秩相关系数 ×100（百分比） */
  newRankCorrelation: number
  /** 旧权重排序一致性（所有配对中排序正确的比例 ×100） */
  oldPairwiseAccuracy: number
  /** 新权重排序一致性（所有配对中排序正确的比例 ×100） */
  newPairwiseAccuracy: number
  /** 各维度权重变更明细 */
  weightDiffs: Array<{ key: string; label: string; old: number; new: number; diff: number }>
  /** 样本总数 */
  sampleCount: number
  /** 逐样本明细（两种函数填充不同字段子集，未填的字段为 undefined） */
  sampleDetails: Array<{
    id: string
    snippet?: string
    likes?: number
    actualLikes?: number
    oldScore: number
    newScore: number
    oldRank?: number
    newRank?: number
    actualRank?: number
  }>
}

/** 受众画像：AI 从用户赛道关键词和已有文稿中反推 */
export interface AudienceProfile {
  /** 赛道关键词 */
  niche: string
  /** 目标受众画像 */
  targetAudience: string
  /** 受众核心困惑（3-5 个） */
  coreConfusions: string[]
  /** 共鸣触发模式（描述什么类型的内容容易击中受众） */
  resonancePatterns: string
  /** 信任建立方式（受众信任什么类型的表达） */
  trustBuilders: string
  /** 不适用的话题/调性（什么内容会破坏信任） */
  avoidTopics: string
  /** 由 AI 生成的分析摘要（完整文字，注入评分 prompt） */
  summary: string
  /** 生成时间 */
  generatedAt: number
}

/** 改写对比结果 */
export interface RewriteComparison {
  originalContent: string
  improvedContent: string
  originalScores: ScoringDimensions
  improvedScores: ScoringDimensions
  originalPrediction: PredictionResult
  improvedPrediction: PredictionResult
  improvements: string[]
}

// ===== 存储 Key =====
const ACCOUNTS_KEY = 'um-accounts'
const CURRENT_ACCOUNT_KEY = 'um-current-account'
const MESSAGES_KEY = 'unique-mode-messages'
const PREDICT_TAB_KEY = 'um-predict-subtab'

/** 按账号获取 localStorage key */
function acctKey(base: string, accountId: string) { return `${base}-${accountId}` }
function scriptsKey(id: string) { return acctKey('um-scripts', id) }
function patternKey(id: string) { return acctKey('um-pattern', id) }
function frameworkKey(id: string) { return acctKey('um-framework', id) }
function weightsKey(id: string) { return acctKey('um-weights', id) }
function criteriaKey(id: string) { return acctKey('um-criteria', id) }
function audienceProfileKey(id: string) { return acctKey('um-audience', id) }

const TAB_KEY = 'unique-mode-active-tab'

// ===== 工具函数 =====

function generateId(prefix: string): string {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

/** 获取当前默认模型的标识（用于追踪评分来源） */
function getCurrentModelId(): string {
  const chatStore = useChatStore()
  const m = chatStore.models.find(m => m.isDefault) || chatStore.models[0]
  return m ? `${m.provider}:${m.name}` : 'unknown'
}

async function callAI(systemPrompt: string, userContent: string, temperature: number = 0.7): Promise<string> {
  const chatStore = useChatStore()
  const model = chatStore.models.find(m => m.isDefault) || chatStore.models[0]
  if (!model?.apiKey) {
    throw new Error('请先在全局模型管理中设置 API Key')
  }

  const { body } = buildModelRequestBody(model, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature,
    max_tokens: 8192
  })

  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API 错误 (${response.status}): ${err}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

function extractSection(text: string, heading: string): string {
  const regex = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i')
  const match = text.match(regex)
  return match ? match[1].trim() : ''
}

/** 轻量内容哈希（SHA-256 前12位），用于预测日志防篡改校验 */
async function simpleHash(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12)
}

/** 根据样本库自动推导点赞量桶边界 */
function deriveBuckets(records: Array<{ actualLikes: number }>): Array<{ min: number; max: number; label: string }> {
  const likes = records.map(r => r.actualLikes).sort((a, b) => a - b)
  if (likes.length < 3) {
    return [
      { min: 0, max: 1000, label: '冷启动 <1k' },
      { min: 1001, max: 5000, label: '起步 1k-5k' },
      { min: 5001, max: 20000, label: '小爆 5k-2w' },
      { min: 20001, max: 100000, label: '爆款 2w-10w' },
      { min: 100001, max: Infinity, label: '大爆 >10w' },
    ]
  }
  const p20 = likes[Math.floor(likes.length * 0.2)]
  const p50 = likes[Math.floor(likes.length * 0.5)]
  const p80 = likes[Math.floor(likes.length * 0.8)]
  const p95 = likes[Math.floor(likes.length * 0.95)]
  const fmtL = (n: number) => n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
  return [
    { min: 0, max: p20, label: `底部 <${fmtL(p20)}` },
    { min: p20 + 1, max: p50, label: `基础 ${fmtL(p20)}-${fmtL(p50)}` },
    { min: p50 + 1, max: p80, label: `中位 ${fmtL(p50)}-${fmtL(p80)}` },
    { min: p80 + 1, max: p95, label: `高位 ${fmtL(p80)}-${fmtL(p95)}` },
    { min: p95 + 1, max: Infinity, label: `头部 >${fmtL(p95)}` },
  ]
}

/** 从 AI 返回文本中解析 7 维分数 */
function parseScores(text: string): ScoringDimensions {
  const scores = defaultScores()
  const dimMap: Record<string, keyof ScoringDimensions> = {
    'hook': 'hook', '开场钩子': 'hook',
    'empathy': 'empathy', '代入共鸣': 'empathy',
    'density': 'density', '信息密度': 'density',
    'structure': 'structure', '叙事结构': 'structure',
    'originality': 'originality', '稀缺独创': 'originality',
    'socialResonance': 'socialResonance', '社会共振': 'socialResonance',
    'polish': 'polish', '执行质量': 'polish'
  }

  let parsed = 0
  for (const [label, key] of Object.entries(dimMap)) {
    // 匹配标签后的冒号格式：hook: 4 或 开场钩子: 4 等
    // 也兼容小数输出 3.5（取整）、带理由的 4 | ...
    const regex = new RegExp(`${label}[：:]\\s*(\\d+)(?:\\.\\d+)?`, 'i')
    const match = text.match(regex)
    if (match) {
      const rawVal = parseInt(match[1], 10)
      // Likert 1-5 映射为 0,20,40,60,80,100
      const val = rawVal <= 5 ? (rawVal * 20) : Math.max(0, Math.min(100, rawVal))
      scores[key] = val
      parsed++
    }
  }
  if (parsed < 7) {
    const missing = Object.entries(dimMap).filter(([label, key]) => scores[key] === 60).map(([label]) => label).join('、')
    console.warn(`[parseScores] 仅解析到 ${parsed}/7 维，以下维度使用默认值 60：${missing}`)
  }
  return scores
}

// ===== Store =====

let audienceProfileHinted = false // 受众画像提示标记，避免反复弹窗

export const useUniqueModeStore = defineStore('uniqueMode', () => {
  // ===== 账号管理 =====
  const accounts = ref<Account[]>(loadAccounts())

  /** 兼容迁移：旧版 accountName → 新版多账号 */
  const currentAccountId = ref(loadCurrentAccount())
  const platformAccounts = ref<PlatformAccount[]>([])
  const userProfile = ref<UserProfile | null>(null)

  const currentAccount = computed(() => accounts.value.find(a => a.id === currentAccountId.value) || accounts.value[0] || null)

  function loadAccounts(): Account[] {
    try {
      const d = localStorage.getItem(ACCOUNTS_KEY)
      if (d) { const parsed = JSON.parse(d); if (Array.isArray(parsed) && parsed.length > 0) return parsed }
    } catch {}
    // 首次使用：创建默认模拟账号
    const defaultAccount: Account = {
      id: generateId('acct'),
      name: '唐碧霞说国学',
      createdAt: new Date().toLocaleString('zh-CN')
    }
    const list = [defaultAccount]
    saveAccounts(list)
    return list
  }

  function saveAccounts(list?: Account[]) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list || accounts.value))
  }

  function loadCurrentAccount(): string {
    try { return localStorage.getItem(CURRENT_ACCOUNT_KEY) || '' } catch { return '' }
  }
  function saveCurrentAccount() {
    localStorage.setItem(CURRENT_ACCOUNT_KEY, currentAccountId.value)
  }

  /** 初始化当前账号 ID（首次使用或迁移后） */
  function ensureCurrentAccount() {
    if (!currentAccountId.value && accounts.value.length > 0) {
      currentAccountId.value = accounts.value[0].id
      saveCurrentAccount()
    }
    // 如果当前 ID 不在账号列表中，回退到第一个
    if (currentAccountId.value && !accounts.value.find(a => a.id === currentAccountId.value)) {
      currentAccountId.value = accounts.value[0]?.id || ''
      saveCurrentAccount()
    }
  }
  ensureCurrentAccount()

  // 兼容旧版 accountName（仍用于文案分析 Tab 的账号搜索）
  const accountName = computed(() => currentAccount.value?.name || '')

  function addAccount(name: string): Account {
    const acc: Account = {
      id: generateId('acct'),
      name,
      createdAt: new Date().toLocaleString('zh-CN')
    }
    accounts.value.push(acc)
    saveAccounts()
    return acc
  }

  function switchAccount(accountId: string) {
    if (accountId === currentAccountId.value) return
    // 先保存当前账号数据
    saveScripts()
    savePatternSummary()
    saveFramework()
    saveCustomWeights()
    saveCustomCriteria()
    savePredictionHistory()
    // 切换
    currentAccountId.value = accountId
    saveCurrentAccount()
    // 加载新账号数据
    scriptRecords.value = loadScripts()
    patternSummary.value = loadPatternSummary()
    writingFramework.value = loadFramework()
    customWeights.value = loadCustomWeights()
    customCriteria.value = loadCustomCriteria()
    audienceProfile.value = loadAudienceProfile()
    lastPrediction.value = null
    predictionHistory.value = loadPredictionHistory()
    // 分析相关状态
    lastAnalysisResult.value = loadAnalysisResult()
    dimensionCorrelationHistory.value = loadDimHistory()
    weightValidationResult.value = null
    crossAuditResult.value = null
    crossAuditWeightResult.value = null
    scoringDisagreements.value = []
    predictDisagreements.value = []
    rewriteComparison.value = null
    aiReviewResult.value = null
    isReviewingPrediction.value = false
  }

  function deleteAccount(accountId: string) {
    if (accounts.value.length <= 1) {
      ElMessage.warning('至少保留一个账号')
      return
    }
    // 清除该账号的 localStorage 数据
    localStorage.removeItem(scriptsKey(accountId))
    localStorage.removeItem(patternKey(accountId))
    localStorage.removeItem(frameworkKey(accountId))
    localStorage.removeItem(weightsKey(accountId))
    localStorage.removeItem(criteriaKey(accountId))
    localStorage.removeItem(audienceProfileKey(accountId))
    localStorage.removeItem(predictionHistoryKey(accountId))
    localStorage.removeItem(acctKey('um-analysis', accountId))
    localStorage.removeItem(acctKey('um-dim-history', accountId))
    // 从列表中移除
    const idx = accounts.value.findIndex(a => a.id === accountId)
    if (idx >= 0) accounts.value.splice(idx, 1)
    saveAccounts()
    // 如果删除的是当前账号，切换到第一个
    if (currentAccountId.value === accountId) {
      currentAccountId.value = accounts.value[0]?.id || ''
      saveCurrentAccount()
      scriptRecords.value = loadScripts()
      patternSummary.value = loadPatternSummary()
      writingFramework.value = loadFramework()
      customWeights.value = loadCustomWeights()
      customCriteria.value = loadCustomCriteria()
      audienceProfile.value = loadAudienceProfile()
      lastPrediction.value = null
      predictionHistory.value = loadPredictionHistory()
      lastAnalysisResult.value = loadAnalysisResult()
      dimensionCorrelationHistory.value = loadDimHistory()
      weightValidationResult.value = null
      crossAuditResult.value = null
      crossAuditWeightResult.value = null
      scoringDisagreements.value = []
      predictDisagreements.value = []
      rewriteComparison.value = null
      aiReviewResult.value = null
      isReviewingPrediction.value = false
    }
  }

  /** 重命名账号 */
  function renameAccount(accountId: string, newName: string) {
    const acc = accounts.value.find(a => a.id === accountId)
    if (acc) { acc.name = newName; saveAccounts() }
  }

  const isLoadingAccount = ref(false)

  async function searchAccount(name: string): Promise<void> {
    isLoadingAccount.value = true
    // 如果当前账号名不匹配，更新名称
    const acc = accounts.value.find(a => a.id === currentAccountId.value)
    if (acc && acc.name !== name) renameAccount(acc.id, name)
    await new Promise(r => setTimeout(r, 800))
    platformAccounts.value = [
      { platform: '抖音', accountName: name, followers: 125000, avgViews: 85000, avgLikes: 4200, recentTrend: 'up', topTags: ['文案', '情感', '生活'] },
      { platform: '小红书', accountName: name, followers: 68000, avgViews: 45000, avgLikes: 3200, recentTrend: 'stable', topTags: ['文案', '治愈', '成长'] },
      { platform: '快手', accountName: name, followers: 92000, avgViews: 62000, avgLikes: 2800, recentTrend: 'down', topTags: ['文案', '励志', '情感'] }
    ]
    userProfile.value = { ageGroup: '18-35岁', genderRatio: '女性 62% / 男性 38%', interests: ['情感文案', '治愈系内容', '个人成长', '生活记录'], activeHours: '晚间 20:00-23:00', contentPreference: ['短文案', '图文结合', '故事型内容'] }
    isLoadingAccount.value = false
  }

  // ===== 对话管理（文案分析 Tab） =====
  const messages = ref<UniqueMessage[]>(loadMessages())
  function loadMessages(): UniqueMessage[] { try { const d = localStorage.getItem(MESSAGES_KEY); return d ? JSON.parse(d) : [] } catch { return [] } }
  function saveMessages() { localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.value)) }
  function addMessage(role: 'user' | 'assistant' | 'system', content: string, analysis?: CopywritingAnalysis) {
    const msg: UniqueMessage = { id: generateId('umsg'), role, content, analysis, timestamp: new Date().toLocaleString('zh-CN') }
    messages.value.push(msg); saveMessages(); return msg
  }
  function clearMessages() { messages.value = []; saveMessages() }
  const conversationHistory = computed(() => messages.value.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n'))

  // ===== 文案建议 =====
  const suggestions = ref<CopywritingSuggestion[]>([])
  const isGeneratingSuggestion = ref(false)
  async function generateSuggestions(): Promise<void> {
    isGeneratingSuggestion.value = true; await new Promise(r => setTimeout(r, 1200))
    suggestions.value = [
      { id: 'sug_1', title: '情绪共鸣型开头', content: '你有没有发现，那些真正打动人心的文案，从来不讲道理，只讲感受...', estimatedTraffic: '预计提升 30%-45%', platform: '抖音/小红书', highlight: '情绪切入，高完播率' },
      { id: 'sug_2', title: '悬念反转型文案', content: '我以为我什么都懂了，直到昨天看到这句话...', estimatedTraffic: '预计提升 20%-35%', platform: '抖音/快手', highlight: '强悬念，提升停留时长' }
    ]
    isGeneratingSuggestion.value = false
  }
  const isAnalyzing = ref(false)

  // ==========================================
  // 点赞预测 —— 独立数据区
  // ==========================================

  const isAnalyzingScript = ref(false)

  /** 最新一次评分中的维度分歧（3轮差异>=2级的维度） */
  const scoringDisagreements = ref<ScoringDisagreement[]>([])
  /** 预测时的维度分歧（独立于样本库评分，避免互相覆盖） */
  const predictDisagreements = ref<ScoringDisagreement[]>([])
  const audienceProfile = ref<AudienceProfile | null>(loadAudienceProfile())
  const audienceLoading = ref(false)
  const isPredicting = ref(false)
  const isSummarizing = ref(false)
  const isGeneratingFramework = ref(false)
  const isValidatingWeights = ref(false)
  const weightValidationResult = ref<WeightValidationResult | null>(null)
  const patternSummary = ref<PatternSummary | null>(loadPatternSummary())
  const writingFramework = ref<WritingFramework | null>(loadFramework())
  const lastPrediction = ref<PredictionResult | null>(null)
  const predictionHistory = ref<PredictionLogEntry[]>(loadPredictionHistory())
  const predictSubTab = ref<'sample' | 'entry' | 'patterns' | 'framework' | 'decompose' | 'predict' | 'chat' | 'analysis'>(loadPredictSubTab())
  /** AI 复盘：正在审核预测 */
  const isReviewingPrediction = ref(false)
  /** AI 复盘结果 */
  const aiReviewResult = ref<{ contentId: string; analysis: string; reviewedAt: string } | null>(null)

  function predictionHistoryKey(id?: string) { return acctKey('um-pred-history', id || currentAccountId.value) }
  function loadPredictionHistory(): PredictionLogEntry[] {
    try {
      const d = localStorage.getItem(predictionHistoryKey())
      return d ? JSON.parse(d) : []
    } catch { return [] }
  }
  function savePredictionHistory() {
    localStorage.setItem(predictionHistoryKey(), JSON.stringify(predictionHistory.value))
  }

  /** 删除预测历史中的一条记录 */
  function deletePredictionHistoryEntry(predictionId: string) {
    const idx = predictionHistory.value.findIndex(e => e.id === predictionId)
    if (idx === -1) return
    predictionHistory.value.splice(idx, 1)
    savePredictionHistory()
  }

  /** 从预测历史中加载条目到当前预测视图（用于查看历史详情） */
  function loadHistoryEntry(predictionId: string): { content: string; platform: Platform } | null {
    const entry = predictionHistory.value.find(e => e.id === predictionId)
    if (!entry) return null
    lastPrediction.value = entry.result
    // 更新分歧显示（历史结果中可能保存了）
    predictDisagreements.value = []
    crossAuditResult.value = null
    rewriteComparison.value = null
    return { content: entry.content, platform: entry.platform }
  }

  // ===== 内置样本数据（必须在 scriptRecords 之前定义，避免 TDZ） =====
  const BUILT_IN_SAMPLES: Omit<ScriptRecord, 'id' | 'scores' | 'compositeScore' | 'analysis' | 'createdAt' | 'updatedAt'>[] = [
    { platform: '抖音', content: '18年我在上海金融行业打工，偶然听到梁宁讲产品思维，一下从床上坐起，边听边流泪。她讲人有感官层、身份层、资源层、能力圈、精神内核。一个人为什么喜欢另一个人，IP为什么被追随，本质都在这些层次里。你打动的是对方的哪个层面，决定了关系的深度。', link: '', actualLikes: 238000, tags: ['情感', '个人成长', '心理学'] },
    { platform: '抖音', content: '马斯克传里最让我震撼的一段：2008年SpaceX三次发射失败，特斯拉也濒临破产，他睡在工厂地板上。记者问他："你想过放弃吗？"他说："从来没有。要么死，要么活，没有中间状态。"这种极端思维才是他能成事的原因。', link: '', actualLikes: 211000, tags: ['励志', '商业', '名人'] },
    { platform: '抖音', content: '我花了三年时间，跟踪了100个从月薪3000到年入百万的普通人，发现他们都有一个共同点：从来不问"怎么办"，只问"谁来办"。他们不会把时间花在焦虑上，而是花在找人上。人脉不是认识谁，是被谁需要。', link: '', actualLikes: 185000, tags: ['职场', '赚钱', '认知'] },
    { platform: '抖音', content: '你知道吗？90%的人在做短视频时犯的最大错误不是内容不好，而是前3秒没有让人停下来。我分析了3000条爆款视频，发现它们的开头只有三种模式：要么制造悬念，要么说出痛点，要么抛出一个反常识的结论。', link: '', actualLikes: 156000, tags: ['干货', '短视频', '运营'] },
    { platform: '抖音', content: '昨天和一个做直播的朋友聊天，他一个月赚了47万。我问他秘诀是什么，他说了一句话让我瞬间清醒："我不是在卖产品，我是在卖信任。用户买的不是口红，是"用了这个口红，我也会像你一样好看"的幻觉。"这就是商业的本质。', link: '', actualLikes: 142000, tags: ['商业', '直播', '认知'] },
    { platform: '小红书', content: '30岁以后才明白的10个道理：1. 没有人真正在意你，除了你自己。2. 钱能解决99%的问题，剩下1%需要更多钱。3. 朋友会越来越少，但质量会越来越高。4. 健康是一切的基础。5. 不要试图改变任何人...真正让你成长的，从来不是岁月，是经历。', link: '', actualLikes: 98000, tags: ['成长', '女性', '感悟'] },
    { platform: '小红书', content: '我今年35岁，存款200万，但我依然焦虑。因为我知道这笔钱在通货膨胀面前不堪一击。真正的安全感不是账户余额，而是你随时能赚钱的能力。所以我每天坚持做三件事：学一个新技能，见一个有价值的人，复盘一次决策。', link: '', actualLikes: 87000, tags: ['理财', '成长', '女性力量'] },
    { platform: '小红书', content: '结婚七年，我发现婚姻最可怕的不是吵架，是沉默。当两个人坐在同一张桌子上，各自刷着手机，一个小时说不上一句话的时候，这段关系已经病了。好的婚姻不是两个人有多爱对方，是两个人都在努力经营。', link: '', actualLikes: 92000, tags: ['情感', '婚姻', '女性'] },
    { platform: '小红书', content: '作为一个从农村考上985的女孩，我想说：读书真的可以改命。我爸妈都是农民，家里最值钱的东西是一头牛。但今天，我在北京有房有车，年薪百万。不是因为天赋，是教育给了我台阶。', link: '', actualLikes: 76000, tags: ['励志', '教育', '女性'] },
    { platform: '小红书', content: '你们有没有发现，那些看起来活得很轻松的人，其实背后都很狠。我认识一个博主，每天早上5点起床，拍视频、写文案、回评论，一天工作14个小时。人家在你看不到的地方拿命在拼，你凭什么觉得自己躺平就能成功？', link: '', actualLikes: 65000, tags: ['自律', '女性成长', '励志'] },
    { platform: '视频号', content: '人到中年最大的悲剧是什么？不是没钱，是既没钱又没时间。上有老下有小，房贷车贷压得喘不过气，但你不敢辞职，不敢生病，甚至不敢停下来想一想要什么样的人生。如果你现在30岁左右，我建议你做一件事：开始打造副业。', link: '', actualLikes: 52000, tags: ['中年', '副业', '生活'] },
    { platform: '视频号', content: '今天想和你分享一个改变我命运的习惯：每天睡前写三行日记。一写今天最开心的事，二写今天学到的东西，三写明天最重要的任务。坚持了两年后我发现，我的人生变得前所未有的清晰。因为你在主动设计你的人生，而不是被动应对。', link: '', actualLikes: 48000, tags: ['习惯', '成长', '方法论'] },
    { platform: '视频号', content: '我父亲今年68岁，前几天和我说了一句话让我泪崩。他说："儿子，我这辈子最大的遗憾不是没赚到钱，是没有陪够你们。"在这个快节奏的社会里，赚钱很重要，但请不要忘了，有些东西一旦错过就真的错过了。', link: '', actualLikes: 71000, tags: ['亲情', '人生', '感悟'] },
    { platform: '视频号', content: '为什么你明明很努力了，生活还是没有变好？因为你只是看起来很努力。真正的努力是反人性的——你要做那些你不想做但应该做的事，要停止做那些你想做但不该做的事。努力不是为了感动自己，是为了改变结果。', link: '', actualLikes: 39000, tags: ['认知', '成长', '干货'] },
    { platform: '快手', content: '家人们，今天跟大家说点实在的，想做短视频挣钱的，先把你的脸给我练好了。不是长相，是表达！你对着镜头能说话顺溜吗？能自然地笑吗？能让人看了就想听下去吗？练好了这个，再谈什么内容、选题、剪辑。', link: '', actualLikes: 43000, tags: ['短视频', '赚钱', '实操'] },
    { platform: '快手', content: '干了八年销售，我才明白一个道理：客户买的不是你产品有多好，是你说的话他听进去了。你掰扯参数、讲功能、比价格，他一个字听不进去都没用。先让他信任你这个人，让他觉得你是在为他着想，这才是成交的第一步。', link: '', actualLikes: 38000, tags: ['销售', '沟通', '经验'] },
    { platform: '快手', content: '别跟我说什么大道理，我就是一个普通打工的。我告诉你我是怎么从一个月3000变成现在月入两万的：第一，我学了一个值钱的技能（剪辑）；第二，我用这个技能去接单；第三，我把接单赚的钱再投到学习上。就这么简单，没什么玄乎的。', link: '', actualLikes: 56000, tags: ['励志', '技能', '赚钱'] },
    { platform: '快手', content: '很多人问我怎么保持每天能量满满。我的秘诀就四个字：远离烂人。那些整天抱怨、传播负能量、见不得你好的人，果断拉黑。你身边的五个人决定了你的能量水平，跟什么人在一起，你就成为什么人。', link: '', actualLikes: 29000, tags: ['心态', '成长', '正能量'] },
    { platform: '抖音', content: '你信不信，一个人的表达能力直接决定了他的收入上限。我观察了公司里最赚钱的五个人，没有一个是不善言辞的。他们不一定是最聪明的，但一定是最会用语言把复杂问题讲清楚的人。所以投资表达能力，是回报率最高的一笔投资。', link: '', actualLikes: 22000, tags: ['职场', '沟通', '认知'] },
    { platform: '抖音', content: '今天我们要出去逛街，买点东西，然后晚上去吃饭，最近天气很好，大家心情也不错。希望今天能买到喜欢的衣服，晚上吃的餐厅听说评价不错。对了，你们有没有什么推荐的餐厅啊？可以在评论区分享一下。', link: '', actualLikes: 1200, tags: ['日常', '生活'] }
  ]

  function initBuiltInSamples(): ScriptRecord[] {
    const now = new Date().toLocaleString('zh-CN')
    return BUILT_IN_SAMPLES.map((item, i) => ({
      ...item,
      id: 'builtin_' + i,
      scores: defaultScores(),
      compositeScore: 0,
      analysis: '',
      createdAt: now,
      updatedAt: now
    }))
  }

  function loadScripts(): ScriptRecord[] {
    try {
      const d = localStorage.getItem(scriptsKey(currentAccountId.value))
      if (d) {
        const parsed = JSON.parse(d)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // v2.0 迁移：清除旧的内置 mock 数据（id 以 builtin_ 开头）
          if (parsed.every((r: any) => String(r.id).startsWith('builtin_'))) {
            localStorage.removeItem(scriptsKey(currentAccountId.value))
            localStorage.removeItem(patternKey(currentAccountId.value))
            localStorage.removeItem(frameworkKey(currentAccountId.value))
            return []
          }
          // 兼容旧数据：确保每条记录都有 scores / compositeScore 字段
          let hasOldScores = false
          const fixed = parsed.map((r: any) => {
            // v3.0 迁移：9维 → 7维
            if (r.scores && isOldFormat(r.scores)) {
              hasOldScores = true
              return {
                ...r,
                scores: migrateScores(r.scores),
                _needsRescore: true,
                compositeScore: r.compositeScore || 0
              }
            }
            return {
              ...r,
              scores: r.scores || defaultScores(),
              compositeScore: r.compositeScore || 0,
              analysis: r.analysis || '',
              platform: r.platform || '抖音',
              tags: r.tags || [],
              link: r.link || '',
              createdAt: r.createdAt || new Date().toLocaleString('zh-CN'),
              updatedAt: r.updatedAt || new Date().toLocaleString('zh-CN')
            }
          })
          localStorage.setItem(scriptsKey(currentAccountId.value), JSON.stringify(fixed))
          // 后台自动重评分迁移数据（延迟 3 秒，避免阻塞启动）
          if (hasOldScores) {
            setTimeout(() => {
              const needsRescore = scriptRecords.value.filter((r: any) => r._needsRescore)
              if (needsRescore.length > 0) {
                console.log(`[migration] 发现 ${needsRescore.length} 条旧格式数据，开始后台重评分...`)
                needsRescore.reduce((chain, r: any) =>
                  chain.then(() => reAnalyzeScript(r.id).catch(() => {}))
                , Promise.resolve())
              }
            }, 3000)
          }
          return fixed
        }
      }
    } catch { /* localStorage 不可用 */ }
    // 空库启动，不自动加载内置样本
    return []
  }
  function saveScripts() {
    try {
      const key = scriptsKey(currentAccountId.value)
      const json = JSON.stringify(scriptRecords.value)
      localStorage.setItem(key, json)
    } catch (e: any) {
      console.error('[saveScripts] 写入失败', e)
      ElMessage.error('保存样本库失败：' + (e.message || '存储空间不足'))
    }
  }

  // scriptRecords 必须在 BUILT_IN_SAMPLES / loadScripts / saveScripts 之后初始化
  const scriptRecords = ref<ScriptRecord[]>(loadScripts())

  function loadPatternSummary(): PatternSummary | null {
    try { const d = localStorage.getItem(patternKey(currentAccountId.value)); return d ? JSON.parse(d) : null } catch { return null }
  }
  function savePatternSummary() { if (patternSummary.value) localStorage.setItem(patternKey(currentAccountId.value), JSON.stringify(patternSummary.value)) }

  /** 从 localStorage 重新加载规律总结（用于 KeepAlive 切换回来时恢复） */
  function reloadPatternSummary() {
    if (!patternSummary.value) {
      const cached = loadPatternSummary()
      if (cached) patternSummary.value = cached
    }
  }

  function loadFramework(): WritingFramework | null {
    try { const d = localStorage.getItem(frameworkKey(currentAccountId.value)); return d ? JSON.parse(d) : null } catch { return null }
  }
  function saveFramework() { if (writingFramework.value) localStorage.setItem(frameworkKey(currentAccountId.value), JSON.stringify(writingFramework.value)) }

  /** 从 localStorage 重新加载写作框架 */
  function reloadFramework() {
    if (!writingFramework.value) {
      const cached = loadFramework()
      if (cached) writingFramework.value = cached
    }
  }

  // 自定义评分权重（per-account）
  /** 旧权重键 → 新权重键映射（9维→7维迁移） */
  const OLD_WEIGHT_KEY_MAP: Record<string, string> = {
    openingHook: 'hook',
    characterScene: 'empathy',
    audienceEngagement: 'empathy',
    viewpointCompression: 'density',
    structureClarity: 'structure',
    contentScarcity: 'originality',
    accountMatch: 'socialResonance',
    emotionalPeak: 'polish'
    // lowLikeRisk 删除
  }

  function loadCustomWeights(): Record<string, number> {
    try {
      const d = localStorage.getItem(weightsKey(currentAccountId.value))
      if (!d) return {}
      const parsed = JSON.parse(d)
      // v3.0 迁移：检测旧9维键 → 转换为7维新键
      const oldKeys = Object.keys(OLD_WEIGHT_KEY_MAP)
      const hasOldKeys = Object.keys(parsed).some(k => oldKeys.includes(k) || k === 'lowLikeRisk')
      if (hasOldKeys) {
        const migrated: Record<string, number> = {}
        const empathyVals: number[] = []
        for (const [oldKey, newKey] of Object.entries(OLD_WEIGHT_KEY_MAP)) {
          if (parsed[oldKey] !== undefined) {
            if (newKey === 'empathy') {
              empathyVals.push(parsed[oldKey])
            } else if (!migrated[newKey]) {
              migrated[newKey] = parsed[oldKey]
            }
          }
        }
        if (empathyVals.length > 0) {
          migrated.empathy = Math.round(empathyVals.reduce((a, b) => a + b, 0) / empathyVals.length)
        }
        // 补全缺失的新键默认值
        for (const d of SCORING_DIMENSION_CONFIG) {
          if (!(d.key in migrated)) migrated[d.key] = getDefaultWeight(d.key)
        }
        localStorage.setItem(weightsKey(currentAccountId.value), JSON.stringify(migrated))
        return migrated
      }
      return parsed
    } catch { return {} }
  }
  function getDefaultWeight(key: string): number {
    const defaults: Record<string, number> = { hook: 18, empathy: 14, density: 16, structure: 14, originality: 16, socialResonance: 12, polish: 10 }
    return defaults[key] ?? 0
  }
  function saveCustomWeights() { localStorage.setItem(weightsKey(currentAccountId.value), JSON.stringify(customWeights.value)) }

  const customWeights = ref<Record<string, number>>(loadCustomWeights())

  // 权重变更日志
  const weightChangeLog = ref<WeightChangeLogEntry[]>(loadWeightChangeLog())
  function loadWeightChangeLog(): WeightChangeLogEntry[] {
    try {
      const d = localStorage.getItem(acctKey('um-wlog', currentAccountId.value))
      if (!d) return []
      const raw: WeightChangeLogEntry[] = JSON.parse(d)
      // 自动清理无实际变化的残留记录
      const cleaned = raw.filter(e => {
        const o = e.oldWeights || {}
        const n = e.newWeights || {}
        const allKeys = [...new Set([...Object.keys(o), ...Object.keys(n)])]
        return allKeys.some(k => (o[k] ?? 0) !== (n[k] ?? 0))
      })
      if (cleaned.length < raw.length) {
        localStorage.setItem(acctKey('um-wlog', currentAccountId.value), JSON.stringify(cleaned))
      }
      return cleaned
    } catch { return [] }
  }
  function saveWeightChangeLog() { localStorage.setItem(acctKey('um-wlog', currentAccountId.value), JSON.stringify(weightChangeLog.value)) }

  function getCurrentEffectiveWeights(): Record<string, number> {
    if (Object.keys(customWeights.value).length > 0) return { ...customWeights.value }
    return { hook: 18, empathy: 14, density: 16, structure: 14, originality: 16, socialResonance: 12, polish: 10 }
  }

  function updateCustomWeights(weights: Record<string, number>, trigger: 'manual' | 'bump' | 'reset' = 'manual', note?: string) {
    const old = getCurrentEffectiveWeights()
    // 检查是否有实际变化
    const allKeys = [...new Set([...Object.keys(old), ...Object.keys(weights)])]
    const hasChange = allKeys.some(k => (old[k] ?? 0) !== (weights[k] ?? 0))
    if (!hasChange) return  // 无变化，不记录
    customWeights.value = { ...weights }
    saveCustomWeights()
    // 记录变更
    weightChangeLog.value.unshift({
      id: generateId('wlog'),
      timestamp: new Date().toLocaleString('zh-CN'),
      oldWeights: old,
      newWeights: { ...weights },
      trigger,
      note: note || (trigger === 'bump' ? 'AI Bump 建议' : trigger === 'reset' ? '恢复默认' : '手动调整')
    })
    saveWeightChangeLog()
    // 全量重算历史样本的复合分（纯本地计算，不影响维度分）
    let updated = 0
    for (const r of scriptRecords.value) {
      if (r.scores) {
        const newComposite = calcCompositeScore(r.scores, weights)
        if (newComposite !== r.compositeScore) {
          r.compositeScore = newComposite
          updated++
        }
      }
    }
    if (updated > 0) {
      saveScripts()
      console.log(`[weights] 已用新权重重算 ${updated}/${scriptRecords.value.length} 条样本的复合分`)
    }
  }

  function resetCustomWeights() {
    const old = getCurrentEffectiveWeights()
    const defaults = { hook: 18, empathy: 14, density: 16, structure: 14, originality: 16, socialResonance: 12, polish: 10 }
    // 检查是否有实际变化
    const allKeys = [...new Set([...Object.keys(old), ...Object.keys(defaults)])]
    const hasChange = allKeys.some(k => (old[k] ?? 0) !== (defaults[k] ?? 0))
    if (!hasChange) return
    customWeights.value = {}
    localStorage.removeItem(weightsKey(currentAccountId.value))
    weightChangeLog.value.unshift({
      id: generateId('wlog'),
      timestamp: new Date().toLocaleString('zh-CN'),
      oldWeights: old,
      newWeights: defaults,
      trigger: 'reset',
      note: '恢复默认权重'
    })
    saveWeightChangeLog()
    // 全量重算历史复合分（恢复到默认权重）
    let updated = 0
    for (const r of scriptRecords.value) {
      if (r.scores) {
        const newComposite = calcCompositeScore(r.scores)
        if (newComposite !== r.compositeScore) {
          r.compositeScore = newComposite
          updated++
        }
      }
    }
    if (updated > 0) {
      saveScripts()
      console.log(`[weights:reset] 已用默认权重重算 ${updated} 条样本的复合分`)
    }
  }

  // 自定义判断标准（per-account）
  function loadCustomCriteria(): Record<string, string> {
    try {
      const d = localStorage.getItem(criteriaKey(currentAccountId.value))
      if (!d) return {}
      const parsed = JSON.parse(d)
      // v3.0 迁移：检测旧9维键 → 转换为7维新键（使用同一映射表）
      const oldKeys = Object.keys(OLD_WEIGHT_KEY_MAP)
      const hasOldKeys = Object.keys(parsed).some(k => oldKeys.includes(k) || k === 'lowLikeRisk')
      if (hasOldKeys) {
        const migrated: Record<string, string> = {}
        for (const [oldKey, newKey] of Object.entries(OLD_WEIGHT_KEY_MAP)) {
          if (parsed[oldKey] && !migrated[newKey]) {
            migrated[newKey] = parsed[oldKey]
          }
        }
        localStorage.setItem(criteriaKey(currentAccountId.value), JSON.stringify(migrated))
        return migrated
      }
      return parsed
    } catch { return {} }
  }
  function saveCustomCriteria() { localStorage.setItem(criteriaKey(currentAccountId.value), JSON.stringify(customCriteria.value)) }

  const customCriteria = ref<Record<string, string>>(loadCustomCriteria())

  function updateCustomCriteria(criteria: Record<string, string>) {
    customCriteria.value = { ...criteria }
    saveCustomCriteria()
  }

  function resetCustomCriteria() {
    customCriteria.value = {}
    localStorage.removeItem(criteriaKey(currentAccountId.value))
  }

  // 受众画像（per-account）
  function loadAudienceProfile(): AudienceProfile | null {
    try {
      const d = localStorage.getItem(audienceProfileKey(currentAccountId.value))
      return d ? JSON.parse(d) : null
    } catch { return null }
  }
  function saveAudienceProfile() {
    if (audienceProfile.value) {
      localStorage.setItem(audienceProfileKey(currentAccountId.value), JSON.stringify(audienceProfile.value))
    } else {
      localStorage.removeItem(audienceProfileKey(currentAccountId.value))
    }
  }

  function loadPredictSubTab(): 'sample' | 'analysis' | 'entry' | 'patterns' | 'framework' | 'predict' | 'chat' {
    try { const v = localStorage.getItem(PREDICT_TAB_KEY); return (v as any) || 'predict' } catch { return 'predict' }
  }
  function switchPredictSubTab(tab: 'sample' | 'entry' | 'patterns' | 'framework' | 'decompose' | 'predict' | 'chat' | 'analysis') {
    predictSubTab.value = tab; localStorage.setItem(PREDICT_TAB_KEY, tab)
  }

  // ===== 导入 / 导出 / 恢复 =====

  function exportJSON(): string {
    const data = {
      exportTime: new Date().toISOString(),
      version: '2.0',
      scripts: scriptRecords.value,
      patternSummary: patternSummary.value,
      writingFramework: writingFramework.value,
      customWeights: customWeights.value,
      customCriteria: customCriteria.value,
      audienceProfile: audienceProfile.value
    }
    return JSON.stringify(data, null, 2)
  }

  function downloadJSON() {
    const json = exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `copywriting-samples-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('数据已导出')
  }

  function importJSON(jsonStr: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(jsonStr)
      if (!data.scripts || !Array.isArray(data.scripts)) {
        return { success: false, message: '无效的数据格式：缺少 scripts 数组' }
      }
      const imported = data.scripts as ScriptRecord[]
      // 给导入的数据生成新ID，避免冲突
      const now = new Date().toLocaleString('zh-CN')
      const fixed = imported.map(r => ({
        ...r,
        id: generateId('script'),
        createdAt: r.createdAt || now,
        updatedAt: r.updatedAt || now,
        scores: r.scores || defaultScores(),
        compositeScore: r.compositeScore || 0
      }))
      scriptRecords.value = [...fixed, ...scriptRecords.value]
      saveScripts()
      if (data.patternSummary) { patternSummary.value = data.patternSummary; savePatternSummary() }
      if (data.writingFramework) { writingFramework.value = data.writingFramework; saveFramework() }
      if (data.customWeights) { customWeights.value = data.customWeights; saveCustomWeights() }
      if (data.customCriteria) { customCriteria.value = data.customCriteria; saveCustomCriteria() }
      if (data.audienceProfile) { audienceProfile.value = data.audienceProfile; saveAudienceProfile() }
      return { success: true, message: `成功导入 ${fixed.length} 条样本` }
    } catch (e: any) {
      return { success: false, message: 'JSON 解析失败: ' + (e.message || '未知错误') }
    }
  }

  function resetToBuiltIn() {
    const builtIn = initBuiltInSamples()
    scriptRecords.value = builtIn
    patternSummary.value = null
    writingFramework.value = null
    lastPrediction.value = null
    saveScripts()
    localStorage.removeItem(patternKey(currentAccountId.value))
    localStorage.removeItem(frameworkKey(currentAccountId.value))
    localStorage.removeItem(weightsKey(currentAccountId.value))
    customWeights.value = {}
    localStorage.removeItem(criteriaKey(currentAccountId.value))
    customCriteria.value = {}
  }

  function scriptsByPlatform(platform: Platform): ScriptRecord[] { return scriptRecords.value.filter(s => s.platform === platform) }

  const sortedScripts = computed(() => [...scriptRecords.value].sort((a, b) => b.actualLikes - a.actualLikes))

  /** 按各平台高赞阈值过滤后的样本（仅显示达标样本） */
  const thresholdFilteredScripts = computed(() => {
    const thresholds = highLikeThresholds.value
    return sortedScripts.value.filter(r => r.actualLikes >= (thresholds[r.platform] ?? 500))
  })

  const platformStats = computed(() => {
    const stats: Record<string, { count: number; avgLikes: number; totalLikes: number }> = {}
    for (const platform of Object.keys(PLATFORM_CONFIG) as Platform[]) {
      const records = scriptsByPlatform(platform)
      const totalLikes = records.reduce((sum, r) => sum + r.actualLikes, 0)
      stats[platform] = { count: records.length, totalLikes, avgLikes: records.length > 0 ? Math.round(totalLikes / records.length) : 0 }
    }
    return stats
  })

  /** 复盘待办数：预测超过 3 天但未录入实际点赞量 */
  const pendingReviewCount = computed(() => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    return predictionHistory.value.filter(e => {
      if (e.actualLikes !== undefined) return false
      try {
        const d = new Date(e.predictedAt)
        return !isNaN(d.getTime()) && d < threeDaysAgo
      } catch { return false }
    }).length
  })

  /** 偏差趋势：最近 N 条已复盘记录的偏差统计 + 桶命中率 */
  const deviationTrend = computed(() => {
    const reviewed = predictionHistory.value
      .filter(e => e.deviation !== undefined && e.deviation !== null && e.actualLikes != null)
      .slice(0, 10)
    if (reviewed.length < 3) return null

    const deviations = reviewed.map(e => e.deviation!)
    const avgDev = Math.round(deviations.reduce((s, d) => s + d, 0) / deviations.length)
    const overCount = deviations.filter(d => d < -20).length
    const underCount = deviations.filter(d => d > 20).length
    const total = deviations.length

    // 桶命中率：实绩落在预测时标为 headline 的桶中
    const buckets = deriveBuckets(scriptRecords.value)
    let headlineHit = 0
    let adjacentHit = 0
    for (const e of reviewed) {
      const probs = e.result.bucketProbabilities
      if (!probs || probs.length === 0) continue
      const headline = probs.find(p => p.isHeadline)
      if (!headline) continue
      // 找 headline 桶对应的边界
      const hb = buckets.find(b => b.label === headline.label)
      if (!hb) continue
      const actual = e.actualLikes!
      if (actual >= hb.min && actual <= hb.max) {
        headlineHit++
      } else {
        // 检查是否落在相邻桶
        const hIdx = buckets.indexOf(hb)
        const adjBuckets = [buckets[hIdx - 1], buckets[hIdx + 1]].filter(Boolean)
        if (adjBuckets.some(b => actual >= b.min && actual <= b.max)) {
          adjacentHit++
        }
      }
    }
    const hasProbs = reviewed.filter(e => e.result.bucketProbabilities?.some(p => p.isHeadline)).length
    const headlineHitRate = hasProbs > 0 ? Math.round(headlineHit / hasProbs * 100) : null
    const adjacentHitRate = hasProbs > 0 ? Math.round(adjacentHit / hasProbs * 100) : null
    const missRate = hasProbs > 0 ? 100 - (headlineHit + adjacentHit) / hasProbs * 100 : null

    let trend: 'over' | 'under' | 'balanced' = 'balanced'
    let advice = ''
    let needsBump = false
    if (missRate !== null && missRate > 50) {
      trend = 'balanced'
      advice = `⚠️ 近 ${hasProbs} 次有概率分布的复盘，主预测桶命中率仅 ${headlineHitRate}%，${missRate}% 完全脱靶。预测严重失准，建议立即触发 Bump 升级公式。`
      needsBump = true
    } else if (overCount > total * 0.6) {
      trend = 'over'
      advice = `近 ${total} 次复盘有 ${overCount} 次高估（预测偏乐观），主桶命中率 ${headlineHitRate}%。建议去「模型规律」验证权重。`
      needsBump = headlineHitRate !== null && headlineHitRate < 40
    } else if (underCount > total * 0.6) {
      trend = 'under'
      advice = `近 ${total} 次复盘有 ${underCount} 次低估（预测偏保守），主桶命中率 ${headlineHitRate}%。建议去「模型规律」验证权重。`
      needsBump = headlineHitRate !== null && headlineHitRate < 40
    }

    return { avgDev, overCount, underCount, total, trend, advice, needsBump, headlineHitRate, adjacentHitRate, missRate }
  })

  /** 进化看板：样本增长、准确率趋势、权重演进 */
  const evolutionMetrics = computed<EvolutionMetrics>(() => {
    const totalScripts = scriptRecords.value.length
    const totalPredictions = predictionHistory.value.length
    const reviewed = predictionHistory.value.filter(e => e.actualLikes != null)
    const totalRetros = reviewed.length

    // 主桶命中率
    const buckets = deriveBuckets(scriptRecords.value)
    let overallHit = 0
    let earlyHit = 0
    let recentHit = 0
    const withProbs = reviewed.filter(e => e.result.bucketProbabilities?.length)
    const sorted = [...withProbs].sort((a, b) => new Date(a.retroAt || a.predictedAt).getTime() - new Date(b.retroAt || b.predictedAt).getTime())

    const checkHit = (e: PredictionLogEntry) => {
      const headline = e.result.bucketProbabilities?.find(p => p.isHeadline)
      if (!headline || e.actualLikes == null) return false
      const hb = buckets.find(b => b.label === headline.label)
      return hb ? e.actualLikes >= hb.min && e.actualLikes <= hb.max : false
    }

    overallHit = sorted.filter(checkHit).length
    const overallHitRate = sorted.length > 0 ? Math.round(overallHit / sorted.length * 100) : null
    const earlySlice = sorted.slice(0, Math.min(5, sorted.length))
    earlyHit = earlySlice.filter(checkHit).length
    const earlyHitRate = earlySlice.length > 0 ? Math.round(earlyHit / earlySlice.length * 100) : null
    const recentSlice = sorted.slice(-Math.min(5, sorted.length))
    recentHit = recentSlice.filter(checkHit).length
    const recentHitRate = recentSlice.length > 0 ? Math.round(recentHit / recentSlice.length * 100) : null

    const weightChanges = weightChangeLog.value.length
    const lastWeightChangeAt = weightChangeLog.value[0]?.timestamp ?? null

    // 趋势描述
    let trendDescription = '暂无足够复盘数据'
    if (earlyHitRate !== null && recentHitRate !== null && sorted.length >= 4) {
      const diff = recentHitRate - earlyHitRate
      if (diff >= 10) trendDescription = `命中率从早期 ${earlyHitRate}% → 近期 ${recentHitRate}%，提升 ${diff} 个百分点 ✅ 系统在进化`
      else if (diff >= 3) trendDescription = `命中率从早期 ${earlyHitRate}% → 近期 ${recentHitRate}%，小幅提升 📈`
      else if (diff >= -3) trendDescription = `命中率从早期 ${earlyHitRate}% → 近期 ${recentHitRate}%，基本持平`
      else trendDescription = `命中率从早期 ${earlyHitRate}% → 近期 ${recentHitRate}%，下降 ${Math.abs(diff)} 个百分点 ⚠️ 需校准`
    }

    // 样本里程碑
    const tier = totalScripts < 10 ? '起步 (样本<10，预测仅作参考)' :
      totalScripts < 30 ? '成长 (样本10-30，预测开始稳定)' :
      totalScripts < 60 ? '成熟 (样本30-60，预测可信度较高)' :
      '丰富 (样本60+，预测精度持续优化)'
    const sampleMilestone = `${totalScripts} 条 | ${tier}`

    return {
      totalScripts, totalPredictions, totalRetros,
      weightChanges, lastWeightChangeAt,
      overallHitRate, earlyHitRate, recentHitRate,
      trendDescription, sampleMilestone
    }
  })

  // ===== Bump 自动建议 =====

  /** Bump 建议（AI 分析后的权重调整方案） */
  const bumpSuggestion = ref<{
    weights: Record<string, number>
    reasoning: string[]
    generatedAt: string
    _retry?: boolean
  } | null>(null)

  const isGeneratingBump = ref(false)

  /** 生成 Bump 建议：AI 分析复盘偏差，推荐权重调整 */
  async function generateBumpSuggestion() {
    const trend = deviationTrend.value
    if (!trend) return

    const reviewed = predictionHistory.value
      .filter(e => e.deviation !== undefined && e.deviation !== null && e.actualLikes != null)
      .slice(0, 10)

    isGeneratingBump.value = true
    try {
      // 整理复盘数据供 AI 分析
      const samples = reviewed.map((e, i) => {
        const scores = e.result.scores
        const dimLines = SCORING_DIMENSION_CONFIG.map(d =>
          `  ${d.label}: ${scores[d.key]}`
        ).join('\n')
        const probs = e.result.bucketProbabilities
        const hlBucket = probs?.find(p => p.isHeadline)?.label || '无'
        return [
          `【复盘${i + 1}】${e.platform}`,
          `内容：${e.content.slice(0, 60)}`,
          `预估：${e.result.minLikes.toLocaleString()}~${e.result.maxLikes.toLocaleString()}（主桶：${hlBucket}）`,
          `实际：${e.actualLikes!.toLocaleString()}赞`,
          `偏差：${e.deviation}%`,
          `7维评分：`,
          dimLines
        ].join('\n')
      }).join('\n\n')

      // 当前权重
      const DEFAULT: Record<string, number> = { hook: 18, empathy: 14, density: 16, structure: 14, originality: 16, socialResonance: 12, polish: 10 }
      const effective = Object.keys(customWeights.value).length > 0 ? customWeights.value : DEFAULT
      const weightLines = SCORING_DIMENSION_CONFIG.map(d => `  ${d.label}: ${effective[d.key] || 0}%`).join('\n')

      const prompt = `你是短视频评分公式优化专家。以下是最近 ${reviewed.length} 次预测复盘数据，请分析偏差规律，建议具体权重调整。

## 复盘数据
${samples}

## 整体统计
- 平均偏差：${trend.avgDev}%
- 高估次数（预测>实际）：${trend.overCount}
- 低估次数（预测<实际）：${trend.underCount}
- 主桶命中率：${trend.headlineHitRate ?? '无数据'}%
- 脱靶率：${trend.missRate ?? '无数据'}%

## 当前权重
${weightLines}

## 任务
分析偏差模式，给出具体的权重调整建议。你必须输出以下格式：

### 分析
（2-3句话分析偏差模式，说明哪些维度可能权重失调）

### 建议权重
\`\`\`
hook: XX
empathy: XX
density: XX
structure: XX
originality: XX
socialResonance: XX
polish: XX
\`\`\`
（所有权重加起来必须是100）

### 调整理由
- 逐条说明每个变动维度的调整理由`

      const reply = await callAI(
        '你是短视频评分公式优化专家。基于复盘数据给出精确的权重调整建议。',
        prompt
      )

      // 解析 AI 回复
      const analysisSection = extractSection(reply, '分析')
      const weightBlock = (reply.match(/```\s*([\s\S]*?)\s*```/)?.[1] || '').trim()
      const reasonsSection = extractSection(reply, '调整理由')

      const suggestedWeights: Record<string, number> = { ...effective }
      if (weightBlock) {
        const keyMap: Record<string, string> = {
          'hook': 'hook', 'empathy': 'empathy', 'density': 'density',
          'structure': 'structure', 'originality': 'originality',
          'socialResonance': 'socialResonance', 'polish': 'polish'
        }
        for (const line of weightBlock.split('\n')) {
          const parts = line.split(':').map(s => s.trim())
          if (parts.length === 2) {
            const mappedKey = keyMap[parts[0]]
            if (mappedKey) {
              const val = parseInt(parts[1], 10)
              if (!isNaN(val)) suggestedWeights[mappedKey] = val
            }
          }
        }
      }

      // 验证权重：必须覆盖全部7个维度且总和≈100
      const allKeys = SCORING_DIMENSION_CONFIG.map(d => d.key)
      const hasAllKeys = allKeys.every(k => suggestedWeights[k] !== undefined)
      const weightSum = allKeys.reduce((s, k) => s + (suggestedWeights[k] || 0), 0)
      if (!hasAllKeys || Math.abs(weightSum - 100) > 5) {
        ElMessage.warning(`AI 建议权重${!hasAllKeys ? '缺少维度' : `总和=${weightSum}，偏离100`}，已忽略`)
        isGeneratingBump.value = false
        return
      }

      bumpSuggestion.value = {
        weights: suggestedWeights,
        reasoning: [
          analysisSection,
          ...(reasonsSection ? reasonsSection.split('\n').filter(l => l.trim().startsWith('-')) : [])
        ].filter(Boolean),
        generatedAt: new Date().toLocaleString('zh-CN')
      }
    } catch (e: any) {
      ElMessage.error('Bump 建议生成失败：' + (e.message || '未知错误'))
    } finally {
      isGeneratingBump.value = false
    }
  }

  /** 本地审核：验证新权重在样本池中的排序一致性 */

  function validateWeightProposal(newWeights: Record<string, number>): WeightValidationResult {
    const oldWeights = getCurrentEffectiveWeights()
    // 验证池：有评分+有实际点赞的样本，按点赞量排序，取最多 10 条
    const pool = [...scriptRecords.value]
      .filter(r => r.scores && r.actualLikes > 0 && !(r as any)._needsRescore)
      .sort((a, b) => b.actualLikes - a.actualLikes)
    const empty: WeightValidationResult = {
      passed: false, oldCorrect: 0, newCorrect: 0, totalPairs: 0, oldRate: 0, newRate: 0,
      pairs: [], recommendation: '验证失败：样本不足（需至少 3 条有评分的复盘样本）',
      verdict: 'FAIL', oldRankCorrelation: 0, newRankCorrelation: 0,
      oldPairwiseAccuracy: 0, newPairwiseAccuracy: 0, weightDiffs: [], sampleCount: 0, sampleDetails: []
    }
    if (pool.length < 3) {
      weightValidationResult.value = empty
      return empty
    }
    const sample = pool.slice(0, 10)
    // 计算新旧权重在每对上的排序一致性
    const pairs: WeightValidationResult['pairs'] = []
    let oldCorrect = 0, newCorrect = 0
    for (let i = 0; i < sample.length - 1; i++) {
      const a = sample[i]
      const b = sample[i + 1]
      const aOld = calcCompositeScore(a.scores!, oldWeights)
      const bOld = calcCompositeScore(b.scores!, oldWeights)
      const aNew = calcCompositeScore(a.scores!, newWeights)
      const bNew = calcCompositeScore(b.scores!, newWeights)
      const oldOk = aOld >= bOld
      const newOk = aNew >= bNew
      if (oldOk) oldCorrect++
      if (newOk) newCorrect++
      pairs.push({ aOld: Math.round(aOld), aNew: Math.round(aNew), bOld: Math.round(bOld), bNew: Math.round(bNew), aLikes: a.actualLikes, bLikes: b.actualLikes, oldOk, newOk })
    }
    const totalPairs = pairs.length
    const oldRate = totalPairs > 0 ? oldCorrect / totalPairs : 0
    const newRate = totalPairs > 0 ? newCorrect / totalPairs : 0
    const passed = newRate >= 0.8 && newRate >= oldRate
    const recommendation = passed
      ? `审核通过：新权重在 ${totalPairs} 对样本中正确率 ${Math.round(newRate * 100)}%（旧 ${Math.round(oldRate * 100)}%），建议应用`
      : newRate < 0.8
        ? `审核未通过：新权重正确率仅 ${Math.round(newRate * 100)}%，未达 80% 门槛。建议收集更多数据后再试`
        : `审核未通过：新权重正确率 ${Math.round(newRate * 100)}% 低于旧权重 ${Math.round(oldRate * 100)}%，建议保留旧权重`

    // Spearman 秩相关（旧/新权重复合分 vs 实际点赞）
    function spearmanR(scores: number[], likes: number[]): number {
      const n = scores.length
      if (n < 2) return 0
      const rank = (arr: number[]) => {
        const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
        const r = new Array(n)
        for (let i = 0; i < n; i++) r[indexed[i].i] = i + 1
        return r
      }
      const sr = rank(scores)
      const lr = rank(likes)
      let d2 = 0
      for (let i = 0; i < n; i++) d2 += (sr[i] - lr[i]) ** 2
      return 1 - (6 * d2) / (n * (n * n - 1))
    }
    const sampleScores = sample.map(s => calcCompositeScore(s.scores!, oldWeights))
    const sampleLikes = sample.map(s => s.actualLikes)
    const newSampleScores = sample.map(s => calcCompositeScore(s.scores!, newWeights))
    const oldRankR = Math.round(spearmanR(sampleScores, sampleLikes) * 100)
    const newRankR = Math.round(spearmanR(newSampleScores, sampleLikes) * 100)

    // 权重变更明细
    const allKeys = new Set([...Object.keys(oldWeights), ...Object.keys(newWeights)])
    const weightDiffs: WeightValidationResult['weightDiffs'] = []
    for (const key of allKeys) {
      const config = SCORING_DIMENSION_CONFIG.find(d => d.key === key)
      const label = config?.label || key
      const old = oldWeights[key] || 0
      const nw = newWeights[key] || 0
      weightDiffs.push({ key, label, old, new: nw, diff: nw - old })
    }
    weightDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

    // 验证池样本摘要
    const sampleDetails = sample.map(s => ({
      id: s.id,
      likes: s.actualLikes,
      oldScore: Math.round(calcCompositeScore(s.scores!, oldWeights)),
      newScore: Math.round(calcCompositeScore(s.scores!, newWeights))
    }))

    const verdict = passed ? 'PASS' : 'FAIL'
    const result: WeightValidationResult = {
      passed, oldCorrect, newCorrect, totalPairs, oldRate, newRate,
      pairs, recommendation, verdict,
      oldRankCorrelation: oldRankR, newRankCorrelation: newRankR,
      oldPairwiseAccuracy: Math.round(oldRate * 100), newPairwiseAccuracy: Math.round(newRate * 100),
      weightDiffs, sampleCount: sample.length, sampleDetails
    }
    weightValidationResult.value = result
    return result
  }

  /** 一键应用 Bump 建议的权重（会先验证） */
  async function applyBumpWeights() {
    if (!bumpSuggestion.value) return

    // 二次点击强制应用（跳过审核）
    if (bumpSuggestion.value._retry) {
      updateCustomWeights(bumpSuggestion.value.weights, 'bump', '强制应用（审核未通过但用户确认）')
      bumpSuggestion.value = null
      ElMessage.success('已强制应用 Bump 建议权重')
      return
    }

    const v = validateWeightProposal(bumpSuggestion.value.weights)
    if (!v.passed) {
      bumpSuggestion.value._retry = true
      ElMessage.warning(v.recommendation + '。确认无误请再次点击「接受并升级公式」强制应用')
      return
    }
    // 跨模型审计：外部 LLM 独立审核
    const cross = await crossAuditWeightUpgrade(bumpSuggestion.value.weights, v)
    if (cross && !cross.passed) {
      bumpSuggestion.value._retry = true
      ElMessage.warning(`⚠️ 跨模型审计未通过：${cross.verdict}。确认无误请再次点击「接受并升级公式」强制应用`)
      return
    }
    const crossNote = cross ? ` | 跨模型审计：${cross.verdict}` : ''
    updateCustomWeights(bumpSuggestion.value.weights, 'bump')
    bumpSuggestion.value = null
    ElMessage.success(`已应用 Bump 建议权重，公式已升级（已记录到进化日志）${crossNote}`)
  }

  /** 忽略 Bump 建议 */
  function dismissBumpSuggestion() {
    bumpSuggestion.value = null
  }

  /** 自动校准开关 */
  const autoCalibrateEnabled = ref(loadAutoCalibrate())
  function loadAutoCalibrate(): boolean {
    try { return localStorage.getItem(acctKey('um-auto-cal', currentAccountId.value)) === '1' } catch { return false }
  }
  function toggleAutoCalibrate() {
    autoCalibrateEnabled.value = !autoCalibrateEnabled.value
    localStorage.setItem(acctKey('um-auto-cal', currentAccountId.value), autoCalibrateEnabled.value ? '1' : '0')
  }

  /** 自动校准：检测到 needsBump 且开关开启时，自动生成并应用 */
  let autoCalibrateThrottle = false
  watch(
    () => deviationTrend.value?.needsBump,
    async (needs) => {
      if (!needs || !autoCalibrateEnabled.value || autoCalibrateThrottle) return
      autoCalibrateThrottle = true
      try {
        await generateBumpSuggestion()
        if (bumpSuggestion.value) {
          const sw = bumpSuggestion.value.weights
          const v = validateWeightProposal(sw)
          if (!v.passed) {
            bumpSuggestion.value = null
            console.log('[autoCalibrate] 跳过：权重提案审核未通过', v.recommendation)
            return
          }
          updateCustomWeights(sw, 'bump', '自动校准：系统检测到预测失准，自动升级公式')
          bumpSuggestion.value = null
          const oldW = getCurrentEffectiveWeights()
          const changed: string[] = []
          for (const k of Object.keys(sw)) {
            const delta = Math.round((sw[k] - (oldW[k] || 0)) * 10) / 10
            if (Math.abs(delta) > 0.1) changed.push(`${dimensionLabel(k)} ${oldW[k] || 0}% → ${sw[k]}% (${delta > 0 ? '+' : ''}${delta})`)
          }
          function dimensionLabel(key: string) {
            const config = SCORING_DIMENSION_CONFIG.find(d => d.key === key)
            return config?.label || key
          }
        }
      } catch {} finally {
        // 冷却10分钟，避免频繁校准
        setTimeout(() => { autoCalibrateThrottle = false }, 10 * 60 * 1000)
      }
    }
  )

  // 自动保存受众画像
  watch(audienceProfile, () => {
    saveAudienceProfile()
    // 画像创建/更新后，后台重评分所有无画像评分的旧样本
    if (audienceProfile.value) {
      const unscored = scriptRecords.value.filter(r => !r.scoredWithProfile && r.scores && Object.values(r.scores).some(v => v > 0))
      if (unscored.length > 0) {
        console.log(`[audience] 画像已配置，发现 ${unscored.length} 条无画像样本，开始后台重评分...`)
        setTimeout(() => {
          unscored.reduce((chain, r) =>
            chain.then(() => reAnalyzeScript(r.id).catch(() => {})
          ), Promise.resolve())
        }, 2000)
      }
    }
  }, { deep: true })

  // ===== 多维数据分析 =====

  const lastAnalysisResult = ref<ContentAnalysisResult | null>(loadAnalysisResult())
  function loadAnalysisResult(): ContentAnalysisResult | null {
    try { const d = localStorage.getItem(acctKey('um-analysis', currentAccountId.value)); return d ? JSON.parse(d) : null } catch { return null }
  }
  function saveAnalysisResult() { if (lastAnalysisResult.value) localStorage.setItem(acctKey('um-analysis', currentAccountId.value), JSON.stringify(lastAnalysisResult.value)) }

  const crossAuditResult = ref<CrossAuditResult | null>(null)
  const crossAuditWeightResult = ref<CrossAuditWeightResult | null>(null)
  const rewriteComparison = ref<RewriteComparison | null>(null)
  const pendingGeneratedContent = ref<string | null>(null)

  /** 计算 Pearson 相关系数 */
  function pearsonR(xs: number[], ys: number[]): number | null {
    const n = xs.length
    if (n < 3) return null
    const mx = xs.reduce((a, b) => a + b, 0) / n
    const my = ys.reduce((a, b) => a + b, 0) / n
    let num = 0, dx = 0, dy = 0
    for (let i = 0; i < n; i++) {
      const xd = xs[i] - mx, yd = ys[i] - my
      num += xd * yd; dx += xd * xd; dy += yd * yd
    }
    if (dx === 0 || dy === 0) return 0
    return Math.round(num / Math.sqrt(dx * dy) * 1000) / 1000
  }

  /** 判定相关系数显著性 */
  function corrSignificance(r: number): 'high' | 'medium' | 'low' {
    const abs = Math.abs(r)
    return abs > 0.5 ? 'high' : abs > 0.25 ? 'medium' : 'low'
  }

  /** 从维度相关系数自动推导最优权重：融合「维度→点赞」直接通路 +「维度→播放→点赞」间接通路 */
  function deriveWeightsFromCorrelations(
    dimLikesCorr: Array<{ key: string; correlation: number }>,
    dimViewsCorr?: Array<{ key: string; correlation: number }>,
    viewsLikesR?: number | null
  ): Record<string, number> {
    const defaults: Record<string, number> = { hook: 18, empathy: 14, density: 16, structure: 14, originality: 16, socialResonance: 12, polish: 10 }

    // 判定播放→点赞通路的强度，决定维度×播放的融合权重
    // viewsLikesR 越大说明播放越能转化为点赞，维度→播放的通路越值得计入
    const viewWeight = (viewsLikesR != null && dimViewsCorr && dimViewsCorr.length)
      ? Math.max(0, Math.min(0.5, Math.abs(viewsLikesR))) // 最多占 50%
      : 0

    // 融合相关系数：直接路径(维度→点赞) + 间接路径(维度→播放→点赞)
    const fused: Array<{ key: string; correlation: number }> = []
    for (const d of dimLikesCorr) {
      let c = d.correlation
      if (viewWeight > 0 && dimViewsCorr) {
        const v = dimViewsCorr.find(vc => vc.key === d.key)
        if (v) {
          c = (1 - viewWeight) * d.correlation + viewWeight * v.correlation
        }
      }
      fused.push({ key: d.key, correlation: c })
    }

    // 取正相关系数（负相关的维度权重极低）
    const positive = fused.filter(d => d.correlation > 0.05)

    if (positive.length === 0) return { ...defaults }

    // 相关系数归一化 → 百分比权重
    const totalR = positive.reduce((s, d) => s + d.correlation, 0)
    const weights: Record<string, number> = {}
    for (const d of SCORING_DIMENSION_CONFIG) {
      const found = positive.find(p => p.key === d.key)
      if (found) {
        weights[d.key] = Math.round((found.correlation / totalR) * 95) // 留 5% 兜底
      } else {
        weights[d.key] = 1 // 弱相关维度给最低权重
      }
    }
    // 保证总和为 100
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    if (sum !== 100) {
      const maxKey = Object.keys(weights).reduce((a, b) => weights[a] > weights[b] ? a : b)
      weights[maxKey] += (100 - sum)
    }
    return weights
  }

  /** 检测样本是否来自多个模型 */
  function detectModelVersion(records: ScriptRecord[]): { modelVersion?: string; mixedModel?: boolean } {
    const versions = records
      .map(r => r.modelVersion)
      .filter((v): v is string => !!v)
    if (versions.length === 0) return {}
    const freq: Record<string, number> = {}
    versions.forEach(v => freq[v] = (freq[v] || 0) + 1)
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])
    return {
      modelVersion: top[0]?.[0],
      mixedModel: top.length > 1
    }
  }

  /** 计算模型无关的本地文本特征（不依赖 AI，可跨模型复用） */
  function computeModelAgnosticFactors(
    records: ScriptRecord[],
    recordsWithViews: ScriptRecord[]
  ): ContentAnalysisResult['modelAgnosticFactors'] {
    // 提取本地特征
    const features: Array<{ key: string; label: string; values: number[] }> = []
    // 文案长度
    features.push({ key: 'charCount', label: '文案字数', values: records.map(r => r.content.length) })
    // 句子数
    features.push({ key: 'sentenceCount', label: '句子数', values: records.map(r => (r.content.match(/[。！？!?]/g) || []).length || 1) })
    // 问句数
    features.push({ key: 'questionCount', label: '问句数', values: records.map(r => (r.content.match(/[？?]/g) || []).length) })
    // 感叹句数
    features.push({ key: 'exclaimCount', label: '感叹句数', values: records.map(r => (r.content.match(/[！!]/g) || []).length) })
    // 首句字数（钩子密度）
    features.push({ key: 'hookLength', label: '首句字数', values: records.map(r => {
      const first = r.content.split(/[。！？!?\n]/)[0] || ''
      return first.length || 1
    }) })
    // 平均句长
    features.push({ key: 'avgSentenceLen', label: '平均句长', values: records.map(r => {
      const chars = r.content.length
      const sentences = (r.content.match(/[。！？!?]/g) || []).length || 1
      return Math.round(chars / sentences)
    }) })

    const likes = records.map(r => r.actualLikes)
    const views = recordsWithViews.length >= 3 ? recordsWithViews.map(r => r.views!) : null

    const factors: ContentAnalysisResult['modelAgnosticFactors'] = []
    for (const f of features) {
      const lr = pearsonR(f.values, likes)
      const vr = views ? pearsonR(
        recordsWithViews.map(r => {
          const sentences = (r.content.match(/[。！？!?]/g) || []).length || 1
          if (f.key === 'charCount') return r.content.length
          if (f.key === 'sentenceCount') return sentences
          if (f.key === 'questionCount') return (r.content.match(/[？?]/g) || []).length
          if (f.key === 'exclaimCount') return (r.content.match(/[！!]/g) || []).length
          if (f.key === 'hookLength') return (r.content.split(/[。！？!?\n]/)[0] || '').length || 1
          if (f.key === 'avgSentenceLen') return Math.round(r.content.length / sentences)
          return 0
        }),
        views
      ) : null
      factors.push({
        factor: f.label,
        likesCorrelation: lr ?? 0,
        viewsCorrelation: vr ?? null,
        significance: corrSignificance(lr ?? 0)
      })
    }
    return factors.sort((a, b) => Math.abs(b.likesCorrelation) - Math.abs(a.likesCorrelation))
  }

  /** 多维关联分析（纯本地计算，不调AI） */
  async function analyzeCorrelations(): Promise<ContentAnalysisResult | null> {
    const records = scriptRecords.value.filter(r => r.scores && r.compositeScore > 0)
    if (records.length < 3) { ElMessage.warning('需要至少 3 条已打分样本'); return null }

    const likes = records.map(r => r.actualLikes)
    const scores = records.map(r => r.compositeScore)
    const lengths = records.map(r => r.content.length)
    const viewsArr = records.filter(r => r.views && r.views > 0)
    const viewsLikes = viewsArr.map(r => r.actualLikes)
    const viewsData = viewsArr.map(r => r.views!)

    // 相关系数
    const scoreLikesR = pearsonR(scores, likes)
    const lengthLikesR = pearsonR(lengths, likes)
    const lengthViewsR = viewsArr.length >= 3 ? pearsonR(viewsArr.map(r => r.content.length), viewsData) : null
    const viewsLikesR = viewsArr.length >= 3 ? pearsonR(viewsData, viewsLikes) : null
    const scoreViewsR = viewsArr.length >= 3 ? pearsonR(viewsArr.map(r => r.compositeScore), viewsData) : null

    // ===== 逐维度 × 点赞 相关系数（反映"什么维度最驱动点赞"）=====
    const dimLikesCorr = SCORING_DIMENSION_CONFIG.map(d => {
      const vals = records.map(r => r.scores[d.key] || 60)
      const r = pearsonR(vals, likes)
      return { key: d.key, label: d.label, correlation: r ?? 0, significance: corrSignificance(r ?? 0) }
    }).sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))

    // ===== 逐维度 × 播放 相关系数（反映"什么维度最影响平台推流"）=====
    const dimViewsCorr = viewsArr.length >= 3
      ? SCORING_DIMENSION_CONFIG.map(d => {
          const vals = viewsArr.map(r => r.scores[d.key] || 60)
          const r = pearsonR(vals, viewsData)
          return { key: d.key, label: d.label, correlation: r ?? 0, significance: corrSignificance(r ?? 0) }
        }).sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      : []

    // 点赞率
    const rates = viewsArr.map(r => r.actualLikes / Math.max(r.views!, 1)).filter(r => isFinite(r))
    const avgLikeRate = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 10000) / 100 : 0
    const likeRateDist = [
      { range: '<0.5%', count: rates.filter(r => r < 0.005).length, pct: 0 },
      { range: '0.5%-2%', count: rates.filter(r => r >= 0.005 && r < 0.02).length, pct: 0 },
      { range: '2%-5%', count: rates.filter(r => r >= 0.02 && r < 0.05).length, pct: 0 },
      { range: '5%-10%', count: rates.filter(r => r >= 0.05 && r < 0.1).length, pct: 0 },
      { range: '>10%', count: rates.filter(r => r >= 0.1).length, pct: 0 }
    ]
    likeRateDist.forEach(d => d.pct = rates.length > 0 ? Math.round(d.count / rates.length * 100) : 0)

    // 异常点检测：标准化残差 > 2
    const scoreMean = scores.reduce((a, b) => a + b, 0) / scores.length
    const scoreStd = Math.sqrt(scores.reduce((a, b) => a + Math.pow(b - scoreMean, 2), 0) / scores.length) || 1
    const outliers = records
      .map(r => {
        const predictedLikes = 50 * Math.pow(1.08, r.compositeScore - 40)
        const residual = Math.abs(r.actualLikes - predictedLikes) / Math.max(predictedLikes, 1)
        return { id: r.id, snippet: r.content.slice(0, 40), likes: r.actualLikes, views: r.views, compositeScore: r.compositeScore, residual }
      })
      .filter(o => o.residual > 1.5)
      .sort((a, b) => b.residual - a.residual)
      .slice(0, 5)
      .map(o => ({
        id: o.id, snippet: o.snippet, likes: o.likes, views: o.views, compositeScore: o.compositeScore,
        reason: o.likes > 50 * Math.pow(1.08, o.compositeScore - 40) ? '实际点赞远超综合分预期' : '实际点赞远低于综合分预期'
      }))

    // 关键因素（汇总所有相关系数，按绝对值降序）
    const factors: Array<{ factor: string; correlation: number; significance: 'high' | 'medium' | 'low' }> = []
    if (viewsLikesR !== null) factors.push({ factor: '播放-点赞相关性', correlation: viewsLikesR, significance: corrSignificance(viewsLikesR) })
    if (scoreLikesR !== null) factors.push({ factor: '综合分-点赞相关性', correlation: scoreLikesR, significance: corrSignificance(scoreLikesR) })
    if (lengthLikesR !== null) factors.push({ factor: '文案长度-点赞相关性', correlation: lengthLikesR, significance: corrSignificance(lengthLikesR) })
    if (lengthViewsR !== null) factors.push({ factor: '文案长度-播放相关性', correlation: lengthViewsR, significance: corrSignificance(lengthViewsR) })
    if (scoreViewsR !== null) factors.push({ factor: '综合分-播放相关性', correlation: scoreViewsR, significance: corrSignificance(scoreViewsR) })
    // 逐维度相关系数（只保留显著的）
    for (const d of dimLikesCorr) {
      if (Math.abs(d.correlation) > 0.15) {
        factors.push({ factor: `${d.label}×点赞`, correlation: d.correlation, significance: d.significance })
      }
    }
    factors.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))

    // 标签分布
    const tagDist: Record<string, number> = {}
    records.forEach(r => r.tags.forEach(t => { tagDist[t] = (tagDist[t] || 0) + 1 }))

    // 平台指标
    const platformMetrics = (['抖音', '视频号', '小红书', '快手'] as Platform[]).map(p => {
      const recs = records.filter(r => r.platform === p)
      if (recs.length === 0) return null
      const vws = recs.filter(r => r.views && r.views > 0)
      return {
        platform: p, count: recs.length,
        avgViews: vws.length > 0 ? Math.round(vws.reduce((a, r) => a + r.views!, 0) / vws.length) : 0,
        avgLikes: Math.round(recs.reduce((a, r) => a + r.actualLikes, 0) / recs.length),
        avgLikeRate: vws.length > 0 ? Math.round(recs.filter(r => r.views && r.views > 0).reduce((a, r) => a + r.actualLikes / Math.max(r.views!, 1), 0) / vws.length * 10000) / 100 : 0,
        avgScore: Math.round(recs.reduce((a, r) => a + r.compositeScore, 0) / recs.length)
      }
    }).filter(Boolean) as ContentAnalysisResult['platformMetrics']

    const result: ContentAnalysisResult = {
      totalSamples: records.length,
      viewsLikesCorrelation: viewsLikesR,
      lengthLikesCorrelation: lengthLikesR,
      lengthViewsCorrelation: lengthViewsR,
      scoreLikesCorrelation: scoreLikesR,
      scoreViewsCorrelation: scoreViewsR,
      avgLikeRate,
      likeRateDistribution: likeRateDist,
      outliers,
      keyFactors: factors,
      dimensionLikesCorrelation: dimLikesCorr,
      dimensionViewsCorrelation: dimViewsCorr,
      contentLength: 0,
      tagDistribution: tagDist,
      platformMetrics,
      generatedAt: new Date().toLocaleString('zh-CN'),
      // 模型版本追踪
      ...detectModelVersion(records),
      // 模型无关特征（本地计算，可跨模型复用）
      modelAgnosticFactors: computeModelAgnosticFactors(records, viewsArr.length >= 3 ? viewsArr : [])
    }
    lastAnalysisResult.value = result
    saveAnalysisResult()
    // 保存维度相关性历史快照（用于追踪账号人格演变）
    saveDimensionHistory()
    return result
  }

  // ===== 账号人格画像（维度重要性历史追踪）=====

  /** 维度相关性历史快照 */
  interface DimensionCorrelationSnapshot {
    timestamp: string
    sampleCount: number
    topDimLikes: Array<{ key: string; label: string; correlation: number }>
    topDimViews: Array<{ key: string; label: string; correlation: number }>
  }

  function dimHistoryKey() { return acctKey('um-dim-history', currentAccountId.value) }

  const dimensionCorrelationHistory = ref<DimensionCorrelationSnapshot[]>(loadDimHistory())

  function loadDimHistory(): DimensionCorrelationSnapshot[] {
    try { const d = localStorage.getItem(dimHistoryKey()); return d ? JSON.parse(d) : [] } catch { return [] }
  }

  function saveDimensionHistory() {
    if (!lastAnalysisResult.value) return
    const snap: DimensionCorrelationSnapshot = {
      timestamp: new Date().toLocaleString('zh-CN'),
      sampleCount: lastAnalysisResult.value.totalSamples,
      topDimLikes: lastAnalysisResult.value.dimensionLikesCorrelation.slice(0, 5),
      topDimViews: lastAnalysisResult.value.dimensionViewsCorrelation.slice(0, 5)
    }
    const history = dimensionCorrelationHistory.value
    // 避免短时间内重复保存
    if (history.length > 0 && history[0].sampleCount === snap.sampleCount) return
    history.unshift(snap)
    // 最多保留 20 条
    if (history.length > 20) history.length = 20
    localStorage.setItem(dimHistoryKey(), JSON.stringify(history))
  }

  /** 账号人格画像：基于最新数据分析，哪些维度驱动点赞、哪些驱动播放 */
  const accountPersonality = computed(() => {
    const result = lastAnalysisResult.value
    if (!result) return null
    const history = dimensionCorrelationHistory.value
    const prev = history.length > 1 ? history[1] : null
    const topLike = result.dimensionLikesCorrelation[0]
    const topView = result.dimensionViewsCorrelation[0]

    // 检测人格漂移：top3 维度是否变化
    const currentTop3 = result.dimensionLikesCorrelation.slice(0, 3).map(d => d.key).join(',')
    const prevTop3 = prev?.topDimLikes.slice(0, 3).map(d => d.key).join(',') || ''
    const personalityShifted = prev && currentTop3 !== prevTop3

    return {
      sampleCount: result.totalSamples,
      generatedAt: result.generatedAt,
      /** 驱动点赞的最强维度 */
      topLikeDriver: topLike || null,
      /** 驱动播放的最强维度 */
      topViewDriver: topView || null,
      /** 全部维度×点赞排序 */
      likesRanking: result.dimensionLikesCorrelation,
      /** 全部维度×播放排序 */
      viewsRanking: result.dimensionViewsCorrelation,
      /** 账号人格是否发生漂移 */
      personalityShifted,
      /** 历史快照数量 */
      historySnapshots: history.length
    }
  })

  /** 从当前样本库数据自动推导最优权重（纯数据驱动，不调AI） */
  async function deriveWeightsFromData(): Promise<Record<string, number> | null> {
    // 确保有最新的分析结果
    if (!lastAnalysisResult.value) {
      await analyzeCorrelations()
    }
    if (!lastAnalysisResult.value) return null
    return deriveWeightsFromCorrelations(
      lastAnalysisResult.value.dimensionLikesCorrelation.map(d => ({ key: d.key, correlation: d.correlation })),
      lastAnalysisResult.value.dimensionViewsCorrelation.map(d => ({ key: d.key, correlation: d.correlation })),
      lastAnalysisResult.value.viewsLikesCorrelation
    )
  }

  /** 一键应用数据驱动权重 */
  async function applyDataDrivenWeights() {
    const weights = await deriveWeightsFromData()
    if (!weights) return
    const v = validateWeightProposal(weights)
    if (!v.passed) {
      ElMessage.warning(v.recommendation + '，仍然应用请重新点击「数据驱动权重」')
      return
    }
    // 跨模型审计
    const cross = await crossAuditWeightUpgrade(weights, v)
    if (cross && !cross.passed) {
      ElMessage.warning(`⚠️ 跨模型审计未通过：${cross.verdict}。仍然应用请重新点击「数据驱动权重」。`)
      return
    }
    const r = lastAnalysisResult.value
    const viewInfo = r && r.viewsLikesCorrelation != null
      ? `，融合播放→点赞通路(r=${r.viewsLikesCorrelation.toFixed(2)})`
      : ''
    const crossNote = cross ? ` | 跨模型审计：${cross.verdict}` : ''
    updateCustomWeights(weights, 'bump', `数据驱动：维度×点赞+维度×播放→点赞${viewInfo}`)
    ElMessage.success(`已应用数据驱动权重：排序正确率 ${Math.round(v.newRate * 100)}%（旧 ${Math.round(v.oldRate * 100)}%）${viewInfo}${crossNote}`)
  }

  /** AI 生成深度分析报告 */
  async function generateAIAnalysisReport(): Promise<void> {
    if (!lastAnalysisResult.value) return
    const r = lastAnalysisResult.value
    const chatStore = useChatStore()

    // 构建逐维度洞察数据
    const dimLikesLines = r.dimensionLikesCorrelation.slice(0, 3)
      .map(d => `  - ${d.label}×点赞 r=${d.correlation}（${d.significance === 'high' ? '强相关' : d.significance === 'medium' ? '中等' : '弱'}）`)
      .join('\n')
    const dimViewsLines = r.dimensionViewsCorrelation.slice(0, 3)
      .map(d => `  - ${d.label}×播放 r=${d.correlation}（${d.significance === 'high' ? '强相关' : d.significance === 'medium' ? '中等' : '弱'}）`)
      .join('\n') || '（暂无足够播放量数据）'
    const topLike = r.dimensionLikesCorrelation[0]
    const topView = r.dimensionViewsCorrelation[0]

    const prompt = `基于以下短视频样本库的统计分析结果，撰写一份深度分析报告（300-500字中文）：

【宏观数据】
- 总样本：${r.totalSamples} 条
- 平均点赞率：${r.avgLikeRate}%
- 综合分×点赞 r=${r.scoreLikesCorrelation} | 播放×点赞 r=${r.viewsLikesCorrelation}
- 异常点：${r.outliers.length} 个
- 平台分布：${r.platformMetrics.map(p => `${p.platform}(${p.count}条,均赞${p.avgLikes},均播${p.avgViews})`).join('，')}

【账号人格画像 — 各维度对点赞的实际驱动强度（Pearson r）】
${dimLikesLines}
${topLike ? `→ 你的账号中【${topLike.label}】是点赞最强驱动力` : ''}

【各维度对播放的实际驱动强度】
${dimViewsLines}
${topView ? `→ 推流最依赖【${topView.label}】` : ''}

报告内容应包括：
1. 数据概况（2-3句）
2. 关键发现（3-5条）：重点分析哪些维度真正驱动了点赞/播放，哪些维度与数据关联弱但被高估
3. 账号策略建议（3条可执行的创作策略）：基于维度驱动力排名，告诉创作者应该把精力优先投入哪些维度
4. 异常点分析：那些"评分高但点赞低"或"评分低但点赞高"的样本说明了什么
5. 下一步建议`

    const reply = await callAI('', prompt)
    if (lastAnalysisResult.value) {
      lastAnalysisResult.value.aiReport = reply
      saveAnalysisResult()
    }
  }

  // ===== 内容拆解（开头钩子 / 点赞引爆点 / 评论引导）=====

  const lastDecomposition = ref<ContentDecomposition | null>(null)
  const decomposing = ref(false)

  // ===== 平台高赞阈值 =====

  /** 各平台高赞最低点赞数阈值，默认：抖音1000，视频号150，其他500 */
  const DEFAULT_HIGH_LIKE_THRESHOLDS: Record<string, number> = {
    '抖音': 1000,
    '视频号': 150,
    '快手': 500,
    '小红书': 500,
    'B站': 500,
    '其他': 500
  }

  const highLikeThresholds = ref<Record<string, number>>(loadHighLikeThresholds())

  function loadHighLikeThresholds(): Record<string, number> {
    try {
      const raw = localStorage.getItem(acctKey('um-highlike-thresholds', currentAccountId.value))
      if (raw) return { ...DEFAULT_HIGH_LIKE_THRESHOLDS, ...JSON.parse(raw) }
    } catch {}
    return { ...DEFAULT_HIGH_LIKE_THRESHOLDS }
  }

  function saveHighLikeThresholds() {
    localStorage.setItem(acctKey('um-highlike-thresholds', currentAccountId.value), JSON.stringify(highLikeThresholds.value))
  }

  function setHighLikeThreshold(platform: string, value: number) {
    highLikeThresholds.value[platform] = Math.max(0, value)
    saveHighLikeThresholds()
  }

  function resetHighLikeThresholds() {
    highLikeThresholds.value = { ...DEFAULT_HIGH_LIKE_THRESHOLDS }
    saveHighLikeThresholds()
  }

  /** 内容拆解开关：是否在账号对话中注入拆解逻辑辅助改写 */
  const decomposeEnabledForChat = ref(loadDecomposeEnabled())
  function loadDecomposeEnabled(): boolean {
    try { return localStorage.getItem(acctKey('um-decompose-chat', currentAccountId.value)) === '1' } catch { return false }
  }
  function toggleDecomposeForChat() {
    decomposeEnabledForChat.value = !decomposeEnabledForChat.value
    localStorage.setItem(acctKey('um-decompose-chat', currentAccountId.value), decomposeEnabledForChat.value ? '1' : '0')
  }

  // ===== 样本录入时自动拆解 =====

  /** 样本量不足时跳过拆解 */
  const MIN_SAMPLES_FOR_DECOMPOSE = 3

  /** 为单条样本执行内容拆解（后台静默，不弹提示） */
  async function autoDecomposeScript(script: ScriptRecord): Promise<void> {
    if (scriptRecords.value.length < MIN_SAMPLES_FOR_DECOMPOSE) return
    // 已有拆解结果则跳过
    if (script.decomposition) return
    try {
      const result = await decomposeContent(script.content, script.platform)
      if (result) {
        script.decomposition = result
        saveScripts()
      }
    } catch {
      // 静默失败，拆解不是阻塞操作
    }
  }

  /** 按 ID 拆解单条样本（用户主动触发，有反馈） */
  async function decomposeScriptById(id: string): Promise<ContentDecomposition | null> {
    const script = scriptRecords.value.find(s => s.id === id)
    if (!script) return null
    try {
      const result = await decomposeContent(script.content, script.platform)
      if (result) {
        script.decomposition = result
        lastDecomposition.value = result
        saveScripts()
      }
      return result
    } catch {
      return null
    }
  }

  /** 拆解聚合分析状态 */
  const decompositionAnalysis = ref<DecompositionAnalysis | null>(null)
  const analyzingDecompositions = ref(false)

  /** 统计已拆解/总样本数 */
  function getDecompositionCoverage(): { done: number; total: number } {
    const total = scriptRecords.value.length
    const done = scriptRecords.value.filter(s => s.decomposition).length
    return { done, total }
  }

  /** 对全部样本的拆解结果做聚合分析 */
  async function analyzeDecompositions(): Promise<DecompositionAnalysis | null> {
    const records = scriptRecords.value.filter(s => s.decomposition)
    if (records.length < MIN_SAMPLES_FOR_DECOMPOSE) return null

    analyzingDecompositions.value = true
    try {
      // 1. 本地统计
      const hookMap = new Map<string, { count: number; totalLikes: number }>()
      const triggerMap = new Map<string, { count: number; totalLikes: number }>()
      const baitMap = new Map<string, { count: number; totalLikes: number }>()
      const comboMap = new Map<string, { count: number; totalLikes: number }>()

      for (const s of records) {
        const d = s.decomposition!
        const hook = d.openingHook.technique
        if (!hookMap.has(hook)) hookMap.set(hook, { count: 0, totalLikes: 0 })
        hookMap.get(hook)!.count++
        hookMap.get(hook)!.totalLikes += s.actualLikes

        for (const lt of d.likeTriggers) {
          const key = lt.triggerType
          if (!triggerMap.has(key)) triggerMap.set(key, { count: 0, totalLikes: 0 })
          triggerMap.get(key)!.count++
          triggerMap.get(key)!.totalLikes += s.actualLikes
        }

        for (const cb of d.commentBaits) {
          const key = cb.technique
          if (!baitMap.has(key)) baitMap.set(key, { count: 0, totalLikes: 0 })
          baitMap.get(key)!.count++
          baitMap.get(key)!.totalLikes += s.actualLikes
        }

        // 组合
        const comboKey = `${hook}|${d.likeTriggers[0]?.triggerType || '无'}|${d.commentBaits[0]?.technique || '无'}`
        if (!comboMap.has(comboKey)) comboMap.set(comboKey, { count: 0, totalLikes: 0 })
        comboMap.get(comboKey)!.count++
        comboMap.get(comboKey)!.totalLikes += s.actualLikes
      }

      const mkList = (map: Map<string, { count: number; totalLikes: number }>) =>
        [...map.entries()]
          .map(([name, v]) => ({ name, count: v.count, avgLikes: Math.round(v.totalLikes / v.count) }))
          .sort((a, b) => b.count - a.count)

      const hookTechniques = mkList(hookMap).map(x => ({ technique: x.name, count: x.count, avgLikes: x.avgLikes }))
      const likeTriggerTypes = mkList(triggerMap).map(x => ({ type: x.name, count: x.count, avgLikes: x.avgLikes }))
      const commentBaitTechniques = mkList(baitMap).map(x => ({ technique: x.name, count: x.count, avgLikes: x.avgLikes }))
      const effectiveCombos = mkList(comboMap)
        .filter(x => x.count >= 2)
        .slice(0, 5)
        .map(x => {
          const parts = x.name.split('|')
          return { hook: parts[0], trigger: parts[1], bait: parts[2], avgLikes: x.avgLikes, count: x.count }
        })

      // 2. AI 深度分析
      const statsSummary = `【拆解统计】
- 已拆解样本：${records.length} 条
- 钩子技巧分布：${hookTechniques.slice(0, 5).map(h => `${h.technique}(${h.count}次,均赞${h.avgLikes})`).join('，')}
- 点赞引爆类型分布：${likeTriggerTypes.slice(0, 5).map(t => `${t.type}(${t.count}次,均赞${t.avgLikes})`).join('，')}
- 评论引导技巧分布：${commentBaitTechniques.slice(0, 5).map(b => `${b.technique}(${b.count}次,均赞${b.avgLikes})`).join('，')}
- 高效组合（出现≥2次）：${effectiveCombos.map(c => `${c.hook}+${c.trigger}+${c.bait}(均赞${c.avgLikes},${c.count}次)`).join(' | ') || '数据不足'}`

      const aiSystem = `你是一名短视频内容策略分析师。根据以下样本拆解统计数据，撰写一份200字以内的实战建议。`
      const aiPrompt = `${statsSummary}\n\n请给出3条基于数据的优化建议，重点：哪种开头钩子+点赞观点+评论引导的组合效果最好？创作者应该优先使用什么技巧？`

      const aiInsight = await callAI(aiSystem, aiPrompt, 0.3)

      const result: DecompositionAnalysis = {
        hookTechniques,
        likeTriggerTypes,
        commentBaitTechniques,
        effectiveCombos,
        aiInsight,
        generatedAt: new Date().toLocaleString()
      }

      decompositionAnalysis.value = result
      return result
    } catch (e: any) {
      console.error('[analyzeDecompositions] 失败', e)
      throw e
    } finally {
      analyzingDecompositions.value = false
    }
  }

  /** 构建内容拆解的 AI 提示词（含账号人格上下文） */
  function buildDecomposePrompt(content: string, platform: string): { system: string; user: string } {
    const personality = accountPersonality.value
    let personalityCtx = ''
    if (personality) {
      const top3 = personality.likesRanking.slice(0, 3).map(d => d.label).join('、')
      personalityCtx = `\n【账号背景】该账号中，${top3} 三个维度与点赞量关联最强。分析时优先关注这些维度。`
    }

    const system = `你是一名顶尖短视频内容拆解师。你需要将一篇短视频文稿拆解为三个关键维度分析。

${personalityCtx}

请按以下格式输出（严格 JSON，不要 markdown 标记）：

{
  "openingHook": {
    "text": "摘录开头第一句或前几句话（原文原字，最多60字）",
    "technique": "使用的钩子技巧，如：悬念设置/数据冲击/反常识/共鸣切入/痛点提问/热点借势/视觉预告",
    "strength": "strong | medium | weak",
    "analysis": "为什么这个开头能/不能留住用户（50字内）"
  },
  "likeTriggers": [
    {
      "point": "摘录原文中可能引发点赞的具体观点或金句（原文原字，最多40字）",
      "triggerType": "点赞动机类型：身份认同/情绪共鸣/反常识冲击/实用价值/认知升级/幽默解压",
      "expectedImpact": "high | medium | low",
      "analysis": "为什么这个点会让用户想点赞（40字内）"
    }
  ],
  "commentBaits": [
    {
      "bait": "摘录原文中引导评论的具体语句（原文原字，最多40字）",
      "technique": "引导技巧：争议性提问/填空式引导/站队投票/经历征集/观点反驳/求助型",
      "expectedEngagement": "high | medium | low",
      "analysis": "为什么这个引导能/不能激发评论（40字内）"
    }
  ],
  "overallAnalysis": "整体拆解总结：开头→点赞→评论的完整链路评价（80字内）"
}

规则：
- 每个字段都必须填写，不可省略
- text/point/bait 必须是原文原句摘录
- likeTriggers 最多3条，commentBaits 最多2条，缺少则不填多余项
- analysis 要具体，不要泛泛而谈`

    return {
      system,
      user: `【平台】${platform}\n【文稿】\n${content.slice(0, 3000)}`
    }
  }

  /** 执行内容拆解 */
  async function decomposeContent(content: string, platform: string = '抖音'): Promise<ContentDecomposition | null> {
    decomposing.value = true
    try {
      const { system, user } = buildDecomposePrompt(content, platform)
      const raw = await callAI(system, user, 0.15)

      // 解析 JSON
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('AI 返回格式异常')
      const parsed = JSON.parse(jsonMatch[0])

      // 校验并构造结果
      const result: ContentDecomposition = {
        openingHook: {
          text: parsed.openingHook?.text || '',
          technique: parsed.openingHook?.technique || '未识别',
          strength: (['strong', 'medium', 'weak'].includes(parsed.openingHook?.strength) ? parsed.openingHook.strength : 'medium') as 'strong' | 'medium' | 'weak',
          analysis: parsed.openingHook?.analysis || ''
        },
        likeTriggers: (Array.isArray(parsed.likeTriggers) ? parsed.likeTriggers.slice(0, 3) : []).map((t: any) => ({
          point: t.point || '',
          triggerType: t.triggerType || '未识别',
          expectedImpact: (['high', 'medium', 'low'].includes(t.expectedImpact) ? t.expectedImpact : 'medium') as 'high' | 'medium' | 'low',
          analysis: t.analysis || ''
        })),
        commentBaits: (Array.isArray(parsed.commentBaits) ? parsed.commentBaits.slice(0, 2) : []).map((b: any) => ({
          bait: b.bait || '',
          technique: b.technique || '未识别',
          expectedEngagement: (['high', 'medium', 'low'].includes(b.expectedEngagement) ? b.expectedEngagement : 'medium') as 'high' | 'medium' | 'low',
          analysis: b.analysis || ''
        })),
        overallAnalysis: parsed.overallAnalysis || ''
      }

      lastDecomposition.value = result
      return result
    } catch (e: any) {
      console.error('[decompose] 失败', e)
      throw e
    } finally {
      decomposing.value = false
    }
  }

  // ===== 独立校验（跨模型审计）=====

  async function crossModelAudit(content: string): Promise<CrossAuditResult | null> {
    const auditResult = await callAI(
      '',
      `你是一个独立的短视频内容审核AI。请对以下文稿进行7维评分（0-100分），只需输出JSON，不要解释。
${SCORING_DIMENSION_CONFIG.map(d => `- ${d.label}(${d.key}): ${d.desc}`).join('\n')}

文稿：${content.slice(0, 2000)}

输出格式：{"hook": ?, "empathy": ?, "density": ?, "structure": ?, "originality": ?, "socialResonance": ?, "polish": ?}`
    )
    try {
      const json = (auditResult.match(/\{[\s\S]*?\}/)?.[0] || '{}').trim()
      const auditScores: ScoringDimensions = JSON.parse(json)
      // 计算差异
      const primaryScores = lastPrediction.value?.scores || defaultScores()
      const diffs = SCORING_DIMENSION_CONFIG.map(d => {
        const pv = primaryScores[d.key] || 0
        const av = auditScores[d.key] || 0
        const diff = pv - av
        return { key: d.key, label: d.label, primary: pv, audit: av, diff, flag: Math.abs(diff) > 20 ? 'alert' as const : Math.abs(diff) > 10 ? 'warn' as const : 'ok' as const }
      })
      const wt = getCurrentEffectiveWeights()
      const compositeDiff = calcCompositeScore(primaryScores, wt) - calcCompositeScore(auditScores, wt)
      const alertCount = diffs.filter(d => d.flag === 'alert').length
      const credibility: 'high' | 'medium' | 'low' = Math.abs(compositeDiff) < 10 && alertCount === 0 ? 'high' : Math.abs(compositeDiff) < 20 && alertCount <= 1 ? 'medium' : 'low'
      crossAuditResult.value = { primaryScores, auditScores, dimensionDiffs: diffs, compositeDiff, credibility, note: credibility === 'high' ? '双模型评分高度一致' : credibility === 'medium' ? '部分维度存在差异，建议关注标记项' : '差异过大，本次预测参考价值有限' }
      return crossAuditResult.value
    } catch {
      ElMessage.error('校验模型解析失败')
      return null
    }
  }

  /** 跨模型审计权重升级：外部 LLM 独立判断新旧权重哪个更好 */
  async function crossAuditWeightUpgrade(
    newWeights: Record<string, number>,
    validation: WeightValidationResult
  ): Promise<CrossAuditWeightResult | null> {
    const oldWeights = getCurrentEffectiveWeights()
    const dimLabels = SCORING_DIMENSION_CONFIG.map(d => d.label).join('、')
    // 构造审查数据
    let pairData = ''
    for (const p of validation.pairs.slice(0, 8)) {
      pairData += `样本A(${p.aLikes}赞): 旧${p.aOld} → 新${p.aNew}` + (p.aLikes >= p.bLikes ? ' ✓应由A得分更高' : '') + '\n'
      pairData += `样本B(${p.bLikes}赞): 旧${p.bOld} → 新${p.bNew}\n\n`
    }
    // 新旧权重对比
    let weightDiffLines = '维度,旧权重,新权重\n'
    for (const d of SCORING_DIMENSION_CONFIG) {
      const ow = oldWeights[d.key] || 0
      const nw = newWeights[d.key] || 0
      if (ow !== nw) weightDiffLines += `${d.label},${ow},${nw}\n`
    }
    const prompt = `你是一个独立的短视频权重公式审计专家。有人提议将内容评分公式的维度权重从"旧权重"升级为"新权重"，请你基于验证数据进行独立判断。

## 评分维度（共${SCORING_DIMENSION_CONFIG.length}个）
${dimLabels}

## 新旧权重对比
${weightDiffLines || '无差异（所有维度权重不变）'}

## 验证池数据（按实际点赞量降序）
旧正确率=${Math.round(validation.oldRate * 100)}%(${validation.oldCorrect}/${validation.totalPairs}) 新正确率=${Math.round(validation.newRate * 100)}%(${validation.newCorrect}/${validation.totalPairs})
${pairData}

## 你的任务
1. 判断新权重是否确实比旧权重更好地预测了点赞量排序
2. 给出你的判决理由（1-2句话）
3. 如果不同意升级，说明具体原因

请输出纯JSON：
{"pass": true或false, "verdict": "理由", "advice": "如不同意，给建议"}`

    try {
      const response = await callAI('你是一个独立的短视频权重审计专家。你的唯一职责是判断权重升级是否合理，不与任何评分模型串通。', prompt, 0.1)
      const json = (response.match(/\{[\s\S]*?\}/)?.[0] || '{}').trim()
      const parsed = JSON.parse(json) as { pass?: boolean; verdict?: string; advice?: string }
      const result: CrossAuditWeightResult = {
        passed: parsed.pass !== false,
        verdict: parsed.verdict || (parsed.pass !== false ? '外部审计同意升级' : '外部审计建议驳回'),
        advice: parsed.advice
      }
      crossAuditWeightResult.value = result
      return result
    } catch {
      // 外部审计失败时不阻塞流程
      console.warn('[cross-audit] 外部 LLM 审计失败，跳过')
      crossAuditWeightResult.value = null
      return null
    }
  }

  // ===== AI 生成文案 =====

  async function generateContent(topic: string, platform: Platform, targetLikes?: number): Promise<string> {
    const records = scriptRecords.value
    const highLikes = records.filter(r => r.actualLikes >= 5000).slice(0, 5)
    const styleRef = highLikes.length > 0
      ? `参考以下${highLikes.length}篇高赞样本的风格：\n${highLikes.map((r, i) => `样本${i + 1}（${r.actualLikes}赞）：${r.content.slice(0, 300)}`).join('\n\n')}`
      : '暂无高赞样本，按通用短视频爆款风格创作'
    const targetHint = targetLikes ? `目标点赞量：${targetLikes.toLocaleString()}，请匹配该量级内容的常见写法` : ''
    const prompt = `你是一个短视频文案专家。请为「${PLATFORM_CONFIG[platform].label}」平台创作一篇口播文案。

话题：${topic}
${targetHint}
${styleRef}

要求：
1. 直接输出完整文案，不需要额外说明
2. 使用口语化风格，段落间自然过渡
3. 开场3秒内必须有钩子
4. 结尾要有互动引导（点赞/评论/关注）
5. 字数 300-800 字`
    return await callAI('', prompt)
  }

  // ===== 改进文案 =====

  async function improveContent(originalContent: string, platform: Platform, weakScores?: ScoringDimensions): Promise<string> {
    const weakHint = weakScores
      ? `当前弱项维度：${SCORING_DIMENSION_CONFIG.filter(d => (weakScores[d.key] || 100) < 60).map(d => `${d.label}(${(weakScores[d.key] || 0)}分)`).join('、')}。请重点优化这些维度。`
      : ''
    const prompt = `你是短视频文案优化专家。请改进以下${PLATFORM_CONFIG[platform].label}平台口播文案，保留核心观点和金句，提升传播效果。

${weakHint}

原稿：
${originalContent}

要求：
1. 直接输出改写后的完整文案
2. 优化困惑命中精度，让开头精准指向受众当前最大困惑
3. 提升情绪路径和解释力密度
4. 保持原稿的核心观点和信息
5. 字数与原稿相近`
    return await callAI('', prompt)
  }

  // ===== 录入文稿并 AI 7维评分 =====

  async function addScript(
    script: Omit<ScriptRecord, 'id' | 'scores' | 'compositeScore' | 'analysis' | 'createdAt' | 'updatedAt'>,
    precomputed?: { scores: ScoringDimensions; compositeScore: number; analysis: string; modelVersion?: string }
  ): Promise<ScriptRecord> {
    const now = new Date().toLocaleString('zh-CN')
    const record: ScriptRecord = {
      id: generateId('script'),
      ...script,
      scores: precomputed?.scores ?? defaultScores(),
      compositeScore: precomputed?.compositeScore ?? 0,
      analysis: precomputed?.analysis ?? '',
      createdAt: now,
      updatedAt: now
    }

    if (precomputed) {
      // 已有评分结果，直接入库，跳过 AI 调用
      record.modelVersion = precomputed.modelVersion ?? getCurrentModelId()
      record.scoredWithProfile = !!audienceProfile.value
      scriptRecords.value.unshift(record)
      saveScripts()
      autoDecomposeScript(record).catch(() => {})
    } else {
      // 自动 AI 7维评分 + 分析（先评分，成功后再入库）
      isAnalyzingScript.value = true
      try {
        const aiResult = await scoreSingleScript(record)
        record.scores = parseScores(aiResult)
        record.modelVersion = getCurrentModelId()
        record.compositeScore = calcCompositeScore(record.scores, customWeights.value)
        record.analysis = cleanAnalysisText(aiResult)
        record.scoredWithProfile = !!audienceProfile.value
        record.updatedAt = new Date().toLocaleString('zh-CN')

        // AI 评分成功后才写入样本库
        scriptRecords.value.unshift(record)
        saveScripts()

        // 后台静默拆解（不阻塞）
        autoDecomposeScript(record).catch(() => {})
        // 首次积累足够样本后，提示配置受众画像
        if (!audienceProfile.value && scriptRecords.value.length >= 3 && !audienceProfileHinted) {
          audienceProfileHinted = true
          setTimeout(() => {
            ElMessageBox.confirm(
              '已录入 3 条文稿，建议现在配置「受众画像」——让 AI 知道你的视频在跟谁说话，后续评分更准。\n\n配置入口：顶部「当前账号」→「管理账号」→ 滚动到底部「受众画像」',
              '配置受众画像',
              { confirmButtonText: '知道了', cancelButtonText: '不再提醒', type: 'info', distinguishCancelAndClose: true }
            ).catch(() => {})
          }, 500)
        }
      } catch (e: any) {
        ElMessage.warning('AI 分析失败: ' + (e.message || '未知错误'))
        throw e
      } finally {
        isAnalyzingScript.value = false
      }
    }
    return record
  }

  function updateScript(id: string, patch: Partial<Omit<ScriptRecord, 'id' | 'createdAt'>>) {
    const record = scriptRecords.value.find(s => s.id === id)
    if (record) { Object.assign(record, patch, { updatedAt: new Date().toLocaleString('zh-CN') }); saveScripts() }
  }

  function deleteScript(id: string) {
    scriptRecords.value = scriptRecords.value.filter(s => s.id !== id)
    saveScripts()
    if (patternSummary.value?.topScriptId === id || patternSummary.value?.bottomScriptId === id) {
      patternSummary.value = null; localStorage.removeItem(patternKey(currentAccountId.value))
    }
  }

  async function reAnalyzeScript(id: string): Promise<void> {
    const record = scriptRecords.value.find(s => s.id === id)
    if (!record) return
    isAnalyzingScript.value = true
    try {
      const aiResult = await scoreSingleScript(record)
      record.scores = parseScores(aiResult)
      record.modelVersion = getCurrentModelId()
      record.compositeScore = calcCompositeScore(record.scores, customWeights.value)
      record.analysis = cleanAnalysisText(aiResult)
      record.scoredWithProfile = !!audienceProfile.value
      record.updatedAt = new Date().toLocaleString('zh-CN')
      saveScripts()
    } catch (e: any) { ElMessage.error('分析失败: ' + (e.message || '未知错误')) }
    finally { isAnalyzingScript.value = false }
  }

  /** AI 7维评分系统提示 */
  /** 文本截断辅助 */
  function dimLine(text: string, maxLen: number): string {
    if (!text) return ''
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
  }

  const SCORING_SYSTEM_PROMPT = `你是短视频文案评分专家。使用以下5级锚定量表（1=最低, 5=最高）对文稿的7个维度逐一打分，每项附一句话评分理由。

评分前请先自行判断：这篇文稿属于该赛道下的哪个细分选题方向？基于该选题方向，受众最核心的困惑是什么？然后据此评分。

【5级锚定量表】
${SCORING_DIMENSION_CONFIG.map(d =>
  `【${d.label}】${d.desc}
  1 = ${d.rubric[0]}
  2 = ${d.rubric[1]}
  3 = ${d.rubric[2]}
  4 = ${d.rubric[3]}
  5 = ${d.rubric[4]}`
).join('\n')}

【输出格式要求】
严格按照以下格式（数字|理由）：
hook: 4 | 开场使用数据+悬念，瞬间抓人
empathy: 3 | 职场人群对号入座，但未深入内心活动
density: 2 | 观点单一，展开较拖沓
structure: 4 | 钩子→展开→金句→收尾，节奏好
originality: 3 | 有个人视角但不具稀缺性
socialResonance: 4 | 击中了职场内卷的集体情绪
polish: 3 | 通顺工整，有几句出彩

综合评述: 一段话总结该文稿的整体表现（2-3句）`

  /** 构建参考示例（纯文本，不含历史评分，仅用于了解账号内容风格） */
  function buildAnchorExamples(): string {
    const scored = scriptRecords.value.filter(r => r.scores && r.compositeScore > 0 && !(r as any)._needsRescore)
    if (scored.length < 5) return ''
    // 按实际点赞量排序，只取中位区 30%-70% 作为锚定参考（避免极端值锚定偏差）
    const sorted = [...scored].sort((a, b) => b.actualLikes - a.actualLikes)
    const midStart = Math.floor(sorted.length * 0.3)
    const midEnd = Math.ceil(sorted.length * 0.7)
    const midPool = sorted.slice(midStart, midEnd)
    // 从中位区均匀取 3 条
    const anchors = midPool.length >= 3
      ? [midPool[0], midPool[Math.floor(midPool.length / 2)], midPool[midPool.length - 1]]
      : midPool
    const lines = anchors.map((r, i) => {
      // 只暴露文本和 AI 内容摘要，不暴露历史评分等级（防止锚定偏差）
      return `【锚定样本${i + 1}】${dimLine(r.content, 60)} | 摘要: ${dimLine(r.analysis, 60)}`
    })
    return `\n\n【参考样本（以下是该账号历史内容示例。请仅凭下方的5级锚定量表独立打分，不参考示例的历史评分——示例仅用于了解账号内容风格）】\n${lines.join('\n')}\n`
  }

  async function scoreSingleScript(record: ScriptRecord, runs: number = 3): Promise<string> {
    let prompt = SCORING_SYSTEM_PROMPT
    // 附加参考样本（了解账号内容风格，不含历史评分）
    const anchors = buildAnchorExamples()
    if (anchors) prompt += anchors
    // 附加平台算法规则（纯算法层，不含受众描述）
    prompt += '\n\n' + PLATFORM_SCORING_GUIDE[record.platform]
    // 附加受众画像锚定（用户配置的赛道/受众/困惑）
    if (audienceProfile.value) {
      const ap = audienceProfile.value
      prompt += `\n\n【账号受众画像——请以此为准校准评分，尤其关注"这群受众真正需要什么"】
- 赛道：${ap.niche}
- 核心受众：${ap.targetAudience}
- 受众核心困惑（评分时请对照这些困惑来判断"困惑命中"和"被理解感"）：
${ap.coreConfusions.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
- 共鸣触发模式：${ap.resonancePatterns}
- 信任建立方式：${ap.trustBuilders}
- 不适用的话题/调性：${ap.avoidTopics}
- 分析摘要：${ap.summary}`
    }
    // 附加自定义判断标准
    if (Object.keys(customCriteria.value).length > 0) {
      const rules = SCORING_DIMENSION_CONFIG
        .filter(d => customCriteria.value[d.key])
        .map(d => `  - ${d.label}: ${customCriteria.value[d.key]}`)
      if (rules.length > 0) {
        prompt += `\n\n【用户自定义判断标准】\n请优先参照以下标准进行评分：\n${rules.join('\n')}`
      }
    }
    const userContent = `【平台】${record.platform}\n【实际点赞量】${record.actualLikes.toLocaleString()}\n【文稿内容】\n${record.content}`

    // 多次评分取中位数（消除单次随机波动）
    const allResults: ScoringDimensions[] = []
    const allRawTexts: string[] = []
    const actualRuns = Math.min(runs, 3) // 最多 3 次，避免过长等待
    for (let i = 0; i < actualRuns; i++) {
      const raw = await callAI(prompt, userContent, 0.15)
      allRawTexts.push(raw)
      allResults.push(parseScores(raw))
    }

    // 检测并记录分歧：任意维度3轮极差 >= 2 级（即 >= 40 分）
    const diffs: ScoringDisagreement[] = []
    if (actualRuns >= 2) {
      for (const d of SCORING_DIMENSION_CONFIG) {
        const vals = allResults.map(r => r[d.key])
        const range = Math.max(...vals) - Math.min(...vals)
        if (range >= 40) {
          diffs.push({ key: d.key, label: d.label, runs: vals, range })
        }
      }
    }
    scoringDisagreements.value = diffs

    if (actualRuns === 1) return allRawTexts[0]

    // 逐维度取中位数
    const medianScores = defaultScores()
    for (const d of SCORING_DIMENSION_CONFIG) {
      const vals = allResults.map(r => r[d.key]).sort((a, b) => a - b)
      medianScores[d.key] = vals[Math.floor(vals.length / 2)]
    }

    // 选综合分最接近中位数的 run 提取理由文本
    const medianComposite = calcCompositeScore(medianScores, customWeights.value)
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < actualRuns; i++) {
      const comp = calcCompositeScore(allResults[i], customWeights.value)
      const dist = Math.abs(comp - medianComposite)
      if (dist < bestDist) { bestDist = dist; bestIdx = i }
    }

    // 从最佳 run 提取各维度评分理由
    const bestRaw = allRawTexts[bestIdx]
    const reasonMap: Record<string, string> = {}
    for (const d of SCORING_DIMENSION_CONFIG) {
      const regex = new RegExp(`${d.key}[：:]\\s*\\d+\\s*\\|\\s*(.+?)(?:\\n|$)`, 'i')
      const match = bestRaw.match(regex)
      if (match) reasonMap[d.key] = match[1].trim()
    }

    // 重构建输出文本（中位数分值 + 最佳 run 的理由）
    const rebuiltLines = SCORING_DIMENSION_CONFIG.map(d => {
      const level = Math.round(medianScores[d.key] / 20)
      const reason = reasonMap[d.key] || '—'
      return `${d.key}: ${level} | ${reason}`
    }).join('\n')
    const summaryMatch = bestRaw.match(/综合评述[：:]\s*([\s\S]*?)$/i)
    const summary = summaryMatch ? summaryMatch[1].trim() : ''

    return rebuiltLines + '\n\n综合评述: ' + summary
  }

  function cleanAnalysisText(aiResult: string): string {
    // 去掉开头的分数行，保留评述（匹配新格式 hook/empathy 等及旧格式中文标签）
    return aiResult.replace(/^(hook|empathy|density|structure|originality|socialResonance|polish|开场钩子|人物场景|情绪峰值|受众带入|观点压缩|结构清晰|内容稀缺度|账号匹配|低赞风险|代入共鸣|信息密度|叙事结构|稀缺独创|人设一致|执行质量|社会共振)[\s\S]*?理由\b.*$/gm, '')
      .replace(/^综合评述[：:]\s*/gm, '').trim()
  }

  // ===== 受众画像生成 =====

  async function generateAudienceProfile(nicheKeywords: string, notes?: string): Promise<AudienceProfile> {
    audienceLoading.value = true
    try {
      // 收集已有文稿作为分析素材（附带平台和互动数据）
      const rawSamples = scriptRecords.value
        .filter(r => r.content && r.content.trim().length > 0)
        .slice(0, 20)
      
      const sampleBlock = rawSamples.length > 0
        ? `\n【已有文稿样本（含平台与表现数据，高赞/高点赞率的样本参考价值更高，低互动样本仅作反例）】\n${rawSamples.map((r, i) => {
            const text = r.content.length > 300 ? r.content.slice(0, 300) + '...' : r.content
            const perf = r.views && r.views > 0
              ? `平台：${r.platform} | 点赞：${r.actualLikes.toLocaleString()} | 播放：${r.views.toLocaleString()} | 点赞率：${(r.likeRate ?? (r.views > 0 ? (r.actualLikes / r.views * 100) : 0)).toFixed(2)}%`
               : `平台：${r.platform} | 点赞：${r.actualLikes.toLocaleString()}`
            return `[${i + 1}] ${perf}\n${text}`
          }).join('\n---\n')}`
        : ''

      const prompt = `你是一位内容策略分析师。请基于以下信息，分析该账号的受众画像。

【赛道关键词】${nicheKeywords}
${notes ? `【补充描述】${notes}` : ''}
${sampleBlock}

请分析并严格按以下JSON格式输出（不要输出markdown包裹，只输出纯JSON）：
{
  "targetAudience": "一句话描述核心受众（年龄/人生阶段/心理状态）",
  "coreConfusions": ["困惑1", "困惑2", "困惑3", "困惑4", "困惑5"],
  "resonancePatterns": "什么类型的开头/话题/句式最容易让这群人产生'这就是在说我'的感觉",
  "trustBuilders": "什么建立信任的方式最有效（如引经据典/案例/数据/真实经历等）",
  "avoidTopics": "与这群人的期待明显冲突的话题或表达方式",
  "summary": "一段话（80-120字）概括：这群人的状态 + 他们真正需要什么 + 应该用什么样的方式和他们对话"
}

注意：
- 基于已有文稿的风格反推受众，不要编造与内容无关的描述
- 所有输出聚焦"受众需要什么"，而不是"创作者做什么"
- 高点赞、高点赞率的样本应作为正面参考重点分析；低互动的样本仅推测"缺少共鸣"的方向
- 同一平台内，点赞量绝对值受该平台用户基数影响（如抖音普遍偏高、视频号偏低），请用点赞率做跨样本公平对比`

      const raw = await callAI('', prompt, 0.15)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      let parsed: any
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {
          parsed = {}
        }
      } else {
        parsed = {}
      }

      const profile: AudienceProfile = {
        niche: nicheKeywords,
        targetAudience: parsed.targetAudience || nicheKeywords,
        coreConfusions: Array.isArray(parsed.coreConfusions) ? parsed.coreConfusions : [],
        resonancePatterns: parsed.resonancePatterns || '',
        trustBuilders: parsed.trustBuilders || '',
        avoidTopics: parsed.avoidTopics || '',
        summary: parsed.summary || nicheKeywords,
        generatedAt: Date.now()
      }

      audienceProfile.value = profile
      // watcher 会自动触发 saveAudienceProfile()，无需显式调用

      return profile
    } finally {
      audienceLoading.value = false
    }
  }

  // ===== 规律总结 =====

  async function generatePatternSummary(): Promise<PatternSummary> {
    if (scriptRecords.value.length === 0) throw new Error('请先录入至少一条文稿')
    isSummarizing.value = true
    try {
      const recordsSummary = scriptRecords.value.map((r, i) => {
        const preview = r.content.length > 150 ? r.content.slice(0, 150) + '...' : r.content
        const scoreStr = SCORING_DIMENSION_CONFIG.map(d => `${d.label}:${r.scores[d.key]}`).join(' | ')
        return `【文稿${i + 1}】平台:${r.platform} | 点赞:${r.actualLikes.toLocaleString()} | 综合:${r.compositeScore}分\n${scoreStr}\n摘要: ${preview}`
      }).join('\n\n---\n\n')

      const sysPrompt = `你是短视频数据分析专家。分析以下带7维评分的文稿库，归纳规律。${audienceProfile.value ? `\n\n【账号受众背景】\n赛道：${audienceProfile.value.niche}\n目标受众：${audienceProfile.value.targetAudience}\n核心困惑：${audienceProfile.value.coreConfusions.join('；')}\n共鸣模式：${audienceProfile.value.resonancePatterns}` : ''}

## 高赞规律
- 点赞量最高的那些文稿，在7个维度上有什么共同特征？
- 哪几个维度得分高与高点赞最相关？
- 列出 3-5 条规律

## 低赞通病
- 点赞量低的文稿，在哪些维度上普遍失分？
- 列出 2-4 条常见问题

## 维度权重洞察
- 在${scriptRecords.value.length}条数据中，哪些维度对点赞量的预测价值最大？
- 每个重要维度给出简要说明

## 平台差异
- ${Object.keys(PLATFORM_CONFIG).join('/')}四个平台的文案偏好差异

## 关键词推荐
- 高赞文稿中频繁出现的关键词/句式/话题类型`

      const aiResult = await callAI(sysPrompt,
        `【知识库（共${scriptRecords.value.length}条）】\n\n${recordsSummary}\n\n请归纳总结。`
      )

      // 计算统计数据
      const totalCount = scriptRecords.value.length
      const sorted = [...scriptRecords.value].sort((a, b) => b.actualLikes - a.actualLikes)
      const avg = Math.round(sorted.reduce((s, r) => s + r.actualLikes, 0) / totalCount)

      // 计算各平台
      const pCounts: Record<string, number> = {}, pSums: Record<string, number> = {}
      for (const r of scriptRecords.value) { pCounts[r.platform] = (pCounts[r.platform] || 0) + 1; pSums[r.platform] = (pSums[r.platform] || 0) + r.actualLikes }
      const pAvgs: Record<string, number> = {}
      for (const p of Object.keys(pCounts)) pAvgs[p] = Math.round(pSums[p] / pCounts[p])

      // 计算高赞组与低赞组各维度平均分
      const mid = Math.floor(sorted.length / 2)
      const highGroup = sorted.slice(0, mid)
      const lowGroup = sorted.slice(mid)
      const avgScores = (group: ScriptRecord[]): ScoringDimensions => {
        const s = defaultScores()
        if (group.length === 0) return s
        for (const r of group) for (const d of SCORING_DIMENSION_CONFIG) s[d.key] += r.scores[d.key]
        for (const d of SCORING_DIMENSION_CONFIG) s[d.key] = Math.round(s[d.key] / group.length)
        return s
      }

      const highSection = extractSection(aiResult, '高赞规律') || extractSection(aiResult, '高赞') || ''
      const lowSection = extractSection(aiResult, '低赞通病') || extractSection(aiResult, '低赞') || ''
      const weightSection = extractSection(aiResult, '维度权重洞察') || ''
      const diffSection = extractSection(aiResult, '平台差异') || ''
      const kwSection = extractSection(aiResult, '关键词推荐') || extractSection(aiResult, '关键词洞察') || ''

      const summary: PatternSummary = {
        totalCount, platformCounts: pCounts, platformAvgLikes: pAvgs,
        overallAvgLikes: avg,
        topScriptId: sorted[0]?.id || null,
        bottomScriptId: sorted.length > 1 ? sorted[sorted.length - 1].id : null,
        highLikePatterns: highSection.split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./)),
        lowLikePatterns: lowSection.split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./)),
        dimensionAverages: { high: avgScores(highGroup), low: avgScores(lowGroup) },
        platformDifferences: diffSection || weightSection,
        keywordInsights: kwSection,
        generatedAt: new Date().toLocaleString('zh-CN')
      }
      patternSummary.value = summary; savePatternSummary()
      return summary
    } finally { isSummarizing.value = false }
  }

  // ===== 写作框架 =====

  async function generateWritingFramework(): Promise<WritingFramework> {
    if (scriptRecords.value.length === 0) throw new Error('请先录入文稿')
    isGeneratingFramework.value = true
    try {
      // 确保有规律总结
      if (!patternSummary.value) await generatePatternSummary()
      const pSummary = patternSummary.value!

      const sysPrompt = `你是一个短视频文案写作教练。基于用户已有的${scriptRecords.value.length}条文稿及其7维评分数据，生成一份写作框架指南。

【已有规律】
高赞规律: ${pSummary.highLikePatterns.join('; ')}
低赞通病: ${pSummary.lowLikePatterns.join('; ')}

请输出以下4个部分：

## 通用写作框架
- 一篇高赞口播文稿的黄金结构是什么？
- 从开头到结尾各阶段的关键要点
- 以模板形式呈现（[开头] -> [展开] -> [高潮] -> [结尾]）

## 平台定制
- 分别针对抖音、视频号、小红书、快手四个平台
- 各平台独特的开头策略/时长建议/语调风格

## 爆款标题公式
- 基于高赞文稿提炼 3-5 个可复用的标题/开头公式
- 每个公式附带一句示例

## 避坑指南
- 最容易导致低赞的 3-5 个写作误区
- 每个误区附带反面示例和修正方法`

      const recordsBrief = scriptRecords.value.slice(0, 10).map(r =>
        `- ${r.platform} | ${r.actualLikes.toLocaleString()}赞 | 综合${r.compositeScore}分 | ${(r.content || '').slice(0, 60)}...`
      ).join('\n')

      const aiResult = await callAI(sysPrompt,
        `【高赞文稿示例】\n${recordsBrief}\n\n请生成写作框架。`
      )

      const framework: WritingFramework = {
        universal: extractSection(aiResult, '通用写作框架') || aiResult,
        platformSpecific: {
          '抖音': extractSection(aiResult, '抖音') || '',
          '视频号': extractSection(aiResult, '视频号') || '',
          '小红书': extractSection(aiResult, '小红书') || '',
          '快手': extractSection(aiResult, '快手') || ''
        },
        titleFormulas: (extractSection(aiResult, '爆款标题公式') || '').split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./)),
        structureTemplates: (extractSection(aiResult, '通用写作框架') || '').split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./)),
        pitfalls: (extractSection(aiResult, '避坑指南') || '').split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./)),
        generatedAt: new Date().toLocaleString('zh-CN')
      }
      writingFramework.value = framework; saveFramework()
      return framework
    } finally { isGeneratingFramework.value = false }
  }

  // ===== 点赞预测 =====

  async function predictLikes(content: string, platform: Platform): Promise<PredictionResult> {
    if (scriptRecords.value.length === 0) throw new Error('请先录入至少一条带点赞量的文稿作为参考')
    isPredicting.value = true
    try {
      // 如果没有规律总结，先生成
      if (!patternSummary.value || scriptRecords.value.length > (patternSummary.value.totalCount + 2)) {
        try { await generatePatternSummary() } catch {}
      }

      // 先对新稿做7维评分（打分环节可以看到实际点赞量，这是合理的）
      let scorePrompt = SCORING_SYSTEM_PROMPT
      // 附加参考样本（了解账号内容风格）
      const anchors = buildAnchorExamples()
      if (anchors) scorePrompt += anchors
      // 附加平台定位锚定
      scorePrompt += '\n\n' + PLATFORM_SCORING_GUIDE[platform]
      if (Object.keys(customCriteria.value).length > 0) {
        const rules = SCORING_DIMENSION_CONFIG
          .filter(d => customCriteria.value[d.key])
          .map(d => `  - ${d.label}: ${customCriteria.value[d.key]}`)
        if (rules.length > 0) {
          scorePrompt += `\n\n【用户自定义判断标准】\n请优先参照以下标准进行评分：\n${rules.join('\n')}`
        }
      }
      // 附加受众画像锚定（与 scoreSingleScript 对齐）
      if (audienceProfile.value) {
        const ap = audienceProfile.value
        scorePrompt += `\n\n【账号受众画像——请以此为准校准评分，尤其关注"这群受众真正需要什么"】
- 赛道：${ap.niche}
- 核心受众：${ap.targetAudience}
- 受众核心困惑（评分时请对照这些困惑来判断"困惑命中"和"被理解感"）：
${ap.coreConfusions.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
- 共鸣触发模式：${ap.resonancePatterns}
- 信任建立方式：${ap.trustBuilders}
- 不适用的话题/调性：${ap.avoidTopics}
- 分析摘要：${ap.summary}`
      }
      // 3轮评分取中位数，消除单次随机波动
      const scoringRuns = 3
      const allScoreResults: ScoringDimensions[] = []
      const userContent = `【平台】${platform}\n【待评分的文稿内容】\n${content}`
      for (let i = 0; i < scoringRuns; i++) {
        const raw = await callAI(scorePrompt, userContent, 0.15)
        allScoreResults.push(parseScores(raw))
      }

      // 检测并记录分歧
      const diffs: ScoringDisagreement[] = []
      for (const d of SCORING_DIMENSION_CONFIG) {
        const vals = allScoreResults.map(r => r[d.key])
        const range = Math.max(...vals) - Math.min(...vals)
        if (range >= 40) {
          diffs.push({ key: d.key, label: d.label, runs: vals, range })
        }
      }
      predictDisagreements.value = diffs

      // 逐维度取中位数
      const medianScoreResult: ScoringDimensions = defaultScores()
      for (const d of SCORING_DIMENSION_CONFIG) {
        const vals = allScoreResults.map(r => r[d.key]).sort((a, b) => a - b)
        medianScoreResult[d.key] = vals[Math.floor(vals.length / 2)]
      }
      const newScores = medianScoreResult
      const newComposite = calcCompositeScore(newScores, customWeights.value)

      // 维度分析文本
      const dimAnalysis = SCORING_DIMENSION_CONFIG.map(d =>
        `${d.label}: ${newScores[d.key]}分`
      )

      // 找参考样本
      const refSamples = findBestReferenceSamples(newScores, newComposite, platform)

      // ===== 盲预测：构建预测 Prompt（不透露单个样本的实际点赞量）=====
      const dimScoreSummary = SCORING_DIMENSION_CONFIG.map(d =>
        `${d.label}: ${newScores[d.key]}分`
      ).join('\n')

      // 只给 AI 相似样本的评分特征，不给实际点赞量
      const blindRefSummary = refSamples.map((r, i) =>
        `【参考${i + 1}】${r.platform} | 综合${r.compositeScore}分\n相似原因: ${r.similarityReason}`
      ).join('\n')

      // 匿名统计：只给点赞量分布范围，不给个体对应关系
      const similarLikes = refSamples.map(r => r.actualLikes).sort((a, b) => a - b)
      const likeStats = similarLikes.length > 0
        ? `\n参考样本群体统计（匿名化，不代表逐一对应）：最低 ${similarLikes[0]?.toLocaleString() || 0} / 中位 ${similarLikes[Math.floor(similarLikes.length / 2)]?.toLocaleString() || 0} / 最高 ${similarLikes[similarLikes.length - 1]?.toLocaleString() || 0}`
        : ''

      // 自动推导桶边界
       const buckets = deriveBuckets(scriptRecords.value)
      const bucketStr = buckets.map((b, i) =>
        `  ${i + 1}. ${b.label}`
      ).join('\n')

      const sysPrompt = `你是短视频点赞量预测专家。基于新文稿的7维评分和样本库统计特征，预估点赞量。

⚠️ 重要盲预测原则：你看到的参考样本经过了匿名化处理——你只能看到每个样本的综合评分和维度相似度，看不到它们各自的真实点赞量。你拿到的"群体统计分布"只是让你了解样本库的整体量级，不代表任何个体的对应关系。请基于新稿自身的7维评分特征做出独立判断。

输出格式：

## 预估点赞量
写 "8000 - 12000" 格式的范围

## 置信度
写 高/中/低（一句话理由）

## 概率分布（各桶概率加起来必须 = 100%，样本少时分布应更平均）
${bucketStr}
格式示例:
<${buckets[0]?.label || '1k'}: X%
${buckets[0]?.label || '1k'}-${buckets[1]?.label || '5k'}: X%
...

其中主预测桶标注 **粗体**，如 **${buckets.length >= 3 ? buckets[Math.floor(buckets.length / 2)].label : '中位'}: 45%**

## 预测依据
逐条列出（3-5条），必须以 - 开头，重点引用新稿自身的7维评分特征而非参考样本

## 改进建议
逐条列出（2-3条），必须以 - 开头

## 反事实分析
如果实际点赞量远高于预估（>2x），可能说明什么？
如果远低于预估（<0.5x），可能说明什么？（各列1-2条）`

      const aiResult = await callAI(sysPrompt,
        `【新文稿】\n平台: ${platform}\n综合评分: ${newComposite}分\n\n【7维评分】\n${dimScoreSummary}\n\n【匿名化参考样本（仅评分特征，不含实际点赞量）】\n${blindRefSummary}\n${likeStats}\n\n请基于新稿自身特征盲预估点赞量。`
      )

      const rangeSection = extractSection(aiResult, '预估点赞量')
      const reasonsSection = extractSection(aiResult, '预测依据')
      const suggestionsSection = extractSection(aiResult, '改进建议')
      const confidenceSection = extractSection(aiResult, '置信度')
      const probSection = extractSection(aiResult, '概率分布')
      const counterSection = extractSection(aiResult, '反事实分析')

      let minLikes = 0, maxLikes = 0
      if (rangeSection) {
        const nums = rangeSection.match(/[\d,]+/g)?.map(s => parseInt(s.replace(/,/g, ''), 10)) || []
        if (nums.length >= 2) { minLikes = Math.min(nums[0], nums[1]); maxLikes = Math.max(nums[0], nums[1]) }
        else if (nums.length === 1) { minLikes = Math.round(nums[0] * 0.8); maxLikes = Math.round(nums[0] * 1.2) }
      }

      // 解析概率分布
      const bucketProbs: BucketProb[] = []
      if (probSection) {
        const lines = probSection.split('\n').filter(l => /%/.test(l))
        for (const line of lines) {
          const pctMatch = line.match(/(\d+)%/); const labelMatch = line.match(/^[*-]*\s*(.+?)[：:]/)
          if (pctMatch && labelMatch) {
            bucketProbs.push({
              bucket: labelMatch[1].trim().replace(/\*\*/g, ''),
              label: labelMatch[1].trim().replace(/\*\*/g, ''),
              probability: parseInt(pctMatch[1], 10),
              isHeadline: /\*\*/.test(line)
            })
          }
        }
      }

      const result: PredictionResult = {
        minLikes, maxLikes,
        scores: newScores,
        compositeScore: newComposite,
        dimensionAnalysis: dimAnalysis,
        reasons: reasonsSection ? reasonsSection.split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./)).map(l => l.replace(/^[\s]*[-*]*\s*\d*[\.\、\)]*\s*/, '')) : [],
        referencedSamples: refSamples,
        suggestions: suggestionsSection ? suggestionsSection.split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./)).map(l => l.replace(/^[\s]*[-*]*\s*\d*[\.\、\)]*\s*/, '')) : [],
        bucketProbabilities: bucketProbs.length > 0 ? bucketProbs : undefined,
        confidence: confidenceSection?.trim() || undefined,
        counterfactuals: counterSection ? counterSection.split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./)).map(l => l.replace(/^[\s]*[-*]*\s*\d*[\.\、\)]*\s*/, '')) : undefined,
        predictedAt: new Date().toLocaleString('zh-CN')
      }
      lastPrediction.value = result

      // 追加到不可变预测历史
      const contentHash = await simpleHash(content)
      const entry: PredictionLogEntry = {
        id: generateId('pred'),
        content,
        contentHash,
        platform,
        result,
        predictedAt: new Date().toLocaleString('zh-CN')
      }
      predictionHistory.value.unshift(entry)
      savePredictionHistory()

      return result
    } finally { isPredicting.value = false }
  }

  /** 复盘：将实际点赞量与历史预测对照，计算偏差，并自动加入样本库。isReRetro 为 true 时仅更新数据不重复入库。 */
  function retroPrediction(
    predictionId: string,
    actualLikes: number,
    actualViews?: number,
    note?: string,
    isReRetro: boolean = false,
    additionalPlatforms?: Array<{ platform: Platform; likes: number; views?: number }>
  ) {
    try {
      const entry = predictionHistory.value.find(e => e.id === predictionId)
      if (!entry) { console.warn('[retro] 未找到预测记录', predictionId); return }

      entry.actualLikes = actualLikes
      if (actualViews !== undefined) entry.actualViews = actualViews
      entry.retroAt = new Date().toLocaleString('zh-CN')
      entry.retroNote = note || ''
      const predictedMid = (entry.result.minLikes + entry.result.maxLikes) / 2
      entry.deviation = actualLikes > 0 ? Math.round((actualLikes - predictedMid) / predictedMid * 100) : 0
      savePredictionHistory()

      // 再复盘：更新预测历史 + 同步更新样本库中对应样本的数据
      if (isReRetro) {
        const matches = scriptRecords.value.filter(
          r => r.content === entry.content && r.platform === entry.platform
        )
        if (matches.length > 0) {
          for (const m of matches) {
            m.actualLikes = actualLikes
            if (actualViews !== undefined) {
              m.views = actualViews
              m.likeRate = actualViews > 0 ? Math.round(actualLikes / actualViews * 10000) / 100 : undefined
            }
            m.updatedAt = new Date().toLocaleString('zh-CN')
          }
          saveScripts()
          console.log('[retro] 同步更新样本库', { count: matches.length, ids: matches.map(m => m.id) })
        }
        return
      }

      // ===== 首次复盘：自动将复盘文稿加入样本库 =====
      const now = new Date().toLocaleString('zh-CN')
      const base = defaultScores()
      const s = entry.result.scores || ({} as any)
      const robustScores: ScoringDimensions = {
        hook: s.hook ?? base.hook,
        empathy: s.empathy ?? base.empathy,
        density: s.density ?? base.density,
        structure: s.structure ?? base.structure,
        originality: s.originality ?? base.originality,
        socialResonance: s.socialResonance ?? base.socialResonance,
        polish: s.polish ?? base.polish
      }
      const compositeScore = entry.result.compositeScore ?? 0

      function buildSample(platform: Platform, likes: number, views?: number): ScriptRecord {
        return {
          id: generateId('script'),
          content: entry!.content,
          platform,
          link: '',
          actualLikes: likes,
          views,
          likeRate: views && views > 0 ? Math.round(likes / views * 10000) / 100 : undefined,
          tags: [],
          scores: robustScores,
          compositeScore,
          modelVersion: getCurrentModelId(),
          analysis: entry!.result.dimensionAnalysis?.join('；') || `复盘录入 | 预估${entry!.result.minLikes}-${entry!.result.maxLikes} | 实际${likes.toLocaleString()}赞${views ? ' ' + views.toLocaleString() + '播' : ''}`,
          createdAt: now,
          updatedAt: now
        }
      }

      // 主平台样本
      const mainScript = buildSample(entry.platform, actualLikes, actualViews)
      scriptRecords.value.unshift(mainScript)
      autoDecomposeScript(mainScript).catch(() => {})

      // 额外平台样本（复用同一份评分，不再调用 AI）
      let additionalCount = 0
      if (additionalPlatforms && additionalPlatforms.length > 0) {
        for (const ap of additionalPlatforms) {
          const extraScript = buildSample(ap.platform, ap.likes, ap.views)
          scriptRecords.value.unshift(extraScript)
          autoDecomposeScript(extraScript).catch(() => {})
          additionalCount++
        }
      }

      saveScripts()
      console.log('[retro] 完成', { id: mainScript.id, total: scriptRecords.value.length, additionalPlatforms: additionalCount, scores: Object.keys(robustScores) })

      // 偏差过大时额外警告
      if (entry.deviation && Math.abs(entry.deviation) > 50) {
        const dir = entry.deviation > 0 ? '低估' : '高估'
      }
      // 数据入库后异步刷新账号人格画像（不阻塞UI）
      setTimeout(() => {
        if (scriptRecords.value.filter(r => r.scores && r.compositeScore > 0).length >= 3) {
          analyzeCorrelations().catch(err => console.warn('[retro] 相关性分析失败', err))
        }
      }, 500)
    } catch (e: any) {
      console.error('[retro] 失败', e)
      ElMessage.error('复盘失败：' + (e.message || '未知错误'))
    }
  }

  /** AI 复盘：对预测结果进行深度审核，审核完成后自动加入样本库 */
  async function aiReviewPrediction(predictionId: string) {
    const entry = predictionHistory.value.find(e => e.id === predictionId)
    if (!entry) { ElMessage.warning('未找到预测记录'); return }

    // 如果已复盘过，直接跳过
    if (entry.actualLikes != null) {
      ElMessage.warning('该预测已复盘，无需重复操作')
      return
    }

    isReviewingPrediction.value = true
    try {
      // 1. 构建审核 prompt
      const dimSummary = SCORING_DIMENSION_CONFIG.map(d => {
        const score = entry.result.scores[d.key]
        return `${d.label}：${score}分`
      }).join('、')

      const bestRefs = entry.result.referencedSamples?.slice(0, 2).map((r, i) =>
        `参考样本${i + 1}：${r.snippet}（${r.similarityReason}）`
      ).join('\n') || '无'

      const prompt = `你是短视频内容评估专家。请对以下 AI 预测进行深度复盘审核。

【预测内容】
${entry.content.slice(0, 500)}${entry.content.length > 500 ? '...' : ''}

【预测结果】
- 预估点赞区间：${entry.result.minLikes} ~ ${entry.result.maxLikes}
- 综合模型分：${entry.result.compositeScore}
- 7维评分：${dimSummary}
${entry.result.bucketProbabilities?.length ? '- 概率分布：' + entry.result.bucketProbabilities.map(b => `${b.label} ${b.probability}%`).join(' | ') : ''}
${entry.result.confidence ? '- 置信度：' + entry.result.confidence : ''}
${bestRefs ? '参考样本：\n' + bestRefs : ''}

请完成以下审核：
1. **预测合理性**：该预测点赞量和7维评分是否合理？有无明显矛盾？（如：某维度很低但综合分很高，或预测点赞远超内容质量）
2. **内容亮点**：这段文稿中哪些元素最可能驱动传播？（具体到段落）
3. **改进空间**：如果要大幅提升该文稿的传播力，最优先优化什么？
4. **测算实际点赞**：基于内容质量和平台特性，你作为独立评审，认为该文稿发布后的实际点赞量大约在什么区间？请给出一个合理的估算值（如5000-8000）。

输出格式：
【合理性】
...
【内容亮点】
...
【改进空间】
...
【测算点赞】X ~ Y 赞`

      const review = await callAI('', prompt, 0.3)

      // 2. 解析测算点赞
      const likeMatch = review.match(/(\d+[万k]?)\s*[~～-]\s*(\d+[万k]?)\s*赞/)
      let estimatedMin = 0
      let estimatedMax = 0
      if (likeMatch) {
        const parse = (s: string) => {
          if (s.endsWith('万')) return Math.round(parseFloat(s) * 10000)
          if (s.endsWith('k')) return Math.round(parseFloat(s) * 1000)
          return parseInt(s, 10)
        }
        estimatedMin = parse(likeMatch[1])
        estimatedMax = parse(likeMatch[2])
        if (estimatedMin > estimatedMax) [estimatedMin, estimatedMax] = [estimatedMax, estimatedMin]
      }
      const estimatedMid = estimatedMin > 0 ? Math.round((estimatedMin + estimatedMax) / 2) : undefined

      // 3. 更新预测日志
      entry.actualLikes = estimatedMid ?? entry.result.minLikes
      entry.actualViews = undefined
      entry.retroAt = new Date().toLocaleString('zh-CN')
      entry.retroNote = `AI复盘审核 | ${review.slice(0, 200).replace(/\n/g, ' ')}`
      const predictedMid = (entry.result.minLikes + entry.result.maxLikes) / 2
      entry.deviation = Math.round((entry.actualLikes - predictedMid) / predictedMid * 100)
      savePredictionHistory()

      // 4. 保存 AI 审核结果供展示
      aiReviewResult.value = {
        contentId: predictionId,
        analysis: review,
        reviewedAt: new Date().toLocaleString('zh-CN')
      }

      // 5. 加入样本库
      const now = new Date().toLocaleString('zh-CN')
      const s = entry.result.scores || ({} as any)
      const base = defaultScores()
      const robustScores: ScoringDimensions = {
        hook: s.hook ?? base.hook,
        empathy: s.empathy ?? base.empathy,
        density: s.density ?? base.density,
        structure: s.structure ?? base.structure,
        originality: s.originality ?? base.originality,
        socialResonance: s.socialResonance ?? base.socialResonance,
        polish: s.polish ?? base.polish
      }
      const script: ScriptRecord = {
        id: generateId('script'),
        content: entry.content,
        platform: entry.platform,
        link: '',
        actualLikes: entry.actualLikes,
        views: undefined,
        likeRate: undefined,
        tags: [],
        scores: robustScores,
        compositeScore: entry.result.compositeScore ?? 0,
        modelVersion: getCurrentModelId(),
        analysis: `AI复盘 | 预估${entry.result.minLikes}-${entry.result.maxLikes} | AI测算${entry.actualLikes.toLocaleString()}赞 | 偏差${entry.deviation}% | ${review.slice(0, 150).replace(/\n/g, '；')}`,
        createdAt: now,
        updatedAt: now
      }
      scriptRecords.value.unshift(script)
      saveScripts()
      console.log('[ai-retro] 完成', { id: script.id, total: scriptRecords.value.length })

      // 后台拆解 + 刷新画像
      autoDecomposeScript(script).catch(() => {})
      setTimeout(() => {
        if (scriptRecords.value.filter(r => r.scores && r.compositeScore > 0).length >= 3) {
          analyzeCorrelations().catch(err => console.warn('[ai-retro] 相关性分析失败', err))
        }
      }, 500)

      ElMessage.success('AI 复盘完成，已同步至样本库')
    } catch (e: any) {
      console.error('[ai-retro] 失败', e)
      ElMessage.error('AI 复盘失败：' + (e.message || '未知错误'))
    } finally {
      isReviewingPrediction.value = false
    }
  }

  /** 找最佳参考样本 */
  function findBestReferenceSamples(
    newScores: ScoringDimensions,
    newComposite: number,
    platform: Platform
  ): PredictionResult['referencedSamples'] {
    const candidates = scriptRecords.value
      .filter(s => s.platform === platform || s.actualLikes >= 5000)
      .map(s => {
        // 计算欧几里得距离（各维度差值的平方和）
        let dist = 0
        for (const d of SCORING_DIMENSION_CONFIG) {
          dist += Math.pow(s.scores[d.key] - newScores[d.key], 2)
        }
        dist = Math.sqrt(dist / SCORING_DIMENSION_CONFIG.length)

        // 找最相似维度
        const closestDims: string[] = []
        for (const d of SCORING_DIMENSION_CONFIG) {
          if (Math.abs(s.scores[d.key] - newScores[d.key]) <= 8) {
            closestDims.push(d.label)
          }
        }

        return {
          scriptId: s.id,
          snippet: s.content.slice(0, 80) + (s.content.length > 80 ? '...' : ''),
          actualLikes: s.actualLikes,
          compositeScore: s.compositeScore,
          platform: s.platform,
          similarityReason: closestDims.length >= 3
            ? `${closestDims.slice(0, 3).join('、')}维度高度相似（综合距离${dist.toFixed(1)}）`
            : `综合评分接近（差${Math.abs(s.compositeScore - newComposite)}分，距离${dist.toFixed(1)}）`,
          distance: dist
        }
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4)

    return candidates.map(({ scriptId, snippet, actualLikes, compositeScore, platform: p, similarityReason }) =>
      ({ scriptId, snippet, actualLikes, compositeScore, platform: p, similarityReason })
    )
  }

  /** 权重升级验证：对比新旧权重在样本库上的排序准确性 */
  async function validateWeights(newWeights: Record<string, number>): Promise<WeightValidationResult> {
    const samples = scriptRecords.value
    if (samples.length < 5) {
      throw new Error('样本数量不足，至少需要 5 条才能验证权重')
    }

    isValidatingWeights.value = true
    try {
      // 获取旧权重
      const oldWeights = { ...customWeights.value }

      // 用新旧权重分别重算综合分
      const rows = samples.map(s => ({
        id: s.id,
        snippet: s.content.slice(0, 60),
        actualLikes: s.actualLikes,
        oldScore: calcCompositeScore(s.scores, Object.keys(oldWeights).length > 0 ? oldWeights : undefined),
        newScore: calcCompositeScore(s.scores, Object.keys(newWeights).length > 0 ? newWeights : undefined),
      }))
      // 按实际点赞量降序排序，确保相邻对验证有意义
      rows.sort((a, b) => b.actualLikes - a.actualLikes)

      // 按实际点赞量排真实排名（1 = 最高赞）
      const sortedByLikes = [...rows].sort((a, b) => b.actualLikes - a.actualLikes)
      const actualRankMap = new Map<string, number>()
      sortedByLikes.forEach((r, i) => actualRankMap.set(r.id, i + 1))

      // 按旧分数排名
      const sortedByOld = [...rows].sort((a, b) => b.oldScore - a.oldScore)
      const oldRankMap = new Map<string, number>()
      sortedByOld.forEach((r, i) => oldRankMap.set(r.id, i + 1))

      // 按新分数排名
      const sortedByNew = [...rows].sort((a, b) => b.newScore - a.newScore)
      const newRankMap = new Map<string, number>()
      sortedByNew.forEach((r, i) => newRankMap.set(r.id, i + 1))

      // 计算 Spearman 秩相关系数: r_s = 1 - (6 * Σd²) / (n * (n² - 1))
      function spearmanRank(rankFn: (id: string) => number, n: number): number {
        let sumD2 = 0
        for (const r of rows) {
          const actualRank = actualRankMap.get(r.id)!
          const predictedRank = rankFn(r.id)
          const d = actualRank - predictedRank
          sumD2 += d * d
        }
        return 1 - (6 * sumD2) / (n * (n * n - 1))
      }

      const n = rows.length
      const oldR = spearmanRank(id => oldRankMap.get(id)!, n)
      const newR = spearmanRank(id => newRankMap.get(id)!, n)

      // 计算 Pairwise 排序一致性：对所有配对 (i,j)，检查评分排名与点赞排名是否同向
      function pairwiseAccuracy(rankFn: (id: string) => number): number {
        let correct = 0
        let total = 0
        for (let i = 0; i < rows.length; i++) {
          for (let j = i + 1; j < rows.length; j++) {
            total++
            const aWinsLike = rows[i].actualLikes > rows[j].actualLikes
            const aWinsScore = rankFn(rows[i].id) < rankFn(rows[j].id) // 排名越小越好
            if (aWinsLike === aWinsScore) correct++
          }
        }
        return total > 0 ? Math.round(correct / total * 100) : 0
      }

      const oldPw = pairwiseAccuracy(id => oldRankMap.get(id)!)
      const newPw = pairwiseAccuracy(id => newRankMap.get(id)!)

      // 构建判决
      let verdict = ''
      if (newR > oldR) {
        const diff = ((newR - oldR) * 100).toFixed(1)
        verdict = `✅ 新权重更优：秩相关系数从 ${(oldR * 100).toFixed(1)}% 提升到 ${(newR * 100).toFixed(1)}%（+${diff}个百分点）。建议升级。`
      } else if (Math.abs(newR - oldR) < 0.02) {
        verdict = `⚖️ 新旧权重排序准确性基本持平（旧 ${(oldR * 100).toFixed(1)}% vs 新 ${(newR * 100).toFixed(1)}%）。升级收益不明显，可保持当前公式。`
      } else {
        const diff = ((oldR - newR) * 100).toFixed(1)
        verdict = `❌ 新权重不如旧权重：秩相关系数从 ${(oldR * 100).toFixed(1)}% 降到 ${(newR * 100).toFixed(1)}%（-${diff}个百分点）。不建议升级，请重新调整权重。`
      }

      // 权重差异明细
      const DEFAULT: Record<string, number> = { hook: 18, empathy: 14, density: 16, structure: 14, originality: 16, socialResonance: 12, polish: 10 }
      const effectiveOld = Object.keys(oldWeights).length > 0 ? oldWeights : DEFAULT
      const effectiveNew = Object.keys(newWeights).length > 0 ? newWeights : DEFAULT
      const weightDiffs = SCORING_DIMENSION_CONFIG.map(d => ({
        key: d.key,
        label: d.label,
        old: effectiveOld[d.key] || 0,
        new: effectiveNew[d.key] || 0,
        diff: (effectiveNew[d.key] || 0) - (effectiveOld[d.key] || 0)
      })).filter(d => d.diff !== 0)

      // 逐样本明细
      const sampleDetails = rows.map(r => ({
        id: r.id,
        snippet: r.snippet,
        actualLikes: r.actualLikes,
        oldScore: r.oldScore,
        newScore: r.newScore,
        oldRank: oldRankMap.get(r.id)!,
        newRank: newRankMap.get(r.id)!,
        actualRank: actualRankMap.get(r.id)!
      })).sort((a, b) => b.actualLikes - a.actualLikes)

      // 相邻对验证（与 validateWeightProposal 对齐）
      let oldCorrect = 0, newCorrect = 0
      const pairs: WeightValidationResult['pairs'] = []
      for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i], b = rows[i + 1]
        const oldOk = a.oldScore >= b.oldScore
        const newOk = a.newScore >= b.newScore
        if (oldOk) oldCorrect++
        if (newOk) newCorrect++
        pairs.push({
          aOld: Math.round(a.oldScore), aNew: Math.round(a.newScore),
          bOld: Math.round(b.oldScore), bNew: Math.round(b.newScore),
          aLikes: a.actualLikes, bLikes: b.actualLikes, oldOk, newOk
        })
      }
      const totalPairs = pairs.length
      const oldRate = totalPairs > 0 ? oldCorrect / totalPairs : 0
      const newRate = totalPairs > 0 ? newCorrect / totalPairs : 0
      const passed = newRate >= 0.8 && newRate >= oldRate
      const recommendation = passed
        ? `审核通过：新权重在 ${totalPairs} 对样本中正确率 ${Math.round(newRate * 100)}%（旧 ${Math.round(oldRate * 100)}%），建议应用`
        : newRate < 0.8
          ? `审核未通过：新权重正确率仅 ${Math.round(newRate * 100)}%，未达 80% 门槛。建议收集更多数据后再试`
          : `审核未通过：新权重正确率 ${Math.round(newRate * 100)}% 低于旧权重 ${Math.round(oldRate * 100)}%，建议保留旧权重`

      const result: WeightValidationResult = {
        passed, oldCorrect, newCorrect, totalPairs, oldRate, newRate,
        pairs, recommendation,
        verdict,
        oldRankCorrelation: Math.round(oldR * 10000) / 100,
        newRankCorrelation: Math.round(newR * 10000) / 100,
        oldPairwiseAccuracy: oldPw,
        newPairwiseAccuracy: newPw,
        weightDiffs,
        sampleCount: n,
        sampleDetails
      }

      weightValidationResult.value = result
      return result
    } finally { isValidatingWeights.value = false }
  }

  function clearScripts() {
    scriptRecords.value = []; patternSummary.value = null; writingFramework.value = null; lastPrediction.value = null; predictionHistory.value = []
    saveScripts(); localStorage.removeItem(patternKey(currentAccountId.value)); localStorage.removeItem(frameworkKey(currentAccountId.value))
    savePredictionHistory()
  }

  // ===== Tab 切换 =====
  const activeTab = ref<'analysis' | 'prediction' | 'chat'>(loadActiveTab())

  function loadActiveTab(): 'analysis' | 'prediction' | 'chat' {
    try { const v = localStorage.getItem(TAB_KEY); return (v === 'prediction' || v === 'chat') ? v : 'analysis' } catch { return 'analysis' }
  }
  function switchTab(tab: 'analysis' | 'prediction' | 'chat') { activeTab.value = tab; localStorage.setItem(TAB_KEY, tab) }

  return {
    // 账号
    accounts, currentAccountId, currentAccount, accountName,
    addAccount, switchAccount, deleteAccount, renameAccount,
    isLoadingAccount, platformAccounts, userProfile,
    searchAccount,

    // 对话
    messages, conversationHistory, addMessage, clearMessages,

    // 文案建议
    suggestions, isGeneratingSuggestion, generateSuggestions,

    // 文案分析状态
    isAnalyzing,

    // 点赞预测
    scriptRecords, sortedScripts, thresholdFilteredScripts, platformStats,
    isAnalyzingScript, isPredicting, isSummarizing, isGeneratingFramework, isValidatingWeights, isGeneratingBump,
    patternSummary, writingFramework, lastPrediction, predictionHistory, customWeights, customCriteria,
    pendingReviewCount, deviationTrend,
    bumpSuggestion,
    evolutionMetrics, weightChangeLog,
    weightValidationResult,
    predictSubTab, switchPredictSubTab,
    scriptsByPlatform, addScript, updateScript, deleteScript,
    reAnalyzeScript, generatePatternSummary, generateWritingFramework,
    reloadPatternSummary, reloadFramework, updateCustomWeights, resetCustomWeights,
    updateCustomCriteria, resetCustomCriteria,
    predictLikes, retroPrediction, aiReviewPrediction, loadHistoryEntry, deletePredictionHistoryEntry, clearScripts, validateWeights,
    isReviewingPrediction, aiReviewResult,
    generateBumpSuggestion, applyBumpWeights, dismissBumpSuggestion,
    autoCalibrateEnabled, toggleAutoCalibrate,
    lastAnalysisResult, analyzeCorrelations, generateAIAnalysisReport,
    crossAuditResult, crossAuditWeightResult, crossModelAudit, crossAuditWeightUpgrade, scoringDisagreements, predictDisagreements,
    rewriteComparison, pendingGeneratedContent, generateContent, improveContent,
    exportJSON, downloadJSON, importJSON, resetToBuiltIn,
    // 数据驱动权重 & 账号人格画像
    accountPersonality, dimensionCorrelationHistory,
    deriveWeightsFromData, applyDataDrivenWeights,
    // 受众画像
    audienceProfile, audienceLoading, generateAudienceProfile,
    // 内容拆解
    lastDecomposition, decomposing, decomposeEnabledForChat, toggleDecomposeForChat, decomposeContent,
    autoDecomposeScript, decompositionAnalysis, analyzingDecompositions,
    getDecompositionCoverage, analyzeDecompositions, decomposeScriptById,
    // 高赞阈值
    highLikeThresholds, DEFAULT_HIGH_LIKE_THRESHOLDS, setHighLikeThreshold, resetHighLikeThresholds,

    // Tab 切换
    activeTab, switchTab
  }
})
