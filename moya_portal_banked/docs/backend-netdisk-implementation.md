# 网盘后端实现记录

## 访问与安全

- 新增 `common.security`：`CurrentUser`、`JwtProperties`、`JwtService`、`JwtAuthenticationFilter`、`LocalDriveUserService`。
- 网盘业务改为免登录模式：无 Bearer token 时自动注入本地网盘用户 `local_drive`，前端直接进入网盘业务。
- `SecurityConfig` 保留健康检查、Swagger、公开分享查看等公开入口；网盘业务由默认本地用户承接。
- JWT 解析能力保留用于兼容旧调用，但不再暴露登录、注册和验证码控制器。
- 数据库关闭模式下，认证、网盘、上传、分享相关 Bean 通过 `moya.database.enabled=false` 不加载，保留 no-db 启动能力。

## 数据模型

- V2 迁移补齐网盘后端表结构：`storage_object`、`upload_chunk`、`share_item`、`direct_share`。
- 对 V1 已有的 `sys_user`、`drive_node`、`upload_task`、`share_link` 进行兼容扩展。
- 每张表和关键字段都使用 PostgreSQL `comment on table/column` 添加中文备注。
- 实体与 Mapper 使用 MyBatis-Plus，ID 统一 UUID，不引入参考项目的 JPA Repository。

## 文件与上传

- `DriveService` 负责目录、文件节点、回收站、容量扣减和对象引用计数。
- `UploadService` 负责秒传、OSS multipart 上传任务、分片 ETag 登记和完成上传。
- 文件本体不落本地磁盘，分片上传票据和 multipart complete/abort 复用 `OssUploadTicketService`。
- 文件预览和下载通过 `StorageService#createDownloadUrl` 生成短期访问 URL。
- 图片文件创建后由后端在事务提交后异步 best-effort 生成 JPEG 缩略图，`drive_node.cover_url` 保存缩略图 OSS object key，接口响应时再转换为短期访问 URL。
- 缩略图生成失败只记录日志，不阻塞上传完成、秒传保存或分享保存。

## 分享

- `ShareService` 支持公开分享链接和站内直传分享。
- 公开分享支持提取码、过期时间、预览/下载开关和取消。
- 保存分享时复用 `DriveService#createFileFromStorage`，统一处理容量与引用计数。
- 当前版本仅支持复制文件节点，文件夹复制保留为后续功能。

## 配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `moya.database.enabled` | `true` | 是否加载数据库相关业务 Bean |
| `moya.auth.jwt.issuer` | `moya-portal-banked` | JWT 签发方 |
| `moya.auth.jwt.secret` | `change-me-change-me-change-me-change-me` | JWT 签名密钥 |
| `moya.auth.jwt.ttl` | `PT2H` | JWT 有效期 |
| `moya.drive.default-quota-bytes` | `10737418240` | 新用户默认容量 |
