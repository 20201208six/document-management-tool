<template>
  <div class="workflow-panel">
    <!-- 左侧：对话列表 -->
    <div class="wf-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <span v-if="!sidebarCollapsed" class="sidebar-title">对话列表</span>
        <el-button size="small" circle @click="sidebarCollapsed = !sidebarCollapsed">
          <el-icon><ArrowLeft v-if="!sidebarCollapsed" /><ArrowRight v-else /></el-icon>
        </el-button>
      </div>
      <el-button
        v-if="!sidebarCollapsed"
        type="primary"
        size="small"
        style="width:100%;margin-bottom:8px"
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
          <div class="conv-title">{{ conv.title || '未命名对话' }}</div>
          <div class="conv-time">{{ formatConvTime(conv.createdAt) }}</div>
          <el-button size="small" text type="danger" @click.stop="deleteConversation(conv.id)">
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
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span v-if="sourceList.length > 0" style="font-size:12px;color:#606266">
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
            <div v-else-if="sourceList.length === 0 && !scanning" class="source-hint">
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
                <span class="source-sub-count">{{ src.subtitleCount }} 条字幕</span>
              </div>
            </div>

            <div v-if="sourceList.length > 0" style="margin-top:8px;display:flex;gap:8px">
              <el-button size="small" text @click="selectAllSources">全选</el-button>
              <el-button size="small" text @click="deselectAllSources">取消全选</el-button>
            </div>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 2：文案方向 / 画像配置</div>

            <div class="field-block">
              <div class="field-label">文案方向</div>
              <el-input
                v-model="currentConv.topic"
                type="textarea"
                :rows="2"
                placeholder="例如：「做一个关于时间管理的励志视频脚本」"
              />
            </div>

            <div class="field-divider"></div>

            <div class="field-block">
              <div class="field-label">人设画像 <span class="field-hint">你是谁？</span></div>
              <el-input
                v-model="currentConv.speakerPersona"
                type="textarea"
                :rows="2"
                placeholder="例：10年互联网运营老兵，擅长用自嘲讲干货"
                @change="onConvDirty"
              />
            </div>

            <div class="field-block">
              <div class="field-label">人群画像 <span class="field-hint">给谁看？</span></div>
              <el-input
                v-model="currentConv.audiencePersona"
                type="textarea"
                :rows="2"
                placeholder="例：25-35岁职场新人，焦虑但想进步"
                @change="onConvDirty"
              />
            </div>

            <div class="field-divider"></div>

            <div class="field-block">
              <div class="field-label">参考文案 <span class="field-hint">选填，可多条</span></div>
              <div v-for="(_, idx) in currentConv.referenceCopies" :key="idx" class="ref-copy-item">
                <el-input
                  :model-value="currentConv.referenceCopies[idx]"
                  type="textarea"
                  :rows="2"
                  :placeholder="`参考文案 ${idx + 1}`"
                  @update:model-value="(v: string) => updateReferenceCopy(idx, v)"
                />
                <el-button class="ref-copy-delete" size="small" text type="danger" @click="removeReferenceCopy(idx)">
                  &times;
                </el-button>
              </div>
              <el-button v-if="!currentConv.referenceCopies || currentConv.referenceCopies.length < 5" size="small" text type="primary" @click="addReferenceCopy">
                + 添加参考文案
              </el-button>
            </div>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 3：输出控制</div>

            <div class="param-row">
              <span class="param-label">时长要求</span>
              <el-input
                v-model="currentConv.durationRequirement"
                size="small"
                placeholder="如：五分钟以上 / 3-4分钟"
                clearable
                @change="onConvDirty"
              />
            </div>

            <div class="param-row">
              <span class="param-label">句子间隔</span>
              <div class="param-slider-wrap">
                <span class="param-edge">1帧</span>
                <el-slider
                  v-model="currentConv.frameGap"
                  :min="1"
                  :max="10"
                  :step="1"
                  size="small"
                  style="flex:1"
                  @change="onConvDirty"
                />
                <span class="param-edge">10帧</span>
              </div>
            </div>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 4：选择模型</div>
            <el-radio-group v-model="selectedModelId" size="small">
              <el-radio v-for="m in chatStore.models" :key="m.id" :value="m.id">
                {{ m.name }}
              </el-radio>
            </el-radio-group>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 5：计算时长 / 去气口</div>
            <p class="step-desc">根据句子间隔设置，分析气口分布并计算总时长</p>

            <div v-if="gapStats" class="gap-stats">
              <div class="gap-stat-row">
                <span>视频帧率</span><strong>{{ selectedSourcesFps.join(' / ') }}</strong>
              </div>
              <div class="gap-stat-row">
                <span>句子间隔</span><strong>{{ currentConv.frameGap }}帧 ≈ {{ gapThresholdMsDisplay }}</strong>
              </div>
              <div class="gap-stat-row">
                <span>字幕总数</span><strong>{{ gapStats.totalSegments }}</strong>
              </div>
              <div class="gap-stat-row" style="border-top:1px dashed #ebeef5;padding-top:8px;margin-top:4px">
                <span style="color:#909399">句间气口</span><strong>{{ gapStats.segGaps }}<span v-if="gapStats.removableSegGaps" style="color:#67c23a;font-size:10px;margin-left:4px">可去{{ gapStats.removableSegGaps }}</span></strong>
              </div>
              <div class="gap-stat-row">
                <span style="color:#909399">字间气口</span><strong>{{ gapStats.wordGaps }}<span v-if="gapStats.removableWordGaps" style="color:#67c23a;font-size:10px;margin-left:4px">可去{{ gapStats.removableWordGaps }}</span></strong>
              </div>
              <div class="gap-stat-row">
                <span>去除后节省</span><strong style="color:#67c23a">{{ store.formatTime(gapStats.savedMs / 1000) }}</strong>
              </div>
              <div class="gap-stat-row">
                <span>原始总时长</span><strong>{{ store.formatTime(gapStats.originalDurationSec) }}</strong>
              </div>
              <div class="gap-stat-row">
                <span>去气口后时长</span><strong style="color:#409eff">{{ store.formatTime(gapStats.compactDurationSec) }}</strong>
              </div>
            </div>
            <div v-else class="step-desc" style="color:#c0c4cc">选择数据源后点击下方按钮分析</div>

            <el-button
              size="small"
              :disabled="selectedSourceIds.size === 0"
              :loading="computingGap"
              @click="computeGaps"
              style="width:100%;margin-top:8px"
            >
              计算时长并分析气口
            </el-button>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 6：AI 智能处理</div>
            <p class="step-desc">大模型将分三阶段处理：去重优化 → 时间轴文案 → 网感编排</p>

            <div class="ai-stage-progress" v-if="isGenerating">
              <div class="ai-stage" v-for="(stage, i) in aiStages" :key="i"
                :class="{ active: i === currentAiStage, done: i < currentAiStage }">
                <span class="stage-dot">{{ i < currentAiStage ? '✓' : i === currentAiStage ? '●' : '○' }}</span>
                <span class="stage-label">{{ stage }}</span>
              </div>
            </div>

            <el-button
              type="primary"
              size="default"
              :loading="isGenerating"
              :disabled="selectedSourceIds.size === 0 || !currentConv.topic.trim()"
              @click="handleGenerate"
              style="width:100%"
            >
              <el-icon><MagicStick /></el-icon>
              {{ isGenerating ? 'AI 处理中...' : '开始 AI 处理' }}
            </el-button>
          </div>

          <div v-if="isGenerating" class="wf-loading">
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
            <span>{{ statusText }}</span>
          </div>

          <!-- 生成详情日志 -->
          <div v-if="genLog || isGenerating" class="gen-log-card">
            <div class="gen-log-header" @click="showGenLog = !showGenLog" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:12px;font-weight:600;color:#606266">
                <el-icon :size="14"><InfoFilled /></el-icon> 生成详情
              </span>
              <el-icon :size="14" style="transition:transform .2s" :style="{ transform: showGenLog ? 'rotate(90deg)' : '' }">
                <ArrowRight />
              </el-icon>
            </div>
            <div v-show="showGenLog" class="gen-log-body">
              <div class="log-item" v-if="genLog">
                <span class="log-label">发送 Token</span>
                <span class="log-val">{{ genLog.promptTokens.toLocaleString() }}</span>
              </div>
              <div class="log-item" v-if="genLog">
                <span class="log-label">返回 Token</span>
                <span class="log-val">{{ genLog.completionTokens.toLocaleString() }}</span>
              </div>
              <div class="log-item" v-if="genLog">
                <span class="log-label">输出字数</span>
                <span class="log-val">{{ genLog.charsOut }} 字</span>
              </div>
              <div class="log-item" v-if="genLog && genLog.truncated">
                <span class="log-label" style="color:#e6a23c">注意</span>
                <span class="log-val" style="color:#e6a23c">输入数据超长已截断</span>
              </div>
              <div class="log-item" v-if="!genLog">
                <span class="log-label">状态</span>
                <span class="log-val" style="color:#409eff">流式返回中...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：结果区（步骤 7） -->
        <div class="wf-right">
          <!-- ===== 流式生成中 ===== -->
          <div v-if="isGenerating" class="wf-card result-card" style="flex:1;display:flex;flex-direction:column;min-height:0">
            <div class="card-title" style="flex-shrink:0">步骤 7：AI 处理中...</div>
            <div class="script-text" style="flex:1;overflow-y:auto;min-height:0" v-html="renderScript(streamingScript || '等待返回...')"></div>
          </div>

          <!-- ===== Phase 2: 微调阶段 ===== -->
          <div v-else-if="currentConv.generatedScript && reviewPhase === 'tuning'" class="wf-card result-card" style="flex:1;display:flex;flex-direction:column;min-height:0">
            <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
              <span>步骤 7：微调片段</span>
              <div style="display:flex;gap:6px">
                <el-button size="small" text @click="reviewPhase = 'review'">&lt; 返回审核</el-button>
                <el-button size="small" type="primary" @click="handleApply" :disabled="selectedSubs.length === 0 || isGenerating">
                  <el-icon><Check /></el-icon> 导出剪映
                </el-button>
              </div>
            </div>

            <!-- 主：朗读预览 -->
            <div v-if="matchedSubs.length > 0" class="script-text" style="flex:1;overflow-y:auto;min-height:0" v-html="renderScript(readableScript)"></div>

            <!-- AI 分析（可折叠） -->
            <details v-if="currentConv.generatedScript" class="ai-analysis" style="flex-shrink:0">
              <summary style="cursor:pointer;font-size:12px;color:#909399;padding:4px 0">AI 筛选剔除 & 编排 & 节奏审查 & 时长</summary>
              <div v-html="renderScript(aiAnalysisOnly)" class="analysis-text"></div>
            </details>

            <!-- 匹配信息 -->
            <div v-if="matchedSubs.length > 0" class="match-info" style="flex-shrink:0">
              <span>片段: {{ selectedSubs.length }} / {{ matchedSubs.length }} 个</span>
              <span>总时长: {{ store.formatTime(totalMatchDuration) }}</span>
            </div>

            <!-- 微调列表 -->
            <div v-if="matchedSubs.length > 0" class="tune-section" style="flex-shrink:0;overflow:hidden;display:flex;flex-direction:column;max-height:180px">
              <div class="tune-header">
                <span>微调片段</span>
                <el-button v-if="removedIndices.size > 0" size="small" text type="primary" @click="removedIndices.clear()">恢复全部</el-button>
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
                  <span class="tune-time">{{ store.formatTimeMs(sub.startTime) }} - {{ store.formatTimeMs(sub.endTime) }}</span>
                  <span class="tune-text">{{ sub.text }}</span>
                  <el-button size="small" circle text type="danger" @click.stop="toggleRemove(idx)" :title="removedIndices.has(idx) ? '恢复' : '移除'">
                    <el-icon><Close v-if="removedIndices.has(idx)" /><Minus v-else /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- ===== Phase 1: 方案审核阶段 ===== -->
          <div v-else-if="currentConv.generatedScript" class="wf-card result-card" style="flex:1;display:flex;flex-direction:column;min-height:0">
            <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
              <span>步骤 7：方案审核</span>
              <span v-if="matchedSubs.length > 0" style="font-size:11px;color:#909399;font-weight:400">
                匹配 {{ matchedSubs.length }} 段 · {{ store.formatTime(totalMatchDuration) }}
              </span>
            </div>

            <!-- 生成结果预览（可折叠） -->
            <details v-if="matchedSubs.length > 0" style="flex-shrink:0;margin-bottom:8px">
              <summary style="cursor:pointer;font-size:12px;color:#409eff;padding:4px 0">📋 查看生成文案</summary>
              <div class="script-text" style="max-height:200px;overflow-y:auto;margin-top:4px" v-html="renderScript(readableScript)"></div>
            </details>

            <!-- AI 分析（可折叠） -->
            <details v-if="currentConv.generatedScript" class="ai-analysis" style="flex-shrink:0;margin-bottom:8px">
              <summary style="cursor:pointer;font-size:12px;color:#909399;padding:4px 0">📊 AI 筛选 & 编排分析</summary>
              <div v-html="renderScript(aiAnalysisOnly)" class="analysis-text"></div>
            </details>

            <!-- 对话区 -->
            <div class="review-chat" style="flex:1;overflow-y:auto;min-height:0;border-top:1px solid #ebeef5;padding-top:8px">
              <!-- 第一条系统消息：发送给 AI 的完整输入 -->
              <div v-if="sentPrompt" class="review-msg review-msg--system">
                <details>
                  <summary class="review-msg-label" style="cursor:pointer;display:inline">📋 AI 收到的完整输入</summary>
                  <div class="review-msg-text" style="margin-top:6px" v-html="renderScript(sentPrompt)"></div>
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
              <div v-for="(msg, i) in reviewMessages" :key="i" class="review-msg" :class="'review-msg--' + msg.role">
                <div class="review-msg-label">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
                <div class="review-msg-text" v-html="renderScript(msg.text)"></div>
              </div>

              <!-- AI 正在回复... -->
              <div v-if="reviewSending" class="review-msg review-msg--ai">
                <div class="review-msg-label">AI</div>
                <div class="review-msg-text" style="color:#909399">思考中...</div>
              </div>
            </div>

            <!-- 输入区 -->
            <div class="review-input-area" style="flex-shrink:0;display:flex;gap:8px;align-items:flex-end;margin-top:8px">
              <el-input
                v-model="reviewInput"
                type="textarea"
                :rows="1"
                placeholder="询问 AI 处理逻辑..."
                resize="none"
                @keydown.enter.exact.prevent="sendReviewMessage"
                :disabled="reviewSending"
                style="flex:1"
              />
              <el-button size="small" type="primary" @click="sendReviewMessage" :loading="reviewSending" :disabled="!reviewInput.trim()">发送</el-button>
            </div>

            <!-- 确认按钮 -->
            <div style="flex-shrink:0;margin-top:10px;text-align:center">
              <el-button type="success" size="small" @click="confirmScheme" :disabled="matchedSubs.length === 0">
                <el-icon><Check /></el-icon> 确认方案，进入微调
              </el-button>
            </div>
          </div>

          <!-- 气口处理结果预览（算完气口后、AI 处理前展示） -->
          <div v-else-if="gapStats && compactedSubtitles.length > 0" class="wf-card result-card" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
            <div class="card-title" style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between">
              <span>步骤 7：气口处理结果</span>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:11px;color:#909399;font-weight:400">
                  原始 {{ store.formatTime(gapStats.originalDurationSec) }}
                  <span style="color:#67c23a;margin:0 4px">→</span>
                  压缩 {{ store.formatTime(gapStats.compactDurationSec) }}
                </span>
                <el-button size="small" text :type="subtitleViewMode === 'strip' ? 'primary' : ''" @click="subtitleViewMode = 'strip'">字幕条</el-button>
                <el-button size="small" text :type="subtitleViewMode === 'list' ? 'primary' : ''" @click="subtitleViewMode = 'list'">列表</el-button>
              </div>
            </div>

            <!-- 字幕条视图 -->
            <div v-if="subtitleViewMode === 'strip'" class="subtitle-strip-view" style="flex:1;overflow-y:auto;min-height:0">
              <div v-if="stripVideos.length === 0" style="padding:20px;text-align:center;color:#909399;font-size:12px">暂无字幕条数据</div>
              <div v-for="(video, vi) in stripVideos" :key="video.id">
                <div class="strip-video-label" :style="{ '--label-color': video.color }">{{ video.name }}</div>
                <div class="strip-track" :style="{ height: (video.rows.length > 0 ? Math.max(...video.rows.map(r => r.endRow)) : 1) * 28 + 8 + 'px' }">
                  <div
                    v-for="seg in video.segments"
                    :key="seg.i"
                    class="strip-seg"
                    :style="{
                      left: seg.leftPct + '%',
                      width: seg.widthPct + '%',
                      top: (seg.row - 1) * 28 + 'px',
                      backgroundColor: video.color
                    }"
                    :title="`#${seg.i + 1} ${store.formatTimeMs(seg.compactStartMs)}-${store.formatTimeMs(seg.compactEndMs)}\n${seg.text}`"
                  >
                    <span v-if="seg.widthPct > 1" class="strip-seg-text">{{ seg.text.slice(0, 12) }}</span>
                  </div>
                </div>
              </div>
              <!-- 时间轴刻度 -->
              <div class="strip-ruler">
                <template v-for="tick in stripTimeTicks" :key="tick.label">
                  <span class="strip-tick" :style="{ left: tick.pct + '%' }">{{ tick.label }}</span>
                </template>
              </div>
            </div>

            <!-- 列表视图 -->
            <div v-else class="compact-preview" style="flex:1;overflow-y:auto;min-height:0;padding:8px 0">
              <template v-for="(seg, i) in compactPreviewGrouped" :key="i">
                <div v-if="seg.videoLabel" class="compact-video-label">{{ seg.videoLabel }}</div>
                <div class="compact-item">
                  <span class="compact-idx">#{{ i + 1 }}</span>
                  <span class="compact-time">{{ store.formatTimeMs(seg.compactStartMs) }}-{{ store.formatTimeMs(seg.compactEndMs) }}</span>
                  <span class="compact-text">{{ seg.text }}</span>
                </div>
              </template>
            </div>
          </div>

          <div v-else class="wf-card result-card" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
            <div class="card-title" style="flex-shrink:0">步骤 7：文案展示与微调</div>
            <div class="wf-empty" style="flex:1;justify-content:center">
              <el-icon :size="32"><Document /></el-icon>
              <span v-if="!isGenerating">在左侧填写方向后点击「开始 AI 处理」</span>
              <span v-else style="color:#409eff">等待 AI 返回...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'
