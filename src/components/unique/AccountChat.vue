<template>
  <div class="ac-root">
    <!-- 消息区域 -->
    <div class="ac-body" ref="bodyEl">
      <!-- 空状态 -->
      <div v-if="messages.length === 0 && !isLoading" class="ac-welcome">
        <div class="acw-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="14" fill="#eef3ff" />
            <path
              d="M16 20c0-2.2 1.8-4 4-4h8c2.2 0 4 1.8 4 4v8c0 2.2-1.8 4-4 4h-8c-2.2 0-4-1.8-4-4v-8z"
              fill="#1a4cff"
              opacity=".15"
            />
            <path
              d="M28 16h-8c-2.2 0-4 1.8-4 4v8c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4v-8c0-2.2-1.8-4-4-4z"
              stroke="#1a4cff"
              stroke-width="1.5"
            />
            <circle cx="20" cy="22" r="1.5" fill="#1a4cff" />
            <circle cx="28" cy="22" r="1.5" fill="#1a4cff" />
            <path
              d="M20 28s2 2 4 2 4-2 4-2"
              stroke="#1a4cff"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <h2 class="acw-title">账号智能顾问</h2>
        <p class="acw-desc">
          基于当前账号的真实数据，回答关于选题、受众、内容策略等问题。先问一个试试：
        </p>
        <div class="acw-grid">
          <button
            v-for="q in quickQuestions"
            :key="q"
            class="acw-card"
            @click="ask(q)"
          >
            <span class="acwc-q">{{ q }}</span>
            <span class="acwc-arrow">→</span>
          </button>
        </div>
      </div>

      <!-- 消息列表 -->
      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="ac-msg-row"
        :class="msg.role"
      >
        <div class="ac-msg-inner">
          <div class="ac-msg-avatar">
            <span v-if="msg.role === 'user'">👤</span>
            <svg v-else width="20" height="20" viewBox="0 0 48 48">
              <rect width="48" height="48" rx="14" fill="#eef3ff" />
              <path
                d="M16 20c0-2.2 1.8-4 4-4h8c2.2 0 4 1.8 4 4v8c0 2.2-1.8 4-4 4h-8c-2.2 0-4-1.8-4-4v-8z"
                fill="#1a4cff"
                opacity=".15"
              />
              <path
                d="M28 16h-8c-2.2 0-4 1.8-4 4v8c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4v-8c0-2.2-1.8-4-4-4z"
                stroke="#1a4cff"
                stroke-width="1.5"
              />
              <circle cx="20" cy="22" r="1.5" fill="#1a4cff" />
              <circle cx="28" cy="22" r="1.5" fill="#1a4cff" />
              <path
                d="M20 28s2 2 4 2 4-2 4-2"
                stroke="#1a4cff"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </div>
          <div class="ac-msg-body">
            <div class="ac-msg-meta">
              <span class="ac-msg-role">{{
                msg.role === "user" ? "你" : "账号顾问"
              }}</span>
              <span
                v-if="msg.role === 'assistant' && msg.deepThinking"
                class="ac-badge thinking"
                >深度思考</span
              >
            </div>
            <div v-if="msg.reasoning" class="ac-reasoning">
              <details>
                <summary>查看思考过程</summary>
                <div class="ac-reasoning-content">{{ msg.reasoning }}</div>
              </details>
            </div>
            <div
              class="ac-msg-bubble"
              :class="msg.role"
              v-html="renderMd(msg.content)"
            ></div>
          </div>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="isLoading" class="ac-msg-row assistant">
        <div class="ac-msg-inner">
          <div class="ac-msg-avatar">
            <svg width="20" height="20" viewBox="0 0 48 48">
              <rect width="48" height="48" rx="14" fill="#eef3ff" />
              <path
                d="M16 20c0-2.2 1.8-4 4-4h8c2.2 0 4 1.8 4 4v8c0 2.2-1.8 4-4 4h-8c-2.2 0-4-1.8-4-4v-8z"
                fill="#1a4cff"
                opacity=".15"
              />
              <path
                d="M28 16h-8c-2.2 0-4 1.8-4 4v8c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4v-8c0-2.2-1.8-4-4-4z"
                stroke="#1a4cff"
                stroke-width="1.5"
              />
              <circle cx="20" cy="22" r="1.5" fill="#1a4cff" />
              <circle cx="28" cy="22" r="1.5" fill="#1a4cff" />
              <path
                d="M20 28s2 2 4 2 4-2 4-2"
                stroke="#1a4cff"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </div>
          <div class="ac-msg-body">
            <div class="ac-msg-meta">
              <span class="ac-msg-role">账号顾问</span>
              <span v-if="deepThinkingEnabled" class="ac-badge thinking"
                >深度思考</span
              >
            </div>
            <div
              v-if="deepThinkingEnabled && streamingReasoning"
              class="ac-reasoning"
            >
              <details open>
                <summary>正在思考...</summary>
                <div class="ac-reasoning-content">{{ streamingReasoning }}</div>
              </details>
            </div>
            <div
              v-if="streamingContent"
              class="ac-msg-bubble assistant"
              v-html="renderMd(streamingContent)"
            ></div>
            <div v-else class="ac-loading-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 拆解提示 -->
    <div
      v-if="store.decomposeEnabledForChat && !store.lastDecomposition"
      class="ac-hint-bar"
    >
      <span>📐 内容拆解辅助已开启，但暂无拆解数据</span>
      <button :disabled="store.decomposing" @click="doDecompose()">
        {{ store.decomposing ? "拆解中..." : "执行拆解" }}
      </button>
    </div>

    <!-- 工具栏 -->
    <div class="ac-toolbar">
      <div class="ac-toolbar-left">
        <button
          class="ac-toggle-btn"
          :class="{ active: deepThinkingEnabled }"
          @click="deepThinkingEnabled = !deepThinkingEnabled"
        >
          <span class="actb-icon">🧠</span>
          <span class="actb-label">深度思考</span>
        </button>
        <button
          class="ac-toggle-btn"
          :class="{ active: store.decomposeEnabledForChat }"
          @click="store.toggleDecomposeForChat()"
        >
          <span class="actb-icon">📐</span>
          <span class="actb-label">内容拆解</span>
        </button>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="ac-input-area">
      <div class="ac-input-row">
        <textarea
          v-model="inputText"
          class="ac-textarea"
          placeholder="问账号顾问关于选题、受众、内容策略..."
          rows="2"
          @keydown.enter.exact.prevent="handleSend"
          :disabled="isLoading"
        />
        <button
          class="ac-send"
          :disabled="!inputText.trim() || isLoading"
          @click="handleSend"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";
