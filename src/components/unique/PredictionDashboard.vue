<template>
  <div class="pd-root">
    <!-- 概览条 -->
    <div class="pd-summary-bar">
      <div class="pd-summary-item pd-summary-likes">
        <span class="pds-label">预估点赞</span>
        <span class="pds-value">{{ fmt(prediction.minLikes) }} ~ {{ fmt(prediction.maxLikes) }}</span>
      </div>
      <div class="pd-summary-item">
        <span class="pds-label">综合分</span>
        <span class="pds-value pds-score">{{ prediction.compositeScore }}</span>
        <span class="pds-tag" :class="scoreTagClass">{{ scoreTagLabel }}</span>
      </div>
      <div class="pd-summary-item">
        <span class="pds-label">置信度</span>
        <span class="pds-value pds-confidence">{{ confidenceShort }}</span>
      </div>
      <div class="pd-summary-item" v-if="weakestDimText">
        <span class="pds-label">最薄弱</span>
        <span class="pds-value pds-weak">{{ weakestDimText }}</span>
      </div>
    </div>

    <!-- 核心建议条 -->
    <div class="pd-advice-bar" v-if="suggestions.length">
      💡 {{ suggestions[0] }}
    </div>

    <!-- 图表区：7维雷达图 + 概率分布 -->
    <div class="pd-charts">
      <div class="pd-chart-panel">
        <div class="pd-chart-title">🎯 7 维评分</div>
        <div ref="radarRef" class="pd-chart-inner"></div>
        <!-- 悬停提示 -->
        <div class="pd-hover-hint">悬停各维度查看详情</div>
      </div>
      <div class="pd-chart-panel">
        <div class="pd-chart-title">🎲 点赞量概率分布</div>
        <div v-if="probHasData" ref="probRef" class="pd-chart-inner"></div>
        <div v-else class="pd-chart-empty">暂无概率分布数据</div>
        <div class="pd-hover-hint" v-if="probHasData">悬停柱条查看桶范围</div>
      </div>
    </div>

    <!-- 详情折叠面板 -->
    <div class="pd-detail-panels">
      <!-- 预测依据 -->
      <el-collapse v-model="activePanels" class="pd-collapse">
        <el-collapse-item name="reasons" v-if="reasons.length">
          <template #title>
            <div class="pd-panel-header"><span class="pd-panel-icon">🔍</span> 预测依据 <span class="pd-panel-count">({{ reasons.length }} 条)</span></div>
          </template>
          <div class="pd-reason-list">
            <div class="pd-reason-item" v-for="(r, i) in reasons" :key="i">
              <span class="pd-reason-num">{{ i + 1 }}</span>
              <span>{{ r }}</span>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item name="refs" v-if="refSamples.length">
          <template #title>
            <div class="pd-panel-header"><span class="pd-panel-icon">📋</span> 参考样本 <span class="pd-panel-count">({{ refSamples.length }} 条)</span></div>
          </template>
          <div class="pd-ref-list">
            <div class="pd-ref-card" v-for="s in refSamples" :key="s.scriptId">
              <div class="pdref-top">
                <span>{{ PLATFORM_CONFIG[s.platform]?.icon || '📄' }} {{ s.platform }}</span>
                <span class="pdref-score">{{ s.compositeScore }} 分</span>
              </div>
              <div class="pdref-snippet">{{ s.snippet }}</div>
              <div class="pdref-reason">{{ s.similarityReason }}</div>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item name="counter" v-if="counterfactuals.length">
          <template #title>
            <div class="pd-panel-header"><span class="pd-panel-icon">🔄</span> 反事实分析 <span class="pd-panel-count">({{ counterfactuals.length }} 条)</span></div>
          </template>
          <div class="pd-reason-list pd-reason--warn">
            <div class="pd-reason-item" v-for="(c, i) in counterfactuals" :key="i">
              <span class="pd-reason-num pd-reason-num--warn">{{ i + 1 }}</span>
              <span>{{ c }}</span>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item name="account" v-if="accountAdviceItems.length">
          <template #title>
            <div class="pd-panel-header"><span class="pd-panel-icon">🔬</span> 账号专属优化建议 <span class="pd-panel-count">({{ accountAdviceItems.length }} 项)</span></div>
          </template>
          <div class="pd-account-list">
            <div class="pd-account-item" v-for="item in accountAdviceItems" :key="item.key" :class="{ 'pd-account-warn': item.isWeak }">
              <div class="pdacc-header">
                <span class="pdacc-dot" :style="{ background: item.color }"></span>
                <span class="pdacc-dim">{{ item.label }}</span>
                <span class="pdacc-rank">#{{ item.rank }}</span>
                <span class="pdacc-corr">关联度 {{ item.correlationDisplay }}</span>
              </div>
              <div class="pdacc-body">
                <span class="pdacc-score" :class="{ low: item.isWeak }">本稿 {{ item.currentScore }} 分</span>
                <span class="pdacc-grade" :class="{ warn: item.isWeak }">{{ item.grade }}</span>
                <div class="pdacc-advice">{{ item.advice }}</div>
              </div>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item name="suggestions" v-if="suggestions.length > 1">
          <template #title>
            <div class="pd-panel-header"><span class="pd-panel-icon">✏️</span> 优化建议 <span class="pd-panel-count">({{ suggestions.length }} 条)</span></div>
          </template>
          <div class="pd-reason-list pd-reason--action">
            <div class="pd-reason-item" v-for="(s, i) in suggestions" :key="i">
              <span class="pd-reason-num pd-reason-num--action">{{ i + 1 }}</span>
              <span>{{ s }}</span>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { SCORING_DIMENSION_CONFIG, PLATFORM_CONFIG } from '@/stores/uniqueMode'
