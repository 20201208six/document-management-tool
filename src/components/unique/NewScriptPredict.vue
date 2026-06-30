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
        <p class="nsp-card-desc">基于历史样本库中的文稿与点赞数据，通过7维评分体系（锚定Likert 1-5量表）和相似度匹配，预估新文稿的点赞量区间。<br><span class="nsp-blind-hint">盲预测模式：AI 预测时看不到参考样本的实际点赞量，确保预测客观。</span></p>

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
          placeholder="在此粘贴口播文稿全文…&#10;&#10;AI 将逐维度分析开场钩子、沉浸共鸣、干货密度等 7 项指标，&#10;并匹配样本库中最相似的文稿进行点赞量预估"
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

      <!-- 统一数据仪表盘 -->
      <PredictionDashboard
        :prediction="store.lastPrediction"
        :platform="predPlatform"
        :reasons="store.lastPrediction.reasons.map(r => cleanBullet(r))"
        :ref-samples="store.lastPrediction.referencedSamples"
        :suggestions="store.lastPrediction.suggestions.map(s => cleanBullet(s))"
        :counterfactuals="(store.lastPrediction.counterfactuals || []).map(c => cleanBullet(c))"
        :account-advice-items="accountAdviceItems"
      />

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

      <!-- ===== 右栏：AI 写稿 + 系统进化看板 + 预测历史 ===== -->
      <div class="nsp-sidebar" v-if="store.evolutionMetrics || store.predictionHistory.length > 0">
        <!-- AI 写稿 -->
        <div class="nsp-side-gen">
          <div class="nsp-sg-toggle" @click="showSideGen = !showSideGen">
            <span class="nspsbt-toggle" :class="{ open: showSideGen }">▶</span>
            <span class="nsp-sg-icon">🎨</span>
            <span class="nsp-sg-title">AI 写稿</span>
            <span class="nsp-sg-badge">免费</span>
          </div>
          <div v-if="showSideGen" class="nsp-sg-panel">
            <div class="nsp-sg-field">
              <label class="nsp-sg-label">话题输入</label>
              <textarea
                v-model="genTopic"
                placeholder="输入你想写的口播话题…"
                rows="2"
                class="nsp-sg-input"
              ></textarea>
            </div>
            <div class="nsp-sg-field-row">
              <div class="nsp-sg-field nsp-sg-field-sm">
                <label class="nsp-sg-label">目标平台</label>
                <el-select v-model="genPlatform" size="small" class="nsp-sg-select">
                  <el-option v-for="(c, k) in PLATFORM_CONFIG" :key="k" :label="c.icon + ' ' + c.label" :value="k" />
                </el-select>
              </div>
              <div class="nsp-sg-field nsp-sg-field-sm">
                <label class="nsp-sg-label">目标点赞</label>
                <el-input-number v-model="genTargetLikes" :min="0" :step="1000" size="small" placeholder="不限" class="nsp-sg-likes" />
              </div>
            </div>
            <button
              class="nsp-sg-btn"
              @click="handleGenerate"
              :disabled="!genTopic.trim() || genLoading"
            >
              <span v-if="genLoading" class="nsp-sg-btn-spin"></span>
              {{ genLoading ? 'AI 创作中…' : '🎨 生成口播文案' }}
            </button>

            <div v-if="genLoading" class="nsp-sg-loading">
              <div class="nsp-sg-loading-dots">
                <span></span><span></span><span></span>
              </div>
              <span class="nsp-sg-loading-text">AI 正在分析话题并创作中…</span>
            </div>

            <div v-if="generatedContent && !genLoading" class="nsp-sg-result">
              <div class="nsp-sg-result-head">
                <span class="nspsgrh-icon">✨</span>
                <span class="nspsgrh-title">生成完成</span>
                <span class="nspsgrh-length">{{ generatedContent.length }} 字</span>
              </div>
              <div class="nspsgr-text">{{ generatedContent }}</div>
              <div class="nspsgr-actions">
                <button class="nspsgr-use-btn" @click="useGenerated">
                  <span>📥</span> 填入预测框
                </button>
                <button class="nspsgr-copy-btn" @click="copyGenerated">
                  <span>📋</span> 复制全文
                </button>
              </div>
            </div>
          </div>
        </div>

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
                  class="nsp-hist-retro-btn"
                  :class="{ rero: entry.actualLikes != null }"
                  @click.stop="showRetroDialog(entry)"
                >
                  {{ entry.actualLikes != null ? '🔄 更新' : '🔄 复盘' }}
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

    <!-- 复盘弹窗 -->
    <el-dialog v-model="showRetro" :title="isReRetro ? '🔄 更新数据（不重复入库）' : '📊 复盘录入'" width="460px" :close-on-click-modal="true">
      <div class="retro-body" v-if="retroEntry">
        <div class="retro-pred">
          <span class="retro-label">预测区间：</span>
          <strong>{{ fmt(retroEntry.result.minLikes) }} ~ {{ fmt(retroEntry.result.maxLikes) }}</strong>
          <span class="retro-time">（{{ retroEntry.predictedAt }}）</span>
        </div>
        <div class="retro-content-preview">{{ retroEntry.content.slice(0, 100) }}{{ retroEntry.content.length > 100 ? '...' : '' }}</div>
        <div v-if="isReRetro" class="retro-rero-hint">⚠️ 仅更新预测历史中的数据，不会重复存入样本库</div>

        <!-- 主平台 -->
        <div class="retro-form">
          <label class="retro-label">{{ PLATFORM_CONFIG[retroEntry.platform]?.icon }} {{ retroEntry.platform }} · 实际点赞量：</label>
          <el-input-number v-model="retroLikes" :min="0" :step="100" :max="99999999" style="width:100%;margin-top:6px" placeholder="输入发布后的真实点赞量" />
        </div>
        <div class="retro-form" style="margin-top:10px">
          <label class="retro-label">播放量（可选）：</label>
          <el-input-number v-model="retroViews" :min="0" :step="100" :max="999999999" style="width:100%;margin-top:6px" placeholder="内容实际播放观看次数" />
        </div>

        <!-- 多平台开关 -->
        <div class="retro-form" style="margin-top:14px" v-if="!isReRetro && otherPlatformsForRetro.length > 0">
          <div class="retro-multi-toggle" @click="retroMultiPlatform = !retroMultiPlatform">
            <span class="retro-multi-label">多平台发布</span>
            <span class="retro-multi-hint">{{ retroMultiPlatform ? '已开启 · 可为各平台分别填写数据' : '开启后可为各平台分别填写点赞/播放量' }}</span>
            <span class="retro-multi-switch" :class="{ on: retroMultiPlatform }"></span>
          </div>
        </div>

        <!-- 额外平台输入 -->
        <template v-if="retroMultiPlatform && !isReRetro">
          <div class="retro-form" v-for="p in otherPlatformsForRetro" :key="p.key" style="margin-top:10px">
            <div class="retro-extra-header">
              <el-checkbox v-model="retroPlatformData[p.key].enabled">
                {{ PLATFORM_CONFIG[p.key]?.icon }} {{ PLATFORM_CONFIG[p.key]?.label }}
              </el-checkbox>
            </div>
            <template v-if="retroPlatformData[p.key].enabled">
              <div style="display:flex;gap:8px;margin-top:4px">
                <el-input-number v-model="retroPlatformData[p.key].likes" :min="0" :max="99999999" :step="100" size="small" style="flex:1" placeholder="点赞量" />
                <el-input-number v-model="retroPlatformData[p.key].views" :min="0" :max="999999999" :step="100" size="small" style="flex:1" placeholder="播放量（可选）" />
              </div>
            </template>
          </div>
        </template>

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
import { computed, ref, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUniqueModeStore, PLATFORM_CONFIG, SCORING_DIMENSION_CONFIG, type Platform, type PredictionLogEntry } from '@/stores/uniqueMode'
import PredictionDashboard from './PredictionDashboard.vue'

