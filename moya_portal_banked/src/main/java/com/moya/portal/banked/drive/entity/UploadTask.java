package com.moya.portal.banked.drive.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("upload_task")
public class UploadTask {
	@TableId(type = IdType.INPUT)
	private UUID id;
	private UUID userId;
	private UUID parentId;
	private String fileName;
	private String fileHash;
	private Long fileSize;
	private Long chunkSize;
	private Integer totalChunks;
	private Integer uploadedChunks;
	private String status;
	private String tempPrefix;
	private String ossBucket;
	private String ossKey;
	private String contentType;
	private OffsetDateTime createdAt;
	private OffsetDateTime updatedAt;
}
