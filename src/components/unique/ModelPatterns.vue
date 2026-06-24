<template>
  <div class="model-patterns">
    <div class="mp-body">
      <!-- 双栏：当前归纳 + 评分维度 -->
      <div class="mp-row">
        <div class="mp-card">
          <div class="mpc-header">
            <span class="mpc-title">📋 当前归纳</span>
            <span class="mpc-badge" :class="store.patternSummary ? 'generated' : ''">
              {{ store.patternSummary ? '已生成' : '未生成' }}
            </span>
          </div>

          <div v-if="store.patternSummary && !store.isSummarizing" class="mpc-content">
            <!-- 高赞规律 -->
            <div v-if="store.patternSummary.highLikePatterns.length" class="mp-section">
              <div class="mp-section-title">✅ 高赞规律</div>
              <div class="mp-insight-list">
                <div v-for="(p, i) in store.patternSummary.highLikePatterns" :key="'h' + i" class="mp-insight-item">
                  <span class="mpii-dot">●</span>
                  <span class="mpii-text" v-html="fmtText(p)"></span>
                </div>
              </div>
            </div>

            <!-- 低赞通病 -->
            <div v-if="store.patternSummary.lowLikePatterns.length" class="mp-section">
              <div class="mp-section-title warn">⚠️ 低赞通病</div>
              <div class="mp-insight-list">
                <div v-for="(p, i) in store.patternSummary.lowLikePatterns" :key="'l' + i" class="mp-insight-item low">
                  <span class="mpii-dot low">●</span>
                  <span class="mpii-text" v-html="fmtText(p)"></span>
                </div>
              </div>
            </div>

            <!-- 平台差异 -->
            <div v-if="store.patternSummary.platformDifferences" class="mp-section">
              <div class="mp-section-title">📱 平台差异 & 权重洞察</div>
              <div class="mp-platform-cards">
                <div v-for="(line, i) in splitLines(store.patternSummary.platformDifferences)" :key="'pd' + i" class="mppc-item">
                  <span class="mppc-text" v-html="fmtText(line)"></span>
                </div>
              </div>
            </div>

            <!-- 关键词推荐 -->
            <div v-if="store.patternSummary.keywordInsights" class="mp-section">
              <div class="mp-section-title">🔑 关键词推荐</div>
              <div class="mp-keyword-tags">
                <template v-for="(kw, i) in extractKeywords(store.patternSummary.keywordInsights)" :key="'kw' + i">
                  <span v-if="kw.type === 'cat'" class="mpkt-cat">{{ kw.text }}</span>
                  <span v-else-if="kw.type === 'intro'" class="mpkt-intro">{{ kw.text }}</span>
                  <span v-else class="mpkt-tag">{{ kw.text }}</span>
                </template>
              </div>
            </div>

            <!-- 统计摘要 -->
            <div class="mp-stats-bar">
              <span class="mpsb-item">📊 {{ store.patternSummary.totalCount }} 条样本</span>
              <span class="mpsb-item">📈 平均 {{ fmtNum(store.patternSummary.overallAvgLikes) }} 赞</span>
            </div>

            <div class="mp-time">生成时间: {{ store.patternSummary.generatedAt }}</div>
          </div>

          <div v-else-if="store.isSummarizing" class="mp-loading">AI 正在归纳规律中...</div>
          <div v-else class="mp-null">点击下方按钮生成</div>

          <div class="mpc-actions">
            <button class="mp-btn" @click="handleGenerate" :disabled="store.isSummarizing">
              {{ store.isSummarizing ? '分析中...' : (store.patternSummary ? '刷新总结' : '生成模型规律') }}
            </button>
          </div>
        </div>

      <!-- 板块2：评分维度 -->
      <div class="mp-card">
        <div class="mpc-header">
          <span class="mpc-title">📊 评分维度</span>
          <span class="mpc-desc">7 项加权综合评分，基于样本库对比预测点赞区间</span>
          <div class="mpc-header-actions">
            <button
              v-if="store.accountPersonality && !editingWeights"
              class="mpc-data-btn"
              @click="handleDataDrivenWeights"
              :disabled="applyingDataWeights"
            >
              📐 数据驱动
            </button>
            <button class="mpc-edit-btn" @click="editingWeights = !editingWeights">
              {{ editingWeights ? '取消编辑' : '更新公式' }}
            </button>
          </div>
        </div>

        <!-- 待处理 bump 提示（非编辑模式） -->
        <div v-if="!editingWeights && store.bumpSuggestion" class="mp-bump-callout" @click="editingWeights = true">
          <span class="mpbc-icon">💡</span>
          <div class="mpbc-body">
            <div class="mpbc-title">有一条 AI 权重升级建议待处理</div>
            <div class="mpbc-desc">AI 分析了复盘数据，建议调整 7 维权重以提升预测准确率。点击此处进入编辑模式查看详情。</div>
          </div>
          <span class="mpbc-arrow">→</span>
        </div>

        <!-- 数据驱动权重提示 -->
        <div v-if="showDataDrivenHint && !editingWeights" class="mp-data-hint">
          <div class="mpdh-title">📐 数据驱动权重建议（基于本账号实际数据）</div>
          <div class="mpdh-desc">
            分析发现，你的账号中 <strong>{{ dataDrivenTop3.join('、') }}</strong> 与点赞量关联最强。
            建议将权重向这些维度倾斜。
          </div>
          <div class="mpdh-weights">
            <div v-for="d in SCORING_DIMENSION_CONFIG" :key="d.key" class="mpdhw-row">
              <span class="mpdhw-label">{{ d.label }}</span>
              <div class="mpdhw-compare">
                <span class="mpdhw-current">{{ dimWeight(d.key) }}%</span>
                <span class="mpdhw-arrow">→</span>
                <span class="mpdhw-suggested" :class="{ changed: dimWeight(d.key) !== (dataDrivenWeights[d.key] ?? 0) }">
                  {{ dataDrivenWeights[d.key] ?? 0 }}%
                </span>
                <span v-if="dimWeight(d.key) !== (dataDrivenWeights[d.key] ?? 0)" class="mpdhw-diff"
                  :class="(dataDrivenWeights[d.key] ?? 0) > dimWeight(d.key) ? 'up' : 'down'">
                  {{ (dataDrivenWeights[d.key] ?? 0) > dimWeight(d.key) ? '+' : '' }}{{ (dataDrivenWeights[d.key] ?? 0) - dimWeight(d.key) }}
                </span>
              </div>
            </div>
          </div>
          <!-- 权重审核结果 -->
          <div class="mp-validation" v-if="store.weightValidationResult">
            <div class="mpv-header">
              <span class="mpv-icon">{{ store.weightValidationResult.passed ? '✅' : '⚠️' }}</span>
              <span class="mpv-title">{{ store.weightValidationResult.passed ? '审核通过' : '审核拦截' }}</span>
            </div>
            <p class="mpv-recommendation">{{ store.weightValidationResult.recommendation }}</p>
            <div class="mpv-summary">
              <span>验证池 {{ store.weightValidationResult.totalPairs + 1 }} 条 → {{ store.weightValidationResult.totalPairs }} 对</span>
              <span>旧 <b :class="store.weightValidationResult.oldRate >= 0.8 ? 'ok' : 'ng'">{{ Math.round(store.weightValidationResult.oldRate * 100) }}%</b></span>
              <span>新 <b :class="store.weightValidationResult.newRate >= 0.8 ? 'ok' : 'ng'">{{ Math.round(store.weightValidationResult.newRate * 100) }}%</b></span>
            </div>
            <details class="mpv-details">
              <summary>查看逐对明细</summary>
              <div class="mpv-pair" v-for="(p, i) in store.weightValidationResult.pairs" :key="i">
                <span class="mpv-pair-idx">#{{ i + 1 }}</span>
                <span class="mpv-pair-content">
                  <span :class="p.oldOk ? '' : 'err'">旧 {{ p.aOld }}≥{{ p.bOld }}</span>
                  <span class="mpv-arrow">→</span>
                  <span :class="p.newOk ? '' : 'err'">新 {{ p.aNew }}≥{{ p.bNew }}</span>
                </span>
                <span :class="p.oldOk && p.newOk ? '' : 'warn'">{{ p.oldOk ? (p.newOk ? '✓✓' : '✓✗') : (p.newOk ? '✗✓' : '✗✗') }}</span>
                <span class="mpv-likes">{{ p.aLikes }}vs{{ p.bLikes }}赞</span>
              </div>
            </details>
            <!-- 跨模型审计 -->
            <div class="mpv-cross" v-if="store.crossAuditWeightResult">
              <div class="mpv-cross-h">
                <span>{{ store.crossAuditWeightResult.passed ? '🤖' : '🤖⚠️' }}</span>
                <span class="mpv-cross-label">跨模型审计</span>
                <span :class="store.crossAuditWeightResult.passed ? 'ok' : 'ng'">{{ store.crossAuditWeightResult.passed ? '双审通过' : '外部驳回' }}</span>
              </div>
              <p class="mpv-cross-v">{{ store.crossAuditWeightResult.verdict }}</p>
            </div>
          </div>
          <div class="mpdh-actions">
            <button class="mp-btn mp-btn-sm mp-btn-primary" @click="handleApplyDataWeights" :disabled="applyingDataWeights">
              {{ applyingDataWeights ? '应用中...' : '✅ 应用数据驱动权重' }}
            </button>
            <button class="mp-btn mp-btn-sm" @click="showDataDrivenHint = false">忽略</button>
          </div>
        </div>

        <!-- 维度列表 -->
        <div class="mpd-list">
          <div v-for="d in SCORING_DIMENSION_CONFIG" :key="d.key" class="mpd-item">
            <div class="mpd-left">
              <div class="mpd-dot" :style="{ background: d.color }"></div>
              <div class="mpd-info">
                <span class="mpd-name">{{ d.label }}</span>
                <span class="mpd-desc-text">{{ d.desc }}</span>
              </div>
            </div>
            <span v-if="!editingWeights" class="mpd-weight">{{ dimWeight(d.key) }}%</span>
            <div v-else class="mpd-weight-edit">
              <button class="wt-btn wt-minus" @click="editWeights[d.key] > 0 && (editWeights[d.key]--)">-</button>
              <input
                class="wt-input" type="number" min="0" max="100" step="1"
                v-model.number="editWeights[d.key]"
              />
              <span class="wt-pct">%</span>
              <button class="wt-btn wt-plus" @click="editWeights[d.key] < 100 && (editWeights[d.key]++)">+</button>
            </div>
          </div>
        </div>

        <!-- 公式操作按钮 -->
        <div v-if="editingWeights" class="mpd-formula-actions">
          <div class="mpfa-total" :class="{ warn: weightTotal !== 100 }">
            权重合计: {{ weightTotal }}%
            <span v-if="weightTotal !== 100" class="mpfa-hint">（建议合计为 100%）</span>
          </div>
          <div class="mpfa-btns">
            <button class="mp-btn mp-btn-sm" @click="handleSaveWeights">保存公式</button>
            <button class="mp-btn mp-btn-sm mp-btn-reset" @click="handleResetWeights">恢复默认</button>
            <button
              class="mp-btn mp-btn-sm mp-btn-validate"
              @click="handleValidateWeights"
              :disabled="store.isValidatingWeights || store.scriptRecords.length < 5"
            >
              {{ store.isValidatingWeights ? '验证中...' : '验证权重' }}
            </button>
          </div>
        </div>

        <!-- Bump 建议面板 -->
        <div v-if="editingWeights && store.bumpSuggestion" class="mp-bump-panel">
          <div class="mpbp-header">
            <span class="mpbp-title">🔧 AI Bump 升级建议</span>
            <span class="mpbp-time">{{ store.bumpSuggestion.generatedAt }}</span>
          </div>
          <div class="mpbp-reasoning" v-for="(line, i) in store.bumpSuggestion.reasoning" :key="'br' + i">
            {{ line }}
          </div>
          <div class="mpbp-weights">
            <div class="mpbpw-title">建议权重调整（点击同步到编辑区）：</div>
            <div v-for="d in SCORING_DIMENSION_CONFIG" :key="d.key" class="mpbpw-row"
                 @click="syncWeight(d.key, store.bumpSuggestion.weights[d.key] ?? 0)"
                 :class="{ changed: (store.bumpSuggestion.weights[d.key] ?? 0) !== (editWeights[d.key] ?? 0) }"
            >
              <span class="mpbpw-label">{{ d.label }}</span>
              <span class="mpbpw-val">
                <span v-if="(store.bumpSuggestion.weights[d.key] ?? 0) !== (editWeights[d.key] ?? 0)" class="mpbpw-old">
                  {{ editWeights[d.key] ?? 0 }}%
                </span>
                <span class="mpbpw-new">{{ store.bumpSuggestion.weights[d.key] ?? 0 }}%</span>
              </span>
            </div>
          </div>
          <div class="mpbp-actions">
            <button class="mpbpa-sync-all" @click="syncAllBumpWeights">📋 一键同步全部</button>
            <button class="mpbpa-accept" @click="store.applyBumpWeights()">✅ 接受并直接升级</button>
            <button class="mpbpa-dismiss" @click="store.dismissBumpSuggestion()">忽略</button>
          </div>
        </div>

        <!-- 验证结果 -->
        <div v-if="store.weightValidationResult && !editingWeights" class="mp-validation">
          <div class="mpv-verdict" :class="verdictClass">{{ store.weightValidationResult.verdict }}</div>
          <div class="mpv-stats">
            <div class="mpvs-item">
              <div class="mpvs-label">旧权重秩相关</div>
              <div class="mpvs-val">{{ store.weightValidationResult.oldRankCorrelation }}%</div>
            </div>
            <div class="mpvs-item">
              <div class="mpvs-label">新权重秩相关</div>
              <div class="mpvs-val" :class="{ better: store.weightValidationResult.newRankCorrelation > store.weightValidationResult.oldRankCorrelation }">
                {{ store.weightValidationResult.newRankCorrelation }}%
              </div>
            </div>
            <div class="mpvs-item">
              <div class="mpvs-label">旧排序一致性</div>
              <div class="mpvs-val">{{ store.weightValidationResult.oldPairwiseAccuracy }}%</div>
            </div>
            <div class="mpvs-item">
              <div class="mpvs-label">新排序一致性</div>
              <div class="mpvs-val" :class="{ better: store.weightValidationResult.newPairwiseAccuracy > store.weightValidationResult.oldPairwiseAccuracy }">
                {{ store.weightValidationResult.newPairwiseAccuracy }}%
              </div>
            </div>
          </div>
          <div v-if="store.weightValidationResult.weightDiffs.length" class="mpv-diffs">
            <div class="mpvd-title">权重变更明细</div>
            <div v-for="d in store.weightValidationResult.weightDiffs" :key="d.key" class="mpvd-row">
              <span class="mpvd-label">{{ d.label }}</span>
              <span class="mpvd-change" :class="d.diff > 0 ? 'up' : 'down'">
                {{ d.old }}% → {{ d.new }}%（{{ d.diff > 0 ? '+' : '' }}{{ d.diff }}%）
              </span>
            </div>
          </div>
        </div>

        <!-- 综合评分说明 -->
        <div class="mpd-summary">
          <div class="mpds-title">综合评分计算方式</div>
          <p class="mpds-text">
            综合评分 = Σ（各维度得分 × 维度权重），基于 Likert 1-5 锚定量表。
            基于样本库中与待预测文稿最相似的 N 条历史样本，按其实际点赞与综合评分的映射关系，预估新文稿在某平台的点赞量区间。
            预测时会列出主要参考的历史样本及其点赞量，保证结果可追溯、可解释。
          </p>
        </div>
      </div>
      </div>

      <!-- 板块3：判断标准 -->
      <div class="mp-card mp-card-full">
        <div class="mpc-header">
          <span class="mpc-title">📏 判断标准</span>
          <span class="mpc-desc">自定义每个维度的评分标准，AI 将优先参照执行</span>
          <button class="mpc-edit-btn" @click="editingCriteria = !editingCriteria">
            {{ editingCriteria ? '完成编辑' : '更新标准' }}
          </button>
        </div>

        <div v-if="!editingCriteria && !hasCustomCriteria" class="mp-null">
          点击「更新标准」自定义各维度的评分依据，让 AI 更懂你的内容方向
        </div>

        <div v-if="editingCriteria" class="mpc-grid">
          <div v-for="d in SCORING_DIMENSION_CONFIG" :key="d.key" class="mpcg-item">
            <div class="mpcg-label">
              <span class="mpcg-dot" :style="{ background: d.color }"></span>
              {{ d.label }}
            </div>
            <textarea
              v-model="editCriteria[d.key]"
              class="mpcg-input"
              rows="2"
              :placeholder="defaultCriteria[d.key] || `输入${d.label}的判断标准...`"
            ></textarea>
          </div>
          <div class="mpcg-actions">
            <button class="mp-btn mp-btn-sm" @click="handleSaveCriteria">保存标准</button>
            <button class="mp-btn mp-btn-sm mp-btn-reset" @click="handleResetCriteria">恢复默认</button>
          </div>
        </div>

        <div v-if="!editingCriteria && hasCustomCriteria" class="mpc-list">
          <div v-for="d in SCORING_DIMENSION_CONFIG" :key="d.key" class="mpcl-item">
            <span class="mpcl-dot" :style="{ background: d.color }"></span>
            <span class="mpcl-label">{{ d.label }}：</span>
            <span class="mpcl-text">{{ store.customCriteria[d.key] || defaultCriteria[d.key] }}</span>
          </div>
        </div>
      </div>

      <!-- 板块4：高赞 vs 低赞 维度对比 -->
      <div v-if="store.patternSummary && hasDimensionData" class="mp-card mp-card-full">
        <div class="mpc-header">
          <span class="mpc-title">📈 高赞 vs 低赞 维度均值对比</span>
        </div>
        <div class="mp-diff">
          <div v-for="d in SCORING_DIMENSION_CONFIG" :key="d.key" class="mpdr-row">
            <span class="mpdr-label">{{ d.label }}</span>
            <div class="mpdr-bars">
              <div class="mpdr-high-wrap">
                <span class="mpdr-val high">{{ store.patternSummary.dimensionAverages.high[d.key] }}</span>
                <div class="mpdr-bar-bg">
                  <div class="mpdr-bar high" :style="{ width: Math.min(store.patternSummary.dimensionAverages.high[d.key], 100) + '%', background: d.color }"></div>
                </div>
              </div>
              <div class="mpdr-low-wrap">
                <span class="mpdr-val low">{{ store.patternSummary.dimensionAverages.low[d.key] }}</span>
                <div class="mpdr-bar-bg">
                  <div class="mpdr-bar low" :style="{ width: Math.min(store.patternSummary.dimensionAverages.low[d.key], 100) + '%', background: d.color + '44' }"></div>
                </div>
              </div>
            </div>
            <span class="mpdr-diff" :class="diffSign(d.key)">{{ diffVal(d.key) }}</span>
          </div>
          <div class="mpd-legend">
            <span class="mpdl-high">高赞组均分</span>
            <span class="mpdl-low">低赞组均分</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onActivated, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUniqueModeStore, SCORING_DIMENSION_CONFIG } from '@/stores/uniqueMode'