import { useCreatorModeStore } from '@/stores/creatorMode'
import { exportJianyingProject, buildProject } from '@/services/jianying'
import { buildModelRequestBody } from '@/services/deepseek'
import type { SubtitleSegment } from '@/services/asr'

const chatStore = useChatStore()
const store = useCreatorModeStore()

// ===== 数据源（基于磁盘缓存） =====
const scanning = ref(false)
const computingGap = ref(false)
interface GapStats {
  totalSegments: number
  totalGaps: number
  removableGaps: number
  savedMs: number
  originalDurationSec: number
  compactDurationSec: number
  wordGaps: number
  removableWordGaps: number
  segGaps: number
  removableSegGaps: number
}
const gapStats = ref<GapStats | null>(null)

/** 去气口后的压缩字幕（仅时间轴压缩，text 不变），供 AI 使用 */
interface CompactedSub {
  videoId: string
  originalStartMs: number
  originalEndMs: number
  compactStartMs: number
  compactEndMs: number
  text: string
}
const compactedSubtitles = ref<CompactedSub[]>([])

/** 选中视频的帧率列表 */
const selectedSourcesFps = computed(() => {
  const selected = sourceList.value.filter(s => selectedSourceIds.value.has(s.id))
  return selected.map(s => `${s.fps || DEFAULT_FPS}fps`)
})

