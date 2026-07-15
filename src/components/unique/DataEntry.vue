<template>
  <div class="de-root">
    <!-- 创作者信息横幅（录入文案前必须配置） -->
    <div
      v-if="!store.creatorProfile"
      class="de-audience-bar"
      style="border-left-color: #e6a23c;"
    >
      <span class="deab-icon">⚠️</span>
      <div class="deab-text">
        <span class="deab-title">请先配置「赛道」和「老师年龄」</span>
        <span class="deab-sub">录入文案前必须设置，AI 将据此评测年龄匹配度和赛道信任度</span>
      </div>
    </div>

    <!-- 主卡片 -->
    <div class="de-main">
      <!-- 顶部：标题 + 模式切换 -->
      <div class="de-top-bar">
        <div class="det-left">
          <span class="det-title">录入新样本</span>
          <span class="det-desc">添加已发布的口播文稿，AI 自动7维评分</span>
        </div>
        <div class="det-tabs">
          <button
            class="dett-tab"
            :class="{ active: entryMode === 'single' }"
            @click="entryMode = 'single'"
          >
            <span class="dett-icon">📝</span> 单条
          </button>
          <button
            class="dett-tab"
            :class="{ active: entryMode === 'batch' }"
            @click="entryMode = 'batch'"
          >
            <span class="dett-icon">📚</span> 批量
          </button>
        </div>
      </div>

      <!-- 单条录入 -->
      <template v-if="entryMode === 'single'">
        <!-- 多平台开关 -->
        <div class="de-row de-switch-row" @click="toggleMulti">
          <div class="desw-left">
            <span class="desw-label">多平台发布</span>
            <span class="desw-hint">{{
              multiPlatform
                ? "已开启 · 可为各平台分别填写数据"
                : "开启后可为各平台分别填写点赞量"
            }}</span>
          </div>
          <span class="desw-toggle" :class="{ on: multiPlatform }">
            <span class="deswt-knob"></span>
          </span>
        </div>

        <!-- 内容输入 -->
        <div class="de-block">
          <div class="deb-label">文稿内容 <span class="debl-req">*</span></div>
          <textarea
            v-model="form.content"
            class="de-textarea"
            rows="8"
            placeholder="粘贴口播文案的完整文字稿..."
          ></textarea>
          <div class="deb-foot">
            <span>{{ form.content.length }} 字</span>
          </div>
        </div>

        <!-- 链接 -->
        <div class="de-row">
          <span class="der-label">发布链接</span>
          <input
            v-model="form.link"
            class="de-input"
            placeholder="选填，视频链接"
          />
        </div>

        <!-- 单平台模式 -->
        <template v-if="!multiPlatform">
          <div class="de-row">
            <span class="der-label">平台</span>
            <select v-model="form.platform" class="de-select">
              <option v-for="(c, k) in PLATFORM_CONFIG" :key="k" :value="k">
                {{ c.icon }} {{ c.label }}
              </option>
            </select>
          </div>
          <div class="de-row de-row-dual">
            <div class="derd-item">
              <span class="der-label">点赞量</span>
              <input
                v-model.number="form.actualLikes"
                type="number"
                class="de-input de-input-num"
                min="0"
                placeholder="0"
              />
            </div>
            <div class="derd-item">
              <span class="der-label">播放量</span>
              <input
                v-model.number="form.views"
                type="number"
                class="de-input de-input-num"
                min="0"
                placeholder="选填"
              />
            </div>
          </div>
        </template>

        <!-- 多平台模式 -->
        <div v-else class="de-multi-block">
          <div class="demb-head">选择发布平台并填写数据</div>
          <div class="demb-grid">
            <div
              v-for="p in platformList"
              :key="p"
              class="demb-card"
              :class="{ active: platformEntries[p].enabled }"
              @click="platformEntries[p].enabled = !platformEntries[p].enabled"
            >
              <div class="dembc-top">
                <span
                  class="dembc-check"
                  :class="{ on: platformEntries[p].enabled }"
                  >✓</span
                >
                <span class="dembc-icon">{{ PLATFORM_CONFIG[p]?.icon }}</span>
                <span class="dembc-name">{{ PLATFORM_CONFIG[p]?.label }}</span>
              </div>
              <div class="dembc-data" v-if="platformEntries[p].enabled">
                <input
                  v-model.number="platformEntries[p].likes"
                  type="number"
                  class="dembc-num"
                  placeholder="点赞"
                  @click.stop
                />
                <input
                  v-model.number="platformEntries[p].views"
                  type="number"
                  class="dembc-num"
                  placeholder="播放"
                  @click.stop
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 标签 -->
        <div class="de-row">
          <span class="der-label">标签</span>
          <input
            v-model="form.tagsStr"
            class="de-input"
            placeholder="选填，#号分隔 如：情感#励志#干货"
          />
        </div>

        <!-- 提交 -->
        <button
          class="de-submit-btn"
          :disabled="!canSubmit || store.isAnalyzingScript"
          @click="handleSubmit"
        >
          <span v-if="store.isAnalyzingScript" class="dsub-loading"></span>
          {{
            store.isAnalyzingScript
              ? "AI 评分中..."
              : multiPlatform
                ? `保存 ${activePlatformCount} 个平台样本`
                : "保存样本并 AI 评分"
          }}
        </button>

        <div v-if="submitMsg" class="de-msg" :class="submitOk ? 'ok' : 'err'">
          {{ submitMsg }}
        </div>
      </template>

      <!-- 批量录入 -->
      <template v-else>
        <div class="de-batch-help">
          <div class="dbh-title">批量粘贴规则</div>
          <div class="dbh-body">
            多篇文稿用 <code>---</code> 分隔。每篇前可加
            <code>[likes=15200]</code>
            <code>[views=500000]</code> 单独指定数据。
          </div>
          <pre class="dbh-example">