const store = useUniqueModeStore()

// 切换回来时确保加载最新数据
onActivated(() => { store.reloadPatternSummary() })

// 默认权重
const DEFAULT_WEIGHTS: Record<string, number> = {
  hook: 18, empathy: 14, density: 16, structure: 14, originality: 16, socialResonance: 12, polish: 10
}

// 编辑模式
const editingWeights = ref(false)

// 编辑中的权重（深拷贝）
const editWeights = reactive<Record<string, number>>({ ...getActiveWeights() })

function getActiveWeights(): Record<string, number> {
  const custom = store.customWeights
  if (Object.keys(custom).length > 0) return { ...DEFAULT_WEIGHTS, ...custom }
  return { ...DEFAULT_WEIGHTS }
}

function dimWeight(key: string): number {
  return getActiveWeights()[key] || 0
}

const weightTotal = computed(() => {
  return Object.values(editWeights).reduce((s, v) => s + (Number(v) || 0), 0)
})

// 开启编辑时重置编辑数据
watch(editingWeights, (val) => {
  if (val) Object.assign(editWeights, getActiveWeights())
})

function handleSaveWeights() {
  // 存百分比到 store
  const pct: Record<string, number> = {}
  for (const k of Object.keys(editWeights)) {
    pct[k] = editWeights[k]
  }
  store.updateCustomWeights(pct)
  editingWeights.value = false
  ElMessage.success('评分公式已更新，新录入的样本将按新权重计分')
}