/** 句子间隔的毫秒显示（用最高帧率计算最保守值） */
const gapThresholdMsDisplay = computed(() => {
  const fpsList = sourceList.value.filter(s => selectedSourceIds.value.has(s.id)).map(s => s.fps || DEFAULT_FPS)
  const maxFps = fpsList.length > 0 ? Math.max(...fpsList) : DEFAULT_FPS
  const ms = currentConv.value.frameGap * frameMs(maxFps)
  return Math.round(ms) + 'ms'
})

/** 右侧面板预览：将单词级压缩数据按原字幕分组合并 */
interface CompactPreviewItem {
  compactStartMs: number
  compactEndMs: number
  text: string
  videoLabel?: string
}
const compactPreviewGrouped = computed<CompactPreviewItem[]>(() => {
  const result: CompactPreviewItem[] = []
  let cur: CompactPreviewItem | null = null
  let lastVideoId = ''
  for (const c of compactedSubtitles.value) {
    const isNewSegment = !cur || c.originalStartMs !== (result[result.length - 1] as any)?._segStart
    const isNewVideo = c.videoId !== lastVideoId

    if (isNewSegment) {
      if (isNewVideo && result.length > 0) {
        // 视频切换时加分隔
        lastVideoId = c.videoId
      } else if (isNewVideo) {
        lastVideoId = c.videoId
      }
      cur = { compactStartMs: c.compactStartMs, compactEndMs: c.compactEndMs, text: c.text }
      if (isNewVideo) {
        const src = sourceList.value.find(s => s.id === c.videoId)
        cur.videoLabel = src?.name || c.videoId
      }
      ;(cur as any)._segStart = c.originalStartMs
      result.push(cur)
    } else {
      cur.compactEndMs = c.compactEndMs
      cur.text += c.text
    }
  }
  return result
})

// AI 阶段进度
const aiStages = ['去重优化：去除相邻重复话和同义内容', '时间轴文案：生成带时间标记的精选文案', '网感编排：组织文案使其符合短视频节奏']
const currentAiStage = ref(0)

interface SubtitleSource {
  id: string
  name: string
  subtitles: SubtitleSegment[]
  subtitleCount: number
  fps: number             // 视频帧率（0 表示未知，回退到 30fps）
}

const sourceList = ref<SubtitleSource[]>([])
const selectedSourceIds = ref<Set<string>>(new Set())

// ===== 匹配片段 & 微调 =====
interface SubtitleEntry {
  videoId: string
  videoName: string
  videoPath: string
  startTime: number   // ms
  endTime: number     // ms
  text: string
}

const matchedSubs = ref<SubtitleEntry[]>([])
const removedIndices = ref(new Set<number>())

const selectedSubs = computed(() =>
  matchedSubs.value.filter((_, i) => !removedIndices.value.has(i))
)

const totalMatchDuration = computed(() =>
  selectedSubs.value.reduce((sum, s) => sum + (s.endTime - s.startTime), 0) / 1000
)

/** 可读脚本：将选中字幕拼接成连续朗读稿 */
const readableScript = computed(() => {
  if (matchedSubs.value.length === 0) return ''
  const entries = selectedSubs.value
  const lines: string[] = []
  for (let i = 0; i < entries.length; i++) {
    const s = entries[i]
    const timeStr = store.formatTimeMs(s.startTime) + ' → ' + store.formatTimeMs(s.endTime)
    const dur = Math.round((s.endTime - s.startTime) / 1000)
    lines.push(`## ${s.videoName}  ${timeStr}  (${dur}秒)\n${s.text}\n`)
  }
  return lines.join('\n')
})