const store = useUniqueModeStore()

/** 去掉文本开头的列表标记符号 (- 1. 等) */
function cleanBullet(text: string): string {
  return text.replace(/^[\s]*[-*]*\s*\d*[\.\、\)]*\s*/, '')
}

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
    hook: '前3秒直击痛点，用"你怎么知道我在想这个"式的钩子抓住注意力',
    empathy: '不仅说出感受，更帮受众理清情绪的来龙去脉，让他们觉得"这说的就是我"',
    density: '持续提供新知，每段都给受众的理解框架加一层，拒绝注水',
    structure: '构建「被戳中→被解读→被点醒」的完整节奏弧线',
    originality: '用只有你能讲的解读角度和案例组合，让受众觉得"换个号就没这个味儿"',
    socialResonance: '精准命中群体的集体痛点，让受众产生"必须转给谁看"的冲动',
    polish: '用引经据典/案例佐证建立可靠感，每个论断都有根据、不忽悠'
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

// ===== AI 写稿（侧边栏） =====
const showSideGen = ref(false)
const genTopic = ref('')
const genPlatform = ref<Platform>('抖音')
const genTargetLikes = ref<number | null>(null)
const genLoading = ref(false)
const generatedContent = ref('')

async function handleGenerate() {
  genLoading.value = true
  try {
    generatedContent.value = await store.generateContent(genTopic.value.trim(), genPlatform.value, genTargetLikes.value || undefined)
  } catch (e: any) { ElMessage.error('生成失败: ' + (e.message || '未知错误')) }
  finally { genLoading.value = false }
}

function useGenerated() {
  if (!generatedContent.value) return
  predContent.value = generatedContent.value
  ElMessage.success('文案已填入预测框，点击「开始预测」进行评估')
}

async function copyGenerated() {
  if (!generatedContent.value) return
  try {
    await navigator.clipboard.writeText(generatedContent.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动选中复制')
  }
}

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

// ===== 复盘 =====
const showRetro = ref(false)
const isReRetro = ref(false)
const retroEntry = ref<PredictionLogEntry | null>(null)
const retroLikes = ref<number | null>(null)
const retroViews = ref<number | null>(null)
const retroNote = ref('')
const retroMultiPlatform = ref(false)

// 多平台数据
const allPlatformKeys = Object.keys(PLATFORM_CONFIG).filter(k => k !== '全部') as Platform[]
const retroPlatformData = reactive<Record<string, { enabled: boolean; likes: number; views: number }>>(
  Object.fromEntries(allPlatformKeys.map(k => [k, { enabled: false, likes: 0, views: 0 }]))
)
const otherPlatformsForRetro = computed(() =>
  retroEntry.value ? allPlatformKeys.filter(k => k !== retroEntry.value!.platform).map(k => ({ key: k })) : []
)

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
  isReRetro.value = entry.actualLikes != null
  retroLikes.value = entry.actualLikes ?? null
  retroViews.value = entry.actualViews ?? null
  retroNote.value = entry.retroNote ?? ''
  retroMultiPlatform.value = false
  for (const k of allPlatformKeys) {
    retroPlatformData[k] = { enabled: false, likes: 0, views: 0 }
  }
  showRetro.value = true
}

function handleRetro() {
  if (!retroEntry.value || retroLikes.value == null) return

  // 收集额外的平台数据
  let additionalPlatforms: Array<{ platform: Platform; likes: number; views?: number }> | undefined
  if (!isReRetro.value && retroMultiPlatform.value) {
    const extras = allPlatformKeys
      .filter(k => k !== retroEntry.value!.platform && retroPlatformData[k].enabled && retroPlatformData[k].likes > 0)
      .map(k => ({
        platform: k,
        likes: retroPlatformData[k].likes,
        views: retroPlatformData[k].views > 0 ? retroPlatformData[k].views : undefined
      } as { platform: Platform; likes: number; views?: number }))
    if (extras.length > 0) additionalPlatforms = extras
  }

  store.retroPrediction(
    retroEntry.value.id,
    retroLikes.value,
    retroViews.value || undefined,
    retroNote.value || undefined,
    isReRetro.value,
    additionalPlatforms
  )

  const extraCount = additionalPlatforms?.length ?? 0
  ElMessage.success(
    isReRetro.value
      ? '更新完成，数据已刷新（未重复入库）'
      : extraCount > 0
        ? `复盘数据已保存 · 主平台 + ${extraCount} 个额外平台样本已入库`
        : '复盘数据已保存，文稿已自动加入样本库'
  )
  showRetro.value = false
  retroLikes.value = null; retroViews.value = null; retroNote.value = ''
  retroMultiPlatform.value = false
  isReRetro.value = false
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

// 来自「账号沟通」AI 生成的内容自动填入预测框
watch(() => store.pendingGeneratedContent, (val) => {
  if (val) {
    predContent.value = val
    store.pendingGeneratedContent = null
    ElMessage.success('文案已从「账号沟通」同步，点击「开始预测」进行评估')
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

.nsp-card { background: var(--c-bg-card); border-radius: 14px; padding: 18px 20px; border: 1px solid var(--c-border-light); }
.nsp-card-title { font-size: 14px; font-weight: 600; color: var(--c-text); margin-bottom: 8px; }
.nsp-subtitle { font-size: 11px; color: var(--c-text-muted); font-weight: 400; margin-left: 4px; }
.nsp-card-desc { font-size: 12px; color: var(--c-text-muted); margin: 0 0 12px; line-height: 1.5; }

/* ===== 1. 输入区 ===== */
.nsp-input-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.nsp-select { width: 150px; }
.nsp-sample-hint { font-size: 12px; color: var(--c-text-muted); }
.nsp-sample-hint.warn { color: var(--c-warning); }
.nsp-improve-btn {
  margin-left: auto; padding: 6px 16px; border-radius: 18px; border: 1px solid color-mix(in srgb, var(--c-success) 35%, var(--c-border));
  background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.15s; font-family: inherit; white-space: nowrap;
}
.nsp-improve-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--c-success) 10%, transparent); border-color: var(--c-success); }
.nsp-improve-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.nsp-input textarea { width: 100%; padding: 14px; border: 1px solid var(--c-border-light); border-radius: 10px; font-size: 14px; line-height: 1.6; resize: vertical; min-height: 100px; font-family: inherit; transition: border 0.2s; box-sizing: border-box; background: var(--c-bg-sec); }
.nsp-input textarea:focus { outline: none; border-color: var(--c-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-primary) 8%, transparent); background: var(--c-bg-card); }