[likes=15200] [views=500000]
第一句口播文案的内容...
第二句继续...
---
[likes=8300]
第二篇口播文案的内容...</pre
          >
        </div>

        <div class="de-block">
          <div class="deb-label">批量内容 <span class="debl-req">*</span></div>
          <textarea
            v-model="batchForm.raw"
            class="de-textarea"
            rows="10"
            placeholder="粘贴多篇文稿，每篇之间用 --- 分隔..."
          ></textarea>
        </div>

        <div class="de-row de-row-dual">
          <div class="derd-item">
            <span class="der-label">默认平台</span>
            <select v-model="batchForm.platform" class="de-select">
              <option v-for="(c, k) in PLATFORM_CONFIG" :key="k" :value="k">
                {{ c.icon }} {{ c.label }}
              </option>
            </select>
          </div>
          <div class="derd-item">
            <span class="der-label">默认点赞</span>
            <input
              v-model.number="batchForm.defaultLikes"
              type="number"
              class="de-input de-input-num"
              min="0"
            />
          </div>
          <div class="derd-item">
            <span class="der-label">默认播放</span>
            <input
              v-model.number="batchForm.defaultViews"
              type="number"
              class="de-input de-input-num"
              min="0"
              placeholder="选填"
            />
          </div>
        </div>

        <div class="de-row">
          <span class="der-label">标签</span>
          <input
            v-model="batchForm.tagsStr"
            class="de-input"
            placeholder="选填，#号分隔"
          />
        </div>

        <!-- 解析预览 -->
        <div v-if="batchPreview.length > 0" class="de-batch-preview">
          <div class="dbp-head">
            已解析 <strong>{{ batchPreview.length }}</strong> 篇文稿
          </div>
          <div class="dbp-list">
            <div
              v-for="(item, idx) in batchPreview"
              :key="idx"
              class="dbp-item"
            >
              <span class="dbpi-num">{{ idx + 1 }}</span>
              <span class="dbpi-plat">{{
                PLATFORM_CONFIG[item.platform]?.icon
              }}</span>
              <span class="dbpi-data">{{ formatLikes(item.likes) }} 赞</span>
              <span class="dbpi-text"
                >{{ item.content.slice(0, 40)
                }}{{ item.content.length > 40 ? "…" : "" }}</span
              >
            </div>
          </div>
        </div>

        <button
          class="de-submit-btn"
          :disabled="!canBatchSubmit || batchLoading"
          @click="handleBatchSubmit"
        >
          <span v-if="batchLoading" class="dsub-loading"></span>
          {{
            batchLoading
              ? `已提交 ${batchDoneCount}/${batchPreview.length} 篇，AI 评分中...`
              : `批量保存 ${batchPreview.length} 篇样本`
          }}
        </button>

        <div v-if="batchProgress" class="de-batch-progress">
          <div class="dbp-bar">
            <span class="dbpb-fill" :style="{ width: batchPct + '%' }"></span>
          </div>
          <span class="dbp-label"
            >{{ batchDoneCount }} / {{ batchPreview.length }}</span
          >
        </div>

        <div v-if="submitMsg" class="de-msg" :class="submitOk ? 'ok' : 'err'">
          {{ submitMsg }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  useUniqueModeStore,
} from "@/stores/uniqueMode";
import { PLATFORM_CONFIG, type Platform } from "@/services/scriptEvaluator";

