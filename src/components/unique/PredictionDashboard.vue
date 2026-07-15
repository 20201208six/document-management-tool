<template>
  <div class="pd-root">
    <!-- 概览条 -->
    <div class="pd-summary-bar">
      <div class="pd-summary-item pd-summary-likes">
        <span class="pds-label">预估点赞</span>
        <span class="pds-value"
          >{{ fmt(prediction.minLikes) }} ~ {{ fmt(prediction.maxLikes) }}</span
        >
      </div>
      <div class="pd-summary-item" v-if="estimatedViews">
        <span class="pds-label">预估播放</span>
        <span class="pds-value pds-views">{{ fmtView(estimatedViews) }}</span>
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
      <div class="pd-summary-item">
        <span class="pds-label">模型精度</span>
        <span class="pds-value pds-model-info"
          >R²={{ likeModelR2Display }}</span
        >
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

    <!-- 创作者信息摘要 -->
    <div class="pd-audience-bar" v-if="creatorInfo">
      <span class="pd-audience-icon">�</span>
      <span class="pd-audience-text">{{ creatorInfo }}</span>
    </div>

    <!-- 图表区：7维雷达图 + 概率分布 + 评分-点赞回归散点 -->
    <div class="pd-charts pd-charts-3col">
      <div class="pd-chart-panel">
        <div class="pd-chart-title">🎯 五逻辑传播评分</div>
        <div ref="radarRef" class="pd-chart-inner"></div>
        <div class="pd-hover-hint">悬停各逻辑层查看详情</div>
      </div>
      <div class="pd-chart-panel">
        <div class="pd-chart-title">🎲 点赞量概率分布</div>
        <div v-if="probHasData" ref="probRef" class="pd-chart-inner"></div>
        <div v-else class="pd-chart-empty">暂无概率分布数据</div>
        <div class="pd-hover-hint" v-if="probHasData">悬停柱条查看桶范围</div>
      </div>
      <div class="pd-chart-panel" v-if="scoreRangeBuckets.length > 0">
        <div class="pd-chart-title">📊 评分-点赞 回归关系</div>
        <div ref="regressionRef" class="pd-chart-inner"></div>
        <div class="pd-hover-hint">
          {{ scoreRangeBuckets.length }}条样本 • 星标=本稿预测
        </div>
      </div>
    </div>

    <!-- 评分分桶对照表（紧凑版） -->
    <div class="pd-bucket-table" v-if="scoreRangeBuckets.length > 0">
      <div class="pd-bucket-table-title">📋 评分-点赞-播放对照表</div>
      <div class="pd-bucket-row" v-for="b in scoreRangeBuckets" :key="b.range">
        <span class="pd-bucket-range">{{ b.range }}</span>
        <span class="pd-bucket-likes">均{{ fmt(b.avgLikes) }}赞</span>
        <span class="pd-bucket-views" v-if="b.avgViews"
          >均{{ fmtView(b.avgViews) }}播</span
        >
        <span class="pd-bucket-count">{{ b.sampleCount }}条</span>
      </div>
    </div>

    <!-- 详情折叠面板 -->
    <div class="pd-detail-panels">
      <!-- 预测依据 -->
      <el-collapse v-model="activePanels" class="pd-collapse">
        <el-collapse-item name="reasons" v-if="reasons.length">
          <template #title>
            <div class="pd-panel-header">
              <span class="pd-panel-icon">🔍</span> 预测依据
              <span class="pd-panel-count">({{ reasons.length }} 条)</span>
            </div>
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
            <div class="pd-panel-header">
              <span class="pd-panel-icon">📋</span> 参考样本
              <span class="pd-panel-count">({{ refSamples.length }} 条)</span>
            </div>
          </template>
          <div class="pd-ref-list">
            <div class="pd-ref-card" v-for="s in refSamples" :key="s.scriptId">
              <div class="pdref-top">
                <span
                  >{{ PLATFORM_CONFIG[s.platform]?.icon || "📄" }}
                  {{ s.platform }}</span
                >
                <span class="pdref-score">{{ s.compositeScore }} 分</span>
              </div>
              <div class="pdref-snippet">{{ s.snippet }}</div>
              <div class="pdref-reason">{{ s.similarityReason }}</div>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item name="counter" v-if="counterfactuals.length">
          <template #title>
            <div class="pd-panel-header">
              <span class="pd-panel-icon">🔄</span> 反事实分析
              <span class="pd-panel-count"
                >({{ counterfactuals.length }} 条)</span
              >
            </div>
          </template>
          <div class="pd-reason-list pd-reason--warn">
            <div
              class="pd-reason-item"
              v-for="(c, i) in counterfactuals"
              :key="i"
            >
              <span class="pd-reason-num pd-reason-num--warn">{{ i + 1 }}</span>
              <span>{{ c }}</span>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item name="account" v-if="accountAdviceItems.length">
          <template #title>
            <div class="pd-panel-header">
              <span class="pd-panel-icon">🔬</span> 账号专属优化建议
              <span class="pd-panel-count"
                >({{ accountAdviceItems.length }} 项)</span
              >
            </div>
          </template>
          <div class="pd-account-list">
            <div
              class="pd-account-item"
              v-for="item in accountAdviceItems"
              :key="item.key"
              :class="{ 'pd-account-warn': item.isWeak }"
            >
              <div class="pdacc-header">
                <span
                  class="pdacc-dot"
                  :style="{ background: item.color }"
                ></span>
                <span class="pdacc-dim">{{ item.label }}</span>
                <span class="pdacc-rank">#{{ item.rank }}</span>
                <span class="pdacc-corr"
                  >关联度 {{ item.correlationDisplay }}</span
                >
              </div>
              <div class="pdacc-body">
                <span class="pdacc-score" :class="{ low: item.isWeak }"
                  >本稿 {{ item.currentScore }} 分</span
                >
                <span class="pdacc-grade" :class="{ warn: item.isWeak }">{{
                  item.grade
                }}</span>
                <div class="pdacc-advice">{{ item.advice }}</div>
              </div>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item name="suggestions" v-if="suggestions.length > 1">
          <template #title>
            <div class="pd-panel-header">
              <span class="pd-panel-icon">✏️</span> 优化建议
              <span class="pd-panel-count">({{ suggestions.length }} 条)</span>
            </div>
          </template>
          <div class="pd-reason-list pd-reason--action">
            <div class="pd-reason-item" v-for="(s, i) in suggestions" :key="i">
              <span class="pd-reason-num pd-reason-num--action">{{
                i + 1
              }}</span>
              <span>{{ s }}</span>
            </div>
          </div>
        </el-collapse-item>

        <!-- 五层评测详情 -->
        <el-collapse-item name="evaluation" v-if="evaluation">
          <template #title>
            <div class="pd-panel-header">
              <span class="pd-panel-icon">📊</span> 五层评测详情
            </div>
          </template>
          <div class="pd-eval-detail">
            <!-- 结构链 -->
            <div class="pd-eval-layer">
              <div class="pd-eval-layer-title">🏗️ 结构链 · 贯穿基因</div>
              <div class="pd-eval-node-row" v-for="node in structNodes" :key="node.label">
                <span class="pd-eval-node-label">{{ node.label }}</span>
                <span class="pd-eval-node-score">{{ node.score }}分</span>
                <span class="pd-eval-gene-tags">
                  <span class="pd-eval-gene" :class="{ active: node.contrast }">反差</span>
                  <span class="pd-eval-gene" :class="{ active: node.cognition }">破认知</span>
                  <span class="pd-eval-gene" :class="{ active: node.resonance }">高共鸣</span>
                </span>
                <span class="pd-eval-node-reason">{{ node.reason }}</span>
              </div>
            </div>
            <!-- 人设锚定 -->
            <div class="pd-eval-layer" v-if="evaluation.persona">
              <div class="pd-eval-layer-title">👤 人设锚定</div>
              <div class="pd-eval-node-row">
                <span class="pd-eval-node-label">年龄匹配</span>
                <span class="pd-eval-node-score">{{ evaluation.persona.ageMatch }}分</span>
                <span class="pd-eval-node-reason">{{ evaluation.persona.ageFeedback }}</span>
              </div>
              <div class="pd-eval-node-row">
                <span class="pd-eval-node-label">赛道信任</span>
                <span class="pd-eval-node-score">{{ evaluation.persona.trackTrust }}分</span>
                <span class="pd-eval-node-reason">{{ evaluation.persona.trackTrustFeedback }}</span>
              </div>
            </div>
            <!-- 结果价值 -->
            <div class="pd-eval-layer" v-if="evaluation.value">
              <div class="pd-eval-layer-title">💡 结果价值</div>
              <div class="pd-eval-node-row">
                <span class="pd-eval-node-label">实用性</span>
                <span class="pd-eval-node-score">{{ evaluation.value.practicality }}分</span>
                <span class="pd-eval-node-reason">{{ evaluation.value.practicalityFeedback }}</span>
              </div>
              <div class="pd-eval-node-row">
                <span class="pd-eval-node-label">收获感</span>
                <span class="pd-eval-node-score">{{ evaluation.value.gain }}分</span>
                <span class="pd-eval-node-reason">{{ evaluation.value.gainFeedback }}</span>
              </div>
              <div class="pd-eval-node-row">
                <span class="pd-eval-node-label">易执行</span>
                <span class="pd-eval-node-score">{{ evaluation.value.easyExecute }}分</span>
                <span class="pd-eval-node-reason">{{ evaluation.value.easyExecuteFeedback }}</span>
              </div>
            </div>
            <!-- 转化效果 -->
            <div class="pd-eval-layer" v-if="evaluation.conversion">
              <div class="pd-eval-layer-title">🚀 转化效果</div>
              <div class="pd-eval-node-row">
                <span class="pd-eval-node-label">吸引力（这次想看）</span>
                <span class="pd-eval-node-score">{{ evaluation.conversion.attractiveness }}分</span>
                <span class="pd-eval-node-reason">{{ evaluation.conversion.attractivenessFeedback }}</span>
              </div>
              <div class="pd-eval-node-row">
                <span class="pd-eval-node-label">信任度（下次还看）</span>
                <span class="pd-eval-node-score">{{ evaluation.conversion.trust }}分</span>
                <span class="pd-eval-node-reason">{{ evaluation.conversion.trustFeedback }}</span>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import * as echarts from "echarts";
