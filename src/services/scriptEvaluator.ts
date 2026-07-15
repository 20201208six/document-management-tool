// ===== 共享评分服务 =====
// Unique Mode 和官方工作流共用评分类型、常量和纯函数。
// 数据隔离：此文件不含任何 store 引用，不接触 sample library / regression model。

// ===== 类型定义 =====

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

/** 7维评分维度（受众需求锚定，存储时x20映射为0-100） */
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
    {
      key: 'hook', label: '开场钩子', desc: '前3秒能否让受众划不走', color: '#f56c6c', rubric: [
        '无具体指向，泛泛而谈，受众没有任何"这是在对我说"的感觉',
        '提到了一个普遍话题但没对准具体困惑，受众可能好奇但不一定被击中',
        '明确指向了某个群体共有的困境，受众产生"这说的是我的事"的识别感',
        '精准命中受众心中正在纠结但还没想清楚的问题，受众感到"你怎么知道我在想这个"',
        '一击命中受众最隐秘的困惑，产生强烈的被看穿感和不可划走的本能反应'
      ]
    },
    {
      key: 'empathy', label: '沉浸共鸣', desc: '是否让受众觉得「这说的就是我」', color: '#e6a23c', rubric: [
        '与受众无关的抽象话题，没有任何代入路径',
        '泛泛涉及了可能与受众相关的话题，但停留在表面',
        '说出了受众心里知道但没表达出来的感受，产生"对，就是这样"的认可',
        '不仅说出了受众的感受，还帮他们理清了情绪的来龙去脉，产生被解读的深层满足',
        '受众感到"这个人说出了我一直想说但说不清的东西"，产生强烈的精神连接'
      ]
    },
    {
      key: 'density', label: '干货密度', desc: '每段是否都在提供新知，不注水', color: '#9b59b6', rubric: [
        '翻来覆去讲一个已知道理，没有任何新认知',
        '有1个有价值的角度但展开拖沓，信息稀疏',
        '2-3个递进的解释角度，每个角度都有信息增量',
        '持续提供新的理解框架，每个段落都让受众对问题的理解更进一层',
        '全程高密度输出，受众感觉"每句话都在刷新我对这个问题的认知"'
      ]
    },
    {
      key: 'structure', label: '节奏掌控', desc: '受众是否经历了「被戳中→被解读→被点醒」', color: '#1abc9c', rubric: [
        '流水账，没有情绪引导，受众看完没有感受变化',
        '有基本的结构但缺乏情绪起伏，受众看完和看完前感觉差不多',
        '有清晰的起承转合，受众经历了从困惑到理解的感受变化',
        '结构精心设计，受众经历了被理解→被解释→被给予希望的完整情绪弧线',
        '情绪路径如大师布局，受众经历多轮"啊！原来是这个原因→那我该怎么做→原来如此"的认知升级'
      ]
    },
    {
      key: 'originality', label: '人设差异', desc: '换个同行来讲，是否就没这个味儿了', color: '#e74c3c', rubric: [
        '重复同赛道常见观点，换个同行也能讲，无差异',
        '有个人经历但不独特，同行用类似角度也能覆盖',
        '有独特的解读角度或案例组合，同行不太容易复制',
        '"只有这个人能讲"的内容，结合了独特的经验/案例/表达方式',
        '开创性洞察，为赛道带来了全新的理解维度，受众从未听过这个角度的解读'
      ]
    },
    {
      key: 'socialResonance', label: '传播共鸣', desc: '是否让受众产生「必须转给谁看」的冲动', color: '#3498db', rubric: [
        '纯个人琐事，与任何群体性困境无关',
        '提及了某个社会话题但没有切中痛点，共鸣面窄',
        '触及了一个具体的人群困境，相关群体能对号入座',
        '准确命名了一个"人人都感觉到但没人说清"的人生阶段困境，具备自发传播动力',
        '击中了某一人生阶段核心的未被言说的集体隐痛，让受众产生"终于有人说出来了"的转发冲动'
      ]
    },
    {
      key: 'polish', label: '可信背书', desc: '是否让人觉得你说的有根据、不忽悠', color: '#409eff', rubric: [
        '语言粗糙/夸张/无根据，受众感到"这是忽悠"',
        '基本通顺但缺乏可信度背书，受众半信半疑',
        '语言流畅工整，有一定可信度支撑（如引经据典/案例佐证）',
        '文字考究有节制，引用/案例/逻辑完整，受众感到"这个人是真懂的"',
        '每个论断都建立在可感知的根基上，受众感到"这不是在说服我，是在帮我看到真相"'
      ]
    }
  ]

