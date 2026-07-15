<template>
  <div class="workflow-panel">
    <!-- 左侧：对话列表 -->
    <div class="wf-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <span v-if="!sidebarCollapsed" class="sidebar-title">对话列表</span>
        <el-button
          size="small"
          circle
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <el-icon
            ><ArrowLeft v-if="!sidebarCollapsed" /><ArrowRight v-else
          /></el-icon>
        </el-button>
      </div>
      <el-button
        v-if="!sidebarCollapsed"
        type="primary"
        size="small"
        style="width: 100%; margin-bottom: 8px"
        @click="newConversation"
      >
        <el-icon><Plus /></el-icon> 新建对话
      </el-button>
      <div v-if="!sidebarCollapsed" class="conversation-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conv-item"
          :class="{ active: conv.id === activeConvId }"
          @click="switchConversation(conv.id)"
        >
          <div class="conv-title">{{ conv.title || "未命名对话" }}</div>
          <div class="conv-time">{{ formatConvTime(conv.createdAt) }}</div>
          <el-button
            size="small"
            text
            type="danger"
            @click.stop="deleteConversation(conv.id)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <div v-if="conversations.length === 0" class="conv-empty">
          暂无对话，点击上方按钮新建
        </div>
      </div>
    </div>

    <!-- 右侧：工作区 -->
    <div class="wf-main">
      <div class="wf-header">
        <el-icon><MagicStick /></el-icon>
        <span>官方工作流 — 基于字幕数据智能生成视频文案</span>
        <div
          style="
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 8px;
          "
        >
          <span
            v-if="sourceList.length > 0"
            style="font-size: 12px; color: #606266"
          >
            已选 {{ selectedSourceIds.length }}/{{ sourceList.length }} 个来源
          </span>
          <el-button size="small" @click="refreshSources" :loading="scanning">
            <el-icon><Refresh /></el-icon> 刷新数据
          </el-button>
        </div>
      </div>

      <div class="wf-body">
        <!-- 左侧：输入区（步骤 1-4） -->
        <div class="wf-left">
          <!-- 数据源选择 -->
          <div class="wf-card">
            <div class="card-title">步骤 1：选择数据源</div>

            <div v-if="!hasStoragePath" class="source-hint">
              <el-icon><InfoFilled /></el-icon>
              未设置字幕存储目录，请先在「工作状态」→「字幕管理」中配置
            </div>
            <div
              v-else-if="sourceList.length === 0 && !scanning"
              class="source-hint"
            >
              <el-icon><InfoFilled /></el-icon>
              存储目录中没有字幕数据，请先在「工作状态」中导入视频并完成语音识别
            </div>

            <div v-else class="source-list">
              <div
                v-for="src in sourceList"
                :key="src.id"
                class="source-item"
                :class="{ selected: selectedSourceIds.has(src.id) }"
                @click="toggleSource(src.id)"
              >
                <el-checkbox
                  :model-value="selectedSourceIds.has(src.id)"
                  @click.stop
                  @change="toggleSource(src.id)"
                />
                <el-icon :size="16" color="#409eff"><VideoCamera /></el-icon>
                <span class="source-name">{{ src.name }}</span>
                <span class="source-sub-count"
                  >{{ src.subtitleCount }} 条字幕</span
                >
              </div>
            </div>

            <div
              v-if="sourceList.length > 0"
              style="margin-top: 8px; display: flex; gap: 8px"
            >
              <el-button size="small" text @click="selectAllSources"
                >全选</el-button
              >
              <el-button size="small" text @click="deselectAllSources"
                >取消全选</el-button
              >
            </div>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 2：文案方向 / 画像配置</div>

            <!-- 核心输入：文案方向 -->
            <div class="step2-section">
              <div class="step2-section-title">📝 文案方向</div>
              <el-input
                v-model="currentConv.topic"
                type="textarea"
                :rows="2"
                placeholder="例如：「做一个关于时间管理的励志视频脚本」"
              />
            </div>

            <!-- 人物画像行：人设 + 人群（并排） -->
            <div class="step2-section">
              <div class="step2-section-title">👤 受众画像</div>
              <div class="step2-row">
                <div class="step2-col">
                  <span class="step2-field-label">人设画像 <span class="field-hint">你是谁</span></span>
                  <el-input
                    v-model="currentConv.speakerPersona"
                    type="textarea"
                    :rows="2"
                    placeholder="例：10年互联网运营老兵，擅长用自嘲讲干货"
                    @change="onConvDirty"
                  />
                </div>
                <div class="step2-col">
                  <span class="step2-field-label">人群画像 <span class="field-hint">给谁看</span></span>
                  <el-input
                    v-model="currentConv.audiencePersona"
                    type="textarea"
                    :rows="2"
                    placeholder="例：25-35岁职场新人，焦虑但想进步"
                    @change="onConvDirty"
                  />
                </div>
              </div>
            </div>

            <!-- 高级配置（可折叠） -->
            <details class="step2-advanced" open>
              <summary class="step2-advanced-summary">
                <span>⚙️ 高级配置</span>
                <span class="field-hint">质量标准 · 创作者画像 · 平台 · 参考文案</span>
              </summary>

              <div class="step2-advanced-body">
                <!-- 质量标准 -->
                <div class="step2-field">
                  <span class="step2-field-label">质量标准 <span class="field-hint">告诉 AI 你的内容底线</span></span>
                  <el-input
                    v-model="currentConv.qualityStandard"
                    type="textarea"
                    :rows="2"
                    placeholder="例：不要鸡汤、拒绝说教感、每段必须有具体案例"
                    @change="onConvDirty"
                  />
                </div>

                <!-- 创作者画像 + 平台（一行四个小字段） -->
                <div class="step2-field">
                  <span class="step2-field-label">创作者画像 &amp; 平台</span>
                  <div class="step2-inline-grid">
                    <div class="step2-inline-item">
                      <span class="step2-mini-label">年龄</span>
                      <el-input-number
                        v-model="currentConv.creatorAge"
                        :min="18"
                        :max="80"
                        size="small"
                        controls-position="right"
                        style="width: 100%"
                        @change="onConvDirty"
                      />
                    </div>
                    <div class="step2-inline-item">
                      <span class="step2-mini-label">赛道</span>
                      <el-input
                        v-model="currentConv.creatorTrack"
                        size="small"
                        placeholder="国学 / 职场 / 情感"
                        @change="onConvDirty"
                      />
                    </div>
                    <div class="step2-inline-item">
                      <span class="step2-mini-label">性别</span>
                      <el-radio-group
                        v-model="currentConv.creatorGender"
                        size="small"
                        @change="onConvDirty"
                      >
                        <el-radio value="male">男</el-radio>
                        <el-radio value="female">女</el-radio>
                      </el-radio-group>
                    </div>
                    <div class="step2-inline-item">
                      <span class="step2-mini-label">发布平台</span>
                      <el-select
                        v-model="currentConv.targetPlatform"
                        size="small"
                        placeholder="选择"
                        clearable
                        style="width: 100%"
                        @change="onConvDirty"
                      >
                        <el-option
                          v-for="p in ['抖音', '视频号', '小红书', '快手']"
                          :key="p"
                          :label="p"
                          :value="p"
                        />
                      </el-select>
                    </div>
                  </div>
                </div>

                <!-- 参考文案 -->
                <div class="step2-field">
                  <span class="step2-field-label">
                    参考文案 <span class="field-hint">选填，最多 5 条</span>
                  </span>
                  <div
                    v-for="(_, idx) in currentConv.referenceCopies"
                    :key="idx"
                    class="ref-copy-item"
                  >
                    <el-input
                      :model-value="currentConv.referenceCopies[idx]"
                      type="textarea"
                      :rows="2"
                      :placeholder="`参考文案 ${idx + 1}`"
                      @update:model-value="
                        (v: string) => updateReferenceCopy(idx, v)
                      "
                    />
                    <el-button
                      class="ref-copy-delete"
                      size="small"
                      text
                      type="danger"
                      @click="removeReferenceCopy(idx)"
                    >
                      &times;
                    </el-button>
                  </div>
                  <el-button
                    v-if="
                      !currentConv.referenceCopies ||
                      currentConv.referenceCopies.length < 5
                    "
                    size="small"
                    text
                    type="primary"
                    @click="addReferenceCopy"
                  >
                    + 添加参考文案
                  </el-button>
                </div>

                <!-- 设置管理 -->
                <div class="step2-field">
                  <span class="step2-field-label">
                    设置管理 <span class="field-hint">保存配置，下次一键加载</span>
                  </span>
                  <div style="display: flex; gap: 6px; align-items: center">
                    <el-input
                      v-model="saveSettingsName"
                      size="small"
                      placeholder="设置名称…"
                      style="flex: 1"
                      clearable
                    />
                    <el-button size="small" @click="saveCurrentSettings(saveSettingsName); saveSettingsName = ''">
                      保存设置
                    </el-button>
                  </div>
                  <div v-if="savedSettings.length > 0" style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px">
                    <el-tag
                      v-for="s in savedSettings"
                      :key="s.name"
                      closable
                      size="small"
                      type="info"
                      style="cursor: pointer"
                      @click="applySavedSetting(s.name)"
                      @close="deleteSavedSetting(s.name)"
                    >
                      {{ s.name }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 3：输出控制</div>

            <div class="field-label">期望时长 <span class="field-hint">AI 会根据实际素材量建议可行的时长区间</span></div>
            <div class="param-row">
              <el-input
                v-model="currentConv.durationRequirement"
                size="small"
                placeholder="如：五分钟以上 / 3-4分钟"
                clearable
                @change="onConvDirty"
              />
            </div>

            <div class="field-divider"></div>

            <div class="field-label">句子间隔 <span class="field-hint">控制去气口粒度，直接影响步骤 4 计算结果</span></div>
            <div class="param-row">
              <div class="param-slider-wrap">
                <span class="param-edge">1帧</span>
                <el-slider
                  v-model="currentConv.frameGap"
                  :min="1"
                  :max="10"
                  :step="1"
                  size="small"
                  style="flex: 1"
                  @change="onConvDirty"
                />
                <span class="param-edge">10帧</span>
              </div>
            </div>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 4：计算时长 / 去气口</div>
            <p class="step-desc">根据句子间隔设置，分析气口分布并计算总时长</p>

            <div v-if="gapStats" class="gap-stats">
              <div class="gap-stat-row">
                <span>视频帧率</span
                ><strong>{{ selectedSourcesFps.join(" / ") }}</strong>
              </div>
              <div class="gap-stat-row">
                <span>句子间隔</span
                ><strong
                  >{{ currentConv.frameGap }}帧 ≈
                  {{ gapThresholdMsDisplay }}</strong
                >
              </div>
              <div class="gap-stat-row">
                <span>字幕总数</span
                ><strong>{{ gapStats.totalSegments }}</strong>
              </div>
              <div
                class="gap-stat-row"
                style="
                  border-top: 1px dashed #ebeef5;
                  padding-top: 8px;
                  margin-top: 4px;
                "
              >
                <span style="color: #909399">句间气口</span
                ><strong
                  >{{ gapStats.segGaps
                  }}<span
                    v-if="gapStats.removableSegGaps"
                    style="color: #67c23a; font-size: 10px; margin-left: 4px"
                    >可去{{ gapStats.removableSegGaps }}</span
                  ></strong
                >
              </div>
              <div class="gap-stat-row">
                <span style="color: #909399">字间气口</span
                ><strong
                  >{{ gapStats.wordGaps
                  }}<span
                    v-if="gapStats.removableWordGaps"
                    style="color: #67c23a; font-size: 10px; margin-left: 4px"
                    >可去{{ gapStats.removableWordGaps }}</span
                  ></strong
                >
              </div>
              <div class="gap-stat-row">
                <span>去除后节省</span
                ><strong style="color: #67c23a">{{
                  store.formatTime(gapStats.savedMs / 1000)
                }}</strong>
              </div>
              <div class="gap-stat-row">
                <span>原始总时长</span
                ><strong>{{
                  store.formatTime(gapStats.originalDurationSec)
                }}</strong>
              </div>
              <div class="gap-stat-row">
                <span>去气口后时长</span
                ><strong style="color: #409eff">{{
                  store.formatTime(gapStats.compactDurationSec)
                }}</strong>
              </div>
            </div>
            <div v-else class="step-desc" style="color: #c0c4cc">
              选择数据源后点击下方按钮分析
            </div>

            <el-button
              size="small"
              :disabled="selectedSourceIds.size === 0"
              :loading="computingGap"
              @click="computeGaps"
              style="width: 100%; margin-top: 8px"
            >
              计算时长并分析气口
            </el-button>

            <div
              v-if="gapStats"
              style="margin-top: 8px; text-align: center; font-size: 12px; color: #67c23a"
            >
              ✅ 去气口完成 — 查看右侧预览，满意后选择模型并开始 AI 处理
            </div>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 5：选择模型</div>
            <el-radio-group v-model="selectedModelId" size="small">
              <el-radio v-for="m in chatStore.models" :key="m.id" :value="m.id">
                {{ m.name }}
              </el-radio>
            </el-radio-group>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 6：AI 智能处理</div>
            <p class="step-desc">
              三阶段处理：去重建议时长 → 挑选+七维质检 → 网感编排
            </p>

            <!-- 方案模式选择 -->
            <div class="scheme-mode-selector" v-if="!isGenerating && currentAiStage === 0">
              <div class="scheme-mode-label">
                <span>生成方案</span>
              </div>
              <div class="scheme-mode-options">
                <div
                  class="scheme-option"
                  :class="{ active: currentConv.schemeMode === 'precise' }"
                  @click="currentConv.schemeMode = 'precise'; onConvDirty()"
                >
                  <div class="scheme-option-icon">✂️</div>
                  <div class="scheme-option-body">
                    <div class="scheme-option-title">精剪模式</div>
                    <div class="scheme-option-desc">绑定视频素材，前半可跳切，后半逻辑通顺</div>
                  </div>
                </div>
                <div
                  class="scheme-option"
                  :class="{ active: currentConv.schemeMode === 'effect' }"
                  @click="currentConv.schemeMode = 'effect'; onConvDirty()"
                >
                  <div class="scheme-option-icon">🎯</div>
                  <div class="scheme-option-body">
                    <div class="scheme-option-title">效果优先</div>
                    <div class="scheme-option-desc">不受素材限制，纯以文案冲击力为准</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-stage-progress" v-if="isGenerating || currentAiStage > 0">
              <div
                class="ai-stage"
                v-for="(stage, i) in aiStages"
                :key="i"
                :class="{
                  active: i === currentAiStage,
                  done: i < currentAiStage,
                }"
              >
                <span class="stage-dot">{{
                  i < currentAiStage ? "✓" : i === currentAiStage ? "●" : "○"
                }}</span>
                <span class="stage-label">{{ stage }}</span>
              </div>
            </div>

            <!-- 阶段 6a 结果：去重 + 建议时长 -->
            <div v-if="suggestedDuration && !isGenerating" class="phase-result">
              <div class="phase-result-title">📊 AI 建议时长</div>
              <div class="phase-result-body">
                <span style="font-size: 18px; font-weight: 700; color: #409eff">
                  {{ suggestedDuration.minMin }}分{{ suggestedDuration.minSec }}秒 ~ {{ suggestedDuration.maxMin }}分{{ suggestedDuration.maxSec }}秒
                </span>
                <div v-if="currentConv.durationRequirement" style="margin-top: 4px; font-size: 12px; color: #909399">
                  你的期望时长：{{ currentConv.durationRequirement }}
                </div>
              </div>
            </div>

            <!-- 阶段 6b 结果：七维评分（紧凑版） -->
            <div v-if="sevenDimScores && !isGenerating && currentAiStage >= 2" class="quality-compact" style="margin: 10px 0 8px">
              <div class="qc-header">
                <span class="qc-score-badge" :style="{ background: compositeColor }">{{ calcCompositeScore(sevenDimScores) }}</span>
                <span class="qc-label">综合分</span>
                <span class="qc-toggle" @click="showStep6SevenDim = !showStep6SevenDim" :class="{ active: showStep6SevenDim }">
                  七维 {{ showStep6SevenDim ? '▴' : '▾' }}
                </span>
              </div>
              <div v-show="showStep6SevenDim" class="qc-body">
                <div class="qc-grid">
                  <div v-for="dim in SCORING_DIMENSION_CONFIG" :key="dim.key" class="qc-dim">
                    <span class="qc-dim-dot" :style="{ background: dim.color }"></span>
                    <span class="qc-dim-name">{{ dim.label }}</span>
                    <span class="qc-dim-val" :style="{ color: dim.color }">{{ sevenDimScores[dim.key] }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- QC 重试信息 -->
            <div v-if="qcRetries > 0 && !isGenerating" style="margin-top: 6px; font-size: 12px; color: #e6a23c">
              ⚠️ {{ qcFeedback }}
            </div>

            <!-- 主按钮：根据阶段状态显示不同文字和动作 -->
            <el-button
              v-if="currentAiStage < 3"
              type="primary"
              size="default"
              :loading="isGenerating"
              :disabled="
                selectedSourceIds.size === 0 || !currentConv.topic.trim() || !gapStats
              "
              @click="handlePhaseAction"
              style="width: 100%"
            >
              <el-icon><MagicStick /></el-icon>
              {{
                isGenerating
                  ? "AI 处理中..."
                  : currentAiStage === 0
                  ? "开始 AI 处理"
                  : currentAiStage === 1
                  ? "确认时长，继续挑选文案"
                  : "确认挑选，开始网感编排"
              }}
            </el-button>

            <!-- 完成状态 -->
            <el-button
              v-else
              type="success"
              size="default"
              disabled
              style="width: 100%"
            >
              ✓ 三阶段处理已完成
            </el-button>

            <details v-if="gapStats && currentConv.topic.trim() && !isGenerating" style="margin-top: 10px; font-size: 12px;">
              <summary style="cursor: pointer; color: #909399; user-select: none">
                📋 预览将发送给 AI 的内容
              </summary>
              <div style="color: #606266; background: #fafafa; padding: 8px 10px; border-radius: 4px; margin-top: 6px; line-height: 1.7">
                <div><strong>数据源：</strong>{{ sourceList.filter(s => selectedSourceIds.has(s.id)).map(s => s.name).join("、") || "—" }}</div>
                <div><strong>字幕数：</strong>{{ gapStats?.totalSegments || 0 }} 条</div>
                <div><strong>去气口后时长：</strong>{{ store.formatTime(gapStats?.compactDurationSec || 0) }}</div>
                <div><strong>文案方向：</strong>{{ currentConv.topic }}</div>
                <div v-if="currentConv.speakerPersona"><strong>人设画像：</strong>{{ currentConv.speakerPersona.slice(0, 40) }}{{ currentConv.speakerPersona.length > 40 ? "..." : "" }}</div>
                <div v-if="currentConv.audiencePersona"><strong>人群画像：</strong>{{ currentConv.audiencePersona.slice(0, 40) }}{{ currentConv.audiencePersona.length > 40 ? "..." : "" }}</div>
                <div v-if="currentConv.durationRequirement"><strong>时长要求：</strong>{{ currentConv.durationRequirement }}</div>
                <div><strong>处理流程：</strong>去重优化 → 时间轴文案 → 网感编排</div>
              </div>
            </details>
          </div>

          <div v-if="isGenerating" class="wf-loading">
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
            <span>{{ statusText }}</span>
          </div>

          <!-- 生成详情日志 -->
          <div v-if="genLog || isGenerating" class="gen-log-card">
            <div
              class="gen-log-header"
              @click="showGenLog = !showGenLog"
              style="
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
              "
            >
              <span style="font-size: 12px; font-weight: 600; color: #606266">
                <el-icon :size="14"><InfoFilled /></el-icon> 生成详情
              </span>
              <el-icon
                :size="14"
                style="transition: transform 0.2s"
                :style="{ transform: showGenLog ? 'rotate(90deg)' : '' }"
              >
                <ArrowRight />
              </el-icon>
            </div>
            <div v-show="showGenLog" class="gen-log-body">
              <div class="log-item" v-if="genLog">
                <span class="log-label">发送 Token</span>
                <span class="log-val">{{
                  genLog.promptTokens.toLocaleString()
                }}</span>
              </div>
              <div class="log-item" v-if="genLog">
                <span class="log-label">返回 Token</span>
                <span class="log-val">{{
                  genLog.completionTokens.toLocaleString()
                }}</span>
              </div>
              <div class="log-item" v-if="genLog">
                <span class="log-label">输出字数</span>
                <span class="log-val">{{ genLog.charsOut }} 字</span>
              </div>
              <div class="log-item" v-if="genLog && genLog.truncated">
                <span class="log-label" style="color: #e6a23c">注意</span>
                <span class="log-val" style="color: #e6a23c"
                  >输入数据超长已截断</span
                >
              </div>
              <div class="log-item" v-if="!genLog">
                <span class="log-label">状态</span>
                <span class="log-val" style="color: #409eff"
                  >流式返回中...</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：结果区（步骤 7） -->
        <div class="wf-right">
          <!-- 阶段指示条 -->
          <div class="phase-bar" v-if="gapStats || isGenerating || currentConv.generatedScript">
            <div
              class="phase-dot"
              :class="{ active: gapStats && !currentConv.generatedScript && !isGenerating, done: currentConv.generatedScript || isGenerating }"
            ></div>
            <span class="phase-label">去气口</span>
            <span class="phase-arrow">→</span>
            <div
              class="phase-dot"
              :class="{ active: isGenerating, done: currentConv.generatedScript }"
            ></div>
            <span class="phase-label">AI 处理</span>
            <span class="phase-arrow">→</span>
            <div
              class="phase-dot"
              :class="{ active: currentConv.generatedScript && reviewPhase === 'review', done: currentConv.generatedScript && reviewPhase === 'tuning' }"
            ></div>
            <span class="phase-label">审核</span>
            <span class="phase-arrow">→</span>
            <div
              class="phase-dot"
              :class="{ active: currentConv.generatedScript && reviewPhase === 'tuning' }"
            ></div>
            <span class="phase-label">微调 + 导出</span>
          </div>

          <!-- ===== 流式生成中 ===== -->
          <div
            v-if="isGenerating"
            class="wf-card result-card"
            style="
              flex: 1;
              display: flex;
              flex-direction: column;
              min-height: 0;
            "
          >
            <div class="card-title" style="flex-shrink: 0">
              步骤 7：AI 处理中...
            </div>
            <div
              class="script-text"
              style="flex: 1; overflow-y: auto; min-height: 0"
              v-html="renderScript(streamingScript || '等待返回...')"
            ></div>
          </div>

          <!-- ===== Phase 2: 微调阶段 ===== -->
          <div
            v-else-if="currentConv.generatedScript && reviewPhase === 'tuning'"
            class="wf-card result-card"
            style="
              flex: 1;
              display: flex;
              flex-direction: column;
              min-height: 0;
            "
          >
            <div
              class="card-title"
              style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
              "
            >
              <span>步骤 7：微调片段</span>
              <div style="display: flex; gap: 6px">
                <el-button size="small" text @click="reviewPhase = 'review'"
                  >&lt; 返回审核</el-button
                >
                <el-button
                  size="small"
                  type="primary"
                  @click="handleApply"
                  :disabled="selectedSubs.length === 0 || isGenerating"
                >
                  <el-icon><Check /></el-icon> 导出剪映
                </el-button>
              </div>
            </div>

            <!-- 主：朗读预览 -->
            <div
              v-if="matchedSubs.length > 0"
              class="script-text"
              style="flex: 1; overflow-y: auto; min-height: 0"
              v-html="renderScript(readableScript)"
            ></div>

            <!-- AI 分析（可折叠） -->
            <details
              v-if="currentConv.generatedScript"
              class="ai-analysis"
              style="flex-shrink: 0"
            >
              <summary
                style="
                  cursor: pointer;
                  font-size: 12px;
                  color: #909399;
                  padding: 4px 0;
                "
              >
                AI 筛选剔除 & 编排 & 节奏审查 & 时长
              </summary>
              <div
                v-html="renderScript(aiAnalysisOnly)"
                class="analysis-text"
              ></div>
            </details>

            <!-- 匹配信息 -->
            <div
              v-if="matchedSubs.length > 0"
              class="match-info"
              style="flex-shrink: 0"
            >
              <span
                >片段: {{ selectedSubs.length }} /
                {{ matchedSubs.length }} 个</span
              >
              <span>总时长: {{ store.formatTime(totalMatchDuration) }}</span>
            </div>

            <!-- 微调列表 -->
            <div
              v-if="matchedSubs.length > 0"
              class="tune-section"
              style="
                flex-shrink: 0;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                max-height: 180px;
              "
            >
              <div class="tune-header">
                <span>微调片段</span>
                <el-button
                  v-if="removedIndices.size > 0"
                  size="small"
                  text
                  type="primary"
                  @click="removedIndices.clear()"
                  >恢复全部</el-button
                >
              </div>
              <div class="tune-list">
                <div
                  v-for="(sub, idx) in matchedSubs"
                  :key="idx"
                  class="tune-item"
                  :class="{ removed: removedIndices.has(idx) }"
                  @click="toggleRemove(idx)"
                >
                  <span class="tune-idx">{{ idx + 1 }}.</span>
                  <span class="tune-video">{{ sub.videoName }}</span>
                  <span class="tune-time"
                    >{{ store.formatTimeMs(sub.startTime) }} -
                    {{ store.formatTimeMs(sub.endTime) }}</span
                  >
                  <span class="tune-text">{{ sub.text }}</span>
                  <el-button
                    size="small"
                    circle
                    text
                    type="danger"
                    @click.stop="toggleRemove(idx)"
                    :title="removedIndices.has(idx) ? '恢复' : '移除'"
                  >
                    <el-icon
                      ><Close v-if="removedIndices.has(idx)" /><Minus v-else
                    /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- ===== Phase 1: 方案审核阶段 ===== -->
          <div
            v-else-if="currentConv.generatedScript"
            class="wf-card result-card"
            style="
              flex: 1;
              display: flex;
              flex-direction: column;
              min-height: 0;
            "
          >
            <div
              class="card-title"
              style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
              "
            >
              <span>步骤 7：方案审核</span>
              <div style="display: flex; align-items: center; gap: 8px">
                <span
                  v-if="matchedSubs.length > 0"
                  style="font-size: 11px; color: #909399; font-weight: 400"
                >
                  匹配 {{ matchedSubs.length }} 段 ·
                  {{ store.formatTime(totalMatchDuration) }}
                </span>
                <el-button size="small" text type="warning" @click="handleRegenerateWithFeedback" :disabled="isGenerating">
                  🔄 基于反馈重新生成
                </el-button>
              </div>
            </div>

            <!-- 生成结果预览（可折叠） -->
            <details
              v-if="matchedSubs.length > 0"
              style="flex-shrink: 0; margin-bottom: 8px"
            >
              <summary
                style="
                  cursor: pointer;
                  font-size: 12px;
                  color: #409eff;
                  padding: 4px 0;
                "
              >
                📋 查看生成文案
              </summary>
              <div
                class="script-text"
                style="max-height: 200px; overflow-y: auto; margin-top: 4px"
                v-html="renderScript(readableScript)"
              ></div>
            </details>

            <!-- AI 分析（可折叠） -->
            <details
              v-if="currentConv.generatedScript"
              class="ai-analysis"
              style="flex-shrink: 0; margin-bottom: 8px"
            >
              <summary
                style="
                  cursor: pointer;
                  font-size: 12px;
                  color: #909399;
                  padding: 4px 0;
                "
              >
                📊 AI 筛选 & 编排分析
              </summary>
              <div
                v-html="renderScript(aiAnalysisOnly)"
                class="analysis-text"
              ></div>
            </details>

            <!-- 质量评分：紧凑卡片（七维 + 五逻辑合并） -->
            <div
              v-if="sevenDimScores"
              class="quality-compact"
              style="flex-shrink: 0; margin-bottom: 8px"
            >
              <div class="qc-header">
                <span class="qc-score-badge" :style="{ background: compositeColor }">
                  {{ calcCompositeScore(sevenDimScores) }}
                </span>
                <span class="qc-label">综合分</span>
                <span v-if="qcRetries > 0" class="qc-retry">经 {{ qcRetries }} 次优化</span>
                <span class="qc-toggle" @click="showSevenDim = !showSevenDim" :class="{ active: showSevenDim }">
                  七维 {{ showSevenDim ? '▴' : '▾' }}
                </span>
                <span v-if="currentConv.fiveLogic" class="qc-toggle" @click="showFiveLogic = !showFiveLogic" :class="{ active: showFiveLogic }">
                  五逻辑 {{ showFiveLogic ? '▴' : '▾' }}
                </span>
                <span class="qc-toggle" style="color: #67c23a; margin-left: auto; cursor: pointer" @click="handleRegenerateWithFeedback">🔄</span>
              </div>

              <!-- 七维评分（可折叠） -->
              <div v-show="showSevenDim" class="qc-body">
                <div class="qc-grid">
                  <div v-for="dim in SCORING_DIMENSION_CONFIG" :key="dim.key" class="qc-dim">
                    <span class="qc-dim-dot" :style="{ background: dim.color }"></span>
                    <span class="qc-dim-name">{{ dim.label }}</span>
                    <span class="qc-dim-val" :style="{ color: dim.color }">{{ sevenDimScores[dim.key] }}</span>
                  </div>
                </div>
              </div>

              <!-- 五逻辑（可折叠） -->
              <div v-if="currentConv.fiveLogic && showFiveLogic" class="qc-body qc-body--logic">
                <div class="qc-logic-row">
                  <span v-for="(score, key) in currentConv.fiveLogic.scores" :key="key" class="qc-logic-item">
                    <span class="qc-logic-dot" :style="{ background: score >= 80 ? '#16a34a' : score >= 65 ? '#e6a23c' : '#f56c6c' }"></span>
                    <span class="qc-logic-name">{{
                      key === 'traffic' ? '流量' : key === 'platform' ? '平台' :
                      key === 'user' ? '用户' : key === 'business' ? '商业' : '传播'
                    }}</span>
                    <span class="qc-logic-val">{{ score }}</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- 对话区 -->
            <div
              class="review-chat"
              style="
                flex: 1;
                overflow-y: auto;
                min-height: 0;
                border-top: 1px solid #ebeef5;
                padding-top: 8px;
              "
            >
              <!-- 第一条系统消息：发送给 AI 的完整输入 -->
              <div v-if="sentPrompt" class="review-msg review-msg--system">
                <details>
                  <summary
                    class="review-msg-label"
                    style="cursor: pointer; display: inline"
                  >
                    📋 AI 收到的完整输入
                  </summary>
                  <div
                    class="review-msg-text"
                    style="margin-top: 6px"
                    v-html="renderScript(sentPrompt)"
                  ></div>
                </details>
              </div>

              <!-- 初始提示（有系统消息但无用户消息时也显示） -->
              <div v-if="reviewMessages.length === 0" class="review-hint">
                <p>方案已生成。你可以与 AI 讨论：</p>
                <ul>
                  <li>"为什么选了 #3 而不是 #8？"</li>
                  <li>"前三秒的钩子分够不够高？"</li>
                  <li>"中间节奏太密集，能不能分散？"</li>
                </ul>
              </div>

              <!-- 对话消息 -->
              <div
                v-for="(msg, i) in reviewMessages"
                :key="i"
                class="review-msg"
                :class="'review-msg--' + msg.role"
              >
                <div class="review-msg-label">
                  {{ msg.role === "user" ? "你" : "AI" }}
                </div>
                <div
                  class="review-msg-text"
                  v-html="renderScript(msg.text)"
                ></div>
              </div>

              <!-- AI 正在回复... -->
              <div v-if="reviewSending" class="review-msg review-msg--ai">
                <div class="review-msg-label">AI</div>
                <div class="review-msg-text" style="color: #909399">
                  思考中...
                </div>
              </div>
            </div>

            <!-- 输入区 -->
            <div
              class="review-input-area"
              style="
                flex-shrink: 0;
                display: flex;
                gap: 8px;
                align-items: flex-end;
                margin-top: 8px;
              "
            >
              <el-input
                v-model="reviewInput"
                type="textarea"
                :rows="1"
                placeholder="询问 AI 处理逻辑..."
                resize="none"
                @keydown.enter.exact.prevent="sendReviewMessage"
                :disabled="reviewSending"
                style="flex: 1"
              />
              <el-button
                size="small"
                type="primary"
                @click="sendReviewMessage"
                :loading="reviewSending"
                :disabled="!reviewInput.trim()"
                >发送</el-button
              >
            </div>

            <!-- 确认按钮 -->
            <div style="flex-shrink: 0; margin-top: 10px; text-align: center">
              <el-button
                type="success"
                size="small"
                @click="confirmScheme"
                :disabled="matchedSubs.length === 0"
              >
                <el-icon><Check /></el-icon> 确认方案，进入微调
              </el-button>
            </div>
          </div>

          <!-- 气口处理结果预览（算完气口后、AI 处理前展示） -->
          <div
            v-else-if="gapStats && compactedSubtitles.length > 0"
            class="wf-card result-card"
            style="
              flex: 1;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            "
          >
            <div
              class="card-title"
              style="
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
              "
            >
              <span>步骤 7：气口处理结果</span>
              <div style="display: flex; align-items: center; gap: 8px">
                <span style="font-size: 11px; color: #909399; font-weight: 400">
                  原始 {{ store.formatTime(gapStats.originalDurationSec) }}
                  <span style="color: #67c23a; margin: 0 4px">→</span>
                  压缩 {{ store.formatTime(gapStats.compactDurationSec) }}
                </span>
                <el-button
                  size="small"
                  text
                  :type="subtitleViewMode === 'strip' ? 'primary' : ''"
                  @click="subtitleViewMode = 'strip'"
                  >字幕条</el-button
                >
                <el-button
                  size="small"
                  text
                  :type="subtitleViewMode === 'list' ? 'primary' : ''"
                  @click="subtitleViewMode = 'list'"
                  >列表</el-button
                >
              </div>
            </div>

            <!-- 字幕条视图 -->
            <div
              v-if="subtitleViewMode === 'strip'"
              class="subtitle-strip-view"
              style="flex: 1; overflow-y: auto; min-height: 0"
            >
              <div
                v-if="stripVideos.length === 0"
                style="
                  padding: 20px;
                  text-align: center;
                  color: #909399;
                  font-size: 12px;
                "
              >
                暂无字幕条数据
              </div>
              <div v-for="(video, vi) in stripVideos" :key="video.id">
                <div
                  class="strip-video-label"
                  :style="{ '--label-color': video.color }"
                >
                  {{ video.name }}
                </div>
                <div
                  class="strip-track"
                  :style="{
                    height:
                      (video.rows.length > 0
                        ? Math.max(...video.rows.map((r) => r.endRow))
                        : 1) *
                        28 +
                      8 +
                      'px',
                  }"
                >
                  <div
                    v-for="seg in video.segments"
                    :key="seg.i"
                    class="strip-seg"
                    :style="{
                      left: seg.leftPct + '%',
                      width: seg.widthPct + '%',
                      top: (seg.row - 1) * 28 + 'px',
                      backgroundColor: video.color,
                    }"
                    :title="`#${seg.i + 1} ${store.formatTimeMs(seg.compactStartMs)}-${store.formatTimeMs(seg.compactEndMs)}\n${seg.text}`"
                  >
                    <span v-if="seg.widthPct > 1" class="strip-seg-text">{{
                      seg.text.slice(0, 12)
                    }}</span>
                  </div>
                </div>
              </div>
              <!-- 时间轴刻度 -->
              <div class="strip-ruler">
                <template v-for="tick in stripTimeTicks" :key="tick.label">
                  <span class="strip-tick" :style="{ left: tick.pct + '%' }">{{
                    tick.label
                  }}</span>
                </template>
              </div>
            </div>

            <!-- 列表视图 -->
            <div
              v-else
              class="compact-preview"
              style="flex: 1; overflow-y: auto; min-height: 0; padding: 8px 0"
            >
              <template v-for="(seg, i) in compactPreviewGrouped" :key="i">
                <div v-if="seg.videoLabel" class="compact-video-label">
                  {{ seg.videoLabel }}
                </div>
                <div class="compact-item">
                  <span class="compact-idx">#{{ i + 1 }}</span>
                  <span class="compact-time"
                    >{{ store.formatTimeMs(seg.compactStartMs) }}-{{
                      store.formatTimeMs(seg.compactEndMs)
                    }}</span
                  >
                  <span class="compact-text">{{ seg.text }}</span>
                </div>
              </template>
            </div>
          </div>

          <div
            v-else
            class="wf-card result-card"
            style="
              flex: 1;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            "
          >
            <div class="card-title" style="flex-shrink: 0">
              步骤 7：文案展示与微调
            </div>
            <div class="wf-empty" style="flex: 1; justify-content: center">
              <el-icon :size="28" style="color: #c0c4cc"><Document /></el-icon>
              <template v-if="selectedSourceIds.size === 0">
                <span style="color: #909399">👈 请先在左侧「步骤 1」选择数据源</span>
              </template>
              <template v-else-if="!currentConv.topic.trim()">
                <span style="color: #909399">👈 请先在左侧「步骤 2」填写文案方向</span>
              </template>
              <template v-else-if="!gapStats">
                <span style="color: #909399">👈 请先在左侧「步骤 4」计算时长与气口</span>
              </template>
              <template v-else>
                <span style="color: #909399">👈 请点击左侧「步骤 6」开始 AI 处理</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Delete } from "@element-plus/icons-vue";