function handleResetWeights() {
  store.resetCustomWeights()
  Object.assign(editWeights, { ...DEFAULT_WEIGHTS })
  editingWeights.value = false
  ElMessage.success('已恢复默认公式')
}

// ===== 数据驱动权重 =====
const applyingDataWeights = ref(false)
const showDataDrivenHint = ref(false)
const dataDrivenWeights = ref<Record<string, number>>({})

const dataDrivenTop3 = computed(() => {
  if (!store.accountPersonality) return []
  return store.accountPersonality.likesRanking.slice(0, 3).map(d => d.label)
})

async function handleDataDrivenWeights() {
  applyingDataWeights.value = true
  try {
    const weights = await store.deriveWeightsFromData()
    if (weights) {
      dataDrivenWeights.value = weights
      showDataDrivenHint.value = true
    }
  } catch (e: any) {
    ElMessage.error(e.message || '分析失败')
  } finally {
    applyingDataWeights.value = false
  }
}

async function handleApplyDataWeights() {
  await store.applyDataDrivenWeights()
  showDataDrivenHint.value = false
  ElMessage.success('已应用数据驱动权重')
}

// 判断标准编辑
const defaultCriteria: Record<string, string> = {
  hook: '开头是否精准指向受众当前最大的困惑？能否让他们产生"你怎么知道我在想这个"的感觉？',
  empathy: '是否不仅说出了受众的感受，还帮他们理清了情绪的来龙去脉？受众是否感到被深层理解？',
  density: '是否持续提供新的理解框架？每段是否都让受众对问题的理解更进一层？',
  structure: '受众是否经历了「困惑→被命名→被解释→看到希望」的完整情绪弧线？',
  originality: '这个角度在同赛道是否只有你能讲？是否有独特的解读角度或案例组合？',
  socialResonance: '是否精准命中了某一人生阶段的集体隐痛？受众是否有"终于有人说出来了"的转发冲动？',
  polish: '语言是否让受众感到可靠、有根据、不忽悠？每个论断是否建立在可感知的根基上？'
}

