# 网盘前端实现记录

## 登录门禁

- `App.tsx` 在应用入口读取 `localStorage.access`。
- 未登录时渲染 `AuthPage`，登录、注册成功后写入 token。
- 已登录时调用 `/api/auth/me` 恢复用户信息；失败则清理 token 并回到登录页。
- 退出登录会清理 token 和 Zustand 中的网盘状态。

## 状态管理

- `cloudDriveStore.ts` 使用 Zustand 保存当前用户、当前目录、面包屑、分类、选中文件、回收站、站内分享、公开分享、上传状态和预览状态。
- `CloudDrivePage.tsx` 根据 `activeMenu` 加载对应数据：文件、回收站、分享、站内消息、账号容量、传输列表。
- 文件分类在前端按文件名和 MIME 类型过滤，不改变后端查询。

## Electron 上传链路

1. 渲染进程通过 `window.surgicol.dialog.openFiles()` 选择本地文件。
2. 调用 `window.surgicol.cloud.inspectDriveFile(filePath)` 获取文件名、大小、MIME 和 SHA-256。
3. 调用 `/api/drive/uploads/instant` 尝试秒传。
4. 未命中时创建 `/api/drive/uploads` 上传任务。
5. 调用 `/api/drive/uploads/{id}/ticket` 获取 OSS PUT 预签名 URL。
6. 调用 `window.surgicol.cloud.uploadDriveFile(filePath, options)` 由主进程上传本地文件。
7. 主进程通过 `cloud:upload-drive-file-progress` 推送进度。
8. 渲染进程登记单分片并调用 `/api/drive/uploads/{id}/complete` 完成落库。

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
