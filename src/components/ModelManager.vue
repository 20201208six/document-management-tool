<template>
  <el-dialog v-model="visible" title="全局模型管理" width="640px" destroy-on-close>
    <el-tabs v-model="activeTab" type="border-card">
      <!-- AI 模型 Tab -->
      <el-tab-pane label="AI 模型" name="ai">
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
      <el-table-column label="用途" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'analysis' ? 'warning' : ''">
            {{ row.type === 'analysis' ? '分析' : '对话' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="API Key" width="150">
        <template #default="{ row }">
          <span v-if="row.apiKey" style="color:#67c23a;font-size:12px">已设置</span>
          <span v-else style="color:#f56c6c;font-size:12px">未设置</span>
          <span v-if="testResults.has(row.id)" :style="{ color: testResults.get(row.id)!.ok ? '#67c23a' : '#f56c6c', fontSize: '11px', marginLeft: '6px' }">
            {{ testResults.get(row.id)!.ok ? '✓' : '✗' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260">
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
            size="small"
            type="warning"
            link
            :loading="testingId === row.id"
            @click="testModelConnection(row)"
          >测试</el-button>
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
        <el-form-item label="选择模型" required>
          <el-select v-model="selectedPreset" style="width: 100%" @change="onPresetChange" placeholder="选择预设模型">
            <el-option
              v-for="p in modelPresets"
              :key="p.name"
              :label="p.name"
              :value="p.name"
            >
              <span>{{ p.name }}</span>
              <span style="float:right;color:#909399;font-size:11px">{{ p.providerLabel }}</span>
            </el-option>
            <el-option label="自定义 / 其他..." value="_custom_" />
          </el-select>
        </el-form-item>

        <template v-if="selectedPreset">
          <el-form-item label="模型名称">
            <el-input v-model="newModelForm.name" placeholder="可自定义名称" />
          </el-form-item>
          <el-form-item v-if="selectedPreset === '_custom_'" label="服务商" required>
            <el-select v-model="newModelForm.provider" style="width: 100%">
              <el-option label="DeepSeek" value="deepseek" />
              <el-option label="OpenAI 兼容" value="openai" />
              <el-option label="自定义" value="custom" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="selectedPreset === '_custom_'" label="API 地址" required>
            <el-input v-model="newModelForm.apiUrl" placeholder="https://api.xxx.com/v1/chat/completions" />
          </el-form-item>
          <el-form-item label="API Key" required>
            <el-input v-model="newModelForm.apiKey" type="password" show-password placeholder="sk-..." />
          </el-form-item>
          <el-form-item v-if="selectedPreset === '_custom_'" label="模型参数">
            <el-input v-model="newModelForm.modelParam" placeholder="API 请求中使用的 model 值" />
          </el-form-item>
          <el-form-item v-if="selectedPreset === '_custom_'" label="深度思考">
            <el-switch v-model="newModelForm.supportDeepThinking" />
            <span class="form-tip">是否支持深度思考模式</span>
          </el-form-item>
          <el-form-item label="模型用途">
            <el-radio-group v-model="newModelForm.type">
              <el-radio value="chat">对话</el-radio>
              <el-radio value="analysis">分析</el-radio>
            </el-radio-group>
            <div class="form-tip" style="margin-top:4px">
              对话：高温度、创意生成；分析：低温度、结构化输出
            </div>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleAddModel">确认添加</el-button>
          </el-form-item>
        </template>
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
        <el-form-item label="模型用途">
          <el-radio-group v-model="editingModel.type">
            <el-radio value="chat">对话</el-radio>
            <el-radio value="analysis">分析</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
      </el-tab-pane>

      <!-- ASR 语音识别 Tab -->
      <el-tab-pane label="语音识别" name="asr">
        <div class="asr-config-section">
          <p class="section-desc">配置火山引擎 / 豆包语音识别 API，用于视频自动生成字幕</p>
          <el-form :model="asrForm" label-width="100px" size="small">
            <el-form-item label="APP ID">
              <el-input v-model="asrForm.appId" placeholder="火山引擎应用的 APP ID" />
            </el-form-item>
            <el-form-item label="Access Token">
              <el-input v-model="asrForm.accessToken" type="password" show-password placeholder="火山引擎 Access Token" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveAsrConfig" :loading="asrSaving">
                保存配置
              </el-button>
              <el-button text type="primary" @click="testAsrConfig" :loading="asrTesting">
                测试连接
              </el-button>
            </el-form-item>
          </el-form>
          <div v-if="asrTestResult" class="asr-test-result" :class="{ success: asrTestOk, fail: !asrTestOk }">
            {{ asrTestResult }}
          </div>
        </div>
      </el-tab-pane>

      <!-- 数据画布 Tab -->
      <el-tab-pane label="数据画布" name="datagraph">
        <div class="datagraph-section">
          <p class="section-desc">管理不同数据之间的关联关系。默认隔离，连线后数据互通。</p>
          <DataGraphCanvas />
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import type { AIModel, ModelType } from '@/types/chat'
import { buildModelRequestBody } from '@/services/deepseek'
import DataGraphCanvas from '@/components/DataGraphCanvas.vue'

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
const activeTab = ref('ai')
const selectedPreset = ref('')

// 预设模型列表
interface ModelPreset {
  name: string
  providerLabel: string
  provider: AIModel['provider']
  apiUrl: string
  modelParam: string
  supportDeepThinking: boolean
}

const modelPresets: ModelPreset[] = [
  {
    name: 'DeepSeek V4 Pro',
    providerLabel: 'DeepSeek',
    provider: 'deepseek',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    modelParam: 'deepseek-chat',
    supportDeepThinking: false
  },
  {
    name: 'DeepSeek R1 (推理)',
    providerLabel: 'DeepSeek',
    provider: 'deepseek',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    modelParam: 'deepseek-reasoner',
    supportDeepThinking: true
  },
  {
    name: '豆包 Doubao-Seed-2.0-Lite',
    providerLabel: '火山引擎',
    provider: 'openai',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    modelParam: 'doubao-seed-2-0-lite-260215',
    supportDeepThinking: false
  },
  {
    name: '豆包 Doubao-Seed-2.0',
    providerLabel: '火山引擎',
    provider: 'openai',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    modelParam: 'doubao-seed-2-0-260615',
    supportDeepThinking: false
  },
  {
    name: '豆包 Doubao-1.5-pro-32k',
    providerLabel: '火山引擎',
    provider: 'openai',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    modelParam: 'doubao-1-5-pro-32k-250115',
    supportDeepThinking: false
  },
  {
    name: 'GPT-4o',
    providerLabel: 'OpenAI',
    provider: 'openai',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    modelParam: 'gpt-4o',
    supportDeepThinking: false
  },
  {
    name: 'GPT-4o-mini',
    providerLabel: 'OpenAI',
    provider: 'openai',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    modelParam: 'gpt-4o-mini',
    supportDeepThinking: false
  }
]

function onPresetChange(name: string) {
  if (name === '_custom_') {
    newModelForm.name = ''
    newModelForm.provider = 'deepseek'
    newModelForm.apiUrl = ''
    newModelForm.apiKey = ''
    newModelForm.modelParam = ''
    newModelForm.supportDeepThinking = false
    return
  }
  const preset = modelPresets.find(p => p.name === name)
  if (preset) {
    newModelForm.name = preset.name
    newModelForm.provider = preset.provider
    newModelForm.apiUrl = preset.apiUrl
    newModelForm.apiKey = ''
    newModelForm.modelParam = preset.modelParam
    newModelForm.supportDeepThinking = preset.supportDeepThinking
  }
}

// AI 模型表单
const newModelForm = reactive({
  name: '',
  provider: 'deepseek' as AIModel['provider'],
  apiUrl: '',
  apiKey: '',
  modelParam: '',
  supportDeepThinking: false,
  type: 'chat' as ModelType
})

function handleAddModel() {
  if (!newModelForm.name.trim()) {
    ElMessage.warning('请输入模型名称')
    return
  }
  if (selectedPreset.value === '_custom_') {
    if (!newModelForm.apiUrl.trim()) {
      ElMessage.warning('请输入 API 地址')
      return
    }
    if (!newModelForm.modelParam.trim()) {
      ElMessage.warning('请输入模型参数')
      return
    }
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
    supportDeepThinking: newModelForm.supportDeepThinking,
    type: newModelForm.type
  })

  ElMessage.success('模型添加成功')
  showAddForm.value = false
  selectedPreset.value = ''
  newModelForm.name = ''
  newModelForm.provider = 'deepseek'
  newModelForm.apiUrl = ''
  newModelForm.apiKey = ''
  newModelForm.modelParam = ''
  newModelForm.supportDeepThinking = false
  newModelForm.type = 'chat'
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
  // 清除旧测试结果
  testResults.delete(editingModel.value?.id || '')
}

// ===== 测试模型连接 =====
const testingId = ref('')
const testResults = reactive(new Map<string, { ok: boolean; msg: string }>())

async function testModelConnection(model: AIModel) {
  if (!model.apiKey) {
    ElMessage.warning('请先设置 API Key')
    return
  }
  testingId.value = model.id
  testResults.delete(model.id)
  try {
    const { body } = buildModelRequestBody(model, {
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      temperature: 0
    })
    const response = await fetch(model.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`
      },
      body: JSON.stringify(body)
    })
    const ok = response.ok
    let msg = ''
    if (ok) {
      msg = '连接成功'
    } else {
      const errText = await response.text()
      let errMsg = errText
      try {
          const parsed = JSON.parse(errText)
          errMsg = parsed.error?.message || parsed.error_msg || errMsg
        } catch {}
      msg = `连接失败 (${response.status}): ${errMsg}`
    }
    testResults.set(model.id, { ok, msg })
    ElMessage[ok ? 'success' : 'error'](msg)
  } catch (e: any) {
    const msg = '连接异常: ' + (e.message || String(e))
    testResults.set(model.id, { ok: false, msg })
    ElMessage.error(msg)
  } finally {
    testingId.value = ''
  }
}

// ===== ASR 配置 =====
const asrForm = reactive({
  appId: chatStore.asrConfig.appId,
  accessToken: chatStore.asrConfig.accessToken
})
const asrSaving = ref(false)
const asrTesting = ref(false)
const asrTestResult = ref('')
const asrTestOk = ref(false)

function saveAsrConfig() {
  chatStore.updateAsrConfig({
    appId: asrForm.appId.trim(),
    accessToken: asrForm.accessToken.trim()
  })
  asrSaving.value = true
  setTimeout(() => { asrSaving.value = false }, 500)
  ElMessage.success('ASR 配置已保存')
}

async function testAsrConfig() {
  if (!asrForm.appId || !asrForm.accessToken) {
    asrTestResult.value = '请先填写 APP ID 和 Access Token'
    asrTestOk.value = false
    return
  }
  asrTesting.value = true
  asrTestResult.value = ''
  try {
    const { testAsrConnection } = await import('@/services/asr')
    const ok = await testAsrConnection(asrForm.appId, asrForm.accessToken)
    asrTestOk.value = ok
    asrTestResult.value = ok ? '连接成功！API 配置正确' : '连接失败，请检查 APP ID 和 Access Token'
  } catch (e: any) {
    asrTestOk.value = false
    asrTestResult.value = '连接异常: ' + (e.message || String(e))
  } finally {
    asrTesting.value = false
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

/* ASR 配置 */
.section-desc {
  font-size: 12px;
  color: #909399;
  margin: 0 0 16px 0;
}

.asr-test-result {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
}

.asr-test-result.success {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #e1f3d8;
}

.asr-test-result.fail {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fde2e2;
}

/* 数据画布 */
.datagraph-section {
  height: 520px;
}
.datagraph-section :deep(.graph-canvas) {
  height: 480px;
  min-height: 480px;
}
</style>
