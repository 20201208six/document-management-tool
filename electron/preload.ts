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
  openWithDefaultApp: (filePath: string) => ipcRenderer.invoke('open-with-default-app', filePath)
})