import { PLATFORM_CONFIG } from "@/services/scriptEvaluator";
import { useUniqueModeStore } from "@/stores/uniqueMode";
import type { PredictionResult } from "@/stores/uniqueMode";
import type { Platform } from "@/services/scriptEvaluator";

const store = useUniqueModeStore();

const props = defineProps<{
  prediction: PredictionResult;
  platform: Platform;
  reasons: string[];
  refSamples: Array<{
    scriptId?: string;
    platform: string;
    compositeScore: number;
    snippet: string;
    similarityReason: string;
  }>;
  suggestions: string[];
  counterfactuals: string[];
  accountAdviceItems: Array<{
    key: string;
    label: string;
    currentScore: number;
    color: string;
    rank: number;
    correlationDisplay: string;
    isWeak: boolean;
    grade: string;
    advice: string;
  }>;
  /** 回归模型数据（从预测结果中获取） */
  scoreRangeBuckets?: Array<{
    range: string;
    avgLikes: number;
    avgViews: number | null;
    sampleCount: number;
  }>;
  likeModelR2?: number;
}>();

defineEmits<{ openAccountSettings: [] }>();

const activePanels = ref<string[]>([]);

// 创作者信息
const creatorInfo = computed(() => {
  const cp = store.creatorProfile;
  if (!cp) return null;
  return `赛道：${cp.track} | 年龄：${cp.teacherAge}岁`;
});

