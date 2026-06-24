<template>
  <div class="data-entry">
    <!-- 受众画像未配置提示 -->
    <div v-if="!store.audienceProfile && !quickProfileOpen" class="de-audience-banner">
      <span class="deab-icon">🎯</span>
      <div class="deab-body">
        <span class="deab-title">建议先配置「受众画像」再导入文稿</span>
        <span class="deab-desc">让 AI 知道你的视频在跟谁说话——走进他们的困惑，共鸣才准。</span>
      </div>
      <span class="deab-quick" @click="quickProfileOpen = true">快速配置</span>
      <el-button size="small" type="primary" @click="quickProfileOpen = true" class="deab-btn">去设置</el-button>
    </div>
    <!-- 快速配置弹窗（零样本关键词分析） -->
    <div v-if="quickProfileOpen" class="de-quick-profile">
      <div class="dqp-title">快速配置受众画像</div>
      <div class="dqp-desc">只需输入赛道关键词，AI 立即推断受众画像（导入文稿后可重新分析获得更精准结果）</div>
      <div class="dqp-input-row">
        <input
          v-model="quickNiche"
          class="dqp-input"
          placeholder="输入赛道关键词，如：玄学/国学、职场成长..."
          @keyup.enter="handleQuickAudience"
        />
        <button class="dqp-confirm" @click="handleQuickAudience" :disabled="!quickNiche.trim() || quickAudienceLoading">
          {{ quickAudienceLoading ? 'AI 分析中...' : '确认' }}
        </button>
        <button class="dqp-cancel" @click="quickProfileOpen = false">取消</button>
      </div>
      <div class="dqp-hint">{{ store.scriptRecords.length > 0 ? `AI 将基于已有 ${store.scriptRecords.length} 条文稿 + 关键词进行分析` : '暂无文稿样本，AI 将仅基于关键词推断（建议先录入几条文稿以获得更准结果）' }}</div>
    </div>
    <div class="de-card">
      <div class="de-title">录入新样本</div>
      <div class="de-desc">添加已发布的口播文稿，AI 将自动进行7维评分并加入样本库。</div>

      <!-- 模式切换 -->
      <div class="de-mode-tabs">
        <span class="demt-tab" :class="{ active: entryMode === 'single' }" @click="entryMode = 'single'">单条录入</span>
        <span class="demt-tab" :class="{ active: entryMode === 'batch' }" @click="entryMode = 'batch'">批量录入</span>
      </div>

      <!-- 单条录入 -->
      <el-form v-if="entryMode === 'single'" label-width="80px" :model="form" class="de-form">
        <div class="de-multi-switch" @click="toggleMulti">
          <span class="de-toggle" :class="{ active: multiPlatform }">
            <span class="de-toggle-dot"></span>
          </span>
          <span class="de-toggle-label">{{ multiPlatform ? '已开启：可为各平台分别填写点赞量' : '开启后可为各平台分别填写点赞量' }}</span>
        </div>

        <el-form-item label="文稿内容">
          <el-input v-model="form.content" type="textarea" :rows="7" placeholder="粘贴口播文案的完整文字稿..." />
        </el-form-item>
        <el-form-item label="发布链接">
          <el-input v-model="form.link" placeholder="选填，视频链接" />
        </el-form-item>
        <template v-if="!multiPlatform">
          <el-form-item label="发布平台">
            <el-select v-model="form.platform" style="width:100%">
              <el-option v-for="(c, k) in PLATFORM_CONFIG" :key="k" :label="c.icon + ' ' + c.label" :value="k" />
            </el-select>
          </el-form-item>
          <el-form-item label="点赞量">
            <el-input-number v-model="form.actualLikes" :min="0" :max="99999999" :step="100" style="width:100%" />
          </el-form-item>
          <el-form-item label="播放量">
            <el-input-number v-model="form.views" :min="0" :max="999999999" :step="100" style="width:100%" placeholder="选填，实际播放观看次数" />
          </el-form-item>
        </template>
        <div v-else class="de-multi">
          <div class="dem-header">
            <span class="demh-title">多平台发布</span>
            <span class="demh-hint">勾选平台并填写各平台的实际点赞量</span>
          </div>
          <div class="dem-grid">
            <div
              v-for="p in platformList" :key="p"
              class="dem-card"
              :class="{ enabled: platformEntries[p].enabled }"
              @click="platformEntries[p].enabled = !platformEntries[p].enabled"
            >
              <div class="demc-top">
                <span class="demc-check" :class="{ on: platformEntries[p].enabled }">
                  <span v-if="platformEntries[p].enabled">✓</span>
                </span>
                <span class="demc-icon">{{ PLATFORM_CONFIG[p]?.icon }}</span>
                <span class="demc-label">{{ PLATFORM_CONFIG[p]?.label }}</span>
              </div>
              <el-input-number
                v-model="platformEntries[p].likes" :min="0" :max="99999999" :step="100"
                :disabled="!platformEntries[p].enabled" size="small" controls-position="right" @click.stop placeholder="点赞"
              />
              <el-input-number
                v-model="platformEntries[p].views" :min="0" :max="999999999" :step="100"
                :disabled="!platformEntries[p].enabled" size="small" controls-position="right" @click.stop placeholder="播放量" style="margin-top:4px"
              />
            </div>
          </div>
        </div>
        <el-form-item label="标签">
          <el-input v-model="form.tagsStr" placeholder="选填，#号分隔（如：情感#励志#干货）" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" @click="handleSubmit" :loading="store.isAnalyzingScript" :disabled="!canSubmit" class="de-submit">
            {{ store.isAnalyzingScript ? 'AI 评分中...' : (multiPlatform ? `保存 ${activePlatformCount} 个平台样本` : '保存样本') }}
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 批量录入 -->
      <div v-else class="de-batch">
        <div class="deb-help">
          <span>批量粘贴多篇文稿，用 <code>---</code> 分隔。可在每篇前用 <code>[likes=xxxx]</code> <code>[views=yyyy]</code> 单独指定，否则使用下方统一默认值。例如：</span>
          <pre>[likes=15200] [views=500000]