import { useChatStore } from "@/stores/chat";
import { useCreatorModeStore } from "@/stores/creatorMode";
import { exportJianyingProject, buildProject } from "@/services/jianying";
import { buildModelRequestBody } from "@/services/deepseek";
import type { SubtitleSegment } from "@/services/asr";
import {
  type Platform,
  type TextEvaluation,
  type FiveLogicReport,
  type ScoringDimensions,
  type PersonaEval,
  type ValueEval,
  SCORING_DIMENSION_CONFIG,
  PLATFORM_SCORING_GUIDE,
  calcCompositeScore,
  defaultScores,
  mapToFiveLogic,
} from "@/services/scriptEvaluator";

const chatStore = useChatStore();
const store = useCreatorModeStore();

// ===== 数据源（基于磁盘缓存） =====
const scanning = ref(false);
const computingGap = ref(false);
interface GapStats {
  totalSegments: number;
  totalGaps: number;
  removableGaps: number;
  savedMs: number;
  originalDurationSec: number;
  compactDurationSec: number;
  wordGaps: number;
  removableWordGaps: number;
  segGaps: number;
  removableSegGaps: number;
}
const gapStats = ref<GapStats | null>(null);

/** 去气口后的压缩字幕（仅时间轴压缩，text 不变），供 AI 使用 */
interface CompactedSub {
  videoId: string;
  originalStartMs: number;
  originalEndMs: number;
  compactStartMs: number;
  compactEndMs: number;
  text: string;
}
const compactedSubtitles = ref<CompactedSub[]>([]);

