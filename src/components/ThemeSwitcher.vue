<template>
  <el-popover
    placement="right-start"
    :width="220"
    trigger="click"
    v-model:visible="showThemePopover"
  >
    <template #reference>
      <button class="mode-btn theme-btn" title="主题切换">
        <el-icon><Brush /></el-icon>
      </button>
    </template>
    <div class="theme-panel">
      <div class="theme-panel-title">
        <el-icon><Brush /></el-icon>
        <span>选择主题</span>
      </div>
      <div class="theme-grid">
        <button
          v-for="t in themeStore.getThemes()"
          :key="t.key"
          class="theme-item"
          :class="{ active: themeStore.currentTheme === t.key }"
          @click="themeStore.setTheme(t.key)"
        >
          <span class="theme-preview" :style="{ background: t.colors.bg, borderColor: t.colors.border }">
            <span class="theme-preview-primary" :style="{ background: t.colors.primary }"></span>
            <span class="theme-preview-text" :style="{ background: t.colors.text }"></span>
          </span>
          <span class="theme-name">{{ t.icon }} {{ t.name }}</span>
          <el-icon v-if="themeStore.currentTheme === t.key" class="theme-check" :size="14"><Select /></el-icon>
        </button>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const showThemePopover = ref(false)
</script>

<style scoped>
.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
  border-radius: 12px;
  transition: all 0.15s ease;
  font-size: 18px;
}
.theme-btn:hover {
  color: var(--c-text-sec);
  background: var(--c-bg-hover);
}

.theme-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--c-border-light);
  margin-bottom: 4px;
}

.theme-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.theme-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  position: relative;
  transition: all 0.15s ease;
}
.theme-item:hover {
  background: var(--c-bg-hover);
}
.theme-item.active {
  border-color: var(--c-primary);
  background: var(--c-primary-soft);
}

.theme-preview {
  width: 64px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 3px;
  padding: 4px 6px;
  overflow: hidden;
}

.theme-preview-primary {
  width: 20px;
  height: 8px;
  border-radius: 2px;
}

.theme-preview-text {
  width: 32px;
  height: 4px;
  border-radius: 2px;
  opacity: 0.6;
}

.theme-name {
  font-size: 11px;
  color: var(--c-text-sec);
  font-weight: 500;
}

.theme-item.active .theme-name {
  color: var(--c-primary);
  font-weight: 600;
}

.theme-check {
  position: absolute;
  top: 4px;
  right: 4px;
  color: var(--c-primary);
}
</style>