const editingCriteria = ref(false)
const editCriteria = reactive<Record<string, string>>({})
const hasCustomCriteria = computed(() => Object.keys(store.customCriteria).length > 0)

watch(editingCriteria, (val) => {
  if (val) {
    const merged: Record<string, string> = {}
    for (const d of SCORING_DIMENSION_CONFIG) {
      merged[d.key] = store.customCriteria[d.key] || ''
    }
    Object.assign(editCriteria, merged)
  }
})

function handleSaveCriteria() {
  const data: Record<string, string> = {}
  for (const d of SCORING_DIMENSION_CONFIG) {
    if (editCriteria[d.key]?.trim()) data[d.key] = editCriteria[d.key].trim()
  }
  store.updateCustomCriteria(data)
  editingCriteria.value = false
  ElMessage.success('判断标准已更新，后续评分将参照新标准')
}

function handleResetCriteria() {
  store.resetCustomCriteria()
  for (const d of SCORING_DIMENSION_CONFIG) editCriteria[d.key] = ''
  editingCriteria.value = false
  ElMessage.success('已恢复默认标准')
}

async function handleValidateWeights() {
  try {
    await store.validateWeights({ ...editWeights })
    const r = store.weightValidationResult!
    if (r.newRankCorrelation > r.oldRankCorrelation) {
      ElMessage.success('新权重更优，建议升级')
    } else if (Math.abs(r.newRankCorrelation - r.oldRankCorrelation) < 2) {
      ElMessage.info('新旧权重基本持平')
    } else {
      ElMessage.warning('新权重不如旧权重，请重新调整')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '验证失败')
  }
}