/** 选中视频的帧率列表 */
const selectedSourcesFps = computed(() => {
  const selected = sourceList.value.filter((s) =>
    selectedSourceIds.value.has(s.id),
  );
  return selected.map((s) => `${s.fps || DEFAULT_FPS}fps`);
});

/** 句子间隔的毫秒显示（用最高帧率计算最保守值） */
const gapThresholdMsDisplay = computed(() => {
  const fpsList = sourceList.value
    .filter((s) => selectedSourceIds.value.has(s.id))
    .map((s) => s.fps || DEFAULT_FPS);
  const maxFps = fpsList.length > 0 ? Math.max(...fpsList) : DEFAULT_FPS;
  const ms = currentConv.value.frameGap * frameMs(maxFps);
  return Math.round(ms) + "ms";
});

/** 右侧面板预览：将单词级压缩数据按原字幕分组合并 */
interface CompactPreviewItem {
  compactStartMs: number;
  compactEndMs: number;
  text: string;
  videoLabel?: string;
}
const compactPreviewGrouped = computed<CompactPreviewItem[]>(() => {
  const result: CompactPreviewItem[] = [];
  let cur: CompactPreviewItem | null = null;
  let lastVideoId = "";
  for (const c of compactedSubtitles.value) {
    const isNewSegment =
      !cur ||
      c.originalStartMs !== (result[result.length - 1] as any)?._segStart;
    const isNewVideo = c.videoId !== lastVideoId;

    if (isNewSegment) {
      if (isNewVideo && result.length > 0) {
        // 视频切换时加分隔
        lastVideoId = c.videoId;
      } else if (isNewVideo) {
        lastVideoId = c.videoId;
      }
      cur = {
        compactStartMs: c.compactStartMs,
        compactEndMs: c.compactEndMs,
        text: c.text,
      };
      if (isNewVideo) {
        const src = sourceList.value.find((s) => s.id === c.videoId);
        cur.videoLabel = src?.name || c.videoId;
      }
      (cur as any)._segStart = c.originalStartMs;
      result.push(cur);
    } else {
      cur.compactEndMs = c.compactEndMs;
      cur.text += c.text;
    }
  }
  return result;
});

// AI 阶段进度
const aiStages = [
  "阶段 1：去重优化 + AI建议时长",
  "阶段 2：文案挑选 + 七维评分质检",
  "阶段 3：网感编排 + 衔接优化",
];
const currentAiStage = ref(0);

interface SubtitleSource {
  id: string;
  name: string;
  subtitles: SubtitleSegment[];
  subtitleCount: number;
  fps: number; // 视频帧率（0 表示未知，回退到 30fps）
}

const sourceList = ref<SubtitleSource[]>([]);
const selectedSourceIds = ref<Set<string>>(new Set());

// ===== 匹配片段 & 微调 =====
interface SubtitleEntry {
  videoId: string;
  videoName: string;
  videoPath: string;
  startTime: number; // ms
  endTime: number; // ms
  text: string;
}

const matchedSubs = ref<SubtitleEntry[]>([]);
const removedIndices = ref(new Set<number>());
/** 生成时 buildSourceContent 返回的原始条目列表（保留 #N 编号映射，供审核对话查找） */
const sourceEntries = ref<SubtitleEntry[]>([]);

const selectedSubs = computed(() =>
  matchedSubs.value.filter((_, i) => !removedIndices.value.has(i)),
);

const totalMatchDuration = computed(
  () =>
    selectedSubs.value.reduce((sum, s) => sum + (s.endTime - s.startTime), 0) /
    1000,
);

/** 可读脚本：将选中字幕拼接成连续朗读稿 */
const readableScript = computed(() => {
  if (matchedSubs.value.length === 0) return "";
  const entries = selectedSubs.value;
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const s = entries[i];
    const timeStr =
      store.formatTimeMs(s.startTime) + " → " + store.formatTimeMs(s.endTime);
    const dur = Math.round((s.endTime - s.startTime) / 1000);
    lines.push(`## ${s.videoName}  ${timeStr}  (${dur}秒)\n${s.text}\n`);
  }
  return lines.join("\n");
});

/** 仅提取 AI 输出的分析部分（去重日志 + 网感编排） */
const aiAnalysisOnly = computed(() => {
  const conv = currentConv.value;
  if (!conv?.generatedScript) return "";
  // 保留 第一阶段（去重优化）和 第三阶段（网感编排），去掉 第二阶段（时间轴文案）
  let text = conv.generatedScript.replace(
    /\n?##\s*第二阶段[：:]\s*时间轴文案\s*\n[\s\S]*?(?=\n##\s*第三阶段|$)/i,
    "",
  );
  // 兼容旧格式
  text = text.replace(
    /\n?##\s*选择清单\s*\n[\s\S]*?(?=\n##\s*筛选剔除|$)/i,
    "",
  );
  return text.trim();
});

function toggleRemove(idx: number) {
  const s = new Set(removedIndices.value);
  if (s.has(idx)) s.delete(idx);
  else s.add(idx);
  removedIndices.value = s;
}

const hasStoragePath = computed(() => !!store.storagePath);

/** 扫描存储目录中的 .subtitles.json 文件，并与 importedVideos 交叉比对 */
async function scanDiskSubtitles() {
  const api = (window as any).electronAPI;
  if (!api?.listDirectory || !store.storagePath) {
    sourceList.value = [];
    return;
  }

  scanning.value = true;
  const results: SubtitleSource[] = [];

  try {
    // 递归收集所有 .subtitles.json 文件
    async function listRecursive(
      dirPath: string,
    ): Promise<Array<{ path: string; name: string }>> {
      const out: Array<{ path: string; name: string }> = [];
      try {
        const entries = await api.listDirectory(dirPath);
        for (const e of entries) {
          if (e.isFile && e.name.endsWith(".subtitles.json")) {
            out.push({ path: e.path, name: e.name });
          } else if (e.isDirectory) {
            const sub = await listRecursive(e.path);
            out.push(...sub);
          }
        }
      } catch {}
      return out;
    }

    const diskFiles = await listRecursive(store.storagePath);

    // 交叉比对：importedVideos vs 磁盘文件
    for (const v of store.importedVideos) {
      if (v.asrStatus !== "done" || v.subtitles.length === 0) continue;
      const videoBaseName = v.name.replace(/\.\w+$/, "");
      const diskMatch = diskFiles.find(
        (df) =>
          df.name.replace(".subtitles.json", "") === videoBaseName ||
          (v.path &&
            df.name.replace(".subtitles.json", "") ===
              v.path
                .split(/[\\/]/)
                .pop()
                ?.replace(/\.\w+$/, "")),
      );
      if (diskMatch) {
        results.push({
          id: v.id,
          name: v.name,
          subtitles: [...v.subtitles],
          subtitleCount: v.subtitles.length,
          fps: v.fps || 0,
        });
      }
    }

    // 磁盘中有但 importedVideos 中没有的（纯磁盘字幕文件）
    for (const df of diskFiles) {
      const diskBaseName = df.name.replace(".subtitles.json", "");
      const alreadyIncluded = results.some(
        (r) => r.name.replace(/\.\w+$/, "") === diskBaseName,
      );
      if (!alreadyIncluded) {
        let subs: SubtitleSegment[] = [];
        let cachedFps = 0;
        try {
          const content = await api.readFile(df.path);
          const data = JSON.parse(content);
          subs = Array.isArray(data.subtitles) ? data.subtitles : [];
          cachedFps = data._meta?.fps || subs[0]?.fps || 0;
        } catch {}
        if (subs.length > 0) {
          results.push({
            id: "disk_" + diskBaseName,
            name: diskBaseName,
            subtitles: subs,
            subtitleCount: subs.length,
            fps: cachedFps,
          });
        }
      }
    }
  } catch {}

  sourceList.value = results;
  // 默认全选
  if (results.length > 0 && selectedSourceIds.value.size === 0) {
    selectedSourceIds.value = new Set(results.map((r) => r.id));
  }
  // 清理已不存在的 id
  const validIds = new Set(results.map((r) => r.id));
  for (const id of selectedSourceIds.value) {
    if (!validIds.has(id)) selectedSourceIds.value.delete(id);
  }
  scanning.value = false;
}

async function refreshSources() {
  await scanDiskSubtitles();
  ElMessage.success(`扫描完成，共 ${sourceList.value.length} 个可用字幕源`);
}

function toggleSource(id: string) {
  const newSet = new Set(selectedSourceIds.value);
  if (newSet.has(id)) newSet.delete(id);
  else newSet.add(id);
  selectedSourceIds.value = newSet;
}

function selectAllSources() {
  selectedSourceIds.value = new Set(sourceList.value.map((s) => s.id));
}

function deselectAllSources() {
  selectedSourceIds.value = new Set();
}

// 监听存储路径变化
watch(
  () => store.storagePath,
  () => {
    if (store.storagePath) {
      scanDiskSubtitles();
      loadConversations(); // 切换工作目录时重新加载对话列表
      loadSavedSettings();
    }
  },
);