.nsp-actions { display: flex; gap: 10px; margin-top: 14px; }
.nsp-btn { padding: 10px 26px; border-radius: 24px; border: none; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 0.15s, transform 0.1s; font-family: inherit; }
.nsp-btn:active:not(:disabled) { transform: scale(0.97); }
.nsp-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.nsp-btn-primary { background: var(--c-primary); color: var(--c-primary-text); }
.nsp-btn-primary:hover:not(:disabled) { background: var(--c-primary-hover); }
.nsp-btn-ghost { background: var(--c-bg-hover); color: var(--c-text-sec); }
.nsp-btn-ghost:hover { background: var(--c-border-light); }

/* ===== 2. 进化看板紧凑版 ===== */
.nsp-evo-compact { padding: 10px 16px; }
.nsevo-bar {
  display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none;
  flex-wrap: wrap;
}
.nsevo-title { font-size: 13px; font-weight: 600; color: var(--c-text); white-space: nowrap; }
.nsevo-stats { display: flex; align-items: center; gap: 6px; flex: 1; font-size: 12px; color: var(--c-text-muted); min-width: 0; flex-wrap: wrap; }
.nsevo-stat b { color: var(--c-primary); font-weight: 700; }
.nsevo-sep { color: var(--c-text-muted); }
.nsevo-last { font-size: 10px; color: var(--c-text-muted); margin-left: 4px; }
.nsevo-arrow { font-size: 14px; color: var(--c-text-muted); transition: transform 0.2s; flex-shrink: 0; }
.nsevo-arrow.open { transform: rotate(180deg); }

.nsevo-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--c-border-light); }

.nspe-auto-toggle {
  display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 2px 10px; border-radius: 14px;
  font-size: 11px; font-weight: 500; border: 1px solid var(--c-border); background: var(--c-bg-sec); color: var(--c-text-muted);
  transition: all 0.25s; user-select: none; margin-left: auto;
}
.nspe-auto-toggle.on { background: color-mix(in srgb, var(--c-success) 10%, transparent); border-color: color-mix(in srgb, var(--c-success) 35%, var(--c-border)); color: var(--c-success); }
.nspe-auto-toggle:hover { border-color: var(--c-text-muted); }
.nspe-auto-toggle.on:hover { border-color: color-mix(in srgb, var(--c-success) 35%, var(--c-border)); }
.npeat-dot {
  width: 7px; height: 7px; border-radius: 50%; background: var(--c-text-muted); transition: all 0.25s;
}
.nspe-auto-toggle.on .nspeat-dot { background: var(--c-success); }

.nspeo-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
.nspeo-stat { text-align: center; padding: 10px 6px; background: var(--c-bg-sec); border-radius: 10px; border: 1px solid var(--c-border-light); }
.nspeos-num { font-size: 22px; font-weight: 700; color: var(--c-primary); }
.nspeos-label { font-size: 11px; color: var(--c-text-muted); margin-top: 2px; }
.nspeos-tier { font-size: 10px; color: var(--c-success); margin-top: 4px; line-height: 1.4; }

/* ===== 3. 预测历史（右侧面板） ===== */
.nsp-history-section {
  width: 100%; flex-shrink: 0;
  background: var(--c-bg-card); border-radius: 12px; border: 1px solid var(--c-border-light);
  display: flex; flex-direction: column; max-height: 300px;
}
.nsp-hist-header {
  font-size: 13px; font-weight: 600; color: var(--c-text);
  padding: 12px 14px; border-bottom: 1px solid var(--c-border-light); flex-shrink: 0;
  display: flex; align-items: center; gap: 8px;
}
.nsp-hist-unreviewed {
  margin-left: auto;
  padding: 2px 9px; border-radius: 14px; font-size: 10px; font-weight: 600; white-space: nowrap;
  background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success);
}

.nsp-history-list {
  display: flex; flex-direction: column; gap: 2px;
  overflow-y: auto; flex: 1; padding: 6px;
}
.nsp-history-item {
  position: relative; display: flex; flex-direction: column; gap: 4px;
  padding: 8px 10px; background: var(--c-bg-sec); border: 1px solid var(--c-border-light); border-radius: 8px;
  cursor: pointer; transition: background 0.15s, border-color 0.15s;
}
.nsp-history-item:hover { background: var(--c-primary-soft); }
.nsp-history-item.active { background: var(--c-primary-soft); border-color: var(--c-primary); }
.nsp-history-item.reviewed { background: var(--c-bg-sec); }
.nsp-hist-del {
  position: absolute; bottom: 6px; right: 6px;
  width: 22px; height: 22px; padding: 0; border: none; border-radius: 6px;
  background: transparent; color: var(--c-text-muted); display: flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0; transition: opacity 0.15s, color 0.15s, background 0.15s;
}
.nsp-history-item:hover .nsp-hist-del { opacity: 1; }
.nsp-hist-del:hover { color: var(--c-danger); background: color-mix(in srgb, var(--c-danger) 10%, transparent); }
.nsp-hist-main { display: flex; align-items: center; gap: 6px; min-width: 0; }
.nsp-hist-platform { font-size: 14px; flex-shrink: 0; }
.nsp-hist-text { font-size: 12px; color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nsp-hist-meta { display: flex; align-items: center; gap: 8px; }
.nsp-hist-pred { font-size: 12px; font-weight: 600; color: var(--c-warning); }
.nsp-hist-actual { font-size: 12px; font-weight: 600; }
.nsp-hist-actual.over { color: var(--c-success); }
.nsp-hist-actual.under { color: var(--c-danger); }
.nsp-hist-pending { font-size: 11px; color: var(--c-text-muted); background: var(--c-bg-hover); padding: 2px 8px; border-radius: 8px; }
.nsp-hist-retro-btn {
  padding: 2px 8px; border: 1px solid var(--c-warning); border-radius: 6px; background: var(--c-warning);
  color: var(--c-primary-text); font-size: 8px; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.nsp-hist-retro-btn:hover { background: var(--c-warning); border-color: var(--c-warning); }
.nsp-hist-retro-btn.rero { border-color: color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); color: var(--c-primary); background: var(--c-primary-soft); }
.nsp-hist-retro-btn.rero:hover { background: color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); border-color: color-mix(in srgb, var(--c-primary) 40%, transparent); }
.nsp-hist-time { font-size: 10px; color: var(--c-text-muted); }

/* ===== 查看历史提示条 ===== */
.nsp-viewing-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; background: linear-gradient(135deg, var(--c-primary-soft), var(--c-bg-card)); border: 1px solid color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light));
  border-radius: 10px; font-size: 12px; color: var(--c-primary); font-weight: 500;
}
.nsp-vb-actions { display: flex; align-items: center; gap: 8px; }
.nsp-vb-retro {
  padding: 3px 12px; border: 1px solid color-mix(in srgb, var(--c-warning) 35%, var(--c-border)); border-radius: 6px; background: color-mix(in srgb, var(--c-warning) 10%, transparent);
  color: var(--c-warning); font-size: 11px; cursor: pointer; font-weight: 600; transition: background 0.15s;
}
.nsp-vb-retro:hover { background: color-mix(in srgb, var(--c-warning) 10%, transparent); }
.nsp-vb-back {
  padding: 3px 12px; border: 1px solid color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); border-radius: 6px; background: transparent;
  color: var(--c-primary); font-size: 11px; cursor: pointer; font-weight: 500; transition: background 0.15s;
}
.nsp-vb-back:hover { background: var(--c-primary-soft); }

