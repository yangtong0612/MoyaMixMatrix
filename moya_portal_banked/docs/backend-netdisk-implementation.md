# 网盘后端实现记录

## 认证与安全

- 新增 `common.security`：`CurrentUser`、`JwtProperties`、`JwtService`、`JwtAuthenticationFilter`。
- `SecurityConfig` 切换为无状态 JWT 鉴权，公开健康检查、认证、验证码、Swagger 和公开分享查看。
- 密码使用 BCrypt 存储，JWT 使用 HS256 签名，配置前缀为 `moya.auth.jwt`。
- 数据库关闭模式下，认证、网盘、上传、分享相关 Bean 通过 `moya.database.enabled=false` 不加载，保留 no-db 启动能力。

## 验证码

- `VerificationCodeClient` 抽象验证码发送和消费。
- Redis 实现使用 `StringRedisTemplate`，验证码、发送冷却、校验次数分别独立 key。
- 默认 TTL 为 5 分钟，发送冷却为 1 分钟，最多校验 5 次。
- 无 RedisTemplate 时加载本地备用实现，便于 no-db/no-redis 测试启动。

## 数据模型

- V2 迁移补齐网盘后端表结构：`oauth_account`、`storage_object`、`upload_chunk`、`share_item`、`direct_share`。
- 对 V1 已有的 `sys_user`、`drive_node`、`upload_task`、`share_link` 进行兼容扩展。
- 每张表和关键字段都使用 PostgreSQL `comment on table/column` 添加中文备注。
- 实体与 Mapper 使用 MyBatis-Plus，ID 统一 UUID，不引入参考项目的 JPA Repository。

## 文件与上传

- `DriveService` 负责目录、文件节点、回收站、容量扣减和对象引用计数。
- `UploadService` 负责秒传、上传任务、分片登记、OSS 上传票据和完成上传。
- 文件本体不落本地磁盘，上传票据复用已有 `OssUploadTicketService`。
- 文件预览和下载通过 `StorageService#createDownloadUrl` 生成短期访问 URL。

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
| `moya.verification.ttl` | `PT5M` | 验证码有效期 |
| `moya.verification.send-cooldown` | `PT1M` | 同一目标发送冷却 |
| `moya.verification.max-check-attempts` | `5` | 最大校验次数 |