// ===== 对话管理 =====
/** 基于存储路径的对话隔离 key */
function convStorageKey(): string {
  const base = store.storagePath || "default";
  // 将路径中的特殊字符替换为下划线，避免 localStorage key 非法
  const sanitized = base.replace(/[\\/:*?"<>|.]/g, "_");
  return "workflow-conversations-" + sanitized;
}

interface Conversation {
  id: string;
  title: string;
  topic: string;
  referenceCopies: string[];
  speakerPersona: string;
  audiencePersona: string;
  durationRequirement: string;
  frameGap: number;
  generatedScript: string;
  createdAt: number;
  updatedAt: number;
  // 步骤2 新增：质量标准 + 创作者画像 + 平台
  qualityStandard: string;
  creatorAge: number;
  creatorTrack: string;
  creatorGender: 'male' | 'female' | '';
  targetPlatform: Platform | '';
  // 步骤6：生成方案模式（精剪/效果优先）
  schemeMode: 'precise' | 'effect';
  // 步骤6a：AI 建议时长
  suggestedDuration: string;
  // 步骤6b/7：七维评分 + 五层评测
  evaluation?: TextEvaluation;
  fiveLogic?: FiveLogicReport;
}

/** 保存的设置项（用于快速加载） */
interface SavedSettings {
  name: string;
  qualityStandard: string;
  creatorAge: number;
  creatorTrack: string;
  creatorGender: 'male' | 'female' | '';
  targetPlatform: Platform | '';
  schemeMode: 'precise' | 'effect';
  createdAt: number;
}

const conversations = ref<Conversation[]>([]);
const activeConvId = ref("");
const sidebarCollapsed = ref(false);
const saveSettingsName = ref("");

function loadConversations() {
  try {
    const raw = localStorage.getItem(convStorageKey());
    if (raw) conversations.value = JSON.parse(raw);
  } catch {
    conversations.value = [];
  }
}

function saveConversations() {
  localStorage.setItem(convStorageKey(), JSON.stringify(conversations.value));
}

// ===== 保存的设置管理 =====
const savedSettings = ref<SavedSettings[]>([]);

function settingsStorageKey(): string {
  return convStorageKey() + "-profiles";
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(settingsStorageKey());
    if (raw) savedSettings.value = JSON.parse(raw);
  } catch {
    savedSettings.value = [];
  }
}

function saveCurrentSettings(name: string) {
  const conv = currentConv.value;
  if (!name.trim()) {
    ElMessage.warning("请输入设置名称");
    return;
  }
  const existing = savedSettings.value.findIndex(s => s.name === name);
  const entry: SavedSettings = {
    name,
    qualityStandard: conv.qualityStandard,
    creatorAge: conv.creatorAge,
    creatorTrack: conv.creatorTrack,
    creatorGender: conv.creatorGender,
    targetPlatform: conv.targetPlatform,
    schemeMode: conv.schemeMode,
    createdAt: Date.now(),
  };
  if (existing >= 0) {
    savedSettings.value[existing] = entry;
    ElMessage.success(`已更新设置「${name}」`);
  } else {
    savedSettings.value.push(entry);
    ElMessage.success(`已保存设置「${name}」`);
  }
  localStorage.setItem(settingsStorageKey(), JSON.stringify(savedSettings.value));
}

function deleteSavedSetting(name: string) {
  savedSettings.value = savedSettings.value.filter(s => s.name !== name);
  localStorage.setItem(settingsStorageKey(), JSON.stringify(savedSettings.value));
  ElMessage.success(`已删除设置「${name}」`);
}

function applySavedSetting(name: string) {
  const entry = savedSettings.value.find(s => s.name === name);
  if (!entry) return;
  const conv = currentConv.value;
  conv.qualityStandard = entry.qualityStandard;
  conv.creatorAge = entry.creatorAge;
  conv.creatorTrack = entry.creatorTrack;
  conv.creatorGender = entry.creatorGender;
  conv.targetPlatform = entry.targetPlatform;
  conv.schemeMode = entry.schemeMode;
  ElMessage.success(`已加载设置「${name}」`);
}

function emptyConv(): Conversation {
  return {
    id: "",
    title: "",
    topic: "",
    referenceCopies: [],
    speakerPersona: "",
    audiencePersona: "",
    durationRequirement: "",
    frameGap: 5,
    generatedScript: "",
    createdAt: 0,
    updatedAt: 0,
    qualityStandard: "",
    creatorAge: 30,
    creatorTrack: "",
    creatorGender: "",
    targetPlatform: "",
    schemeMode: "effect",
    suggestedDuration: "",
  };
}

// 持久化的后备对象，避免 v-model 写入临时对象
const fallbackConv = ref<Conversation>(emptyConv());

const currentConv = computed(
  () =>
    conversations.value.find((c) => c.id === activeConvId.value) ||
    conversations.value[0] ||
    fallbackConv.value,
);

// ===== 参数变更自动失效 =====
/** 使气口计算结果及下游生成结果失效 */
function invalidateGapState(reason: string) {
  if (!gapStats.value && compactedSubtitles.value.length === 0) return;
  gapStats.value = null;
  compactedSubtitles.value = [];
  // 下游结果基于旧输入，一并重置
  if (currentConv.value.generatedScript) {
    currentConv.value.generatedScript = "";
  }
  matchedSubs.value = [];
  removedIndices.value = new Set();
  sourceEntries.value = [];
  sentPrompt.value = "";
  reviewMessages.value = [];
  reviewPhase.value = "review";
  ElMessage.warning(`参数已变更：${reason}，请重新计算气口`);
}

// 监听句子间隔变化
watch(
  () => currentConv.value?.frameGap,
  (newVal, oldVal) => {
    if (oldVal !== undefined && newVal !== oldVal && gapStats.value) {
      invalidateGapState("句子间隔已调整");
    }
  },
);

// 监听数据源选择变化
watch(
  () => selectedSourceIds.value.size,
  (newVal, oldVal) => {
    if (oldVal !== undefined && newVal !== oldVal && gapStats.value) {
      invalidateGapState("数据源选择已变更");
    }
  },
);

function newConversation() {
  const id = "wf_" + Date.now();
  const conv: Conversation = {
    id,
    title: "新建对话",
    topic: "",
    referenceCopies: [],
    speakerPersona: "",
    audiencePersona: "",
    durationRequirement: "",
    frameGap: 5,
    generatedScript: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    qualityStandard: "",
    creatorAge: 30,
    creatorTrack: "",
    creatorGender: "",
    targetPlatform: "",
    schemeMode: "effect",
    suggestedDuration: "",
  };
  conversations.value.unshift(conv);
  activeConvId.value = id;

  // 重置所有会话级 UI 状态
  gapStats.value = null;
  compactedSubtitles.value = [];
  matchedSubs.value = [];
  removedIndices.value = new Set();
  sourceEntries.value = [];
  isGenerating.value = false;
  streamingScript.value = "";
  genLog.value = null;
  sentPrompt.value = "";
  reviewMessages.value = [];
  reviewPhase.value = "review";
  computingGap.value = false;
  currentAiStage.value = 0;

  saveConversations();
}

function switchConversation(id: string) {
  activeConvId.value = id;
}

function deleteConversation(id: string) {
  ElMessageBox.confirm("确定删除此对话？", "确认", { type: "warning" })
    .then(() => {
      conversations.value = conversations.value.filter((c) => c.id !== id);
      if (activeConvId.value === id) {
        activeConvId.value = conversations.value[0]?.id || "";
      }
      saveConversations();
      ElMessage.success("已删除");
    })
    .catch(() => {});
}

function formatConvTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

// 自动更新对话标题
watch(
  () => currentConv.value?.topic,
  (val) => {
    const conv = conversations.value.find((c) => c.id === activeConvId.value);
    if (conv && val) {
      const title = val.split("\n")[0].trim().slice(0, 20);
      if (title && conv.title === "新建对话") {
        conv.title = title;
        saveConversations();
      }
    }
  },
);

function onConvDirty() {
  saveConversations();
}

function addReferenceCopy() {
  const conv = currentConv.value;
  if (conv) {
    if (!Array.isArray(conv.referenceCopies)) conv.referenceCopies = [];
    conv.referenceCopies.push("");
    saveConversations();
  }
}

function removeReferenceCopy(idx: number) {
  const conv = currentConv.value;
  if (conv && Array.isArray(conv.referenceCopies)) {
    conv.referenceCopies.splice(idx, 1);
    saveConversations();
  }
}

function updateReferenceCopy(idx: number, value: string) {
  const conv = currentConv.value;
  if (conv && Array.isArray(conv.referenceCopies)) {
    conv.referenceCopies[idx] = value;
    saveConversations();
  }
}

// ===== 生成逻辑 =====
const selectedModelId = ref<string>("");
const isGenerating = ref(false);
const statusText = ref("");
const streamingScript = ref("");
const showGenLog = ref(false);
const genLog = ref<null | {
  promptTokens: number;
  completionTokens: number;
  charsOut: number;
  truncated: boolean;
}>(null);

const reviewPhase = ref<"review" | "tuning">("review"); // 方案审核 → 微调

// ===== 方案审核对话 =====

/** 构建发送给 AI 的输入预览 */
function buildReviewPromptPreview(sourceContent: string, conv: Conversation) {
  const parts: string[] = [];
  parts.push("## 发送给 AI 的完整输入\n");

  // 用户设定
  parts.push("### 用户设定");
  if (conv.topic) parts.push(`- 文案方向：${conv.topic}`);
  if (conv.speakerPersona) parts.push(`- 人设画像：${conv.speakerPersona}`);
  if (conv.audiencePersona) parts.push(`- 人群画像：${conv.audiencePersona}`);
  if (conv.durationRequirement)
    parts.push(`- 时长要求：${conv.durationRequirement}`);
  if (conv.referenceCopies.length > 0) {
    parts.push(`- 参考文案：${conv.referenceCopies.length} 条`);
    conv.referenceCopies.forEach((rc, i) => {
      parts.push(
        `  ${i + 1}. ${rc.slice(0, 120)}${rc.length > 120 ? "..." : ""}`,
      );
    });
  }
  parts.push("");

  // 字幕库概览
  const lines = sourceContent.split("\n");
  const subtitleCount = lines.filter((l) => /^#\d+/.test(l)).length;
  parts.push("### 字幕库（去气口后）");
  parts.push(`共 ${subtitleCount} 条字幕，AI 从中挑选符合七维评分标准的内容。`);
  parts.push("");

  // AI 系统指令概要
  parts.push("### AI 处理流程");
  parts.push("第一阶段：去重优化 → 第二阶段：时间轴文案 → 第三阶段：网感编排");
  parts.push(
    "评分维度：开场钩子 | 沉浸共鸣 | 干货密度 | 节奏掌控 | 人设差异 | 传播共鸣 | 可信背书",
  );

  return parts.join("\n");
}
interface ReviewMessage {
  role: "user" | "ai";
  text: string;
  time: number;
}
const reviewMessages = ref<ReviewMessage[]>([]);
const reviewInput = ref("");
const reviewSending = ref(false);
const sentPrompt = ref(""); // 发送给 AI 的完整 Prompt（用于审核对话首条消息）
const subtitleViewMode = ref<"strip" | "list">("strip"); // 气口结果视图：字幕条 / 列表

/** 视频调色板 */
const STRIP_COLORS = [
  "#409eff",
  "#67c23a",
  "#e6a23c",
  "#f56c6c",
  "#909399",
  "#8e44ad",
  "#1abc9c",
  "#e74c3c",
];

/** 字幕条视图：分组后的视频数据 */
interface StripSegment {
  i: number;
  compactStartMs: number;
  compactEndMs: number;
  text: string;
  leftPct: number;
  widthPct: number;
  row: number;
}
interface StripVideo {
  id: string;
  name: string;
  color: string;
  segments: StripSegment[];
  rows: { startMs: number; endMs: number; endRow: number }[]; // 行占用记录（防重叠算法）
}
const stripVideos = computed<StripVideo[]>(() => {
  const segments = compactPreviewGrouped.value;
  if (segments.length === 0) return [];

  const totalMs = segments[segments.length - 1].compactEndMs;
  if (totalMs <= 0) return [];

  // 按 videoLabel 分组
  const groupMap = new Map<string, { label: string; segs: typeof segments }>();
  let currentLabel = "";
  for (const seg of segments) {
    if (seg.videoLabel) {
      currentLabel = seg.videoLabel;
    }
    if (!groupMap.has(currentLabel)) {
      groupMap.set(currentLabel, { label: currentLabel, segs: [] });
    }
    groupMap.get(currentLabel)!.segs.push(seg);
  }

  const result: StripVideo[] = [];
  let colorIdx = 0;
  for (const [, group] of groupMap) {
    const videoId =
      sourceList.value.find((s) => s.name === group.label)?.id || group.label;
    const color = STRIP_COLORS[colorIdx % STRIP_COLORS.length];
    colorIdx++;

    // 防重叠行布局
    const rows: { startMs: number; endMs: number; endRow: number }[] = [];
    const stripSegs: StripSegment[] = [];
    for (const [idx, seg] of group.segs.entries()) {
      const leftPct = (seg.compactStartMs / totalMs) * 100;
      const widthPct = Math.max(
        0.3,
        ((seg.compactEndMs - seg.compactStartMs) / totalMs) * 100,
      );

      // 找到第一个没有重叠的行
      let row = 1;
      for (const r of rows) {
        if (seg.compactStartMs >= r.endMs || seg.compactEndMs <= r.startMs) {
          continue;
        }
        row = Math.max(row, r.endRow + 1);
      }
      // 检查之前放在这一行的是否重叠
      const sameRowSegs = stripSegs.filter((s) => s.row === row);
      for (const s of sameRowSegs) {
        const sStart = (s.leftPct / 100) * totalMs;
        const sEnd = ((s.leftPct + s.widthPct) / 100) * totalMs;
        if (!(seg.compactEndMs <= sStart || seg.compactStartMs >= sEnd)) {
          row++;
          break;
        }
      }

      rows.push({
        startMs: seg.compactStartMs,
        endMs: seg.compactEndMs,
        endRow: row,
      });
      stripSegs.push({ ...seg, leftPct, widthPct, row, i: idx });
    }

    result.push({
      id: videoId,
      name: group.label,
      color,
      segments: stripSegs,
      rows,
    });
  }
  return result;
});

/** 时间轴刻度 */
const stripTimeTicks = computed(() => {
  const segments = compactPreviewGrouped.value;
  if (segments.length === 0) return [];

  const totalMs = segments[segments.length - 1].compactEndMs;
  const totalSec = totalMs / 1000;

  // 选择合适的步长
  let stepSec: number;
  if (totalSec <= 10) stepSec = 1;
  else if (totalSec <= 30) stepSec = 2;
  else if (totalSec <= 60) stepSec = 5;
  else if (totalSec <= 180) stepSec = 15;
  else if (totalSec <= 600) stepSec = 30;
  else stepSec = 60;

  const ticks: { label: string; pct: number }[] = [];
  for (let s = 0; s <= totalSec; s += stepSec) {
    ticks.push({
      label: store.formatTime(s),
      pct: (s / totalSec) * 100,
    });
  }
  // 最后一个刻度
  const lastPct = 100;
  if (ticks.length === 0 || ticks[ticks.length - 1].pct < 98) {
    ticks.push({ label: store.formatTime(totalSec), pct: lastPct });
  }
  return ticks;
});

const selectedModel = computed(() => {
  if (selectedModelId.value) {
    return chatStore.models.find((m) => m.id === selectedModelId.value) || null;
  }
  return (
    chatStore.models.find((m) => m.isDefault) || chatStore.models[0] || null
  );
});

// ===== 步骤 5：计算时长 / 去气口 =====
const DEFAULT_FPS = 30; // 未知帧率时的回退值

/** 根据视频帧率计算每帧毫秒数 */
function frameMs(fps: number): number {
  return 1000 / (fps > 0 ? fps : DEFAULT_FPS);
}

/** 单词级时间轴项（用于字间气口压缩） */
interface WordTimeline {
  text: string;
  startMs: number;
  endMs: number;
  /** 属于哪条字幕（用于 entries 的回溯匹配） */
  segmentStartMs: number;
  segmentEndMs: number;
}

function computeGaps(skipConfirm = false) {
  const selectedSources = sourceList.value.filter((s) =>
    selectedSourceIds.value.has(s.id),
  );
  if (selectedSources.length === 0) {
    if (sourceList.value.length === 0) {
      ElMessage.warning("未找到字幕数据源，请先点击步骤 1「扫描目录」");
    } else {
      ElMessage.warning("请先在步骤 1 中勾选要处理的视频");
    }
    return;
  }

  // 检查是否有字幕数据
  const sourcesWithSubs = selectedSources.filter((s) => s.subtitles.length > 0);
  if (sourcesWithSubs.length === 0) {
    ElMessage.warning("所选视频没有字幕数据，请先对视频进行语音识别");
    return;
  }

  // 如果已有生成结果，提示用户（非阻塞，确保计算始终执行）
  if (!skipConfirm && currentConv.value.generatedScript) {
    ElMessage.info("检测到之前的生成结果，已自动清除并重新计算气口");
  }

  doComputeGaps(sourcesWithSubs);
}

/** 实际气口计算逻辑 */
function doComputeGaps(sourcesWithSubs: SubtitleSource[]) {
  computingGap.value = true;
  // 重置旧的生成结果，让右侧面板显示气口预览
  currentConv.value.generatedScript = "";
  matchedSubs.value = [];
  removedIndices.value = new Set();
  sentPrompt.value = "";
  reviewMessages.value = [];
  reviewPhase.value = "review";
  const frameGap = currentConv.value.frameGap; // 用户设置的帧数（1-10）

  try {
    let totalSegments = 0;
    let totalWordGaps = 0;
    let totalSegGaps = 0;
    let removableWordGaps = 0;
    let removableSegGaps = 0;
    let originalDurationMs = 0;
    let savedMs = 0;
    const compacted: CompactedSub[] = [];

    for (const src of sourcesWithSubs) {
      const subs = [...src.subtitles].sort((a, b) => a.startTime - b.startTime);
      if (subs.length === 0) continue;

      const srcFps = src.fps || DEFAULT_FPS;
      const gapThresholdMs = frameGap * frameMs(srcFps);
      totalSegments += subs.length;

      // ========== 第一遍：构建单词级时间轴 ==========
      const timeline: WordTimeline[] = [];
      for (const sub of subs) {
        if (sub.words && sub.words.length > 0) {
          const sorted = [...sub.words].sort(
            (a, b) => a.start_time - b.start_time,
          );
          for (const w of sorted) {
            originalDurationMs += w.end_time - w.start_time;
            timeline.push({
              text: w.text,
              startMs: w.start_time,
              endMs: w.end_time,
              segmentStartMs: sub.startTime,
              segmentEndMs: sub.endTime,
            });
          }
        } else {
          // 无 word 数据，整段作为单项
          originalDurationMs += sub.endTime - sub.startTime;
          timeline.push({
            text: sub.text,
            startMs: sub.startTime,
            endMs: sub.endTime,
            segmentStartMs: sub.startTime,
            segmentEndMs: sub.endTime,
          });
        }
      }

      if (timeline.length === 0) continue;

      // ========== 第二遍：逐词压缩气口 ==========
      for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];

        if (i === 0) {
          // 第一条：起点固定为 0
          const dur = item.endMs - item.startMs;
          compacted.push({
            videoId: src.id,
            originalStartMs: item.segmentStartMs,
            originalEndMs: item.segmentEndMs,
            compactStartMs: 0,
            compactEndMs: dur,
            text: item.text,
          });
          continue;
        }

        const prev = timeline[i - 1];
        const gap = item.startMs - prev.endMs;

        if (gap > 0) {
          // 区分字间气口（同一 segment 内）和句间气口（跨 segment）
          const sameSegment = item.segmentStartMs === prev.segmentStartMs;
          if (sameSegment) {
            totalWordGaps++;
          } else {
            totalSegGaps++;
          }

          if (gap > gapThresholdMs) {
            const excess = gap - gapThresholdMs;
            savedMs += excess;
            if (sameSegment) {
              removableWordGaps++;
            } else {
              removableSegGaps++;
            }
          }
        }

        const prevCompacted = compacted[compacted.length - 1];
        // 取实际气口和阈值的较小值，避免小气口被错误放大
        const effectiveGap = Math.min(Math.max(gap, 0), gapThresholdMs);
        const compactStart = prevCompacted.compactEndMs + effectiveGap;
        const dur = item.endMs - item.startMs;
        compacted.push({
          videoId: src.id,
          originalStartMs: item.segmentStartMs,
          originalEndMs: item.segmentEndMs,
          compactStartMs: compactStart,
          compactEndMs: compactStart + dur,
          text: item.text,
        });
      }
    }

    const compactDurationMs =
      compacted.length > 0 ? compacted[compacted.length - 1].compactEndMs : 0;

    gapStats.value = {
      totalSegments,
      totalGaps: totalWordGaps + totalSegGaps,
      removableGaps: removableWordGaps + removableSegGaps,
      savedMs,
      originalDurationSec: Math.round(originalDurationMs / 1000),
      compactDurationSec: Math.round(compactDurationMs / 1000),
      // 附加字间气口统计
      wordGaps: totalWordGaps,
      removableWordGaps,
      segGaps: totalSegGaps,
      removableSegGaps,
    };

    compactedSubtitles.value = compacted;
    computingGap.value = false;

    // 反馈计算结果
    const savedSec = Math.round(savedMs / 1000);
    ElMessage.success(
      `气口计算完成：${totalSegments} 条字幕 → 压缩后 ${compacted.length} 个词，去掉 ${savedSec} 秒气口`,
    );

    // 联动校验：对比时长要求
    const durReq = currentConv.value.durationRequirement?.trim();
    if (durReq && gapStats.value) {
      const compactSec = gapStats.value.compactDurationSec;
      const compactMin = Math.floor(compactSec / 60);
      const compactSecR = Math.floor(compactSec % 60);
      const compactLabel = `${compactMin}分${compactSecR}秒`;
      const nums = durReq.match(/\d+/g)?.map(Number) || [];
      let hint = "";
      if (nums.length >= 2) {
        const lo = nums[0], hi = nums[nums.length - 1];
        if (compactSec < lo * 60)
          hint = `⚠️ 去气口后约 ${compactLabel}，低于目标 ${lo}-${hi} 分钟，素材可能不够`;
        else if (compactSec > hi * 60)
          hint = `💡 去气口后约 ${compactLabel}，超出目标 ${lo}-${hi} 分钟，生成后将自动裁剪`;
      } else if (nums.length === 1) {
        const t = nums[0];
        if (/至少|以上|不少于|最低/.test(durReq) && compactSec < t * 60)
          hint = `⚠️ 去气口后约 ${compactLabel}，低于目标至少 ${t} 分钟，素材可能不够`;
        else if (/不超过|以内|以下|最多/.test(durReq) && compactSec > t * 60)
          hint = `💡 去气口后约 ${compactLabel}，超出上限 ${t} 分钟，生成后将自动裁剪`;
      }
      if (hint)
        setTimeout(() => ElMessage({ message: hint, type: hint.startsWith("⚠️") ? "warning" : "info" }), 600);
    }
  } catch (e: any) {
    console.error("[computeGaps] 出错:", e);
    ElMessage.error(`气口计算失败: ${e?.message || String(e)}`);
    gapStats.value = null;
    compactedSubtitles.value = [];
    computingGap.value = false;
  }
}

