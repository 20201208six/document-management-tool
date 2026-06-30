<template>
  <div class="unique-mode">
    <!-- 顶部栏 -->
    <div class="unique-header">
      <div class="account-section">
        <span class="account-label">当前账号：</span>
        <el-dropdown trigger="click" @command="handleAccountSwitch">
          <span class="account-selector">
            <span class="as-name">@{{ store.currentAccount?.name || '未设置' }}</span>
            <el-icon class="as-arrow"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="acc in store.accounts"
                :key="acc.id"
                :command="acc.id"
                :class="{ 'is-active': acc.id === store.currentAccountId }"
              >
                <span class="ad-acc-name">{{ acc.name }}</span>
                <span v-if="acc.id === store.currentAccountId" class="ad-check">✓</span>
              </el-dropdown-item>
              <el-dropdown-item divided command="__manage__">
                <el-icon><Setting /></el-icon> 管理账号
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="tab-switch">
        <button
          class="tab-btn"
          :class="{ active: store.activeTab === 'analysis' }"
          @click="store.switchTab('analysis')"
        >
          <el-icon><ChatDotRound /></el-icon>
          <span>文案分析</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: store.activeTab === 'prediction' }"
          @click="store.switchTab('prediction')"
        >
          <el-icon><TrendCharts /></el-icon>
          <span>点赞预测</span>
        </button>
      </div>
    </div>

    <!-- Tab 1：文案分析 -->
    <div v-if="store.activeTab === 'analysis'" class="unique-body">
      <div class="unique-left">
        <div class="unique-chat-panel">
          <UniqueChatPanel ref="chatPanelRef" />
        </div>
        <div class="unique-file-browser"><UniqueFileBrowser /></div>
      </div>
      <div class="unique-right">
        <DataAnalysisCenter />
        <CopywritingSuggestions @apply="handleApplySuggestion" />
      </div>
    </div>

    <!-- Tab 2：点赞预测 (左侧导航 + 右侧内容) -->
    <div v-if="store.activeTab === 'prediction'" class="predict-layout">
      <!-- 统计卡片 -->
      <div class="predict-stats">
        <div class="ps-card">
          <div class="ps-label">📊 历史样本</div>
          <div class="ps-value">{{ sampleCountText }}</div>
          <div class="ps-desc">录入历史文稿和真实点赞，用样本库不断校准</div>
        </div>
        <div class="ps-card">
          <div class="ps-label">📈 平均点赞</div>
          <div class="ps-value">{{ avgLikesText }}</div>
          <div class="ps-desc">基于当前样本库</div>
        </div>
        <div class="ps-card">
          <div class="ps-label">🏆 最高点赞</div>
          <div class="ps-value">{{ topLikesText }}</div>
          <div class="ps-desc" v-if="topScript">{{ topScript.content.slice(0, 28) }}...</div>
          <div class="ps-desc" v-else>暂无数据</div>
        </div>
      </div>

      <!-- 状态提示 -->
      <div class="predict-hint">
        <template v-if="store.scriptRecords.length > 0">基于 {{ store.scriptRecords.length }} 条真实样本，所有数据保存在本机浏览器中</template>
        <template v-else>还没有样本数据，去「录入数据」添加第一条样本吧</template>
      </div>

      <!-- 主体：顶部横排Tab + 内容区 -->
      <div class="predict-main">
        <div class="predict-tabs">
          <div
            v-for="nav in navItems" :key="nav.key"
            class="pt-item"
            :class="{ active: store.predictSubTab === nav.key }"
            @click="store.switchPredictSubTab(nav.key)"
          >
            <span class="pt-icon">{{ nav.icon }}</span>
            {{ nav.label }}
            <span v-if="nav.key === 'patterns' && store.deviationTrend?.needsBump" class="pt-bump-badge" title="公式需要升级！">●</span>
          </div>
        </div>

        <div class="predict-content">
          <KeepAlive :key="predictKey">
            <component
              :is="currentPredictComponent"
              @export-json="handleExportJSON"
              @import-json="triggerImport"
              @reset-builtin="handleResetBuiltIn"
            />
          </KeepAlive>
        </div>
      </div>

      <input ref="importInput" type="file" accept=".json" style="display:none" @change="handleImportJSON" />
    </div>

    <!-- 账号管理弹窗 -->
    <el-dialog v-model="showAccountDialog" title="管理账号" width="480px" :close-on-click-modal="true">
      <div class="ad-list">
        <div v-for="acc in store.accounts" :key="acc.id" class="ad-item" :class="{ current: acc.id === store.currentAccountId }">
          <span class="adi-name">{{ acc.name }}</span>
          <span v-if="acc.id === store.currentAccountId" class="adi-badge">当前</span>
          <div class="adi-actions">
            <el-button v-if="acc.id !== store.currentAccountId" size="small" type="primary" plain @click="handleAccountSwitch(acc.id); showAccountDialog = false">切换</el-button>
            <el-button size="small" text type="danger" :disabled="store.accounts.length <= 1" @click="handleDeleteAccount(acc.id)">删除</el-button>
          </div>
        </div>
      </div>
      <div class="ad-add">
        <el-input v-model="newAccountName" placeholder="输入账号名称" size="small" style="flex:1" @keyup.enter="handleAddAccount" />
        <el-button size="small" type="primary" @click="handleAddAccount" :disabled="!newAccountName.trim()">新增</el-button>
      </div>

      <!-- 受众画像 -->
      <div class="ad-divider">
        <span class="add-line"></span>
        <span class="add-label">🎯 当前账号受众画像</span>
        <span class="add-line"></span>
      </div>

      <div v-if="store.audienceProfile && !editingAudience" class="ad-ap">
        <div class="adap-row"><span class="adap-label">赛道</span><span class="adap-value">{{ store.audienceProfile.niche }}</span></div>
        <div class="adap-row"><span class="adap-label">核心受众</span><span class="adap-value">{{ store.audienceProfile.targetAudience }}</span></div>
        <div class="adap-section-title">受众核心困惑</div>
        <div class="adap-tags">
          <span v-for="(c, i) in store.audienceProfile.coreConfusions" :key="'conf'+i" class="adap-tag">{{ c }}</span>
        </div>
        <div class="adap-row"><span class="adap-label">共鸣触发</span><span class="adap-value">{{ store.audienceProfile.resonancePatterns }}</span></div>
        <div class="adap-row"><span class="adap-label">信任建立</span><span class="adap-value">{{ store.audienceProfile.trustBuilders }}</span></div>
        <div class="adap-row"><span class="adap-label">避免话题</span><span class="adap-value">{{ store.audienceProfile.avoidTopics }}</span></div>
        <div class="adap-summary"><span>💡</span><span>{{ store.audienceProfile.summary }}</span></div>
        <div class="adap-actions">
          <el-button size="small" @click="editingAudience = true">修改</el-button>
          <el-button size="small" type="danger" plain @click="store.audienceProfile = null">清除</el-button>
        </div>
      </div>

      <div v-else class="ad-ap-edit">
        <div class="adae-field">
          <label class="adae-label">赛道关键词</label>
          <el-input v-model="audienceNiche" size="small" placeholder="如：玄学/国学、职场成长、育儿..." @keyup.enter="handleGenerateAudience" />
        </div>
        <div class="adae-field">
          <label class="adae-label">补充描述 <span class="adae-optional">（可选）</span></label>
          <el-input v-model="audienceNotes" size="small" placeholder="如：用传统智慧解释当代困境..." />
        </div>
        <div class="adae-hint" :class="{ warn: store.scriptRecords.length === 0 }">
          {{ store.scriptRecords.length > 0
            ? `AI 将基于已有 ${store.scriptRecords.length} 条文稿内容反推受众画像、核心困惑和共鸣模式`
            : '暂无文稿样本，AI 将仅基于关键词推断（建议先录入几条文稿以获更准结果）' }}
        </div>
        <div class="adae-actions">
          <el-button size="small" type="primary" @click="handleGenerateAudience" :loading="store.audienceLoading" :disabled="!audienceNiche.trim()">
            {{ store.audienceLoading ? 'AI 分析中...' : (store.audienceProfile ? '重新分析' : 'AI 分析受众') }}
          </el-button>
          <el-button v-if="store.audienceProfile" size="small" @click="editingAudience = false">取消</el-button>
        </div>
      </div>

      <template #footer>
        <el-button @click="showAccountDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { ArrowDown, Setting, ChatDotRound, TrendCharts } from '@element-plus/icons-vue'
