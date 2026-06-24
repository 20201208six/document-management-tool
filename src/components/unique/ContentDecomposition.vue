<template>
  <div class="content-decomposition">
    <div v-if="store.scriptRecords.length === 0" class="cd-empty">
      <span>请先在样本库中录入文稿后使用内容拆解</span>
    </div>

    <div v-else class="cd-body">
      <!-- 已拆解覆盖 -->
      <div class="cd-card cd-coverage">
        <div class="cdc-title">内容拆解</div>
        <div class="cdc-sub">录入文稿时自动拆解开头钩子、点赞引爆点和评论引导</div>
        <div class="cdcov-bar">
          <div class="cdcov-fill" :style="{ width: coveragePercent + '%' }"></div>
        </div>
        <div class="cdcov-text">
          已拆解 <strong>{{ coverage.done }}</strong> / {{ coverage.total }} 条
          <span v-if="pendingCount > 0" class="cdcov-pending">（{{ pendingCount }} 条待拆解）</span>
          <span v-else class="cdcov-done"> ✓ 全部完成</span>
        </div>
      </div>

      <!-- 高赞阈值设置 -->
      <div class="cd-card cd-thresholds">
        <div class="cdth-header" @click="showThresholds = !showThresholds">
          <span class="cdth-title">⚙️ 高赞门槛设置</span>
          <span class="cdth-summary" v-if="!showThresholds">
            {{ thresholdSummary }}
          </span>
          <span class="cdth-toggle">{{ showThresholds ? '收起' : '展开' }}</span>
        </div>
        <div v-if="showThresholds" class="cdth-body">
          <div class="cdth-hint">点赞数达到门槛的文稿才能纳入「高赞观点参考」</div>
          <div class="cdth-grid">
            <div v-for="p in platforms" :key="p" class="cdth-item">
              <span class="cdth-platform">{{ p }}</span>
              <input
                type="number"
                class="cdth-input"
                :value="store.highLikeThresholds[p]"
                @change="handleThresholdChange(p, ($event.target as HTMLInputElement).value)"
                min="0"
              />
              <span class="cdth-unit">赞</span>
            </div>
          </div>
          <div class="cdth-actions">
            <button class="cdth-btn-reset" @click="handleResetThresholds">恢复默认</button>
          </div>
        </div>
      </div>

      <!-- 高赞观点参考 -->
      <div v-if="topDecomposed.length" class="cd-card cd-topref">
        <div class="cdtr-header">
          <span class="cdtr-title">🏆 高赞观点参考</span>
          <span class="cdtr-sub">{{ topRefSubtitle }}</span>
        </div>
        <div class="cdtr-list">
          <div v-for="(s, i) in topDecomposed" :key="s.id" class="cdtr-item">
            <div class="cdtri-header">
              <span class="cdtri-rank">Top{{ i + 1 }}</span>
              <span class="cdtri-platform">{{ s.platform }}</span>
              <span class="cdtri-likes">👍 {{ formatNum(s.actualLikes) }}</span>
              <span class="cdtri-score">{{ s.compositeScore }}分</span>
            </div>
            <!-- 钩子 -->
            <div class="cdtri-row" v-if="s.decomposition">
              <span class="cdtri-label">开头</span>
              <span class="cds-tag" :class="'strength-' + s.decomposition.openingHook.strength">{{ strengthLabel(s.decomposition.openingHook.strength) }}</span>
              <span class="cds-tech">{{ s.decomposition.openingHook.technique }}</span>
              <div class="cdtri-text">「{{ s.decomposition.openingHook.text }}」</div>
            </div>
            <!-- 点赞观点 -->
            <div class="cdtri-row" v-if="s.decomposition?.likeTriggers.length">
              <span class="cdtri-label">观点</span>
              <span v-for="(lt, j) in s.decomposition.likeTriggers.slice(0, 2)" :key="'lt' + j" class="cdtri-tag-row">
                <span class="cds-tag imp" :class="'impact-' + lt.expectedImpact">{{ impactLabel(lt.expectedImpact) }}</span>
                <span class="cds-tech">{{ lt.triggerType }}</span>
                <span class="cdtri-text-inline">{{ lt.point }}</span>
              </span>
            </div>
            <!-- 评论引导 -->
            <div class="cdtri-row" v-if="s.decomposition?.commentBaits.length">
              <span class="cdtri-label">引导</span>
              <span v-for="(cb, j) in s.decomposition.commentBaits" :key="'cb' + j" class="cdtri-tag-row">
                <span class="cds-tech">{{ cb.technique }}</span>
                <span class="cdtri-text-inline">{{ cb.bait }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 分析按钮 -->
      <div class="cd-card cd-analyze">
        <button
          class="cdc-btn-main"
          @click="handleAnalyze"
          :disabled="analyzing || coverage.done < 3"
        >
          {{ analyzing ? '分析中...' : (store.decompositionAnalysis ? '🔄 重新分析' : '📊 分析全部拆解结果') }}
        </button>
        <div v-if="coverage.done < 3" class="cd-hint">至少需要 3 条已拆解样本才能分析</div>
      </div>

      <!-- 分析中 -->
      <div v-if="analyzing" class="cd-loading">
        <span class="cd-loading-dot"></span> AI 正在统计钩子技巧、点赞类型、评论引导分布...
      </div>

      <!-- 分析结果 -->
      <div v-else-if="store.decompositionAnalysis" class="cd-card cd-result">
        <div class="cdr-header">
          <span class="cdr-title">分析结果</span>
          <span class="cdr-time">{{ store.decompositionAnalysis.generatedAt }}</span>
        </div>

        <!-- AI 深度分析 -->
        <div class="cdr-ai">{{ store.decompositionAnalysis.aiInsight }}</div>

        <!-- 排行 -->
        <div class="cdr-section">
          <div class="cdr-section-title">🎣 钩子技巧排行</div>
          <div class="cdr-row" v-for="(h, i) in store.decompositionAnalysis.hookTechniques" :key="'h'+i">
            <span class="cdr-rank">#{{ i + 1 }}</span>
            <span class="cdr-name">{{ h.technique }}</span>
            <span class="cdr-count">{{ h.count }}次</span>
            <span class="cdr-likes">均赞 {{ h.avgLikes }}</span>
          </div>
        </div>

        <div class="cdr-section">
          <div class="cdr-section-title">💥 点赞引爆类型排行</div>
          <div class="cdr-row" v-for="(t, i) in store.decompositionAnalysis.likeTriggerTypes" :key="'lt'+i">
            <span class="cdr-rank">#{{ i + 1 }}</span>
            <span class="cdr-name">{{ t.type }}</span>
            <span class="cdr-count">{{ t.count }}次</span>
            <span class="cdr-likes">均赞 {{ t.avgLikes }}</span>
          </div>
        </div>

        <div class="cdr-section">
          <div class="cdr-section-title">💬 评论引导技巧排行</div>
          <div class="cdr-row" v-for="(b, i) in store.decompositionAnalysis.commentBaitTechniques" :key="'cb'+i">
            <span class="cdr-rank">#{{ i + 1 }}</span>
            <span class="cdr-name">{{ b.technique }}</span>
            <span class="cdr-count">{{ b.count }}次</span>
            <span class="cdr-likes">均赞 {{ b.avgLikes }}</span>
          </div>
        </div>

        <div v-if="store.decompositionAnalysis.effectiveCombos.length" class="cdr-section">
          <div class="cdr-section-title">🔥 高效组合（出现≥2次）</div>
          <div class="cdr-combo" v-for="(c, i) in store.decompositionAnalysis.effectiveCombos" :key="'combo'+i">
            <span class="cdr-rank">#{{ i + 1 }}</span>
            <span class="cdr-combo-chain">{{ c.hook }} → {{ c.trigger }} → {{ c.bait }}</span>
            <span class="cdr-likes">均赞 {{ c.avgLikes }} ({{ c.count }}次)</span>
          </div>
        </div>
      </div>

      <!-- 已拆解样本列表 -->
      <div v-if="decomposedSamples.length" class="cd-card cd-samples">
        <div class="cds-header" @click="showSamples = !showSamples">
          <span class="cds-title">已拆解样本明细 ({{ decomposedSamples.length }})</span>
          <span class="cds-toggle">{{ showSamples ? '收起' : '展开' }}</span>
        </div>

        <div v-if="showSamples" class="cds-list">
          <div
            v-for="s in decomposedSamples"
            :key="s.id"
            class="cds-sample-card"
            :class="{ expanded: expandedSampleId === s.id }"
          >
            <div class="cdss-header" @click="toggleSample(s.id)">
              <span class="cdss-platform">{{ s.platform }}</span>
              <span class="cdss-preview">{{ s.content.slice(0, 50) }}...</span>
              <span class="cdss-likes">👍 {{ formatNum(s.actualLikes) }}</span>
            </div>

            <div v-if="expandedSampleId === s.id && s.decomposition" class="cdss-body">
              <!-- 钩子 -->
              <div class="cdss-item">
                <div class="cdssi-head">
                  <span>🎣 开头钩子</span>
                  <span class="cds-tag" :class="'strength-' + s.decomposition.openingHook.strength">{{ strengthLabel(s.decomposition.openingHook.strength) }}</span>
                  <span class="cds-tech">{{ s.decomposition.openingHook.technique }}</span>
                </div>
                <div class="cds-quote">「{{ s.decomposition.openingHook.text }}」</div>
                <div class="cds-analysis">{{ s.decomposition.openingHook.analysis }}</div>
              </div>
              <!-- 点赞 -->
              <div class="cdss-item">
                <div class="cdssi-head"><span>💥 点赞引爆点</span></div>
                <div v-for="(lt, j) in s.decomposition.likeTriggers" :key="'lt'+j" style="margin-top:4px;">
                  <span class="cds-tag imp" :class="'impact-' + lt.expectedImpact">{{ impactLabel(lt.expectedImpact) }}</span>
                  <span class="cds-tech">{{ lt.triggerType }}</span>
                  <div class="cds-quote" style="margin-top:2px;">「{{ lt.point }}」</div>
                  <div class="cds-analysis">{{ lt.analysis }}</div>
                </div>
              </div>
              <!-- 评论 -->
              <div class="cdss-item">
                <div class="cdssi-head"><span>💬 评论引导</span></div>
                <div v-for="(cb, j) in s.decomposition.commentBaits" :key="'cb'+j" style="margin-top:4px;">
                  <span class="cds-tag imp" :class="'impact-' + cb.expectedEngagement">{{ impactLabel(cb.expectedEngagement) }}</span>
                  <span class="cds-tech">{{ cb.technique }}</span>
                  <div class="cds-quote" style="margin-top:2px;">「{{ cb.bait }}」</div>
                  <div class="cds-analysis">{{ cb.analysis }}</div>
                </div>
              </div>
              <!-- 整体 -->
              <div class="cdss-item" v-if="s.decomposition.overallAnalysis">
                <div class="cdssi-head"><span>📋 整体</span></div>
                <div class="cds-overall">{{ s.decomposition.overallAnalysis }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { ElMessage } from 'element-plus'
import { useUniqueModeStore } from '@/stores/uniqueMode'
import type { ScriptRecord } from '@/stores/uniqueMode'

const store = useUniqueModeStore()

const analyzing = ref(false)
const showSamples = ref(false)
const showThresholds = ref(false)
const expandedSampleId = ref<string | null>(null)

const platforms = ['抖音', '视频号', '快手', '小红书', 'B站', '其他'] as const

const thresholdSummary = computed(() => {
  return platforms.map(p => `${p}≥${store.highLikeThresholds[p]}`).join(' | ')
})

onActivated(() => {
  // 刷新覆盖统计
})

const coverage = computed(() => store.getDecompositionCoverage())
const coveragePercent = computed(() => coverage.value.total === 0 ? 0 : Math.round(coverage.value.done / coverage.value.total * 100))
const pendingCount = computed(() => coverage.value.total - coverage.value.done)

const decomposedSamples = computed(() =>
  store.scriptRecords.filter(s => s.decomposition) as Array<ScriptRecord & { decomposition: NonNullable<ScriptRecord['decomposition']> }>
)

/** 高赞已拆解样本：按平台阈值筛选后，取前 20%（最少2条，最多5条） */
const topDecomposed = computed(() => {
  const thresholds = store.highLikeThresholds
  // 先按平台阈值筛选
  const qualified = decomposedSamples.value.filter(s => s.actualLikes >= (thresholds[s.platform] ?? 500))
  // 如果没有达标的，放松到取全部前 20%
  const pool = qualified.length >= 2 ? qualified : decomposedSamples.value
  const sorted = [...pool].sort((a, b) => b.actualLikes - a.actualLikes)
  const topN = Math.min(Math.max(Math.ceil(sorted.length * 0.2), 2), 5)
  return sorted.slice(0, topN)
})

/** 高赞榜标题 */
const topRefSubtitle = computed(() => {
  const thresholds = store.highLikeThresholds
  const qualified = decomposedSamples.value.filter(s => s.actualLikes >= (thresholds[s.platform] ?? 500))
  const relaxed = qualified.length < 2 && decomposedSamples.value.length > 0
  if (relaxed && decomposedSamples.value.length) {
    return `暂无达标样本，已放宽显示 Top ${topDecomposed.value.length}（达标需 ${platforms.map(p => `${p}≥${thresholds[p]}`).join(' / ')}）`
  }
  return `达标 ${qualified.length} 条，取前 20% 即 Top ${topDecomposed.value.length}`
})

function handleThresholdChange(platform: string, val: string) {
  const n = parseInt(val) || 0
  store.setHighLikeThreshold(platform as any, n)
}

function handleResetThresholds() {
  store.resetHighLikeThresholds()
}

function toggleSample(id: string) {
  expandedSampleId.value = expandedSampleId.value === id ? null : id
}

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

function strengthLabel(s: string): string {
  return s === 'strong' ? '强' : s === 'medium' ? '中' : '弱'
}

function impactLabel(i: string): string {
  return i === 'high' ? '高' : i === 'medium' ? '中' : '低'
}

async function handleAnalyze() {
  analyzing.value = true
  try {
    await store.analyzeDecompositions()
    ElMessage.success('拆解分析完成')
  } catch (e: any) {
    ElMessage.error('分析失败：' + (e.message || '未知错误'))
  } finally {
    analyzing.value = false
  }
}
</script>

<style scoped>
.content-decomposition { height: 100%; overflow-y: auto; display: flex; flex-direction: column; padding: 0 2px; }
.cd-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #8a9bb0; font-size: 13px; }
.cd-body { display: flex; flex-direction: column; gap: 12px; }
.cd-card { background: #fff; border-radius: 14px; padding: 18px 20px; border: 1px solid #eef2f6; }

/* 覆盖 */
.cd-coverage .cdc-title { font-size: 16px; font-weight: 700; color: #0b1a30; }
.cd-coverage .cdc-sub { font-size: 12px; color: #909399; margin: 2px 0 12px; }
.cdcov-bar { height: 6px; border-radius: 3px; background: #eef2f6; overflow: hidden; margin-bottom: 6px; }
.cdcov-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #1a4cff, #6366f1); transition: width 0.5s ease; }
.cdcov-text { font-size: 12px; color: #606266; }
.cdcov-text strong { color: #1a4cff; }
.cdcov-pending { color: #e6a23c; }
.cdcov-done { color: #16a34a; }

/* 高赞阈值 */
.cd-thresholds { padding: 12px 18px; }
.cdth-header { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.cdth-title { font-size: 13px; font-weight: 600; color: #303133; flex-shrink: 0; }
.cdth-summary { flex: 1; font-size: 11px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cdth-toggle { font-size: 11px; color: #1a4cff; flex-shrink: 0; }
.cdth-body { margin-top: 12px; padding-top: 10px; border-top: 1px solid #f5f7fa; }
.cdth-hint { font-size: 11px; color: #909399; margin-bottom: 10px; }
.cdth-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
.cdth-item { display: flex; align-items: center; gap: 4px; }
.cdth-platform { font-size: 11px; color: #606266; flex-shrink: 0; min-width: 40px; }
.cdth-input { width: 60px; padding: 4px 8px; border-radius: 6px; border: 1px solid #e0e5ec; font-size: 13px; font-family: inherit; text-align: center; color: #0b1a30; outline: none; }
.cdth-input:focus { border-color: #1a4cff; }
.cdth-unit { font-size: 11px; color: #b0bfd0; }
.cdth-actions { text-align: right; }
.cdth-btn-reset { padding: 4px 12px; border-radius: 12px; border: 1px solid #e0e5ec; background: #fff; color: #909399; font-size: 11px; cursor: pointer; font-family: inherit; }
.cdth-btn-reset:hover { border-color: #1a4cff; color: #1a4cff; }

/* 高赞参考 */
.cd-topref { border-color: #fde68a; background: linear-gradient(135deg, #fffdf5 0%, #fff 100%); }
.cdtr-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.cdtr-title { font-size: 14px; font-weight: 700; color: #92400e; }
.cdtr-sub { font-size: 11px; color: #b0bfd0; }
.cdtr-list { display: flex; flex-direction: column; gap: 10px; }
.cdtr-item { padding: 12px; border-radius: 10px; background: #fff; border: 1px solid #fef3c7; }
.cdtri-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cdtri-rank { font-size: 11px; font-weight: 800; color: #f59e0b; background: #fffbeb; padding: 1px 8px; border-radius: 4px; }
.cdtri-platform { font-size: 11px; color: #909399; }
.cdtri-likes { font-size: 11px; font-weight: 600; color: #e6a23c; }
.cdtri-score { font-size: 11px; color: #1a4cff; margin-left: auto; }
.cdtri-row { margin-top: 6px; display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
.cdtri-row:first-of-type { margin-top: 0; }
.cdtri-label { font-size: 10px; font-weight: 700; color: #909399; padding: 1px 5px; background: #f3f4f6; border-radius: 4px; flex-shrink: 0; }
.cdtri-text { font-size: 12px; color: #1a4cff; font-style: italic; line-height: 1.5; padding: 3px 8px; background: #f5f7fe; border-radius: 6px; border-left: 2px solid #1a4cff; width: 100%; }
.cdtri-text-inline { font-size: 11px; color: #4b5563; line-height: 1.4; }
.cdtri-tag-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }

/* 分析按钮 */
.cd-analyze { text-align: center; }
.cdc-btn-main {
  padding: 10px 28px; border-radius: 22px; border: none; font-weight: 600; font-size: 14px; cursor: pointer;
  background: linear-gradient(135deg, #1a4cff, #6366f1); color: #fff; transition: all 0.2s; font-family: inherit;
}
.cdc-btn-main:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(26, 76, 255, 0.3); }
.cdc-btn-main:disabled { opacity: 0.4; transform: none; }
.cd-hint { font-size: 11px; color: #b0bfd0; margin-top: 8px; }

.cd-loading { padding: 24px; text-align: center; font-size: 13px; color: #8a9bb0; display: flex; align-items: center; justify-content: center; gap: 8px; }
.cd-loading-dot { width: 12px; height: 12px; border-radius: 50%; background: #1a4cff; animation: cd-pulse 1s infinite alternate; }
@keyframes cd-pulse { from { opacity: 0.3; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }

/* 分析结果 */
.cd-result { }
.cdr-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.cdr-title { font-size: 15px; font-weight: 700; color: #0b1a30; }
.cdr-time { font-size: 11px; color: #b0bfd0; }
.cdr-ai { font-size: 13px; color: #374151; line-height: 1.7; padding: 10px 14px; background: #f5f7fe; border-radius: 10px; border-left: 3px solid #1a4cff; margin-bottom: 16px; }
.cdr-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid #f5f7fa; }
.cdr-section:first-of-type { margin-top: 0; border-top: none; }
.cdr-section-title { font-size: 13px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.cdr-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 8px; background: #f9fafb; margin-bottom: 4px; font-size: 12px; }
.cdr-rank { font-weight: 700; color: #1a4cff; min-width: 22px; }
.cdr-name { flex: 1; color: #303133; }
.cdr-count { color: #909399; }
.cdr-likes { color: #16a34a; font-weight: 500; }
.cdr-combo { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; background: linear-gradient(135deg, #fff9e6, #fefce8); border: 1px solid #fde68a; margin-bottom: 4px; font-size: 12px; }
.cdr-combo-chain { flex: 1; color: #92400e; font-weight: 500; }

/* 样本明细 */
.cd-samples { }
.cds-header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; }
.cds-title { font-size: 13px; font-weight: 600; color: #303133; }
.cds-toggle { font-size: 11px; color: #1a4cff; }
.cds-list { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }

.cds-sample-card { border: 1px solid #eef2f6; border-radius: 10px; overflow: hidden; }
.cds-sample-card.expanded { border-color: #dce4f5; }
.cdss-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; transition: background 0.12s; }
.cdss-header:hover { background: #f8faff; }
.cdss-platform { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #e0e7ff; color: #4338ca; flex-shrink: 0; }
.cdss-preview { flex: 1; font-size: 12px; color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cdss-likes { font-size: 11px; color: #909399; flex-shrink: 0; }
.cdss-body { padding: 0 14px 14px; }

.cdss-item { margin-top: 10px; padding-top: 8px; border-top: 1px dashed #f0f2f5; }
.cdss-item:first-child { margin-top: 0; border-top: none; padding-top: 0; }
.cdssi-head { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 4px; flex-wrap: wrap; }

/* 标签复用 */
.cds-tech { font-size: 10px; padding: 1px 7px; border-radius: 8px; background: #ede9fe; color: #7c3aed; }
.cds-tag { font-size: 10px; padding: 1px 7px; border-radius: 8px; font-weight: 600; }
.cds-tag.strength-strong { background: #dcfce7; color: #16a34a; }
.cds-tag.strength-medium { background: #fef9c3; color: #ca8a04; }
.cds-tag.strength-weak { background: #fef2f2; color: #ef4444; }
.cds-tag.imp { font-weight: 500; }
.cds-tag.impact-high { background: #dcfce7; color: #16a34a; }
.cds-tag.impact-medium { background: #fef9c3; color: #ca8a04; }
.cds-tag.impact-low { background: #f3f4f6; color: #9ca3af; }
.cds-quote { font-size: 12px; color: #1a4cff; font-style: italic; padding: 4px 8px; background: #f5f7fe; border-radius: 4px; border-left: 2px solid #1a4cff; line-height: 1.5; }
.cds-analysis { font-size: 11px; color: #6b7280; line-height: 1.5; margin-top: 2px; }
.cds-overall { font-size: 12px; color: #374151; line-height: 1.6; }
</style>
