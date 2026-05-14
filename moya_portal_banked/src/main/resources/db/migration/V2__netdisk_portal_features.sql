alter table sys_user add column if not exists email varchar(128);
alter table sys_user add column if not exists phone varchar(32);
alter table sys_user add column if not exists display_name varchar(128);
alter table sys_user add column if not exists deleted boolean not null default false;
create unique index if not exists idx_sys_user_email on sys_user(email) where email is not null;
create unique index if not exists idx_sys_user_phone on sys_user(phone) where phone is not null;

alter table drive_node add column if not exists storage_object_id uuid;
alter table drive_node add column if not exists recycled_at timestamptz;
alter table drive_node add column if not exists original_parent_id uuid;
alter table drive_node add column if not exists preview_status varchar(32) not null default 'READY';

alter table upload_task add column if not exists oss_bucket varchar(128);
alter table upload_task add column if not exists oss_key varchar(1024);
alter table upload_task add column if not exists content_type varchar(128);

alter table share_link add column if not exists extract_code_hash varchar(255);
alter table share_link add column if not exists allow_preview boolean not null default true;
alter table share_link add column if not exists allow_download boolean not null default true;
alter table share_link add column if not exists canceled boolean not null default false;
alter table share_link add column if not exists updated_at timestamptz not null default now();

create table if not exists oauth_account (
    id uuid primary key,
    provider varchar(32) not null,
    openid varchar(128) not null,
    unionid varchar(128),
    user_id uuid not null references sys_user(id),
    created_at timestamptz not null default now(),
    unique(provider, openid)
);