/** 仅提取 AI 输出的分析部分（去重日志 + 网感编排） */
const aiAnalysisOnly = computed(() => {
  const conv = currentConv.value
  if (!conv?.generatedScript) return ''
  // 保留 第一阶段（去重优化）和 第三阶段（网感编排），去掉 第二阶段（时间轴文案）
  let text = conv.generatedScript
    .replace(/\n?##\s*第二阶段[：:]\s*时间轴文案\s*\n[\s\S]*?(?=\n##\s*第三阶段|$)/i, '')
  // 兼容旧格式
  text = text.replace(/\n?##\s*选择清单\s*\n[\s\S]*?(?=\n##\s*筛选剔除|$)/i, '')
  return text.trim()
})

function toggleRemove(idx: number) {
  const s = new Set(removedIndices.value)
  if (s.has(idx)) s.delete(idx)
  else s.add(idx)
  removedIndices.value = s
}

const hasStoragePath = computed(() => !!store.storagePath)

/** 扫描存储目录中的 .subtitles.json 文件，并与 importedVideos 交叉比对 */
async function scanDiskSubtitles() {
  const api = (window as any).electronAPI
  if (!api?.listDirectory || !store.storagePath) {
    sourceList.value = []
    return
  }

  scanning.value = true
  const results: SubtitleSource[] = []

  try {
    // 递归收集所有 .subtitles.json 文件
    async function listRecursive(dirPath: string): Promise<Array<{ path: string; name: string }>> {
      const out: Array<{ path: string; name: string }> = []
      try {
        const entries = await api.listDirectory(dirPath)
        for (const e of entries) {
          if (e.isFile && e.name.endsWith('.subtitles.json')) {
            out.push({ path: e.path, name: e.name })
          } else if (e.isDirectory) {
            const sub = await listRecursive(e.path)
            out.push(...sub)
          }
        }
      } catch {}
      return out
    }

    const diskFiles = await listRecursive(store.storagePath)

    // 交叉比对：importedVideos vs 磁盘文件
    for (const v of store.importedVideos) {
      if (v.asrStatus !== 'done' || v.subtitles.length === 0) continue
      const videoBaseName = v.name.replace(/\.\w+$/, '')
      const diskMatch = diskFiles.find(df =>
        df.name.replace('.subtitles.json', '') === videoBaseName ||
        (v.path && df.name.replace('.subtitles.json', '') === v.path.split(/[\\/]/).pop()?.replace(/\.\w+$/, ''))
      )
      if (diskMatch) {
        results.push({
          id: v.id,
          name: v.name,
          subtitles: [...v.subtitles],
          subtitleCount: v.subtitles.length,
          fps: v.fps || 0
        })
      }
    }

    // 磁盘中有但 importedVideos 中没有的（纯磁盘字幕文件）
    for (const df of diskFiles) {
      const diskBaseName = df.name.replace('.subtitles.json', '')
      const alreadyIncluded = results.some(r => r.name.replace(/\.\w+$/, '') === diskBaseName)
      if (!alreadyIncluded) {
        let subs: SubtitleSegment[] = []
        let cachedFps = 0
        try {
          const content = await api.readFile(df.path)
          const data = JSON.parse(content)
          subs = Array.isArray(data.subtitles) ? data.subtitles : []
          cachedFps = data._meta?.fps || subs[0]?.fps || 0
        } catch {}
        if (subs.length > 0) {
          results.push({
            id: 'disk_' + diskBaseName,
            name: diskBaseName,
            subtitles: subs,
            subtitleCount: subs.length,
            fps: cachedFps
          })
        }
      }
    }

  } catch {}

  sourceList.value = results
  // 默认全选
  if (results.length > 0 && selectedSourceIds.value.size === 0) {
    selectedSourceIds.value = new Set(results.map(r => r.id))
  }
  // 清理已不存在的 id
  const validIds = new Set(results.map(r => r.id))
  for (const id of selectedSourceIds.value) {
    if (!validIds.has(id)) selectedSourceIds.value.delete(id)
  }
  scanning.value = false
}

async function refreshSources() {
  await scanDiskSubtitles()
  ElMessage.success(`扫描完成，共 ${sourceList.value.length} 个可用字幕源`)
}

function toggleSource(id: string) {
  const newSet = new Set(selectedSourceIds.value)
  if (newSet.has(id)) newSet.delete(id)
  else newSet.add(id)
  selectedSourceIds.value = newSet
}

function selectAllSources() {
  selectedSourceIds.value = new Set(sourceList.value.map(s => s.id))
}

function deselectAllSources() {
  selectedSourceIds.value = new Set()
}

// 监听存储路径变化
watch(() => store.storagePath, () => {
  if (store.storagePath) scanDiskSubtitles()
})

// ===== 对话管理 =====
const STORAGE_KEY = 'workflow-conversations'

interface Conversation {
  id: string
  title: string
  topic: string
  referenceCopies: string[]
  speakerPersona: string
  audiencePersona: string
  durationRequirement: string
  frameGap: number
  generatedScript: string
  createdAt: number
  updatedAt: number
}

const conversations = ref<Conversation[]>([])
const activeConvId = ref('')
const sidebarCollapsed = ref(false)

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) conversations.value = JSON.parse(raw)
  } catch { conversations.value = [] }
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.value))
}

function emptyConv(): Conversation {
  return { id: '', title: '', topic: '', referenceCopies: [], speakerPersona: '', audiencePersona: '', durationRequirement: '', frameGap: 5, generatedScript: '', createdAt: 0, updatedAt: 0 }
}

// 持久化的后备对象，避免 v-model 写入临时对象
const fallbackConv = ref<Conversation>(emptyConv())

const currentConv = computed(() =>
  conversations.value.find(c => c.id === activeConvId.value) || conversations.value[0] || fallbackConv.value
)

function newConversation() {
  const id = 'wf_' + Date.now()
  const conv: Conversation = {
    id,
    title: '新建对话',
    topic: '',
    referenceCopies: [],
    speakerPersona: '',
    audiencePersona: '',
    durationRequirement: '',
    frameGap: 5,
    generatedScript: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  conversations.value.unshift(conv)
  activeConvId.value = id
  saveConversations()
}

function switchConversation(id: string) {
  activeConvId.value = id
}

function deleteConversation(id: string) {
  ElMessageBox.confirm('确定删除此对话？', '确认', { type: 'warning' }).then(() => {
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeConvId.value === id) {
      activeConvId.value = conversations.value[0]?.id || ''
    }
    saveConversations()
    ElMessage.success('已删除')
  }).catch(() => {})
}

function formatConvTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// 自动更新对话标题
watch(() => currentConv.value?.topic, (val) => {
  const conv = conversations.value.find(c => c.id === activeConvId.value)
  if (conv && val) {
    const title = val.split('\n')[0].trim().slice(0, 20)
    if (title && conv.title === '新建对话') {
      conv.title = title
      saveConversations()
    }
  }
})

function onConvDirty() {
  saveConversations()
}

function addReferenceCopy() {
  const conv = currentConv.value
  if (conv) {
    if (!Array.isArray(conv.referenceCopies)) conv.referenceCopies = []
    conv.referenceCopies.push('')
    saveConversations()
  }
}

function removeReferenceCopy(idx: number) {
  const conv = currentConv.value
  if (conv && Array.isArray(conv.referenceCopies)) {
    conv.referenceCopies.splice(idx, 1)
    saveConversations()
  }
}

function updateReferenceCopy(idx: number, value: string) {
  const conv = currentConv.value
  if (conv && Array.isArray(conv.referenceCopies)) {
    conv.referenceCopies[idx] = value
    saveConversations()
  }
}

// ===== 生成逻辑 =====
const selectedModelId = ref<string>('')
const isGenerating = ref(false)
const statusText = ref('')
const streamingScript = ref('')
const showGenLog = ref(false)
const genLog = ref<null | { promptTokens: number; completionTokens: number; charsOut: number; truncated: boolean }>(null)

const reviewPhase = ref<'review' | 'tuning'>('review')  // 方案审核 → 微调

// ===== 方案审核对话 =====