/* ===== 4. 结果区（大部分保留原样式） ===== */
.nsp-result-card { background: linear-gradient(135deg, var(--c-bg-sec) 0%, var(--c-bg-card) 100%); }
.nspr-overview { display: flex; gap: 32px; flex-wrap: wrap; }
.nspro-item { display: flex; flex-direction: column; gap: 4px; }
.nspro-label { font-size: 12px; color: var(--c-text-muted); }
.nspro-value { font-size: 24px; font-weight: 700; color: var(--c-text); }
.nspro-value.risk { font-size: 20px; }
.nspro-value.risk-low { color: var(--c-success); }
.nspro-value.risk-mid { color: var(--c-warning); }
.nspro-value.risk-high { color: var(--c-danger); }
.nspro-value.confidence { font-size: 18px; color: var(--c-primary); }
.nspro-score .nspro-value { color: var(--c-primary); }
.nspro-likes .nspro-value { color: var(--c-warning); }
.nspro-tag { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 6px; }
.nspro-tag.excellent { background: color-mix(in srgb, var(--c-warning) 10%, transparent); color: var(--c-warning); }
.nspro-tag.good { background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); }
.nspro-tag.normal { background: color-mix(in srgb, var(--c-warning) 10%, transparent); color: var(--c-warning); }

.nspr-summary { margin-top: 14px; padding: 10px 14px; background: var(--c-primary-soft); border-radius: 10px; font-size: 13px; color: var(--c-text-sec); line-height: 1.5; }
.nspr-summary strong { color: var(--c-primary); }

/* 概率分布 */
.nsp-prob-chart { display: flex; flex-direction: column; gap: 8px; }
.nsp-prob-bar-wrap { display: flex; align-items: center; gap: 10px; }
.nsp-prob-label { width: 120px; font-size: 12px; color: var(--c-text-muted); text-align: right; flex-shrink: 0; }
.nsp-prob-track { flex: 1; height: 20px; background: var(--c-bg-hover); border-radius: 10px; overflow: hidden; }
.nsp-prob-fill { height: 100%; border-radius: 10px; background: color-mix(in srgb, var(--c-primary) 30%, transparent); transition: width 0.5s; min-width: 2px; }
.nsp-prob-fill.headline { background: linear-gradient(90deg, var(--c-primary), var(--c-accent)); }
.nsp-prob-pct { width: 50px; font-size: 13px; font-weight: 600; color: var(--c-text-muted); text-align: left; flex-shrink: 0; }
.nsp-prob-pct.headline { color: var(--c-primary); }

/* 7维评分 */
.nsp-scores-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
.nsps-item { display: flex; flex-direction: column; gap: 3px; }
.nsps-header { display: flex; align-items: center; gap: 5px; }
.nsps-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.nsps-label { font-size: 12px; color: var(--c-text-muted); }
.nsps-val { font-size: 12px; font-weight: 700; margin-left: auto; }
.nsps-bar-wrap { height: 6px; background: var(--c-bg-hover); border-radius: 3px; overflow: hidden; }
.nsps-bar { height: 100%; border-radius: 3px; transition: width 0.4s; min-width: 2px; }
.nsps-disagree { font-size: 11px; margin-left: 3px; }

.nsps-disagree-box { margin-top: 12px; padding: 10px 14px; background: color-mix(in srgb, var(--c-warning) 10%, transparent); border-radius: 8px; border: 1px solid color-mix(in srgb, var(--c-warning) 25%, var(--c-border)); font-size: 12px; }
.nsps-disagree-title { font-weight: 600; color: var(--c-warning); margin-bottom: 4px; }
.nsps-disagree-item { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.nsps-disagree-dim { font-weight: 600; color: var(--c-warning); min-width: 60px; }
.nsps-disagree-vals { color: var(--c-warning); }
.nsps-disagree-hint { font-size: 10px; color: var(--c-warning); }

/* 双栏 */
.nsp-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: stretch; }
.nsp-col-stack { display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
.nsp-col-stack > .nsp-card { flex: none; }
@media (max-width: 750px) { .nsp-two-col { grid-template-columns: 1fr; } }

.nsp-list { margin: 0; padding-left: 16px; font-size: 13px; color: var(--c-text-sec); line-height: 1.7; }
.nsp-list li { margin-bottom: 4px; }
.nsp-suggestions li::marker { color: var(--c-primary); }
.nsp-counter li::marker { color: var(--c-warning); }

.nsp-ref-list { margin-bottom: 8px; }
.nsp-ref-list:last-child { margin-bottom: 0; }

/* 预测依据 — 阶梯式理由卡 */
.nsp-card--insight { background: var(--c-primary-soft); border-color: color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); }
.nsp-reason-list { display: flex; flex-direction: column; gap: 10px; }
.nsp-reason-item {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 12px; background: var(--c-bg-card); border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); transition: border-color 0.2s, box-shadow 0.2s;
}
.nsp-reason-item:hover { border-color: color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); box-shadow: 0 1px 4px var(--c-shadow); }
.nsp-reason-num {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  background: linear-gradient(135deg, var(--c-accent), var(--c-primary)); color: var(--c-primary-text);
  font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center;
  line-height: 1; margin-top: 1px;
}
.nsp-reason-text { font-size: 12px; color: var(--c-text); line-height: 1.65; flex: 1; min-width: 0; }

