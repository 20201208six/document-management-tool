<template>
  <div class="univer-viewer">
    <div id="univer-container" class="uv-container" ref="uvContainer"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import UniverPresetSheetsCoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN'
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter'
import UniverSheetsFilterZhCN from '@univerjs/preset-sheets-filter/locales/zh-CN'
import { UniverSheetsFindReplacePreset } from '@univerjs/preset-sheets-find-replace'
import UniverSheetsFindReplaceZhCN from '@univerjs/preset-sheets-find-replace/locales/zh-CN'
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'
import type { IWorkbookData, IStyleData } from '@univerjs/core'
import '@univerjs/presets/lib/styles/preset-sheets-core.css'
import '@univerjs/preset-sheets-core/lib/index.css'

// ---- CSS patching: hide unwanted headers & icon-placeholders ----
const PATCHED_CSS = /* css */ `
.univer-app-layout > div[style*="z-index: 2"],
.univer-toolbar-btn[title*="More"],
div:has(> [id="workbench.toolbar.iconPlacement"]),
.univer-toolbar:has(> [id="workbench.toolbar.iconPlacement"]) { display: none !important; }
`

function patchUniverCSS() {
  const id = 'uv-custom-patch'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = PATCHED_CSS
  document.head.appendChild(style)
}

// ---- Props & emits ----
const props = defineProps<{
  modelValue: string | any[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const uvContainer = ref<HTMLElement | null>(null)

// ---- Module-level singletons: one Univer instance for the whole app ----
let _univerAPI: any = null
let _univer: any = null
let _initialized = false
let _sheetCount = 0

// ---- Helpers ----

interface SheetPayload {
  name: string
  data: any[][]
  rowCount?: number
  columnCount?: number
}

function parsePayload(val: string | any[]): SheetPayload[] {
  if (Array.isArray(val)) return val as SheetPayload[]
  try {
    const arr = JSON.parse(val)
    if (Array.isArray(arr) && arr.length > 0) return arr
  } catch { /* ignore */ }
  return []
}

/** Convert 2D array → Univer cell data format */
function toCellData(data: any[][]): Record<string, Record<string, any>> {
  const cd: Record<string, Record<string, any>> = {}
  for (let r = 0; r < data.length; r++) {
    const row: Record<string, any> = {}
    for (let c = 0; c < (data[r]?.length || 0); c++) {
      const v = data[r][c]
      if (v !== null && v !== undefined && v !== '') {
        row[c] = { v }
      }
    }
    cd[r] = row
  }
  return cd
}

/** Convert Univer cell data → 2D array */
function cellDataToArray(
  cellData: Record<string, Record<string, any>> | undefined,
  rowCount: number,
  colCount: number
): any[][] {
  const result: any[][] = []
  for (let r = 0; r < rowCount; r++) {
    result[r] = []
    for (let c = 0; c < colCount; c++) {
      result[r][c] = cellData?.[r]?.[c]?.v ?? ''
    }
  }
  return result
}

// ---- Init ----

let _pendingSheets: SheetPayload[] | null = null

async function initUniver(sheets: SheetPayload[]) {
  // Univer requires page to be visible, defer init if hidden
  if (document.visibilityState === 'hidden') {
    _pendingSheets = sheets
    return
  }

  await nextTick()
  patchUniverCSS()

  if (!uvContainer.value) return

  // Destroy previous instance if any
  if (_univer) {
    _univer.dispose()
    _univer = null
    _univerAPI = null
    _initialized = false
  }

  // Build workbook data from sheets
  const workbookData: IWorkbookData = {
    id: 'wb-1',
    sheetOrder: [],
    sheets: {},
  }

  for (const s of sheets) {
    const sheetId = `sheet-${s.name}`
    workbookData.sheetOrder!.push(sheetId)
    const rowCount = Math.max(s.data.length, 100)
    const colCount = Math.max(s.data[0]?.length || 0, 25)
    const headerStyle: IStyleData = { bg: { rgb: '#f0f2f5' }, fs: 12, bl: 1 }
    workbookData.sheets![sheetId] = {
      id: sheetId,
      name: s.name,
      rowCount,
      columnCount: colCount,
      cellData: toCellData(s.data),
      rowData: {
        0: { s: { ...headerStyle } },
      },
    }
  }

  if (workbookData.sheetOrder!.length === 0) {
    const sheetId = 'sheet-default'
    workbookData.sheetOrder = [sheetId]
    workbookData.sheets = {
      [sheetId]: { id: sheetId, name: 'Sheet1', rowCount: 100, columnCount: 25, cellData: {} },
    }
  }

  _sheetCount = workbookData.sheetOrder!.length

  const { univer, univerAPI } = createUniver({
    locale: LocaleType.ZH_CN,
    locales: {
      [LocaleType.ZH_CN]: mergeLocales(
        {},
        UniverPresetSheetsCoreZhCN,
        UniverSheetsFilterZhCN,
        UniverSheetsFindReplaceZhCN,
      ),
    },
    presets: [
      UniverSheetsCorePreset({
        container: 'univer-container',
        footer: {
          addSheetButtonConfig: {
            defaultRowCount: 100,
            defaultColumnCount: 25,
          },
        },
      }),
      UniverSheetsFilterPreset(),
      UniverSheetsFindReplacePreset(),
    ],
  })

  _univer = univer
  _univerAPI = univerAPI
  _initialized = true

  univerAPI.createWorkbook(workbookData)
}

// ---- Public API ----

function getContent(): string {
  if (!_univerAPI) return props.modelValue

  try {
    const workbook = _univerAPI.getActiveWorkbook()
    if (!workbook) return props.modelValue

    const snapshot: IWorkbookData = workbook.getSnapshot()
    const sheets: SheetPayload[] = []

    for (const sheetId of snapshot.sheetOrder || []) {
      const s = snapshot.sheets?.[sheetId]
      if (!s) continue
      sheets.push({
        name: s.name || 'Sheet1',
        data: cellDataToArray(s.cellData, s.rowCount || 1, s.columnCount || 1),
      })
    }

    return JSON.stringify(sheets)
  } catch {
    return props.modelValue
  }
}

// ---- Lifecycle ----

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && _pendingSheets) {
    const sheets = _pendingSheets
    _pendingSheets = null
    initUniver(sheets)
  }
}

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  const sheets = parsePayload(props.modelValue)
  await initUniver(sheets)
})

watch(
  () => props.modelValue,
  (val) => {
    if (!_initialized) return
    const sheets = parsePayload(val)
    if (sheets.length > 0) {
      initUniver(sheets)
    }
  }
)

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  // Keep instance alive at module level; only dispose if explicitly needed
})

defineExpose({ getContent })
</script>

<style scoped>
.univer-viewer {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.uv-container {
  width: 100%;
  height: 100%;
}

/* Fix Univer's default layout to fill container */
.uv-container :deep(.univer-app-layout) {
  height: 100% !important;
}
</style>