/** 构建发送给 AI 的输入预览 */
function buildReviewPromptPreview(sourceContent: string, conv: Conversation) {
  const parts: string[] = []
  parts.push('## 发送给 AI 的完整输入\n')

  // 用户设定
  parts.push('### 用户设定')
  if (conv.topic) parts.push(`- 文案方向：${conv.topic}`)
  if (conv.speakerPersona) parts.push(`- 人设画像：${conv.speakerPersona}`)
  if (conv.audiencePersona) parts.push(`- 人群画像：${conv.audiencePersona}`)
  if (conv.durationRequirement) parts.push(`- 时长要求：${conv.durationRequirement}`)
  if (conv.referenceCopies.length > 0) {
    parts.push(`- 参考文案：${conv.referenceCopies.length} 条`)
    conv.referenceCopies.forEach((rc, i) => {
      parts.push(`  ${i + 1}. ${rc.slice(0, 120)}${rc.length > 120 ? '...' : ''}`)
    })
  }
  parts.push('')

  // 字幕库概览
  const lines = sourceContent.split('\n')
  const subtitleCount = lines.filter(l => /^#\d+/.test(l)).length
  parts.push('### 字幕库（去气口后）')
  parts.push(`共 ${subtitleCount} 条字幕，AI 从中挑选符合七维评分标准的内容。`)
  parts.push('')

  // AI 系统指令概要
  parts.push('### AI 处理流程')
  parts.push('第一阶段：去重优化 → 第二阶段：时间轴文案 → 第三阶段：网感编排')
  parts.push('评分维度：开场钩子 | 沉浸共鸣 | 干货密度 | 节奏掌控 | 人设差异 | 传播共鸣 | 可信背书')

  return parts.join('\n')
}
interface ReviewMessage {
  role: 'user' | 'ai'
  text: string
  time: number
}
const reviewMessages = ref<ReviewMessage[]>([])
const reviewInput = ref('')
const reviewSending = ref(false)
const sentPrompt = ref('')  // 发送给 AI 的完整 Prompt（用于审核对话首条消息）
const subtitleViewMode = ref<'strip' | 'list'>('strip')  // 气口结果视图：字幕条 / 列表

/** 视频调色板 */
const STRIP_COLORS = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#8e44ad', '#1abc9c', '#e74c3c']

/** 字幕条视图：分组后的视频数据 */
interface StripSegment {
  i: number
  compactStartMs: number
  compactEndMs: number
  text: string
  leftPct: number
  widthPct: number
  row: number
}
interface StripVideo {
  id: string
  name: string
  color: string
  segments: StripSegment[]
  rows: { startMs: number; endMs: number; endRow: number }[]  // 行占用记录（防重叠算法）
}
const stripVideos = computed<StripVideo[]>(() => {
  const segments = compactPreviewGrouped.value
  if (segments.length === 0) return []

  const totalMs = segments[segments.length - 1].compactEndMs
  if (totalMs <= 0) return []

  // 按 videoLabel 分组
  const groupMap = new Map<string, { label: string; segs: typeof segments }>()
  let currentLabel = ''
  for (const seg of segments) {
    if (seg.videoLabel) {
      currentLabel = seg.videoLabel
    }
    if (!groupMap.has(currentLabel)) {
      groupMap.set(currentLabel, { label: currentLabel, segs: [] })
    }
    groupMap.get(currentLabel)!.segs.push(seg)
  }

  const result: StripVideo[] = []
  let colorIdx = 0
  for (const [, group] of groupMap) {
    const videoId = sourceList.value.find(s => s.name === group.label)?.id || group.label
    const color = STRIP_COLORS[colorIdx % STRIP_COLORS.length]
    colorIdx++

    // 防重叠行布局
    const rows: { startMs: number; endMs: number; endRow: number }[] = []
    const stripSegs: StripSegment[] = group.segs.map((seg, idx) => {
      const leftPct = (seg.compactStartMs / totalMs) * 100
      const widthPct = Math.max(0.3, ((seg.compactEndMs - seg.compactStartMs) / totalMs) * 100)

      // 找到第一个没有重叠的行
      let row = 1
      for (const r of rows) {
        if (seg.compactStartMs >= r.endMs || seg.compactEndMs <= r.startMs) {
          continue // 不重叠，可以放同一行
        }
        row = Math.max(row, r.endRow + 1)
      }
      // 检查之前放在这一行的是否重叠
      const sameRowSegs = stripSegs.filter(s => s.row === row)
      for (const s of sameRowSegs) {
        const sStart = (s.leftPct / 100) * totalMs
        const sEnd = ((s.leftPct + s.widthPct) / 100) * totalMs
        if (!(seg.compactEndMs <= sStart || seg.compactStartMs >= sEnd)) {
          row++
          break
        }
      }

      rows.push({ startMs: seg.compactStartMs, endMs: seg.compactEndMs, endRow: row })
      return { ...seg, leftPct, widthPct, row, i: idx }
    })

    result.push({ id: videoId, name: group.label, color, segments: stripSegs, rows })
  }
  return result
})

/** 时间轴刻度 */
const stripTimeTicks = computed(() => {
  const segments = compactPreviewGrouped.value
  if (segments.length === 0) return []

  const totalMs = segments[segments.length - 1].compactEndMs
  const totalSec = totalMs / 1000

  // 选择合适的步长
  let stepSec: number
  if (totalSec <= 10) stepSec = 1
  else if (totalSec <= 30) stepSec = 2
  else if (totalSec <= 60) stepSec = 5
  else if (totalSec <= 180) stepSec = 15
  else if (totalSec <= 600) stepSec = 30
  else stepSec = 60

  const ticks: { label: string; pct: number }[] = []
  for (let s = 0; s <= totalSec; s += stepSec) {
    ticks.push({
      label: store.formatTime(s),
      pct: (s / totalSec) * 100
    })
  }
  // 最后一个刻度
  const lastPct = 100
  if (ticks.length === 0 || ticks[ticks.length - 1].pct < 98) {
    ticks.push({ label: store.formatTime(totalSec), pct: lastPct })
  }
  return ticks
})

const selectedModel = computed(() => {
  if (selectedModelId.value) {
    return chatStore.models.find(m => m.id === selectedModelId.value) || null
  }
  return chatStore.models.find(m => m.isDefault) || chatStore.models[0] || null
})

// ===== 步骤 5：计算时长 / 去气口 =====
const DEFAULT_FPS = 30  // 未知帧率时的回退值

/** 根据视频帧率计算每帧毫秒数 */
function frameMs(fps: number): number {
  return 1000 / (fps > 0 ? fps : DEFAULT_FPS)
}

/** 单词级时间轴项（用于字间气口压缩） */
interface WordTimeline {
  text: string
  startMs: number
  endMs: number
  /** 属于哪条字幕（用于 entries 的回溯匹配） */
  segmentStartMs: number
  segmentEndMs: number
}

function computeGaps() {
  const selectedSources = sourceList.value.filter(s => selectedSourceIds.value.has(s.id))
  if (selectedSources.length === 0) {
    if (sourceList.value.length === 0) {
      ElMessage.warning('未找到字幕数据源，请先点击步骤 1「扫描目录」')
    } else {
      ElMessage.warning('请先在步骤 1 中勾选要处理的视频')
    }
    return
  }

  // 检查是否有字幕数据
  const sourcesWithSubs = selectedSources.filter(s => s.subtitles.length > 0)
  if (sourcesWithSubs.length === 0) {
    ElMessage.warning('所选视频没有字幕数据，请先对视频进行语音识别')
    return
  }

  computingGap.value = true
  // 重置旧的生成结果，让右侧面板显示气口预览
  currentConv.value.generatedScript = ''
  matchedSubs.value = []
  removedIndices.value = new Set()
  sentPrompt.value = ''
  reviewMessages.value = []
  reviewPhase.value = 'review'
  const frameGap = currentConv.value.frameGap  // 用户设置的帧数（1-10）

  try {
  let totalSegments = 0
  let totalWordGaps = 0
  let totalSegGaps = 0
  let removableWordGaps = 0
  let removableSegGaps = 0
  let originalDurationMs = 0
  let savedMs = 0
  const compacted: CompactedSub[] = []

  for (const src of sourcesWithSubs) {
    const subs = [...src.subtitles].sort((a, b) => a.startTime - b.startTime)
    if (subs.length === 0) continue

    const srcFps = src.fps || DEFAULT_FPS
    const gapThresholdMs = frameGap * frameMs(srcFps)
    totalSegments += subs.length

    // ========== 第一遍：构建单词级时间轴 ==========
    const timeline: WordTimeline[] = []
    for (const sub of subs) {
      if (sub.words && sub.words.length > 0) {
        const sorted = [...sub.words].sort((a, b) => a.start_time - b.start_time)
        for (const w of sorted) {
          originalDurationMs += (w.end_time - w.start_time)
          timeline.push({
            text: w.text,
            startMs: w.start_time,
            endMs: w.end_time,
            segmentStartMs: sub.startTime,
            segmentEndMs: sub.endTime
          })
        }
      } else {
        // 无 word 数据，整段作为单项
        originalDurationMs += (sub.endTime - sub.startTime)
        timeline.push({
          text: sub.text,
          startMs: sub.startTime,
          endMs: sub.endTime,
          segmentStartMs: sub.startTime,
          segmentEndMs: sub.endTime
        })
      }
    }

    if (timeline.length === 0) continue

    // ========== 第二遍：逐词压缩气口 ==========
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i]

      if (i === 0) {
        // 第一条：起点固定为 0
        const dur = item.endMs - item.startMs
        compacted.push({
          videoId: src.id,
          originalStartMs: item.segmentStartMs,
          originalEndMs: item.segmentEndMs,
          compactStartMs: 0,
          compactEndMs: dur,
          text: item.text
        })
        continue
      }

      const prev = timeline[i - 1]
      const gap = item.startMs - prev.endMs

      if (gap > 0) {
        // 区分字间气口（同一 segment 内）和句间气口（跨 segment）
        const sameSegment = item.segmentStartMs === prev.segmentStartMs
        if (sameSegment) {
          totalWordGaps++
        } else {
          totalSegGaps++
        }

        if (gap > gapThresholdMs) {
          const excess = gap - gapThresholdMs
          savedMs += excess
          if (sameSegment) {
            removableWordGaps++
          } else {
            removableSegGaps++
          }
        }
      }

      const prevCompacted = compacted[compacted.length - 1]
      const compactStart = prevCompacted.compactEndMs + gapThresholdMs
      const dur = item.endMs - item.startMs
      compacted.push({
        videoId: src.id,
        originalStartMs: item.segmentStartMs,
        originalEndMs: item.segmentEndMs,
        compactStartMs: compactStart,
        compactEndMs: compactStart + dur,
        text: item.text
      })
    }
  }

  const compactDurationMs = compacted.length > 0
    ? compacted[compacted.length - 1].compactEndMs
    : 0

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
    removableSegGaps
  }

  compactedSubtitles.value = compacted
  computingGap.value = false
  } catch (e: any) {
    console.error('[computeGaps] 出错:', e)
    ElMessage.error(`气口计算失败: ${e?.message || String(e)}`)
    gapStats.value = undefined
    compactedSubtitles.value = []
    computingGap.value = false
  }
}

