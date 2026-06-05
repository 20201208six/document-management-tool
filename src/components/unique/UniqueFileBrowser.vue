<template>
  <div class="unique-file-browser">
    <div class="file-browser-header">
      <span class="file-browser-title">文件浏览</span>
      <el-button size="small" text @click="handleUpload">
        <el-icon><Upload /></el-icon>
      </el-button>
      <input ref="fileInput" type="file" accept=".txt,.docx,.srt" style="display:none" @change="onFileChange" />
    </div>

    <div v-if="files.length === 0" class="file-browser-empty">
      <span>点击上传文案文件进行分析</span>
    </div>

    <div v-else class="file-list">
      <div
        v-for="file in files"
        :key="file.name"
        class="file-item"
        :class="{ active: activeFile === file.name }"
        @click="selectFile(file)"
      >
        <el-icon><Document /></el-icon>
        <span class="file-name">{{ file.name }}</span>
        <span class="file-size">{{ file.size }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface UploadedFile {
  name: string
  content: string
  size: string
}

const files = ref<UploadedFile[]>([])
const activeFile = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function handleUpload() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const sizeKB = (file.size / 1024).toFixed(1)
    files.value.push({
      name: file.name,
      content: text,
      size: sizeKB + ' KB'
    })
  } catch {
    // ignore
  }
}

function selectFile(file: UploadedFile) {
  activeFile.value = file.name
}
</script>

<style scoped>
.unique-file-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.file-browser-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f2f5;
}

.file-browser-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.file-browser-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  font-size: 13px;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #606266;
}

.file-item:hover { background: #f5f7fa; }
.file-item.active { background: #ecf5ff; color: #409eff; }

.file-item .file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-item .file-size {
  font-size: 11px;
  color: #c0c4cc;
}
</style>