import { useUniqueModeStore } from '@/stores/uniqueMode'
import UniqueChatPanel from '@/components/unique/UniqueChatPanel.vue'
import UniqueFileBrowser from '@/components/unique/UniqueFileBrowser.vue'
import DataAnalysisCenter from '@/components/unique/DataAnalysisCenter.vue'
import CopywritingSuggestions from '@/components/unique/CopywritingSuggestions.vue'
import SampleLibrary from '@/components/unique/SampleLibrary.vue'
import DataEntry from '@/components/unique/DataEntry.vue'
import ModelPatterns from '@/components/unique/ModelPatterns.vue'
import WritingFrameworkView from '@/components/unique/WritingFrameworkView.vue'
import ContentDecomposition from '@/components/unique/ContentDecomposition.vue'
import NewScriptPredict from '@/components/unique/NewScriptPredict.vue'
import AccountChat from '@/components/unique/AccountChat.vue'
import DataAnalysis from '@/components/unique/DataAnalysis.vue'

const store = useUniqueModeStore()
const showAccountDialog = ref(false)
const newAccountName = ref('')
const importInput = ref<HTMLInputElement | null>(null)
const predictKey = ref(0)
const chatPanelRef = ref<InstanceType<typeof UniqueChatPanel> | null>(null)

// ===== 受众画像配置 =====
const audienceNiche = ref('')
const audienceNotes = ref('')
const editingAudience = ref(false)

