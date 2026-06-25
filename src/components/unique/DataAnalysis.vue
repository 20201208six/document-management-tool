<template>
  <div class="data-analysis">
    <!-- 顶部操作栏 -->
    <div class="da-header">
      <div class="dah-title">📊 多维数据分析</div>
      <div class="dah-actions">
        <el-button type="primary" @click="runAnalysis" :loading="analyzing">
          {{ analyzing ? '分析中...' : '🔍 刷新分析' }}
        </el-button>
        <el-button v-if="store.lastAnalysisResult && !store.lastAnalysisResult.aiReport" @click="generateReport" :loading="generatingReport">
          🤖 AI 深度报告
        </el-button>
        <el-button v-if="store.accountPersonality" type="success" @click="applyDataWeights" :loading="applyingWeights">
          📐 数据驱动权重
        </el-button>
      </div>
      <!-- 权重审核结果 -->
      <div class="da-validation" v-if="store.weightValidationResult">
        <div class="dav-header">
          <span>{{ store.weightValidationResult.passed ? '✅' : '⚠️' }}</span>
          <span class="dav-title">{{ store.weightValidationResult.passed ? '权重审核通过' : '权重审核拦截' }}</span>
        </div>
        <p class="dav-rec">{{ store.weightValidationResult.recommendation }}</p>
        <details class="dav-details">
          <summary>查看逐对明细（验证池 {{ store.weightValidationResult.totalPairs + 1 }} 条 / 旧 {{ Math.round(store.weightValidationResult.oldRate * 100) }}% → 新 {{ Math.round(store.weightValidationResult.newRate * 100) }}%）</summary>
          <div class="dav-pair" v-for="(p, i) in store.weightValidationResult.pairs" :key="i">
            {{ i + 1 }}. 旧{{ p.aOld }}≥{{ p.bOld }} → 新{{ p.aNew }}≥{{ p.bNew }} ｜ {{ p.oldOk ? (p.newOk ? '✓✓' : '✓✗') : (p.newOk ? '✗✓' : '✗✗') }} ({{ p.aLikes }}vs{{ p.bLikes }}赞)
          </div>
        </details>
        <!-- 跨模型审计 -->
        <div class="dav-cross" v-if="store.crossAuditWeightResult">
          <span>{{ store.crossAuditWeightResult.passed ? '🤖 跨模型审计：双审通过' : '🤖⚠️ 跨模型审计：外部驳回' }}</span>
          <span class="dav-cross-v">{{ store.crossAuditWeightResult.verdict }}</span>
        </div>
      </div>
    </div>

    <div v-if="!store.lastAnalysisResult" class="da-empty">
      <p>点击「刷新分析」对样本库数据进行关联分析，发现你的账号中——</p>
      <p class="da-empty-hint">哪些维度真正驱动点赞？哪些维度影响平台推流？</p>
      <p class="da-empty-hint dim">至少需要 3 条已打分样本，播放量数据越多分析越精准</p>
    </div>

    <template v-if="store.lastAnalysisResult">
      <!-- 总览 -->
      <div class="da-overview">
        <div class="dao-card">
          <div class="daoc-num">{{ store.lastAnalysisResult.totalSamples }}</div>
          <div class="daoc-label">分析样本</div>
        </div>
        <div class="dao-card">
          <div class="daoc-num">{{ store.lastAnalysisResult.avgLikeRate }}%</div>
          <div class="daoc-label">平均点赞率</div>
        </div>
        <div class="dao-card" v-for="f in store.lastAnalysisResult.keyFactors.slice(0, 2)" :key="f.factor">
          <div class="daoc-num" :style="{ color: Math.abs(f.correlation) > 0.5 ? '#16a34a' : Math.abs(f.correlation) > 0.25 ? '#e6a23c' : '#909399' }">
            {{ f.correlation > 0 ? '+' : '' }}{{ (f.correlation * 100).toFixed(0) }}%
          </div>
          <div class="daoc-label">{{ f.factor.replace('相关性', '').replace('×点赞', '') }}</div>
        </div>
      </div>

      <!-- 模型版本提示 -->
      <div class="da-model-banner" v-if="store.lastAnalysisResult.mixedModel">
        <span>⚠️ 检测到样本来自不同模型（{{ store.lastAnalysisResult.modelVersion }} 等），AI 评分的一致性可能受影响。建议统一模型后重新打分。下方「本地特征分析」不受模型变更影响。</span>
      </div>

      <!-- 本地特征分析（模型无关，可跨模型复用） -->
      <div class="da-section" v-if="store.lastAnalysisResult.modelAgnosticFactors?.length">
        <div class="das-title">📐 本地特征分析（不依赖 AI，跨模型兼容）</div>
        <div class="da-agnostic-grid">
          <div class="da-ag-item" v-for="a in store.lastAnalysisResult.modelAgnosticFactors" :key="a.factor">
            <span class="da-ag-label">{{ a.factor }}</span>
            <span class="da-ag-likes" :style="{ color: Math.abs(a.likesCorrelation) > 0.5 ? '#16a34a' : Math.abs(a.likesCorrelation) > 0.25 ? '#e6a23c' : '#909399' }">
              ×点赞 {{ a.likesCorrelation > 0 ? '+' : '' }}{{ (a.likesCorrelation * 100).toFixed(0) }}%
            </span>
            <span class="da-ag-views" v-if="a.viewsCorrelation !== null">
              ×播放 {{ a.viewsCorrelation > 0 ? '+' : '' }}{{ (a.viewsCorrelation * 100).toFixed(0) }}%
            </span>
          </div>
        </div>
      </div>

      <!-- ===== 账号人格画像 ===== -->
      <div class="da-section personality" v-if="store.accountPersonality">
        <div class="das-title">
          🧬 账号人格画像
          <span v-if="store.accountPersonality.personalityShifted" class="personality-shift-badge">⚠ 人格漂移</span>
        </div>
        <p class="personality-desc">
          基于 <strong>{{ store.accountPersonality.sampleCount }}</strong> 条样本，分析各维度对点赞量和播放量的实际驱动强度。
          <span v-if="store.accountPersonality.personalityShifted" class="shift-hint">
            相比上次分析，你的账号驱动力结构发生了变化。
          </span>
        </p>

        <!-- 驱动点赞最强维度 -->
        <div class="personality-drivers">
          <div class="pd-col">
            <div class="pdc-header">👍 点赞驱动力排序</div>
            <div class="pdc-list">
              <div v-for="(d, i) in store.accountPersonality.likesRanking" :key="d.key" class="pdc-item">
                <div class="pdci-rank" :class="i === 0 ? 'top1' : i === 1 ? 'top2' : ''">{{ i + 1 }}</div>
                <div class="pdci-label">{{ d.label }}</div>
                <div class="pdci-bar-track">
                  <div class="pdci-bar" :class="d.correlation > 0.5 ? 'strong' : d.correlation > 0.25 ? 'mid' : d.correlation > 0 ? 'weak' : 'neg'"
                    :style="{ width: Math.max(Math.abs(d.correlation * 100), 4) + '%' }"></div>
                </div>
                <div class="pdci-val" :style="{ color: d.correlation > 0.25 ? '#16a34a' : d.correlation > 0 ? '#6b7280' : '#ef4444' }">
                  {{ (d.correlation * 100).toFixed(1) }}%
                </div>
              </div>
            </div>
          </div>

          <!-- 驱动播放最强维度 -->
          <div class="pd-col" v-if="store.accountPersonality.viewsRanking.length > 0">
            <div class="pdc-header">👁 播放驱动力排序</div>
            <div class="pdc-list">
              <div v-for="(d, i) in store.accountPersonality.viewsRanking" :key="d.key" class="pdc-item">
                <div class="pdci-rank" :class="i === 0 ? 'top1' : i === 1 ? 'top2' : ''">{{ i + 1 }}</div>
                <div class="pdci-label">{{ d.label }}</div>
                <div class="pdci-bar-track">
                  <div class="pdci-bar" :class="d.correlation > 0.5 ? 'strong' : d.correlation > 0.25 ? 'mid' : d.correlation > 0 ? 'weak' : 'neg'"
                    :style="{ width: Math.max(Math.abs(d.correlation * 100), 4) + '%' }"></div>
                </div>
                <div class="pdci-val" :style="{ color: d.correlation > 0.25 ? '#16a34a' : d.correlation > 0 ? '#6b7280' : '#ef4444' }">
                  {{ (d.correlation * 100).toFixed(1) }}%
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 解读 -->
        <div class="personality-insight" v-if="store.accountPersonality.topLikeDriver">
          <strong>💡 数据解读：</strong>
          你的账号中，<em>{{ store.accountPersonality.topLikeDriver.label }}</em> 与点赞量关联最强（{{ (store.accountPersonality.topLikeDriver.correlation * 100).toFixed(0) }}%），
          创作时优先打磨此维度最可能带来点赞提升。
          <template v-if="store.accountPersonality.topViewDriver && store.accountPersonality.topViewDriver.key !== store.accountPersonality.topLikeDriver.key">
            而平台推流更依赖 <em>{{ store.accountPersonality.topViewDriver.label }}</em>（{{ (store.accountPersonality.topViewDriver.correlation * 100).toFixed(0) }}%）。
          </template>
        </div>
      </div>

      <!-- 相关性分析（宏观） -->
      <div class="da-section">
        <div class="das-title">📈 宏观相关性</div>
        <div class="da-correlations">
          <div v-for="f in macroFactors" :key="f.factor" class="dac-item">
            <div class="daci-label">
              <span>{{ f.factor }}</span>
              <span class="daci-sig" :class="f.significance">
                {{ f.significance === 'high' ? '强' : f.significance === 'medium' ? '中' : '弱' }}
              </span>
            </div>
            <div class="daci-bar-track">
              <div class="daci-bar-fill" :class="f.correlation > 0.5 ? 'pos-strong' : f.correlation > 0 ? 'pos' : 'neg'"
                :style="{ width: Math.abs(f.correlation * 100) + '%' }"></div>
            </div>
            <div class="daci-val">{{ (f.correlation * 100).toFixed(1) }}%</div>
          </div>
        </div>
      </div>

      <!-- 点赞率分布 -->
      <div class="da-section">
        <div class="das-title">💗 点赞率分布</div>
        <div class="da-likerate">
          <div v-for="d in store.lastAnalysisResult.likeRateDistribution" :key="d.range" class="dlr-item">
            <div class="dlri-range">{{ d.range }}</div>
            <div class="dlri-bar-track">
              <div class="dlri-bar-fill" :style="{ width: d.pct + '%' }"></div>
            </div>
            <div class="dlri-count">{{ d.count }}条 ({{ d.pct }}%)</div>
          </div>
        </div>
      </div>

      <!-- 平台对比 -->
      <div class="da-section" v-if="store.lastAnalysisResult.platformMetrics.length > 1">
        <div class="das-title">🏷️ 各平台指标</div>
        <div class="da-platforms">
          <table class="dap-table">
            <thead>
              <tr>
                <th>平台</th><th>样本</th><th>均播放</th><th>均点赞</th><th>点赞率</th><th>均评分</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in store.lastAnalysisResult.platformMetrics" :key="p.platform">
                <td><strong>{{ p.platform }}</strong></td>
                <td>{{ p.count }}</td>
                <td>{{ fmtNum(p.avgViews) }}</td>
                <td>{{ fmtNum(p.avgLikes) }}</td>
                <td>{{ p.avgLikeRate }}%</td>
                <td>{{ p.avgScore }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 异常点 -->
      <div class="da-section" v-if="store.lastAnalysisResult.outliers.length > 0">
        <div class="das-title">⚠️ 异常点（评分与实绩不匹配）</div>
        <div class="da-outliers">
          <div v-for="o in store.lastAnalysisResult.outliers" :key="o.id" class="daao-item">
            <div class="daaoi-top">
              <span class="daaoi-snippet">「{{ o.snippet }}...」</span>
              <span class="daaoi-score">综合 {{ o.compositeScore }}分</span>
            </div>
            <div class="daaoi-meta">
              <span>👍 {{ fmtNum(o.likes) }}</span>
              <span v-if="o.views">👁 {{ fmtNum(o.views) }}</span>
            </div>
            <div class="daaoi-reason">{{ o.reason }}</div>
          </div>
        </div>
      </div>

      <!-- 人格演变历史 -->
      <div class="da-section" v-if="store.dimensionCorrelationHistory.length > 1">
        <div class="das-title">📅 人格演变轨迹</div>
        <div class="personality-timeline">
          <div v-for="snap in store.dimensionCorrelationHistory.slice(0, 5)" :key="snap.timestamp" class="pt-entry">
            <div class="pte-time">{{ snap.timestamp }}</div>
            <div class="pte-tags">
              <span v-for="d in snap.topDimLikes.slice(0, 3)" :key="d.key" class="ptet-tag">{{ d.label }}</span>
            </div>
            <div class="pte-count">{{ snap.sampleCount }}条</div>
          </div>
        </div>
      </div>

      <!-- AI 深度报告 -->
      <div class="da-section" v-if="store.lastAnalysisResult.aiReport">
        <div class="das-title">🤖 AI 深度分析</div>
        <div class="da-ai-report" v-text="store.lastAnalysisResult.aiReport"></div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUniqueModeStore } from '@/stores/uniqueMode'