import type { PredictionResult, Platform } from '@/stores/uniqueMode'

const props = defineProps<{
  prediction: PredictionResult
  platform: Platform
  reasons: string[]
  refSamples: Array<{ scriptId?: string; platform: string; compositeScore: number; snippet: string; similarityReason: string }>
  suggestions: string[]
  counterfactuals: string[]
  accountAdviceItems: Array<{ key: string; label: string; currentScore: number; color: string; rank: number; correlationDisplay: string; isWeak: boolean; grade: string; advice: string }>
}>()

const activePanels = ref<string[]>([])

// 图表 refs
const radarRef = ref<HTMLDivElement | null>(null)
const probRef = ref<HTMLDivElement | null>(null)
let radarChart: echarts.ECharts | null = null
let probChart: echarts.ECharts | null = null

function fmt(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

// 评分标签
const scoreTagClass = computed(() => {
  const s = props.prediction.compositeScore
  if (s >= 80) return 'excellent'
  if (s >= 60) return 'good'
  if (s >= 40) return 'normal'
  return 'low'
})
const scoreTagLabel = computed(() => {
  const s = props.prediction.compositeScore
  if (s >= 80) return '爆款潜力'
  if (s >= 60) return '表现良好'
  if (s >= 40) return '中规中矩'
  return '需重点打磨'
})

// 置信度简短版
const confidenceShort = computed(() => {
  const c = props.prediction.confidence || ''
  if (c.includes('高')) return '高'
  if (c.includes('中')) return '中'
  if (c.includes('低')) return '低'
  return c.slice(0, 2) || '--'
})

// 最薄弱维度
const weakestDimText = computed(() => {
  const scores = props.prediction.scores
  const dims = SCORING_DIMENSION_CONFIG.map(d => ({ label: d.label, score: scores[d.key] || 0 }))
  dims.sort((a, b) => a.score - b.score)
  return dims.length > 0 ? `${dims[0].label} ${dims[0].score}分` : ''
})

const probHasData = computed(() => (props.prediction.bucketProbabilities || []).length > 0)

// 雷达图配置
const radarOption = computed(() => {
  const dims = SCORING_DIMENSION_CONFIG
  const scores = props.prediction.scores
  return {
    tooltip: {},
    legend: { show: false },
    radar: {
      center: ['50%', '56%'],
      radius: '62%',
      indicator: dims.map(d => ({ name: d.label, max: 100 })),
      axisName: { color: '#64748b', fontSize: 11, borderRadius: 3, padding: [2, 5] },
      splitArea: { areaStyle: { color: ['#f8fafc', '#f1f5f9'] } },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    series: [{
      type: 'radar',
      data: [{
        value: dims.map(d => Number(scores[d.key]) || 0),
        name: '本稿评分',
        areaStyle: { color: 'rgba(99, 102, 241, 0.15)' },
        lineStyle: { color: '#6366f1', width: 2 },
        itemStyle: { color: '#6366f1', borderColor: '#fff', borderWidth: 2 },
        symbol: 'circle',
         symbolSize: 7
       }],
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const idx = typeof p.dimensionIndex === 'number' ? p.dimensionIndex : dims.findIndex(dd => dd.label === p.name)
          if (idx < 0 || idx >= dims.length) return `${p.name || ''}: ${p.value}分`
          const d = dims[idx]
          return `<b style="color:${d.color}">${d.label}: ${p.value}分</b><br/><span style="color:#94a3b8;font-size:11px">${d.desc}</span>`
        }
      }
    }]
  }
})