/* 反事实分析 — 橙色警告调 */
.nsp-card--counterfact { background: color-mix(in srgb, var(--c-warning) 10%, transparent); border-color: color-mix(in srgb, var(--c-warning) 25%, var(--c-border)); }
.nsp-reason--warn { background: var(--c-bg-card); border-color: color-mix(in srgb, var(--c-warning) 25%, var(--c-border)); }
.nsp-reason--warn:hover { border-color: var(--c-warning); box-shadow: 0 1px 6px var(--c-shadow); }
.nsp-reason-num--warn { background: linear-gradient(135deg, var(--c-warning), color-mix(in srgb, var(--c-warning) 75%, #000)); }

/* 优化建议 — 绿色行动调 */
.nsp-card--suggest { background: color-mix(in srgb, var(--c-success) 10%, transparent); border-color: color-mix(in srgb, var(--c-success) 35%, var(--c-border)); }
.nsp-reason--action { background: var(--c-bg-card); border-color: color-mix(in srgb, var(--c-success) 25%, var(--c-border-light)); }
.nsp-reason--action:hover { border-color: var(--c-success); box-shadow: 0 1px 6px var(--c-shadow); }
.nsp-reason-num--action { background: linear-gradient(135deg, var(--c-success), color-mix(in srgb, var(--c-success) 75%, #000)); }

/* 参考样本 — 紧凑卡 + 得分徽标 */
.nsp-card--refs { background: var(--c-bg-card); border-color: var(--c-border-light); }
.nspr-card {
  background: var(--c-bg-sec); border: 1px solid var(--c-border-light); border-radius: 10px; padding: 10px 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.nspr-card:hover { border-color: color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); box-shadow: 0 1px 3px var(--c-shadow); }
.nsprc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
.nsprc-platform { font-size: 11px; color: var(--c-text-muted); font-weight: 500; }
.nsprc-score-badge {
  font-size: 12px; font-weight: 700; color: var(--c-primary-text); background: linear-gradient(135deg, var(--c-accent), var(--c-primary));
  padding: 2px 10px; border-radius: 12px; line-height: 1.4;
}
.nsprc-snippet { font-size: 12px; color: var(--c-text); margin-bottom: 6px; line-height: 1.55; }
.nsprc-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.nsprc-tag {
  font-size: 10px; color: var(--c-text-sec); background: var(--c-bg-hover); padding: 2px 8px; border-radius: 6px;
  line-height: 1.5; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ===== 5. 深度工具 + AI复盘 ===== */
.nsp-tools { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }

.nsp-audit-result { margin-top: 12px; padding: 12px; background: var(--c-bg-sec); border-radius: 8px; border: 1px solid var(--c-border-light); }
.nspar-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 6px; }
.nspar-cred { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.nspar-cred.high { background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); }
.nspar-cred.medium { background: color-mix(in srgb, var(--c-warning) 10%, transparent); color: var(--c-warning); }
.nspar-cred.low { background: color-mix(in srgb, var(--c-danger) 10%, transparent); color: var(--c-danger); }
.nspar-note { font-size: 12px; color: var(--c-text-muted); }
.nspar-diffs { margin-top: 8px; }
.nspard-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
.nspard-label { min-width: 64px; color: var(--c-text-sec); }
.nspard-arrow { color: var(--c-text-muted); }
.nspard-flag { font-size: 10px; padding: 1px 4px; border-radius: 3px; }
.nspard-flag.alert { background: color-mix(in srgb, var(--c-danger) 10%, transparent); color: var(--c-danger); }
.nspard-flag.warn { background: color-mix(in srgb, var(--c-warning) 10%, transparent); color: var(--c-warning); }

.nsp-rewrite-compare { margin-top: 14px; }
.nsprc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.nsprc-col { padding: 10px; background: var(--c-bg-sec); border-radius: 8px; border: 1px solid var(--c-border-light); }
.nsprc-col.improved { background: color-mix(in srgb, var(--c-success) 10%, transparent); border-color: color-mix(in srgb, var(--c-success) 35%, var(--c-border)); }
.nsprcc-label { font-size: 13px; font-weight: 600; color: var(--c-text); margin-bottom: 6px; }
.nsprcc-content { font-size: 12px; color: var(--c-text-muted); line-height: 1.6; margin-bottom: 8px; max-height: 120px; overflow: hidden; }
.nsprcc-scores { margin-bottom: 8px; }
.nsprcs-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
.nsprcs-dim { color: var(--c-text-muted); }
.nsprcs-val { font-weight: 600; }
.nsprcs-val.better { color: var(--c-success); }
.nsprcs-delta { font-size: 9px; margin-left: 4px; padding: 0 3px; border-radius: 2px; background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); }
.nsprcs-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-right: 2px; }
.nsprcc-pred { font-size: 11px; color: var(--c-text-muted); }
.nsprcc-pred.improved { color: var(--c-success); font-weight: 600; }

/* 改写对比紧凑卡片 */
.nsprc-compact { display: flex; flex-direction: column; gap: 14px; }
.nsprcc-summary {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  background: var(--c-bg-sec); border-radius: 10px; border: 1px solid var(--c-border-light);
  flex-wrap: wrap;
}
.nsprccs-item { display: flex; flex-direction: column; gap: 2px; align-items: center; }
.nsprccs-item.improved { flex-direction: row; gap: 6px; }
.nsprccs-label { font-size: 10px; color: var(--c-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.nsprccs-val { font-size: 14px; font-weight: 700; color: var(--c-text-sec); }
.nsprccs-item.improved .nsprccs-val { color: var(--c-success); }
.nsprccs-arrow { font-size: 16px; color: var(--c-success); font-weight: 700; }
.nsprccs-delta {
  font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 8px;
}
.nsprccs-delta.up { background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); }
.nsprccs-delta.down { background: color-mix(in srgb, var(--c-danger) 10%, transparent); color: var(--c-danger); }

/* 改进说明 */
.nsprc-improvements { margin-top: 4px; padding: 12px 14px; background: color-mix(in srgb, var(--c-warning) 10%, transparent); border-radius: 10px; border: 1px solid color-mix(in srgb, var(--c-warning) 25%, var(--c-border)); }
.nsprci-title { font-size: 12px; font-weight: 600; color: var(--c-warning); margin-bottom: 8px; }
.nsprci-item { display: flex; gap: 8px; margin-bottom: 6px; font-size: 12px; color: var(--c-warning); line-height: 1.55; }
.nsprci-item:last-child { margin-bottom: 0; }
.nsprci-num {
  flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%;
  background: var(--c-warning); color: var(--c-primary-text); font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; margin-top: 1px;
}

.nsp-generate { display: flex; flex-direction: column; }
.nsp-gen-result { margin-top: 12px; }
.nsp-gen-text { font-size: 12px; color: var(--c-text-sec); line-height: 1.8; white-space: pre-wrap; max-height: 300px; overflow-y: auto; padding: 10px; background: var(--c-bg-sec); border-radius: 8px; border: 1px solid var(--c-border-light); }

/* 加载 */
.nsp-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 30px; background: var(--c-bg-card); border-radius: 14px; border: 1px solid var(--c-border-light); font-size: 13px; color: var(--c-text-muted); }
.nspl-dot-flash { font-size: 20px; animation: pulse 1.2s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

/* 空状态 */
.nsp-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.nspe-icon { font-size: 36px; opacity: 0.5; }
.nspe-title { font-size: 14px; font-weight: 600; color: var(--c-text-muted); }
.nspe-desc { font-size: 12px; color: var(--c-text-muted); }

/* 复盘弹窗 */
.retro-body { display: flex; flex-direction: column; gap: 4px; }
.retro-pred { font-size: 14px; color: var(--c-text); }
.retro-pred strong { color: var(--c-warning); }
.retro-time { font-size: 11px; color: var(--c-text-muted); margin-left: 6px; }
.retro-content-preview { font-size: 12px; color: var(--c-text-muted); padding: 8px; background: var(--c-bg-hover); border-radius: 8px; margin: 8px 0; line-height: 1.5; }
.retro-rero-hint { font-size: 11px; color: var(--c-warning); background: color-mix(in srgb, var(--c-warning) 10%, transparent); padding: 6px 10px; border-radius: 6px; margin-bottom: 4px; }
.retro-label { font-size: 13px; color: var(--c-text-muted); font-weight: 500; }
.retro-form { margin-bottom: 4px; }

/* 复盘多平台开关 */
.retro-multi-toggle {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; background: var(--c-bg-sec); border: 1px solid var(--c-border-light); border-radius: 10px;
  cursor: pointer; user-select: none; transition: border-color 0.2s;
}
.retro-multi-toggle:hover { border-color: color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); }
.retro-multi-label { font-size: 13px; font-weight: 600; color: var(--c-text); }
.retro-multi-hint { font-size: 11px; color: var(--c-text-muted); flex: 1; }
.retro-multi-switch {
  width: 36px; height: 20px; border-radius: 10px; background: var(--c-text-muted);
  position: relative; transition: background 0.25s; flex-shrink: 0;
}
.retro-multi-switch::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%; background: var(--c-bg-card);
  transition: transform 0.25s; box-shadow: 0 1px 3px var(--c-shadow-hover);
}
.retro-multi-switch.on { background: var(--c-primary); }
.retro-multi-switch.on::after { transform: translateX(16px); }
.retro-extra-header { display: flex; align-items: center; gap: 6px; }

/* 账号专属优化建议 */
.nsp-account-advice { background: linear-gradient(135deg, color-mix(in srgb, var(--c-success) 10%, transparent) 0%, var(--c-bg-card) 100%); border-color: color-mix(in srgb, var(--c-success) 35%, var(--c-border)); }
.nsaa-subtitle { font-size: 12px; color: var(--c-text-muted); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
.nsaa-shifted-tag { font-size: 10px; padding: 2px 8px; border-radius: 8px; background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); font-weight: 600; }
.nsaa-items { display: flex; flex-direction: column; gap: 12px; }
.nsaa-item { padding: 12px 14px; background: var(--c-bg-sec); border-radius: 10px; border: 1px solid var(--c-border-light); transition: border-color 0.2s, background 0.2s; }
.nsaa-item.nsaa-warn { background: color-mix(in srgb, var(--c-warning) 10%, transparent); border-color: color-mix(in srgb, var(--c-warning) 25%, var(--c-border)); }
.nsaa-item.nsaa-warn:hover { border-color: #f5c542; }
.nsaa-item:hover { border-color: var(--c-border); }
.nsaai-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.nsaai-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.nsaai-dim { font-size: 13px; font-weight: 600; color: var(--c-text); }
.nsaai-rank { font-size: 11px; padding: 1px 7px; border-radius: 6px; background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); font-weight: 600; }
.nsaai-correlation { font-size: 11px; color: var(--c-success); font-weight: 500; margin-left: auto; }
.nsaa-warn .nsaai-rank { background: color-mix(in srgb, var(--c-warning) 10%, transparent); color: var(--c-warning); }
.nsaai-score-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.nsaai-score-label { font-size: 12px; color: var(--c-text-muted); }
.nsaai-score-val { font-size: 16px; font-weight: 700; color: var(--c-text); }
.nsaai-score-val.low { color: var(--c-danger); }
.nsaai-grade { font-size: 11px; padding: 1px 8px; border-radius: 8px; background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); font-weight: 500; }
.nsaai-grade.warn { background: color-mix(in srgb, var(--c-danger) 10%, transparent); color: var(--c-danger); font-weight: 600; }
.nsaai-advice { font-size: 12px; color: var(--c-text-sec); line-height: 1.6; padding: 8px 10px; background: color-mix(in srgb, var(--c-success) 10%, transparent); border-radius: 8px; border-left: 3px solid var(--c-success); }
.nsaai-advice.warn { background: color-mix(in srgb, var(--c-warning) 10%, transparent); border-left-color: var(--c-warning); color: var(--c-warning); font-weight: 500; }

/* 偏差趋势警告（卡片风格） */
.nsp-deviation-warn-side {
  background: var(--c-bg-card); border-radius: 12px; padding: 14px 16px; margin-bottom: 10px;
  border: 1px solid var(--c-border-light); display: flex; flex-direction: column; gap: 10px;
  transition: border-color 0.2s;
}
.nsp-deviation-warn-side.warn-severe:hover { border-color: var(--c-danger); }
.nsp-deviation-warn-side.warn-moderate:hover { border-color: var(--c-warning); }
.nsp-deviation-warn-side.warn-mild:hover { border-color: var(--c-primary); }
.nsdw-title-row {
  display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;
}
.nsdw-label {
  font-size: 12px; font-weight: 700; color: var(--c-text);
}
.nsdw-bump-btn-sm {
  margin-left: auto; padding: 2px 8px; border: none; border-radius: 10px;
  background: var(--c-primary-soft); color: var(--c-primary); font-size: 10px; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.nsdw-bump-btn-sm:hover { background: var(--c-primary-soft); }
.nsdw-stats-row {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
}
.nsdw-stat-item {
  padding: 8px 4px; background: var(--c-bg-sec); border-radius: 8px; text-align: center;
}
.nsdw-stat-val {
  display: block; font-size: 18px; font-weight: 700; color: var(--c-text); line-height: 1.2;
}
.nsdw-stat-val.low { color: var(--c-warning); }
.nsdw-stat-val.high { color: var(--c-danger); }
.nsdw-stat-label {
  display: block; font-size: 10px; color: var(--c-text-muted); margin-top: 1px;
}
.nsdw-bump-btn {
  padding: 6px 0; border: none; border-radius: 8px;
  background: var(--c-primary); color: var(--c-primary-text); font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background 0.15s; text-align: center;
}
.nsdw-bump-btn:hover { background: var(--c-primary-hover); }
.nsdw-bumping { font-size: 11px; color: var(--c-text-muted); text-align: center; }

/* Bump 建议面板 */
.nsp-bump-panel { margin-top: 4px; padding: 16px; background: var(--c-bg-card); border: 2px solid color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); border-radius: 14px; }
.nsbp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.nsbp-title { font-size: 14px; font-weight: 700; color: var(--c-primary); }
.nsbp-time { font-size: 11px; color: var(--c-text-muted); }
.nsbp-reasoning { font-size: 12px; color: var(--c-text-sec); line-height: 1.7; margin-bottom: 8px; }
.nsbp-weights { margin: 12px 0; padding: 10px 14px; background: var(--c-bg-sec); border-radius: 10px; }
.nsbpw-title { font-size: 12px; font-weight: 600; color: var(--c-text-sec); margin-bottom: 8px; }
.nsbpw-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--c-border-light); }
.nsbpw-row:last-child { border-bottom: none; }
.nsbpw-label { font-size: 12px; color: var(--c-text-muted); }
.nsbpw-new { font-size: 12px; font-weight: 700; color: var(--c-accent); }
.nsbp-actions { display: flex; gap: 8px; margin-top: 12px; }
.nsbpa-accept {
  padding: 6px 18px; border: none; border-radius: 8px; background: var(--c-primary); color: var(--c-primary-text);
  font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s;
}
.nsbpa-accept:hover { background: var(--c-primary-hover); }
.nsbpa-dismiss {
  padding: 6px 14px; border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-bg-card);
  color: var(--c-text-muted); font-size: 13px; cursor: pointer;
}
.nsbpa-dismiss:hover { background: var(--c-bg-sec); }