create table if not exists storage_object (
    id uuid primary key,
    sha256 varchar(128) not null unique,
    oss_bucket varchar(128) not null,
    oss_key varchar(1024) not null,
    size_bytes bigint not null,
    content_type varchar(128),
    preview_status varchar(32) not null default 'READY',
    ref_count int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists upload_chunk (
    id uuid primary key,
    upload_task_id uuid not null references upload_task(id),
    chunk_index int not null,
    size_bytes bigint not null,
    checksum varchar(128),
    created_at timestamptz not null default now(),
    unique(upload_task_id, chunk_index)
);

create table if not exists share_item (
    id uuid primary key,
    share_link_id uuid not null references share_link(id),
    node_id uuid not null references drive_node(id)
);

create table if not exists direct_share (
    id uuid primary key,
    sender_id uuid not null references sys_user(id),
    receiver_id uuid not null references sys_user(id),
    node_id uuid not null references drive_node(id),
    status varchar(32) not null default 'PENDING',
    saved boolean not null default false,
    canceled boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_direct_share_receiver on direct_share(receiver_id, created_at);
create index if not exists idx_share_item_link on share_item(share_link_id);
create index if not exists idx_upload_chunk_task on upload_chunk(upload_task_id);

comment on table sys_user is '系统用户账号表，保存登录身份、联系方式和网盘容量';
comment on column sys_user.id is '用户唯一标识';
comment on column sys_user.username is '用户名，登录账号之一';
comment on column sys_user.password_hash is 'BCrypt 加密后的登录密码';
comment on column sys_user.email is '邮箱，登录账号和验证码目标之一';
comment on column sys_user.phone is '手机号，登录账号和验证码目标之一';
comment on column sys_user.nickname is '用户昵称';
comment on column sys_user.display_name is '展示名称，默认使用用户名';
comment on column sys_user.avatar_url is '头像地址';
comment on column sys_user.quota_total is '网盘总容量，单位字节';
comment on column sys_user.quota_used is '已使用容量，单位字节';
comment on column sys_user.status is '用户状态，1 表示启用';
comment on column sys_user.deleted is '是否软删除';
comment on column sys_user.created_at is '创建时间';
comment on column sys_user.updated_at is '更新时间';

comment on table oauth_account is '第三方 OAuth 登录账号绑定表';
comment on column oauth_account.id is 'OAuth 绑定记录唯一标识';
comment on column oauth_account.provider is '第三方平台标识，例如 wechat、github';
comment on column oauth_account.openid is '第三方平台用户 openid';
comment on column oauth_account.unionid is '第三方平台 unionid，可为空';
comment on column oauth_account.user_id is '绑定的系统用户 ID';
comment on column oauth_account.created_at is '绑定创建时间';

comment on table storage_object is '对象存储文件元数据表，用于秒传和引用计数';
comment on column storage_object.id is '存储对象唯一标识';
comment on column storage_object.sha256 is '文件 SHA-256 摘要';
comment on column storage_object.oss_bucket is 'OSS bucket 名称';
comment on column storage_object.oss_key is 'OSS object key';
comment on column storage_object.size_bytes is '文件大小，单位字节';
comment on column storage_object.content_type is '文件 MIME 类型';
comment on column storage_object.preview_status is '预览状态，默认 READY';
comment on column storage_object.ref_count is '引用该对象的网盘文件节点数量';
comment on column storage_object.created_at is '创建时间';
comment on column storage_object.updated_at is '更新时间';

comment on table drive_node is '网盘文件和文件夹统一节点表';
comment on column drive_node.id is '节点唯一标识';
comment on column drive_node.user_id is '节点所属用户 ID';
comment on column drive_node.parent_id is '父文件夹节点 ID，根目录为空';
comment on column drive_node.storage_object_id is '文件对应的存储对象 ID，文件夹为空';
comment on column drive_node.name is '节点名称';
comment on column drive_node.node_type is '节点类型，FILE 或 FOLDER';
comment on column drive_node.file_ext is '文件扩展名';
comment on column drive_node.mime_type is '文件 MIME 类型';
comment on column drive_node.size is '文件大小，文件夹为 0';
comment on column drive_node.file_hash is '文件摘要，用于秒传';
comment on column drive_node.oss_bucket is '文件所在 OSS bucket';
comment on column drive_node.oss_key is '文件所在 OSS object key';
comment on column drive_node.cover_url is '封面或缩略图地址';
comment on column drive_node.duration is '音视频时长，单位秒';
comment on column drive_node.deleted is '是否进入回收站';
comment on column drive_node.recycled_at is '进入回收站时间';
comment on column drive_node.original_parent_id is '进入回收站前的父节点 ID';
comment on column drive_node.preview_status is '预览状态';
comment on column drive_node.created_at is '创建时间';
comment on column drive_node.updated_at is '更新时间';

comment on table upload_task is '上传任务表，记录 OSS 上传会话和完成状态';
comment on column upload_task.id is '上传任务唯一标识';
comment on column upload_task.user_id is '上传用户 ID';
comment on column upload_task.parent_id is '上传完成后放入的父目录 ID';
comment on column upload_task.file_name is '上传文件名';
comment on column upload_task.file_hash is '文件摘要';
comment on column upload_task.file_size is '文件总大小，单位字节';
comment on column upload_task.chunk_size is '分片大小，单位字节';
comment on column upload_task.total_chunks is '总分片数';
comment on column upload_task.uploaded_chunks is '已登记上传分片数';
comment on column upload_task.status is '上传状态，INITIATED、UPLOADING、COMPLETED、CANCELED';
comment on column upload_task.temp_prefix is '上传临时目录前缀';
comment on column upload_task.oss_bucket is '上传目标 OSS bucket';
comment on column upload_task.oss_key is '上传目标 OSS object key';
comment on column upload_task.content_type is '文件 MIME 类型';
comment on column upload_task.created_at is '创建时间';
comment on column upload_task.updated_at is '更新时间';

comment on table upload_chunk is '上传分片登记表，用于记录已上传分片';
comment on column upload_chunk.id is '分片登记唯一标识';
comment on column upload_chunk.upload_task_id is '所属上传任务 ID';
comment on column upload_chunk.chunk_index is '分片序号，从 0 开始';
comment on column upload_chunk.size_bytes is '分片大小，单位字节';
comment on column upload_chunk.checksum is '分片校验值，可为空';
comment on column upload_chunk.created_at is '登记时间';

comment on table share_link is '公开分享链接表';
comment on column share_link.id is '分享链接唯一标识';
comment on column share_link.user_id is '分享创建人 ID';
comment on column share_link.node_id is '兼容字段，单节点分享时的节点 ID';
comment on column share_link.share_code is '公开分享码';
comment on column share_link.password is '兼容字段，明文提取码不再使用';
comment on column share_link.extract_code_hash is 'BCrypt 加密后的提取码';
comment on column share_link.expire_at is '过期时间，空表示长期有效';
comment on column share_link.status is '分享状态';
comment on column share_link.allow_preview is '是否允许公开预览';
comment on column share_link.allow_download is '是否允许公开下载';
comment on column share_link.canceled is '是否已取消';
comment on column share_link.created_at is '创建时间';
comment on column share_link.updated_at is '更新时间';

comment on table share_item is '公开分享链接包含的文件节点明细';
comment on column share_item.id is '分享条目唯一标识';
comment on column share_item.share_link_id is '所属分享链接 ID';
comment on column share_item.node_id is '被分享的网盘节点 ID';

comment on table direct_share is '站内直传分享表';
comment on column direct_share.id is '站内分享唯一标识';
comment on column direct_share.sender_id is '发送人用户 ID';
comment on column direct_share.receiver_id is '接收人用户 ID';
comment on column direct_share.node_id is '被分享的网盘节点 ID';
comment on column direct_share.status is '分享状态，PENDING、SAVED、CANCELED';
comment on column direct_share.saved is '接收人是否已保存';
comment on column direct_share.canceled is '发送人是否已取消';
comment on column direct_share.created_at is '创建时间';
comment on column direct_share.updated_at is '更新时间';