async function handleGenerate() {
  const conv = conversations.value.find((c) => c.id === activeConvId.value);
  if (!conv) return;

  const model = selectedModel.value;
  if (!model?.apiKey) {
    ElMessage.warning("请先在全局模型管理中设置 API Key");
    return;
  }

  const selectedSources = sourceList.value.filter((s) =>
    selectedSourceIds.value.has(s.id),
  );
  if (selectedSources.length === 0) {
    ElMessage.warning("请至少选择一个数据源");
    return;
  }

  if (!gapStats.value) {
    ElMessage.warning("请先完成「步骤 5：计算时长 / 去气口」");
    return;
  }

  // 计算选中数据源的原始总时长
  let totalSourceSec = 0;
  for (const src of selectedSources) {
    for (const sub of src.subtitles) {
      totalSourceSec += (sub.endTime - sub.startTime) / 1000;
    }
  }
  const totalSourceMin = Math.floor(totalSourceSec / 60);
  const totalSourceSecRemain = Math.floor(totalSourceSec % 60);

  // 构建源内容
  const sourceContent = compactedSubtitles.value.length > 0
    ? buildSourceContent(selectedSources, compactedSubtitles.value)
    : buildSourceContent(selectedSources);
  if (!sourceContent.content.trim()) {
    ElMessage.warning("所选数据源中没有字幕内容");
    return;
  }

  isGenerating.value = true;
  streamingScript.value = "";
  genLog.value = null;
  showGenLog.value = true;
  reviewPhase.value = "review";
  reviewMessages.value = [];
  sentPrompt.value = "";
  qcRetries.value = 0;
  qcFeedback.value = "";
  sevenDimScores.value = null;
  suggestedDuration.value = null;
  dedupResultText.value = "";
  phase6bScript.value = "";

  try {
    // ========== 阶段 6a：去重优化 + AI 建议时长 ==========
    currentAiStage.value = 0;
    phaseState.value = '6a';
    statusText.value = "阶段 1/3：正在分析去重并建议时长...";

    const { system: sys6a, user: usr6a } = buildPhase6aPrompt(
      sourceContent.content, conv.topic, conv, totalSourceMin, totalSourceSecRemain
    );
    const result6a = await callAISimple(sys6a, usr6a, model, 8192);

    dedupResultText.value = result6a.text;
    const dur = parseSuggestedDuration(result6a.text);
    if (dur) {
      suggestedDuration.value = dur;
      conv.suggestedDuration = dur.rawText;
    }

    // 处理 completion 结束后的日志
    genLog.value = {
      promptTokens: result6a.promptTokens,
      completionTokens: result6a.completionTokens,
      charsOut: result6a.text.length,
      truncated: sourceContent.content.length > 15000,
    };
    currentAiStage.value = 1;
    statusText.value = dur
      ? `去重完成！AI 建议时长：${dur.minMin}分${dur.minSec}秒 ~ ${dur.maxMin}分${dur.maxSec}秒`
      : "去重完成！请确认后继续";

    // 暂不自动进入 6b，等用户确认时长
    isGenerating.value = false;
    saveConversations();

  } catch (e: any) {
    ElMessage.error("阶段 6a 失败: " + (e.message || "未知错误"));
    isGenerating.value = false;
  }
}

/** 用户确认时长后，继续执行阶段 6b */
async function continuePhase6b() {
  const conv = conversations.value.find((c) => c.id === activeConvId.value);
  if (!conv) return;

  const model = selectedModel.value;
  if (!model?.apiKey) return;

  const selectedSources = sourceList.value.filter((s) =>
    selectedSourceIds.value.has(s.id),
  );
  if (selectedSources.length === 0) return;

  const sourceContent = compactedSubtitles.value.length > 0
    ? buildSourceContent(selectedSources, compactedSubtitles.value)
    : buildSourceContent(selectedSources);
  if (!sourceContent.content.trim()) return;

  isGenerating.value = true;
  phaseState.value = '6b';

  // 确定目标时长：优先用AI建议+用户确认，否则用用户期望时长
  const targetDur = confirmedDuration.value || suggestedDuration.value
    ? `${suggestedDuration.value?.minMin || 0}分 ~ ${suggestedDuration.value?.maxMin || 5}分`
    : (conv.durationRequirement || "3-5分钟");

  try {
    // ========== 阶段 6b：文案挑选 + 七维评分质检 ==========
    currentAiStage.value = 1;
    statusText.value = "阶段 2/3：正在挑选最佳字幕并做七维评分...";
    qcRetries.value = 0;
    qcFeedback.value = "";

    const { system: sys6b, user: usr6b } = buildPhase6bPrompt(
      sourceContent.content, conv.topic, conv, targetDur
    );
    let result6b = await callAISimple(sys6b, usr6b, model, 16384);
    phase6bScript.value = result6b.text;

    // 七维评分质检
    let { scores, composite } = parseSevenDimScores(result6b.text);
    sevenDimScores.value = scores;

    // 质检规则：综合分 < 60 或任一维度 < 40 → 重试
    const needsRetry = composite < 60 || Object.values(scores).some(v => v < 40);
    const MAX_RETRIES = 2;

    while (needsRetry && qcRetries.value < MAX_RETRIES) {
      qcRetries.value++;
      const weakDims = Object.entries(scores)
        .filter(([, v]) => v < 60)
        .map(([k]) => {
          const cfg = SCORING_DIMENSION_CONFIG.find(d => d.key === k);
          return cfg?.label || k;
        })
        .join("、");

      qcFeedback.value = `综合分 ${composite}，弱项：${weakDims}。第 ${qcRetries.value}/${MAX_RETRIES} 次优化重试...`;
      statusText.value = qcFeedback.value;
      ElMessage.warning(`七维质检不通过（${composite}分，弱项：${weakDims}），正在让 AI 优化...`);

      // 构建重试 prompt：告诉 AI 哪些维度弱，要求改进
      const retrySys = sys6b + `\n\n⚠️ 上一次的七维自评中，以下维度得分偏低，请重新挑选字幕，重点优化这些维度：${weakDims}`;
      result6b = await callAISimple(retrySys, usr6b, model, 16384);
      phase6bScript.value = result6b.text;

      const recheck = parseSevenDimScores(result6b.text);
      scores = recheck.scores;
      composite = recheck.composite;
      sevenDimScores.value = scores;

      if (composite >= 60 && Object.values(scores).every(v => v >= 40)) break;
    }

    // 更新日志
    const totalPromptTokens = result6b.promptTokens + (genLog.value?.promptTokens || 0);
    const totalCompTokens = result6b.completionTokens + (genLog.value?.completionTokens || 0);
    genLog.value = {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompTokens,
      charsOut: result6b.text.length,
      truncated: sourceContent.content.length > 15000,
    };

    currentAiStage.value = 2;
    statusText.value = composite >= 60
      ? `挑选完成！七维综合分 ${composite}，可进入编排`
      : `挑选完成。七维综合分 ${composite}（已达最优）`;

    isGenerating.value = false;
    saveConversations();

  } catch (e: any) {
    ElMessage.error("阶段 6b 失败: " + (e.message || "未知错误"));
    isGenerating.value = false;
  }
}

/** 用户确认挑选结果后，执行阶段 6c：网感编排 */
async function continuePhase6c() {
  const conv = conversations.value.find((c) => c.id === activeConvId.value);
  if (!conv) return;

  const model = selectedModel.value;
  if (!model?.apiKey) return;

  if (!phase6bScript.value.trim()) {
    ElMessage.warning("请先完成阶段 6b 的字幕挑选");
    return;
  }

  isGenerating.value = true;
  phaseState.value = '6c';

  try {
    // ========== 阶段 6c：网感编排 ==========
    currentAiStage.value = 2;
    statusText.value = "阶段 3/3：正在进行网感编排...";

    const { system: sys6c, user: usr6c } = buildPhase6cPrompt(
      phase6bScript.value, conv.topic, conv
    );
    const result6c = await callAISimple(sys6c, usr6c, model, 16384);
    const script = result6c.text;

    const selectedSources = sourceList.value.filter((s) =>
      selectedSourceIds.value.has(s.id),
    );
    const sourceContent = compactedSubtitles.value.length > 0
      ? buildSourceContent(selectedSources, compactedSubtitles.value)
      : buildSourceContent(selectedSources);

    // 解析匹配
    matchedSubs.value = parseScriptIndices(script, sourceContent.entries);
    sourceEntries.value = sourceContent.entries;
    for (const sub of matchedSubs.value) {
      const video = store.importedVideos.find((v) => v.id === sub.videoId);
      if (video) sub.videoPath = video.path;
    }
    removedIndices.value = new Set();

    // 保存结果
    conv.generatedScript = script;
    conv.updatedAt = Date.now();

    // 保存七维评分和五层评测到 conversation
    if (sevenDimScores.value) {
      conv.evaluation = {
        structure: {
          topic: { score: 60, feedback: '', contrast: false, cognition: false, resonance: false },
          angle: { score: 60, feedback: '', contrast: false, cognition: false, resonance: false },
          opening: { score: 60, feedback: '', contrast: false, cognition: false, resonance: false },
          transition: { score: 60, feedback: '', contrast: false, cognition: false, resonance: false },
          body: { score: 60, feedback: '', contrast: false, cognition: false, resonance: false },
          landing: { score: 60, feedback: '', contrast: false, cognition: false, resonance: false },
        },
        contentQuality: sevenDimScores.value,
        persona: { ageMatch: 60, ageFeedback: '', trackTrust: 60, trackTrustFeedback: '' },
        value: { practicality: 60, practicalityFeedback: '', gain: 60, gainFeedback: '', easyExecute: 60, easyExecuteFeedback: '' },
        conversion: { attractiveness: 60, attractivenessFeedback: '', trust: 60, trustFeedback: '' },
        compositeScore: calcCompositeScore(sevenDimScores.value),
        summary: '',
      };
    }

    // 更新日志
    const totalPromptTokens = result6c.promptTokens + (genLog.value?.promptTokens || 0);
    const totalCompTokens = result6c.completionTokens + (genLog.value?.completionTokens || 0);
    genLog.value = {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompTokens,
      charsOut: script.length,
      truncated: sourceContent.content.length > 15000,
    };

    sentPrompt.value = buildReviewPromptPreview(sourceContent.content, conv);

    currentAiStage.value = 3;
    phaseState.value = 'done';
    statusText.value = "全部完成！";

    saveConversations();
    ElMessage.success(`生成完成，匹配 ${matchedSubs.value.length} 个片段`);

  } catch (e: any) {
    ElMessage.error("阶段 6c 失败: " + (e.message || "未知错误"));
  } finally {
    isGenerating.value = false;
  }
}

/** 根据当前阶段路由到正确的处理函数 */
async function handlePhaseAction() {
  if (currentAiStage.value === 0) {
    // 阶段 6a：开始去重
    await handleGenerate();
  } else if (currentAiStage.value === 1) {
    // 阶段 6b：确认时长，继续挑选
    await continuePhase6b();
  } else if (currentAiStage.value === 2) {
    // 阶段 6c：确认挑选，开始编排
    await continuePhase6c();
  }
}

function buildSourceContent(
  sources: SubtitleSource[],
  compacted?: CompactedSub[],
): { content: string; entries: SubtitleEntry[] } {
  const lines: string[] = [];
  const entries: SubtitleEntry[] = [];

  // 有压缩数据时：将单词级压缩数据按原字幕分组合并，AI 看到完整句子 + 压缩时间轴
  if (compacted && compacted.length > 0) {
    // 按 (videoId, 原字幕起始时间) 分组，把单词拼回句子
    type SegmentGroup = {
      videoId: string;
      originalStartMs: number;
      originalEndMs: number;
      words: CompactedSub[];
    };
    const groups: SegmentGroup[] = [];
    let cur: SegmentGroup | null = null;
    for (const c of compacted) {
      if (
        !cur ||
        cur.videoId !== c.videoId ||
        cur.originalStartMs !== c.originalStartMs
      ) {
        cur = {
          videoId: c.videoId,
          originalStartMs: c.originalStartMs,
          originalEndMs: c.originalEndMs,
          words: [],
        };
        groups.push(cur);
      }
      cur.words.push(c);
      if (c.originalEndMs > cur.originalEndMs)
        cur.originalEndMs = c.originalEndMs;
    }

    const byVideo = new Map<string, SegmentGroup[]>();
    for (const g of groups) {
      if (!byVideo.has(g.videoId)) byVideo.set(g.videoId, []);
      byVideo.get(g.videoId)!.push(g);
    }

    let idx = 0;
    for (const src of sources) {
      const srcGroups = byVideo.get(src.id);
      if (!srcGroups || srcGroups.length === 0) continue;

      const firstWord = srcGroups[0].words[0];
      const lastWord = srcGroups[srcGroups.length - 1].words;
      const compactDur = Math.round(
        lastWord[lastWord.length - 1].compactEndMs / 1000,
      );
      const originalDur = Math.round(
        srcGroups.reduce(
          (s, g) => s + (g.originalEndMs - g.originalStartMs),
          0,
        ) / 1000,
      );
      const srcFps = src.fps || DEFAULT_FPS;
      lines.push(
        `【视频：${src.name} | 原始时长约 ${originalDur}秒 | 去气口后约 ${compactDur}秒 | 帧率 ${srcFps}fps | 句子间隔 ${currentConv.value.frameGap}帧≈${Math.round(frameMs(srcFps) * currentConv.value.frameGap)}ms】`,
      );

      for (const g of srcGroups) {
        const text = g.words.map((w) => w.text).join("");
        const compactStart = g.words[0].compactStartMs;
        const compactEnd = g.words[g.words.length - 1].compactEndMs;
        const dur = Math.round((g.originalEndMs - g.originalStartMs) / 1000);
        idx++;
        lines.push(
          `#${idx} [${store.formatTimeMs(compactStart)}-${store.formatTimeMs(compactEnd)} | ${dur}秒] ${text}`,
        );
        entries.push({
          videoId: g.videoId,
          videoName: src.name,
          videoPath: "",
          startTime: g.originalStartMs,
          endTime: g.originalEndMs,
          text,
        });
      }
      lines.push("");
    }
    return { content: lines.join("\n"), entries };
  }

  // 无压缩数据：原始时间轴
  let idx = 0;
  for (const src of sources) {
    let videoSec = 0;
    for (const sub of src.subtitles)
      videoSec += (sub.endTime - sub.startTime) / 1000;
    lines.push(
      `【视频：${src.name} | 该视频字幕总时长约 ${Math.round(videoSec)} 秒】`,
    );
    for (const sub of src.subtitles) {
      const dur = Math.round((sub.endTime - sub.startTime) / 1000);
      idx++;
      lines.push(
        `#${idx} [${store.formatTimeMs(sub.startTime)}-${store.formatTimeMs(sub.endTime)} | ${dur}秒] ${sub.text}`,
      );
      entries.push({
        videoId: src.id,
        videoName: src.name,
        videoPath: "",
        startTime: sub.startTime,
        endTime: sub.endTime,
        text: sub.text,
      });
    }
    lines.push("");
  }
  return { content: lines.join("\n"), entries };
}

// ===== 三阶段 AI 调用 =====

/** 建议时长解析结果 */
interface SuggestedDuration {
  minMin: number;
  minSec: number;
  maxMin: number;
  maxSec: number;
  rawText: string;
}

const phaseState = ref<'6a' | '6b' | '6c' | 'done'>('6a');
const suggestedDuration = ref<SuggestedDuration | null>(null);
const confirmedDuration = ref('');
const dedupResultText = ref('');
const sevenDimScores = ref<ScoringDimensions | null>(null);
const qcRetries = ref(0);
const qcFeedback = ref('');
const phase6bScript = ref('');
// 质量评分折叠状态
const showSevenDim = ref(false);
const showFiveLogic = ref(false);
const showStep6SevenDim = ref(false);
const compositeColor = computed(() => {
  const s = sevenDimScores.value;
  if (!s) return '#909399';
  const c = calcCompositeScore(s);
  return c >= 75 ? '#16a34a' : c >= 60 ? '#e6a23c' : '#f56c6c';
});