const store = useUniqueModeStore();
const submitMsg = ref("");
const submitOk = ref(true);


// 表单提交
const entryMode = ref<"single" | "batch">("single");
const multiPlatform = ref(false);
function toggleMulti() {
  multiPlatform.value = !multiPlatform.value;
}

const form = reactive({
  platform: "抖音" as Platform,
  content: "",
  link: "",
  actualLikes: 1000,
  views: 0 as number | undefined,
  tagsStr: "",
});
const platformList = Object.keys(PLATFORM_CONFIG).filter(
  (k) => k !== "全部",
) as Platform[];
const platformEntries = reactive<
  Record<string, { enabled: boolean; likes: number; views: number }>
>(
  Object.fromEntries(
    platformList.map((k) => [k, { enabled: false, likes: 0, views: 0 }]),
  ),
);
const activePlatformCount = computed(
  () => platformList.filter((k) => platformEntries[k].enabled).length,
);
const canSubmit = computed(() => {
  if (!form.content.trim()) return false;
  if (!multiPlatform.value) return true;
  return activePlatformCount.value > 0;
});

async function handleSubmit() {
  if (!form.content.trim()) {
    ElMessage.warning("请填写文稿内容");
    return;
  }
  submitMsg.value = "";
  const tags = form.tagsStr
    .split("#")
    .map((t) => t.trim())
    .filter(Boolean);
  const viewVal = form.views && form.views > 0 ? form.views : undefined;
  try {
    if (!multiPlatform.value) {
      await store.addScript({
        platform: form.platform,
        content: form.content.trim(),
        link: form.link.trim(),
        actualLikes: form.actualLikes || 0,
        views: viewVal,
        tags,
      });
    } else {
      const targets = platformList.filter((k) => platformEntries[k].enabled);
      if (targets.length === 0) {
        ElMessage.warning("请至少选择一个平台");
        return;
      }

      // 第一个平台正常走 AI 评分
      const p0 = targets[0];
      const pv0 =
        platformEntries[p0].views > 0 ? platformEntries[p0].views : undefined;
      const first = await store.addScript({
        platform: p0,
        content: form.content.trim(),
        link: form.link.trim(),
        actualLikes: platformEntries[p0].likes || 0,
        views: pv0,
        tags,
      });

      // 后续平台复用同一份 AI 评分，不再重复调用 AI
      const precomputed = {
        scores: first.scores,
        compositeScore: first.compositeScore,
        analysis: first.analysis,
        modelVersion: first.modelVersion,
      };
      for (let i = 1; i < targets.length; i++) {
        const p = targets[i];
        const pv =
          platformEntries[p].views > 0 ? platformEntries[p].views : undefined;
        await store.addScript(
          {
            platform: p,
            content: form.content.trim(),
            link: form.link.trim(),
            actualLikes: platformEntries[p].likes || 0,
            views: pv,
            tags,
          },
          precomputed,
        );
      }
    }
    form.content = "";
    form.link = "";
    form.actualLikes = 1000;
    form.views = 0;
    form.tagsStr = "";
    for (const k of platformList)
      platformEntries[k] = { enabled: false, likes: 0, views: 0 };
    submitMsg.value = multiPlatform.value
      ? `${activePlatformCount.value} 个平台样本已保存（AI 仅评分一次）`
      : "样本保存成功，AI 正在后台评分";
    submitOk.value = true;
  } catch (e: any) {
    // 创作者信息未配置 → 对话框已自动弹出，不显示错误不清理表单
    if (e.message === 'CREATOR_NOT_CONFIGURED') return
    submitMsg.value = "保存失败: " + (e.message || "未知错误");
    submitOk.value = false;
  }
}

