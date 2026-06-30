<template>
  <div class="docs-viewer">
    <div id="docs-container" ref="dvContainer" class="dv-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core'
import UniverPresetDocsCoreZhCN from '@univerjs/preset-docs-core/locales/zh-CN'
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'
import type { IDocumentData, IDocumentBody, ITextRun, IParagraph, ISectionBreak, ITextStyle } from '@univerjs/core'
import '@univerjs/presets/lib/styles/preset-docs-core.css'
import '@univerjs/preset-docs-core/lib/index.css'

// ---- CSS patching: hide unwanted elements ----
const PATCHED_CSS = /* css */ `
.docs-viewer .univer-app-layout { height: 100% !important; }
.docs-viewer .univer-toolbar { display: none !important; }
.docs-viewer #univer-menubar { display: none !important; }
.docs-viewer .univer-doc-container { background: var(--c-bg, #fff) !important; }
`

function patchUniverCSS() {
  const id = 'dv-custom-patch'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = PATCHED_CSS
  document.head.appendChild(style)
}

// ---- Props & emits ----
const props = defineProps<{
  modelValue: string
}>()

const dvContainer = ref<HTMLElement | null>(null)

// ---- Module-level singletons ----
let _univerAPI: any = null
let _univer: any = null
let _initialized = false

const DOC_ID = 'doc-1'

// ---- HTML → Univer Document Data converter ----
interface Block {
  tag: string
  text: string
  style?: ITextStyle
  heading?: number
  isList?: boolean
  listType?: 'ul' | 'ol'
  indent?: number
  isQuote?: boolean
  runs?: ITextRun[]
}

const BOLD_TAGS = new Set(['strong', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'th'])
const ITALIC_TAGS = new Set(['em', 'i'])
const UNDERLINE_TAGS = new Set(['u'])
const HEADING_MAP: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 }

function parseColor(val: string | null): { rgb: string } | undefined {
  if (!val) return undefined
  const m = val.match(/#([0-9a-fA-F]{3,8})/)
  if (m) {
    let hex = m[1]
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
    if (hex.length === 8) hex = hex.slice(0, 6) // strip alpha
    return { rgb: hex }
  }
  const rgb = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgb) {
    const r = Number(rgb[1]).toString(16).padStart(2, '0')
    const g = Number(rgb[2]).toString(16).padStart(2, '0')
    const b = Number(rgb[3]).toString(16).padStart(2, '0')
    return { rgb: r + g + b }
  }
  return undefined
}

function styleFromElement(el: HTMLElement): ITextStyle {
  const st: ITextStyle = {}
  const tag = el.tagName.toLowerCase()
  const fw = (el.style.fontWeight || '').toLowerCase()
  if (BOLD_TAGS.has(tag) || fw === 'bold' || Number(fw) >= 600) st.bl = 1
  if (ITALIC_TAGS.has(tag) || el.style.fontStyle === 'italic') st.it = 1
  const td = el.style.textDecoration
  if (UNDERLINE_TAGS.has(tag) || (td && td.includes('underline'))) st.ul = { s: 1 }
  const fs = el.style.fontSize
  if (fs) {
    const n = parseInt(fs, 10)
    if (!isNaN(n)) st.fs = n
  }
  const color = parseColor(el.style.color)
  if (color) st.cl = color
  const bg = parseColor(el.style.backgroundColor)
  if (bg) st.bg = bg
  return st
}

function mergeStyle(a: ITextStyle, b: ITextStyle): ITextStyle {
  return { ...a, ...b }
}

interface WalkCtx {
  text: string
  runs: ITextRun[]
  styleStack: ITextStyle[]
}

function walkNode(node: Node, ctx: WalkCtx, blockEl?: HTMLElement) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.nodeValue || ''
    if (!t) return
    const st: ITextStyle = {}
    for (const s of ctx.styleStack) Object.assign(st, s)
    const start = ctx.text.length
    ctx.text += t
    const end = ctx.text.length
    // Only add run if there is any style set
    if (Object.keys(st).length > 0) {
      ctx.runs.push({ st: start, ed: end, ts: st })
    }
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (tag === 'br') {
    ctx.text += '\r'
    return
  }
  const myStyle = styleFromElement(el)
  ctx.styleStack.push(myStyle)
  for (const child of Array.from(el.childNodes)) {
    walkNode(child, ctx, blockEl)
  }
  ctx.styleStack.pop()
}

