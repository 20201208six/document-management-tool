import { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } from 'electron'
import path from 'path'
import fs from 'fs'
import mammoth from 'mammoth'
import XLSX from 'xlsx'
import * as docx from 'docx'

app.setName('文案助手')

// 全局异常捕获：防止 webview 崩溃导致主进程退出
process.on('uncaughtException', (err) => {
  if (err.message?.includes('Render frame was disposed') || err.message?.includes('WebFrameMain')) {
    console.error('[WebView] 内部导航错误（已忽略）:', err.message)
    return
  }
  console.error('未捕获异常:', err)
})

let mainWindow: BrowserWindow | null = null

function createWindow() {
  Menu.setApplicationMenu(null)
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '文案助手',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // F12 切换开发者工具
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (mainWindow!.webContents.isDevToolsOpened()) {
        mainWindow!.webContents.closeDevTools()
      } else {
        mainWindow!.webContents.openDevTools()
      }
    }
  })
}

app.whenReady().then(() => {
  // 设置全局 User-Agent，避免被抖音等网站检测为内嵌浏览器
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  session.defaultSession.setUserAgent(chromeUA)
  app.userAgentFallback = chromeUA

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('read-directory', async (_event, dirPath: string) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const supportedExts = ['.txt', '.docx', '.doc', '.xlsx', '.xls', '.srt']
    return entries
      .filter(entry => entry.isDirectory() || supportedExts.includes(path.extname(entry.name).toLowerCase()))
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }))
  } catch {
    return []
  }
})

ipcMain.handle('read-file-content', async (_event, filePath: string) => {
  try {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.txt' || ext === '.srt') {
      return { type: 'text', content: fs.readFileSync(filePath, 'utf-8') }
    }
    if (ext === '.docx' || ext === '.doc') {
      const buffer = fs.readFileSync(filePath)
      const result = await mammoth.convertToHtml({ buffer })
      return { type: 'html', content: result.value }
    }
    if (ext === '.xlsx') {
      const workbook = XLSX.readFile(filePath)
      let content = ''
      workbook.SheetNames.forEach((sheetName: string) => {
        const sheet = workbook.Sheets[sheetName]
        content += `--- ${sheetName} ---\n`
        content += XLSX.utils.sheet_to_csv(sheet)
        content += '\n\n'
      })
      return { type: 'xlsx', content }
    }
    return { type: 'unknown', content: '' }
  } catch (err: any) {
    return { type: 'error', content: err.message }
  }
})

ipcMain.handle('save-docx-file', async (_event, filePath: string, content: string) => {
  try {
    const children = htmlToDocxChildren(content)
    const doc = new docx.Document({
      sections: [{ properties: {}, children }]
    })
    const buffer = await docx.Packer.toBuffer(doc)
    fs.writeFileSync(filePath, buffer)
    return { success: true }
  } catch (err: any) {
    console.error('保存 docx 失败:', err)
    return { success: false, error: err.message || '保存失败' }
  }
})