watch(() => store.audienceProfile, (val) => {
  if (val) {
    audienceNiche.value = val.niche
  } else {
    audienceNiche.value = ''
  }
}, { immediate: true })

async function handleGenerateAudience() {
  if (!audienceNiche.value.trim()) return
  try {
    await store.generateAudienceProfile(audienceNiche.value.trim(), audienceNotes.value.trim() || undefined)
    editingAudience.value = false
    ElMessage.success('受众画像已更新，将自动应用于后续评分')
  } catch (e: any) {
    ElMessage.error(e.message || '分析失败')
  }
}

function handleApplySuggestion(content: string) {
  chatPanelRef.value?.fillInput(content)
  ElMessage.success('已填入分析输入框，可直接点击「开始分析」')
}

const componentMap = {
  sample: SampleLibrary,
  entry: DataEntry,
  patterns: ModelPatterns,
  framework: WritingFrameworkView,
  decompose: ContentDecomposition,
  predict: NewScriptPredict,
  chat: AccountChat,
  analysis: DataAnalysis
} as const
const currentPredictComponent = computed(() => componentMap[store.predictSubTab] || SampleLibrary)

const navItems: Array<{ key: 'predict' | 'sample' | 'framework' | 'decompose' | 'patterns' | 'entry' | 'chat' | 'analysis'; label: string; icon: string }> = [
  { key: 'predict', label: '新稿预测', icon: '📝' },
  { key: 'sample', label: '样本库', icon: '📚' },
  { key: 'analysis', label: '数据分析', icon: '📊' },
  { key: 'framework', label: '写作框架', icon: '📐' },
  { key: 'decompose', label: '内容拆解', icon: '🔍' },
  { key: 'patterns', label: '模型规律', icon: '⚙️' },
  { key: 'chat', label: '账号沟通', icon: '💬' },
  { key: 'entry', label: '录入数据', icon: '📥' }
]

const sampleCountText = computed(() => {
  const n = store.scriptRecords.length
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
  return n + ' 条'
})

const avgLikesText = computed(() => {
  if (!store.scriptRecords.length) return '0'
  const total = store.scriptRecords.reduce((s, r) => s + r.actualLikes, 0)
  const avg = Math.round(total / store.scriptRecords.length)
  if (avg >= 10000) return (avg / 10000).toFixed(2) + ' 万'
  if (avg >= 1000) return (avg / 1000).toFixed(1) + 'k'
  return avg.toLocaleString()
})

