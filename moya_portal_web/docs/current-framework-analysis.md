# 当前项目技术框架分析

## 总体框架

- 渲染层：Vue 3 + TypeScript + Vite。
- UI：Element Plus、Tailwind CSS、Splitpanes、自定义组件。
- 状态管理：Pinia，部分状态持久化到 localStorage 或 Electron Store。
- 桌面层：Electron 29，主进程入口是 `src/electron/main.cjs`。
- 本地能力：SQLite、ffmpeg/ffprobe、文件系统、系统信息、下载/上传队列、HTTP 本地视频流。
- API：Axios 封装在 `src/api/request.ts`，业务 API 分散在 `src/api/api/*`。
- 构建：Vite 输出到 `build`，Electron Builder 打包桌面端。

## 网盘模块

主要入口：

- 页面容器：`src/pages/cloud-dish/index.vue`
- 内容区：`src/views/cloud-dish/disk-content.vue`
- 列表视图：`src/views/cloud-dish/disk-list.vue`
- 卡片视图：`src/views/cloud-dish/components/card/index.vue`
- 传输列表：`src/views/cloud-dish/transport`
- 状态：`src/stores/cloud-disk/cloudDiskStore.ts`、`treeStructureStore.ts`
- API：`src/api/api/netdisk.ts`
- Electron 传输服务：`src/electron/clouddrive/*.cjs`

核心能力：

- 全部文件、与我共享、未发布、已发布、传输列表、标注进程、视频摘要。
- 文件/文件夹上传、下载、移动、删除、重命名、权限共享、发布视频。
- Electron 主进程负责大文件上传下载、队列、暂停恢复、本地路径处理。

## 剪辑模块

主要入口：

- 编辑器容器：`src/views/video-editor/index.vue`
- 素材：`src/views/video-editor/material.vue`
- 预览：`src/views/video-editor/preview.vue`
- 时间线编辑：`src/views/video-editor/edit.vue`
- 属性面板：`src/views/video-editor/setting.vue`
- 草稿列表：`src/pages/video-editor-draft/index.vue`
- 状态：`src/stores/videoEditor/*`
- Electron IPC：草稿、导出、素材生成、抽帧、合并、删除片段、HTTP 视频流。

核心能力：

- 剪辑/标注模式切换。
- 素材管理，支持本地素材和网盘素材。
- 预览播放器、画布标注、马赛克、文本和图片编辑。
- 多轨时间线、片段分割、合并、导出、自动保存。

## React 重构建议

- React 页面层按 feature 拆分：`cloud-drive`、`editor`、`settings`、`transfers`。
- 用 Zustand 承接 Pinia 状态，先迁移状态形状和 actions，再迁移 UI。
- Electron 主进程拆成模块：`ipc/cloudDrive`、`ipc/editor`、`services/transfer`、`services/media`。
- 渲染进程只通过 preload 暴露的安全 API 调用本地能力，不直接使用 Node。
- 网盘 API 保留现有接口路径，先用 React Query 或 Zustand action 封装请求。
- 剪辑模块先建立素材、预览、时间线、属性面板四区布局，再逐步迁移每个 store 和 IPC。