import { ElMessage } from "element-plus";
import {
  useUniqueModeStore,
  SCORING_DIMENSION_CONFIG,
} from "@/stores/uniqueMode";
import { useChatStore } from "@/stores/chat";
import type { ChatMessage } from "@/types/chat";
import { sendChatMessageStream } from "@/services/deepseek";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  deepThinking?: boolean;
}

const store = useUniqueModeStore();
const chatStore = useChatStore();
const bodyEl = ref<HTMLElement | null>(null);
const inputText = ref("");
const isLoading = ref(false);
const messages = ref<ChatMsg[]>([]);
const deepThinkingEnabled = ref(false);
const streamingContent = ref("");
const streamingReasoning = ref("");

const LOCAL_KEY = () => `um-chat-${store.currentAccountId}`;

const quickQuestions = [
  "根据我现有的数据，什么选题方向最容易跑出高赞？",
  "我的粉丝画像大概是怎样的？他们喜欢什么类型的内容？",
  "最近哪些话题在我的领域里比较热门？",
  "帮我分析一下我的账号目前的内容短板是什么",
  "给我推荐3个下周可以拍摄的选题",
  "对比一下不同平台的点赞表现有什么差异",
];

import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
});

// ===== Markdown 渲染 =====
function renderMd(text: string): string {
  if (!text) return "";
  return md.render(text);
}

function loadMessages() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY());
    messages.value = raw ? JSON.parse(raw) : [];
  } catch {
    messages.value = [];
  }
}

function saveMessages() {
  localStorage.setItem(LOCAL_KEY(), JSON.stringify(messages.value));
}

watch(
  () => store.currentAccountId,
  () => {
    loadMessages();
    inputText.value = "";
  },
  { immediate: true },
);

onMounted(() => loadMessages());

function ask(q: string) {
  inputText.value = q;
  handleSend();
}

