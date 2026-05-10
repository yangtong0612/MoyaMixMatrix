# Moya Mix Matrix 后端技术选型与架构设计

## 技术选型

| 方向 | 选型 | 说明 |
| --- | --- | --- |
| 语言与运行时 | Java 17 | LTS 版本，适合 Spring Boot 3 生态，性能和语法都比较稳。 |
| Web 框架 | Spring Boot 3.5.x | 负责 REST API、配置管理、依赖注入、健康检查和后续微服务扩展。 |
| 数据库 | PostgreSQL | 适合网盘系统的元数据、分享链接、上传任务、权限关系等强一致数据。 |
| 数据迁移 | Flyway | 用 SQL 版本化管理表结构，便于多人协作和环境发布。 |
| ORM/DAO | MyBatis-Plus | 保留 SQL 可控性，同时减少基础 CRUD 样板代码。 |
| 对象存储 | 阿里云 OSS | 文件本体进入 OSS，数据库只保存对象 key、hash、大小、类型等元数据。 |
| 缓存 | Redis | 用于登录态、验证码、秒传 hash 缓存、分片上传状态和限流。 |
| 安全 | Spring Security | 当前先开放基础接口，后续接入 JWT、权限注解、分享访问控制。 |
| API 文档 | springdoc-openapi | 自动生成 OpenAPI 和 Swagger UI，方便前后端联调。 |
| 测试 | JUnit 5 + Spring Boot Test | 覆盖启动上下文、核心 Controller、Service 和后续数据访问逻辑。 |

## 分层架构

```text
com.moya.portal.banked
├── common
│   ├── config          # Security、OpenAPI、全局配置
│   └── response        # 统一 API 响应结构
├── system              # 系统健康检查、版本信息、运行状态
├── storage             # OSS 抽象、预签名 URL、上传下载能力
├── drive
│   ├── controller      # 网盘文件夹、文件列表、上传入口
│   ├── dto             # 请求/响应模型
│   ├── service         # 业务编排：目录、秒传、分片、回收站
│   └── mapper/entity   # MyBatis-Plus 数据访问
└── share               # 分享链接、提取码、过期策略
```

## 核心数据模型

| 表 | 作用 |
| --- | --- |
| `sys_user` | 用户账号、昵称、头像、容量配额。 |
| `drive_node` | 文件和文件夹统一节点，保存父子目录、文件大小、hash、OSS key。 |
| `upload_task` | 分片上传任务，记录总分片、已上传分片、临时 OSS 前缀。 |
| `share_link` | 分享链接、提取码、过期时间和分享状态。 |

## 文件上传流程

1. 前端提交文件 hash、大小、名称、父目录。
2. 后端检查 `drive_node.file_hash`，命中则直接创建文件记录，实现秒传。
3. 未命中则创建 `upload_task`，返回分片上传地址或上传凭证。
4. 前端分片上传到 OSS 临时目录。
5. 后端确认全部分片后触发合并，写入正式 OSS key。
6. 后端创建 `drive_node` 记录，更新用户容量和上传任务状态。

## 当前已落地内容

- Spring Boot 3 + Java 17 项目依赖已调整。
- PostgreSQL、Flyway、Redis、Spring Security、Springdoc、阿里云 OSS 依赖已接入。
- 初始化数据库脚本已增加：用户、网盘节点、上传任务、分享链接。
- 已建立 `storage` 抽象，默认无 OSS 密钥时使用 `NoopStorageService`，便于本地测试启动。
- 已提供 `/api/system/health` 健康检查和 `/api/drive/nodes` 网盘节点接口骨架。
- 已增加 Spring Boot 测试，验证项目可以启动并访问健康检查接口。

## 下一步建议

1. 增加用户认证模块：注册、登录、JWT、刷新令牌。
2. 增加 `drive_node` 实体、Mapper、Service，并实现目录创建和列表查询。
3. 增加 OSS 直传/分片上传接口，打通真实文件上传流程。
4. 增加回收站、分享链接、容量统计和文件搜索。
5. 为核心 Service 和 Mapper 增加 Testcontainers PostgreSQL 集成测试。
