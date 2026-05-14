package com.moya.portal.banked.drive.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("storage_object")
public class StorageObject {
	@TableId(type = IdType.INPUT)
	private UUID id;
	private String sha256;
	private String ossBucket;
	private String ossKey;
	private Long sizeBytes;
	private String contentType;
	private String previewStatus;
	private Integer refCount;
	private OffsetDateTime createdAt;
	private OffsetDateTime updatedAt;
}
