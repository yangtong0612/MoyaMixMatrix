# 网盘前端实现记录

## 登录门禁

- `App.tsx` 在应用入口读取 `localStorage.access`。
- 未登录时渲染 `AuthPage`，登录、注册成功后写入 token。
- 已登录时调用 `/api/auth/me` 恢复用户信息；失败则清理 token 并回到登录页。
- 退出登录入口位于登录后页面右上角，点击后清理 token 和 Zustand 中的网盘状态，并回到登录页。
- 登录页视觉和交互由 `src/features/cloud-drive/components/AuthPage.tsx` 与 `auth.css` 承载，样式只作用于 `.auth-*`，避免影响剪辑模块。
- 登录页品牌区复用 `src/assets/moya-matrix-logo.svg`，标题为“moya矩阵”，说明文案聚焦生成式 AI 内容商业工作流。
- `AuthPage` 支持登录、注册、找回密码三种模式；注册/找回密码发送验证码后，开发环境响应 `devCode` 时自动填入验证码。
- HTTP 拦截器遇到 `401/403` 会触发 `moya-auth-expired` 事件，`App.tsx` 统一清理 token 和网盘状态并回到登录页。

## 状态管理

- `cloudDriveStore.ts` 使用 Zustand 保存当前用户、当前目录、面包屑、分类、选中文件、回收站、站内分享、公开分享、上传状态和预览状态。
- `CloudDrivePage.tsx` 根据 `activeMenu` 加载对应数据：文件、回收站、分享、站内消息、账号容量、传输列表。
- 文件分类在前端按文件名和 MIME 类型过滤，不改变后端查询。
- 上传记录使用 `uploadStates` 保存最近上传历史，并持久化到 `localStorage` 的 `moya-cloud-drive-upload-history-v1`。
- 上传历史最多保留最近 100 条；刷新或重启后恢复历史，未完成的旧任务会标记为“上传中断”，避免显示假上传状态。

## 目录与样式规范

- 网盘业务代码集中在 `src/features/cloud-drive` 下，页面入口为 `CloudDrivePage.tsx`。
- 网盘专属样式写在 `src/features/cloud-drive/cloudDrive.css`，由 `CloudDrivePage.tsx` 引入。
- 网盘样式统一挂在 `.cloud-drive-product` 作用域下，避免影响剪辑页、设置页和全局按钮样式。
- 全局 `src/styles.css` 只保留基础变量、应用壳和历史通用样式；新增网盘视觉规则优先放在网盘目录内。
- 网盘二级侧栏使用响应式宽度和内部滚动，避免在较小窗口下撑出横向滚动或截断容量区域。
- 网盘错误提示使用 `.cloud-drive-product .toast` 固定浮层展示，不参与页面布局，避免接口错误文本挤进侧栏底部。

## 错误处理

- Axios 响应拦截器优先读取后端 `message/detail/error/reason/title`。
- 后端未返回可读错误时，`401` 兜底显示“登录已过期，请重新登录”，`403` 兜底显示“登录已过期或没有权限，请重新登录”。
- 网盘页面通过 toast 展示操作错误；403 等错误只影响提示，不改变当前页面结构。

## Electron 上传链路

1. 渲染进程通过 `window.surgicol.dialog.openFiles()` 选择本地文件。
2. 调用 `window.surgicol.cloud.inspectDriveFile(filePath)` 获取文件名、大小、MIME 和 SHA-256。
3. 调用 `/api/drive/uploads/instant` 尝试秒传。
4. 未命中时创建 `/api/drive/uploads` 上传任务。
5. 调用 `/api/drive/uploads/{id}/ticket` 获取 OSS PUT 预签名 URL。
6. 调用 `window.surgicol.cloud.uploadDriveFile(filePath, options)` 由主进程上传本地文件。
7. 主进程通过 `cloud:upload-drive-file-progress` 推送进度。
8. 渲染进程登记单分片并调用 `/api/drive/uploads/{id}/complete` 完成落库。
9. 上传状态写入传输列表历史，文件页不展示上传进度；用户点击左侧“传输列表”查看上传记录。

新增 IPC 独立于剪辑模块：

- 网盘使用 `cloud:upload-drive-file`。
- 剪辑继续使用 `media:upload-to-oss`，函数名、入参和返回结构不变。

## 文件操作

- 文件列表支持进入目录、面包屑返回、搜索、分类筛选、预览、下载、重命名、移动和删除。
- 回收站支持恢复和永久删除。
- 预览优先使用后端返回的 `previewUrl`，下载使用 `downloadUrl`；图片、视频、音频、PDF 支持内嵌预览，其它类型提示下载查看。

## 分享

- 公开分享通过 `/api/share/links` 创建，前端展示完整链接、分享码和提取码。
- 分享中心支持输入分享码和提取码查看公开分享，并保存到当前目录。
- 站内分享支持发送给用户标识、查看收件箱、保存到当前目录。
- 不添加二维码依赖，不生成二维码。

## 文档同步

- 接口记录在 `docs/frontend-netdisk-api.md`。
- 实现数据流记录在本文档。
- `docs/current-framework-analysis.md` 已补充本次 React 网盘迁移状态。
