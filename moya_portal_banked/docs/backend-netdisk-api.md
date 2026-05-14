# 网盘后端接口文档

## 通用约定

- 统一响应：所有业务接口返回 `ApiResponse<T>`，成功时 `success=true`、`code=OK`。
- 鉴权方式：除认证、验证码、健康检查、公开分享查看外，其余接口使用 `Authorization: Bearer <token>`。
- ID 类型：用户、文件节点、上传任务、分享记录均使用 UUID。
- 文件本体：由 OSS 保存，后端保存元数据、容量、权限、上传票据和访问 URL。

## 认证接口

| 方法 | 路径 | 鉴权 | 功能 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | 否 | 用户注册，支持邮箱/手机号验证码校验 |
| POST | `/api/auth/login` | 否 | 用户名、邮箱或手机号登录 |
| POST | `/api/auth/reset-password` | 否 | 通过验证码重置密码 |
| POST | `/api/auth/oauth/login` | 否 | 第三方 OAuth 登录或自动建号 |
| GET | `/api/auth/me` | 是 | 查询当前用户与容量 |

### 注册

请求字段：`username`、`password` 必填；`email`、`phone`、`displayName` 可选；如传 `verificationCode`，会按 `verificationChannel` + `verificationTarget` 校验 Redis 验证码。

响应字段：`token`、`userId`、`username`。

错误场景：用户名/邮箱/手机号重复、验证码错误或过期、请求参数为空。

## 验证码接口

| 方法 | 路径 | 鉴权 | 功能 |
| --- | --- | --- | --- |
| POST | `/api/verification/send` | 否 | 发送验证码 |
| POST | `/api/verification/check` | 否 | 校验并消费验证码 |

验证码使用 Redis 存储，key 按 `scene:channel:target` 维度隔离：

- 验证码默认 5 分钟过期。
- 同一目标默认 1 分钟内只能发送一次。
- 默认最多校验 5 次，超过后要求重新获取。
- 多实例部署时共享 Redis 状态。

## 网盘文件接口

| 方法 | 路径 | 鉴权 | 功能 |
| --- | --- | --- | --- |
| GET | `/api/drive/nodes?parentId=` | 是 | 查询目录下节点 |
| GET | `/api/drive/nodes/{id}` | 是 | 查询节点详情 |
| POST | `/api/drive/folders` | 是 | 创建文件夹 |
| PATCH | `/api/drive/nodes/{id}/rename` | 是 | 重命名 |
| PATCH | `/api/drive/nodes/{id}/move` | 是 | 移动节点 |
| DELETE | `/api/drive/nodes/{id}` | 是 | 放入回收站 |
| GET | `/api/drive/recycle-bin` | 是 | 查询回收站 |
| POST | `/api/drive/recycle-bin/{id}/restore` | 是 | 恢复节点 |
| DELETE | `/api/drive/recycle-bin/{id}` | 是 | 永久删除 |

节点响应字段：`id`、`parentId`、`name`、`nodeType`、`size`、`mimeType`、`fileHash`、`ossBucket`、`ossKey`、`previewUrl`、`downloadUrl`、`coverUrl`、`updatedAt`。

错误场景：父节点不存在、父节点不是文件夹、节点不存在、操作其他用户节点、移动到自身、永久删除非回收站节点。

## 上传接口

| 方法 | 路径 | 鉴权 | 功能 |
| --- | --- | --- | --- |
| POST | `/api/drive/uploads/instant` | 是 | 秒传检查并创建文件节点 |
| POST | `/api/drive/uploads` | 是 | 创建上传任务 |
| POST | `/api/drive/uploads/{id}/ticket` | 是 | 为任务生成 OSS PUT 上传票据 |
| POST | `/api/drive/uploads/{id}/chunks` | 是 | 登记已上传分片 |
| GET | `/api/drive/uploads/{id}` | 是 | 查询上传进度 |
| POST | `/api/drive/uploads/{id}/complete` | 是 | 完成上传并创建文件节点 |
| PATCH | `/api/drive/uploads/{id}/cancel` | 是 | 取消上传 |

上传任务响应字段：`id`、`fileName`、`fileHash`、`fileSize`、`chunkSize`、`totalChunks`、`uploadedChunks`、`status`、`ossBucket`、`ossKey`、`contentType`、`uploadedIndexes`、`updatedAt`。

完成上传后，后端创建 `storage_object` 和 `drive_node`，并更新用户容量和对象引用计数。

## 分享接口

| 方法 | 路径 | 鉴权 | 功能 |
| --- | --- | --- | --- |
| POST | `/api/share/links` | 是 | 创建公开分享链接 |
| GET | `/api/share/links/public/{shareCode}` | 否 | 公开查看分享 |
| POST | `/api/share/links/public/{shareCode}/save` | 是 | 保存公开分享条目 |
| DELETE | `/api/share/links/{id}` | 是 | 取消公开分享 |
| POST | `/api/share/direct` | 是 | 发送站内直传分享 |
| GET | `/api/share/direct/inbox` | 是 | 查询站内分享收件箱 |
| POST | `/api/share/direct/{id}/save` | 是 | 保存站内分享 |
| DELETE | `/api/share/direct/{id}` | 是 | 取消站内分享 |

错误场景：提取码错误、分享过期、分享已取消、保存文件夹分享、接收人不存在、分享给自己、操作其他用户分享。
