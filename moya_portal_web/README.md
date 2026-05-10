# SurgiCol Electron React

这是基于当前 `sy_portal_web` 技术栈分析后生成的 Electron + React 重构项目骨架，优先覆盖网盘和剪辑两个核心模块。

## 技术栈

- Electron 29
- React 18
- Vite 5
- TypeScript
- React Router
- Zustand
- Axios
- lucide-react

## 目录

```text
electron/
  main.cjs          Electron 主进程，注册窗口和基础 IPC
  preload.cjs       安全暴露给 React 的桌面 API
src/
  app/              应用壳和路由
  features/
    cloud-drive/    网盘模块
    editor/         剪辑模块
  shared/           公共 API、类型
docs/
  current-framework-analysis.md
```

## 启动

当前机器环境里没有可用的 `npm/yarn/pnpm` 命令。安装 Node 包管理器后，在本目录执行：

```bash
npm install
npm run dev
```

开发端口是 `5174`，Electron 会加载 `http://localhost:5174`。

## 已生成内容

- 网盘：菜单、搜索、刷新、文件表格、上传任务入口、传输列表。
- 剪辑：素材区、预览区、播放器工具条、时间线、属性面板、剪辑/标注模式。
- Electron：安全 preload API、文件选择、目录选择、Store、草稿、传输任务基础 IPC。
- 文档：现有 Vue/Electron 项目的技术框架和迁移边界分析。