function syncWeight(key: string, suggestedVal: number) {
  editWeights[key] = suggestedVal
}
function syncAllBumpWeights() {
  if (!store.bumpSuggestion) return
  const sw = store.bumpSuggestion.weights
  for (const d of SCORING_DIMENSION_CONFIG) {
    if (sw[d.key] != null) editWeights[d.key] = sw[d.key]
  }
  ElMessage.success('已同步 AI 建议的权重，可点击「验证权重」测试效果')
}

const verdictClass = computed(() => {
  const r = store.weightValidationResult
  if (!r) return ''
  if (r.newRankCorrelation > r.oldRankCorrelation) return 'pass'
  if (Math.abs(r.newRankCorrelation - r.oldRankCorrelation) < 2) return 'tie'
  return 'fail'
})

const hasDimensionData = computed(() => {
  if (!store.patternSummary) return false
  return SCORING_DIMENSION_CONFIG.some(d => store.patternSummary!.dimensionAverages.high[d.key] > 0)
})

function diffVal(key: string): string {
  if (!store.patternSummary) return ''
  const ps = store.patternSummary
  const h = ps.dimensionAverages.high[key as keyof typeof ps.dimensionAverages.high]
  const l = ps.dimensionAverages.low[key as keyof typeof ps.dimensionAverages.low]
  const d = h - l
  if (d > 5) return `↑${d}`
  if (d < -5) return `↓${Math.abs(d)}`
  return `±${Math.abs(d)}`
}

function diffSign(key: string): string {
  if (!store.patternSummary) return ''
  const ps = store.patternSummary
  const h = ps.dimensionAverages.high[key as keyof typeof ps.dimensionAverages.high]
  const l = ps.dimensionAverages.low[key as keyof typeof ps.dimensionAverages.low]
  const d = h - l
  if (d > 5) return 'up'
  if (d < -5) return 'down'
  return ''
}

async function handleGenerate() {
  try { await store.generatePatternSummary(); ElMessage.success('规律总结已更新') }
  catch (e: any) { ElMessage.error((e.message || '生成失败')) }
}

// 格式化工具函数
function fmtText(text: string): string {
  if (!text) return ''
  // 渲染 **粗体**
  return text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<em>$1</em>')
}

function splitLines(text: string): string[] {
  if (!text) return []
  return text.split(/\n+/).map(s => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
}

function extractKeywords(text: string): Array<{ type: 'cat' | 'intro' | 'tag'; text: string }> {
  if (!text) return []
  const results: Array<{ type: 'cat' | 'intro' | 'tag'; text: string }> = []
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean)

  for (let line of lines) {
    // 去掉 markdown 前缀 * - • 等
    line = line.replace(/^\*+\s*/, '').replace(/^[-•]\s*/, '')
    // 分类行: "财运类：" 或 "**财运类：**" 
    const catMatch = line.match(/^(?:\*\*)?(.+?[类型种])(?:\*\*)?[：:]\s*$/)
    if (catMatch && catMatch[1].length <= 6) {
      results.push({ type: 'cat', text: catMatch[1].replace(/\*\*/g, '') })
      continue
    }
    // 分类 + 关键词: "财运类：" 或 "**财运类：** 钱财 八方来财"
    const catKwMatch = line.match(/^(?:\*\*)?(.+?[类型种])(?:\*\*)?[：:]\s*(.+)$/)
    if (catKwMatch && catKwMatch[1].length <= 6 && catKwMatch[2].trim().length > 0) {
      results.push({ type: 'cat', text: catKwMatch[1].replace(/\*\*/g, '') })
      // 分割关键词: 按空格、逗号、顿号分割，或按2-4个中文字符连续切割
      const kws = splitChineseKeywords(catKwMatch[2])
      for (const k of kws) results.push({ type: 'tag', text: k.replace(/\*\*/g, '') })
      continue
    }
    // 介绍行（无分类标记的短行）
    if (line.length < 30 && !line.includes(' ')) {
      results.push({ type: 'intro', text: line.replace(/\*\*/g, '') })
      continue
    }
    // 长文本行：直接作为介绍
    results.push({ type: 'intro', text: line.replace(/\*\*/g, '') })
    // 也尝试提取其中的关键词（给长文本拆分）
    const tokens = line.split(/[\s,，、]+/).filter(t => t.length >= 2 && t.length <= 8 && !/[：:。，,\s]/.test(t))
    for (const t of tokens.slice(0, 8)) results.push({ type: 'tag', text: t.replace(/\*\*/g, '') })
  }
  return results
}

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