第一句口播文案的内容...
第二句继续...
---
[likes=8300]
第二篇口播文案的内容...</pre>
        </div>

        <el-form label-width="80px" :model="batchForm" class="de-form">
          <el-form-item label="默认平台">
            <el-select v-model="batchForm.platform" style="width:200px">
              <el-option v-for="(c, k) in PLATFORM_CONFIG" :key="k" :label="c.icon + ' ' + c.label" :value="k" />
            </el-select>
          </el-form-item>
          <el-form-item label="默认点赞量">
            <el-input-number v-model="batchForm.defaultLikes" :min="0" :max="99999999" :step="100" />
            <span class="deb-hint">未用 [likes=] 指定的文稿将使用此默认值</span>
          </el-form-item>
          <el-form-item label="默认播放量">
            <el-input-number v-model="batchForm.defaultViews" :min="0" :max="999999999" :step="100" />
            <span class="deb-hint">选填，未用 [views=] 指定的文稿将使用此默认值</span>
          </el-form-item>
          <el-form-item label="批量内容">
            <el-input v-model="batchForm.raw" type="textarea" :rows="12" placeholder="粘贴多篇文稿，每篇之间用 --- 分隔&#10;&#10;[likes=15200]&#10;第一篇内容...&#10;---&#10;[likes=8300]&#10;第二篇内容..." />
          </el-form-item>
          <el-form-item label="标签">
            <el-input v-model="batchForm.tagsStr" placeholder="选填，#号分隔（如：情感#励志#干货）" />
          </el-form-item>
        </el-form>

        <!-- 解析预览 -->
        <div v-if="batchPreview.length > 0" class="deb-preview">
          <div class="debph">已解析 <strong>{{ batchPreview.length }}</strong> 篇文稿：</div>
          <div v-for="(item, idx) in batchPreview" :key="idx" class="debp-item">
            <span class="debpi-idx">{{ idx + 1 }}</span>
            <span class="debpi-platform">{{ PLATFORM_CONFIG[item.platform]?.icon }}</span>
            <span class="debpi-likes">{{ formatLikes(item.likes) }} 赞</span>
            <span class="debpi-text">{{ item.content.slice(0, 50) }}{{ item.content.length > 50 ? '…' : '' }}</span>
          </div>
        </div>

        <el-button
          type="primary" size="large" @click="handleBatchSubmit"
          :loading="batchLoading" :disabled="!canBatchSubmit" class="de-submit"
        >
          {{ batchLoading ? `已提交 ${batchDoneCount}/${batchPreview.length} 篇，AI 评分中...` : `批量保存 ${batchPreview.length} 篇样本` }}
        </el-button>

        <div v-if="batchProgress" class="deb-progress">
          <div class="debp-bar"><span class="debp-fill" :style="{ width: batchPct + '%' }"></span></div>
          <span class="debp-label">{{ batchDoneCount }} / {{ batchPreview.length }} 已完成</span>
        </div>

        <div v-if="submitMsg" class="de-msg" :class="submitOk ? 'ok' : 'err'">{{ submitMsg }}</div>
      </div>

      <div v-if="submitMsg && entryMode === 'single'" class="de-msg" :class="submitOk ? 'ok' : 'err'">{{ submitMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUniqueModeStore, PLATFORM_CONFIG, type Platform } from '@/stores/uniqueMode'

const store = useUniqueModeStore()
const submitMsg = ref('')
const submitOk = ref(true)

// 快速受众画像配置
const quickProfileOpen = ref(false)
const quickNiche = ref('')
const quickAudienceLoading = ref(false)
async function handleQuickAudience() {
  if (!quickNiche.value.trim()) return
  quickAudienceLoading.value = true
  try {
    await store.generateAudienceProfile(quickNiche.value.trim())
    quickProfileOpen.value = false
    quickNiche.value = ''
    ElMessage.success('受众画像已配置，后续评分将基于此画像锚定')
  } catch (e: any) {
    ElMessage.error('分析失败: ' + (e.message || '未知错误'))
  } finally {
    quickAudienceLoading.value = false
  }
}

// 模式切换
const entryMode = ref<'single' | 'batch'>('single')
const multiPlatform = ref(false)
function toggleMulti() { multiPlatform.value = !multiPlatform.value }

const form = reactive({ platform: '抖音' as Platform, content: '', link: '', actualLikes: 1000, views: 0 as number | undefined, tagsStr: '' })

const platformList = Object.keys(PLATFORM_CONFIG).filter(k => k !== '全部') as Platform[]
const platformEntries = reactive<Record<string, { enabled: boolean; likes: number; views: number }>>(
  Object.fromEntries(platformList.map(k => [k, { enabled: false, likes: 0, views: 0 }]))
)

const activePlatformCount = computed(() => platformList.filter(k => platformEntries[k].enabled).length)
const canSubmit = computed(() => {
  if (!form.content.trim()) return false
  if (!multiPlatform.value) return true
  return activePlatformCount.value > 0
})

async function handleSubmit() {
  if (!form.content.trim()) { ElMessage.warning('请填写文稿内容'); return }
  submitMsg.value = ''
  const tags = form.tagsStr.split('#').map(t => t.trim()).filter(Boolean)
  const viewVal = form.views && form.views > 0 ? form.views : undefined
  try {
    if (!multiPlatform.value) {
      await store.addScript({ platform: form.platform, content: form.content.trim(), link: form.link.trim(), actualLikes: form.actualLikes || 0, views: viewVal, tags })
    } else {
      const targets = platformList.filter(k => platformEntries[k].enabled)
      if (targets.length === 0) { ElMessage.warning('请至少选择一个平台'); return }
      for (const p of targets) {
        const pv = platformEntries[p].views > 0 ? platformEntries[p].views : undefined
        await store.addScript({ platform: p, content: form.content.trim(), link: form.link.trim(), actualLikes: platformEntries[p].likes || 0, views: pv, tags })
      }
    }
    form.content = ''; form.link = ''; form.actualLikes = 1000; form.views = 0; form.tagsStr = ''
    for (const k of platformList) platformEntries[k] = { enabled: false, likes: 0, views: 0 }
    submitMsg.value = multiPlatform.value ? `${activePlatformCount.value} 个平台样本已保存！正在后台进行 AI 7维评分...` : '样本保存成功！AI 正在后台进行7维评分...'
    submitOk.value = true
  } catch (e: any) {
    submitMsg.value = '保存失败: ' + (e.message || '未知错误')
    submitOk.value = false
  }
}

// 批量录入
const batchForm = reactive({ platform: '抖音' as Platform, defaultLikes: 1000, defaultViews: 0 as number | undefined, raw: '', tagsStr: '' })
const batchLoading = ref(false)
const batchProgress = ref(false)
const batchDoneCount = ref(0)
const batchPreview = ref<Array<{ content: string; likes: number; views?: number; platform: Platform }>>([])

const batchPct = computed(() => batchPreview.value.length ? Math.round(batchDoneCount.value / batchPreview.value.length * 100) : 0)
const canBatchSubmit = computed(() => batchPreview.value.length > 0 && !batchLoading.value)

function formatLikes(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

// 实时解析批量内容
watch(() => batchForm.raw, () => { parseBatch() })
watch(() => batchForm.platform, () => { parseBatch() })
watch(() => batchForm.defaultLikes, () => { parseBatch() })

function parseBatch() {
  const raw = batchForm.raw.trim()
  if (!raw) { batchPreview.value = []; return }
  const blocks = raw.split(/\n---+[\s]*\n/)
  const items: typeof batchPreview.value = []
  for (let block of blocks) {
    block = block.trim()
    if (!block) continue
    let likes = batchForm.defaultLikes
    let views = batchForm.defaultViews
    const likesMatch = block.match(/^\[likes\s*=\s*([\d.]+[wWkK]?)\]/)
    if (likesMatch) {
      let v = likesMatch[1]
      if (/[wW]$/.test(v)) likes = parseFloat(v) * 10000
      else if (/[kK]$/.test(v)) likes = parseFloat(v) * 1000
      else likes = parseInt(v) || batchForm.defaultLikes
      block = block.slice(likesMatch[0].length).trim()
    }
    const viewsMatch = block.match(/^\[views\s*=\s*([\d.]+[wWkK]?)\]/)
    if (viewsMatch) {
      let v = viewsMatch[1]
      if (/[wW]$/.test(v)) views = parseFloat(v) * 10000
      else if (/[kK]$/.test(v)) views = parseFloat(v) * 1000
      else views = parseInt(v) || 0
      block = block.slice(viewsMatch[0].length).trim()
    }
    if (!block) continue
    items.push({ content: block, likes, views: views && views > 0 ? views : undefined, platform: batchForm.platform })
  }
  batchPreview.value = items
}

async function handleBatchSubmit() {
  if (batchPreview.value.length === 0) { ElMessage.warning('请粘贴至少一篇文稿'); return }
  batchLoading.value = true
  batchProgress.value = true
  batchDoneCount.value = 0
  submitMsg.value = ''
  const tags = batchForm.tagsStr.split('#').map(t => t.trim()).filter(Boolean)
  // 收集所有论文稿
  const tasks: Array<{ content: string; likes: number; views?: number; platform: Platform }> = batchPreview.value.slice()
  // 并行评分（每次最多 3 个并发）
  const CONCURRENCY = 3
  const failed: string[] = []
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const chunk = tasks.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map(t => store.addScript({ platform: t.platform, content: t.content, link: '', actualLikes: t.likes, views: t.views, tags }))
    )
    for (const r of results) {
      if (r.status === 'rejected') failed.push(r.reason?.message || '未知错误')
      batchDoneCount.value++
    }
  }
  batchLoading.value = false
  batchProgress.value = false
  if (failed.length > 0) {
    submitMsg.value = `${tasks.length - failed.length} 篇已保存，${failed.length} 篇失败: ${failed.slice(0, 3).join('; ')}`
    submitOk.value = false
  } else {
    submitMsg.value = `${tasks.length} 篇样本全部保存成功！`
    submitOk.value = true
    batchForm.raw = ''
  }
  if (failed.length < tasks.length) ElMessage.success(`${tasks.length - failed.length} 篇样本已保存`)
}
</script>

