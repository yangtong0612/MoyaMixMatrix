# 网盘前端接口记录

## 通用约定

- HTTP 封装位于 `src/shared/api/http.ts`，基础路径为 `/api`。
- 登录 token 使用 `localStorage.access`，请求拦截器自动写入 `Authorization: Bearer <token>`。
- 后端响应为 `ApiResponse<T>`，网盘 API 层统一取 `response.data` 返回给页面。
- ID 均为 UUID 字符串。

## 认证与验证码

| 页面触发 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 登录页登录 | POST | `/api/auth/login` | 用户名、邮箱或手机号登录 |
| 登录页注册 | POST | `/api/auth/register` | 注册并返回 token |
| 找回密码 | POST | `/api/auth/reset-password` | 通过验证码更新密码 |
| 应用启动/账号页 | GET | `/api/auth/me` | 获取当前用户与容量 |
| 注册/找回密码发送验证码 | POST | `/api/verification/send` | Redis 验证码，支持冷却和过期 |
| 可选校验 | POST | `/api/verification/check` | 校验并消费验证码 |

### 前端字段约定

- 登录表单提交 `{ account, password }` 到 `/api/auth/login`，成功后写入 `localStorage.access`。
- 注册表单提交 `{ username, password, email|phone, displayName, verificationChannel, verificationTarget, verificationCode }` 到 `/api/auth/register`。
- 找回密码提交 `{ verificationChannel, verificationTarget, verificationCode, newPassword }` 到 `/api/auth/reset-password`。
- 验证码发送提交 `{ scene, channel, target }` 到 `/api/verification/send`；开发环境若响应 `devCode`，登录页自动填入验证码输入框。
- `401/403` 会触发前端登录态清理，应用回到登录页。

## 文件与回收站

| 页面触发 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 文件列表/进入目录 | GET | `/api/drive/nodes?parentId=` | 查询当前目录节点 |
| 新建文件夹 | POST | `/api/drive/folders` | 在当前目录创建文件夹 |
| 重命名 | PATCH | `/api/drive/nodes/{id}/rename` | 修改文件或文件夹名称 |
| 移动 | PATCH | `/api/drive/nodes/{id}/move` | 移动到目标目录，空值表示根目录 |
| 删除 | DELETE | `/api/drive/nodes/{id}` | 放入回收站 |
| 回收站 | GET | `/api/drive/recycle-bin` | 查询已删除节点 |
| 恢复 | POST | `/api/drive/recycle-bin/{id}/restore` | 从回收站恢复 |
| 彻底删除 | DELETE | `/api/drive/recycle-bin/{id}` | 永久删除并释放容量 |

文件节点字段：`id`、`parentId`、`name`、`nodeType`、`size`、`mimeType`、`fileHash`、`ossBucket`、`ossKey`、`previewUrl`、`downloadUrl`、`coverUrl`、`updatedAt`。

## 上传

| 页面触发 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 选择本地文件后秒传 | POST | `/api/drive/uploads/instant` | 命中文件 hash 时直接创建节点 |
| 创建上传任务 | POST | `/api/drive/uploads` | 创建后端上传任务 |
| 获取 OSS 票据 | POST | `/api/drive/uploads/{id}/ticket` | 返回 PUT 预签名 URL |
| 上传完成后登记分片 | POST | `/api/drive/uploads/{id}/chunks` | 当前 Electron 链路按单分片登记 |
| 完成落库 | POST | `/api/drive/uploads/{id}/complete` | 创建存储对象和文件节点 |

Electron 新增 IPC：

- `cloud:inspect-drive-file`：读取本地文件名、大小、MIME、SHA-256。
- `cloud:upload-drive-file`：PUT 到后端返回的 OSS 预签名 URL。
- `cloud:upload-drive-file-progress`：按 `taskId` 推送进度。

剪辑模块的 `media:upload-to-oss` 保持不变。

## 分享

| 页面触发 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 创建公开分享 | POST | `/api/share/links` | 生成分享码和公开链接 |
| 通过分享码查看 | GET | `/api/share/links/public/{shareCode}` | 支持提取码参数 |
| 保存公开分享 | POST | `/api/share/links/public/{shareCode}/save` | 保存到当前目录 |
| 发送站内分享 | POST | `/api/share/direct` | 发送给用户名、邮箱、手机号或用户 UUID |
| 站内收件箱 | GET | `/api/share/direct/inbox` | 查询收到的站内分享 |
| 保存站内分享 | POST | `/api/share/direct/{id}/save` | 保存到当前目录 |

分享只展示链接、分享码、提取码和复制按钮，不生成二维码。