// 图表 refs
const radarRef = ref<HTMLDivElement | null>(null);
const probRef = ref<HTMLDivElement | null>(null);
const regressionRef = ref<HTMLDivElement | null>(null);
let radarChart: echarts.ECharts | null = null;
let probChart: echarts.ECharts | null = null;
let regressionChart: echarts.ECharts | null = null;

// 预估播放量
const estimatedViews = computed(() => props.prediction.estimatedViews ?? null);
const scoreRangeBuckets = computed(
  () => props.prediction.scoreRangeBuckets ?? [],
);
const likeModelR2Display = computed(() => {
  const r2 = props.prediction.likeModelR2 ?? props.likeModelR2 ?? 0;
  return (r2 * 100).toFixed(0) + "%";
});

function fmt(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "w";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function fmtView(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + "亿";
  if (n >= 10000) return (n / 10000).toFixed(1) + "w";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

// 评分标签
const scoreTagClass = computed(() => {
  const s = props.prediction.compositeScore;
  if (s >= 80) return "excellent";
  if (s >= 60) return "good";
  if (s >= 40) return "normal";
  return "low";
});
const scoreTagLabel = computed(() => {
  const s = props.prediction.compositeScore;
  if (s >= 80) return "爆款潜力";
  if (s >= 60) return "表现良好";
  if (s >= 40) return "中规中矩";
  return "需重点打磨";
});

// 置信度简短版
const confidenceShort = computed(() => {
  const c = props.prediction.confidence || "";
  if (c.includes("高")) return "高";
  if (c.includes("中")) return "中";
  if (c.includes("低")) return "低";
  return c.slice(0, 2) || "--";
});

// 五逻辑配置
const FIVE_LOGIC_CONFIG = [
  { key: 'traffic' as const, label: '流量逻辑', desc: '人群是否爱看', color: '#f56c6c' },
  { key: 'platform' as const, label: '平台逻辑', desc: '平台规则适配度', color: '#e6a23c' },
  { key: 'user' as const, label: '用户逻辑', desc: '认可度·喜好·感受', color: '#67c23a' },
  { key: 'business' as const, label: '商业逻辑', desc: '内容价值', color: '#409eff' },
  { key: 'spread' as const, label: '传播逻辑', desc: '赛道-开头-价值-时长-易懂-落脚', color: '#9b59b6' },
] as const

// 最薄弱逻辑层
const weakestDimText = computed(() => {
  const fl = props.prediction.evaluation?.fiveLogic?.scores
  if (!fl) return ''
  const dims = FIVE_LOGIC_CONFIG.map(d => ({ label: d.label, score: fl[d.key] || 0 }))
  dims.sort((a, b) => a.score - b.score)
  return dims.length > 0 ? `${dims[0].label} ${dims[0].score}分` : ''
})

// 五层评测数据
const evaluation = computed(() => props.prediction.evaluation || null);

const structNodes = computed(() => {
  if (!evaluation.value) return [];
  const s = evaluation.value.structure;
  return [
    { label: '选题', score: s.topic.score, contrast: s.topic.contrast, cognition: s.topic.cognition, resonance: s.topic.resonance, reason: s.topic.feedback },
    { label: '话题', score: s.angle.score, contrast: s.angle.contrast, cognition: s.angle.cognition, resonance: s.angle.resonance, reason: s.angle.feedback },
    { label: '开头', score: s.opening.score, contrast: s.opening.contrast, cognition: s.opening.cognition, resonance: s.opening.resonance, reason: s.opening.feedback },
    { label: '衔接', score: s.transition.score, contrast: s.transition.contrast, cognition: s.transition.cognition, resonance: s.transition.resonance, reason: s.transition.feedback },
    { label: '内容', score: s.body.score, contrast: s.body.contrast, cognition: s.body.cognition, resonance: s.body.resonance, reason: s.body.feedback },
    { label: '落地', score: s.landing.score, contrast: s.landing.contrast, cognition: s.landing.cognition, resonance: s.landing.resonance, reason: s.landing.feedback },
  ];
});

const probHasData = computed(
  () => (props.prediction.bucketProbabilities || []).length > 0,
);

// 五逻辑雷达图配置
const radarOption = computed(() => {
  const fl = props.prediction.evaluation?.fiveLogic?.scores
  const dims = FIVE_LOGIC_CONFIG
  // 优先用 fiveLogic，没有则用 compositeScore 均分到五逻辑作为 fallback
  const values = fl
    ? dims.map(d => fl[d.key] || 0)
    : dims.map(() => props.prediction.compositeScore || 0)
  return {
    tooltip: {},
    legend: { show: false },
    radar: {
      center: ["50%", "56%"],
      radius: "62%",
      indicator: dims.map((d) => ({ name: d.label, max: 100 })),
      axisName: {
        color: "#64748b",
        fontSize: 12,
        borderRadius: 3,
        padding: [2, 5],
      },
      splitArea: { areaStyle: { color: ["#f8fafc", "#f1f5f9"] } },
      splitLine: { lineStyle: { color: "#e2e8f0" } },
      axisLine: { lineStyle: { color: "#e2e8f0" } },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: values,
            name: "传播五逻辑",
            areaStyle: { color: "rgba(99, 102, 241, 0.15)" },
            lineStyle: { color: "#6366f1", width: 2 },
            itemStyle: {
              color: "#6366f1",
              borderColor: "#fff",
              borderWidth: 2,
            },
            symbol: "circle",
            symbolSize: 7,
          },
        ],
        tooltip: {
          trigger: "item",
          formatter: (p: any) => {
            const idx =
              typeof p.dimensionIndex === "number"
                ? p.dimensionIndex
                : dims.findIndex((dd) => dd.label === p.name);
            if (idx < 0 || idx >= dims.length)
              return `${p.name || ""}: ${p.value}分`;
            const d = dims[idx];
            return `<b style="color:${d.color}">${d.label}: ${p.value}分</b><br/><span style="color:#94a3b8;font-size:11px">${d.desc}</span>`;
          },
        },
      },
    ],
  };
});