/** 非流式 AI 调用（用于各阶段独立请求） */
async function callAISimple(
  systemPrompt: string,
  userContent: string,
  model: { apiKey: string; apiUrl: string; modelParam: string },
  maxTokens: number = 8192
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const reqModel = { provider: "deepseek" as const, modelParam: model.modelParam };
  const { body } = buildModelRequestBody(reqModel, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.7,
    max_tokens: maxTokens,
  });

  const response = await fetch(model.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${model.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 错误 (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const usage = data.usage;
  return {
    text,
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0,
  };
}

/** 构建阶段 6a 提示词：去重优化 + 建议时长 */
function buildPhase6aPrompt(
  sourceContent: string,
  topic: string,
  conv: Conversation,
  dataMin: number,
  dataSec: number
): { system: string; user: string } {
  let system = `你是专业的短视频剪辑师。你的任务分两步：

## 第一步：去重优化
严格筛查字幕库中的重复内容：
- 字面重复（口吃/磕巴）：如 "他没有风险，没有风险" → 第二个"没有风险"是口吃重复
- 语义重复（同一个意思说了多遍）：如 #5 "这个特别好" 和 #18 "真的特别棒" → 同义，只保留更精炼的一条
- 相邻重复话：编号相邻的字幕如果意思完全相同或高度重叠，标注并只保留表达更完整的那条

## 第二步：建议时长
根据去重后剩余素材的质量和密度，给出一个合理的视频时长建议。
考虑因素：
- 素材总量：${dataMin}分${dataSec}秒原始数据
- 去重后的有效内容密度
- 短视频平台的最佳传播时长（抖音1-3分钟、视频号2-5分钟、小红书1-3分钟、快手1-5分钟）
- 内容类型和节奏要求

【输出格式】
# 去重结果
逐条列出标记为重复的条目（编号+内容摘要+原因），最后汇总：共去除 X 条，保留 Y 条。
如果没有需要去除的，写"无需去重，所有字幕均为有效内容"。

# 建议时长
建议时长：A分B秒 ~ C分D秒
理由：2-3句话说明为什么建议这个时长区间。`;

  if (conv.qualityStandard.trim()) {
    system += `\n\n【质量标准】\n${conv.qualityStandard.trim()}`;
  }

  const user = `【字幕库】\n${sourceContent}\n\n【文案方向】\n${topic}\n\n请先完成去重优化，再给出建议时长。`;
  return { system, user };
}

/** 解析 AI 返回的建议时长 */
function parseSuggestedDuration(text: string): SuggestedDuration | null {
  const regex = /建议时长[：:]\s*(\d+)\s*分\s*(\d+)\s*秒\s*[~～-]\s*(\d+)\s*分\s*(\d+)\s*秒/i;
  const match = text.match(regex);
  if (match) {
    return {
      minMin: parseInt(match[1]),
      minSec: parseInt(match[2]),
      maxMin: parseInt(match[3]),
      maxSec: parseInt(match[4]),
      rawText: match[0],
    };
  }
  // 尝试匹配只有分钟没有秒的格式
  const regex2 = /建议时长[：:]\s*(\d+)\s*分\s*[~～-]\s*(\d+)\s*分/i;
  const match2 = text.match(regex2);
  if (match2) {
    return {
      minMin: parseInt(match2[1]),
      minSec: 0,
      maxMin: parseInt(match2[2]),
      maxSec: 0,
      rawText: match2[0],
    };
  }
  return null;
}

/** 构建阶段 6b 提示词：文案挑选 + 七维自评 */
function buildPhase6bPrompt(
  sourceContent: string,
  topic: string,
  conv: Conversation,
  targetDuration: string
): { system: string; user: string } {
  let system = `你是专业的短视频文案挑选专家。请从字幕库中按「七维评分」标准挑选最适合的字幕片段。

目标时长：${targetDuration}

## 七维挑选标准
${SCORING_DIMENSION_CONFIG.map(d =>
    `【${d.label}】${d.desc}\n  1 = ${d.rubric[0]}\n  2 = ${d.rubric[1]}\n  3 = ${d.rubric[2]}\n  4 = ${d.rubric[3]}\n  5 = ${d.rubric[4]}`
  ).join('\n')}

## 挑选原则
- 开场钩子优先：前 3 条必须一击命中，让观众划不走
- 沉浸共鸣优先：带「你」「我们」视角、描述具体场景的内容优先
- 干货密度：跳过翻来覆去说同一件事的字幕，保留信息增量最大的版本
- 节奏掌控：按「痛点→分析→解法」三段式排列，情绪逐步递进
- 人设差异：保留「我亲自试过」「我踩过的坑」等个人体感内容
- 传播共鸣：优先选能引起群体共鸣的话题
- 可信背书：保留有具体数字/案例的字幕，跳过纯感叹/口号
- 控制总时长在目标范围内

## 🔗 逻辑连贯性（最重要）
- 每一条字幕都必须是上一条的自然延伸，听众不需要"跳逻辑"就能跟上
- 遵循「认知铺垫 → 深层分析 → 落地解法」的叙事弧线，不能开头在讲赚钱认知，突然跳到操作细节
- 话题切换必须有过渡句：如果要从 A 话题换到 B 话题，中间用一条"桥梁字幕"连接
- 核心逻辑链必须自洽：开头提出的问题，中间必须有分析，结尾必须有回应
- 通俗化原则：把专业术语拆解成大白话，确保听众全程听得懂，不发生"突然变难听不懂"的断层

${conv.schemeMode === 'precise'
  ? '## ✂️ 精剪模式约束（与视频素材绑定）\n你挑选的字幕将直接匹配到视频片段，因此需要遵守以下规则：\n- 前 40% 的字幕允许来自不同视频源的"跳跃拼接"（允许剪辑节奏快、场景切换）\n- 后 60% 的字幕必须保证逻辑通顺，相邻两句之间不能有话题断层\n- 如果视频素材中缺少逻辑衔接所需的"过渡句"，宁可少选也不要硬凑\n- 后段优先选同一视频中连续的字幕片段，减少剪辑跳切感'
  : '## 🎯 效果优先模式（不受视频素材限制）\n你拥有完全的自由度来最大化文案效果：\n- 不受视频来源限制，纯以文案冲击力和传播效果为准\n- 可以重新组合不同视频的字幕，只要能拼出最强的逻辑链\n- 如果素材中缺乏某种情绪转折，可以用「编排说明」告知用户哪里需要补拍'}`;

  if (conv.speakerPersona.trim()) {
    system += `\n\n【人设画像】\n${conv.speakerPersona.trim()}`;
  }
  if (conv.audiencePersona.trim()) {
    system += `\n\n【人群画像】\n${conv.audiencePersona.trim()}`;
  }
  if (conv.qualityStandard.trim()) {
    system += `\n\n【质量标准】\n${conv.qualityStandard.trim()}`;
  }
  if (conv.targetPlatform) {
    system += `\n\n【目标平台】${conv.targetPlatform}\n${PLATFORM_SCORING_GUIDE[conv.targetPlatform as Platform] || ''}`;
  }

  system += `\n\n【输出格式】
按播出顺序列出选中的字幕，每条一行：#N [时间轴] 文案内容

示例：
#5 [00:12-00:16] 你有没有发现，越是拼命的人越容易陷入一个误区
#12 [00:18-00:26] 我花了三年时间才明白

## 七维自评
每个维度打分（1-5）及一句话说明：
hook: 4 | 理由
empathy: 3 | 理由
density: 3 | 理由
structure: 4 | 理由
originality: 3 | 理由
socialResonance: 4 | 理由
polish: 3 | 理由

## 逻辑链审查
用 2-3 句话检查：开头→中间→结尾的逻辑是否通顺？有没有让听众突然听不懂的断层？

综合分: X/5`;

  const refCopies = conv.referenceCopies.filter(c => c.trim());
  let refSection = '';
  if (refCopies.length > 0) {
    refSection = '\n\n【参考文案风格】\n' + refCopies.map((c, i) => `参考${i + 1}: ${c.trim()}`).join('\n\n');
  }

  const user = `【字幕库】\n${sourceContent}\n\n【文案方向】\n${topic}${refSection}\n\n请按七维标准挑选字幕，控制总时长在${targetDuration}左右。${conv.schemeMode === 'precise' ? '注意：这是精剪模式，后60%的字幕必须逻辑通顺，不能有断层。' : '效果优先，自由发挥。'}`;
  return { system, user };
}

/** 构建阶段 6c 提示词：网感编排 */
function buildPhase6cPrompt(
  selectedSubtitles: string,
  topic: string,
  conv: Conversation
): { system: string; user: string } {
  const isPrecise = conv.schemeMode === 'precise';

  let system = `你是专业的短视频网感编排专家。将选中的字幕组织成一条完整的、符合短视频节奏的文案。

## 编排要求
- 钩子前置：最抓人的 1-2 条放开头，3 秒内建立期待
- 情绪递进：钩子引发焦虑 → 展开加深理解 → 结尾给出解法或留悬念
- 节奏把控：主力句（2~8秒）占多数，短碎片不连续超过 3 条，长句（>15秒）拆开
- 衔接自然：前一句结尾和后一句开头语义顺滑，不出现话题突然跳转
- 朗读通顺：句子不能断在"的/了/吗"之前
- 网感终点：结尾引发好奇或给出明确行动号召

## 🔗 叙事连贯性（最高优先级）
- 整体必须形成一条完整的叙事弧线：为什么说这个 → 核心认知是什么 → 具体怎么做
- 严禁话题断层：如果前一句在讲"赚钱思维"，下一句不能突然跳到"操作工具"而没有过渡
- 每条之间检查：这句话的结尾词，和下一句话的开头词，能自然接上吗？
- 通俗易懂：全程用口语化表达，确保听众不费力就能理解，拒绝"听着听着突然听不懂"
- 情绪曲线：开头激昂→中间有起伏→结尾有力，不能从头平到尾`;

  if (isPrecise) {
    system += `\n\n## ✂️ 精剪模式编排规则\n你编排的文案将直接对应视频片段，因此：\n- 前 40% 的句子允许节奏快、场景切换频繁（制造"信息轰炸"的爽感）\n- 后 60% 必须放慢节奏，每句话之间逻辑咬合紧密，形成"沉浸式聆听"体验\n- 如果选中的字幕之间缺少逻辑衔接，请用一句话标注【此处需补过渡】，不要强行跳跃\n- 后段尽量让相邻句子来自同一视频源的连续片段`;
  } else {
    system += `\n\n## 🎯 效果优先编排规则\n你拥有完全自由度：\n- 可以大刀阔斧地重新排序，只要最终逻辑链最强\n- 可以建议删除某条字幕并用其他内容替换\n- 目标是让观众从头到尾不划走，每个转折都有"爽点"`;
  }

  if (conv.speakerPersona.trim()) {
    system += `\n\n【人设画像】\n${conv.speakerPersona.trim()}`;
  }
  if (conv.audiencePersona.trim()) {
    system += `\n\n【人群画像】\n${conv.audiencePersona.trim()}`;
  }
  if (conv.qualityStandard.trim()) {
    system += `\n\n【质量标准】\n${conv.qualityStandard.trim()}`;
  }

  system += `\n\n【输出格式】
### 编排说明
3~5 句话说明开头、递进、结尾的设计思路

### 完整文案
按播出顺序的完整文案（不含时间轴，纯文字段落）

### 节奏审查
2~3 句话评价节奏和衔接`;

  const user = `【选中的字幕片段】\n${selectedSubtitles}\n\n【文案方向】\n${topic}\n\n请将以上字幕编排成一条完整的短视频文案。${isPrecise ? '记住：精剪模式，后60%必须逻辑通顺无断层。' : '效果优先，重在冲击力和传播效果。'}`;
  return { system, user };
}

/** 七维评分质检：解析分数并判断是否需要重试 */
function parseSevenDimScores(text: string): { scores: ScoringDimensions; composite: number } {
  const scores = parseScoresFromAI(text);
  const composite = calcCompositeScore(scores);
  return { scores, composite };
}

/** 从 AI 输出中解析七维分数（复用共享服务） */
function parseScoresFromAI(text: string): ScoringDimensions {
  // 使用共享服务的 parseScores，但处理 Likert 1-5 → 0-100 映射
  const dimMap: Record<string, keyof ScoringDimensions> = {
    'hook': 'hook', '开场钩子': 'hook',
    'empathy': 'empathy', '沉浸共鸣': 'empathy',
    'density': 'density', '干货密度': 'density',
    'structure': 'structure', '节奏掌控': 'structure',
    'originality': 'originality', '人设差异': 'originality',
    'socialResonance': 'socialResonance', '传播共鸣': 'socialResonance',
    'polish': 'polish', '可信背书': 'polish',
  };

  const scores = defaultScores();
  let parsed = 0;
  for (const [label, key] of Object.entries(dimMap)) {
    const regex = new RegExp(`${label}[：:]\\s*(\\d+(?:\\.\\d+)?)`, 'i');
    const match = text.match(regex);
    if (match) {
      const rawVal = parseFloat(match[1]);
      const val = rawVal <= 5 ? Math.round(rawVal * 20) : Math.max(0, Math.min(100, rawVal));
      scores[key] = val;
      parsed++;
    }
  }
  if (parsed < 7) {
    console.warn(`[parseScoresFromAI] 仅解析到 ${parsed}/7 维`);
  }
  return scores;
}

async function callAI(
  sourceContent: string,
  topic: string,
  referenceCopies: string[],
  speakerPersona: string,
  audiencePersona: string,
  durationReq: string,
  frameGap: number,
  dataMin: number,
  dataSec: number,
  model: { apiKey: string; apiUrl: string; modelParam: string },
  onChunk: (text: string) => void,
  customSystemPrompt?: string,
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  let systemPrompt: string;
  let userMsg: string;

  if (customSystemPrompt) {
    // 审核对话模式：直接用自定义系统提示词，sourceContent 作为上下文
    systemPrompt = customSystemPrompt;
    userMsg = topic; // topic 参数复用于用户消息
  } else {
    systemPrompt = `你是一个专业的短视频剪辑师。你的工作分三个阶段完成：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 第一阶段：去重优化

浏览字幕库中每一条字幕，严格筛查并标记需要去除的内容：

▸ 字面重复（口吃/磕巴）：
  如 "他没有风险，没有风险" → 第二个"没有风险"是口吃重复
  如 "然后然后我们就" → "然后"重复

▸ 语义重复（同一个意思说了两遍）：
  如 #5 "这个特别好" 和 #18 "真的特别棒" → 同义，只保留更精炼的一条
  如 "很重要，特别关键，非常核心" → 三词同义堆砌

▸ 相邻重复话：
  特别关注编号相邻的字幕，如果两句话意思完全相同或高度重叠，只保留表达更完整的那条。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 第二阶段：时间轴文案

经过第一阶段去重后，从剩余字幕中按「七维评分」挑选最适合的片段，并为每条选中字幕标注其原始时间轴：

▸ 开场钩子（hook）：前 3 条能否让观众「划不走」？优先选一击命中隐秘困惑的字幕
▸ 沉浸共鸣（empathy）：优先选带「你」「我们」视角、描述具体场景的内容
▸ 干货密度（density）：跳过翻来覆去说同一件事的字幕，保留信息增量最大的版本
▸ 节奏掌控（structure）：按「痛点→分析→解法」三段式排列，情绪逐步递进
▸ 人设差异（originality）：保留「我亲自试过」「我踩过的坑」等个人体感内容
▸ 传播共鸣（socialResonance）：优先选能引起群体共鸣的话题（职场、家庭、成长等）
▸ 可信背书（polish）：保留有具体数字/案例的字幕，跳过纯感叹/口号

选中后自评七维综合分，低于 3 分的维度标注原因。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 第三阶段：网感编排

将第二阶段选中的时间轴文案组织成一条完整的、符合短视频节奏的文案：

▸ 钩子前置：最抓人的 1-2 条放开头，3 秒内建立期待
▸ 情绪递进：钩子引发焦虑 → 展开加深理解 → 结尾给出解法或留悬念
▸ 节奏把控：主力句（2~8秒）占多数，短碎片不连续超过 3 条，长句（>15秒）拆开
▸ 衔接自然：前一句结尾和后一句开头语义顺滑，不出现话题突然跳转
▸ 朗读通顺：句子不能断在"的/了/吗"之前，相邻两句最好能拼成完整一句话
▸ 网感终点：结尾引发好奇或给出明确行动号召，让观众想点赞/评论/转发

每条字幕后面的 | X秒 是该条时长，选中的每条秒数加起来就是总时长。`;

    // 人设画像
    if (speakerPersona.trim()) {
      systemPrompt += `\n\n【人设画像——你是谁】
你代表了以下人设，挑选字幕时优先选择符合该人设视角和语气的内容：
${speakerPersona.trim()}

在「编排说明」中说明你的选择如何体现了这个人的风格。`;
    }

    // 人群画像
    if (audiencePersona.trim()) {
      systemPrompt += `\n\n【人群画像——给谁看】
你的目标受众是：
${audiencePersona.trim()}

挑选字幕时，优先选择能让这类人群产生「这说的就是我」共鸣的内容。在«编排说明»中说明你如何针对这个人群做了取舍。`;
    }

    // 参考文案
    const copies = referenceCopies.filter((c) => c.trim());
    if (copies.length > 0) {
      const copyBlocks = copies
        .map((c, i) => `【参考文案 ${i + 1}】\n${c.trim()}`)
        .join("\n\n");
      systemPrompt += `\n\n【参考文案——你必须模仿的风格】
用户提供了 ${copies.length} 篇参考文案，请先逐篇分析其风格特征（语调、句式、节奏、人称、钩子模式），然后提取它们之间的共性风格，按照这种风格从字幕库中挑选和编排。

分析完后，在「编排说明」中用 1-2 句说明你识别到的共性风格特征，以及你是如何在挑选字幕时体现这些风格的。

${copyBlocks}
【参考文案结束】`;
    }

    if (durationReq.trim()) {
      const nums = durationReq.match(/\d+/g)?.map(Number) || [];
      systemPrompt += `\n\n【用户时长目标】${durationReq.trim()}`;
      if (nums.length >= 2) {
        systemPrompt += `\n折算：目标 ${nums[0]}~${nums[nums.length - 1]} 分钟 = ${nums[0] * 60}~${nums[nums.length - 1] * 60} 秒`;
      } else if (nums.length === 1) {
        systemPrompt += `\n折算：目标约 ${nums[0]} 分钟 = ${nums[0] * 60} 秒`;
      }
      systemPrompt += `\n内容质量始终优先于精确时长。数据不够时如实说明。`;
    }

    if (frameGap > 1) {
      systemPrompt += `\n\n导出时片段间自动插入 ${frameGap} 帧间隔，你无需额外处理。`;
    }

    systemPrompt += `\n\n【输出格式——严格按以下顺序输出】

## 第一阶段：去重优化
列出你在字幕库中发现并去除的重复/堆砌内容：
- #7（与 #5 字面重复："没有风险"出现两次）→ 去除
- #22（与 #18 语义重复：都说"这个方法好"）→ 去除，保留 #18
- #34-35（相邻两句意思重叠：都在解释同一个概念）→ 保留 #34
（如果没有需要去除的，写"无"）

## 第二阶段：时间轴文案
按播出顺序列出选中的字幕，每条一行，格式：「#N [时间轴] 文案内容」
示例：
#5 [00:12-00:16] 你有没有发现，越是拼命的人越容易陷入一个误区
#12 [00:18-00:26] 我花了三年时间才明白，努力和结果之间缺的不是毅力
#3 [00:28-00:33] 而是一个被大多数人忽略的关键变量

## 第三阶段：网感编排
分成以下小节：

### 编排说明
3~5 句话说明：开头为什么选这几条、中间如何递进、结尾设计思路。注明做了哪些取舍。

### 节奏审查
2~3 句话评价：主力句（2-8秒）占比、句间衔接是否平顺、朗读是否通顺。

### 时长验证
逐条列出时长并求和（必须有算式），例如：
#5(4秒) + #12(8秒) + #3(5秒) = 17秒
选中3条，累计17秒，约0.3分钟

### 七维自评
每个维度打分（1-5）及一句话说明，低于 3 分的标注原因。`;

    userMsg = `【字幕库】\n${sourceContent}\n\n【用户要求】\n${topic}\n\n请严格按三个阶段处理，先完成去重优化再挑选文案，最后做网感编排。`;
  }

  // 大幅提高限制：276条字幕约10000字，不再轻易截断
  const msgChars = userMsg.length;
  const truncatedMsg =
    msgChars > 15000
      ? userMsg.slice(0, 15000) + "\n...(内容已截断，剩余条目可能不完整)"
      : userMsg;

  const reqModel = { provider: "deepseek" as const, modelParam: model.modelParam };
  const { body } = buildModelRequestBody(reqModel, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: truncatedMsg },
    ],
    temperature: 0.7,
    max_tokens: 16384,
    stream: true,
  });
  body.stream = true; // V4 流式由调用方自行设置

  const response = await fetch(model.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${model.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 错误 (${response.status}): ${err}`);
  }

  // 尝试流式读取，如果 API 不支持流式则回退到非流式
  const contentType = response.headers.get("content-type") || "";
  const useStream =
    contentType.includes("text/event-stream") ||
    contentType.includes("application/json");

  if (useStream && response.body) {
    try {
      return await readStream(
        response.body,
        onChunk,
        systemPrompt.length + truncatedMsg.length,
      );
    } catch (streamErr: any) {
      // 流式失败，回退到非流式
      console.warn("流式读取失败，尝试非流式:", streamErr.message);
    }
  }

  // 非流式回退
  return await readNonStream(response);
}

/** 流式 SSE 解析 */
async function readStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  promptLen: number,
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let lastActivity = Date.now();
  const IDLE_TIMEOUT = 15000; // 15 秒无数据则视为结束

  // 定时检测是否超时
  const timeoutCheck = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT) {
      reader.cancel("idle timeout").catch(() => {});
    }
  }, 5000);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lastActivity = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // 支持 "data: " 和 "data:" 前缀
        const dataIdx = trimmed.indexOf("data:");
        if (dataIdx !== 0) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const chunk = JSON.parse(jsonStr);
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          // 兼容各种 delta 格式
          const delta = choice.delta || choice.message || {};
          const content =
            delta.content || delta.text || delta.reasoning_content || "";
          if (content) {
            fullText += content;
            onChunk(fullText);
          }
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens || 0;
            completionTokens = chunk.usage.completion_tokens || 0;
          }
        } catch {
          /* 跳过非 JSON 行 */
        }
      }
    }
  } finally {
    clearInterval(timeoutCheck);
    try {
      reader.releaseLock();
    } catch {}
  }

  // 估算 token（如果 API 没返回 usage）
  if (promptTokens === 0) {
    promptTokens = Math.ceil(promptLen / 3.5);
    completionTokens = Math.ceil(fullText.length / 3.5);
  }

  return { text: fullText, promptTokens, completionTokens };
}

/** 非流式回退 */
async function readNonStream(
  response: Response,
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const usage = data.usage;
  return {
    text,
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0,
  };
}

/** 将生成的文案匹配到实际字幕，按脚本出现顺序排列 */
function parseScriptIndices(
  script: string,
  entries: SubtitleEntry[],
): SubtitleEntry[] {
  if (entries.length === 0) return [];

  // 提取「第二阶段：时间轴文案」区块中的所有 #N
  const selectSection =
    script.match(
      /##\s*第二阶段[：:]\s*时间轴文案\s*\n([\s\S]*?)(?=\n##\s*第三阶段|$)/i,
    ) || script.match(/##\s*选择清单\s*\n([\s\S]*?)(?=\n##|$)/i); // 兼容旧格式
  const sectionText = selectSection ? selectSection[1] : script;

  // 提取所有 #N 编号
  const indices: number[] = [];
  const seen = new Set<number>();

  const matches = sectionText.matchAll(/#(\d+)/g);
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= entries.length && !seen.has(n)) {
      seen.add(n);
      indices.push(n - 1);
    }
  }

  if (indices.length > 0) {
    return indices.map((i) => entries[i]);
  }

  return fuzzyMatchScriptToSubs(script, entries);
}

/** 旧格式回退：bigram 模糊匹配（保留以兼容旧对话） */
function fuzzyMatchScriptToSubs(
  script: string,
  subs: SubtitleEntry[],
): SubtitleEntry[] {
  if (subs.length === 0) return [];

  // 中文分词：按标点拆短语，提取连续2-3字作为特征
  const tokenize = (text: string): Set<string> => {
    const tokens = new Set<string>();
    // 按标点和空白拆成短语
    const phrases = text
      .split(/[\s，,。.！!？?、；;：:（）()【】\[\]""''\n\r]+/)
      .filter((p) => p.length >= 2);
    for (const p of phrases) {
      for (let i = 0; i < p.length - 1; i++) {
        tokens.add(p.substring(i, i + 2)); // bigram
      }
    }
    return tokens;
  };

  const scriptTokens = tokenize(script);
  if (scriptTokens.size === 0) return [];

  // 对每条字幕计算 Jaccard 相似度
  const scored: Array<{ sub: SubtitleEntry; score: number }> = [];
  for (const sub of subs) {
    const subTokens = tokenize(sub.text);
    if (subTokens.size === 0) continue;
    let intersect = 0;
    for (const t of subTokens) {
      if (scriptTokens.has(t)) intersect++;
    }
    const score = intersect / subTokens.size; // 字幕文本中有多少比例在脚本中出现
    if (score >= 0.3) scored.push({ sub, score });
  }

  // 视频内按字幕顺序排列，再按脚本出现位置全局排列
  // 先找每个字幕在脚本中的最佳位置
  const positioned = scored.map(({ sub, score }) => {
    let pos = script.indexOf(sub.text);
    if (pos === -1) {
      // 先用前 70% 匹配
      const prefixLen = Math.floor(sub.text.length * 0.7);
      for (let len = prefixLen; len >= 8; len--) {
        pos = script.indexOf(sub.text.substring(0, len));
        if (pos >= 0) break;
      }
    }
    return { sub, score, pos: pos >= 0 ? pos : Number.MAX_SAFE_INTEGER };
  });

  // 按脚本中的位置排序
  positioned.sort((a, b) => a.pos - b.pos);

  // 去重：
  // 1. 完全相同的字幕（同视频同时间起点）只保留一个
  // 2. 同一视频内时间重叠超过 30% 的只保留相似度更高的
  // 3. bigram 重叠超过 80% 的近似文本只保留第一个
  const result: SubtitleEntry[] = [];
  const usedKeys = new Set<string>();

  for (const { sub, score } of positioned) {
    const key = `${sub.videoId}|${sub.startTime}`;
    if (usedKeys.has(key)) continue;

    // 与已添加的所有条目比对
    let skip = false;
    for (const existing of result) {
      // 同一视频：时间重叠超过 30% → 跳过
      if (existing.videoId === sub.videoId) {
        const overlapStart = Math.max(sub.startTime, existing.startTime);
        const overlapEnd = Math.min(sub.endTime, existing.endTime);
        const overlap = overlapEnd - overlapStart;
        const subDur = sub.endTime - sub.startTime;
        const exDur = existing.endTime - existing.startTime;
        if (overlap > 0 && subDur > 0 && exDur > 0) {
          if (overlap / subDur > 0.3 || overlap / exDur > 0.3) {
            skip = true;
            break;
          }
        }
      }
      // 跨视频：文本 bigram 重叠超过 80% → 跳过（近似重复）
      const subTokens = tokenize(sub.text);
      const exTokens = tokenize(existing.text);
      if (subTokens.size > 0 && exTokens.size > 0) {
        let common = 0;
        for (const t of subTokens) if (exTokens.has(t)) common++;
        const ratio = common / Math.min(subTokens.size, exTokens.size);
        if (ratio > 0.8) {
          skip = true;
          break;
        }
      }
    }
    if (skip) continue;

    usedKeys.add(key);
    result.push(sub);
  }

  return result;
}

// ===== 方案审核对话 =====
/** 发送审核消息到 AI */
async function sendReviewMessage() {
  const input = reviewInput.value.trim();
  if (!input || reviewSending.value) return;

  reviewMessages.value.push({ role: "user", text: input, time: Date.now() });
  reviewInput.value = "";
  reviewSending.value = true;

  const conv = currentConv.value;
  const model = selectedModel.value;
  if (!model || !conv?.generatedScript) {
    ElMessage.warning("没有可审查的方案");
    reviewSending.value = false;
    return;
  }

  try {
    // 收集已选字幕的上下文（供 AI 参考）
    const selectedLines = matchedSubs.value
      .filter((_, i) => !removedIndices.value.has(i))
      .map((s, i) => {
        const dur = Math.round((s.endTime - s.startTime) / 1000);
        return `#${i + 1} [${store.formatTimeMs(s.startTime)}-${store.formatTimeMs(s.endTime)} | ${dur}秒] ${s.text}`;
      })
      .join("\n");

    const reviewSystemPrompt = `你是一个短视频剪辑方案审核助手。用户正在审核你之前生成的文案方案，你可以：

▸ 解释为什么选择某条字幕 / 放弃另一条
▸ 讨论七维评分（开场钩子、沉浸共鸣、干货密度、节奏掌控、人设差异、传播共鸣、可信背书）在各条字幕上的体现
▸ 根据用户的反馈调整选择——说明如果替换某条，时长和节奏会有什么变化
▸ 回答关于网感编排和节奏控制的任何问题

回答要求：
- 语言简洁直接，聚焦用户问的具体问题
- 如果用户提出替换建议，分析利弊后给出明确推荐
- 引用具体的字幕编号和内容，让用户知道你在说哪一条

当前方案信息：
- 话题方向：${conv.topic || "未指定"}
- 人设画像：${conv.speakerPersona || "未指定"}
- 目标人群：${conv.audiencePersona || "未指定"}
- 目标时长：${conv.durationRequirement || "未指定"}
- 总匹配片段数：${matchedSubs.value.length}
- 当前选中片段数：${matchedSubs.value.filter((_, i) => !removedIndices.value.has(i)).length}

生成方案（含七维评分）：
${conv.generatedScript.slice(0, 8000)}

当前选中字幕列表：
${selectedLines}`;

    let fullResponse = "";
    const result = await callAI(
      "",
      input,
      [],
      "",
      "",
      "",
      0,
      0,
      0,
      model,
      (chunk) => {
        fullResponse = chunk;
      },
      reviewSystemPrompt,
    );
    reviewMessages.value.push({
      role: "ai",
      text: result.text,
      time: Date.now(),
    });
  } catch (e: any) {
    reviewMessages.value.push({
      role: "ai",
      text: `审核对话出错: ${e.message || "未知错误"}`,
      time: Date.now(),
    });
  } finally {
    reviewSending.value = false;
  }
}