async function handleGenerate() {
  const conv = conversations.value.find(c => c.id === activeConvId.value)
  if (!conv) return

  const model = selectedModel.value
  if (!model?.apiKey) {
    ElMessage.warning('请先在全局模型管理中设置 API Key')
    return
  }

  const selectedSources = sourceList.value.filter(s => selectedSourceIds.value.has(s.id))
  if (selectedSources.length === 0) {
    ElMessage.warning('请至少选择一个数据源')
    return
  }

  isGenerating.value = true
  streamingScript.value = ''
  genLog.value = null
  showGenLog.value = true
  currentAiStage.value = 0
  reviewPhase.value = 'review'
  reviewMessages.value = []
  sentPrompt.value = ''
  statusText.value = `正在使用 ${selectedSources.length} 个数据源，调用 AI 生成文案...`

  // 计算选中数据源的原始总时长（秒），告诉 AI 实际数据量
  let totalSourceSec = 0
  for (const src of selectedSources) {
    for (const sub of src.subtitles) {
      totalSourceSec += (sub.endTime - sub.startTime) / 1000
    }
  }
  const totalSourceMin = Math.floor(totalSourceSec / 60)
  const totalSourceSecRemain = Math.floor(totalSourceSec % 60)

  // 自动计算气口（如果还没手动算过）
  if (!gapStats.value) computeGaps()

  try {
    const fullTextChunks: string[] = []
    currentAiStage.value = 0

    // 有压缩字幕就传进去，AI 收到的是去气口时间轴
    const sourceContent = compactedSubtitles.value.length > 0
      ? buildSourceContent(selectedSources, compactedSubtitles.value)
      : buildSourceContent(selectedSources)
    if (!sourceContent.content.trim()) {
      ElMessage.warning('所选数据源中没有字幕内容')
      isGenerating.value = false
      return
    }

    const result = await callAI(
      sourceContent.content, conv.topic, conv.referenceCopies, conv.speakerPersona || '', conv.audiencePersona || '',
      conv.durationRequirement || '', conv.frameGap,
      totalSourceMin, totalSourceSecRemain, model,
      (text) => {
        streamingScript.value = text
        fullTextChunks.length = 0
        fullTextChunks.push(text)
        // 检测输出中的阶段标记来推进进度
        if (text.includes('第二阶段') || text.includes('时间轴文案')) currentAiStage.value = 1
        if (text.includes('第三阶段') || text.includes('网感编排')) currentAiStage.value = 2
      }
    )
    currentAiStage.value = 3 // 全部完成
    const script = result.text

    genLog.value = {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      charsOut: script.length,
      truncated: sourceContent.content.length > 15000
    }

    // 从 AI 输出中解析 #N 编号，直接映射到字幕条目
    matchedSubs.value = parseScriptIndices(script, sourceContent.entries)
    // 补全 videoPath（构建时还没有）
    for (const sub of matchedSubs.value) {
      const video = store.importedVideos.find(v => v.id === sub.videoId)
      if (video) sub.videoPath = video.path
    }
    removedIndices.value = new Set()

    conv.generatedScript = script
    conv.updatedAt = Date.now()
    saveConversations()

    // 保存发送给 AI 的完整输入（供审核对话查看）
    sentPrompt.value = buildReviewPromptPreview(sourceContent.content, conv)

    // 时长校验 + 自动裁剪：如果用户设了时长要求
    if (conv.durationRequirement?.trim()) {
      const actualSec = totalMatchDuration.value
      const actualMin = Math.floor(actualSec / 60)
      const actualSecRem = Math.floor(actualSec % 60)
      const hint = `实际匹配时长: ${actualMin}分${actualSecRem}秒（原始数据总量: ${totalSourceMin}分${totalSourceSecRemain}秒）`

      // 解析时长要求：提取数字，智能判断是上限/下限/范围
      const nums = conv.durationRequirement.match(/\d+/g)?.map(Number) || []
      let minTarget = 0, maxTarget = 0

      if (nums.length === 1) {
        // "5分钟" / "五分钟左右" / "至少5分钟" / "不超过7分钟"
        const req = conv.durationRequirement
        if (req.includes('至少') || req.includes('最低') || req.includes('以上') || req.includes('不少于')) {
          minTarget = nums[0]
        } else if (req.includes('不超过') || req.includes('最多') || req.includes('以内') || req.includes('以下')) {
          maxTarget = nums[0]
        } else {
          // "五分钟左右" / "大约5分钟" → 区间 [4, 6]
          minTarget = Math.max(1, nums[0] - 1)
          maxTarget = nums[0] + 1
        }
      } else if (nums.length >= 2) {
        // "5-7分钟" → [5, 7]
        minTarget = nums[0]
        maxTarget = nums[nums.length - 1]
      }

      // 超出上限 → 从末尾裁剪
      if (maxTarget > 0 && actualSec > maxTarget * 60) {
        let trimmed = [...matchedSubs.value]
        let total = actualSec
        while (trimmed.length > 1 && total > maxTarget * 60) {
          const removed = trimmed.pop()!
          total -= (removed.endTime - removed.startTime) / 1000
        }
        matchedSubs.value = trimmed
        removedIndices.value = new Set()
        const newMin = Math.floor(total / 60)
        const newSec = Math.floor(total % 60)
        ElMessage.success(`生成完成，已自动裁剪至 ${newMin}分${newSec}秒（符合约${maxTarget}分钟上限），匹配 ${trimmed.length} 个片段`)
      } else if (minTarget > 0 && actualSec < minTarget * 60) {
        ElMessage.warning(`时长未达标，${hint}。数据源时长不足以满足最低要求`)
      } else {
        ElMessage.success(`生成完成，${hint}，匹配 ${matchedSubs.value.length} 个片段`)
      }
    } else {
      ElMessage.success(`生成完成，匹配 ${matchedSubs.value.length} 个片段`)
    }
  } catch (e: any) {
    ElMessage.error('生成失败: ' + (e.message || '未知错误'))
  } finally {
    isGenerating.value = false
  }
}

function buildSourceContent(sources: SubtitleSource[], compacted?: CompactedSub[]): { content: string; entries: SubtitleEntry[] } {
  const lines: string[] = []
  const entries: SubtitleEntry[] = []

  // 有压缩数据时：将单词级压缩数据按原字幕分组合并，AI 看到完整句子 + 压缩时间轴
  if (compacted && compacted.length > 0) {
    // 按 (videoId, 原字幕起始时间) 分组，把单词拼回句子
    type SegmentGroup = { videoId: string; originalStartMs: number; originalEndMs: number; words: CompactedSub[] }
    const groups: SegmentGroup[] = []
    let cur: SegmentGroup | null = null
    for (const c of compacted) {
      if (!cur || cur.videoId !== c.videoId || cur.originalStartMs !== c.originalStartMs) {
        cur = { videoId: c.videoId, originalStartMs: c.originalStartMs, originalEndMs: c.originalEndMs, words: [] }
        groups.push(cur)
      }
      cur.words.push(c)
      if (c.originalEndMs > cur.originalEndMs) cur.originalEndMs = c.originalEndMs
    }

    const byVideo = new Map<string, SegmentGroup[]>()
    for (const g of groups) {
      if (!byVideo.has(g.videoId)) byVideo.set(g.videoId, [])
      byVideo.get(g.videoId)!.push(g)
    }

    let idx = 0
    for (const src of sources) {
      const srcGroups = byVideo.get(src.id)
      if (!srcGroups || srcGroups.length === 0) continue

      const firstWord = srcGroups[0].words[0]
      const lastWord = srcGroups[srcGroups.length - 1].words
      const compactDur = Math.round(lastWord[lastWord.length - 1].compactEndMs / 1000)
      const originalDur = Math.round(srcGroups.reduce((s, g) => s + (g.originalEndMs - g.originalStartMs), 0) / 1000)
      const srcFps = src.fps || DEFAULT_FPS
      lines.push(`【视频：${src.name} | 原始时长约 ${originalDur}秒 | 去气口后约 ${compactDur}秒 | 帧率 ${srcFps}fps | 句子间隔 ${currentConv.value.frameGap}帧≈${Math.round(frameMs(srcFps) * currentConv.value.frameGap)}ms】`)

      for (const g of srcGroups) {
        const text = g.words.map(w => w.text).join('')
        const compactStart = g.words[0].compactStartMs
        const compactEnd = g.words[g.words.length - 1].compactEndMs
        const dur = Math.round((g.originalEndMs - g.originalStartMs) / 1000)
        idx++
        lines.push(`#${idx} [${store.formatTimeMs(compactStart)}-${store.formatTimeMs(compactEnd)} | ${dur}秒] ${text}`)
        entries.push({
          videoId: g.videoId,
          videoName: src.name,
          videoPath: '',
          startTime: g.originalStartMs,
          endTime: g.originalEndMs,
          text
        })
      }
      lines.push('')
    }
    return { content: lines.join('\n'), entries }
  }

  // 无压缩数据：原始时间轴
  let idx = 0
  for (const src of sources) {
    let videoSec = 0
    for (const sub of src.subtitles) videoSec += (sub.endTime - sub.startTime) / 1000
    lines.push(`【视频：${src.name} | 该视频字幕总时长约 ${Math.round(videoSec)} 秒】`)
    for (const sub of src.subtitles) {
      const dur = Math.round((sub.endTime - sub.startTime) / 1000)
      idx++
      lines.push(`#${idx} [${store.formatTimeMs(sub.startTime)}-${store.formatTimeMs(sub.endTime)} | ${dur}秒] ${sub.text}`)
      entries.push({
        videoId: src.id,
        videoName: src.name,
        videoPath: '',
        startTime: sub.startTime,
        endTime: sub.endTime,
        text: sub.text
      })
    }
    lines.push('')
  }
  return { content: lines.join('\n'), entries }
}