// 批量
const batchForm = reactive({
  platform: "抖音" as Platform,
  defaultLikes: 1000,
  defaultViews: 0 as number | undefined,
  raw: "",
  tagsStr: "",
});
const batchLoading = ref(false);
const batchProgress = ref(false);
const batchDoneCount = ref(0);
const batchPreview = ref<
  Array<{ content: string; likes: number; views?: number; platform: Platform }>
>([]);
const batchPct = computed(() =>
  batchPreview.value.length
    ? Math.round((batchDoneCount.value / batchPreview.value.length) * 100)
    : 0,
);
const canBatchSubmit = computed(
  () => batchPreview.value.length > 0 && !batchLoading.value,
);

function formatLikes(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "w";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

watch(
  () => batchForm.raw,
  () => parseBatch(),
);
watch(
  () => batchForm.platform,
  () => parseBatch(),
);
watch(
  () => batchForm.defaultLikes,
  () => parseBatch(),
);

function parseBatch() {
  const raw = batchForm.raw.trim();
  if (!raw) {
    batchPreview.value = [];
    return;
  }
  const blocks = raw.split(/\n---+[\s]*\n/);
  const items: typeof batchPreview.value = [];
  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;
    let likes = batchForm.defaultLikes;
    let views = batchForm.defaultViews;
    const likesMatch = block.match(/^\[likes\s*=\s*([\d.]+[wWkK]?)\]/);
    if (likesMatch) {
      let v = likesMatch[1];
      if (/[wW]$/.test(v)) likes = parseFloat(v) * 10000;
      else if (/[kK]$/.test(v)) likes = parseFloat(v) * 1000;
      else likes = parseInt(v) || batchForm.defaultLikes;
      block = block.slice(likesMatch[0].length).trim();
    }
    const viewsMatch = block.match(/^\[views\s*=\s*([\d.]+[wWkK]?)\]/);
    if (viewsMatch) {
      let v = viewsMatch[1];
      if (/[wW]$/.test(v)) views = parseFloat(v) * 10000;
      else if (/[kK]$/.test(v)) views = parseFloat(v) * 1000;
      else views = parseInt(v) || 0;
      block = block.slice(viewsMatch[0].length).trim();
    }
    if (!block) continue;
    items.push({
      content: block,
      likes,
      views: views && views > 0 ? views : undefined,
      platform: batchForm.platform,
    });
  }
  batchPreview.value = items;
}

async function handleBatchSubmit() {
  if (batchPreview.value.length === 0) {
    ElMessage.warning("请粘贴至少一篇文稿");
    return;
  }
  batchLoading.value = true;
  batchProgress.value = true;
  batchDoneCount.value = 0;
  submitMsg.value = "";
  const tags = batchForm.tagsStr
    .split("#")
    .map((t) => t.trim())
    .filter(Boolean);
  const tasks = batchPreview.value.slice();
  const CONCURRENCY = 3;
  const failed: string[] = [];
  let creatorNotConfigured = false
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const chunk = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((t) =>
        store.addScript({
          platform: t.platform,
          content: t.content,
          link: "",
          actualLikes: t.likes,
          views: t.views,
          tags,
        }),
      ),
    );
    for (const r of results) {
      if (r.status === "rejected") {
        if (r.reason?.message === 'CREATOR_NOT_CONFIGURED') {
          creatorNotConfigured = true
          break
        }
        failed.push(r.reason?.message || "未知错误")
      };
      batchDoneCount.value++;
    }
    if (creatorNotConfigured) break
  }
  if (creatorNotConfigured) { batchLoading.value = false; batchProgress.value = false; return }
  batchLoading.value = false;
  batchProgress.value = false;
  if (failed.length > 0) {
    submitMsg.value = `${tasks.length - failed.length} 篇已保存，${failed.length} 篇失败`;
    submitOk.value = false;
  } else {
    submitMsg.value = `${tasks.length} 篇样本全部保存成功`;
    submitOk.value = true;
    batchForm.raw = "";
  }
  if (failed.length < tasks.length)
    ElMessage.success(`${tasks.length - failed.length} 篇样本已保存`);
}
</script>

