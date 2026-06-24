<template>
  <div class="writing-framework">
    <div v-if="store.scriptRecords.length === 0" class="wf-empty">
      <span>请先录入文稿样本后生成写作框架</span>
    </div>

    <div v-else class="wf-body">
      <div class="wf-card">
        <div class="wfc-header">
          <span class="wfc-title">写作框架</span>
          <button class="wf-btn" @click="handleGenerate" :disabled="store.isGeneratingFramework">
            {{ store.isGeneratingFramework ? '生成中...' : (store.writingFramework ? '刷新框架' : '生成写作框架') }}
          </button>
        </div>

        <div v-if="store.isGeneratingFramework" class="wf-loading">AI 正在分析样本并生成写作指南...</div>

        <div v-else-if="store.writingFramework" class="wfc-content">
          <!-- 通用框架 -->
          <div class="wf-section">
            <div class="wf-section-title">通用写作框架</div>
            <p class="wf-text">{{ store.writingFramework.universal }}</p>
          </div>

          <!-- 平台定制 -->
          <div class="wf-section" v-if="hasPlatform">
            <div class="wf-section-title">平台定制建议</div>
            <div v-for="(content, platform) in store.writingFramework.platformSpecific" :key="platform">
              <div v-if="content" class="wf-platform">
                <div class="wfp-name">{{ PLATFORM_CONFIG[platform as Platform]?.icon }} {{ platform }}</div>
                <p class="wf-text">{{ content }}</p>
              </div>
            </div>
          </div>

          <!-- 标题公式 -->
          <div v-if="store.writingFramework.titleFormulas.length" class="wf-section">
            <div class="wf-section-title">爆款标题公式</div>
            <ul class="wf-list">
              <li v-for="(f, i) in store.writingFramework.titleFormulas" :key="'t' + i">{{ f }}</li>
            </ul>
          </div>

          <!-- 避坑 -->
          <div v-if="store.writingFramework.pitfalls.length" class="wf-section">
            <div class="wf-section-title warn">避坑指南</div>
            <ul class="wf-list">
              <li v-for="(p, i) in store.writingFramework.pitfalls" :key="'p' + i">{{ p }}</li>
            </ul>
          </div>

          <div class="wf-time">生成时间: {{ store.writingFramework.generatedAt }}</div>
        </div>

        <div v-else class="wf-empty-inner">
          <span>点击上方按钮基于样本生成写作框架</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated } from 'vue'
import { ElMessage } from 'element-plus'
import { useUniqueModeStore, PLATFORM_CONFIG, type Platform } from '@/stores/uniqueMode'

const store = useUniqueModeStore()

onActivated(() => { store.reloadFramework() })

const hasPlatform = computed(() => {
  if (!store.writingFramework) return false
  return Object.values(store.writingFramework.platformSpecific).some(v => !!v)
})

async function handleGenerate() {
  try { await store.generateWritingFramework(); ElMessage.success('写作框架已更新') }
  catch (e: any) { ElMessage.error('生成失败: ' + (e.message || '未知错误')) }
}
</script>

<style scoped>
.writing-framework { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
.wf-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #8a9bb0; font-size: 13px; }

.wf-body { display: flex; flex-direction: column; }

.wf-card { background: #fff; border-radius: 14px; padding: 18px 20px; border: 1px solid #eef2f6; }
.wfc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.wfc-title { font-size: 16px; font-weight: 700; color: #0b1a30; }
.wf-btn { padding: 8px 18px; border-radius: 20px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; background: #1a4cff; color: #fff; transition: background 0.15s; font-family: inherit; }
.wf-btn:hover:not(:disabled) { background: #0f3fd9; }
.wf-btn:disabled { opacity: 0.5; }

.wf-loading, .wf-empty-inner { padding: 24px; text-align: center; font-size: 13px; color: #8a9bb0; }

.wfc-content { display: flex; flex-direction: column; gap: 10px; }

.wf-section { padding-top: 10px; border-top: 1px solid #f5f7fa; }
.wf-section:first-of-type { border-top: none; padding-top: 0; }
.wf-section-title { font-size: 13px; font-weight: 600; color: #303133; margin-bottom: 6px; }
.wf-section-title.warn { color: #e6a23c; }
.wf-text { font-size: 13px; color: #3d5068; line-height: 1.7; margin: 0; white-space: pre-wrap; }

.wf-platform { margin-bottom: 8px; }
.wfp-name { font-size: 13px; font-weight: 600; color: #1a4cff; margin-bottom: 4px; }

.wf-list { margin: 0; padding-left: 16px; font-size: 13px; color: #3d5068; line-height: 1.7; }
.wf-list li { margin-bottom: 3px; }

.wf-time { font-size: 11px; color: #b0bfd0; text-align: center; margin-top: 8px; }
</style>