/* 权重审核 */
.nsbp-validation { margin: 10px 0 0; padding: 12px; background: var(--c-bg-sec); border-radius: 10px; border: 1px solid var(--c-border-light); }
.nsbpv-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.nsbpv-icon { font-size: 14px; }
.nsbpv-title { font-weight: 600; font-size: 13px; color: var(--c-text); }
.nsbpv-recommendation { font-size: 12px; color: var(--c-text-muted); margin: 0 0 8px; line-height: 1.5; }
.nsbpv-summary { display: flex; gap: 16px; font-size: 12px; color: var(--c-text-muted); flex-wrap: wrap; margin-bottom: 8px; }
.nsbpv-summary b.ok { color: var(--c-success); }
.nsbpv-summary b.ng { color: var(--c-danger); }
.nsbpv-details { font-size: 12px; }
.nsbpv-details summary { cursor: pointer; color: var(--c-primary); font-weight: 500; margin-bottom: 6px; }
.nsbpv-pair { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 4px; background: var(--c-bg-card); margin-bottom: 4px; font-family: monospace; font-size: 11px; }
.nsbpv-pair-idx { color: var(--c-text-muted); min-width: 24px; }
.nsbpv-pair-content { flex: 1; }
.nsbpv-pair-content span { display: inline-block; padding: 1px 4px; border-radius: 3px; }
.nsbpv-pair-content span.error { color: var(--c-danger); background: color-mix(in srgb, var(--c-danger) 10%, transparent); }
.nsbpv-arrow { margin: 0 4px; color: var(--c-text-muted); }
.nsbpv-pair-likes { font-weight: 600; min-width: 28px; }
.nsbpv-pair-likes.warn { color: var(--c-warning); }
.nsbpv-pair-likes-num { color: var(--c-text-muted); font-size: 10px; }
.nsbpv-cross { margin-top: 8px; padding: 10px; background: color-mix(in srgb, var(--c-success) 10%, transparent); border-radius: 8px; border: 1px solid color-mix(in srgb, var(--c-success) 35%, var(--c-border)); }
.nsbpv-cross-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.nsbpv-cross-label { font-weight: 600; font-size: 12px; color: var(--c-text); }
.nsbpv-cross-header .ok { font-size: 11px; color: var(--c-success); font-weight: 600; }
.nsbpv-cross-header .ng { font-size: 11px; color: var(--c-danger); font-weight: 600; }
.nsbpv-cross-verdict { font-size: 12px; color: var(--c-text-sec); margin: 0 0 4px; line-height: 1.4; }
.nsbpv-cross-advice { font-size: 11px; color: var(--c-text-muted); margin: 0; font-style: italic; }