async function doDecompose() {
  const lastUserMsg = [...messages.value]
    .reverse()
    .find((m) => m.role === "user");
  const content = inputText.value.trim() || lastUserMsg?.content || "";
  if (!content) {
    ElMessage.warning("请先输入或发送一条消息，再执行内容拆解");
    return;
  }
  try {
    await store.decomposeContent(content);
    ElMessage.success("内容拆解完成，已注入对话上下文");
  } catch (e: any) {
    ElMessage.error(`拆解失败：${e.message || "未知错误"}`);
  }
}

function buildContext(): string {
  const parts: string[] = [];
  parts.push(`【账号信息】`);
  parts.push(`账号名称：${store.currentAccount?.name || "未设置"}`);
  if (store.scriptRecords.length > 0) {
    const total = store.scriptRecords.length;
    const avgLikes = Math.round(
      store.scriptRecords.reduce((s, r) => s + r.actualLikes, 0) / total,
    );
    const top = [...store.scriptRecords].sort(
      (a, b) => b.actualLikes - a.actualLikes,
    );
    parts.push(`\n【样本数据概况】`);
    parts.push(`总样本数：${total} 条`);
    parts.push(
      `平均点赞：${avgLikes >= 10000 ? (avgLikes / 10000).toFixed(1) + "万" : avgLikes.toLocaleString()}`,
    );
    const platformCounts: Record<string, number> = {};
    store.scriptRecords.forEach((r) => {
      platformCounts[r.platform] = (platformCounts[r.platform] || 0) + 1;
    });
    parts.push(
      `平台分布：${Object.entries(platformCounts)
        .map(([k, v]) => `${k}(${v}条)`)
        .join("，")}`,
    );
    parts.push(`\n【高赞样本 Top 5】`);
    top.slice(0, 5).forEach((r, i) => {
      const likes =
        r.actualLikes >= 10000
          ? (r.actualLikes / 10000).toFixed(1) + "万"
          : r.actualLikes.toLocaleString();
      parts.push(`${i + 1}. [${r.platform}] 点赞${likes}`);
      parts.push(
        `   内容：${r.content.slice(0, 120)}${r.content.length > 120 ? "..." : ""}`,
      );
      parts.push(
        `   综合评分：${r.compositeScore}分 | 标签：${r.tags?.join("#") || "无"}`,
      );
    });
    if (top.length > 0) {
      const low = top.slice(-3).reverse();
      parts.push(`\n【低赞样本参考】`);
      low.forEach((r, i) => {
        const likes =
          r.actualLikes >= 10000
            ? (r.actualLikes / 10000).toFixed(1) + "万"
            : r.actualLikes.toLocaleString();
        parts.push(
          `${i + 1}. [${r.platform}] 点赞${likes} | 内容：${r.content.slice(0, 100)}${r.content.length > 100 ? "..." : ""}`,
        );
      });
    }
  } else {
    parts.push(
      `\n【注意】该账号暂无样本数据，回答时请基于通用短视频创作经验，并提示用户先录入样本数据。`,
    );
  }
  if (store.patternSummary) {
    parts.push(`\n【已总结规律】`);
    parts.push(`高赞规律：${store.patternSummary.highLikePatterns.join("；")}`);
    parts.push(`低赞通病：${store.patternSummary.lowLikePatterns.join("；")}`);
    if (store.patternSummary.platformDifferences)
      parts.push(`平台差异：${store.patternSummary.platformDifferences}`);
  }
  if (store.writingFramework)
    parts.push(`\n【已总结写作框架】${store.writingFramework}`);
  const defaults: Record<string, number> = {
    hook: 18,
    empathy: 14,
    density: 16,
    structure: 14,
    originality: 16,
    socialResonance: 12,
    polish: 10,
  };
  const dimW = (key: string) => store.customWeights[key] ?? defaults[key] ?? 0;
  parts.push(
    `\n【评分维度】${SCORING_DIMENSION_CONFIG.map((d) => `${d.label}(${dimW(d.key)}%)`).join("、")}`,
  );
  if (store.customWeights && Object.keys(store.customWeights).length > 0)
    parts.push(`当前自定义权重：${JSON.stringify(store.customWeights)}`);
  if (store.decomposeEnabledForChat && store.lastDecomposition) {
    const d = store.lastDecomposition;
    const s: Record<string, string> = {
      strong: "强",
      medium: "中",
      weak: "弱",
    };
    const im: Record<string, string> = { high: "高", medium: "中", low: "低" };
    parts.push(
      `\n【内容拆解参考】开头钩子：${d.openingHook.text}（${s[d.openingHook.strength] || d.openingHook.strength}）`,
    );
    if (d.likeTriggers.length > 0)
      parts.push(
        `点赞引爆点：${d.likeTriggers.map((t) => `${t.point}(${im[t.expectedImpact] || t.expectedImpact})`).join("；")}`,
      );
    if (d.commentBaits.length > 0)
      parts.push(
        `评论引导：${d.commentBaits.map((b) => `${b.bait}(${im[b.expectedEngagement] || b.expectedEngagement})`).join("；")}`,
      );
    parts.push(`整体分析：${d.overallAnalysis}`);
  }
  return parts.join("\n");
}