import { ElMessage } from 'element-plus'

const store = useUniqueModeStore()
const analyzing = ref(false)
const generatingReport = ref(false)
const applyingWeights = ref(false)

/** 只显示宏观相关项，排除逐维度 */
const macroFactors = computed(() =>
  store.lastAnalysisResult?.keyFactors.filter(f =>
    !f.factor.includes('×点赞') && !f.factor.includes('×播放')
  ) || []
)

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString()
}

async function runAnalysis() {
  analyzing.value = true
  try { await store.analyzeCorrelations() } finally { analyzing.value = false }
}

async function generateReport() {
  generatingReport.value = true
  try { await store.generateAIAnalysisReport() } finally { generatingReport.value = false }
}

async function applyDataWeights() {
  applyingWeights.value = true
  try {
    await store.applyDataDrivenWeights()
    ElMessage.success('权重已根据本账号数据自动更新')
  } catch (e: any) {
    ElMessage.error(e.message || '失败')
  } finally {
    applyingWeights.value = false
  }
}
</script>

<style scoped>
.data-analysis { padding: 20px 24px; max-width: 960px; margin: 0 auto; height: 100%; overflow-y: auto; }

/* 顶部操作栏 */
.da-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
  padding: 16px 20px; background: #fff; border-radius: 14px;
  border: 1px solid #eef2f6; box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  flex-wrap: wrap;
}
.dah-title { font-size: 17px; font-weight: 700; color: #0f172a; white-space: nowrap; }
.dah-actions { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }

/* 空状态 */
.da-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 80px 20px; text-align: center;
  background: linear-gradient(135deg, #f8fafd 0%, #eef2f8 100%);
  border-radius: 16px; border: 2px dashed #dce4f0;
}
.da-empty p { font-size: 14px; color: #64748b; margin: 0 0 6px; }
.da-empty-hint {
  font-size: 13px; color: #8b9bb5; margin-top: 4px;
  padding: 4px 14px; background: rgba(26,76,255,0.06); border-radius: 20px;
}
.da-empty-hint.dim { background: transparent; color: #a8b8cc; }

/* 权重审核 */
.da-validation {
  width: 100%; margin-top: 4px; padding: 14px 16px;
  background: #f8fafc; border-radius: 10px; border: 1px solid #e8ecf1;
}
.dav-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.dav-title { font-weight: 600; font-size: 13px; color: #111827; }
.dav-rec { font-size: 12px; color: #6b7280; margin: 0 0 6px; line-height: 1.5; }
.dav-details { font-size: 12px; }
.dav-details summary { cursor: pointer; color: #1a56db; font-weight: 500; margin-bottom: 4px; }
.dav-pair { font-size: 11px; font-family: monospace; color: #6b7280; padding: 2px 0; }
.dav-cross { margin-top: 6px; padding: 6px 10px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0; font-size: 11px; }
.dav-cross-v { display: block; color: #374151; margin-top: 2px; font-size: 11px; }

/* 总览卡片 */
.da-overview { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
.dao-card {
  text-align: center; padding: 18px 10px;
  background: #fff; border-radius: 14px;
  border: 1px solid #eef2f6; box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  transition: box-shadow 0.2s, transform 0.15s;
}
.dao-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); transform: translateY(-1px); }
.daoc-num { font-size: 26px; font-weight: 700; color: #1a4cff; line-height: 1.2; }
.daoc-label { font-size: 12px; color: #68758a; margin-top: 6px; font-weight: 500; }

/* 模型版本提示 */
.da-model-banner {
  padding: 12px 16px; background: #fffbeb; border-radius: 10px;
  border: 1px solid #fde68a; font-size: 13px; color: #92400e;
  margin-bottom: 14px; line-height: 1.6;
}

/* 本地特征分析 */
.da-agnostic-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.da-ag-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  background: #fff; border-radius: 10px; border: 1px solid #eef2f6;
  transition: border-color 0.15s;
}
.da-ag-item:hover { border-color: #d4dae8; }
.da-ag-label { font-size: 12px; color: #374151; font-weight: 500; min-width: 65px; }
.da-ag-likes { font-size: 12px; font-weight: 600; }
.da-ag-views { font-size: 11px; color: #909399; }

/* 通用区块 */
.da-section {
  margin-bottom: 16px; padding: 18px 20px;
  background: #fff; border-radius: 14px;
  border: 1px solid #eef2f6; box-shadow: 0 1px 3px rgba(0,0,0,0.03);
}
.da-section.personality { border-color: #d9e2fe; background: #fafbff; }
.das-title {
  font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 14px;
  display: flex; align-items: center; gap: 8px;
}
.personality-shift-badge {
  font-size: 11px; padding: 2px 10px; border-radius: 10px;
  background: #fef3c7; color: #d97706; font-weight: 500;
}
.personality-desc { font-size: 13px; color: #5a6a80; margin-bottom: 14px; line-height: 1.7; }
.shift-hint { color: #d97706; font-weight: 500; }
.personality-drivers { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.pd-col { background: #fff; border-radius: 10px; padding: 12px 14px; border: 1px solid #eef2f6; }
.pdc-header { font-size: 13px; font-weight: 600; color: #1f2937; margin-bottom: 10px; }
.pdc-list { display: flex; flex-direction: column; gap: 7px; }
.pdc-item { display: flex; align-items: center; gap: 8px; }
.pdci-rank {
  width: 22px; height: 22px; border-radius: 6px; background: #f3f4f6;
  font-size: 11px; font-weight: 700; display: flex; align-items: center;
  justify-content: center; color: #6b7280; flex-shrink: 0;
}
.pdci-rank.top1 { background: #f59e0b; color: #fff; }
.pdci-rank.top2 { background: #94a3b8; color: #fff; }
.pdci-label { font-size: 12px; color: #374151; min-width: 55px; }
.pdci-bar-track { flex: 1; height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
.pdci-bar { height: 100%; border-radius: 4px; min-width: 3px; }
.pdci-bar.strong { background: #22c55e; }
.pdci-bar.mid { background: #a3e635; }
.pdci-bar.weak { background: #93c5fd; }
.pdci-bar.neg { background: #fca5a5; }
.pdci-val { font-size: 11px; font-weight: 600; min-width: 42px; text-align: right; }
.personality-insight {
  font-size: 13px; color: #334155; line-height: 1.8;
  padding: 12px 14px; background: #f0fdf4; border-radius: 10px;
  border: 1px solid #bbf7d0;
}
.personality-insight em { font-style: normal; font-weight: 600; color: #16a34a; }

/* 宏观相关性 */
.da-correlations { display: flex; flex-direction: column; gap: 10px; }
.dac-item { display: flex; align-items: center; gap: 12px; }
.daci-label { min-width: 160px; font-size: 13px; color: #374151; display: flex; align-items: center; gap: 8px; }
.daci-sig {
  font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 600;
}
.daci-sig.high { background: #dcfce7; color: #16a34a; }
.daci-sig.medium { background: #fef9c3; color: #ca8a04; }
.daci-sig.low { background: #f3f4f6; color: #9ca3af; }
.daci-bar-track { flex: 1; height: 10px; background: #f3f4f6; border-radius: 5px; overflow: hidden; }
.daci-bar-fill { height: 100%; border-radius: 5px; min-width: 4px; }
.daci-bar-fill.pos-strong { background: #22c55e; }
.daci-bar-fill.pos { background: #93c5fd; }
.daci-bar-fill.neg { background: #fca5a5; }
.daci-val { font-size: 12px; font-weight: 600; min-width: 50px; text-align: right; color: #1f2937; }

/* 点赞率分布 */
.da-likerate { display: flex; flex-direction: column; gap: 8px; }
.dlr-item { display: flex; align-items: center; gap: 12px; }
.dlri-range { min-width: 70px; font-size: 12px; color: #4a5568; font-weight: 500; }
.dlri-bar-track { flex: 1; height: 12px; background: #f3f4f6; border-radius: 6px; overflow: hidden; }
.dlri-bar-fill { height: 100%; background: linear-gradient(90deg, #a78bfa, #f472b6); border-radius: 6px; }
.dlri-count { font-size: 12px; color: #68758a; min-width: 85px; text-align: right; }

/* 平台对比 */
.da-platforms { overflow-x: auto; }
.dap-table { width: 100%; border-collapse: collapse; font-size: 13px; border-radius: 10px; overflow: hidden; }
.dap-table th, .dap-table td { padding: 10px 12px; text-align: center; border-bottom: 1px solid #f3f4f6; }
.dap-table th { background: #f8fafc; color: #5a6a80; font-weight: 600; font-size: 12px; }
.dap-table td { color: #374151; }

/* 异常点 */
.da-outliers { display: flex; flex-direction: column; gap: 10px; }
.daao-item {
  padding: 12px 14px; background: #fff; border: 1px solid #fde68a;
  border-radius: 10px; transition: box-shadow 0.15s;
}
.daao-item:hover { box-shadow: 0 2px 8px rgba(251,191,36,0.1); }
.daaoi-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.daaoi-snippet { font-size: 13px; color: #92400e; font-weight: 500; }
.daaoi-score { font-size: 12px; color: #a16207; font-weight: 600; }
.daaoi-meta { display: flex; gap: 16px; font-size: 12px; color: #78716c; }
.daaoi-reason { font-size: 12px; color: #d97706; margin-top: 6px; line-height: 1.5; }

/* 人格演变 */
.personality-timeline { display: flex; flex-direction: column; gap: 6px; }
.pt-entry {
  display: flex; align-items: center; gap: 14px; padding: 8px 10px;
  border-radius: 8px; font-size: 12px;
}
.pt-entry:nth-child(odd) { background: #f8fafc; }
.pte-time { color: #818ba0; min-width: 130px; white-space: nowrap; }
.pte-tags { display: flex; gap: 5px; flex: 1; }
.ptet-tag {
  padding: 2px 8px; border-radius: 5px; background: #ede9fe;
  color: #7c3aed; font-size: 11px; font-weight: 500;
}
.pte-count { color: #a8b2c3; min-width: 40px; text-align: right; }

/* AI 报告 */
.da-ai-report {
  font-size: 14px; line-height: 1.9; color: #334155;
  white-space: pre-wrap; padding: 8px 0;
}

/* 响应式 */
@media (max-width: 768px) {
  .da-overview { grid-template-columns: repeat(2, 1fr); }
  .da-agnostic-grid { grid-template-columns: 1fr 1fr; }
  .personality-drivers { grid-template-columns: 1fr; }
}
</style>