/* 进化看板内的细节沿用原样式 */
.nspe-trend { margin-top: 10px; padding: 10px 12px; background: var(--c-bg-sec); border-radius: 10px; }
.nspet-label { font-size: 12px; font-weight: 600; color: var(--c-text); margin-bottom: 8px; }
.nspet-bars { display: flex; align-items: center; gap: 10px; }
.nspet-bar-group { display: flex; align-items: center; gap: 6px; flex: 1; }
.nspet-bar-label { font-size: 11px; color: var(--c-text-muted); min-width: 28px; }
.nspet-bar-track { flex: 1; height: 8px; background: var(--c-border-light); border-radius: 4px; overflow: hidden; }
.nspet-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
.nspet-bar-fill.early { background: color-mix(in srgb, var(--c-primary) 40%, transparent); }
.nspet-bar-fill.recent { background: var(--c-primary); }
.nspet-bar-val { font-size: 11px; font-weight: 600; color: var(--c-text); min-width: 32px; text-align: right; }
.nspet-arrow { font-size: 14px; color: var(--c-text-muted); }
.nspet-diff { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 6px; }
.nspet-diff.up { color: var(--c-success); background: color-mix(in srgb, var(--c-success) 10%, transparent); }
.nspet-diff.down { color: var(--c-danger); background: color-mix(in srgb, var(--c-danger) 10%, transparent); }
.nspet-desc { font-size: 12px; color: var(--c-text-sec); margin-top: 8px; line-height: 1.5; }
.nspe-wlog { margin-top: 12px; }
.nspewl-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--c-border-light); font-size: 11px; flex-wrap: wrap; }
.nspewl-time { color: var(--c-text-muted); min-width: 120px; }
.nspewl-trigger { padding: 1px 6px; border-radius: 4px; font-weight: 500; }
.nspewl-trigger.bump { background: color-mix(in srgb, var(--c-accent) 12%, transparent); color: var(--c-accent); }
.nspewl-trigger.reset { background: var(--c-bg-hover); color: var(--c-text-muted); }
.nspewl-trigger.manual { background: color-mix(in srgb, var(--c-primary) 10%, transparent); color: var(--c-text-sec); }
.nspewl-note { color: var(--c-text-muted); }
.nspewl-diffs { margin-top: 6px; padding: 6px 8px; background: var(--c-bg-sec); border-radius: 6px; font-size: 11px; width: 100%; }
.nspewl-diff-empty { color: var(--c-text-muted); font-size: 11px; padding: 4px 0; }
.nspewl-diff-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.nspewl-dim { color: var(--c-text-sec); min-width: 64px; }
.nspewl-from { color: var(--c-text-muted); min-width: 30px; text-align: right; }
.nspewl-arrow-d { color: var(--c-text-muted); }
.nspewl-to { font-weight: 600; min-width: 30px; text-align: right; }
.nspewl-to.up { color: var(--c-success); }
.nspewl-to.down { color: var(--c-danger); }
.nspewl-delta { font-size: 10px; padding: 0 4px; border-radius: 3px; }
.nspewl-delta.up { color: var(--c-success); background: color-mix(in srgb, var(--c-success) 10%, transparent); }
.nspewl-delta.down { color: var(--c-danger); background: color-mix(in srgb, var(--c-danger) 10%, transparent); }

/* ===== 侧边栏：AI 写稿 ===== */
.nsp-side-gen {
  background: var(--c-bg-card); border-radius: 12px; border: 1px solid var(--c-border-light);
  box-shadow: 0 1px 3px var(--c-shadow); overflow: hidden; margin-bottom: 10px;
}
.nsp-sg-toggle {
  display: flex; align-items: center; gap: 8px; padding: 14px 16px;
  cursor: pointer; user-select: none; transition: background .15s;
}
.nsp-sg-toggle:hover { background: var(--c-bg-sec); }
.nsp-sg-icon { font-size: 16px; }
.nsp-sg-title { font-size: 14px; font-weight: 700; color: var(--c-text); }
.nsp-sg-badge {
  margin-left: auto; font-size: 10px; font-weight: 600; color: var(--c-success);
  padding: 2px 8px; background: color-mix(in srgb, var(--c-success) 10%, transparent); border-radius: 10px;
}
.nsp-sg-panel { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; }
.nsp-sg-field { display: flex; flex-direction: column; gap: 5px; }
.nsp-sg-label {
  font-size: 11px; font-weight: 600; color: var(--c-text-muted); text-transform: none;
  letter-spacing: 0.3px;
}
.nsp-sg-input {
  width: 100%; padding: 10px 12px; border: 1px solid var(--c-border); border-radius: 8px;
  font-size: 13px; color: var(--c-text); outline: none; resize: vertical;
  font-family: inherit; line-height: 1.6; box-sizing: border-box;
  transition: border-color .15s, box-shadow .15s; background: var(--c-bg-sec);
}
.nsp-sg-input:focus { border-color: color-mix(in srgb, var(--c-success) 35%, var(--c-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-success) 8%, transparent); background: var(--c-bg-card); }
.nsp-sg-input::placeholder { color: var(--c-text-muted); }
.nsp-sg-field-row { display: flex; gap: 10px; }
.nsp-sg-field-sm { flex: 1; min-width: 0; }
.nsp-sg-select { width: 100%; }
.nsp-sg-likes { width: 100%; }