/** 平台合规检查结果 */
export interface PlatformCompliance {
  hasViolation: boolean
  violations: string[]
  styleMatch: number    // 0-100
  suggestions: string[]
}

/** 结构链节点评测 */
export interface StructureNodeEval {
  score: number        // 0-100
  feedback: string
  contrast: boolean    // 有反差
  cognition: boolean   // 破认知
  resonance: boolean   // 高共鸣
}

/** 结构链评测（选题→话题→开头→衔接→内容→落地） */
export interface StructureChainEval {
  topic: StructureNodeEval
  angle: StructureNodeEval
  opening: StructureNodeEval
  transition: StructureNodeEval
  body: StructureNodeEval
  landing: StructureNodeEval
}

/** 人设锚定评测 */
export interface PersonaEval {
  ageMatch: number        // 0-100
  ageFeedback: string
  trackTrust: number      // 0-100
  trackTrustFeedback: string
}

/** 结果价值评测 */
export interface ValueEval {
  practicality: number    // 0-100
  practicalityFeedback: string
  gain: number            // 0-100
  gainFeedback: string
  easyExecute: number     // 0-100
  easyExecuteFeedback: string
}

/** 转化效果评测 */
export interface ConversionEval {
  attractiveness: number      // 0-100
  attractivenessFeedback: string
  trust: number               // 0-100
  trustFeedback: string
}

/** 完整文案评测结果（五层） */
export interface TextEvaluation {
  structure: StructureChainEval
  contentQuality: ScoringDimensions
  persona: PersonaEval
  value: ValueEval
  conversion: ConversionEval
  compositeScore: number
  summary: string
  fiveLogic?: FiveLogicReport
}

/** 五逻辑报告层：将七维评分 + 五层评测映射为业务逻辑分值 */
export interface FiveLogicScores {
  traffic: number
  platform: number
  user: number
  business: number
  spread: number
}

export interface FiveLogicReport {
  scores: FiveLogicScores
  platformCheck: PlatformCompliance | null
  analysis: Record<string, string>
}

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

// ===== 纯函数 =====

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

/** 计算七维综合评分（加权平均） */
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