const topScript = computed(() => {
  if (!store.scriptRecords.length) return null
  return [...store.scriptRecords].sort((a, b) => b.actualLikes - a.actualLikes)[0]
})

const topLikesText = computed(() => {
  if (!topScript.value) return '0'
  const n = topScript.value.actualLikes
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString()
})

function handleExportJSON() { store.downloadJSON() }
function triggerImport() { importInput.value?.click() }

function handleImportJSON(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const text = ev.target?.result as string
    const result = store.importJSON(text)
    if (result.success) { ElMessage.success(result.message) }
    else { ElMessage.error(result.message) }
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function handleResetBuiltIn() {
  try {
    await ElMessageBox.confirm('确定恢复为初始样本？当前数据将丢失', '确认', { type: 'warning' })
    store.resetToBuiltIn()
    ElMessage.success('已恢复为初始样本')
  } catch {}
}

function handleAccountSwitch(cmd: string) {
  if (cmd === '__manage__') { showAccountDialog.value = true; return }
  if (cmd === store.currentAccountId) return
  store.switchAccount(cmd)
  predictKey.value++
  editingAudience.value = false
  ElMessage.success('已切换到：' + (store.currentAccount?.name || ''))
}
function handleAddAccount() {
  const name = newAccountName.value.trim()
  if (!name) return
  store.addAccount(name)
  newAccountName.value = ''
  ElMessage.success('账号已添加')
}
function handleDeleteAccount(accountId: string) {
  ElMessageBox.confirm('确定要删除该账号吗？该账号下的所有样本数据将被清除。', '确认删除', { type: 'warning' })
    .then(() => { store.deleteAccount(accountId); predictKey.value++; ElMessage.success('已删除') })
    .catch(() => {})
}
</script>

<style scoped>
.unique-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-bg);
  overflow: hidden;
}

/* ===== 顶部栏 ===== */
.unique-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-border-light);
  height: 48px;
  min-height: 48px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.account-section {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.account-label { color: var(--c-text-muted); }
.account-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  background: var(--c-bg);
  font-size: 13px;
  color: var(--c-text);
  transition: var(--transition-fast);
}
.account-selector:hover {
  border-color: var(--c-primary);
  background: var(--c-bg-hover);
}
.as-name {
  font-weight: 600;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-primary);
}
.as-arrow { font-size: 12px; color: var(--c-text-muted); margin-left: 2px; }
.ad-acc-name { flex: 1; }
.ad-check { color: var(--c-primary); font-weight: 700; margin-left: 8px; }
:deep(.el-dropdown-menu__item.is-active) {
  background: color-mix(in srgb, var(--c-primary) 10%, transparent);
  color: var(--c-primary);
}

/* Tab 按钮 */
.tab-switch {
  display: flex;
  gap: 4px;
  background: var(--c-bg-sec);
  padding: 3px;
  border-radius: var(--radius-md);
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 16px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--c-text-sec);
  cursor: pointer;
  transition: var(--transition-fast);
}
.tab-btn:hover {
  color: var(--c-primary);
  background: var(--c-bg-hover);
}
.tab-btn.active {
  background: var(--c-bg-card);
  color: var(--c-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.tab-btn .el-icon { font-size: 14px; }

/* ===== 文案分析布局 ===== */
.unique-body {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}
.unique-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}
.unique-chat-panel {
  flex: 1;
  background: var(--c-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--c-shadow);
  overflow: hidden;
  min-height: 320px;
  border: 1px solid var(--c-border-light);
}
.unique-file-browser {
  height: 180px;
  background: var(--c-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--c-shadow);
  overflow: hidden;
  border: 1px solid var(--c-border-light);
  flex-shrink: 0;
}
.unique-right {
  width: 380px;
  min-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-right: 2px;
}

/* ===== 点赞预测布局 ===== */
.predict-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  gap: 14px;
  overflow: hidden;
}

