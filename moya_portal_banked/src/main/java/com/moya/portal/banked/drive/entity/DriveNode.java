package com.moya.portal.banked.drive.entity;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("drive_node")
public class DriveNode {
	@TableId(type = IdType.INPUT)
	private UUID id;
	private UUID userId;
	private UUID parentId;
	private UUID storageObjectId;
	private String name;
	private String nodeType;
	private String fileExt;
	private String mimeType;
	private Long size;
	private String fileHash;
	private String ossBucket;
	private String ossKey;
	private String coverUrl;
	private BigDecimal duration;
	private Boolean deleted;
	private OffsetDateTime recycledAt;
	private UUID originalParentId;
	private String previewStatus;
	private OffsetDateTime createdAt;
	private OffsetDateTime updatedAt;
}