/** 用受众画像构建系统提示上下文 */
function buildProfileContext(): string {
  const ap = store.audienceProfile;
  if (!ap) return "";
  const parts: string[] = ["\n【账号受众画像】"];
  parts.push(`赛道：${ap.niche}`);
  parts.push(`核心受众：${ap.targetAudience}`);
  if (ap.coreConfusions.length > 0) {
    parts.push(
      `受众核心困惑：${ap.coreConfusions.map((c, i) => `${i + 1}. ${c}`).join("；")}`,
    );
  }
  if (ap.resonancePatterns) parts.push(`共鸣触发模式：${ap.resonancePatterns}`);
  if (ap.trustBuilders) parts.push(`信任建立方式：${ap.trustBuilders}`);
  if (ap.summary) parts.push(`画像摘要：${ap.summary}`);
  if (ap.dimensionWeightHints?.length) {
    const hints = ap.dimensionWeightHints
      .map((h) => `${h.dimension}(${h.direction}) $\"{h.reason}\"`)
      .join("；");
    parts.push(`维度重要度建议：${hints}`);
  }
  return parts.join("\n");
}

/** 预测复盘数据上下文（帮助AI评估自身建议的可信度） */
function buildDeviationContext(): string {
  const t = store.deviationTrend;
  if (!t || t.total < 3) return "";
  const trendLabel =
    t.trend === "over"
      ? "偏乐观（容易高估）"
      : t.trend === "under"
        ? "偏保守（容易低估）"
        : "基本准确";
  const parts: string[] = ["\n【预测复盘（评估当前模型质量）】"];
  parts.push(
    `近${t.total}次预测复盘：平均偏差 ${t.avgDev > 0 ? "+" : ""}${t.avgDev}%，${trendLabel}`,
  );
  parts.push(
    `主桶命中率：${t.headlineHitRate ?? "--"}% | 相邻桶命中率：${t.adjacentHitRate ?? "--"}% | 脱靶率：${t.missRate ?? "--"}%`,
  );
  if (t.needsBump)
    parts.push(
      `⚠️ 预测模型当前严重失准，回答时应提醒用户"当前预测不可完全依赖"`,
    );
  parts.push(
    `说明：回答创作建议时，请交叉印证已有高赞规律，避免仅依赖模型评分`,
  );
  return parts.join("\n");
}

/** 用户近期关注话题（从对话历史中提取） */
function buildMemoryContext(): string {
  const userMsgs = messages.value.filter((m) => m.role === "user");
  if (userMsgs.length <= 2) return "";
  const recent = userMsgs.slice(-3).map((m) => {
    const brief = m.content.slice(0, 80).replace(/\n/g, " ");
    return brief + (m.content.length > 80 ? "..." : "");
  });
  const parts: string[] = ["\n【用户近期关注话题】"];
  recent.forEach((q, i) => parts.push(`${i + 1}. ${q}`));
  parts.push("请结合这些话题，优先提供与用户持续关注领域相关的建议");
  return parts.join("\n");
}

