const { contextBridge } = require('electron');

// 暴露给渲染进程的 API（目前不需要额外功能，预留扩展）
contextBridge.exposeInMainWorld('xiaoling', {
  platform: process.platform,
  isElectron: true,
});