<style scoped>
/* ========== 根容器 ========== */
.de-root {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
}

/* ========== 受众画像横幅 ========== */
.de-audience-bar {
  width: 100%;
  max-width: 760px;
  display: flex;
  align-items: center;
  gap: 14px;
  background: linear-gradient(135deg, #fef9ec, #fdf3d6);
  border: 1px solid #f0c75e;
  border-radius: 14px;
  padding: 14px 20px;
  margin-bottom: 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.de-audience-bar:hover {
  box-shadow: 0 2px 12px rgba(200, 150, 20, 0.1);
  border-color: #e0b030;
}
.deab-icon {
  font-size: 26px;
  flex-shrink: 0;
}
.deab-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.deab-title {
  font-size: 14px;
  font-weight: 700;
  color: #7c5e00;
}
.deab-sub {
  font-size: 12px;
  color: #a68a3c;
}
.deab-action {
  font-size: 13px;
  font-weight: 600;
  color: #b8860b;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ========== 快速配置弹窗 ========== */
.de-quick-audience {
  width: 100%;
  max-width: 760px;
  background: #f5f7ff;
  border: 1px solid #b8c8f0;
  border-radius: 14px;
  padding: 18px 20px;
  margin-bottom: 16px;
}
.dqa-head {
  margin-bottom: 12px;
}
.dqah-title {
  font-size: 15px;
  font-weight: 700;
  color: #1a4cff;
}
.dqah-desc {
  font-size: 12px;
  color: #6a85c0;
  margin-left: 8px;
}
.dqa-body {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.dqa-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #ccd6f0;
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  background: #fff;
}
.dqa-input:focus {
  border-color: #1a4cff;
  box-shadow: 0 0 0 3px rgba(26, 76, 255, 0.08);
}
.dqa-btns {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.dqa-btn {
  padding: 10px 20px;
  border: 1px solid #ccd6f0;
  border-radius: 10px;
  background: #fff;
  color: #5a6ea0;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.dqa-btn:hover {
  border-color: #1a4cff;
  color: #1a4cff;
}
.dqa-btn.primary {
  background: #1a4cff;
  color: #fff;
  border-color: #1a4cff;
}
.dqa-btn.primary:hover {
  background: #0d3ad6;
}
.dqa-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.dqa-foot {
  font-size: 11px;
  color: #8a9ec0;
}

/* ========== 主卡片 ========== */
.de-main {
  width: 100%;
  max-width: 760px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid #eef1f6;
  padding: 28px 32px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
}

/* ========== 顶部栏 ========== */
.de-top-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
}
.det-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.det-title {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.3px;
}
.det-desc {
  font-size: 13px;
  color: #94a3b8;
}
.det-tabs {
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 3px;
  flex-shrink: 0;
}
.dett-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.dett-tab:hover {
  color: #334155;
}
.dett-tab.active {
  background: #fff;
  color: #1a4cff;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.dett-icon {
  font-size: 14px;
}

/* ========== 行 ========== */
.de-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #f3f4f6;
}
.de-row:last-child {
  border-bottom: none;
}
.der-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  width: 64px;
  flex-shrink: 0;
}
.de-input {
  flex: 1;
  padding: 9px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  background: #fafbfc;
  transition: all 0.15s;
}
.de-input:focus {
  border-color: #1a4cff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(26, 76, 255, 0.06);
}
.de-input-num {
  flex: 1;
  min-width: 0;
  -moz-appearance: textfield;
}
.de-input-num::-webkit-inner-spin-button,
.de-input-num::-webkit-outer-spin-button {
  opacity: 1;
}
.de-select {
  flex: 1;
  padding: 9px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  background: #fafbfc;
  cursor: pointer;
  transition: all 0.15s;
}
.de-select:focus {
  border-color: #1a4cff;
  background: #fff;
}

/* 双列行 */
.de-row-dual {
  gap: 20px;
}
.derd-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ========== 文本块 ========== */
.de-block {
  padding: 14px 0;
}
.deb-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}
.debl-req {
  color: #ef4444;
}
.de-textarea {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.8;
  outline: none;
  resize: vertical;
  background: #fafbfc;
  font-family: inherit;
  transition: all 0.15s;
  box-sizing: border-box;
}
.de-textarea:focus {
  border-color: #1a4cff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(26, 76, 255, 0.06);
}
.deb-foot {
  display: flex;
  justify-content: flex-end;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}