async function handleSend() {
  const q = inputText.value.trim();
  if (!q || isLoading.value) return;
  const model =
    chatStore.models.find((m: any) => m.isDefault) || chatStore.models[0];
  if (!model?.apiKey) {
    ElMessage.warning("请先在全局模型管理中设置 API Key");
    return;
  }
  messages.value.push({
    role: "user",
    content: q,
    deepThinking: deepThinkingEnabled.value,
  });
  inputText.value = "";
  isLoading.value = true;
  streamingContent.value = "";
  streamingReasoning.value = "";
  const thinking = deepThinkingEnabled.value;
  await nextTick();
  scrollBottom();

  const history: ChatMessage[] = messages.value.map((m, i) => ({
    id: `msg_${i}`,
    role: m.role,
    content: m.content,
    deepThinking: m.deepThinking || false,
    reasoningContent: m.reasoning || "",
    timestamp: "",
    followUpTo: null,
    followUpIds: [],
    isFavorited: false,
    isStreaming: false,
  }));

  // 上下文注入：受众画像、预测复盘、用户关注话题
  const profileContext = buildProfileContext();
  const deviationContext = buildDeviationContext();
  const memoryContext = buildMemoryContext();

  const systemMsg: ChatMessage = {
    id: "system",
    role: "system",
    content: `你是短视频账号的专属内容顾问，帮助创作者分析账号数据、优化内容策略。
以下是当前账号的真实数据，请基于这些数据回答问题：
${buildContext()}
${profileContext}
${deviationContext}
${memoryContext}
回答要求：
1. 回答必须基于账号实际数据，引用具体样本和数字
2. 如果没有样本数据，提示用户先录入数据，并给出通用的短视频创作建议
3. 用清晰的结构化方式回答：可以用「## 标题」分段、用「- 」列出要点，重要信息用「**加粗**」
4. 对账号问题给出具体可执行的建议
5. 语气专业但亲切`,
    deepThinking: false,
    reasoningContent: "",
    timestamp: "",
    followUpTo: null,
    followUpIds: [],
    isFavorited: false,
    isStreaming: false,
  };

  let fullContent = "";
  let fullReasoning = "";
  try {
    await sendChatMessageStream(
      model,
      [systemMsg, ...history],
      (chunk: string) => {
        fullContent += chunk;
        streamingContent.value = fullContent;
        scrollBottom();
      },
      () => {
        messages.value.push({
          role: "assistant",
          content: fullContent || "(无回复)",
          reasoning: fullReasoning || undefined,
          deepThinking: thinking,
        });
        streamingContent.value = "";
        streamingReasoning.value = "";
        saveMessages();
      },
      (error: Error) => {
        messages.value.push({
          role: "assistant",
          content: `出错了：${error.message || "请求失败"}`,
          deepThinking: thinking,
        });
        streamingContent.value = "";
        streamingReasoning.value = "";
        saveMessages();
      },
      { deepThinking: thinking },
      undefined,
      (reasoning: string) => {
        fullReasoning += reasoning;
        streamingReasoning.value = fullReasoning;
        scrollBottom();
      },
    );
  } catch (e: any) {
    messages.value.push({
      role: "assistant",
      content: `出错了：${e.message || "未知错误"}`,
      deepThinking: thinking,
    });
    streamingContent.value = "";
    streamingReasoning.value = "";
    saveMessages();
  } finally {
    isLoading.value = false;
    await nextTick();
    scrollBottom();
  }
}

function scrollBottom() {
  if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight;
}
</script>

<style scoped>
.ac-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
}

/* ===== 消息区 ===== */
.ac-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== 欢迎页 ===== */
.ac-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 48px 16px;
}
.acw-icon {
  margin-bottom: 16px;
}
.acw-title {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 6px;
  letter-spacing: -0.3px;
}
.acw-desc {
  font-size: 14px;
  color: #64748b;
  text-align: center;
  max-width: 460px;
  margin: 0 0 28px;
  line-height: 1.6;
}
.acw-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-width: 540px;
  width: 100%;
}
.acw-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1px solid #e8ecf2;
  border-radius: 12px;
  background: #fafbfc;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
  gap: 10px;
}
.acw-card:hover {
  border-color: #1a4cff;
  background: #f4f6ff;
  color: #1a4cff;
}
.acwc-q {
  flex: 1;
  min-width: 0;
}
.acwc-arrow {
  color: #94a3b8;
  font-size: 14px;
  flex-shrink: 0;
  transition: transform 0.2s;
}
.acw-card:hover .acwc-arrow {
  transform: translateX(3px);
  color: #1a4cff;
}