/** 从审核对话中解析 AI 的修改建议并应用到 matchedSubs（仅解析最后一条 AI 消息） */
function applyReviewChanges(): { removed: number; replaced: number } {
  const aiMessages = reviewMessages.value.filter((m) => m.role === "ai");
  if (aiMessages.length === 0) return { removed: 0, replaced: 0 };

  const toRemove = new Set<number>(); // matchedSubs 索引
  const toAdd: SubtitleEntry[] = [];

  // 仅解析最后一条 AI 消息，避免历史讨论被误匹配
  const lastMsg = aiMessages[aiMessages.length - 1];

  // 模式1: "移除 #N" / "删除 #N" / "去掉 #N" → 标记删除
  const removeRe = /(?:移除|删除|去掉)\s*#(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = removeRe.exec(lastMsg.text)) !== null) {
    const selectedIdx = parseInt(match[1], 10) - 1;
    let count = 0;
    for (let i = 0; i < matchedSubs.value.length; i++) {
      if (!removedIndices.value.has(i)) {
        if (count === selectedIdx) {
          toRemove.add(i);
          break;
        }
        count++;
      }
    }
  }

  // 模式2: "替换 #N 为 #M" → 删除 #N，从 sourceEntries 添加 #M
  const replaceRe = /(?:替换|换成|改用)\s*#(\d+)\s*(?:为|→|->|用)\s*#(\d+)/g;
  while ((match = replaceRe.exec(lastMsg.text)) !== null) {
    const selectedIdx = parseInt(match[1], 10) - 1;
    const sourceIdx = parseInt(match[2], 10) - 1;
    let count = 0;
    for (let i = 0; i < matchedSubs.value.length; i++) {
      if (!removedIndices.value.has(i)) {
        if (count === selectedIdx) {
          toRemove.add(i);
          break;
        }
        count++;
      }
    }
    if (sourceIdx >= 0 && sourceIdx < sourceEntries.value.length) {
      toAdd.push(sourceEntries.value[sourceIdx]);
    }
  }

  // 模式3: "添加 #N" / "加入 #N" → 从 sourceEntries 添加
  const addRe = /(?:添加|加入|补充)\s*#(\d+)/g;
  while ((match = addRe.exec(lastMsg.text)) !== null) {
    const sourceIdx = parseInt(match[1], 10) - 1;
    if (sourceIdx >= 0 && sourceIdx < sourceEntries.value.length) {
      const entry = sourceEntries.value[sourceIdx];
      // 避免重复添加
      if (
        !matchedSubs.value.some(
          (s) =>
            s.videoId === entry.videoId && s.startTime === entry.startTime,
        )
      ) {
        toAdd.push(entry);
      }
    }
  }

  // 应用删除
  if (toRemove.size > 0) {
    const newRemoved = new Set(removedIndices.value);
    for (const idx of toRemove) newRemoved.add(idx);
    removedIndices.value = newRemoved;
  }

  // 应用添加
  let addedCount = 0;
  for (const entry of toAdd) {
    // 补全 videoPath
    const video = store.importedVideos.find((v) => v.id === entry.videoId);
    if (video) entry.videoPath = video.path;
    matchedSubs.value.push(entry);
    addedCount++;
  }

  return { removed: toRemove.size, replaced: addedCount };
}

/** 确认方案，进入微调 */
function confirmScheme() {
  if (matchedSubs.value.length === 0) {
    ElMessage.warning("没有匹配的片段，请先生成方案");
    return;
  }

  // 应用审核对话中 AI 的修改建议
  const changes = applyReviewChanges();

  // 执行五层评测：基于七维评分 + 创作者画像 + 平台信息
  runFiveLayerEvaluation();

  reviewPhase.value = "tuning";
  const parts: string[] = ["已进入微调"];
  if (changes.removed > 0) parts.push(`自动移除了 ${changes.removed} 个片段`);
  if (changes.replaced > 0) parts.push(`补充了 ${changes.replaced} 个片段`);
  parts.push("可在此进一步微调后导出剪映");
  ElMessage.success(parts.join("，"));
}

/** 运行五层评测（基于七维评分 + 画像 + 平台信息，本地计算） */
function runFiveLayerEvaluation() {
  const conv = conversations.value.find((c) => c.id === activeConvId.value);
  if (!conv || !sevenDimScores.value) return;

  // 构造简化的 persona 和 value（基于对话中的数据）
  const persona: PersonaEval = {
    ageMatch: conv.creatorAge ? 60 : 50,
    ageFeedback: conv.creatorAge ? `创作者年龄 ${conv.creatorAge} 岁` : '',
    trackTrust: conv.creatorTrack ? 65 : 50,
    trackTrustFeedback: conv.creatorTrack ? `赛道：${conv.creatorTrack}` : '',
  };

  const value: ValueEval = {
    practicality: 60,
    practicalityFeedback: '',
    gain: 65,
    gainFeedback: '',
    easyExecute: 55,
    easyExecuteFeedback: '',
  };

  // 平台合规检查
  let platformCheck = null;
  if (conv.targetPlatform) {
    platformCheck = {
      hasViolation: false,
      violations: [],
      styleMatch: 70,
      suggestions: [],
    };
  }

  const report = mapToFiveLogic(sevenDimScores.value, persona, value, platformCheck);
  conv.fiveLogic = report;
  saveConversations();
}

