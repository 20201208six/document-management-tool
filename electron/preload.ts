import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  readFileContent: (filePath: string) => ipcRenderer.invoke('read-file-content', filePath),
  saveDocxFile: (filePath: string, content: string) => ipcRenderer.invoke('save-docx-file', filePath, content),
  saveTextFile: (filePath: string, content: string) => ipcRenderer.invoke('save-text-file', filePath, content),
  saveXlsxFile: (filePath: string, content: string) => ipcRenderer.invoke('save-xlsx-file', filePath, content),
  createFile: (folderPath: string, fileName: string, fileType: string) => ipcRenderer.invoke('create-file', folderPath, fileName, fileType),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
  searchInFiles: (folderPath: string, keyword: string) => ipcRenderer.invoke('search-in-files', folderPath, keyword),
  openFileLocation: (filePath: string) => ipcRenderer.invoke('open-file-location', filePath),
  openWithDefaultApp: (filePath: string) => ipcRenderer.invoke('open-with-default-app', filePath),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectVideoFile: () => ipcRenderer.invoke('select-video-files'),
  scanFolderVideos: (dirPath: string) => ipcRenderer.invoke('scan-folder-videos', dirPath),
  readVideoDirectory: (dirPath: string) => ipcRenderer.invoke('read-video-directory', dirPath),
  listDirectory: (dirPath: string) => ipcRenderer.invoke('list-directory', dirPath),
  readFileAsText: (filePath: string) => ipcRenderer.invoke('read-file-as-text', filePath),
  // 文件系统
  getUsername: () => ipcRenderer.invoke('get-username'),
  createDirectory: (dirPath: string) => ipcRenderer.invoke('create-directory', dirPath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  // ASR
  runAsr: (videoPath: string) => ipcRenderer.invoke('run-asr', videoPath),
  // 字幕缓存
  loadSubtitleCache: (videoPath: string) => ipcRenderer.invoke('load-subtitle-cache', videoPath),
  saveSubtitleCache: (videoPath: string, content: string) => ipcRenderer.invoke('save-subtitle-cache', videoPath, content)
})