/** 从 AI 返回文本中解析 7 维分数 */
export function parseScores(text: string): ScoringDimensions {
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
    const regex = new RegExp(`${label}[：:]\\s*(\\d+(?:\\.\\d+)?)`, 'i')
    const match = text.match(regex)
    if (match) {
      const rawVal = parseFloat(match[1])
      const val = rawVal <= 5 ? Math.round(rawVal * 20) : Math.max(0, Math.min(100, rawVal))
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

/** 辅助：从文本中解析单个维度 */
export function parseDimension(text: string, key: string, label: string): { score: number; feedback: string } {
  const regex = new RegExp(`${key}[：:]\\s*(\\d+(?:\\.\\d+)?)\\s*\\|\\s*(.+?)(?:\\n|$)`, 'i')
  const match = text.match(regex)
  if (match) {
    const rawVal = parseFloat(match[1])
    return {
      score: rawVal <= 5 ? Math.round(rawVal * 20) : Math.max(0, Math.min(100, rawVal)),
      feedback: match[2].trim()
    }
  }
  return { score: 60, feedback: '' }
}

/** 构建单个逻辑层的文字分析 */
export function buildLogicAnalysis(
  name: string,
  totalScore: number,
  dims: Array<{ label: string; score: number }>
): string {
  const parts = dims.map(d => `${d.label}: ${d.score}分`)
  const level = totalScore >= 80 ? '优秀' : totalScore >= 65 ? '良好' : totalScore >= 50 ? '一般' : '需提升'
  return `${name}综合 ${totalScore} 分（${level}）| ${parts.join(' | ')}`
}

/** 七维 + 五层评测 -> 五逻辑报告映射（纯本地计算，不依赖 AI） */
export function mapToFiveLogic(
  scores: ScoringDimensions,
  persona: PersonaEval,
  value: ValueEval,
  platformCheck: PlatformCompliance | null
): FiveLogicReport {
  const traffic = Math.round(
    scores.hook * 0.45 +
    scores.originality * 0.30 +
    scores.structure * 0.25
  )

  const platformBase = scores.polish * 0.5
  const platformScore = platformCheck
    ? Math.round(platformBase * 0.5 + platformCheck.styleMatch * 0.5)
    : Math.round(platformBase)

  const user = Math.round(
    scores.empathy * 0.35 +
    scores.socialResonance * 0.30 +
    persona.trackTrust * 0.25 +
    persona.ageMatch * 0.10
  )

  const business = Math.round(
    scores.density * 0.30 +
    scores.originality * 0.25 +
    value.practicality * 0.20 +
    value.gain * 0.15 +
    value.easyExecute * 0.10
  )

  const spread = Math.round(
    scores.hook * 0.25 +
    scores.empathy * 0.20 +
    scores.socialResonance * 0.20 +
    scores.structure * 0.20 +
    scores.polish * 0.15
  )

  const analysis: Record<string, string> = {
    traffic: buildLogicAnalysis('流量逻辑', traffic, [
      { label: '话题引力', score: scores.hook },
      { label: '人设差异', score: scores.originality },
      { label: '节奏掌控', score: scores.structure }
    ]),
    platform: buildLogicAnalysis('平台逻辑', platformScore, [
      { label: '执行质量', score: scores.polish },
      { label: '平台匹配', score: platformCheck?.styleMatch ?? 60 }
    ]),
    user: buildLogicAnalysis('用户逻辑', user, [
      { label: '沉浸共鸣', score: scores.empathy },
      { label: '传播共鸣', score: scores.socialResonance },
      { label: '赛道信任', score: persona.trackTrust },
      { label: '年龄匹配', score: persona.ageMatch }
    ]),
    business: buildLogicAnalysis('商业逻辑', business, [
      { label: '干货密度', score: scores.density },
      { label: '人设差异', score: scores.originality },
      { label: '实用性', score: value.practicality },
      { label: '收获感', score: value.gain }
    ]),
    spread: buildLogicAnalysis('传播逻辑', spread, [
      { label: '开场钩子', score: scores.hook },
      { label: '节奏掌控', score: scores.structure },
      { label: '执行质量', score: scores.polish },
      { label: '沉浸共鸣', score: scores.empathy },
      { label: '传播共鸣', score: scores.socialResonance }
    ])
  }

  return {
    scores: { traffic, platform: platformScore, user, business, spread },
    platformCheck,
    analysis
  }
}

/** 计算五层综合分 */
export function calcFullCompositeScore(
  contentQuality: ScoringDimensions,
  structure: StructureChainEval,
  persona: PersonaEval,
  value: ValueEval,
  conversion: ConversionEval,
  customWeights?: Record<string, number>
): number {
  const layers = {
    structure: 0.25,
    contentQuality: 0.35,
    persona: 0.10,
    value: 0.15,
    conversion: 0.15
  }

  const structNodes = [structure.topic, structure.angle, structure.opening, structure.transition, structure.body, structure.landing]
  const structScore = structNodes.reduce((s, n) => s + n.score, 0) / structNodes.length

  const sevenDimScore = calcCompositeScore(contentQuality, customWeights)
  const personaScore = (persona.ageMatch + persona.trackTrust) / 2
  const valueScore = (value.practicality + value.gain + value.easyExecute) / 3
  const conversionScore = (conversion.attractiveness + conversion.trust) / 2

  const total = structScore * layers.structure
    + sevenDimScore * layers.contentQuality
    + personaScore * layers.persona
    + valueScore * layers.value
    + conversionScore * layers.conversion

  return Math.round(total)
}

// ===== Prompt 模板 =====

/** 五层统一评测 prompt（含七维 rubric） */
export const UNIFIED_EVALUATION_PROMPT = `你是短视频文案评估专家。请对以下文稿完成五层评测。每题1-5分（精确到0.5级），每题附一句话理由。

⚠️ 传播链关注：在评测过程中，请特别关注以下传播逻辑节点——
- 时长节奏：内容的密度和时长是否匹配？有没有废话段或"赶节奏"的感觉？
- 易懂度：目标受众能不能轻松理解？有没有过高的认知门槛（专业术语/复杂逻辑）？
- 落脚记忆：最后几句话有没有让人"记住"或"想转发"的力量？结尾是否白开水？

${SCORING_DIMENSION_CONFIG.map(d =>
    `【${d.label}】${d.desc}
  1 = ${d.rubric[0]}
  2 = ${d.rubric[1]}
  3 = ${d.rubric[2]}
  4 = ${d.rubric[3]}
  5 = ${d.rubric[4]}`
  ).join('\n')}

## 第一层：结构链 + 贯穿基因

请沿「选题→话题→开头→衔接→内容→落地」六个节点逐一评测，每个节点判断：
- 得分（1-5）：该节点的质量
- 是否有「反差」：打破受众预期
- 是否有「破认知」：提供新的理解维度
- 是否有「高共鸣」：击中情绪或身份认同
## 第三层：人设锚定
- 年龄匹配度：这个年龄的人说这些话合适吗？措辞、阅历、表达方式是否符合
- 赛道信任度：在这个赛道下，受众凭什么信你说的？是否有信任支撑

## 第四层：结果价值
- 实用性：看完能用吗？有没有可操作的东西
- 收获感：看完觉得学到了吗？有没有信息增量
- 易执行：给的方法/建议是不是真的能落地

## 第五层：转化效果
- 吸引力（这次想看）：这条内容抓得住人吗
- 信任度（下次还看）：下次刷到你还愿意停下来看吗

【输出格式】
严格按照以下格式输出，每个节点独立标注：

# 结构链
## 选题
得分: 3 | 反差: 是 | 破认知: 否 | 高共鸣: 是 | 理由: 选择了职场转型这个话题，切中普遍焦虑
## 话题
得分: 4 | 反差: 是 | 破认知: 是 | 高共鸣: 否 | 理由: 从"降薪转行"这个具体切角进入，有反差感
## 开头
得分: 4 | 反差: 是 | 破认知: 否 | 高共鸣: 是 | 理由: 开头直接抛出数据"70%的人都想过转行"，建立共鸣
## 衔接
得分: 3 | 反差: 否 | 破认知: 否 | 高共鸣: 否 | 理由: 从数据过渡到故事时转折略生硬
## 内容
得分: 4 | 反差: 是 | 破认知: 是 | 高共鸣: 是 | 理由: 用3个真实案例层层递进，有干货有情绪
## 落地
得分: 3 | 反差: 否 | 破认知: 否 | 高共鸣: 是 | 理由: 结尾金句有记忆点但缺乏行动指引

# 七维质量
hook: 4 | 开场使用数据+悬念，瞬间抓人
empathy: 3 | 职场人群对号入座，但未深入内心活动
density: 2 | 观点单一，展开较拖沓
structure: 4 | 钩子→展开→金句→收尾，节奏好
originality: 3 | 有个人视角但不具稀缺性
socialResonance: 4 | 击中了职场内卷的集体情绪
polish: 3 | 通顺工整，有几句出彩

# 人设锚定
ageMatch: 4 | 32岁老师的阅历和措辞恰到好处，没有装嫩也没有说教
trackTrust: 3 | 赛道信任度一般，缺少个人经历背书

# 结果价值
practicality: 3 | 给出了方向但缺少具体的执行步骤
gain: 4 | 对转型问题的分析有深度，有收获感
easyExecute: 2 | 建议偏宏观，普通人不清楚第一步怎么走

# 转化效果
attractiveness: 4 | 选题和开头抓人，吸引力强
trust: 3 | 内容不错但对创作者的信任感没有建立起来

# 综合评述
一段话（2-3句）总结该文稿的整体表现`

/** 解析统一评测输出为一个完整的 TextEvaluation */
export function parseEvaluation(text: string): TextEvaluation {
  const defaultNode = (): StructureNodeEval => ({ score: 60, feedback: '', contrast: false, cognition: false, resonance: false })
  const nodeLabels = ['选题', '话题', '开头', '衔接', '内容', '落地'] as const
  const nodeKeys = ['topic', 'angle', 'opening', 'transition', 'body', 'landing'] as const

  const structure: any = {}
  for (let i = 0; i < nodeLabels.length; i++) {
    const label = nodeLabels[i]
    const key = nodeKeys[i]
    const regex = new RegExp(`## ${label}\\n([\\s\\S]*?)(?=\\n##|\\n#|$)`, 'i')
    const match = text.match(regex)
    if (match) {
      const block = match[1]
      const scoreMatch = block.match(/得分[：:]\s*(\d+(?:\.\d+)?)/i)
      const contrastMatch = /反差[：:]\s*是/i.test(block)
      const cognitionMatch = /破认知[：:]\s*是/i.test(block)
      const resonanceMatch = /高共鸣[：:]\s*是/i.test(block)
      const reasonMatch = block.match(/理由[：:]\s*(.+?)(?:\n|$)/i)
      const rawScore = scoreMatch ? parseFloat(scoreMatch[1]) : 3
      structure[key] = {
        score: rawScore <= 5 ? Math.round(rawScore * 20) : Math.max(0, Math.min(100, rawScore)),
        feedback: reasonMatch ? reasonMatch[1].trim() : '',
        contrast: contrastMatch,
        cognition: cognitionMatch,
        resonance: resonanceMatch
      } as StructureNodeEval
    } else {
      structure[key] = defaultNode()
    }
  }

  const contentQuality = parseScores(text)

  const ageMatch = parseDimension(text, 'ageMatch', '年龄匹配')
  const trackTrust = parseDimension(text, 'trackTrust', '赛道信任')
  const persona: PersonaEval = {
    ageMatch: ageMatch.score,
    ageFeedback: ageMatch.feedback,
    trackTrust: trackTrust.score,
    trackTrustFeedback: trackTrust.feedback
  }

  const practicality = parseDimension(text, 'practicality', '实用性')
  const gain = parseDimension(text, 'gain', '收获感')
  const easyExecute = parseDimension(text, 'easyExecute', '易执行')
  const value: ValueEval = {
    practicality: practicality.score,
    practicalityFeedback: practicality.feedback,
    gain: gain.score,
    gainFeedback: gain.feedback,
    easyExecute: easyExecute.score,
    easyExecuteFeedback: easyExecute.feedback
  }

  const attractiveness = parseDimension(text, 'attractiveness', '吸引力')
  const trust = parseDimension(text, 'trust', '信任')
  const conversion: ConversionEval = {
    attractiveness: attractiveness.score,
    attractivenessFeedback: attractiveness.feedback,
    trust: trust.score,
    trustFeedback: trust.feedback
  }

  const summaryMatch = text.match(/综合评述[：:]\s*([\s\S]*?)$/i)
  const summary = summaryMatch ? summaryMatch[1].trim() : ''

  const compositeScore = calcFullCompositeScore(contentQuality, structure as StructureChainEval, persona, value, conversion)

  return {
    structure: structure as StructureChainEval,
    contentQuality,
    persona,
    value,
    conversion,
    compositeScore,
    summary
  }
}

// ===== 七维仅评分 prompt（轻量，不含五层评测） =====

export const SEVEN_DIM_SCORING_PROMPT = `你是短视频文案评分专家。请对以下文案进行七维评分。每题1-5分（精确到0.5级），每题附一句话理由。

${SCORING_DIMENSION_CONFIG.map(d =>
    `【${d.label}】${d.desc}
  1 = ${d.rubric[0]}
  2 = ${d.rubric[1]}
  3 = ${d.rubric[2]}
  4 = ${d.rubric[3]}
  5 = ${d.rubric[4]}`
  ).join('\n')}

输出格式：
hook: 4 | 理由
empathy: 3 | 理由
density: 3 | 理由
structure: 4 | 理由
originality: 3 | 理由
socialResonance: 4 | 理由
polish: 3 | 理由`