function htmlToBlocks(html: string): Block[] {
  const container = document.createElement('div')
  container.innerHTML = html || '<p></p>'
  const blocks: Block[] = []

  function extractFrom(el: HTMLElement, isList = false, listType: 'ul' | 'ol' = 'ul', depth = 0) {
    let olCounter = 0
    for (const child of Array.from(el.children)) {
      const ch = child as HTMLElement
      const tag = ch.tagName.toLowerCase()
      if (tag === 'ul' || tag === 'ol') {
        extractFrom(ch, true, tag as 'ul' | 'ol', depth + 1)
        continue
      }
      if (tag === 'li') {
        // Flatten li content but mark as list item
        const ctx: WalkCtx = { text: '', runs: [], styleStack: [] }
        // Add bullet/number marker in text
        const marker = listType === 'ol' ? `${++olCounter}. ` : '• '
        ctx.text = marker
        for (const n of Array.from(ch.childNodes)) {
          if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName.toLowerCase() === 'ul' || (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName.toLowerCase() === 'ol')) {
            // nested list: handle after this
            continue
          }
          walkNode(n, ctx)
        }
        // Remove trailing newlines, ensure text ends clean
        let txt = ctx.text
        txt = txt.replace(/\s+$/g, '')
        // Shift run offsets by marker length
        const blockRuns = ctx.runs.map(r => ({ st: r.st + marker.length, ed: r.ed + marker.length, ts: r.ts }))
        blocks.push({
          tag: 'p',
          text: txt,
          style: undefined,
          isList: true,
          listType,
          indent: depth,
          runs: blockRuns,
        })
        // Handle nested lists within li
        for (const n of Array.from(ch.children)) {
          const sub = n as HTMLElement
          if (sub.tagName.toLowerCase() === 'ul' || sub.tagName.toLowerCase() === 'ol') {
            extractFrom(sub, true, sub.tagName.toLowerCase() as 'ul' | 'ol', depth + 1)
          }
        }
        continue
      }
      if (HEADING_MAP[tag] || tag === 'p' || tag === 'div' || tag === 'blockquote' || tag === 'pre') {
        const ctx: WalkCtx = { text: '', runs: [], styleStack: [] }
        for (const n of Array.from(ch.childNodes)) {
          if (n.nodeType === Node.ELEMENT_NODE) {
            const st = (n as HTMLElement).tagName.toLowerCase()
            if (st === 'ul' || st === 'ol') {
              // emit collected text as a paragraph first
              let t = ctx.text.replace(/\s+$/g, '')
              if (t || blocks.length === 0) {
                blocks.push({
                  tag: tag === 'blockquote' ? 'p' : tag,
                  text: t,
                  heading: HEADING_MAP[tag],
                  isQuote: tag === 'blockquote',
                  runs: ctx.runs.slice(),
                })
                ctx.text = ''
                ctx.runs = []
              }
              extractFrom(n as HTMLElement, true, st as 'ul' | 'ol', depth + 1)
              continue
            }
          }
          walkNode(n, ctx)
        }
        let t = ctx.text
        // Replace internal \r from <br> with paragraph break? Treat <br> inside paragraph as line break? Univer uses \r as paragraph; just remove trailing
        t = t.replace(/\s+$/g, '')
        if (t === '' && (HEADING_MAP[tag] || tag === 'blockquote')) {
          // keep heading even if empty
        }
        blocks.push({
          tag: tag === 'blockquote' ? 'p' : tag,
          text: t,
          heading: HEADING_MAP[tag],
          isQuote: tag === 'blockquote',
          runs: ctx.runs.slice(),
        })
        continue
      }
      if (tag === 'table') {
        // Extract table as text rows separated by tabs
        const rows = ch.querySelectorAll('tr')
        rows.forEach((row) => {
          const cells = Array.from(row.querySelectorAll('th,td')).map(c => (c.textContent || '').trim())
          blocks.push({ tag: 'p', text: cells.join('  |  ') })
        })
        continue
      }
      // Fallback: treat as inline container
      const ctx: WalkCtx = { text: '', runs: [], styleStack: [] }
      walkNode(ch, ctx)
      let t = ctx.text.replace(/\s+$/g, '')
      if (t) blocks.push({ tag: 'p', text: t, runs: ctx.runs.slice() })
    }
  }

  extractFrom(container)
  // If nothing parsed, treat entire text content as a single paragraph
  if (blocks.length === 0) {
    blocks.push({ tag: 'p', text: container.textContent || '' })
  }
  return blocks
}