// 概率分布图
const probOption = computed(() => {
  const buckets = props.prediction.bucketProbabilities || [];
  if (!buckets.length) return {};
  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#fff",
      borderColor: "#e0e8f0",
      textStyle: { color: "#334155", fontSize: 13 },
      formatter: (params: any[]) => {
        const p = params[0];
        const b = buckets[p.dataIndex];
        const star = b?.isHeadline ? " ⭐主预测" : "";
        return `<b>${p.name}</b>${star}<br/>概率: <b style="color:#6366f1">${p.value}%</b>`;
      },
    },
    grid: { left: 10, right: 60, top: 10, bottom: 20 },
    xAxis: {
      type: "value",
      max: 100,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: buckets.map((b) => b.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#64748b",
        fontSize: 11,
        width: 100,
        overflow: "truncate",
      },
    },
    series: [
      {
        type: "bar",
        data: buckets.map((b) => ({
          value: b.probability,
          itemStyle: {
            color: b.isHeadline
              ? {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 1,
                  y2: 0,
                  colorStops: [
                    { offset: 0, color: "#6366f1" },
                    { offset: 1, color: "#8b5cf6" },
                  ],
                }
              : "#94a3b8",
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barWidth: 18,
        label: {
          show: true,
          position: "right",
          formatter: "{c}%",
          color: "#64748b",
          fontSize: 11,
        },
        emphasis: {
          itemStyle: { color: "#6366f1" },
        },
      },
    ],
  };
});

// 初始化/更新图表
function initRadar() {
  if (!radarRef.value) return;
  if (!radarChart) radarChart = echarts.init(radarRef.value);
  radarChart.setOption(radarOption.value, { notMerge: true });
}
function initProb() {
  if (!probRef.value) return;
  if (!probChart) probChart = echarts.init(probRef.value);
  probChart.setOption(probOption.value, { notMerge: true });
}

// 评分-点赞回归散点图
const regressionOption = computed(() => {
  const buckets = scoreRangeBuckets.value;
  if (buckets.length === 0) return {};
  const currentScore = props.prediction.compositeScore;
  const midLikes = Math.round(
    (props.prediction.minLikes + props.prediction.maxLikes) / 2,
  );

  // 用分桶数据构建散点
  const scatterData = buckets.map((b) => {
    const rangeNums = b.range.match(/\d+/g)?.map(Number) || [0, 100];
    const midScore =
      rangeNums.length >= 2
        ? (rangeNums[0] + rangeNums[1]) / 2
        : rangeNums[0] || 0;
    return { value: [midScore, b.avgLikes, b.sampleCount], name: b.range };
  });

  // 简单线性回归线
  const sorted = [...scatterData].sort((a, b) => a.value[0] - b.value[0]);
  const regLine =
    sorted.length >= 2
      ? (() => {
          const xs = sorted.map((s) => s.value[0]);
          const ys = sorted.map((s) =>
            Math.log10(Math.max(1, s.value[1] as number)),
          );
          const n = xs.length;
          const sumX = xs.reduce((a, b) => a + b, 0);
          const sumY = ys.reduce((a, b) => a + b, 0);
          const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
          const sumX2 = xs.reduce((a, x) => a + x * x, 0);
          const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
          const intercept = (sumY - slope * sumX) / n;
          const minX = xs[0],
            maxX = xs[n - 1];
          return [
            [minX, Math.round(Math.pow(10, slope * minX + intercept))],
            [maxX, Math.round(Math.pow(10, slope * maxX + intercept))],
          ];
        })()
      : null;

  return {
    tooltip: {
      trigger: "item",
      formatter: (p: any) => {
        if (p.seriesName === "回归线") return "";
        if (p.seriesName === "本稿预测")
          return `<b>⭐ 本稿预测</b><br/>综合分: ${currentScore}<br/>预估点赞: ${midLikes >= 10000 ? (midLikes / 10000).toFixed(1) + "w" : midLikes.toLocaleString()}`;
        return `<b>${p.name}</b><br/>综合分: ${Math.round(p.value[0])}<br/>均点赞: ${p.value[1] >= 10000 ? (p.value[1] / 10000).toFixed(1) + "w" : p.value[1].toLocaleString()}<br/>样本: ${p.value[2]}条`;
      },
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: "value",
      name: "综合评分",
      nameLocation: "middle",
      nameGap: 25,
      min: Math.max(
        0,
        Math.min(...scatterData.map((s) => s.value[0] as number)) - 10,
      ),
      max: Math.min(
        100,
        Math.max(...scatterData.map((s) => s.value[0] as number)) + 10,
      ),
      nameTextStyle: { color: "#64748b", fontSize: 10 },
      axisLabel: { fontSize: 10, color: "#94a3b8" },
    },
    yAxis: {
      type: "log",
      name: "点赞量",
      nameLocation: "middle",
      nameGap: 40,
      axisLabel: {
        fontSize: 10,
        color: "#94a3b8",
        formatter: (v: number) =>
          v >= 10000
            ? (v / 10000).toFixed(0) + "w"
            : v >= 1000
              ? (v / 1000).toFixed(0) + "k"
              : v,
      },
      nameTextStyle: { color: "#64748b", fontSize: 10 },
    },
    series: [
      ...(regLine
        ? [
            {
              type: "line",
              data: regLine,
              name: "回归线",
              lineStyle: {
                color: "#cbd5e1",
                type: "dashed" as const,
                width: 1.5,
              },
              symbol: "none",
              z: 0,
            },
          ]
        : []),
      {
        type: "scatter",
        data: scatterData,
        name: "分桶均值",
        symbolSize: (v: number[]) => Math.max(8, Math.min(24, (v[2] || 1) * 3)),
        itemStyle: { color: "#6366f1", opacity: 0.7 },
        z: 1,
      },
      {
        type: "scatter",
        name: "本稿预测",
        data: [{ value: [currentScore, midLikes], name: "本稿预测" }],
        symbolSize: 18,
        symbol: "diamond",
        itemStyle: { color: "#ef4444", borderColor: "#fff", borderWidth: 2 },
        z: 2,
      },
    ],
  };
});

function initRegression() {
  if (!regressionRef.value) return;
  if (!regressionChart) regressionChart = echarts.init(regressionRef.value);
  regressionChart.setOption(regressionOption.value, { notMerge: true });
}

onMounted(() => {
  nextTick(() => {
    initRadar();
    if (probHasData.value) initProb();
    if (scoreRangeBuckets.value.length > 0) initRegression();
  });
});

watch(
  () => props.prediction,
  () => {
    nextTick(() => {
      initRadar();
      if (probHasData.value) initProb();
      if (scoreRangeBuckets.value.length > 0) initRegression();
    });
  },
  { deep: true },
);

onBeforeUnmount(() => {
  radarChart?.dispose();
  probChart?.dispose();
  regressionChart?.dispose();
  radarChart = null;
  probChart = null;
  regressionChart = null;
});
</script>

<style scoped>
.pd-root {
  font-family: inherit;
}

/* 概览条 */
.pd-summary-bar {
  display: flex;
  gap: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 12px;
  color: #fff;
}
.pd-summary-item {
  flex: 1;
  text-align: center;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
}
.pd-summary-item:last-child {
  border-right: none;
}
.pds-label {
  display: block;
  font-size: 11px;
  opacity: 0.8;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.pds-value {
  font-size: 20px;
  font-weight: 700;
}
.pds-score {
  font-size: 28px;
}
.pds-tag {
  display: inline-block;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-top: 2px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
.pds-tag.excellent {
  background: rgba(52, 211, 153, 0.7);
}
.pds-tag.good {
  background: rgba(96, 165, 250, 0.7);
}
.pds-tag.normal {
  background: rgba(251, 191, 36, 0.7);
}
.pds-tag.low {
  background: rgba(248, 113, 113, 0.7);
}
.pds-confidence {
  font-size: 16px;
}
.pds-weak {
  font-size: 14px;
  opacity: 0.85;
}
.pds-views {
  font-size: 18px;
  opacity: 0.9;
}
.pds-model-info {
  font-size: 16px;
  opacity: 0.85;
}

/* 核心建议条 */
.pd-advice-bar {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 13px;
  color: #92400e;
  margin-bottom: 10px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 受众画像条 */
.pd-audience-bar {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 12px;
  color: #1e40af;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pd-audience-icon {
  font-size: 14px;
  flex-shrink: 0;
}
.pd-audience-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}
.pd-audience-stale {
  flex-shrink: 0;
  color: #d97706;
  font-size: 11px;
  background: #fef3c7;
  padding: 2px 8px;
  border-radius: 6px;
}
/* 无画像引导状态 */
.pd-audience-missing {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
  transition: all 0.2s;
}
.pd-audience-missing:hover {
  background: #fee2e2;
}
.pd-audience-action {
  flex-shrink: 0;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

/* 图表区 */
.pd-charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 10px;
}
.pd-chart-panel {
  background: #fff;
  border: 1px solid #eef2f6;
  border-radius: 12px;
  padding: 14px 10px 4px;
  position: relative;
}
.pd-chart-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  padding: 0 4px;
  margin-bottom: 2px;
}
.pd-chart-inner {
  width: 100%;
  height: 220px;
}
.pd-chart-empty {
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  font-size: 13px;
}
.pd-hover-hint {
  text-align: center;
  font-size: 10px;
  color: #cbd5e1;
  padding-bottom: 6px;
  user-select: none;
}

/* 3栏图表布局 */
.pd-charts-3col {
  grid-template-columns: 1fr 1fr 1fr;
}

/* 评分分桶对照表 */
.pd-bucket-table {
  background: #fff;
  border: 1px solid #eef2f6;
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 10px;
}
.pd-bucket-table-title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 8px;
}
.pd-bucket-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid #f1f5f9;
}
.pd-bucket-row:last-child {
  border-bottom: none;
}
.pd-bucket-range {
  font-weight: 600;
  color: #334155;
  min-width: 70px;
}
.pd-bucket-likes {
  color: #6366f1;
  min-width: 70px;
}
.pd-bucket-views {
  color: #10b981;
  min-width: 70px;
}
.pd-bucket-count {
  color: #94a3b8;
  font-size: 11px;
}

/* 详情折叠 */
.pd-detail-panels {
  margin-top: 2px;
}
.pd-collapse {
  border: 1px solid #eef2f6;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.pd-collapse :deep(.el-collapse-item__header) {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  border-bottom: 1px solid #f1f5f9;
  background: #fafbfc;
}
.pd-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 1px solid #f1f5f9;
}
.pd-collapse :deep(.el-collapse-item__content) {
  padding: 14px 18px;
}
.pd-panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pd-panel-icon {
  font-size: 15px;
}
.pd-panel-count {
  color: #94a3b8;
  font-size: 11px;
  margin-left: 4px;
}