/* 统计卡片 */
.predict-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  flex-shrink: 0;
}
.ps-card {
  background: var(--c-bg-card);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  border: 1px solid var(--c-border-light);
  transition: var(--transition-fast);
}
.ps-card:hover {
  box-shadow: var(--c-shadow);
  transform: translateY(-1px);
}
.ps-label { font-size: 13px; color: var(--c-text-sec); font-weight: 500; margin-bottom: 6px; }
.ps-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--c-text);
  margin-top: 2px;
  line-height: 1.2;
}
.ps-desc {
  font-size: 12px;
  color: var(--c-text-muted);
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 状态提示 */
.predict-hint {
  background: var(--c-bg-sec);
  border-radius: var(--radius-md);
  padding: 10px 16px;
  font-size: 13px;
  color: var(--c-text-sec);
  border-left: 4px solid var(--c-primary);
  flex-shrink: 0;
}

.predict-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
  min-height: 0;
}

.predict-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  background: var(--c-bg-card);
  border-radius: var(--radius-lg);
  padding: 4px;
  border: 1px solid var(--c-border-light);
  overflow-x: auto;
}
.pt-item {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--c-text-sec);
  cursor: pointer;
  transition: var(--transition-fast);
  user-select: none;
  white-space: nowrap;
}
.pt-item:hover {
  background: var(--c-bg-hover);
  color: var(--c-primary);
}
.pt-item.active {
  background: color-mix(in srgb, var(--c-primary) 12%, transparent);
  color: var(--c-primary);
  font-weight: 600;
}
.pt-icon { margin-right: 4px; }
.pt-bump-badge {
  color: var(--c-danger);
  font-size: 10px;
  margin-left: 2px;
  animation: bump-blink 1s infinite;
}
@keyframes bump-blink {
  0%,100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.predict-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ===== 账号管理弹窗 ===== */
.ad-list { max-height: 280px; overflow-y: auto; margin-bottom: 14px; }
.ad-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--c-border-light);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  transition: var(--transition-fast);
  background: var(--c-bg-card);
}
.ad-item:hover { border-color: var(--c-border); }
.ad-item.current {
  border-color: var(--c-primary);
  background: color-mix(in srgb, var(--c-primary) 5%, transparent);
}
.adi-name { font-weight: 600; font-size: 14px; color: var(--c-text); flex: 1; }
.adi-badge {
  font-size: 11px;
  background: var(--c-primary);
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
}
.adi-actions { display: flex; gap: 6px; margin-left: auto; }
.ad-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--c-border-light);
}

/* 受众画像区域 */
.ad-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  margin-bottom: 12px;
}
.add-line { flex: 1; height: 1px; background: var(--c-border-light); }
.add-label { font-size: 12px; font-weight: 600; color: var(--c-text-sec); white-space: nowrap; }

/* 已配置画像展示 */
.ad-ap { display: flex; flex-direction: column; gap: 6px; }
.adap-row { display: flex; gap: 8px; font-size: 12px; align-items: flex-start; }
.adap-label { font-weight: 600; color: var(--c-text); min-width: 60px; flex-shrink: 0; }
.adap-value { color: var(--c-text-sec); line-height: 1.5; }
.adap-section-title { font-size: 12px; font-weight: 600; color: var(--c-text); margin-top: 4px; }
.adap-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 2px; }
.adap-tag {
  font-size: 11px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--c-primary) 10%, transparent);
  color: var(--c-primary);
  border-radius: 10px;
  font-weight: 500;
}
.adap-summary {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--c-success) 10%, transparent);
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--c-success) 30%, transparent);
  margin-top: 4px;
  font-size: 12px;
  color: color-mix(in srgb, var(--c-success) 70%, black);
  line-height: 1.5;
}
.adap-actions { display: flex; gap: 6px; margin-top: 6px; }

/* 编辑画像 */
.ad-ap-edit { display: flex; flex-direction: column; gap: 10px; }
.adae-field { display: flex; flex-direction: column; gap: 4px; }
.adae-label { font-size: 12px; font-weight: 600; color: var(--c-text); }
.adae-optional { font-weight: 400; color: var(--c-text-muted); font-size: 11px; }
.adae-hint { font-size: 11px; color: var(--c-text-muted); line-height: 1.4; }
.adae-hint.warn { color: var(--c-warning); }
.adae-actions { display: flex; gap: 6px; }
</style>