async function callAI(sourceContent: string, topic: string, referenceCopies: string[], speakerPersona: string, audiencePersona: string, durationReq: string, frameGap: number, dataMin: number, dataSec: number, model: { apiKey: string; apiUrl: string; modelParam: string }, onChunk: (text: string) => void, customSystemPrompt?: string): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  let systemPrompt: string
  let userMsg: string

  if (customSystemPrompt) {
    // 审核对话模式：直接用自定义系统提示词，sourceContent 作为上下文
    systemPrompt = customSystemPrompt
    userMsg = topic  // topic 参数复用于用户消息
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

每条字幕后面的 | X秒 是该条时长，选中的每条秒数加起来就是总时长。`

  // 人设画像
  if (speakerPersona.trim()) {
    systemPrompt += `\n\n【人设画像——你是谁】
你代表了以下人设，挑选字幕时优先选择符合该人设视角和语气的内容：
${speakerPersona.trim()}

在「编排说明」中说明你的选择如何体现了这个人的风格。`
  }

  // 人群画像
  if (audiencePersona.trim()) {
    systemPrompt += `\n\n【人群画像——给谁看】
你的目标受众是：
${audiencePersona.trim()}

挑选字幕时，优先选择能让这类人群产生「这说的就是我」共鸣的内容。在«编排说明»中说明你如何针对这个人群做了取舍。`
  }

  // 参考文案
  const copies = referenceCopies.filter(c => c.trim())
  if (copies.length > 0) {
    const copyBlocks = copies.map((c, i) => `【参考文案 ${i + 1}】\n${c.trim()}`).join('\n\n')
    systemPrompt += `\n\n【参考文案——你必须模仿的风格】
用户提供了 ${copies.length} 篇参考文案，请先逐篇分析其风格特征（语调、句式、节奏、人称、钩子模式），然后提取它们之间的共性风格，按照这种风格从字幕库中挑选和编排。

分析完后，在「编排说明」中用 1-2 句说明你识别到的共性风格特征，以及你是如何在挑选字幕时体现这些风格的。

${copyBlocks}
【参考文案结束】`
  }

  if (durationReq.trim()) {
    const nums = durationReq.match(/\d+/g)?.map(Number) || []
    systemPrompt += `\n\n【用户时长目标】${durationReq.trim()}`
    if (nums.length >= 2) {
      systemPrompt += `\n折算：目标 ${nums[0]}~${nums[nums.length - 1]} 分钟 = ${nums[0]*60}~${nums[nums.length-1]*60} 秒`
    } else if (nums.length === 1) {
      systemPrompt += `\n折算：目标约 ${nums[0]} 分钟 = ${nums[0]*60} 秒`
    }
    systemPrompt += `\n内容质量始终优先于精确时长。数据不够时如实说明。`
  }

  if (frameGap > 1) {
    systemPrompt += `\n\n导出时片段间自动插入 ${frameGap} 帧间隔，你无需额外处理。`
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
每个维度打分（1-5）及一句话说明，低于 3 分的标注原因。`

    userMsg = `【字幕库】\n${sourceContent}\n\n【用户要求】\n${topic}\n\n请严格按三个阶段处理，先完成去重优化再挑选文案，最后做网感编排。`
  }

  // 大幅提高限制：276条字幕约10000字，不再轻易截断
  const msgChars = userMsg.length
  const truncatedMsg = msgChars > 15000 ? userMsg.slice(0, 15000) + '\n...(内容已截断，剩余条目可能不完整)' : userMsg

  const reqModel = { provider: 'deepseek', modelParam: model.modelParam }
  const { body } = buildModelRequestBody(reqModel, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: truncatedMsg }
    ],
    temperature: 0.7,
    max_tokens: 16384,
    stream: true
  })
  body.stream = true  // V4 流式由调用方自行设置

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

  // 尝试流式读取，如果 API 不支持流式则回退到非流式
  const contentType = response.headers.get('content-type') || ''
  const useStream = contentType.includes('text/event-stream') || contentType.includes('application/json')

  if (useStream && response.body) {
    try {
      return await readStream(response.body, onChunk, systemPrompt.length + truncatedMsg.length)
    } catch (streamErr: any) {
      // 流式失败，回退到非流式
      console.warn('流式读取失败，尝试非流式:', streamErr.message)
    }
  }

  // 非流式回退
  return await readNonStream(response)
}

/** 流式 SSE 解析 */
async function readStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  promptLen: number
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let promptTokens = 0
  let completionTokens = 0
  let lastActivity = Date.now()
  const IDLE_TIMEOUT = 15000  // 15 秒无数据则视为结束

  // 定时检测是否超时
  const timeoutCheck = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT) {
      reader.cancel('idle timeout').catch(() => {})
    }
  }, 5000)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      lastActivity = Date.now()
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        // 支持 "data: " 和 "data:" 前缀
        const dataIdx = trimmed.indexOf('data:')
        if (dataIdx !== 0) continue
        const jsonStr = trimmed.slice(5).trim()
        if (!jsonStr || jsonStr === '[DONE]') continue

        try {
          const chunk = JSON.parse(jsonStr)
          const choice = chunk.choices?.[0]
          if (!choice) continue
          // 兼容各种 delta 格式
          const delta = choice.delta || choice.message || {}
          const content = delta.content || delta.text || delta.reasoning_content || ''
          if (content) {
            fullText += content
            onChunk(fullText)
          }
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens || 0
            completionTokens = chunk.usage.completion_tokens || 0
          }
        } catch { /* 跳过非 JSON 行 */ }
      }
    }
  } finally {
    clearInterval(timeoutCheck)
    try { reader.releaseLock() } catch {}
  }

  // 估算 token（如果 API 没返回 usage）
  if (promptTokens === 0) {
    promptTokens = Math.ceil(promptLen / 3.5)
    completionTokens = Math.ceil(fullText.length / 3.5)
  }

  return { text: fullText, promptTokens, completionTokens }
}

/** 非流式回退 */
async function readNonStream(response: Response): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''
  const usage = data.usage
  return {
    text,
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0
  }
}

