# 网盘后端接口文档

## 通用约定

- 统一响应：所有业务接口返回 `ApiResponse<T>`，成功时 `success=true`、`code=OK`。
- 访问方式：网盘业务默认使用本地内置用户，不再暴露登录、注册、验证码流程；健康检查和公开分享查看仍可直接访问。
- ID 类型：用户、文件节点、上传任务、分享记录均使用 UUID。
- 文件本体：由 OSS 保存，后端保存元数据、容量、权限、上传票据和访问 URL。

## 网盘文件接口

| 方法 | 路径 | 登录 | 功能 |
| --- | --- | --- | --- |
| GET | `/api/drive/me` | 否 | 查询本地网盘空间信息 |
| GET | `/api/drive/nodes?parentId=` | 否 | 查询目录下节点 |
| GET | `/api/drive/nodes/{id}` | 否 | 查询节点详情 |
| POST | `/api/drive/folders` | 否 | 创建文件夹 |
| PATCH | `/api/drive/nodes/{id}/rename` | 否 | 重命名 |
| PATCH | `/api/drive/nodes/{id}/move` | 否 | 移动节点 |
| DELETE | `/api/drive/nodes/{id}` | 否 | 放入回收站 |
| GET | `/api/drive/recycle-bin` | 否 | 查询回收站 |
| POST | `/api/drive/recycle-bin/{id}/restore` | 否 | 恢复节点 |
| DELETE | `/api/drive/recycle-bin/{id}` | 否 | 永久删除 |

节点响应字段：`id`、`parentId`、`name`、`nodeType`、`size`、`mimeType`、`fileHash`、`ossBucket`、`ossKey`、`previewUrl`、`downloadUrl`、`coverUrl`、`updatedAt`。

`previewUrl`、`downloadUrl` 和 `coverUrl` 均为短期访问 URL；图片上传后后端会异步尽量生成独立缩略图，生成成功时 `coverUrl` 指向缩略图，生成中、生成失败或非图片文件时为空。

错误场景：父节点不存在、父节点不是文件夹、节点不存在、操作其他用户节点、移动到自身、永久删除非回收站节点。

## 上传接口

| 方法 | 路径 | 登录 | 功能 |
| --- | --- | --- | --- |
| POST | `/api/drive/uploads/instant` | 否 | 秒传检查并创建文件节点 |
| POST | `/api/drive/uploads` | 否 | 创建 OSS multipart 上传任务 |
| POST | `/api/drive/uploads/{id}/ticket` | 否 | 为指定分片生成 OSS PUT 上传票据 |
| POST | `/api/drive/uploads/{id}/chunks` | 否 | 登记已上传分片 ETag |
| GET | `/api/drive/uploads/{id}` | 否 | 查询上传进度 |
| POST | `/api/drive/uploads/{id}/complete` | 否 | 完成上传并创建文件节点 |
| PATCH | `/api/drive/uploads/{id}/cancel` | 否 | 取消上传 |

上传任务响应字段：`id`、`fileName`、`fileHash`、`fileSize`、`chunkSize`、`totalChunks`、`uploadedChunks`、`status`、`ossBucket`、`ossKey`、`uploadId`、`contentType`、`uploadedIndexes`、`updatedAt`。

完成上传时，后端使用已登记的分片 ETag 调 OSS `completeMultipartUpload`，再创建 `storage_object` 和 `drive_node`，并更新用户容量和对象引用计数。取消上传会尝试 abort OSS multipart。

## 分享接口

| 方法 | 路径 | 登录 | 功能 |
| --- | --- | --- | --- |
| POST | `/api/share/links` | 否 | 创建公开分享链接 |
| GET | `/api/share/links/public/{shareCode}` | 否 | 公开查看分享 |
| POST | `/api/share/links/public/{shareCode}/save` | 否 | 保存公开分享条目 |
| DELETE | `/api/share/links/{id}` | 否 | 取消公开分享 |
| POST | `/api/share/direct` | 否 | 发送站内直传分享 |
| GET | `/api/share/direct/inbox` | 否 | 查询站内分享收件箱 |
| POST | `/api/share/direct/{id}/save` | 否 | 保存站内分享 |
| DELETE | `/api/share/direct/{id}` | 否 | 取消站内分享 |

错误场景：提取码错误、分享过期、分享已取消、保存文件夹分享、接收人不存在、分享给自己、操作其他用户分享。