// 概率分布图
const probOption = computed(() => {
  const buckets = props.prediction.bucketProbabilities || []
  if (!buckets.length) return {}
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#fff',
      borderColor: '#e0e8f0',
      textStyle: { color: '#334155', fontSize: 13 },
      formatter: (params: any[]) => {
        const p = params[0]
        const b = buckets[p.dataIndex]
        const star = b?.isHeadline ? ' ⭐主预测' : ''
        return `<b>${p.name}</b>${star}<br/>概率: <b style="color:#6366f1">${p.value}%</b>`
      }
    },
    grid: { left: 10, right: 60, top: 10, bottom: 20 },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'category',
      data: buckets.map(b => b.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 11, width: 100, overflow: 'truncate' }
    },
    series: [{
      type: 'bar',
      data: buckets.map(b => ({
        value: b.probability,
        itemStyle: {
          color: b.isHeadline
            ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#6366f1' }, { offset: 1, color: '#8b5cf6' }] }
            : '#94a3b8',
          borderRadius: [0, 4, 4, 0]
        }
      })),
      barWidth: 18,
      label: {
        show: true,
        position: 'right',
        formatter: '{c}%',
        color: '#64748b',
        fontSize: 11
      },
      emphasis: {
        itemStyle: { color: '#6366f1' }
      }
    }]
  }
})

// 初始化/更新图表
function initRadar() {
  if (!radarRef.value) return
  if (!radarChart) radarChart = echarts.init(radarRef.value)
  radarChart.setOption(radarOption.value, { notMerge: true })
}
function initProb() {
  if (!probRef.value) return
  if (!probChart) probChart = echarts.init(probRef.value)
  probChart.setOption(probOption.value, { notMerge: true })
}

onMounted(() => {
  nextTick(() => {
    initRadar()
    if (probHasData.value) initProb()
  })
})

watch(() => props.prediction, () => {
  nextTick(() => {
    initRadar()
    if (probHasData.value) initProb()
  })
}, { deep: true })

onBeforeUnmount(() => {
  radarChart?.dispose()
  probChart?.dispose()
  radarChart = null
  probChart = null
})
</script>

<style scoped>
.pd-root { font-family: inherit; }