/** 将生成的文案匹配到实际字幕，按脚本出现顺序排列 */
function parseScriptIndices(script: string, entries: SubtitleEntry[]): SubtitleEntry[] {
  if (entries.length === 0) return []

  // 提取「第二阶段：时间轴文案」区块中的所有 #N
  const selectSection = script.match(/##\s*第二阶段[：:]\s*时间轴文案\s*\n([\s\S]*?)(?=\n##\s*第三阶段|$)/i)
    || script.match(/##\s*选择清单\s*\n([\s\S]*?)(?=\n##|$)/i) // 兼容旧格式
  const sectionText = selectSection ? selectSection[1] : script

  // 提取所有 #N 编号
  const indices: number[] = []
  const seen = new Set<number>()

  const matches = sectionText.matchAll(/#(\d+)/g)
  for (const m of matches) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= entries.length && !seen.has(n)) {
      seen.add(n)
      indices.push(n - 1)
    }
  }

  if (indices.length > 0) {
    return indices.map(i => entries[i])
  }

  return fuzzyMatchScriptToSubs(script, entries)
}

/** 旧格式回退：bigram 模糊匹配（保留以兼容旧对话） */
function fuzzyMatchScriptToSubs(script: string, subs: SubtitleEntry[]): SubtitleEntry[] {
  if (subs.length === 0) return []

  // 中文分词：按标点拆短语，提取连续2-3字作为特征
  const tokenize = (text: string): Set<string> => {
    const tokens = new Set<string>()
    // 按标点和空白拆成短语
    const phrases = text.split(/[\s，,。.！!？?、；;：:（）()【】\[\]""''\n\r]+/).filter(p => p.length >= 2)
    for (const p of phrases) {
      for (let i = 0; i < p.length - 1; i++) {
        tokens.add(p.substring(i, i + 2))  // bigram
      }
    }
    return tokens
  }

  const scriptTokens = tokenize(script)
  if (scriptTokens.size === 0) return []

  // 对每条字幕计算 Jaccard 相似度
  const scored: Array<{ sub: SubtitleEntry; score: number }> = []
  for (const sub of subs) {
    const subTokens = tokenize(sub.text)
    if (subTokens.size === 0) continue
    let intersect = 0
    for (const t of subTokens) {
      if (scriptTokens.has(t)) intersect++
    }
    const score = intersect / subTokens.size  // 字幕文本中有多少比例在脚本中出现
    if (score >= 0.3) scored.push({ sub, score })
  }

  // 视频内按字幕顺序排列，再按脚本出现位置全局排列
  // 先找每个字幕在脚本中的最佳位置
  const positioned = scored.map(({ sub, score }) => {
    let pos = script.indexOf(sub.text)
    if (pos === -1) {
      // 先用前 70% 匹配
      const prefixLen = Math.floor(sub.text.length * 0.7)
      for (let len = prefixLen; len >= 8; len--) {
        pos = script.indexOf(sub.text.substring(0, len))
        if (pos >= 0) break
      }
    }
    return { sub, score, pos: pos >= 0 ? pos : Number.MAX_SAFE_INTEGER }
  })

  // 按脚本中的位置排序
  positioned.sort((a, b) => a.pos - b.pos)

  // 去重：
  // 1. 完全相同的字幕（同视频同时间起点）只保留一个
  // 2. 同一视频内时间重叠超过 30% 的只保留相似度更高的
  // 3. bigram 重叠超过 80% 的近似文本只保留第一个
  const result: SubtitleEntry[] = []
  const usedKeys = new Set<string>()

  for (const { sub, score } of positioned) {
    const key = `${sub.videoId}|${sub.startTime}`
    if (usedKeys.has(key)) continue

    // 与已添加的所有条目比对
    let skip = false
    for (const existing of result) {
      // 同一视频：时间重叠超过 30% → 跳过
      if (existing.videoId === sub.videoId) {
        const overlapStart = Math.max(sub.startTime, existing.startTime)
        const overlapEnd = Math.min(sub.endTime, existing.endTime)
        const overlap = overlapEnd - overlapStart
        const subDur = sub.endTime - sub.startTime
        const exDur = existing.endTime - existing.startTime
        if (overlap > 0 && subDur > 0 && exDur > 0) {
          if (overlap / subDur > 0.3 || overlap / exDur > 0.3) {
            skip = true
            break
          }
        }
      }
      // 跨视频：文本 bigram 重叠超过 80% → 跳过（近似重复）
      const subTokens = tokenize(sub.text)
      const exTokens = tokenize(existing.text)
      if (subTokens.size > 0 && exTokens.size > 0) {
        let common = 0
        for (const t of subTokens) if (exTokens.has(t)) common++
        const ratio = common / Math.min(subTokens.size, exTokens.size)
        if (ratio > 0.8) {
          skip = true
          break
        }
      }
    }
    if (skip) continue

    usedKeys.add(key)
    result.push(sub)
  }

  return result
}

// ===== 方案审核对话 =====
/** 发送审核消息到 AI */
async function sendReviewMessage() {
  const input = reviewInput.value.trim()
  if (!input || reviewSending.value) return

  reviewMessages.value.push({ role: 'user', text: input, time: Date.now() })
  reviewInput.value = ''
  reviewSending.value = true

  const conv = currentConv.value
  const model = selectedModel.value
  if (!model || !conv?.generatedScript) {
    ElMessage.warning('没有可审查的方案')
    reviewSending.value = false
    return
  }

  try {
    // 收集已选字幕的上下文（供 AI 参考）
    const selectedLines = matchedSubs.value
      .filter((_, i) => !removedIndices.value.has(i))
      .map((s, i) => {
        const dur = Math.round((s.endTime - s.startTime) / 1000)
        return `#${i + 1} [${store.formatTimeMs(s.startTime)}-${store.formatTimeMs(s.endTime)} | ${dur}秒] ${s.text}`
      })
      .join('\n')

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
- 话题方向：${conv.topic || '未指定'}
- 人设画像：${conv.speakerPersona || '未指定'}
- 目标人群：${conv.audiencePersona || '未指定'}
- 目标时长：${conv.durationRequirement || '未指定'}
- 总匹配片段数：${matchedSubs.value.length}
- 当前选中片段数：${matchedSubs.value.filter((_, i) => !removedIndices.value.has(i)).length}

生成方案（含七维评分）：\n${conv.generatedScript.slice(0, 8000)}\n\n当前选中字幕列表：\n${selectedLines}`

    let fullResponse = ''
    const result = await callAI(
      '',
      input,
      [],
      '',
      '',
      '',
      0,
      0,
      0,
      model,
      (chunk) => { fullResponse += chunk },
      reviewSystemPrompt
    )
    reviewMessages.value.push({ role: 'ai', text: result.text, time: Date.now() })
  } catch (e: any) {
    reviewMessages.value.push({ role: 'ai', text: `审核对话出错: ${e.message || '未知错误'}`, time: Date.now() })
  } finally {
    reviewSending.value = false
  }
}

/** 确认方案，进入微调 */
function confirmScheme() {
  if (matchedSubs.value.length === 0) {
    ElMessage.warning('没有匹配的片段，请先生成方案')
    return
  }
  reviewPhase.value = 'tuning'
  ElMessage.success('已进入微调，可在此移除不满意的片段后导出剪映')
}

/** 应用并导出为剪映工程 */
async function handleApply() {
  if (selectedSubs.value.length === 0) {
    ElMessage.warning('没有选中的片段，请先微调保留至少一个片段')
    return
  }

  const conv = conversations.value.find(c => c.id === activeConvId.value)
  const clipGapMs = Math.round((conv?.frameGap ?? 5) * 1000 / 30)  // 帧 → 毫秒（按30fps）

  let projectName = ''
  try {
    const { value } = await ElMessageBox.prompt('请输入剪映工程名称', '导出剪映工程', {
      confirmButtonText: '导出',
      inputValue: `剪映工程_${new Date().toLocaleDateString()}`,
      inputPlaceholder: '工程名称'
    })
    projectName = value || ''
  } catch { return }

  // 用第一个选中字幕的视频分辨率作为画布尺寸
  const firstSub = selectedSubs.value[0]
  const firstVideo = store.importedVideos.find(v => v.id === firstSub.videoId)
  const canvasW = firstVideo?.width || 1080
  const canvasH = firstVideo?.height || 1920

  const clipItems = selectedSubs.value.map(s => ({
    sourceFile: s.videoPath,
    sourceFileName: s.videoName,
    startMs: s.startTime,
    endMs: s.endTime
  }))

  // 不使用字幕文本轨道（前面已验证字幕导出有问题）
  const subtitleItems: Array<{ text: string; startMs: number; endMs: number }> = []

  try {
    const project = buildProject(clipItems, subtitleItems, projectName, canvasW, canvasH, clipGapMs)
    const result = await exportJianyingProject(project, store.jianyingDraftPath, () => {})

    if (result.success) {
      ElMessage.success(`已导出到剪映草稿: ${result.projectPath}`)
    } else {
      ElMessage.error('导出失败')
    }
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e.message || '未知错误'))
  }
}

function renderScript(text: string): string {
  // 先做结构替换（依赖换行），再转 <br>
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  result = result
    .replace(/^## (.+?)$/gm, '<div class="script-section">$1</div>')
    .replace(/^#(\d+)(.*?)$/gm, '<span class="script-idx">#$1</span>$2')
    .replace(/\n/g, '<br>')
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  return result
}

// ===== 生命周期 =====
onMounted(async () => {
  loadConversations()
  if (conversations.value.length > 0) {
    activeConvId.value = conversations.value[0].id
  } else {
    newConversation()
  }
  await nextTick()
  if (store.storagePath) scanDiskSubtitles()
})
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

.conv-item:hover { background: #f0f2f5; }
.conv-item.active { background: #ecf5ff; }

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

/* 卡片 */
.wf-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
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

.source-item:hover { background: #f0f2f5; }
.source-item.selected { background: #ecf5ff; }

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

.tune-item:hover { background: #f5f7fa; }
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
  font-family: 'SF Mono', 'Consolas', monospace;
  flex-shrink: 0;
  min-width: 28px;
}

.compact-time {
  color: #909399;
  font-size: 11px;
  font-family: 'SF Mono', 'Consolas', monospace;
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
  content: '';
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
  transition: filter 0.15s, transform 0.1s;
  overflow: hidden;
  min-width: 2px;
  display: flex;
  align-items: center;
}

.strip-seg:hover {
  filter: brightness(0.88);
  transform: scaleY(1.2);
  z-index: 10;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
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
  content: '';
  display: block;
  height: 6px;
  width: 1px;
  background: #dcdfe6;
  margin: 0 auto;
}
</style>