<style scoped>
.data-entry { height: 100%; overflow-y: auto; }
/* 受众画像引导横幅 */
.de-audience-banner {
  display: flex; align-items: center; gap: 14px;
  background: linear-gradient(135deg, #fef7e8 0%, #fdf0d0 100%);
  border: 1px solid #f0c75e; border-radius: 12px;
  padding: 14px 18px; margin-bottom: 16px; max-width: 600px;
}
.deab-icon { font-size: 28px; flex-shrink: 0; }
.deab-body { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.deab-title { font-size: 14px; font-weight: 700; color: #7c5e00; }
.deab-desc { font-size: 12px; color: #a68a3c; line-height: 1.4; }
.deab-btn { flex-shrink: 0; }
.deab-quick {
  font-size: 12px; color: #1a4cff; cursor: pointer; white-space: nowrap;
  text-decoration: underline; text-underline-offset: 2px;
}
.deab-quick:hover { color: #0d3ad6; }

/* 快速配置受众画像卡片 */
.de-quick-profile {
  background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
  border: 1px solid #a8c8ff; border-radius: 12px;
  padding: 16px 18px; margin-bottom: 16px; max-width: 600px;
}
.dqp-title { font-size: 15px; font-weight: 700; color: #1a4cff; margin-bottom: 4px; }
.dqp-desc { font-size: 12px; color: #5a7db0; margin-bottom: 12px; line-height: 1.4; }
.dqp-input-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.dqp-input {
  flex: 1; padding: 8px 12px; border: 1px solid #c8d8f0; border-radius: 8px;
  font-size: 13px; outline: none; background: #fff;
}
.dqp-input:focus { border-color: #1a4cff; }
.dqp-confirm {
  padding: 8px 18px; background: #1a4cff; color: #fff; border: none;
  border-radius: 8px; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.dqp-confirm:hover { background: #0d3ad6; }
.dqp-confirm:disabled { background: #a0b8e8; cursor: not-allowed; }
.dqp-cancel {
  padding: 8px 14px; background: #fff; color: #5a7db0; border: 1px solid #c8d8f0;
  border-radius: 8px; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.dqp-cancel:hover { border-color: #1a4cff; color: #1a4cff; }
.dqp-hint { font-size: 11px; color: #8ea0c0; }
.de-card { background: #fff; border-radius: 14px; padding: 22px 24px; border: 1px solid #eef2f6; max-width: 600px; }
.de-title { font-size: 18px; font-weight: 700; color: #0b1a30; margin-bottom: 4px; }
.de-desc { font-size: 13px; color: #7a8a9e; margin-bottom: 20px; line-height: 1.5; }

.de-form { max-width: 560px; }
/* 多平台开关 */
.de-multi-switch {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; cursor: pointer; user-select: none;
}
.de-toggle {
  position: relative; display: inline-block; width: 44px; height: 24px;
  background: #dcdfe6; border-radius: 12px; cursor: pointer;
  vertical-align: middle; transition: background .25s; flex-shrink: 0;
  border: none; padding: 0; outline: none;
}
.de-toggle.active { background: #1a4cff; }
.de-toggle-dot {
  position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
  background: #fff; border-radius: 50%; transition: left .25s;
  box-shadow: 0 1px 3px rgba(0,0,0,.15);
}
.de-toggle.active .de-toggle-dot { left: 22px; }
.de-toggle-label { margin-left: 10px; font-size: 13px; color: #606266; vertical-align: middle; }
.de-submit { width: 100%; }

/* 多平台卡片 */
.de-multi {
  margin-bottom: 12px;
}
.dem-header {
  display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px;
}
.demh-title {
  font-size: 13px; font-weight: 600; color: #0b1a30;
}
.demh-hint {
  font-size: 11px; color: #999;
}
.dem-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
}
.dem-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-radius: 10px;
  border: 1.5px solid #e8ecf1; background: #fafbfc;
  cursor: pointer; transition: all .2s;
}
.dem-card:hover { border-color: #c4cdd9; background: #fff; }
.dem-card.enabled { border-color: #1a4cff; background: #f4f6ff; }
.demc-top { display: flex; align-items: center; gap: 6px; }
.demc-check {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid #cdd4de; display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: transparent; transition: all .2s; flex-shrink: 0;
}
.demc-check.on { background: #1a4cff; border-color: #1a4cff; color: #fff; }
.demc-icon { font-size: 15px; }
.demc-label { font-size: 12px; font-weight: 500; color: #0b1a30; }
.dem-card .el-input-number { width: 120px; }
.dem-card .el-input-number .el-input__inner { text-align: right; padding-right: 28px; }

.de-msg { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 13px; white-space: pre-line; word-break: break-word; }
.de-msg.ok { background: #f0f9eb; color: #52c41a; }
.de-msg.err { background: #fef0f0; color: #f56c6c; }

/* 模式切换 */
.de-mode-tabs { display: flex; gap: 0; margin-bottom: 18px; border: 1px solid #e0e4ea; border-radius: 8px; overflow: hidden; width: fit-content; }
.demt-tab { padding: 6px 18px; font-size: 13px; color: #7a8a9e; cursor: pointer; transition: all .2s; background: #fafbfc; border-right: 1px solid #e0e4ea; }
.demt-tab:last-child { border-right: none; }
.demt-tab:hover { color: #1a4cff; }
.demt-tab.active { background: #1a4cff; color: #fff; }

/* 批量录入 */
.de-batch { max-width: 600px; }
.deb-help { background: #f8fafe; border: 1px solid #e0e4f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 12px; color: #4d5a6e; line-height: 1.7; }
.deb-help code { background: #e8ecf6; padding: 1px 6px; border-radius: 4px; font-size: 11px; }
.deb-help pre { background: #f0f3f8; padding: 8px 10px; border-radius: 6px; margin-top: 6px; font-size: 11px; color: #303133; white-space: pre-wrap; }
.deb-hint { font-size: 11px; color: #999; margin-left: 8px; }

.deb-preview { margin-bottom: 14px; }
.debph { font-size: 12px; color: #606266; margin-bottom: 8px; }
.debp-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  background: #fafbfc; border: 1px solid #eef2f6; border-radius: 6px; margin-bottom: 4px;
  font-size: 12px;
}
.debpi-idx { background: #1a4cff; color: #fff; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; }
.debpi-platform { flex-shrink: 0; }
.debpi-likes { font-weight: 600; color: #e6a23c; flex-shrink: 0; }
.debpi-text { color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.deb-progress { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.debp-bar { flex: 1; height: 6px; background: #eef2f6; border-radius: 3px; overflow: hidden; }
.debp-fill { display: block; height: 100%; background: #1a4cff; border-radius: 3px; transition: width .3s; }
.debp-label { font-size: 12px; color: #909399; white-space: nowrap; }
</style>