/* ========== 多平台开关 ========== */
.de-switch-row {
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #f3f4f6;
  padding: 14px 0;
}
.de-switch-row:hover {
  opacity: 0.9;
}
.desw-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.desw-label {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}
.desw-hint {
  font-size: 12px;
  color: #94a3b8;
}
.desw-toggle {
  position: relative;
  width: 48px;
  height: 28px;
  background: #cbd5e1;
  border-radius: 14px;
  flex-shrink: 0;
  transition: background 0.25s;
}
.desw-toggle.on {
  background: #1a4cff;
}
.deswt-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  background: #fff;
  border-radius: 50%;
  transition: left 0.25s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.desw-toggle.on .deswt-knob {
  left: 23px;
}

/* ========== 多平台卡片 ========== */
.de-multi-block {
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
}
.demb-head {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 10px;
}
.demb-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.demb-card {
  border: 1.5px solid #e8ecf2;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fafbfc;
  cursor: pointer;
  transition: all 0.2s;
}
.demb-card:hover {
  border-color: #c4cdd9;
  background: #fff;
}
.demb-card.active {
  border-color: #1a4cff;
  background: #f4f6ff;
}
.dembc-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.dembc-check {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #cdd4de;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: transparent;
  transition: all 0.2s;
  flex-shrink: 0;
}
.dembc-check.on {
  background: #1a4cff;
  border-color: #1a4cff;
  color: #fff;
}
.dembc-icon {
  font-size: 16px;
}
.dembc-name {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
}
.dembc-data {
  display: flex;
  gap: 6px;
  padding-left: 28px;
}
.dembc-num {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  font-size: 11px;
  outline: none;
  text-align: center;
  -moz-appearance: textfield;
  min-width: 0;
}
.dembc-num::-webkit-inner-spin-button {
  opacity: 1;
}
.dembc-num:focus {
  border-color: #1a4cff;
}

/* ========== 提交按钮 ========== */
.de-submit-btn {
  width: 100%;
  margin-top: 20px;
  padding: 13px 24px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #1a4cff, #2563eb);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.de-submit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0d3ad6, #1d4ed8);
  box-shadow: 0 4px 16px rgba(26, 76, 255, 0.3);
  transform: translateY(-1px);
}
.de-submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dsub-loading {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 消息提示 */
.de-msg {
  margin-top: 14px;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
}
.de-msg.ok {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}
.de-msg.err {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

/* ========== 批量录入 ========== */
.de-batch-help {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.dbh-title {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 6px;
}
.dbh-body {
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
  margin-bottom: 8px;
}
.dbh-body code {
  background: #eef2f6;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  color: #1a4cff;
}
.dbh-example {
  background: #f1f5f9;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 11px;
  color: #475569;
  white-space: pre-wrap;
  line-height: 1.6;
  margin: 0;
}

/* 批量预览 */
.de-batch-preview {
  margin-bottom: 16px;
}
.dbp-head {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}
.dbp-head strong {
  color: #1a4cff;
}
.dbp-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dbp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: #f8fafc;
  border: 1px solid #eef2f6;
  border-radius: 8px;
  font-size: 12px;
}
.dbpi-num {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: #1a4cff;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dbpi-plat {
  flex-shrink: 0;
  font-size: 14px;
}
.dbpi-data {
  font-weight: 600;
  color: #e6a23c;
  white-space: nowrap;
}
.dbpi-text {
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* 批量进度 */
.de-batch-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.dbp-bar {
  flex: 1;
  height: 5px;
  background: #eef2f6;
  border-radius: 3px;
  overflow: hidden;
}
.dbpb-fill {
  display: block;
  height: 100%;
  background: #1a4cff;
  border-radius: 3px;
  transition: width 0.3s;
}
.dbp-label {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
}
</style>
