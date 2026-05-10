create table if not exists sys_user (
    id uuid primary key,
    username varchar(64) not null unique,
    password_hash varchar(255) not null,
    nickname varchar(64),
    avatar_url varchar(512),
    quota_total bigint not null default 0,
    quota_used bigint not null default 0,
    status smallint not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists drive_node (
    id uuid primary key,
    user_id uuid not null,
    parent_id uuid,
    name varchar(255) not null,
    node_type varchar(16) not null,
    file_ext varchar(32),
    mime_type varchar(128),
    size bigint not null default 0,
    file_hash varchar(128),
    oss_bucket varchar(128),
    oss_key varchar(1024),
    cover_url varchar(1024),
    duration numeric(12, 3),
    deleted boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_drive_node_user_parent on drive_node(user_id, parent_id);
create index if not exists idx_drive_node_hash on drive_node(file_hash);

create table if not exists upload_task (
    id uuid primary key,
    user_id uuid not null,
    parent_id uuid,
    file_name varchar(255) not null,
    file_hash varchar(128) not null,
    file_size bigint not null,
    chunk_size bigint not null,
    total_chunks int not null,
    uploaded_chunks int not null default 0,
    status varchar(32) not null,
    temp_prefix varchar(1024) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists share_link (
    id uuid primary key,
    user_id uuid not null,
    node_id uuid not null,
    share_code varchar(32) not null unique,
    password varchar(64),
    expire_at timestamptz,
    status varchar(32) not null,
    created_at timestamptz not null default now()
);
