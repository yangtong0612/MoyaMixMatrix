package com.moya.portal.banked.drive.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("upload_chunk")
public class UploadChunk {
	@TableId(type = IdType.INPUT)
	private UUID id;
	private UUID uploadTaskId;
	private Integer chunkIndex;
	private Long sizeBytes;
	private String checksum;
	private OffsetDateTime createdAt;
}