function buildDocumentData(html: string): IDocumentData {
  const blocks = htmlToBlocks(html)
  const paragraphs: IParagraph[] = []
  const runs: ITextRun[] = []
  let dataStream = ''

  let offset = 0
  for (const b of blocks) {
    const pStart = offset
    let text = b.text || ''
    // Avoid internal \r characters in paragraph text (used as paragraph separator)
    text = text.replace(/\r/g, '\n')
    if (text === '') text = ' '
    paragraphs.push({
      startIndex: pStart,
      paragraphStyle: b.heading
        ? { headingId: `heading-${b.heading}`, namedStyleType: `heading-${b.heading}` as any }
        : b.isQuote
          ? { indentFirstLine: { v: 0 }, spaceAbove: { v: 6 }, spaceBelow: { v: 6 } }
          : undefined,
    })
    // Inline text runs from HTML walk (bold/italic/color/etc.)
    if (b.runs && b.runs.length > 0) {
      for (const r of b.runs) {
        const st = pStart + r.st
        const ed = pStart + r.ed
        if (ed > st && ed <= pStart + text.length) {
          runs.push({ st, ed, ts: r.ts })
        }
      }
    }
    // Apply base block style as a text run covering the whole paragraph when present
    if (b.style && Object.keys(b.style).length > 0) {
      runs.push({
        st: pStart,
        ed: pStart + text.length,
        ts: b.style,
      })
    }
    dataStream += text
    offset += text.length
    // paragraph separator
    dataStream += '\r'
    offset += 1
  }
  // Document must end with \n (section break) per Univer convention
  if (!dataStream.endsWith('\n')) {
    // The last \r is paragraph separator; append section break
    dataStream += '\n'
  }

  const sectionBreaks: ISectionBreak[] = [
    { startIndex: dataStream.length - 1 },
  ]

  const body: IDocumentBody = {
    dataStream,
    paragraphs,
    textRuns: runs,
    sectionBreaks,
  }

  return {
    id: DOC_ID,
    title: 'document',
    documentStyle: {
      pageSize: { width: 794, height: 1123 },
      marginTop: { v: 40 },
      marginBottom: { v: 40 },
      marginRight: { v: 40 },
      marginLeft: { v: 40 },
      renderConfig: {},
    },
    body,
  }
}

// ---- Init ----
let _pendingContent = ''

async function initUniver(content: string) {
  if (document.visibilityState === 'hidden') {
    _pendingContent = content
    return
  }

  await nextTick()
  patchUniverCSS()

  if (!dvContainer.value) return

  if (_univer) {
    try { _univer.dispose() } catch { /* ignore */ }
    _univer = null
    _univerAPI = null
    _initialized = false
    if (dvContainer.value) dvContainer.value.innerHTML = ''
  }

  const { univer, univerAPI } = createUniver({
    locale: LocaleType.ZH_CN,
    locales: {
      [LocaleType.ZH_CN]: mergeLocales({}, UniverPresetDocsCoreZhCN),
    },
    presets: [
      UniverDocsCorePreset({
        container: 'docs-container',
        toolbar: false,
        header: false,
        footer: false,
      }),
    ],
  })

  _univer = univer
  _univerAPI = univerAPI
  _initialized = true

  try {
    const docData = buildDocumentData(content)
    univerAPI.createUniverDoc(docData)
  } catch (e) {
    console.error('[DocsViewer] failed to create doc', e)
  }
}

// ---- Public API ----
function getContent(): string {
  // Read-only viewer; return original modelValue
  return props.modelValue
}

// ---- Lifecycle ----
function onVisibilityChange() {
  if (document.visibilityState === 'visible' && _pendingContent) {
    const c = _pendingContent
    _pendingContent = ''
    initUniver(c)
  }
}

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  await initUniver(props.modelValue)
})

watch(
  () => props.modelValue,
  (val) => {
    initUniver(val)
  }
)

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

defineExpose({ getContent })
</script>

<style scoped>
.docs-viewer {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background: var(--c-bg, #fff);
}

.dv-container {
  width: 100%;
  height: 100%;
}

.dv-container :deep(.univer-app-layout) {
  height: 100% !important;
}

.dv-container :deep(.univer-render-canvas) {
  background: var(--c-bg, #fff);
}
</style>