/* 预测依据 / 优化建议 列表 */
.pd-reason-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pd-reason-item {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
  align-items: flex-start;
}
.pd-reason-num {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}
.pd-reason-num--warn {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}
.pd-reason-num--action {
  background: linear-gradient(135deg, #10b981, #059669);
}

/* 参考样本 */
.pd-ref-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pd-ref-card {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
  font-size: 12px;
}
.pdref-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  color: #64748b;
}
.pdref-score {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
.pdref-snippet {
  color: #334155;
  line-height: 1.5;
  margin-bottom: 4px;
  max-height: 60px;
  overflow: hidden;
}
.pdref-reason {
  color: #94a3b8;
  font-size: 11px;
}

/* 账号建议 */
.pd-account-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pd-account-item {
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
}
.pd-account-item.pd-account-warn {
  background: #fffbeb;
  border-color: #fde68a;
}
.pdacc-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 13px;
}
.pdacc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pdacc-dim {
  font-weight: 600;
  color: #334155;
}
.pdacc-rank {
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #6366f1;
}
.pdacc-corr {
  font-size: 11px;
  color: #94a3b8;
  margin-left: auto;
}
.pdacc-body {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
  font-size: 12px;
}
.pdacc-score {
  color: #334155;
}
.pdacc-score.low {
  color: #ef4444;
  font-weight: 600;
}
.pdacc-grade {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #ecfdf5;
  color: #059669;
}
.pdacc-grade.warn {
  background: #fef3c7;
  color: #d97706;
}
.pdacc-advice {
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

/* 响应式 */
@media (max-width: 750px) {
  .pd-summary-bar {
    flex-wrap: wrap;
    gap: 8px;
  }
  .pd-summary-item {
    flex: 1 1 45%;
    border-right: none;
  }
  .pd-charts {
    grid-template-columns: 1fr;
  }
}

/* 五层评测详情 */
.pd-eval-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pd-eval-layer {
  background: #f8fafc;
  border-radius: 6px;
  padding: 10px 14px;
}
.pd-eval-layer-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
}
.pd-eval-node-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}
.pd-eval-node-label {
  font-weight: 500;
  color: #475569;
  min-width: 90px;
}
.pd-eval-node-score {
  font-weight: 600;
  color: #6366f1;
  min-width: 42px;
}
.pd-eval-node-reason {
  color: #64748b;
  flex: 1;
}
.pd-eval-gene-tags {
  display: flex;
  gap: 4px;
}
.pd-eval-gene {
  font-size: 10px;
  padding: 0px 5px;
  border-radius: 3px;
  background: #f1f5f9;
  color: #94a3b8;
}
.pd-eval-gene.active {
  background: #dbeafe;
  color: #2563eb;
  font-weight: 500;
}
</style>