function htmlToDocxChildren(html: string): docx.Paragraph[] {
  const result: docx.Paragraph[] = []
  const blockRegex = /<(p|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null
  let lastIndex = 0
  const stripped = html.replace(/<(br|hr)\s*\/?>/gi, '\n')

  while ((match = blockRegex.exec(stripped)) !== null) {
    lastIndex = match.index + match[0].length
    const tag = match[1].toLowerCase()
    const inner = match[2]
    const runs = parseInlineFormatting(inner)
    const para = new docx.Paragraph({ children: runs.length > 0 ? runs : [new docx.TextRun('')] })
    if (tag.startsWith('h')) {
      const level = parseInt(tag.charAt(1))
      para.heading = docx.HeadingLevel[`HEADING_${level}` as keyof typeof docx.HeadingLevel] || docx.HeadingLevel.HEADING_1
    }
    result.push(para)
  }

  const remaining = stripped.substring(lastIndex).replace(/<[^>]+>/g, '').trim()
  if (remaining) {
    remaining.split('\n').forEach(line => {
      result.push(new docx.Paragraph({ children: line.trim() ? [new docx.TextRun(line.trim())] : [] }))
    })
  }
  if (result.length === 0) {
    result.push(new docx.Paragraph({ children: [] }))
  }
  return result
}

function parseInlineFormatting(inner: string): (docx.TextRun | docx.Paragraph)[] {
  const runs: docx.TextRun[] = []
  let remaining = inner
  const inlineRegex = /<(\/?)(strong|b|em|i|u|span)\b[^>]*>/g
  const boldStack: boolean[] = []
  const italicStack: boolean[] = []
  const underlineStack: boolean[] = []
  let pos = 0

  let m: RegExpExecArray | null
  while ((m = inlineRegex.exec(inner)) !== null) {
    if (m.index > pos) {
      const text = inner.substring(pos, m.index).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      if (text) {
        const bold = boldStack.some(b => b)
        const italic = italicStack.some(i => i)
        const underline = underlineStack.some(u => u)
        runs.push(new docx.TextRun({ text, bold, italics: italic, underline: underline ? { type: 'single' as const } : undefined }))
      }
    }
    const tag = m[2].toLowerCase()
    const closing = m[1] === '/'
    if (tag === 'strong' || tag === 'b') closing ? boldStack.pop() : boldStack.push(true)
    if (tag === 'em' || tag === 'i') closing ? italicStack.pop() : italicStack.push(true)
    if (tag === 'u') closing ? underlineStack.pop() : underlineStack.push(true)
    pos = m.index + m[0].length
  }

  if (pos < inner.length) {
    const text = inner.substring(pos).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    if (text) {
      const bold = boldStack.some(b => b)
      const italic = italicStack.some(i => i)
      const underline = underlineStack.some(u => u)
      runs.push(new docx.TextRun({ text, bold, italics: italic, underline: underline ? { type: 'single' as const } : undefined }))
    }
  }

  return runs
}

ipcMain.handle('save-text-file', async (_event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (err: any) {
    console.error('保存文本失败:', err)
    return { success: false, error: err.message || '保存失败' }
  }
})

ipcMain.handle('create-file', async (_event, folderPath: string, fileName: string, fileType: string) => {
  try {
    const fullPath = path.join(folderPath, fileName)
    if (fs.existsSync(fullPath)) {
      return { success: false, error: '文件已存在' }
    }
    if (fileType === 'txt' || fileType === 'json' || fileType === 'srt') {
      fs.writeFileSync(fullPath, '')
    } else if (fileType === 'docx') {
      const doc = new docx.Document({ sections: [{ children: [new docx.Paragraph({ children: [] })] }] })
      const buffer = await docx.Packer.toBuffer(doc)
      fs.writeFileSync(fullPath, buffer)
    } else if (fileType === 'xlsx') {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([['']])
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, fullPath)
    }
    return { success: true, path: fullPath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('delete-file', async (_event, filePath: string) => {
  try {
    fs.unlinkSync(filePath)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('search-in-files', async (_event, folderPath: string, keyword: string) => {
  const results: any[] = []
  const extensions = ['.docx', '.doc', '.xlsx', '.txt', '.srt']

  async function searchRecursive(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await searchRecursive(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (!extensions.includes(ext)) continue
          try {
            let content = ''
            if (ext === '.txt' || ext === '.srt') {
              content = fs.readFileSync(fullPath, 'utf-8')
            } else if (ext === '.docx' || ext === '.doc') {
              const buffer = fs.readFileSync(fullPath)
              const result = await mammoth.extractRawText({ buffer })
              content = result.value
            } else if (ext === '.xlsx') {
              const workbook = XLSX.readFile(fullPath)
              workbook.SheetNames.forEach((sn: string) => {
                const sheet = workbook.Sheets[sn]
                content += XLSX.utils.sheet_to_csv(sheet) + '\n'
              })
            }
            if (!content) continue
            if (content.toLowerCase().includes(keyword.toLowerCase())) {
              const lines = content.split('\n')
              const matchLines = lines.filter((l: string) =>
                l.toLowerCase().includes(keyword.toLowerCase())
              )
              results.push({
                fileName: entry.name,
                path: fullPath,
                matches: matchLines.slice(0, 5).map((l: string) => l.trim()),
                totalMatches: matchLines.length
              })
            }
          } catch (err) {
            console.error('搜索文件出错:', fullPath, err)
          }
        }
      }
    } catch (err) {
      console.error('读取目录出错:', dir, err)
    }
  }

  await searchRecursive(folderPath)
  return results
})

ipcMain.handle('open-file-location', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('open-with-default-app', async (_event, filePath: string) => {
  shell.openPath(filePath)
})

ipcMain.handle('open-external', async (_event, url: string) => {
  shell.openExternal(url)
})

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: '文本文件', extensions: ['txt', 'json', 'csv', 'md', 'html', 'xml'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('read-file-as-text', async (_event, filePath: string) => {
  try {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.txt' || ext === '.json' || ext === '.csv' || ext === '.md' || ext === '.html' || ext === '.xml' || ext === '.srt') {
      return { success: true, content: fs.readFileSync(filePath, 'utf-8') }
    }
    if (ext === '.docx' || ext === '.doc') {
      const buffer = fs.readFileSync(filePath)
      const result = await mammoth.extractRawText({ buffer })
      return { success: true, content: result.value }
    }
    if (ext === '.xlsx') {
      const workbook = XLSX.readFile(filePath)
      let content = ''
      workbook.SheetNames.forEach((sn: string) => {
        const sheet = workbook.Sheets[sn]
        content += XLSX.utils.sheet_to_csv(sheet) + '\n'
      })
      return { success: true, content }
    }
    return { success: false, error: '不支持的文件格式' }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('save-xlsx-file', async (_event, filePath: string, content: string) => {
  try {
    const rows = content.split('\n').map((line: string) => line.split(','))
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, filePath)
    return { success: true }
  } catch (err: any) {
    console.error('保存 xlsx 失败:', err)
    return { success: false, error: err.message || '保存失败' }
  }
})
