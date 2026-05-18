alter table upload_task add column if not exists upload_id varchar(255);

alter table upload_chunk add column if not exists part_number int;
alter table upload_chunk add column if not exists etag varchar(255);

comment on column upload_task.upload_id is 'OSS multipart uploadId，用于分片上传与断点续传';
comment on column upload_chunk.part_number is 'OSS multipart partNumber，从 1 开始';
comment on column upload_chunk.etag is 'OSS 上传分片返回的 ETag';