.nsp-sg-btn {
  width: 100%; padding: 10px 16px; border: none; border-radius: 10px;
  background: linear-gradient(135deg, var(--c-success), color-mix(in srgb, var(--c-success) 75%, #000)); color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--c-success) 25%, transparent);
}
.nsp-sg-btn:hover:not(:disabled) {
  box-shadow: 0 4px 14px color-mix(in srgb, var(--c-success) 35%, transparent);
  transform: translateY(-1px);
}
.nsp-sg-btn:disabled { opacity: .4; cursor: not-allowed; box-shadow: none; transform: none; }
.nsp-sg-btn-spin {
  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4);
  border-top-color: var(--c-primary-text); border-radius: 50%; animation: nsp-sg-spin .6s linear infinite;
}
@keyframes nsp-sg-spin { to { transform: rotate(360deg); } }

/* 加载状态 */
.nsp-sg-loading {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 20px 0;
}
.nsp-sg-loading-dots { display: flex; gap: 5px; }
.nsp-sg-loading-dots span {
  width: 6px; height: 6px; border-radius: 50%; background: var(--c-text-muted);
  animation: nsp-sg-dot-bounce 1.2s infinite ease-in-out;
}
.nsp-sg-loading-dots span:nth-child(2) { animation-delay: .15s; }
.nsp-sg-loading-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes nsp-sg-dot-bounce {
  0%, 80%, 100% { transform: scale(.6); opacity: .4; }
  40% { transform: scale(1); opacity: 1; }
}
.nsp-sg-loading-text { font-size: 11px; color: var(--c-text-muted); }

/* 生成结果 */
.nsp-sg-result { display: flex; flex-direction: column; gap: 10px; }
.nsp-sg-result-head {
  display: flex; align-items: center; gap: 6px;
  padding-bottom: 8px; border-bottom: 1px solid var(--c-border);
}
.nspsgrh-icon { font-size: 14px; }
.nspsgrh-title { font-size: 12px; font-weight: 700; color: var(--c-text); }
.nspsgrh-length { margin-left: auto; font-size: 11px; color: var(--c-text-muted); }
.nspsgr-text {
  font-size: 13px; color: var(--c-text-sec); line-height: 1.8; padding: 12px;
  background: var(--c-bg-sec); border-radius: 8px; border: 1px solid var(--c-border-light);
  max-height: 180px; overflow-y: auto; white-space: pre-wrap;
}
.nspsgr-actions { display: flex; gap: 8px; }
.nspsgr-use-btn, .nspsgr-copy-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all .15s; border: none;
}
.nspsgr-use-btn {
  background: var(--c-primary); color: var(--c-primary-text);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--c-primary) 20%, transparent);
}
.nspsgr-use-btn:hover { background: var(--c-primary-hover); }
.nspsgr-copy-btn {
  background: var(--c-bg-card); color: var(--c-text-sec); border: 1px solid var(--c-border);
}
.nspsgr-copy-btn:hover { background: var(--c-bg-hover); border-color: var(--c-text-muted); }

/* ===== 侧边栏：系统进化看板 ===== */
.nspsb-card {
  background: var(--c-bg-card); border-radius: 12px; padding: 16px; border: 1px solid var(--c-border-light);
  display: flex; flex-direction: column; gap: 14px;
}
.nspsb-title { font-size: 14px; font-weight: 700; color: var(--c-text); }
.nspsb-title-row {
  display: flex; align-items: center; gap: 6px;
}
.nspsbt-toggle {
  cursor: pointer; user-select: none; transition: transform 0.2s;
  display: inline-block; font-size: 10px; color: var(--c-text-muted);
  width: 16px; text-align: center; line-height: 1;
}
.nspsbt-toggle:hover { color: var(--c-text); }
.nspsbt-toggle.open { transform: rotate(90deg); }
.nspsb-auto-sm {
  margin-left: auto; display: flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 10px; background: var(--c-bg-hover);
  font-size: 11px; color: var(--c-text-muted); cursor: pointer; user-select: none;
  transition: background 0.15s, color 0.15s;
}
.nspsb-auto-sm:hover { background: var(--c-border); }
.nspsb-auto-sm.on { background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); }
.nspsb-auto-sm .nspsba-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--c-text-muted); transition: background 0.15s;
}
.nspsb-auto-sm.on .nspsba-dot { background: var(--c-success); box-shadow: 0 0 4px color-mix(in srgb, var(--c-success) 50%, transparent); }
.nspsb-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.nspsbs-item {
  padding: 8px; background: var(--c-bg-sec); border-radius: 8px; text-align: center;
}
.nspsbs-val { display: block; font-size: 18px; font-weight: 700; color: var(--c-text); line-height: 1.2; }
.nspsbs-label { font-size: 10px; color: var(--c-text-muted); }
.nspsb-tier { text-align: center; font-size: 12px; color: var(--c-accent); font-weight: 600; padding: 4px 0; }

/* 趋势 */
.nspsb-trend { padding: 10px; background: var(--c-bg-sec); border-radius: 8px; }
.nspsbt-label { font-size: 11px; font-weight: 600; color: var(--c-text-muted); margin-bottom: 8px; }
.nspsbt-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.nspsbtr-item { text-align: center; flex: 1; }
.nspsbtri-label { font-size: 10px; color: var(--c-text-muted); display: block; }
.nspsbtri-val { font-size: 15px; font-weight: 700; color: var(--c-text-sec); }
.nspsbtri-val.up { color: var(--c-success); }
.nspsbtri-val.down { color: var(--c-danger); }
.nspsbt-arrow { color: var(--c-text-muted); font-size: 14px; }
.nspsbt-diff { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; }
.nspsbt-diff.up { color: var(--c-success); background: color-mix(in srgb, var(--c-success) 10%, transparent); }
.nspsbt-diff.down { color: var(--c-danger); background: color-mix(in srgb, var(--c-danger) 10%, transparent); }
.nspsbt-desc { font-size: 11px; color: var(--c-text-muted); margin-top: 6px; line-height: 1.4; }

/* 自动校准开关 */
.nspsb-auto {
  display: flex; align-items: center; gap: 6px; padding: 8px 10px;
  background: var(--c-bg-sec); border-radius: 8px; cursor: pointer; font-size: 11px; color: var(--c-text-muted);
}
.nspsb-auto.on { background: color-mix(in srgb, var(--c-success) 10%, transparent); color: var(--c-success); }
.nspsba-dot {
  width: 10px; height: 10px; border-radius: 50%; background: var(--c-text-muted);
}
.nspsb-auto.on .nspsba-dot { background: var(--c-success); }

/* 权重变更（侧边栏） */
.nspsb-wlog { display: flex; flex-direction: column; gap: 6px; }
.nspsbwl-title { font-size: 11px; font-weight: 600; color: var(--c-text-muted); }
.nspsbwl-item { padding: 8px; background: var(--c-bg-sec); border-radius: 6px; font-size: 10px; }
.nspsbwli-time { color: var(--c-text-muted); margin-bottom: 2px; }
.nspsbwli-row { display: flex; align-items: center; gap: 6px; }
.nspsbwli-trigger { padding: 1px 5px; border-radius: 4px; font-weight: 600; }
.nspsbwli-trigger.bump { background: color-mix(in srgb, var(--c-accent) 12%, transparent); color: var(--c-accent); }
.nspsbwli-trigger.reset { background: var(--c-bg-hover); color: var(--c-text-muted); }
.nspsbwli-trigger.manual { background: color-mix(in srgb, var(--c-primary) 25%, var(--c-border-light)); color: var(--c-primary); }
.nspsbwli-note { color: var(--c-text-muted); }
.nspsbwli-toggle { display: block; margin-top: 2px; color: var(--c-primary); cursor: pointer; font-size: 10px; }
.nspsbwli-diffs { margin-top: 4px; padding: 4px 6px; background: var(--c-bg-card); border-radius: 4px; }
.nspsbwlid-empty { color: var(--c-text-muted); }
.nspsbwlid-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.nspsbwlid-dim { min-width: 52px; color: var(--c-text-sec); }
.nspsbwlid-row .up { color: var(--c-success); font-weight: 600; }
.nspsbwlid-row .down { color: var(--c-danger); font-weight: 600; }
</style>