/* ===== 消息行 ===== */
.ac-msg-row {
  display: flex;
}
.ac-msg-row.user {
  justify-content: flex-end;
}
.ac-msg-inner {
  display: flex;
  gap: 10px;
  max-width: 85%;
}
.ac-msg-row.user .ac-msg-inner {
  flex-direction: row-reverse;
}

.ac-msg-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
}
.ac-msg-row.user .ac-msg-avatar {
  background: #eef3ff;
}

.ac-msg-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ac-msg-row.user .ac-msg-body {
  align-items: flex-end;
}

.ac-msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ac-msg-role {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}
.ac-badge {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 8px;
  font-weight: 600;
}
.ac-badge.thinking {
  background: #fef3c7;
  color: #b45309;
}

/* 推理过程 */
.ac-reasoning {
  margin-bottom: 4px;
}
.ac-reasoning details summary {
  font-size: 12px;
  color: #b45309;
  cursor: pointer;
  user-select: none;
}
.ac-reasoning-content {
  font-size: 12px;
  color: #8b6914;
  background: #fffbeb;
  border-left: 2px solid #f59e0b;
  padding: 8px 12px;
  margin-top: 6px;
  border-radius: 0 6px 6px 0;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 260px;
  overflow-y: auto;
}

/* ===== 消息气泡 ===== */
.ac-msg-bubble {
  font-size: 14px;
  line-height: 1.75;
  color: #374151;
  background: #f8f9fb;
  padding: 14px 18px;
  border-radius: 16px 16px 16px 6px;
  word-break: break-word;
}
.ac-msg-bubble.user {
  background: linear-gradient(135deg, #1a4cff, #2563eb);
  color: #fff;
  border-radius: 16px 16px 6px 16px;
}

/* ===== 气泡内 Markdown 排版 ===== */
.ac-msg-bubble :deep(p) {
  margin: 0 0 10px;
}
.ac-msg-bubble :deep(p:last-child) {
  margin-bottom: 0;
}
.ac-msg-bubble :deep(h1) {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  margin: 24px 0 12px;
  padding-bottom: 10px;
  border-bottom: 1.5px solid #e2e8f0;
  line-height: 1.3;
}
.ac-msg-bubble :deep(h2) {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin: 20px 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e8ecf2;
  line-height: 1.35;
}
.ac-msg-bubble :deep(h3) {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  margin: 16px 0 8px;
  line-height: 1.4;
}
.ac-msg-bubble :deep(h4) {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  margin: 12px 0 6px;
}
.ac-msg-bubble
  :deep(h1:first-child, h2:first-child, h3:first-child, h4:first-child) {
  margin-top: 0;
}

.ac-msg-bubble.user :deep(h1),
.ac-msg-bubble.user :deep(h2) {
  color: #fff;
  border-bottom-color: rgba(255, 255, 255, 0.2);
}
.ac-msg-bubble.user :deep(h3),
.ac-msg-bubble.user :deep(h4) {
  color: rgba(255, 255, 255, 0.95);
}

.ac-msg-bubble :deep(hr) {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 14px 0;
}
.ac-msg-bubble.user :deep(hr) {
  border-color: rgba(255, 255, 255, 0.15);
}

.ac-msg-bubble :deep(ul),
.ac-msg-bubble :deep(ol) {
  margin: 8px 0;
  padding-left: 22px;
}
.ac-msg-bubble :deep(li) {
  padding: 3px 0;
  line-height: 1.65;
}
.ac-msg-bubble :deep(ul li::marker) {
  color: #1a4cff;
}
.ac-msg-bubble :deep(ol li::marker) {
  color: #94a3b8;
  font-weight: 600;
}
.ac-msg-bubble.user :deep(ul li::marker) {
  color: rgba(255, 255, 255, 0.7);
}
.ac-msg-bubble.user :deep(ol li::marker) {
  color: rgba(255, 255, 255, 0.5);
}

.ac-msg-bubble :deep(blockquote) {
  border-left: 3px solid #1a4cff;
  padding: 8px 14px;
  margin: 10px 0;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 0 6px 6px 0;
  line-height: 1.6;
}
.ac-msg-bubble :deep(blockquote p) {
  margin: 0;
}
.ac-msg-bubble.user :deep(blockquote) {
  border-left-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.ac-msg-bubble :deep(pre) {
  background: #1e293b;
  color: #e2e8f0;
  padding: 14px 16px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.6;
  overflow-x: auto;
  margin: 10px 0;
}
.ac-msg-bubble :deep(pre code) {
  font-family: "SF Mono", "Fira Code", "Consolas", monospace;
  background: none;
  padding: 0;
  font-size: inherit;
}
.ac-msg-bubble.user :deep(pre) {
  background: rgba(0, 0, 0, 0.25);
}

.ac-msg-bubble :deep(code) {
  background: #e8ecf2;
  color: #dc2626;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  font-family: "SF Mono", "Fira Code", "Consolas", monospace;
}
.ac-msg-bubble.user :deep(code) {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
}

.ac-msg-bubble :deep(a) {
  color: #1a4cff;
  text-decoration: underline;
}
.ac-msg-bubble.user :deep(a) {
  color: #fff;
}

.ac-msg-bubble :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 10px 0;
  font-size: 13px;
}
.ac-msg-bubble :deep(th) {
  background: #f1f5f9;
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  text-align: left;
  font-weight: 600;
}
.ac-msg-bubble :deep(td) {
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
}
.ac-msg-bubble.user :deep(th) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}
.ac-msg-bubble.user :deep(td) {
  border-color: rgba(255, 255, 255, 0.15);
}

