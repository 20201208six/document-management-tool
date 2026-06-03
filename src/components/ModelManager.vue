<template>
  <el-dialog v-model="visible" title="模型管理" width="600px" destroy-on-close>
    <!-- 当前活跃模型状态 -->
    <div class="current-model-bar">
      <el-tag type="success" effect="dark" size="large">
        当前模型：{{ chatStore.currentModel.name }}
      </el-tag>
    </div>

    <!-- 模型列表 -->
    <el-table :data="chatStore.modelList" size="small" style="width: 100%">
      <el-table-column prop="name" label="模型名称" min-width="140">
        <template #default="{ row }">
          <span :style="{ fontWeight: row.isDefault ? '700' : '400' }">
            {{ row.name }}
          </span>
          <el-tag v-if="row.isDefault" size="small" type="success" style="margin-left: 6px">默认</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="provider" label="服务商" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.provider === 'deepseek' ? '' : 'info'">
            {{ row.provider === 'deepseek' ? 'DeepSeek' : row.provider === 'openai' ? 'OpenAI' : '自定义' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="API Key" width="120">
        <template #default="{ row }">
          <span v-if="row.apiKey" style="color:#67c23a;font-size:12px">已设置</span>
          <span v-else style="color:#f56c6c;font-size:12px">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="editModel(row)">编辑</el-button>
          <el-button
            v-if="!row.isDefault"
            size="small"
            type="success"
            link
            @click="chatStore.setDefaultModel(row.id)"
          >设为默认</el-button>
          <el-button
            v-if="row.id !== 'deepseek-default'"
            size="small"
            type="danger"
            link
            @click="handleRemove(row)"
          >删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加新模型 -->
    <div class="add-model-section">
      <el-divider />
      <el-button type="primary" @click="showAddForm = !showAddForm">
        <el-icon><Plus /></el-icon>
        {{ showAddForm ? '取消添加' : '添加模型' }}
      </el-button>

      <el-form
        v-if="showAddForm"
        :model="newModelForm"
        label-width="100px"
        size="small"
        style="margin-top: 16px"
      >
        <el-form-item label="模型名称" required>
          <el-input v-model="newModelForm.name" placeholder="例如：GPT-4o、Qwen-Max" />
        </el-form-item>
        <el-form-item label="服务商" required>
          <el-select v-model="newModelForm.provider" style="width: 100%">
            <el-option label="DeepSeek" value="deepseek" />
            <el-option label="OpenAI 兼容" value="openai" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="API 地址" required>
          <el-input v-model="newModelForm.apiUrl" placeholder="https://api.xxx.com/v1/chat/completions" />
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="newModelForm.apiKey" type="password" show-password placeholder="sk-..." />
        </el-form-item>
        <el-form-item label="模型参数">
          <el-input v-model="newModelForm.modelParam" placeholder="API 请求中使用的 model 值" />
        </el-form-item>
        <el-form-item label="深度思考">
          <el-switch v-model="newModelForm.supportDeepThinking" />
          <span class="form-tip">是否支持深度思考模式</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleAddModel">确认添加</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 编辑模型对话框 -->
    <el-dialog v-model="showEditDialog" title="编辑模型" width="480px" append-to-body>
      <el-form v-if="editingModel" :model="editingModel" label-width="100px" size="small">
        <el-form-item label="模型名称">
          <el-input v-model="editingModel.name" />
        </el-form-item>
        <el-form-item label="API 地址">
          <el-input v-model="editingModel.apiUrl" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="editingModel.apiKey" type="password" show-password />
        </el-form-item>
        <el-form-item label="模型参数">
          <el-input v-model="editingModel.modelParam" />
        </el-form-item>
        <el-form-item label="深度思考">
          <el-switch v-model="editingModel.supportDeepThinking" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import type { AIModel } from '@/types/chat'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const chatStore = useChatStore()
const showAddForm = ref(false)

const newModelForm = reactive({
  name: '',
  provider: 'deepseek' as AIModel['provider'],
  apiUrl: '',
  apiKey: '',
  modelParam: '',
  supportDeepThinking: false
})

function handleAddModel() {
  if (!newModelForm.name.trim()) {
    ElMessage.warning('请输入模型名称')
    return
  }
  if (!newModelForm.apiUrl.trim()) {
    ElMessage.warning('请输入 API 地址')
    return
  }
  if (!newModelForm.apiKey.trim()) {
    ElMessage.warning('请输入 API Key')
    return
  }

  chatStore.addCustomModel({
    name: newModelForm.name.trim(),
    provider: newModelForm.provider,
    apiUrl: newModelForm.apiUrl.trim(),
    apiKey: newModelForm.apiKey.trim(),
    modelParam: newModelForm.modelParam.trim() || newModelForm.name.trim(),
    supportDeepThinking: newModelForm.supportDeepThinking
  })

  ElMessage.success('模型添加成功')
  showAddForm.value = false
  newModelForm.name = ''
  newModelForm.provider = 'deepseek'
  newModelForm.apiUrl = ''
  newModelForm.apiKey = ''
  newModelForm.modelParam = ''
  newModelForm.supportDeepThinking = false
}

function handleRemove(model: AIModel) {
  ElMessageBox.confirm(`确定要删除模型「${model.name}」吗？`, '确认删除', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    chatStore.removeModel(model.id)
    ElMessage.success('模型已删除')
  }).catch(() => {})
}

// 编辑模型
const showEditDialog = ref(false)
const editingModel = ref<AIModel | null>(null)

function editModel(model: AIModel) {
  editingModel.value = { ...model }
  showEditDialog.value = true
}

function saveEdit() {
  if (editingModel.value) {
    chatStore.updateModel(editingModel.value.id, editingModel.value)
    ElMessage.success('保存成功')
    showEditDialog.value = false
  }
}
</script>

<style scoped>
.current-model-bar {
  margin-bottom: 16px;
}

.add-model-section {
  margin-top: 8px;
}

.form-tip {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