// 智能分割中文关键词：有分隔符时按分隔符，否则按 2-4 个字切割中文
function splitChineseKeywords(text: string): string[] {
  if (!text) return []
  if (/[\s,，、#]/.test(text)) {
    return text.split(/[\s,，、#]+/).map(s => s.trim()).filter(Boolean).slice(0, 20)
  }
  const result: string[] = []
  let remaining = text.replace(/[^\u4e00-\u9fa5]/g, '')
  while (remaining.length >= 2) {
    const take = remaining.length >= 4 ? 4 : remaining.length >= 3 ? 3 : 2
    result.push(remaining.slice(0, take))
    remaining = remaining.slice(take)
  }
  return result.slice(0, 20)
}
</script>

<style scoped>
.model-patterns { height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.mp-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #8a9bb0; font-size: 13px; }

.mp-body { display: flex; flex-direction: column; gap: 14px; }

.mp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
@media (max-width: 750px) { .mp-row { grid-template-columns: 1fr; } }

.mp-card { background: #fff; border-radius: 14px; padding: 18px 20px; border: 1px solid #eef2f6; }
.mpc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.mpc-title { font-size: 14px; font-weight: 600; color: #0b1a30; }
.mpc-desc { font-size: 12px; color: #909399; }
.mpc-badge { font-size: 12px; padding: 2px 10px; border-radius: 10px; background: #fdf6ec; color: #e6a23c; }
.mpc-edit-btn {
  font-size: 12px; padding: 4px 12px; border-radius: 6px; border: 1px solid #1a4cff;
  background: transparent; color: #1a4cff; cursor: pointer; transition: all .2s;
}
.mpc-edit-btn:hover { background: #1a4cff; color: #fff; }
.mpc-header-actions { display: flex; gap: 8px; }
.mpc-data-btn {
  font-size: 12px; padding: 4px 12px; border-radius: 6px; border: 1px solid #16a34a;
  background: transparent; color: #16a34a; cursor: pointer; transition: all .2s;
}
.mpc-data-btn:hover:not(:disabled) { background: #16a34a; color: #fff; }
.mpc-data-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.mp-data-hint {
  margin-bottom: 14px; padding: 14px; border-radius: 8px;
  background: #f0fdf4; border: 1px solid #bbf7d0;
}
.mpdh-title { font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 6px; }
.mpdh-desc { font-size: 12px; color: #4b5563; margin-bottom: 10px; line-height: 1.5; }
.mpdh-desc strong { color: #16a34a; }
.mpdh-weights { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.mpdhw-row { display: flex; align-items: center; justify-content: space-between; padding: 3px 0; }
.mpdhw-label { font-size: 11px; color: #6b7280; min-width: 56px; }
.mpdhw-compare { display: flex; align-items: center; gap: 6px; }
.mpdhw-current { font-size: 11px; color: #9ca3af; }
.mpdhw-arrow { font-size: 11px; color: #d1d5db; }
.mpdhw-suggested { font-size: 12px; font-weight: 600; color: #166534; }
.mpdhw-suggested.changed { color: #16a34a; }
.mpdhw-diff { font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 600; }
.mpdhw-diff.up { background: #dcfce7; color: #16a34a; }
.mpdhw-diff.down { background: #fef2f2; color: #ef4444; }
.mpdh-actions { display: flex; gap: 8px; }
/* 权重审核 */
.mp-validation { margin: 10px 0 0; padding: 12px; background: #fafbfc; border-radius: 10px; border: 1px solid #e8ecf1; }
.mpv-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.mpv-icon { font-size: 14px; }
.mpv-title { font-weight: 600; font-size: 13px; color: #111827; }
.mpv-recommendation { font-size: 12px; color: #6b7280; margin: 0 0 8px; line-height: 1.5; }
.mpv-summary { display: flex; gap: 16px; font-size: 12px; color: #6b7280; flex-wrap: wrap; margin-bottom: 8px; }
.mpv-summary b.ok { color: #16a34a; }
.mpv-summary b.ng { color: #dc2626; }
.mpv-details { font-size: 12px; }
.mpv-details summary { cursor: pointer; color: #1a56db; font-weight: 500; margin-bottom: 6px; }
.mpv-pair { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 4px; background: #fff; margin-bottom: 4px; font-family: monospace; font-size: 11px; }
.mpv-pair-idx { color: #9ca3af; min-width: 24px; }
.mpv-pair-content { flex: 1; }
.mpv-pair-content span { display: inline-block; padding: 1px 4px; border-radius: 3px; }
.mpv-pair-content span.err { color: #dc2626; background: #fef2f2; }
.mpv-arrow { margin: 0 4px; color: #9ca3af; }
.mpv-pair .warn { color: #d97706; }
.mpv-likes { color: #9ca3af; font-size: 10px; }

/* 跨模型审计 */
.mpv-cross { margin-top: 8px; padding: 8px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0; }
.mpv-cross-h { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.mpv-cross-label { font-weight: 600; font-size: 12px; }
.mpv-cross-h .ok { font-size: 11px; color: #16a34a; font-weight: 600; }
.mpv-cross-h .ng { font-size: 11px; color: #dc2626; font-weight: 600; }
.mpv-cross-v { font-size: 11px; color: #374151; margin: 0; }
.mp-btn-primary { background: #16a34a; color: #fff; border-color: #16a34a; }
.mp-btn-primary:hover { background: #15803d; }
.mp-badge.generated { background: #e6f7e6; color: #0f7b3a; }

/* 归纳区域 */
.mp-section { margin-bottom: 14px; }
.mp-section:last-child { margin-bottom: 0; }
.mp-section-title { font-size: 13px; font-weight: 600; color: #0b1a30; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #eef2f6; }
.mp-section-title.warn { color: #e6a23c; border-color: #fdf6ec; }

/* 规律条目 */
.mp-insight-list { display: flex; flex-direction: column; gap: 6px; }
.mp-insight-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; background: #f8fafe; border-radius: 8px; border: 1px solid #e8ecf6; }
.mp-insight-item.low { background: #fef9f0; border-color: #fdf0d9; }
.mpii-dot { color: #52c41a; font-size: 10px; margin-top: 3px; flex-shrink: 0; }
.mpii-dot.low { color: #e6a23c; }
.mpii-text { font-size: 12px; line-height: 1.7; color: #3d5068; }
.mpii-text :deep(b) { color: #0b1a30; }

/* 平台差异 */
.mp-platform-cards { display: flex; flex-direction: column; gap: 6px; }
.mppc-item { padding: 8px 10px; background: #f8fafe; border-radius: 8px; border: 1px solid #e8ecf6; }
.mppc-text { font-size: 12px; line-height: 1.7; color: #3d5068; }
.mppc-text :deep(b) { color: #0b1a30; }

/* 关键词标签 */
.mp-keyword-tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mpkt-tag { font-size: 11px; padding: 3px 10px; background: #eef3ff; color: #1a4cff; border-radius: 12px; font-weight: 500; }
.mpkt-cat { font-size: 11px; font-weight: 700; color: #4d5a6e; padding: 2px 0; margin-right: 4px; width: 100%; margin-top: 6px; }
.mpkt-cat:first-child { margin-top: 0; }
.mpkt-intro { font-size: 11px; color: #8895a7; width: 100%; margin-top: 4px; }
.mpkt-text { font-size: 12px; color: #3d5068; line-height: 1.7; }
.mpkt-text :deep(b) { color: #0b1a30; }

/* 统计栏 */
.mp-stats-bar { display: flex; gap: 16px; margin-top: 10px; padding: 8px 10px; background: #f5f7fb; border-radius: 8px; }
.mpsb-item { font-size: 12px; color: #4d5a6e; }

/* 判断标准编辑 */
.mpc-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.mpcg-item { display: flex; flex-direction: column; gap: 4px; }
.mpcg-label { font-size: 12px; font-weight: 600; color: #0b1a30; display: flex; align-items: center; gap: 6px; }
.mpcg-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.mpcg-input {
  width: 100%; padding: 6px 10px; border: 1px solid #d0d5dd; border-radius: 6px;
  font-size: 12px; color: #303133; outline: none; resize: vertical; font-family: inherit;
  line-height: 1.5; box-sizing: border-box;
}
.mpcg-input:focus { border-color: #1a4cff; }
.mpcg-actions { grid-column: 1 / -1; display: flex; gap: 8px; padding-top: 4px; }

.mpc-list { display: flex; flex-direction: column; gap: 6px; }
.mpcl-item { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; line-height: 1.6; }
.mpcl-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
.mpcl-label { font-weight: 600; color: #0b1a30; white-space: nowrap; flex-shrink: 0; }
.mpcl-text { color: #3d5068; }

.mp-card-full { grid-column: 1 / -1; }
.mp-text { font-size: 12px; color: #3d5068; line-height: 1.6; margin: 0; white-space: pre-wrap; }
.mp-time { font-size: 11px; color: #b0bfd0; text-align: center; margin-top: 10px; }

.mp-loading, .mp-null { padding: 20px; text-align: center; font-size: 13px; color: #8a9bb0; }

.mpc-actions { margin-top: 14px; }
.mp-btn { padding: 9px 22px; border-radius: 24px; border: none; font-weight: 600; font-size: 14px; cursor: pointer; background: #1a4cff; color: #fff; transition: background 0.15s; font-family: inherit; width: 100%; }
.mp-btn:hover:not(:disabled) { background: #0f3fd9; }
.mp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 评分维度列表 */
.mpd-list { display: flex; flex-direction: column; gap: 2px; margin-bottom: 14px; }
.mpd-item { display: flex; align-items: center; justify-content: space-between; padding: 9px 10px; border-radius: 8px; transition: background 0.12s; }
.mpd-item:hover { background: #fafbfc; }
.mpd-left { display: flex; align-items: center; gap: 10px; }
.mpd-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.mpd-info { display: flex; flex-direction: column; gap: 1px; }
.mpd-name { font-size: 13px; font-weight: 600; color: #303133; }
.mpd-desc-text { font-size: 11px; color: #909399; }
.mpd-weight { font-size: 13px; font-weight: 700; color: #1a4cff; background: #eef3ff; padding: 2px 10px; border-radius: 10px; }

/* 权重编辑 */
.mpd-weight-edit { display: flex; align-items: center; gap: 4px; }
.wt-btn {
  width: 22px; height: 22px; border-radius: 5px; border: 1px solid #d0d5dd;
  background: #fff; font-size: 12px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: #303133;
  transition: all .15s;
}
.wt-btn:hover { border-color: #1a4cff; color: #1a4cff; }
.wt-input {
  width: 44px; height: 22px; border: 1px solid #d0d5dd; border-radius: 5px;
  text-align: center; font-size: 12px; font-weight: 600; color: #303133; outline: none;
}
.wt-input:focus { border-color: #1a4cff; }
.wt-pct { font-size: 12px; color: #909399; }

.mpd-formula-actions {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 10px; margin-top: 8px; border-top: 1px solid #eef2f6;
}
.mpfa-total { font-size: 13px; font-weight: 500; color: #303133; }
.mpfa-total.warn { color: #e6a23c; }
.mpfa-hint { font-size: 11px; color: #e6a23c; font-weight: 400; margin-left: 4px; }
.mpfa-btns { display: flex; gap: 6px; }
.mp-btn-sm { padding: 5px 12px; font-size: 12px; }
.mp-btn-reset { border-color: #ddd; color: #909399; background: transparent; }
.mp-btn-reset:hover { border-color: #e6a23c; color: #e6a23c; }

/* 综合评分说明 */
.mpd-summary { background: #fafbfc; border-radius: 10px; padding: 14px 16px; }
.mpds-title { font-size: 13px; font-weight: 600; color: #0b1a30; margin-bottom: 6px; }
.mpds-text { font-size: 12px; color: #3d5068; line-height: 1.7; margin: 0; }

/* 维度对比 */
.mp-diff { display: flex; flex-direction: column; gap: 6px; }
.mpdr-row { display: flex; align-items: center; gap: 8px; }
.mpdr-label { width: 70px; font-size: 12px; color: #6b7a8f; flex-shrink: 0; }
.mpdr-bars { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.mpdr-high-wrap, .mpdr-low-wrap { display: flex; align-items: center; gap: 6px; }
.mpdr-val { font-size: 11px; font-weight: 700; min-width: 22px; text-align: right; }
.mpdr-val.high { color: #1a4cff; }
.mpdr-val.low { color: #95a5a6; }
.mpdr-bar-bg { flex: 1; height: 6px; background: #f0f2f5; border-radius: 3px; overflow: hidden; }
.mpdr-bar { height: 100%; border-radius: 3px; transition: width 0.3s; }
.mpdr-bar.low { opacity: 0.4; }
.mpdr-diff { font-size: 11px; font-weight: 600; min-width: 30px; }
.mpdr-diff.up { color: #f56c6c; }
.mpdr-diff.down { color: #67c23a; }

.mpd-legend { display: flex; gap: 16px; padding: 4px 0; font-size: 11px; color: #b0bfd0; margin-top: 2px; padding-left: 78px; }
.mpdl-high { color: #3d5068; }
.mpdl-low { color: #95a5a6; }

/* 权重验证 */
.mp-btn-validate {
  border-color: #67c23a; color: #67c23a; background: transparent;
}
.mp-btn-validate:hover:not(:disabled) { background: #67c23a; color: #fff; }
.mp-btn-validate:disabled { opacity: 0.4; cursor: not-allowed; }
.mp-validation { margin-top: 14px; }
.mpv-verdict {
  font-size: 13px; font-weight: 600; padding: 10px 14px; border-radius: 8px; line-height: 1.6;
}
.mpv-verdict.pass { background: #f0faf3; color: #1a7a3a; border: 1px solid #c8f0d0; }
.mpv-verdict.tie { background: #fdf6ec; color: #b0791a; border: 1px solid #fce8c0; }
.mpv-verdict.fail { background: #fef0f0; color: #c0392b; border: 1px solid #fcd0d0; }
.mpv-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.mpvs-item { background: #f8fafe; border-radius: 8px; padding: 10px 12px; text-align: center; }
.mpvs-label { font-size: 11px; color: #8a9bb0; margin-bottom: 4px; }
.mpvs-val { font-size: 16px; font-weight: 700; color: #303133; }
.mpvs-val.better { color: #67c23a; }
.mpv-diffs { margin-top: 10px; background: #fafbfc; border-radius: 8px; padding: 10px 12px; }
.mpvd-title { font-size: 12px; font-weight: 600; color: #0b1a30; margin-bottom: 6px; }
.mpvd-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; font-size: 12px; }
.mpvd-label { color: #4d5a6e; }
.mpvd-change.up { color: #f56c6c; font-weight: 600; }
.mpvd-change.down { color: #67c23a; font-weight: 600; }

/* Bump 待处理提示条 */
.mp-bump-callout {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  margin-bottom: 14px; border-radius: 10px;
  background: linear-gradient(135deg, #eef2ff, #faf5ff);
  border: 2px dashed #a78bfa; cursor: pointer;
  transition: all 0.15s;
}
.mp-bump-callout:hover { background: linear-gradient(135deg, #e0e7ff, #f3e8ff); border-color: #8b5cf6; }
.mpbc-icon { font-size: 20px; flex-shrink: 0; }
.mpbc-body { flex: 1; }
.mpbc-title { font-size: 13px; font-weight: 600; color: #4338ca; margin-bottom: 2px; }
.mpbc-desc { font-size: 11px; color: #6b7280; line-height: 1.4; }
.mpbc-arrow { font-size: 16px; color: #a78bfa; flex-shrink: 0; }

/* Bump 建议面板 */
.mp-bump-panel {
  margin-top: 14px; padding: 16px; background: #faf5ff; border: 2px solid #c4b5fd; border-radius: 12px;
}
.mpbp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.mpbp-title { font-size: 14px; font-weight: 700; color: #6d28d9; }
.mpbp-time { font-size: 11px; color: #a78bfa; }
.mpbp-reasoning { font-size: 12px; color: #4b5563; line-height: 1.7; margin-bottom: 6px; }
.mpbp-weights { margin: 10px 0; padding: 8px 12px; background: #fff; border-radius: 10px; border: 1px solid #ede9fe; }
.mpbpw-title { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px; }
.mpbpw-row { display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; border-radius: 6px; cursor: pointer; transition: background 0.12s; }
.mpbpw-row:hover { background: #f5f3ff; }
.mpbpw-row.changed { background: #fef3c7; }
.mpbpw-label { font-size: 12px; color: #6b7280; }
.mpbpw-val { font-size: 12px; display: flex; gap: 6px; align-items: center; }
.mpbpw-old { color: #9ca3af; text-decoration: line-through; }
.mpbpw-new { font-weight: 700; color: #7c3aed; }
.mpbp-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.mpbpa-sync-all {
  padding: 5px 14px; border: 1px solid #c7d2fe; border-radius: 6px; background: #eef2ff;
  color: #4338ca; font-size: 12px; cursor: pointer; font-weight: 500;
}
.mpbpa-sync-all:hover { background: #e0e7ff; }
.mpbpa-accept {
  padding: 5px 14px; border: none; border-radius: 6px; background: #4f46e5; color: #fff;
  font-size: 12px; font-weight: 600; cursor: pointer;
}
.mpbpa-accept:hover { background: #4338ca; }
.mpbpa-dismiss {
  padding: 5px 14px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff;
  color: #6b7280; font-size: 12px; cursor: pointer;
}
.mpbpa-dismiss:hover { background: #f9fafb; }
</style>