.ac-msg-bubble :deep(strong),
.ac-msg-bubble :deep(b) {
  color: #0f172a;
  font-weight: 700;
}
.ac-msg-bubble :deep(em),
.ac-msg-bubble :deep(i) {
  font-style: italic;
  color: #64748b;
}
.ac-msg-bubble.user :deep(strong),
.ac-msg-bubble.user :deep(b) {
  color: #fff;
}
.ac-msg-bubble.user :deep(em),
.ac-msg-bubble.user :deep(i) {
  color: rgba(255, 255, 255, 0.8);
}

.ac-msg-bubble :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 6px 0;
}

/* ===== 加载动画 ===== */
.ac-loading-dots {
  display: flex;
  gap: 5px;
  padding: 14px 16px;
  background: #f4f6f9;
  border-radius: 16px 16px 16px 6px;
}
.ac-loading-dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #c4cdd9;
  animation: ac-dot 1.4s ease-in-out infinite;
}
.ac-loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.ac-loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes ac-dot {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* ===== 拆解提示条 ===== */
.ac-hint-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 16px;
  background: #eef3ff;
  border-top: 1px solid #dde4f0;
  font-size: 12px;
  color: #4a6eb0;
}
.ac-hint-bar button {
  font-size: 11px;
  padding: 4px 14px;
  border-radius: 8px;
  border: 1px solid #1a4cff;
  background: #1a4cff;
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
}
.ac-hint-bar button:hover:not(:disabled) {
  background: #3a68ff;
}
.ac-hint-bar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== 工具栏 ===== */
.ac-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-top: 1px solid #eef2f6;
}
.ac-toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

/* ===== 输入区 ===== */
.ac-input-area {
  padding: 10px 20px 18px;
}
.ac-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 8px 10px;
  transition: border-color 0.15s;
}
.ac-input-row:focus-within {
  border-color: #1a4cff;
  box-shadow: 0 0 0 3px rgba(26, 76, 255, 0.06);
}

.ac-toggle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  margin-bottom: 2px;
}
.ac-toggle-btn:hover {
  border-color: #94a3b8;
}
.ac-toggle-btn.active {
  background: #eef3ff;
  border-color: #1a4cff;
}
.actb-icon {
  font-size: 14px;
}
.actb-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}
.ac-toggle-btn.active .actb-label {
  color: #1a4cff;
}

.ac-textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  color: #334155;
  line-height: 1.6;
  padding: 6px 0;
  min-height: 40px;
  max-height: 120px;
}
.ac-textarea::placeholder {
  color: #bcc5d2;
}
.ac-textarea:disabled {
  opacity: 0.5;
}

.ac-send {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: none;
  background: #1a4cff;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.ac-send:hover:not(:disabled) {
  background: #0d3ad6;
  transform: scale(1.04);
}
.ac-send:disabled {
  background: #e2e8f0;
  color: #bcc5d2;
  cursor: not-allowed;
}
</style>