/* 概览条 */
.pd-summary-bar {
  display: flex; gap: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 14px; padding: 16px 20px; margin-bottom: 12px; color: #fff;
}
.pd-summary-item { flex: 1; text-align: center; border-right: 1px solid rgba(255,255,255,0.2); }
.pd-summary-item:last-child { border-right: none; }
.pds-label { display: block; font-size: 11px; opacity: 0.8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.pds-value { font-size: 20px; font-weight: 700; }
.pds-score { font-size: 28px; }
.pds-tag {
  display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 10px;
  margin-top: 2px; font-weight: 600;
  background: rgba(255,255,255,0.2); color: #fff;
}
.pds-tag.excellent { background: rgba(52,211,153,0.7); }
.pds-tag.good { background: rgba(96,165,250,0.7); }
.pds-tag.normal { background: rgba(251,191,36,0.7); }
.pds-tag.low { background: rgba(248,113,113,0.7); }
.pds-confidence { font-size: 16px; }
.pds-weak { font-size: 14px; opacity: 0.85; }

/* 核心建议条 */
.pd-advice-bar {
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px;
  padding: 10px 16px; font-size: 13px; color: #92400e; margin-bottom: 10px;
  line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 图表区 */
.pd-charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
.pd-chart-panel {
  background: #fff; border: 1px solid #eef2f6; border-radius: 12px;
  padding: 14px 10px 4px; position: relative;
}
.pd-chart-title { font-size: 13px; font-weight: 600; color: #334155; padding: 0 4px; margin-bottom: 2px; }
.pd-chart-inner { width: 100%; height: 220px; }
.pd-chart-empty {
  height: 220px; display: flex; align-items: center; justify-content: center;
  color: #cbd5e1; font-size: 13px;
}
.pd-hover-hint {
  text-align: center; font-size: 10px; color: #cbd5e1; padding-bottom: 6px;
  user-select: none;
}

/* 详情折叠 */
.pd-detail-panels { margin-top: 2px; }
.pd-collapse {
  border: 1px solid #eef2f6; border-radius: 12px; overflow: hidden;
  background: #fff;
}
.pd-collapse :deep(.el-collapse-item__header) {
  padding: 12px 16px; font-size: 13px; font-weight: 500; color: #475569;
  border-bottom: 1px solid #f1f5f9; background: #fafbfc;
}
.pd-collapse :deep(.el-collapse-item__wrap) { border-bottom: 1px solid #f1f5f9; }
.pd-collapse :deep(.el-collapse-item__content) { padding: 14px 18px; }
.pd-panel-header { display: flex; align-items: center; gap: 6px; }
.pd-panel-icon { font-size: 15px; }
.pd-panel-count { color: #94a3b8; font-size: 11px; margin-left: 4px; }

/* 预测依据 / 优化建议 列表 */
.pd-reason-list { display: flex; flex-direction: column; gap: 8px; }
.pd-reason-item { display: flex; gap: 8px; padding: 8px 12px; border-radius: 8px; background: #f8fafc; border: 1px solid #f1f5f9; font-size: 13px; color: #475569; line-height: 1.6; align-items: flex-start; }
.pd-reason-num { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; }
.pd-reason-num--warn { background: linear-gradient(135deg, #f59e0b, #d97706); }
.pd-reason-num--action { background: linear-gradient(135deg, #10b981, #059669); }

/* 参考样本 */
.pd-ref-list { display: flex; flex-direction: column; gap: 8px; }
.pd-ref-card { padding: 10px 12px; border-radius: 8px; border: 1px solid #f1f5f9; font-size: 12px; }
.pdref-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; color: #64748b; }
.pdref-score { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.pdref-snippet { color: #334155; line-height: 1.5; margin-bottom: 4px; max-height: 60px; overflow: hidden; }
.pdref-reason { color: #94a3b8; font-size: 11px; }

/* 账号建议 */
.pd-account-list { display: flex; flex-direction: column; gap: 8px; }
.pd-account-item { padding: 12px; border-radius: 10px; background: #f8fafc; border: 1px solid #f1f5f9; }
.pd-account-item.pd-account-warn { background: #fffbeb; border-color: #fde68a; }
.pdacc-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 13px; }
.pdacc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.pdacc-dim { font-weight: 600; color: #334155; }
.pdacc-rank { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #6366f1; }
.pdacc-corr { font-size: 11px; color: #94a3b8; margin-left: auto; }
.pdacc-body { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 4px; font-size: 12px; }
.pdacc-score { color: #334155; }
.pdacc-score.low { color: #ef4444; font-weight: 600; }
.pdacc-grade { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #ecfdf5; color: #059669; }
.pdacc-grade.warn { background: #fef3c7; color: #d97706; }
.pdacc-advice { color: #64748b; font-size: 12px; line-height: 1.6; }

/* 响应式 */
@media (max-width: 750px) {
  .pd-summary-bar { flex-wrap: wrap; gap: 8px; }
  .pd-summary-item { flex: 1 1 45%; border-right: none; }
  .pd-charts { grid-template-columns: 1fr; }
}
</style>
