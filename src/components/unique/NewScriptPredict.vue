<template>
  <div class="new-script-predict">
    <div class="nsp-layout">
      <!-- ===== 左栏：主内容区 ===== -->
      <div class="nsp-main">
    <!-- ===== 1. 新文稿预测 + 预测历史 双栏 ===== -->
    <div class="nsp-predict-row">
      <!-- 左：预测输入卡片 -->
      <div class="nsp-card nsp-input">
        <div class="nsp-card-title">📝 新文稿预测</div>
        <p class="nsp-card-desc">基于历史样本库中的文稿与点赞数据，通过7维评分体系（锚定Likert 1-5量表）和相似度匹配，预估新文稿的点赞量区间。<br><span style="color:#1a4cff">盲预测模式：AI 预测时看不到参考样本的实际点赞量，确保预测客观。</span></p>

        <div class="nsp-input-row">
          <el-select v-model="predPlatform" size="default" class="nsp-select">
            <el-option v-for="(c, k) in PLATFORM_CONFIG" :key="k" :label="c.icon + ' ' + c.label" :value="k" />
          </el-select>
          <span class="nsp-sample-hint" v-if="store.scriptRecords.length">
            样本库 {{ store.scriptRecords.length }} 条 · 同平台 {{ samePlatformCount }} 条
          </span>
          <span class="nsp-sample-hint warn" v-else>请先录入样本</span>
        </div>

        <textarea
          v-model="predContent"
          placeholder="在此粘贴口播文稿全文…&#10;&#10;AI 将逐维度分析困惑命中、被理解感、解释力密度等 7 项指标，&#10;并匹配样本库中最相似的文稿进行点赞量预估"
          rows="7"
        ></textarea>

        <div class="nsp-actions">
          <button class="nsp-btn nsp-btn-primary" @click="handlePredict" :disabled="!predContent.trim() || store.isPredicting">
            {{ store.isPredicting ? '⏳ 分析中…' : '🔮 开始预测' }}
          </button>
          <button class="nsp-btn nsp-btn-ghost" @click="handleClear" :disabled="!predContent.trim()">清空</button>
        </div>
      </div>
    </div>

    <!-- ===== 4. 预测结果 ===== -->
    <template v-if="store.lastPrediction && !store.isPredicting">
      <!-- 历史查看提示 -->
      <div v-if="viewingHistoryId" class="nsp-viewing-bar">
        <span>📋 正在查看历史预测 · {{ viewingHistoryTime }}</span>
        <div class="nsp-vb-actions">
          <button
            v-if="!isHistoryReviewed(viewingHistoryId)"
            class="nsp-vb-retro"
            @click="showRetroDialog(retroEntryForCurrent)"
          >
            🔄 录入复盘数据
          </button>
          <button class="nsp-vb-back" @click="clearViewingHistory">✕ 返回当前</button>
        </div>
      </div>

      <!-- 结果概览 -->
      <div class="nsp-card nsp-result-card">
        <div class="nsp-card-title">📊 预测结果</div>
        <div class="nspr-overview">
          <div class="nspro-item nspro-likes">
            <span class="nspro-label">预估点赞区间</span>
            <span class="nspro-value">{{ fmt(store.lastPrediction.minLikes) }} ~ {{ fmt(store.lastPrediction.maxLikes) }}</span>
          </div>
          <div class="nspro-item nspro-score">
            <span class="nspro-label">综合模型分</span>
            <span class="nspro-value">{{ store.lastPrediction.compositeScore }}</span>
            <span class="nspro-tag" :class="scoreTag(store.lastPrediction.compositeScore)">{{ scoreTagText(store.lastPrediction.compositeScore) }}</span>
          </div>
          <div class="nspro-item">
            <span class="nspro-label">最弱维度</span>
            <span class="nspro-value">{{ weakestDim }}</span>
          </div>
          <div class="nspro-item" v-if="store.lastPrediction.confidence">
            <span class="nspro-label">置信度</span>
            <span class="nspro-value confidence">{{ store.lastPrediction.confidence }}</span>
          </div>
        </div>
        <div class="nspr-summary" v-if="store.lastPrediction.suggestions.length">
          <strong>💡 核心建议：</strong>{{ store.lastPrediction.suggestions[0] }}
        </div>
      </div>

      <!-- 概率分布 -->
      <div class="nsp-card" v-if="store.lastPrediction.bucketProbabilities && store.lastPrediction.bucketProbabilities.length">
        <div class="nsp-card-title">🎲 点赞量概率分布 <span class="nsp-subtitle">（各桶概率之和 ≈ 100%）</span></div>
        <div class="nsp-prob-chart">
          <div v-for="bp in store.lastPrediction.bucketProbabilities" :key="bp.bucket" class="nsp-prob-bar-wrap">
            <div class="nsp-prob-label">{{ bp.label }}</div>
            <div class="nsp-prob-track">
              <div
                class="nsp-prob-fill"
                :class="{ headline: bp.isHeadline }"
                :style="{ width: bp.probability + '%' }"
              ></div>
            </div>
            <div class="nsp-prob-pct" :class="{ headline: bp.isHeadline }">{{ bp.probability }}%</div>
          </div>
        </div>
      </div>

      <!-- 7维评分 -->
      <div class="nsp-card">
        <div class="nsp-card-title">🎯 7 维评分详情</div>
        <div class="nsp-scores-grid">
          <div v-for="d in SCORING_DIMENSION_CONFIG" :key="d.key" class="nsps-item">
            <div class="nsps-header">
              <span class="nsps-dot" :style="{ background: d.color }"></span>
              <span class="nsps-label">{{ d.label }}</span>
              <span class="nsps-val" :style="{ color: d.color }">{{ store.lastPrediction.scores[d.key] }}</span>
              <span class="nsps-disagree" v-if="store.predictDisagreements.some(dd => dd.key === d.key)" title="AI 3轮评分不一致">⚠</span>
            </div>
            <div class="nsps-bar-wrap">
              <div class="nsps-bar" :style="{ width: store.lastPrediction.scores[d.key] + '%', background: d.color }"></div>
            </div>
          </div>
        </div>
        <!-- 评分分歧提示 -->
        <div v-if="store.predictDisagreements.length" class="nsps-disagree-box">
          <div class="nsps-disagree-title">⚠ AI 评分离散警告</div>
          <div class="nsps-disagree-item" v-for="dd in store.predictDisagreements" :key="dd.key">
            <span class="nsps-disagree-dim">{{ dd.label }}</span>
            <span class="nsps-disagree-vals">
              3轮分值：<b>{{ dd.runs[0] }}</b> / <b>{{ dd.runs[1] }}</b> / <b>{{ dd.runs[2] }}</b>（极差 {{ dd.range }}）
              <span class="nsps-disagree-hint">→ 采用中位数</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 账号专属优化建议 -->
      <div class="nsp-card nsp-account-advice" v-if="store.accountPersonality">
        <div class="nsp-card-title">🔬 账号专属优化建议</div>
        <div class="nsaa-subtitle">
          基于 {{ store.accountPersonality.sampleCount }} 条历史样本分析 · 点赞驱动维度排名
          <span v-if="store.accountPersonality.personalityShifted" class="nsaa-shifted-tag">画像已更新</span>
        </div>
        <div class="nsaa-items">
          <div
            v-for="item in accountAdviceItems"
            :key="item.key"
            class="nsaa-item"
            :class="{ 'nsaa-warn': item.isWeak }"
          >
            <div class="nsaai-header">
              <span class="nsaai-dot" :style="{ background: item.color }"></span>
              <span class="nsaai-dim">{{ item.label }}</span>
              <span class="nsaai-rank">#{{ item.rank }}</span>
              <span class="nsaai-correlation">点赞关联度 {{ item.correlationDisplay }}</span>
            </div>
            <div class="nsaai-body">
              <div class="nsaai-score-row">
                <span class="nsaai-score-label">本稿该维度评分</span>
                <span class="nsaai-score-val" :class="{ low: item.isWeak }">{{ item.currentScore }} 分</span>
                <span class="nsaai-grade" :class="{ warn: item.isWeak }">{{ item.grade }}</span>
              </div>
              <div class="nsaai-advice" :class="{ warn: item.isWeak }">
                {{ item.advice }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 预测依据 & 参考样本 双栏 -->
      <div class="nsp-two-col">
        <div class="nsp-card" v-if="store.lastPrediction.reasons.length">
          <div class="nsp-card-title">🔍 预测依据</div>
          <ul class="nsp-list">
            <li v-for="(r, i) in store.lastPrediction.reasons" :key="i">{{ r }}</li>
          </ul>
        </div>

        <div class="nsp-card" v-if="store.lastPrediction.referencedSamples.length">
          <div class="nsp-card-title">📋 主要参考样本 <span class="nsp-subtitle">（仅评分匹配，非点赞量对标）</span></div>
          <div class="nsp-ref-list" v-for="s in store.lastPrediction.referencedSamples" :key="s.scriptId">
            <div class="nspr-card">
              <div class="nsprc-platform">{{ PLATFORM_CONFIG[s.platform]?.icon }} {{ s.platform }}</div>
              <div class="nsprc-snippet">{{ s.snippet }}</div>
              <div class="nsprc-meta">
                <span class="nsprc-score">{{ s.compositeScore }} 分</span>
              </div>
              <div class="nsprc-reason">{{ s.similarityReason }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 反事实分析 -->
      <div class="nsp-card" v-if="store.lastPrediction.counterfactuals && store.lastPrediction.counterfactuals.length">
        <div class="nsp-card-title">🔄 反事实分析</div>
        <ul class="nsp-list nsp-counter">
          <li v-for="(c, i) in store.lastPrediction.counterfactuals" :key="i">{{ c }}</li>
        </ul>
      </div>

      <!-- 改进建议 -->
      <div class="nsp-card" v-if="store.lastPrediction.suggestions.length > 1 || (store.lastPrediction.suggestions.length === 1 && !store.lastPrediction.counterfactuals)">
        <div class="nsp-card-title">✏️ 优化建议</div>
        <ul class="nsp-list nsp-suggestions">
          <li v-for="(s, i) in store.lastPrediction.suggestions" :key="i">{{ s }}</li>
        </ul>
      </div>

      <!-- ===== 5. 深度工具 + AI复盘 ===== -->
      <div class="nsp-card">
        <div class="nsp-card-title">🔧 深度工具</div>
        <div class="nsp-tools">
          <el-button type="warning" @click="handleCrossAudit" :loading="auditLoading" :disabled="!store.lastPrediction">
            🔬 独立校验
          </el-button>
          <el-button type="success" @click="handleImprove" :loading="improveLoading" :disabled="!store.lastPrediction">
            ✨ 灵感改进
          </el-button>
        </div>

        <!-- 校验结果 -->
        <div v-if="store.crossAuditResult" class="nsp-audit-result">
          <div class="nspar-header">
            <span>双模型校验</span>
            <span class="nspar-cred" :class="store.crossAuditResult.credibility">
              {{ store.crossAuditResult.credibility === 'high' ? '✅ 高可信' : store.crossAuditResult.credibility === 'medium' ? '⚠️ 基本可信' : '❌ 差异大' }}
            </span>
          </div>
          <div class="nspar-note">{{ store.crossAuditResult.note }}</div>
          <div class="nspar-diffs" v-if="store.crossAuditResult.dimensionDiffs.filter(d=>d.flag!=='ok').length>0">
            <div v-for="d in store.crossAuditResult.dimensionDiffs.filter(x=>x.flag!=='ok')" :key="d.key" class="nspard-item">
              <span class="nspard-label">{{ d.label }}</span>
              <span>{{ d.primary }}</span>
              <span class="nspard-arrow">vs</span>
              <span>{{ d.audit }}</span>
              <span class="nspard-flag" :class="d.flag">{{ d.flag === 'alert' ? '差异大' : '差异中' }}</span>
            </div>
          </div>
        </div>

        <!-- 改写对比 -->
        <div v-if="store.rewriteComparison" class="nsp-rewrite-compare">
          <div class="nsp-title" style="margin-bottom:10px;font-weight:600">📝 原稿 vs 改进稿</div>
          <div class="nsprc-grid">
            <div class="nsprc-col">
              <div class="nsprcc-label">原稿</div>
              <div class="nsprcc-content">{{ store.rewriteComparison.originalContent.slice(0, 300) }}...</div>
              <div class="nsprcc-scores">
                <div v-for="d in SCORING_DIMENSION_CONFIG" :key="'o-'+d.key" class="nsprcs-row">
                  <span class="nsprcs-dim">{{ d.label }}</span>
                  <span class="nsprcs-val">{{ store.rewriteComparison.originalScores[d.key] }}</span>
                </div>
              </div>
              <div class="nsprcc-pred">预估 {{ fmt(store.rewriteComparison.originalPrediction.minLikes) }}~{{ fmt(store.rewriteComparison.originalPrediction.maxLikes) }}</div>
            </div>
            <div class="nsprc-col improved">
              <div class="nsprcc-label">改进稿</div>
              <div class="nsprcc-content">{{ store.rewriteComparison.improvedContent.slice(0, 300) }}...</div>
              <div class="nsprcc-scores">
                <div v-for="d in SCORING_DIMENSION_CONFIG" :key="'i-'+d.key" class="nsprcs-row">
                  <span class="nsprcs-dim">{{ d.label }}</span>
                  <span class="nsprcs-val" :class="{ better: store.rewriteComparison.improvedScores[d.key] > store.rewriteComparison.originalScores[d.key] }">
                    {{ store.rewriteComparison.improvedScores[d.key] }}
                    <span v-if="store.rewriteComparison.improvedScores[d.key] !== store.rewriteComparison.originalScores[d.key]" class="nsprcs-delta">
                      {{ store.rewriteComparison.improvedScores[d.key] > store.rewriteComparison.originalScores[d.key] ? '+' : '' }}{{ store.rewriteComparison.improvedScores[d.key] - store.rewriteComparison.originalScores[d.key] }}
                    </span>
                  </span>
                </div>
              </div>
              <div class="nsprcc-pred improved">预估 {{ fmt(store.rewriteComparison.improvedPrediction.minLikes) }}~{{ fmt(store.rewriteComparison.improvedPrediction.maxLikes) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- AI 生成文案 -->
      <div class="nsp-card">
        <div class="nsp-card-title">🤖 AI 生成文案</div>
        <div class="nsp-generate">
          <el-input v-model="genTopic" placeholder="输入话题（如：职场内卷怎么办）" style="margin-bottom:8px" />
          <el-input-number v-model="genTargetLikes" :min="0" :step="1000" placeholder="目标点赞量（选填）" style="width:100%;margin-bottom:8px" />
          <el-button type="primary" @click="handleGenerate" :loading="genLoading" :disabled="!genTopic.trim()">
            {{ genLoading ? 'AI 创作中...' : '🎨 生成文案' }}
          </el-button>
          <div v-if="generatedContent" class="nsp-gen-result">
            <div class="nsp-title" style="margin-bottom:6px;font-weight:600">生成结果</div>
            <div class="nsp-gen-text">{{ generatedContent }}</div>
            <el-button size="small" type="success" @click="useGenerated" style="margin-top:8px">📥 使用此文案进行预测</el-button>
          </div>
        </div>
      </div>
    </template>

    <!-- 加载中 -->
    <div v-if="store.isPredicting" class="nsp-loading">
      <div class="nspl-dot-flash">⏳</div>
      <span>正在进行盲预测：7维评分 → 匹配样本 → 预估点赞量…</span>
    </div>

    <!-- 空状态 -->
    <div v-if="!store.lastPrediction && !store.isPredicting" class="nsp-empty">
      <div class="nspe-icon">📝</div>
      <span class="nspe-title">尚未预测</span>
      <span class="nspe-desc">在上方输入口播文稿，AI 将基于 {{ store.scriptRecords.length || 0 }} 条历史样本进行盲预测</span>
    </div>

    <!-- Bump 建议面板 -->
    <div class="nsp-bump-panel" v-if="store.bumpSuggestion">
      <div class="nsbp-header">
        <span class="nsbp-title">🔧 AI Bump 建议</span>
        <span class="nsbp-time">{{ store.bumpSuggestion.generatedAt }}</span>
      </div>
      <div class="nsbp-reasoning" v-for="(line, i) in store.bumpSuggestion.reasoning" :key="'br' + i">
        {{ line }}
      </div>
      <div class="nsbp-weights">
        <div class="nsbpw-title">建议权重调整：</div>
        <div
          v-for="d in SCORING_DIMENSION_CONFIG"
          :key="d.key"
          class="nsbpw-row"
        >
          <span class="nsbpw-label">{{ d.label }}</span>
          <span class="nsbpw-new">{{ store.bumpSuggestion.weights[d.key] || 0 }}%</span>
        </div>
      </div>
      <!-- 权重审核结果 -->
      <div class="nsbp-validation" v-if="store.weightValidationResult">
        <div class="nsbpv-header">
          <span class="nsbpv-icon">{{ store.weightValidationResult.passed ? '✅' : '⚠️' }}</span>
          <span class="nsbpv-title">{{ store.weightValidationResult.passed ? '审核通过' : '审核拦截' }}</span>
        </div>
        <p class="nsbpv-recommendation">{{ store.weightValidationResult.recommendation }}</p>
        <div class="nsbpv-summary">
          <span>验证池 {{ store.weightValidationResult.totalPairs + 1 }} 条样本 → {{ store.weightValidationResult.totalPairs }} 对</span>
          <span>旧权重正确率 <b :class="store.weightValidationResult.oldRate >= 0.8 ? 'ok' : 'ng'">{{ Math.round(store.weightValidationResult.oldRate * 100) }}%</b></span>
          <span>新权重正确率 <b :class="store.weightValidationResult.newRate >= 0.8 ? 'ok' : 'ng'">{{ Math.round(store.weightValidationResult.newRate * 100) }}%</b></span>
        </div>
        <details class="nsbpv-details">
          <summary>查看逐对明细</summary>
          <div class="nsbpv-pair" v-for="(p, i) in store.weightValidationResult.pairs" :key="i">
            <span class="nsbpv-pair-idx">#{{ i + 1 }}</span>
            <span class="nsbpv-pair-content">
              <span :class="p.oldOk ? '' : 'error'">旧 {{ p.aOld }} ≥ {{ p.bOld }}</span>
              <span class="nsbpv-arrow">→</span>
              <span :class="p.newOk ? '' : 'error'">新 {{ p.aNew }} ≥ {{ p.bNew }}</span>
            </span>
            <span class="nsbpv-pair-likes" :class="p.oldOk && p.newOk ? '' : 'warn'">
              {{ p.oldOk ? (p.newOk ? '✓✓' : '✓✗') : (p.newOk ? '✗✓' : '✗✗') }}
            </span>
            <span class="nsbpv-pair-likes-num">{{ p.aLikes }} vs {{ p.bLikes }}赞</span>
          </div>
        </details>
        <!-- 跨模型审计结果 -->
        <div class="nsbpv-cross" v-if="store.crossAuditWeightResult">
          <div class="nsbpv-cross-header">
            <span>{{ store.crossAuditWeightResult.passed ? '🤖' : '🤖⚠️' }}</span>
            <span class="nsbpv-cross-label">跨模型审计</span>
            <span :class="store.crossAuditWeightResult.passed ? 'ok' : 'ng'">{{ store.crossAuditWeightResult.passed ? '双审通过' : '外部驳回' }}</span>
          </div>
          <p class="nsbpv-cross-verdict">{{ store.crossAuditWeightResult.verdict }}</p>
          <p class="nsbpv-cross-advice" v-if="store.crossAuditWeightResult.advice">{{ store.crossAuditWeightResult.advice }}</p>
        </div>
      </div>
      <div class="nsbp-actions">
        <button class="nsbpa-accept" @click="store.applyBumpWeights()">接受并升级公式</button>
        <button class="nsbpa-dismiss" @click="store.dismissBumpSuggestion()">忽略</button>
      </div>
    </div>

      </div><!-- /nsp-main -->

      <!-- ===== 右栏：系统进化看板 + 预测历史 ===== -->
      <div class="nsp-sidebar" v-if="store.evolutionMetrics || store.predictionHistory.length > 0">
        <!-- 偏差趋势警告 -->
      <div class="nsp-deviation-warn-side" v-if="store.deviationTrend" :class="warnClass">
        <div class="nsdw-title-row" @click="showDeviationPanel = !showDeviationPanel">
          <span class="nspsbt-toggle" :class="{ open: showDeviationPanel }">▶</span>
          <span class="nsdw-icon">📉</span>
          <span class="nsdw-label">预测偏差</span>
          <button
            v-if="!showDeviationPanel && store.deviationTrend.needsBump && !store.isGeneratingBump"
            class="nsdw-bump-btn-sm"
            @click.stop="handleBump"
          >🔧 建议权重</button>
        </div>
        <template v-if="showDeviationPanel">
        <div class="nsdw-stats-row">
          <div class="nsdw-stat-item">
            <span class="nsdw-stat-val" :class="{ low: (store.deviationTrend.headlineHitRate ?? 0) < 50 }">{{ store.deviationTrend.headlineHitRate ?? '--' }}%</span>
            <span class="nsdw-stat-label">命中率</span>
          </div>
          <div class="nsdw-stat-item">
            <span class="nsdw-stat-val" :class="{ high: (store.deviationTrend.missRate ?? 0) > 0 }">{{ store.deviationTrend.missRate ?? '--' }}%</span>
            <span class="nsdw-stat-label">脱靶率</span>
          </div>
          <div class="nsdw-stat-item">
            <span class="nsdw-stat-val">{{ store.deviationTrend.avgDev > 0 ? '+' : '' }}{{ store.deviationTrend.avgDev }}%</span>
            <span class="nsdw-stat-label">偏差</span>
          </div>
        </div>
        <button
          v-if="store.deviationTrend.needsBump && !store.isGeneratingBump"
          class="nsdw-bump-btn"
          @click="handleBump"
        >🔧 建议权重</button>
        <span v-if="store.isGeneratingBump" class="nsdw-bumping">⏳ 分析中…</span>
        </template>
      </div>

      <div class="nspsb-card" v-if="store.evolutionMetrics">
          <div class="nspsb-title-row">
            <span class="nspsbt-toggle" :class="{ open: showEvolutionPanel }" @click="showEvolutionPanel = !showEvolutionPanel">▶</span>
            <span class="nspsb-title">📊 系统进化看板</span>
            <label
              v-if="!showEvolutionPanel"
              class="nspsb-auto-sm"
              :class="{ on: store.autoCalibrateEnabled }"
              @click="store.toggleAutoCalibrate()"
              title="自动校准开关"
            >
              <span class="nspsba-dot"></span>
              <span class="nspsba-text">{{ store.autoCalibrateEnabled ? '开' : '关' }}</span>
            </label>
          </div>
          <template v-if="showEvolutionPanel">
          <div class="nspsb-stats">
            <div class="nspsbs-item">
              <span class="nspsbs-val">{{ store.evolutionMetrics.totalScripts }}</span>
              <span class="nspsbs-label">样本总数</span>
            </div>
            <div class="nspsbs-item">
              <span class="nspsbs-val">{{ store.evolutionMetrics.totalPredictions }}</span>
              <span class="nspsbs-label">预测次数</span>
            </div>
            <div class="nspsbs-item">
              <span class="nspsbs-val">{{ store.evolutionMetrics.totalRetros }}</span>
              <span class="nspsbs-label">已复盘</span>
            </div>
            <div class="nspsbs-item">
              <span class="nspsbs-val">{{ store.evolutionMetrics.weightChanges }}</span>
              <span class="nspsbs-label">权重升级</span>
            </div>
          </div>
          <div class="nspsb-tier" v-if="store.evolutionMetrics.sampleMilestone">🏆 {{ store.evolutionMetrics.sampleMilestone }}</div>

          <!-- 准确率趋势 -->
          <div class="nspsb-trend" v-if="store.evolutionMetrics.trendDescription !== '暂无足够复盘数据'">
            <div class="nspsbt-label">准确率趋势</div>
            <div class="nspsbt-row">
              <div class="nspsbtr-item">
                <span class="nspsbtri-label">早期</span>
                <span class="nspsbtri-val">{{ store.evolutionMetrics.earlyHitRate ?? '--' }}%</span>
              </div>
              <span class="nspsbt-arrow">→</span>
              <div class="nspsbtr-item">
                <span class="nspsbtri-label">近期</span>
                <span class="nspsbtri-val" :class="(store.evolutionMetrics.recentHitRate ?? 0) > (store.evolutionMetrics.earlyHitRate ?? 0) ? 'up' : 'down'">{{ store.evolutionMetrics.recentHitRate ?? '--' }}%</span>
              </div>
              <span class="nspsbt-diff" :class="{ up: (store.evolutionMetrics.recentHitRate ?? 0) > (store.evolutionMetrics.earlyHitRate ?? 0), down: (store.evolutionMetrics.recentHitRate ?? 0) < (store.evolutionMetrics.earlyHitRate ?? 0) }">
                {{ (store.evolutionMetrics.recentHitRate ?? 0) - (store.evolutionMetrics.earlyHitRate ?? 0) > 0 ? '+' : '' }}{{ (store.evolutionMetrics.recentHitRate ?? 0) - (store.evolutionMetrics.earlyHitRate ?? 0) }}%
              </span>
            </div>
            <div class="nspsbt-desc">{{ store.evolutionMetrics.trendDescription }}</div>
          </div>

          <!-- 自动校准 -->
          <label class="nspsb-auto" :class="{ on: store.autoCalibrateEnabled }" @click="store.toggleAutoCalibrate()">
            <span class="nspsba-dot"></span>
            <span class="nspsba-text">{{ store.autoCalibrateEnabled ? '自动校准：开' : '自动校准：关' }}</span>
          </label>

          <!-- 权重变更记录 -->
          <div class="nspsb-wlog" v-if="store.weightChangeLog.length > 0">
            <div class="nspsbwl-title">权重变更记录</div>
            <div class="nspsbwl-item" v-for="w in store.weightChangeLog.slice(0, 5)" :key="w.id">
              <div class="nspsbwli-time">{{ w.timestamp.slice(5, 16) }}</div>
              <div class="nspsbwli-row">
                <span class="nspsbwli-trigger" :class="w.trigger">
                  {{ w.trigger === 'bump' ? '🤖 AI' : w.trigger === 'reset' ? '↩ 重置' : '✋ 手动' }}
                </span>
                <span class="nspsbwli-note">{{ w.note }}</span>
              </div>
              <span class="nspsbwli-toggle" @click="toggleWLogDiff(w.id)">
                {{ expandedWLogIds.includes(w.id) ? '收起 ▲' : '查看变化 ▼' }}
              </span>
              <div v-if="expandedWLogIds.includes(w.id)" class="nspsbwli-diffs">
                <div v-if="getWeightDiffs(w).length === 0" class="nspsbwlid-empty">各维度无变化</div>
                <div v-for="d in getWeightDiffs(w)" :key="d.key" class="nspsbwlid-row">
                  <span class="nspsbwlid-dim">{{ d.label }}</span>
                  <span>{{ d.old }}% → {{ d.nw }}%</span>
                  <span :class="d.delta > 0 ? 'up' : 'down'">{{ d.delta > 0 ? '+' : '' }}{{ d.delta }}</span>
                </div>
              </div>
            </div>
          </div>
          </template>
        </div>

        <!-- 预测历史 -->
        <div class="nsp-history-section" v-if="store.predictionHistory.length > 0">
          <div class="nsp-hist-header">
            📜 预测历史 ({{ store.predictionHistory.length }} 条)
            <span v-if="unreviewedCount > 0" class="nsp-hist-unreviewed">{{ unreviewedCount }} 条未复盘</span>
          </div>
          <div class="nsp-history-list">
            <div
              v-for="entry in store.predictionHistory"
              :key="entry.id"
              class="nsp-history-item"
              :class="{ active: viewingHistoryId === entry.id, reviewed: entry.actualLikes != null }"
              @click="handleViewHistory(entry)"
            >
              <div class="nsp-hist-main">
                <span class="nsp-hist-platform">{{ PLATFORM_CONFIG[entry.platform]?.icon }}</span>
                <span class="nsp-hist-text">{{ entry.content.slice(0, 50) }}{{ entry.content.length > 50 ? '...' : '' }}</span>
              </div>
              <div class="nsp-hist-meta">
                <span class="nsp-hist-pred">{{ fmt(entry.result.minLikes) }}~{{ fmt(entry.result.maxLikes) }}</span>
                <span v-if="entry.actualLikes != null" class="nsp-hist-actual" :class="entry.deviation && entry.deviation > 0 ? 'over' : 'under'">
                  → {{ fmt(entry.actualLikes) }}
                </span>
                <button
                  v-else
                  class="nsp-hist-retro-btn"
                  @click.stop="showRetroDialog(entry)"
                >
                  🔄 复盘
                </button>
                <span class="nsp-hist-time">{{ entry.predictedAt.slice(5, 16) }}</span>
              </div>
              <button class="nsp-hist-del" @click.stop="handleDeleteHistory(entry)" title="删除此条预测">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div><!-- /nsp-layout -->

    <!-- 复盘弹窗（保留原有手动录入功能） -->
    <el-dialog v-model="showRetro" title="📊 复盘录入" width="420px" :close-on-click-modal="true">
      <div class="retro-body" v-if="retroEntry">
        <div class="retro-pred">
          <span class="retro-label">预测区间：</span>
          <strong>{{ fmt(retroEntry.result.minLikes) }} ~ {{ fmt(retroEntry.result.maxLikes) }}</strong>
          <span class="retro-time">（{{ retroEntry.predictedAt }}）</span>
        </div>
        <div class="retro-content-preview">{{ retroEntry.content.slice(0, 100) }}{{ retroEntry.content.length > 100 ? '...' : '' }}</div>
        <div class="retro-form">
          <label class="retro-label">实际点赞量：</label>
          <el-input-number v-model="retroLikes" :min="0" :step="100" :max="99999999" style="width:100%;margin-top:6px" placeholder="输入发布后的真实点赞量" />
        </div>
        <div class="retro-form" style="margin-top:10px">
          <label class="retro-label">播放量（可选）：</label>
          <el-input-number v-model="retroViews" :min="0" :step="100" :max="999999999" style="width:100%;margin-top:6px" placeholder="内容实际播放观看次数" />
        </div>
        <div class="retro-form" style="margin-top:10px">
          <label class="retro-label">复盘备注（可选）：</label>
          <el-input v-model="retroNote" placeholder="如：发布后被限流、上了热门…" style="margin-top:6px" />
        </div>
      </div>
      <template #footer>
        <el-button @click="showRetro = false">取消</el-button>
        <el-button type="primary" @click="handleRetro" :disabled="retroLikes == null">确认录入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUniqueModeStore, PLATFORM_CONFIG, SCORING_DIMENSION_CONFIG, type Platform, type PredictionLogEntry } from '@/stores/uniqueMode'

const store = useUniqueModeStore()

/** 权重变更日志维度中文标签 */
function dimLabel(key: string): string {
  const config = SCORING_DIMENSION_CONFIG.find(d => d.key === key)
  return config?.label || key
}

/** 最弱维度 */
const weakestDim = computed(() => {
  const scores = store.lastPrediction?.scores
  if (!scores) return '--'
  let minKey = ''
  let minVal = Infinity
  for (const d of SCORING_DIMENSION_CONFIG) {
    const v = scores[d.key]
    if (v < minVal) { minVal = v; minKey = d.label }
  }
  return `${minKey} (${minVal}分)`
})

/** 账号专属优化建议项 */
const accountAdviceItems = computed(() => {
  const ap = store.accountPersonality
  const scores = store.lastPrediction?.scores
  if (!ap || !scores) return []

  const topN = ap.likesRanking.slice(0, 3)
  return topN.map((item, idx) => {
    const config = SCORING_DIMENSION_CONFIG.find(d => d.key === item.key)
    const currentScore = (scores as Record<string, number>)[item.key] ?? 0
    const isWeak = currentScore < 60
    const correlation = typeof item.correlation === 'number' ? item.correlation : 0

    const prefix = isWeak
      ? `你的账号中【${item.label}】维度与点赞关联最强（关联度${Math.round(correlation * 100)}%），这篇文稿该维度评分仅【${currentScore}分】，建议优先打磨——`
      : currentScore < 75
        ? `你的账号中【${item.label}】维度与点赞关联较强（关联度${Math.round(correlation * 100)}%），这篇文稿该维度评分【${currentScore}分】，仍有提升空间——`
        : `你的账号中【${item.label}】维度与点赞关联较强（关联度${Math.round(correlation * 100)}%），这篇文稿该维度评分【${currentScore}分】，表现不错，继续保持！`

    return {
      key: item.key,
      label: item.label,
      color: config?.color || '#909399',
      correlationDisplay: Math.round(correlation * 100) + '%',
      rank: idx + 1,
      currentScore,
      isWeak,
      grade: isWeak ? '⚠ 需重点关注' : currentScore < 75 ? '可提升' : '✓ 表现优秀',
      advice: isWeak || currentScore < 75
        ? prefix + getDimensionAdvice(item.key)
        : prefix
    }
  })
})

function getDimensionAdvice(key: string): string {
  const map: Record<string, string> = {
    hook: '开头直击受众当前最隐秘的困惑，用"你怎么知道我在想这个"式的提问抓住注意力',
    empathy: '不仅说出受众心里的感受，更要帮他们理清情绪的来龙去脉，产生被解读的深层满足',
    density: '持续提供新的理解框架，每个段落都让受众对问题的认知更进一层',
    structure: '构建「困惑→被命名→被解释→看到希望」的完整情绪路径',
    originality: '用你独有的解读角度和案例组合，让受众感到"只有你能讲出这个"',
    socialResonance: '精准命中某一人生阶段的集体隐痛，让受众产生"终于有人说出来了"的转发冲动',
    polish: '用引经据典/案例佐证建立可信度，每个论断都让受众感到可靠、有根据'
  }
  return map[key] || '参考同类优秀文稿的该维度表现进行针对性优化'
}

const predContent = ref('')
const predPlatform = ref<Platform>('抖音')
const showEvolutionPanel = ref(false)
const showDeviationPanel = ref(true)

const samePlatformCount = computed(() =>
  store.scriptRecords.filter(s => s.platform === predPlatform.value).length
)

const unreviewedCount = computed(() =>
  store.predictionHistory.filter(e => e.actualLikes == null).length
)

async function handlePredict() {
  if (!predContent.value.trim()) { ElMessage.warning('请输入待预估的文稿'); return }
  if (store.scriptRecords.length === 0) { ElMessage.warning('请先在「录入数据」中添加历史样本'); return }
  try {
    viewingHistoryId.value = null  // 新预测清除历史查看
    await store.predictLikes(predContent.value.trim(), predPlatform.value)
  }
  catch (e: any) { ElMessage.error('预测失败: ' + (e.message || '未知错误')) }
}

function handleClear() { predContent.value = ''; viewingHistoryId.value = null; store.lastPrediction = null }

// ===== 预测历史 =====
const viewingHistoryId = ref<string | null>(null)
const viewingHistoryTime = ref('')

function handleViewHistory(entry: PredictionLogEntry) {
  const result = store.loadHistoryEntry(entry.id)
  if (result) {
    predContent.value = result.content
    predPlatform.value = result.platform
    viewingHistoryId.value = entry.id
    viewingHistoryTime.value = entry.predictedAt
    // 滚动到结果区
    setTimeout(() => {
      const cards = document.querySelectorAll('.nspr-overview')
      if (cards.length) cards[0].scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }
}

async function handleDeleteHistory(entry: PredictionLogEntry) {
  try {
    await ElMessageBox.confirm(
      `确定删除此条预测记录？\n\n"${entry.content.slice(0, 40)}..."`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    if (viewingHistoryId.value === entry.id) {
      viewingHistoryId.value = null
      viewingHistoryTime.value = ''
    }
    store.deletePredictionHistoryEntry(entry.id)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

function clearViewingHistory() {
  viewingHistoryId.value = null
  store.lastPrediction = null
}

function isHistoryReviewed(id: string): boolean {
  const entry = store.predictionHistory.find(e => e.id === id)
  return entry?.actualLikes != null
}

const retroEntryForCurrent = computed(() => {
  if (!viewingHistoryId.value) return null
  return store.predictionHistory.find(e => e.id === viewingHistoryId.value) ?? null
})

// ===== 深度工具 =====
const auditLoading = ref(false)
const improveLoading = ref(false)

async function handleCrossAudit() {
  auditLoading.value = true
  try { await store.crossModelAudit(predContent.value) }
  catch (e: any) { ElMessage.error('校验失败: ' + (e.message || '未知错误')) }
  finally { auditLoading.value = false }
}

async function handleImprove() {
  if (!store.lastPrediction) return
  improveLoading.value = true
  try {
    const improved = await store.improveContent(
      predContent.value || '',
      predPlatform.value,
      store.lastPrediction.scores
    )
    if (improved) {
      const oldPred = store.lastPrediction
      await store.predictLikes(improved, predPlatform.value)
      const newPred = store.lastPrediction
      if (oldPred && newPred) {
        store.rewriteComparison = {
          originalContent: predContent.value || '',
          improvedContent: improved,
          originalScores: oldPred.scores,
          improvedScores: newPred.scores,
          originalPrediction: { minLikes: oldPred.minLikes, maxLikes: oldPred.maxLikes } as any,
          improvedPrediction: { minLikes: newPred.minLikes, maxLikes: newPred.maxLikes } as any,
          improvements: newPred.suggestions || []
        }
      }
    }
  } catch (e: any) { ElMessage.error('改进失败: ' + (e.message || '未知错误')) }
  finally { improveLoading.value = false }
}

// ===== AI 生成文案 =====
const genTopic = ref('')
const genTargetLikes = ref<number | null>(null)
const genLoading = ref(false)
const generatedContent = ref('')

async function handleGenerate() {
  genLoading.value = true
  try {
    generatedContent.value = await store.generateContent(genTopic.value.trim(), predPlatform.value, genTargetLikes.value || undefined)
  } catch (e: any) { ElMessage.error('生成失败: ' + (e.message || '未知错误')) }
  finally { genLoading.value = false }
}

function useGenerated() {
  predContent.value = generatedContent.value
  generatedContent.value = ''
  ElMessage.success('已填入预测框，点击「开始预测」进行评估')
}

// ===== 复盘 =====
const showRetro = ref(false)
const retroEntry = ref<PredictionLogEntry | null>(null)
const retroLikes = ref<number | null>(null)
const retroViews = ref<number | null>(null)
const retroNote = ref('')

// 权重变更记录展开状态
const expandedWLogIds = ref<string[]>([])
function toggleWLogDiff(id: string) {
  expandedWLogIds.value = expandedWLogIds.value.includes(id)
    ? expandedWLogIds.value.filter(x => x !== id)
    : [...expandedWLogIds.value, id]
}

/** 计算某条权重记录的维度差异（只保留变化的维度） */
function getWeightDiffs(entry: { oldWeights: Record<string, number>; newWeights: Record<string, number> }) {
  const diffs: { key: string; label: string; old: number; nw: number; delta: number }[] = []
  const newW = entry?.newWeights || {}
  const oldW = entry?.oldWeights || {}
  for (const [k, nv] of Object.entries(newW)) {
    const ov = oldW[k] ?? nv
    if (nv !== ov) {
      diffs.push({
        key: k, label: dimLabel(k), old: ov, nw: nv,
        delta: Math.round((nv - ov) * 10) / 10
      })
    }
  }
  return diffs
}

function showRetroDialog(entry: PredictionLogEntry) {
  retroEntry.value = entry
  retroLikes.value = entry.actualLikes ?? null
  retroViews.value = entry.actualViews ?? null
  retroNote.value = entry.retroNote ?? ''
  showRetro.value = true
}

function handleRetro() {
  if (!retroEntry.value || retroLikes.value == null) return
  store.retroPrediction(retroEntry.value.id, retroLikes.value, retroViews.value || undefined, retroNote.value || undefined)
  ElMessage.success('复盘数据已保存，文稿已自动加入样本库')
  showRetro.value = false
  retroLikes.value = null; retroViews.value = null; retroNote.value = ''
}

function isOverdue(entry: PredictionLogEntry): boolean {
  if (entry.actualLikes != null) return false
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  try {
    const d = new Date(entry.predictedAt)
    return !isNaN(d.getTime()) && d < threeDaysAgo
  } catch { return false }
}

const warnClass = computed(() => {
  const t = store.deviationTrend
  if (!t) return ''
  if (t.needsBump) return 'warn-severe'
  if (t.trend === 'over' || t.trend === 'under') return 'warn-moderate'
  return 'warn-mild'
})

async function handleBump() {
  await store.generateBumpSuggestion()
  // 自动滚动到 bump 面板
  setTimeout(() => {
    const panel = document.querySelector('.nsp-bump-panel')
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 300)
}

// 当 bumpSuggestion 从别处生成时也自动滚动
watch(() => store.bumpSuggestion, (val) => {
  if (val) {
    setTimeout(() => {
      const panel = document.querySelector('.nsp-bump-panel')
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }
})

function fmt(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

function scoreTag(s: number): string {
  if (s >= 80) return 'excellent'; if (s >= 65) return 'good'; return 'normal'
}
function scoreTagText(s: number): string {
  if (s >= 80) return '爆款潜力'; if (s >= 65) return '表现良好'; return '有待优化'
}
</script>

<style scoped>
.new-script-predict { height: 100%; overflow: hidden; padding-bottom: 20px; }

/* ===== 左右双栏布局 ===== */
.nsp-layout { display: flex; gap: 14px; height: 100%; overflow: hidden; }
.nsp-main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.nsp-sidebar {
  width: 270px; flex-shrink: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 10px;
}

/* ===== 新文稿预测 + 预测历史 双栏 ===== */
.nsp-predict-row { display: flex; gap: 14px; align-items: flex-start; }
.nsp-predict-row .nsp-input { flex: 1; min-width: 0; }

.nsp-card { background: #fff; border-radius: 14px; padding: 18px 20px; border: 1px solid #eef2f6; }
.nsp-card-title { font-size: 14px; font-weight: 600; color: #0b1a30; margin-bottom: 8px; }
.nsp-subtitle { font-size: 11px; color: #909399; font-weight: 400; margin-left: 4px; }
.nsp-card-desc { font-size: 12px; color: #909399; margin: 0 0 12px; line-height: 1.5; }

/* ===== 1. 输入区 ===== */
.nsp-input-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.nsp-select { width: 150px; }
.nsp-sample-hint { font-size: 12px; color: #909399; }
.nsp-sample-hint.warn { color: #e6a23c; }

.nsp-input textarea { width: 100%; padding: 14px; border: 1px solid #dce2ec; border-radius: 10px; font-size: 14px; line-height: 1.6; resize: vertical; min-height: 100px; font-family: inherit; transition: border 0.2s; box-sizing: border-box; background: #fafbfc; }
.nsp-input textarea:focus { outline: none; border-color: #1a4cff; box-shadow: 0 0 0 3px rgba(26,76,255,0.08); background: #fff; }

.nsp-actions { display: flex; gap: 10px; margin-top: 14px; }
.nsp-btn { padding: 10px 26px; border-radius: 24px; border: none; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 0.15s, transform 0.1s; font-family: inherit; }
.nsp-btn:active:not(:disabled) { transform: scale(0.97); }
.nsp-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.nsp-btn-primary { background: #1a4cff; color: #fff; }
.nsp-btn-primary:hover:not(:disabled) { background: #0f3fd9; }
.nsp-btn-ghost { background: #f5f7fb; color: #3d5068; }
.nsp-btn-ghost:hover { background: #eef2f6; }

/* ===== 2. 进化看板紧凑版 ===== */
.nsp-evo-compact { padding: 10px 16px; }
.nsevo-bar {
  display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none;
  flex-wrap: wrap;
}
.nsevo-title { font-size: 13px; font-weight: 600; color: #0b1a30; white-space: nowrap; }
.nsevo-stats { display: flex; align-items: center; gap: 6px; flex: 1; font-size: 12px; color: #6b7a8f; min-width: 0; flex-wrap: wrap; }
.nsevo-stat b { color: #1a4cff; font-weight: 700; }
.nsevo-sep { color: #d1d5db; }
.nsevo-last { font-size: 10px; color: #9ca3af; margin-left: 4px; }
.nsevo-arrow { font-size: 14px; color: #9ca3af; transition: transform 0.2s; flex-shrink: 0; }
.nsevo-arrow.open { transform: rotate(180deg); }

.nsevo-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid #eef2f6; }

.nspe-auto-toggle {
  display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 2px 10px; border-radius: 14px;
  font-size: 11px; font-weight: 500; border: 1px solid #d1d5db; background: #f9fafb; color: #9ca3af;
  transition: all 0.25s; user-select: none; margin-left: auto;
}
.nspe-auto-toggle.on { background: #ecfdf5; border-color: #6ee7b7; color: #065f46; }
.nspe-auto-toggle:hover { border-color: #9ca3af; }
.nspe-auto-toggle.on:hover { border-color: #10b981; }
.npeat-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #d1d5db; transition: all 0.25s;
}
.nspe-auto-toggle.on .nspeat-dot { background: #10b981; }

.nspeo-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
.nspeo-stat { text-align: center; padding: 10px 6px; background: #f8fafc; border-radius: 10px; border: 1px solid #eef2f6; }
.nspeos-num { font-size: 22px; font-weight: 700; color: #1a4cff; }
.nspeos-label { font-size: 11px; color: #909399; margin-top: 2px; }
.nspeos-tier { font-size: 10px; color: #67c23a; margin-top: 4px; line-height: 1.4; }

/* ===== 3. 预测历史（右侧面板） ===== */
.nsp-history-section {
  width: 100%; flex-shrink: 0;
  background: #fff; border-radius: 12px; border: 1px solid #eef2f6;
  display: flex; flex-direction: column; max-height: 300px;
}
.nsp-hist-header {
  font-size: 13px; font-weight: 600; color: #303133;
  padding: 12px 14px; border-bottom: 1px solid #eef2f6; flex-shrink: 0;
  display: flex; align-items: center; gap: 8px;
}
.nsp-hist-unreviewed {
  margin-left: auto;
  padding: 2px 9px; border-radius: 14px; font-size: 10px; font-weight: 600; white-space: nowrap;
  background: #e6f7e6; color: #0f7b3a;
}

.nsp-history-list {
  display: flex; flex-direction: column; gap: 2px;
  overflow-y: auto; flex: 1; padding: 6px;
}
.nsp-history-item {
  position: relative; display: flex; flex-direction: column; gap: 4px;
  padding: 8px 10px; background: #fafcfd; border: 1px solid #eef2f6; border-radius: 8px;
  cursor: pointer; transition: background 0.15s, border-color 0.15s;
}
.nsp-history-item:hover { background: #f0f4ff; }
.nsp-history-item.active { background: #eef3ff; border-color: #3b82f6; }
.nsp-history-item.reviewed { background: #f9fafb; }
.nsp-hist-del {
  position: absolute; bottom: 6px; right: 6px;
  width: 22px; height: 22px; padding: 0; border: none; border-radius: 6px;
  background: transparent; color: #9ca3af; display: flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0; transition: opacity 0.15s, color 0.15s, background 0.15s;
}
.nsp-history-item:hover .nsp-hist-del { opacity: 1; }
.nsp-hist-del:hover { color: #ef4444; background: #fef2f2; }
.nsp-hist-main { display: flex; align-items: center; gap: 6px; min-width: 0; }
.nsp-hist-platform { font-size: 14px; flex-shrink: 0; }
.nsp-hist-text { font-size: 12px; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nsp-hist-meta { display: flex; align-items: center; gap: 8px; }
.nsp-hist-pred { font-size: 12px; font-weight: 600; color: #e6a23c; }
.nsp-hist-actual { font-size: 12px; font-weight: 600; }
.nsp-hist-actual.over { color: #0f7b3a; }
.nsp-hist-actual.under { color: #f56c6c; }
.nsp-hist-pending { font-size: 11px; color: #909399; background: #f0f2f5; padding: 2px 8px; border-radius: 8px; }
.nsp-hist-retro-btn {
  padding: 2px 8px; border: 1px solid #f59e0b; border-radius: 6px; background: #fffbeb;
  color: #d97706; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.nsp-hist-retro-btn:hover { background: #fef3c7; border-color: #d97706; }
.nsp-hist-time { font-size: 10px; color: #b0bfd0; }

/* ===== 查看历史提示条 ===== */
.nsp-viewing-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; background: linear-gradient(135deg, #f0f4ff, #fff); border: 1px solid #c7d2fe;
  border-radius: 10px; font-size: 12px; color: #4338ca; font-weight: 500;
}
.nsp-vb-actions { display: flex; align-items: center; gap: 8px; }
.nsp-vb-retro {
  padding: 3px 12px; border: 1px solid #f59e0b; border-radius: 6px; background: #fffbeb;
  color: #d97706; font-size: 11px; cursor: pointer; font-weight: 600; transition: background 0.15s;
}
.nsp-vb-retro:hover { background: #fef3c7; }
.nsp-vb-back {
  padding: 3px 12px; border: 1px solid #c7d2fe; border-radius: 6px; background: transparent;
  color: #4338ca; font-size: 11px; cursor: pointer; font-weight: 500; transition: background 0.15s;
}
.nsp-vb-back:hover { background: #eef2ff; }

/* ===== 4. 结果区（大部分保留原样式） ===== */
.nsp-result-card { background: linear-gradient(135deg, #f9faff 0%, #fff 100%); }
.nspr-overview { display: flex; gap: 32px; flex-wrap: wrap; }
.nspro-item { display: flex; flex-direction: column; gap: 4px; }
.nspro-label { font-size: 12px; color: #909399; }
.nspro-value { font-size: 24px; font-weight: 700; color: #0b1a30; }
.nspro-value.risk { font-size: 20px; }
.nspro-value.risk-low { color: #0f7b3a; }
.nspro-value.risk-mid { color: #e6a23c; }
.nspro-value.risk-high { color: #f56c6c; }
.nspro-value.confidence { font-size: 18px; color: #1a4cff; }
.nspro-score .nspro-value { color: #1a4cff; }
.nspro-likes .nspro-value { color: #e6a23c; }
.nspro-tag { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 6px; }
.nspro-tag.excellent { background: #fff4e0; color: #b45a1c; }
.nspro-tag.good { background: #e6f7e6; color: #0f7b3a; }
.nspro-tag.normal { background: #fdf6ec; color: #e6a23c; }

.nspr-summary { margin-top: 14px; padding: 10px 14px; background: #f0f7ff; border-radius: 10px; font-size: 13px; color: #1a3b6b; line-height: 1.5; }
.nspr-summary strong { color: #1a4cff; }

/* 概率分布 */
.nsp-prob-chart { display: flex; flex-direction: column; gap: 8px; }
.nsp-prob-bar-wrap { display: flex; align-items: center; gap: 10px; }
.nsp-prob-label { width: 120px; font-size: 12px; color: #6b7a8f; text-align: right; flex-shrink: 0; }
.nsp-prob-track { flex: 1; height: 20px; background: #f0f2f5; border-radius: 10px; overflow: hidden; }
.nsp-prob-fill { height: 100%; border-radius: 10px; background: #c4d4f0; transition: width 0.5s; min-width: 2px; }
.nsp-prob-fill.headline { background: linear-gradient(90deg, #1a4cff, #4f7dff); }
.nsp-prob-pct { width: 50px; font-size: 13px; font-weight: 600; color: #6b7a8f; text-align: left; flex-shrink: 0; }
.nsp-prob-pct.headline { color: #1a4cff; }

/* 7维评分 */
.nsp-scores-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; }
.nsps-item { display: flex; flex-direction: column; gap: 3px; }
.nsps-header { display: flex; align-items: center; gap: 5px; }
.nsps-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.nsps-label { font-size: 12px; color: #6b7a8f; }
.nsps-val { font-size: 12px; font-weight: 700; margin-left: auto; }
.nsps-bar-wrap { height: 6px; background: #f0f2f5; border-radius: 3px; overflow: hidden; }
.nsps-bar { height: 100%; border-radius: 3px; transition: width 0.4s; min-width: 2px; }
.nsps-disagree { font-size: 11px; margin-left: 3px; }

.nsps-disagree-box { margin-top: 12px; padding: 10px 14px; background: #fef9f0; border-radius: 8px; border: 1px solid #fce8c0; font-size: 12px; }
.nsps-disagree-title { font-weight: 600; color: #b45309; margin-bottom: 4px; }
.nsps-disagree-item { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.nsps-disagree-dim { font-weight: 600; color: #92400e; min-width: 60px; }
.nsps-disagree-vals { color: #78350f; }
.nsps-disagree-hint { font-size: 10px; color: #a16207; }

/* 双栏 */
.nsp-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
@media (max-width: 750px) { .nsp-two-col { grid-template-columns: 1fr; } }

.nsp-list { margin: 0; padding-left: 16px; font-size: 13px; color: #3d5068; line-height: 1.7; }
.nsp-list li { margin-bottom: 4px; }
.nsp-suggestions li::marker { color: #1a4cff; }
.nsp-counter li::marker { color: #e6a23c; }

.nsp-ref-list { margin-bottom: 8px; }
.nsp-ref-list:last-child { margin-bottom: 0; }
.nspr-card { background: #fafcff; border: 1px solid #eef2f6; border-radius: 10px; padding: 10px 14px; }
.nsprc-platform { font-size: 12px; color: #909399; margin-bottom: 3px; }
.nsprc-snippet { font-size: 13px; color: #303133; margin-bottom: 5px; line-height: 1.5; }
.nsprc-meta { display: flex; gap: 14px; font-size: 12px; margin-bottom: 4px; }
.nsprc-likes { color: #e6a23c; font-weight: 600; }
.nsprc-score { color: #1a4cff; font-weight: 600; }
.nsprc-reason { font-size: 11px; color: #6b7a8f; line-height: 1.4; }

/* ===== 5. 深度工具 + AI复盘 ===== */
.nsp-tools { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }

.nsp-audit-result { margin-top: 12px; padding: 12px; background: #fafbfc; border-radius: 8px; border: 1px solid #eef2f6; }
.nspar-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 6px; }
.nspar-cred { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.nspar-cred.high { background: #dcfce7; color: #16a34a; }
.nspar-cred.medium { background: #fef9c3; color: #ca8a04; }
.nspar-cred.low { background: #fef2f2; color: #dc2626; }
.nspar-note { font-size: 12px; color: #6b7280; }
.nspar-diffs { margin-top: 8px; }
.nspard-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
.nspard-label { min-width: 64px; color: #374151; }
.nspard-arrow { color: #d1d5db; }
.nspard-flag { font-size: 10px; padding: 1px 4px; border-radius: 3px; }
.nspard-flag.alert { background: #fee2e2; color: #dc2626; }
.nspard-flag.warn { background: #fef9c3; color: #ca8a04; }

.nsp-rewrite-compare { margin-top: 14px; }
.nsprc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.nsprc-col { padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #eef2f6; }
.nsprc-col.improved { background: #f0fdf4; border-color: #bbf7d0; }
.nsprcc-label { font-size: 13px; font-weight: 600; color: #1f2937; margin-bottom: 6px; }
.nsprcc-content { font-size: 12px; color: #6b7280; line-height: 1.6; margin-bottom: 8px; max-height: 120px; overflow: hidden; }
.nsprcc-scores { margin-bottom: 8px; }
.nsprcs-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
.nsprcs-dim { color: #9ca3af; }
.nsprcs-val { font-weight: 600; }
.nsprcs-val.better { color: #16a34a; }
.nsprcs-delta { font-size: 9px; margin-left: 4px; padding: 0 3px; border-radius: 2px; background: #dcfce7; color: #16a34a; }
.nsprcc-pred { font-size: 11px; color: #6b7280; }
.nsprcc-pred.improved { color: #16a34a; font-weight: 600; }

.nsp-generate { display: flex; flex-direction: column; }
.nsp-gen-result { margin-top: 12px; }
.nsp-gen-text { font-size: 12px; color: #374151; line-height: 1.8; white-space: pre-wrap; max-height: 300px; overflow-y: auto; padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #eef2f6; }

/* 加载 */
.nsp-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 30px; background: #fff; border-radius: 14px; border: 1px solid #eef2f6; font-size: 13px; color: #909399; }
.nspl-dot-flash { font-size: 20px; animation: pulse 1.2s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

/* 空状态 */
.nsp-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.nspe-icon { font-size: 36px; opacity: 0.5; }
.nspe-title { font-size: 14px; font-weight: 600; color: #909399; }
.nspe-desc { font-size: 12px; color: #b0bfd0; }

/* 复盘弹窗 */
.retro-body { display: flex; flex-direction: column; gap: 4px; }
.retro-pred { font-size: 14px; color: #303133; }
.retro-pred strong { color: #e6a23c; }
.retro-time { font-size: 11px; color: #909399; margin-left: 6px; }
.retro-content-preview { font-size: 12px; color: #909399; padding: 8px; background: #f5f7fb; border-radius: 8px; margin: 8px 0; line-height: 1.5; }
.retro-label { font-size: 13px; color: #6b7a8f; font-weight: 500; }
.retro-form { margin-bottom: 4px; }

/* 账号专属优化建议 */
.nsp-account-advice { background: linear-gradient(135deg, #f0fdf4 0%, #fff 100%); border-color: #bbf7d0; }
.nsaa-subtitle { font-size: 12px; color: #6b7a8f; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
.nsaa-shifted-tag { font-size: 10px; padding: 2px 8px; border-radius: 8px; background: #dcfce7; color: #166534; font-weight: 600; }
.nsaa-items { display: flex; flex-direction: column; gap: 12px; }
.nsaa-item { padding: 12px 14px; background: #f9fafb; border-radius: 10px; border: 1px solid #eef2f6; transition: border-color 0.2s, background 0.2s; }
.nsaa-item.nsaa-warn { background: #fef9f0; border-color: #fce8c0; }
.nsaa-item.nsaa-warn:hover { border-color: #f5c542; }
.nsaa-item:hover { border-color: #d1d5db; }
.nsaai-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.nsaai-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.nsaai-dim { font-size: 13px; font-weight: 600; color: #1f2937; }
.nsaai-rank { font-size: 11px; padding: 1px 7px; border-radius: 6px; background: #dcfce7; color: #166534; font-weight: 600; }
.nsaai-correlation { font-size: 11px; color: #059669; font-weight: 500; margin-left: auto; }
.nsaa-warn .nsaai-rank { background: #fef3c7; color: #92400e; }
.nsaai-score-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.nsaai-score-label { font-size: 12px; color: #909399; }
.nsaai-score-val { font-size: 16px; font-weight: 700; color: #1f2937; }
.nsaai-score-val.low { color: #dc2626; }
.nsaai-grade { font-size: 11px; padding: 1px 8px; border-radius: 8px; background: #dcfce7; color: #166534; font-weight: 500; }
.nsaai-grade.warn { background: #fee2e2; color: #991b1b; font-weight: 600; }
.nsaai-advice { font-size: 12px; color: #4b5563; line-height: 1.6; padding: 8px 10px; background: #f0fdf4; border-radius: 8px; border-left: 3px solid #22c55e; }
.nsaai-advice.warn { background: #fef9f0; border-left-color: #f59e0b; color: #78350f; font-weight: 500; }

/* 偏差趋势警告（卡片风格） */
.nsp-deviation-warn-side {
  background: #fff; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px;
  border: 1px solid #eef2f6; display: flex; flex-direction: column; gap: 10px;
  transition: border-color 0.2s;
}
.nsp-deviation-warn-side.warn-severe:hover { border-color: #ef4444; }
.nsp-deviation-warn-side.warn-moderate:hover { border-color: #f59e0b; }
.nsp-deviation-warn-side.warn-mild:hover { border-color: #3b82f6; }
.nsdw-title-row {
  display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;
}
.nsdw-label {
  font-size: 12px; font-weight: 700; color: #1f2937;
}
.nsdw-bump-btn-sm {
  margin-left: auto; padding: 2px 8px; border: none; border-radius: 10px;
  background: #eef2ff; color: #4338ca; font-size: 10px; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.nsdw-bump-btn-sm:hover { background: #e0e7ff; }
.nsdw-stats-row {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
}
.nsdw-stat-item {
  padding: 8px 4px; background: #f8fafc; border-radius: 8px; text-align: center;
}
.nsdw-stat-val {
  display: block; font-size: 18px; font-weight: 700; color: #1f2937; line-height: 1.2;
}
.nsdw-stat-val.low { color: #f59e0b; }
.nsdw-stat-val.high { color: #ef4444; }
.nsdw-stat-label {
  display: block; font-size: 10px; color: #9ca3af; margin-top: 1px;
}
.nsdw-bump-btn {
  padding: 6px 0; border: none; border-radius: 8px;
  background: #4f46e5; color: #fff; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background 0.15s; text-align: center;
}
.nsdw-bump-btn:hover { background: #4338ca; }
.nsdw-bumping { font-size: 11px; color: #9ca3af; text-align: center; }

/* Bump 建议面板 */
.nsp-bump-panel { margin-top: 4px; padding: 16px; background: #fff; border: 2px solid #c7d2fe; border-radius: 14px; }
.nsbp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.nsbp-title { font-size: 14px; font-weight: 700; color: #4338ca; }
.nsbp-time { font-size: 11px; color: #9ca3af; }
.nsbp-reasoning { font-size: 12px; color: #4b5563; line-height: 1.7; margin-bottom: 8px; }
.nsbp-weights { margin: 12px 0; padding: 10px 14px; background: #f9fafb; border-radius: 10px; }
.nsbpw-title { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px; }
.nsbpw-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
.nsbpw-row:last-child { border-bottom: none; }
.nsbpw-label { font-size: 12px; color: #6b7280; }
.nsbpw-new { font-size: 12px; font-weight: 700; color: #7c3aed; }
.nsbp-actions { display: flex; gap: 8px; margin-top: 12px; }
.nsbpa-accept {
  padding: 6px 18px; border: none; border-radius: 8px; background: #4f46e5; color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s;
}
.nsbpa-accept:hover { background: #4338ca; }
.nsbpa-dismiss {
  padding: 6px 14px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff;
  color: #6b7280; font-size: 13px; cursor: pointer;
}
.nsbpa-dismiss:hover { background: #f9fafb; }

/* 权重审核 */
.nsbp-validation { margin: 10px 0 0; padding: 12px; background: #fafbfc; border-radius: 10px; border: 1px solid #e8ecf1; }
.nsbpv-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.nsbpv-icon { font-size: 14px; }
.nsbpv-title { font-weight: 600; font-size: 13px; color: #111827; }
.nsbpv-recommendation { font-size: 12px; color: #6b7280; margin: 0 0 8px; line-height: 1.5; }
.nsbpv-summary { display: flex; gap: 16px; font-size: 12px; color: #6b7280; flex-wrap: wrap; margin-bottom: 8px; }
.nsbpv-summary b.ok { color: #16a34a; }
.nsbpv-summary b.ng { color: #dc2626; }
.nsbpv-details { font-size: 12px; }
.nsbpv-details summary { cursor: pointer; color: #1a56db; font-weight: 500; margin-bottom: 6px; }
.nsbpv-pair { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 4px; background: #fff; margin-bottom: 4px; font-family: monospace; font-size: 11px; }
.nsbpv-pair-idx { color: #9ca3af; min-width: 24px; }
.nsbpv-pair-content { flex: 1; }
.nsbpv-pair-content span { display: inline-block; padding: 1px 4px; border-radius: 3px; }
.nsbpv-pair-content span.error { color: #dc2626; background: #fef2f2; }
.nsbpv-arrow { margin: 0 4px; color: #9ca3af; }
.nsbpv-pair-likes { font-weight: 600; min-width: 28px; }
.nsbpv-pair-likes.warn { color: #d97706; }
.nsbpv-pair-likes-num { color: #9ca3af; font-size: 10px; }
.nsbpv-cross { margin-top: 8px; padding: 10px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; }
.nsbpv-cross-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.nsbpv-cross-label { font-weight: 600; font-size: 12px; color: #111827; }
.nsbpv-cross-header .ok { font-size: 11px; color: #16a34a; font-weight: 600; }
.nsbpv-cross-header .ng { font-size: 11px; color: #dc2626; font-weight: 600; }
.nsbpv-cross-verdict { font-size: 12px; color: #374151; margin: 0 0 4px; line-height: 1.4; }
.nsbpv-cross-advice { font-size: 11px; color: #6b7280; margin: 0; font-style: italic; }

/* 进化看板内的细节沿用原样式 */
.nspe-trend { margin-top: 10px; padding: 10px 12px; background: #fafbfc; border-radius: 10px; }
.nspet-label { font-size: 12px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.nspet-bars { display: flex; align-items: center; gap: 10px; }
.nspet-bar-group { display: flex; align-items: center; gap: 6px; flex: 1; }
.nspet-bar-label { font-size: 11px; color: #909399; min-width: 28px; }
.nspet-bar-track { flex: 1; height: 8px; background: #eef2f6; border-radius: 4px; overflow: hidden; }
.nspet-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
.nspet-bar-fill.early { background: #93c5fd; }
.nspet-bar-fill.recent { background: #3b82f6; }
.nspet-bar-val { font-size: 11px; font-weight: 600; color: #303133; min-width: 32px; text-align: right; }
.nspet-arrow { font-size: 14px; color: #9ca3af; }
.nspet-diff { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 6px; }
.nspet-diff.up { color: #16a34a; background: #dcfce7; }
.nspet-diff.down { color: #dc2626; background: #fef2f2; }
.nspet-desc { font-size: 12px; color: #4b5563; margin-top: 8px; line-height: 1.5; }
.nspe-wlog { margin-top: 12px; }
.nspewl-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 11px; flex-wrap: wrap; }
.nspewl-time { color: #9ca3af; min-width: 120px; }
.nspewl-trigger { padding: 1px 6px; border-radius: 4px; font-weight: 500; }
.nspewl-trigger.bump { background: #ede9fe; color: #6d28d9; }
.nspewl-trigger.reset { background: #f3f4f6; color: #6b7280; }
.nspewl-trigger.manual { background: #e0f2fe; color: #0c4a6e; }
.nspewl-note { color: #6b7280; }
.nspewl-diffs { margin-top: 6px; padding: 6px 8px; background: #f8fafc; border-radius: 6px; font-size: 11px; width: 100%; }
.nspewl-diff-empty { color: #9ca3af; font-size: 11px; padding: 4px 0; }
.nspewl-diff-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.nspewl-dim { color: #374151; min-width: 64px; }
.nspewl-from { color: #9ca3af; min-width: 30px; text-align: right; }
.nspewl-arrow-d { color: #cbd5e1; }
.nspewl-to { font-weight: 600; min-width: 30px; text-align: right; }
.nspewl-to.up { color: #16a34a; }
.nspewl-to.down { color: #dc2626; }
.nspewl-delta { font-size: 10px; padding: 0 4px; border-radius: 3px; }
.nspewl-delta.up { color: #16a34a; background: #f0fdf4; }
.nspewl-delta.down { color: #dc2626; background: #fef2f2; }

/* ===== 侧边栏：系统进化看板 ===== */
.nspsb-card {
  background: #fff; border-radius: 12px; padding: 16px; border: 1px solid #eef2f6;
  display: flex; flex-direction: column; gap: 14px;
}
.nspsb-title { font-size: 14px; font-weight: 700; color: #1f2937; }
.nspsb-title-row {
  display: flex; align-items: center; gap: 6px;
}
.nspsbt-toggle {
  cursor: pointer; user-select: none; transition: transform 0.2s;
  display: inline-block; font-size: 10px; color: #9ca3af;
  width: 16px; text-align: center; line-height: 1;
}
.nspsbt-toggle:hover { color: #1f2937; }
.nspsbt-toggle.open { transform: rotate(90deg); }
.nspsb-auto-sm {
  margin-left: auto; display: flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 10px; background: #f3f4f6;
  font-size: 11px; color: #9ca3af; cursor: pointer; user-select: none;
  transition: background 0.15s, color 0.15s;
}
.nspsb-auto-sm:hover { background: #e5e7eb; }
.nspsb-auto-sm.on { background: #dcfce7; color: #16a34a; }
.nspsb-auto-sm .nspsba-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #d1d5db; transition: background 0.15s;
}
.nspsb-auto-sm.on .nspsba-dot { background: #22c55e; box-shadow: 0 0 4px rgba(34,197,94,0.5); }
.nspsb-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.nspsbs-item {
  padding: 8px; background: #f8fafc; border-radius: 8px; text-align: center;
}
.nspsbs-val { display: block; font-size: 18px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.nspsbs-label { font-size: 10px; color: #9ca3af; }
.nspsb-tier { text-align: center; font-size: 12px; color: #8b5cf6; font-weight: 600; padding: 4px 0; }

/* 趋势 */
.nspsb-trend { padding: 10px; background: #f8fafc; border-radius: 8px; }
.nspsbt-label { font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 8px; }
.nspsbt-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.nspsbtr-item { text-align: center; flex: 1; }
.nspsbtri-label { font-size: 10px; color: #9ca3af; display: block; }
.nspsbtri-val { font-size: 15px; font-weight: 700; color: #374151; }
.nspsbtri-val.up { color: #16a34a; }
.nspsbtri-val.down { color: #dc2626; }
.nspsbt-arrow { color: #9ca3af; font-size: 14px; }
.nspsbt-diff { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; }
.nspsbt-diff.up { color: #16a34a; background: #f0fdf4; }
.nspsbt-diff.down { color: #dc2626; background: #fef2f2; }
.nspsbt-desc { font-size: 11px; color: #6b7280; margin-top: 6px; line-height: 1.4; }

/* 自动校准开关 */
.nspsb-auto {
  display: flex; align-items: center; gap: 6px; padding: 8px 10px;
  background: #f8fafc; border-radius: 8px; cursor: pointer; font-size: 11px; color: #6b7280;
}
.nspsb-auto.on { background: #f0fdf4; color: #16a34a; }
.nspsba-dot {
  width: 10px; height: 10px; border-radius: 50%; background: #d1d5db;
}
.nspsb-auto.on .nspsba-dot { background: #22c55e; }

/* 权重变更（侧边栏） */
.nspsb-wlog { display: flex; flex-direction: column; gap: 6px; }
.nspsbwl-title { font-size: 11px; font-weight: 600; color: #6b7280; }
.nspsbwl-item { padding: 8px; background: #f8fafc; border-radius: 6px; font-size: 10px; }
.nspsbwli-time { color: #9ca3af; margin-bottom: 2px; }
.nspsbwli-row { display: flex; align-items: center; gap: 6px; }
.nspsbwli-trigger { padding: 1px 5px; border-radius: 4px; font-weight: 600; }
.nspsbwli-trigger.bump { background: #ede9fe; color: #7c3aed; }
.nspsbwli-trigger.reset { background: #e5e7eb; color: #6b7280; }
.nspsbwli-trigger.manual { background: #dbeafe; color: #2563eb; }
.nspsbwli-note { color: #6b7280; }
.nspsbwli-toggle { display: block; margin-top: 2px; color: #3b82f6; cursor: pointer; font-size: 10px; }
.nspsbwli-diffs { margin-top: 4px; padding: 4px 6px; background: #fff; border-radius: 4px; }
.nspsbwlid-empty { color: #9ca3af; }
.nspsbwlid-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.nspsbwlid-dim { min-width: 52px; color: #374151; }
.nspsbwlid-row .up { color: #16a34a; font-weight: 600; }
.nspsbwlid-row .down { color: #dc2626; font-weight: 600; }
</style>