/** 基于审核对话反馈重新执行 6b+6c */
async function handleRegenerateWithFeedback() {
  const conv = conversations.value.find((c) => c.id === activeConvId.value);
  if (!conv) return;

  // 收集用户反馈
  const userFeedback = reviewMessages.value
    .filter(m => m.role === 'user')
    .map(m => m.text)
    .join('\n');

  if (!userFeedback.trim()) {
    // 没有反馈，重新执行 6b
    await continuePhase6b();
    if (phase6bScript.value) await continuePhase6c();
    return;
  }

  // 将反馈内容添加到 6b prompt 中
  ElMessage.info('正在基于你的反馈重新生成...');
  reviewMessages.value.push({
    role: 'user',
    text: `【反馈驱动重新生成】已根据你的 ${reviewMessages.value.filter(m => m.role === 'user').length} 条反馈重新执行挑选和编排。`,
    time: Date.now(),
  } as any);

  // 重新执行 6b+6c（保留去重结果）
  await continuePhase6b();
  if (phase6bScript.value) await continuePhase6c();

  if (conv.generatedScript) {
    ElMessage.success('基于反馈的重新生成完成！');
  }
}

/** 应用并导出为剪映工程 */
async function handleApply() {
  if (selectedSubs.value.length === 0) {
    ElMessage.warning("没有选中的片段，请先微调保留至少一个片段");
    return;
  }

  const conv = conversations.value.find((c) => c.id === activeConvId.value);

  // 用第一个选中字幕的视频分辨率作为画布尺寸
  const firstSub = selectedSubs.value[0];

  // 帧 → 毫秒：使用第一个片段对应视频的实际帧率
  const firstSourceFps =
    sourceList.value.find((s) => s.id === firstSub.videoId)?.fps || 30;
  const clipGapMs = Math.round(
    ((conv?.frameGap ?? 5) * 1000) / (firstSourceFps > 0 ? firstSourceFps : 30),
  );

  // 自动生成工程名称（ElMessageBox.prompt 在 Electron 中可能不显示）
  const projectName = `剪映工程_${new Date().toLocaleDateString().replace(/\//g, "-")}`;
  const firstVideo = store.importedVideos.find(
    (v) => v.id === firstSub.videoId,
  );
  const canvasW = firstVideo?.width || 1080;
  const canvasH = firstVideo?.height || 1920;

  const clipItems = selectedSubs.value.map((s) => ({
    sourceFile: s.videoPath,
    sourceFileName: s.videoName,
    startMs: s.startTime,
    endMs: s.endTime,
  }));

  // 不使用字幕文本轨道（前面已验证字幕导出有问题）
  const subtitleItems: Array<{ text: string; startMs: number; endMs: number }> =
    [];

  try {
    const project = buildProject(
      clipItems,
      subtitleItems,
      projectName,
      canvasW,
      canvasH,
      clipGapMs,
    );
    const result = await exportJianyingProject(
      project,
      store.jianyingDraftPath,
      () => {},
    );

    if (result.success) {
      ElMessage.success(`已导出到剪映草稿: ${result.projectPath}`);
    } else {
      ElMessage.error("导出失败");
    }
  } catch (e: any) {
    ElMessage.error("导出失败: " + (e.message || "未知错误"));
  }
}

function renderScript(text: string): string {
  // 先做结构替换（依赖换行），再转 <br>
  let result = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  result = result
    .replace(/^## (.+?)$/gm, '<div class="script-section">$1</div>')
    .replace(/^#(\d+)(.*?)$/gm, '<span class="script-idx">#$1</span>$2')
    .replace(/\n/g, "<br>");
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return result;
}

// ===== 生命周期 =====
onMounted(async () => {
  loadConversations();
  loadSavedSettings();
  if (conversations.value.length > 0) {
    activeConvId.value = conversations.value[0].id;
  } else {
    newConversation();
  }
  await nextTick();
  if (store.storagePath) scanDiskSubtitles();
});
</script>

<style scoped>
.workflow-panel {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
  background: #f5f6fa;
}

/* 左侧对话列表 */
.wf-sidebar {
  width: 220px;
  min-width: 220px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  padding: 10px;
  transition: all 0.2s;
  overflow: hidden;
}

.wf-sidebar.collapsed {
  width: 46px;
  min-width: 46px;
  padding: 10px 6px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.conv-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  gap: 4px;
  transition: background 0.15s;
}

.conv-item:hover {
  background: #f0f2f5;
}
.conv-item.active {
  background: #ecf5ff;
}

.conv-item .el-button {
  visibility: hidden;
  margin-left: auto;
}

.conv-item:hover .el-button {
  visibility: visible;
}

.conv-title {
  font-size: 12px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.conv-time {
  font-size: 10px;
  color: #c0c4cc;
  flex-shrink: 0;
}

.conv-empty {
  text-align: center;
  color: #c0c4cc;
  font-size: 12px;
  padding: 20px 0;
}

/* 右侧工作区 */
.wf-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wf-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #ecf5ff;
  font-size: 13px;
  color: #409eff;
  flex-shrink: 0;
}

.wf-body {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 16px;
  overflow: hidden;
}

/* 左侧输入区 */
.wf-left {
  width: 320px;
  min-width: 280px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

/* 右侧结果区 */
.wf-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* 阶段指示条 */
.phase-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  margin-bottom: 8px;
  background: #f5f7fa;
  border-radius: 6px;
  flex-shrink: 0;
}
.phase-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #dcdfe6;
  transition: background 0.3s;
}
.phase-dot.active {
  background: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.2);
}
.phase-dot.done {
  background: #67c23a;
}
.phase-label {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
}
.phase-dot.active + .phase-label {
  color: #409eff;
  font-weight: 600;
}
.phase-arrow {
  font-size: 10px;
  color: #c0c4cc;
}

/* 卡片 */
.wf-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.param-row:last-child {
  margin-bottom: 0;
}

.param-row .param-label {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  white-space: nowrap;
  min-width: 56px;
  margin-bottom: 0;
}

.param-row .el-input {
  flex: 1;
}

.param-slider-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}

.param-edge {
  font-size: 11px;
  color: #c0c4cc;
  white-space: nowrap;
  line-height: 1;
}

/* 数据源选择 */
.source-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #e6a23c;
  padding: 4px 0;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.source-item:hover {
  background: #f0f2f5;
}
.source-item.selected {
  background: #ecf5ff;
}

.source-name {
  font-size: 12px;
  color: #303133;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-sub-count {
  font-size: 11px;
  color: #909399;
  flex-shrink: 0;
}

/* 加载态 */
.wf-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 32px 16px;
  color: #909399;
  font-size: 14px;
}

/* 生成详情日志 */
.gen-log-card {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

.gen-log-header {
  padding: 6px 12px;
  background: #fafbfc;
  user-select: none;
}

.gen-log-body {
  padding: 6px 12px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

.log-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.log-label {
  color: #909399;
}

.log-val {
  color: #303133;
  font-weight: 600;
}

/* 生成结果 */
.result-card {
  margin-top: 4px;
}
.script-text :deep(.script-section) {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 12px 0 4px;
  padding: 4px 0;
  border-bottom: 1px solid #ebeef5;
}
.script-text :deep(.script-idx) {
  display: inline-block;
  background: #ecf5ff;
  color: #409eff;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 12px;
  font-weight: 500;
  margin-right: 4px;
}

/* AI 分析面板 */
.ai-analysis {
  margin: 8px 0;
  padding: 6px 10px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}
.ai-analysis summary {
  outline: none;
  user-select: none;
}
.ai-analysis summary::-webkit-details-marker {
  display: none;
}
.analysis-text {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid #ebeef5;
  max-height: 240px;
  overflow-y: auto;
}

/* 匹配信息 */
.match-info {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f0f2f5;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #909399;
}

/* 微调片段 */
.tune-section {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f0f2f5;
}

.tune-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}

.tune-list {
  max-height: 240px;
  overflow-y: auto;
}

.tune-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.tune-item:hover {
  background: #f5f7fa;
}
.tune-item.removed {
  opacity: 0.35;
  text-decoration: line-through;
}

.tune-idx {
  color: #909399;
  min-width: 18px;
  flex-shrink: 0;
}

.tune-video {
  color: #409eff;
  background: #ecf5ff;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 11px;
  flex-shrink: 0;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tune-time {
  color: #909399;
  font-size: 11px;
  flex-shrink: 0;
  font-family: monospace;
}

.tune-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #606266;
}

/* 空状态 */
.wf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px;
  color: #c0c4cc;
}

/* 步骤 2：画像 + 参考文案 */
.field-block {
  margin-bottom: 2px;
}

.field-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 6px;
  font-weight: 500;
}

.field-hint {
  font-weight: 400;
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}

.field-divider {
  height: 1px;
  background: #ebeef5;
  margin: 12px 0;
}

.ref-copy-item {
  display: flex;
  gap: 4px;
  align-items: flex-start;
  margin-bottom: 6px;
}

.ref-copy-item .el-textarea {
  flex: 1;
}

.ref-copy-delete {
  flex-shrink: 0;
  font-size: 16px;
  color: #909399;
  padding: 2px 4px;
  min-height: auto;
}

/* 步骤 2：重新设计的布局 */
.step2-section {
  margin-bottom: 12px;
}

.step2-section:last-child {
  margin-bottom: 0;
}

.step2-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.step2-row {
  display: flex;
  gap: 10px;
}

.step2-col {
  flex: 1;
  min-width: 0;
}

.step2-field-label {
  display: block;
  font-size: 12px;
  color: #606266;
  font-weight: 500;
  margin-bottom: 4px;
}

.step2-field {
  margin-bottom: 10px;
}

.step2-field:last-child {
  margin-bottom: 0;
}

/* 高级配置折叠面板 */
.step2-advanced {
  margin-top: 10px;
  border-top: 1px dashed #e4e7ed;
  padding-top: 10px;
}

.step2-advanced-summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}

.step2-advanced-summary :last-child {
  font-weight: 400;
  font-size: 11px;
  color: #909399;
}

.step2-advanced-body {
  margin-top: 10px;
  padding: 10px 12px;
  background: #f8f9fb;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}

/* 四列内联网格 */
.step2-inline-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr 0.8fr 1fr;
  gap: 8px;
}

.step2-inline-item {
  min-width: 0;
}

.step2-mini-label {
  display: block;
  font-size: 11px;
  color: #909399;
  margin-bottom: 3px;
}

/* 方案模式选择器（步骤6） */
.scheme-mode-selector {
  margin: 10px 0 6px;
}

.scheme-mode-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 6px;
  font-weight: 500;
}

.scheme-mode-options {
  display: flex;
  gap: 8px;
}

.scheme-option {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1.5px solid #e4e7ed;
  background: #fafafa;
  cursor: pointer;
  transition: all 0.2s;
}

.scheme-option:hover {
  border-color: #c0c4cc;
  background: #f5f5f5;
}

.scheme-option.active {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 1px 4px rgba(64, 158, 255, 0.15);
}

.scheme-option-icon {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1;
}

.scheme-option-body {
  flex: 1;
  min-width: 0;
}

.scheme-option-title {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 2px;
}

.scheme-option.active .scheme-option-title {
  color: #409eff;
}

.scheme-option-desc {
  font-size: 11px;
  color: #909399;
  line-height: 1.4;
}

/* 步骤 5：去气口 */
.step-desc {
  font-size: 12px;
  color: #909399;
  margin: 2px 0 0;
  line-height: 1.5;
}

.gap-stats {
  margin-top: 8px;
  padding: 8px 10px;
  background: #f5f7fa;
  border-radius: 6px;
}

.gap-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: 12px;
  color: #606266;
}

.gap-stat-row strong {
  font-size: 13px;
  font-weight: 600;
}

/* 步骤 6：AI 阶段进度 */
.ai-stage-progress {
  margin: 10px 0 8px;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}

.ai-stage {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 12px;
  color: #c0c4cc;
  transition: color 0.3s;
}

.ai-stage.active {
  color: #409eff;
  font-weight: 500;
}

.ai-stage.done {
  color: #67c23a;
}

.stage-dot {
  font-size: 11px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.stage-label {
  line-height: 1.4;
}

/* 阶段结果展示 */
.phase-result {
  margin: 10px 0 8px;
  padding: 10px 12px;
  background: #f0f9ff;
  border-radius: 6px;
  border: 1px solid #d9ecff;
}

.phase-result-title {
  font-size: 12px;
  font-weight: 600;
  color: #409eff;
  margin-bottom: 6px;
}

.phase-result-body {
  font-size: 13px;
  color: #303133;
}

/* 七维评分横向条形图 */
.score-dim-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 11px;
}

.score-dim-label {
  width: 60px;
  flex-shrink: 0;
  font-weight: 500;
  text-align: right;
}

.score-dim-bar-wrap {
  flex: 1;
  height: 10px;
  background: #f0f0f0;
  border-radius: 5px;
  overflow: hidden;
}

.score-dim-bar {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease;
  min-width: 2px;
}

.score-dim-val {
  width: 28px;
  flex-shrink: 0;
  text-align: center;
  font-weight: 600;
  color: #303133;
}

/* 步骤 7：质量评分紧凑卡片 */
.quality-compact {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fafbfc;
  overflow: hidden;
}

.qc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}

.qc-score-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 24px;
  padding: 0 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.qc-label {
  font-size: 12px;
  color: #606266;
  font-weight: 500;
}

.qc-retry {
  font-size: 11px;
  color: #e6a23c;
}

.qc-toggle {
  font-size: 11px;
  color: #909399;
  cursor: pointer;
  user-select: none;
  padding: 2px 6px;
  border-radius: 3px;
  transition: all 0.15s;
}

.qc-toggle:hover {
  color: #409eff;
  background: #ecf5ff;
}

.qc-toggle.active {
  color: #409eff;
  font-weight: 500;
}

.qc-body {
  padding: 6px 10px;
  border-top: 1px solid #f0f0f0;
}

.qc-body--logic {
  border-top: none;
  padding-top: 2px;
}

.qc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 12px;
}

.qc-dim {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.qc-dim-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.qc-dim-name {
  color: #606266;
  flex: 1;
}

.qc-dim-val {
  font-weight: 600;
  font-size: 12px;
  min-width: 22px;
  text-align: right;
}

.qc-logic-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.qc-logic-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
}

.qc-logic-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.qc-logic-name {
  color: #909399;
}

.qc-logic-val {
  font-weight: 600;
  color: #303133;
}

/* 去气口预览列表 */
.compact-preview {
  font-size: 12px;
}

.compact-video-label {
  color: #409eff;
  font-size: 11px;
  font-weight: 600;
  padding: 8px 8px 4px;
  border-top: 1px dashed #ebeef5;
  margin-top: 4px;
}

.compact-video-label:first-child {
  border-top: none;
  margin-top: 0;
}

.compact-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.compact-item:nth-child(even) {
  background: #fafafa;
}

.compact-item:hover {
  background: #f0f2f5;
}

.compact-idx {
  color: #409eff;
  font-weight: 600;
  font-size: 11px;
  font-family: "SF Mono", "Consolas", monospace;
  flex-shrink: 0;
  min-width: 28px;
}

.compact-time {
  color: #909399;
  font-size: 11px;
  font-family: "SF Mono", "Consolas", monospace;
  flex-shrink: 0;
  min-width: 90px;
}

.compact-text {
  color: #303133;
  line-height: 1.5;
  word-break: break-word;
}

/* 方案审核对话 */
.review-hint {
  color: #909399;
  font-size: 12px;
  line-height: 1.8;
}

.review-hint ul {
  margin: 6px 0 0 16px;
  padding: 0;
}

.review-hint li {
  color: #409eff;
  cursor: pointer;
  margin-bottom: 2px;
}

.review-msg {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
}

.review-msg--user {
  background: #ecf5ff;
  border-left: 3px solid #409eff;
}

.review-msg--ai {
  background: #f5f7fa;
  border-left: 3px solid #67c23a;
}

.review-msg--system {
  background: #fdf6ec;
  border-left: 3px solid #e6a23c;
}

.review-msg--system .review-msg-label {
  color: #e6a23c;
}

.review-msg--system summary::-webkit-details-marker {
  display: none;
}

.review-msg-label {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  color: #909399;
}

.review-msg--user .review-msg-label {
  color: #409eff;
}

.review-msg--ai .review-msg-label {
  color: #67c23a;
}

.review-msg-text {
  color: #303133;
  word-break: break-word;
}

/* 字幕条视图 */
.subtitle-strip-view {
  padding: 8px 8px 28px 8px;
  position: relative;
}

.strip-track {
  margin: 6px 0 12px 0;
  position: relative;
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  min-height: 24px;
}

.strip-video-label {
  font-size: 11px;
  font-weight: 600;
  color: #606266;
  padding: 4px 0 0 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.strip-video-label::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
  background: var(--label-color, #409eff);
}

.strip-seg {
  position: absolute;
  height: 22px;
  border-radius: 3px;
  cursor: pointer;
  transition:
    filter 0.15s,
    transform 0.1s;
  overflow: hidden;
  min-width: 2px;
  display: flex;
  align-items: center;
}

.strip-seg:hover {
  filter: brightness(0.88);
  transform: scaleY(1.2);
  z-index: 10;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.strip-seg-text {
  font-size: 10px;
  color: #fff;
  padding: 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.strip-ruler {
  position: relative;
  height: 20px;
  border-top: 1px solid #dcdfe6;
  margin-top: 4px;
}

.strip-tick {
  position: absolute;
  font-size: 10px;
  color: #909399;
  transform: translateX(-50%);
  top: 2px;
  white-space: nowrap;
}

.strip-tick::before {
  content: "";
  display: block;
  height: 6px;
  width: 1px;
  background: #dcdfe6;
  margin: 0 auto;
}
</style>
