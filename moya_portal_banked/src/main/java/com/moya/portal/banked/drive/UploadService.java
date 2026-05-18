package com.moya.portal.banked.drive;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.moya.portal.banked.drive.dto.CompleteUploadResponse;
import com.moya.portal.banked.drive.dto.DriveNodeView;
import com.moya.portal.banked.drive.dto.InstantUploadResponse;
import com.moya.portal.banked.drive.dto.UploadPartTicketResponse;
import com.moya.portal.banked.drive.dto.UploadTaskView;
import com.moya.portal.banked.drive.entity.StorageObject;
import com.moya.portal.banked.drive.entity.UploadChunk;
import com.moya.portal.banked.drive.entity.UploadTask;
import com.moya.portal.banked.drive.enums.UploadStatus;
import com.moya.portal.banked.drive.mapper.StorageObjectMapper;
import com.moya.portal.banked.drive.mapper.UploadChunkMapper;
import com.moya.portal.banked.drive.mapper.UploadTaskMapper;
import com.moya.portal.banked.storage.OssUploadTicketService;
import com.moya.portal.banked.storage.StorageProperties;
import com.moya.portal.banked.user.AuthService;
import com.aliyun.oss.model.PartETag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class UploadService {

	private static final Logger log = LoggerFactory.getLogger(UploadService.class);

	private final UploadTaskMapper uploadTaskMapper;
	private final UploadChunkMapper uploadChunkMapper;
	private final StorageObjectMapper storageObjectMapper;
	private final DriveService driveService;
	private final AuthService authService;
	private final OssUploadTicketService ticketService;
	private final StorageProperties storageProperties;

	public UploadService(
			UploadTaskMapper uploadTaskMapper,
			UploadChunkMapper uploadChunkMapper,
			StorageObjectMapper storageObjectMapper,
			DriveService driveService,
			AuthService authService,
			OssUploadTicketService ticketService,
			StorageProperties storageProperties
	) {
		this.uploadTaskMapper = uploadTaskMapper;
		this.uploadChunkMapper = uploadChunkMapper;
		this.storageObjectMapper = storageObjectMapper;
		this.driveService = driveService;
		this.authService = authService;
		this.ticketService = ticketService;
		this.storageProperties = storageProperties;
	}

	@Transactional
	public InstantUploadResponse instantUpload(UUID userId, UUID parentId, String fileName, String sha256) {
		StorageObject object = storageObjectMapper.selectOne(new LambdaQueryWrapper<StorageObject>()
				.eq(StorageObject::getSha256, sha256)
				.last("limit 1"));
		if (object == null) {
			return new InstantUploadResponse(false, null);
		}
		return new InstantUploadResponse(true, driveService.createFileFromStorage(userId, parentId, fileName, object));
	}

	@Transactional
	public UploadTaskView init(UUID userId, InitUploadCommand command) {
		authService.requireUser(userId);
		if (command.totalBytes() <= 0) {
			throw badRequest("暂不支持上传空文件");
		}
		if (command.chunkSize() <= 0) {
			throw badRequest("上传分片大小无效");
		}
		OssUploadTicketService.MultipartUploadInit upload = ticketService.createMultipartUpload(
				command.fileName(),
				command.contentType(),
				"drive-files"
		);
		OffsetDateTime now = OffsetDateTime.now();
		UploadTask task = new UploadTask();
		task.setId(UUID.randomUUID());
		task.setUserId(userId);
		task.setFileName(command.fileName());
		task.setFileHash(command.sha256());
		task.setFileSize(command.totalBytes());
		task.setChunkSize(command.chunkSize());
		task.setTotalChunks((int) Math.ceil((double) command.totalBytes() / command.chunkSize()));
		task.setUploadedChunks(0);
		task.setStatus(UploadStatus.INITIATED.name());
		task.setTempPrefix("drive/uploads/" + userId + "/" + task.getId());
		task.setOssBucket(upload.bucket());
		task.setOssKey(upload.objectKey());
		task.setUploadId(upload.uploadId());
		task.setContentType(upload.contentType());
		task.setCreatedAt(now);
		task.setUpdatedAt(now);
		uploadTaskMapper.insert(task);
		return toView(task);
	}

	@Transactional
	public UploadTaskView registerChunk(UUID userId, UUID taskId, int chunkIndex, Integer partNumber, long sizeBytes, String etag, String checksum) {
		UploadTask task = requireTask(userId, taskId);
		if (UploadStatus.CANCELED.name().equals(task.getStatus()) || UploadStatus.COMPLETED.name().equals(task.getStatus())) {
			throw badRequest("上传任务已结束，不能继续写入");
		}
		if (chunkIndex < 0 || chunkIndex >= task.getTotalChunks()) {
			throw badRequest("上传分片序号无效");
		}
		int finalPartNumber = partNumber == null ? chunkIndex + 1 : partNumber;
		if (finalPartNumber != chunkIndex + 1) {
			throw badRequest("上传分片编号不匹配");
		}
		if (etag == null || etag.isBlank()) {
			throw badRequest("上传分片缺少 ETag，请继续重试");
		}
		UploadChunk exists = uploadChunkMapper.selectOne(new LambdaQueryWrapper<UploadChunk>()
				.eq(UploadChunk::getUploadTaskId, taskId)
				.eq(UploadChunk::getChunkIndex, chunkIndex)
				.last("limit 1"));
		if (exists == null) {
			UploadChunk chunk = new UploadChunk();
			chunk.setId(UUID.randomUUID());
			chunk.setUploadTaskId(taskId);
			chunk.setChunkIndex(chunkIndex);
			chunk.setPartNumber(finalPartNumber);
			chunk.setSizeBytes(sizeBytes);
			chunk.setEtag(normalizeEtag(etag));
			chunk.setChecksum(checksum);
			chunk.setCreatedAt(OffsetDateTime.now());
			uploadChunkMapper.insert(chunk);
			task.setUploadedChunks(task.getUploadedChunks() + 1);
			task.setStatus(UploadStatus.UPLOADING.name());
			task.setUpdatedAt(OffsetDateTime.now());
			uploadTaskMapper.updateById(task);
		}
		return toView(requireTask(userId, taskId));
	}

	public UploadTaskView progress(UUID userId, UUID taskId) {
		return toView(requireTask(userId, taskId));
	}

	public UploadPartTicketResponse createTicket(UUID userId, UUID taskId, Integer chunkIndex, Integer partNumber, long size) {
		UploadTask task = requireTask(userId, taskId);
		if (UploadStatus.CANCELED.name().equals(task.getStatus()) || UploadStatus.COMPLETED.name().equals(task.getStatus())) {
			throw badRequest("上传任务已结束，不能继续写入");
		}
		int finalChunkIndex = chunkIndex == null ? 0 : chunkIndex;
		if (finalChunkIndex < 0 || finalChunkIndex >= task.getTotalChunks()) {
			throw badRequest("上传分片序号无效");
		}
		int finalPartNumber = partNumber == null ? finalChunkIndex + 1 : partNumber;
		if (finalPartNumber != finalChunkIndex + 1) {
			throw badRequest("上传分片编号不匹配");
		}
		long start = task.getChunkSize() * finalChunkIndex;
		long expectedSize = Math.min(task.getChunkSize(), task.getFileSize() - start);
		if (size != expectedSize) {
			throw badRequest("上传分片大小不匹配，请继续重试");
		}
		String uploadUrl = ticketService.createUploadPartUrl(task.getOssKey(), task.getUploadId(), finalPartNumber, task.getContentType()).toString();
		return new UploadPartTicketResponse(
				uploadUrl,
				task.getOssBucket(),
				task.getOssKey(),
				task.getUploadId(),
				finalChunkIndex,
				finalPartNumber,
				start,
				start + expectedSize - 1,
				expectedSize,
				task.getContentType(),
				ticketService.ticketExpiresAt()
		);
	}

	@Transactional
	public CompleteUploadResponse complete(UUID userId, UUID taskId, UUID parentId, String ossKey, String contentType) {
		UploadTask task = requireTask(userId, taskId);
		if (UploadStatus.CANCELED.name().equals(task.getStatus())) {
			throw badRequest("上传任务已取消，请重新上传");
		}
		UUID finalParentId = UploadStatus.COMPLETED.name().equals(task.getStatus()) ? task.getParentId() : parentId;
		if (UploadStatus.COMPLETED.name().equals(task.getStatus())) {
			DriveNodeView existingFile = driveService.findCompletedUploadNode(userId, finalParentId, task.getFileName(), task.getFileHash());
			if (existingFile != null) {
				return new CompleteUploadResponse(toView(task), existingFile);
			}
		}
		if (task.getUploadedChunks() < task.getTotalChunks()) {
			throw badRequest("上传分片不完整，请点击继续重试");
		}
		String finalOssKey = ossKey == null || ossKey.isBlank() ? task.getOssKey() : ossKey;
		if (finalOssKey == null || finalOssKey.isBlank()) {
			throw badRequest("上传对象信息缺失，请重新上传");
		}
		if (!UploadStatus.COMPLETED.name().equals(task.getStatus()) && task.getUploadId() != null && !task.getUploadId().isBlank()) {
			try {
				ticketService.completeMultipartUpload(finalOssKey, task.getUploadId(), requirePartEtags(task, taskId));
			} catch (ResponseStatusException ex) {
				if (!isNoSuchUpload(ex) || !ticketService.objectExists(finalOssKey)) {
					log.warn("Drive multipart complete failed, taskId={}, objectKey={}, uploadId={}", taskId, finalOssKey, task.getUploadId(), ex);
					throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OSS 合并失败，请稍后继续上传", ex);
				}
			} catch (RuntimeException ex) {
				log.warn("Drive multipart complete failed, taskId={}, objectKey={}, uploadId={}", taskId, finalOssKey, task.getUploadId(), ex);
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OSS 合并失败，请稍后继续上传", ex);
			}
		}
		StorageObject object = findStorageObject(task.getFileHash());
		if (object == null) {
			object = buildStorageObject(task, finalOssKey, contentType);
			storageObjectMapper.insert(object);
		}
		task.setParentId(finalParentId);
		task.setOssKey(finalOssKey);
		task.setStatus(UploadStatus.COMPLETED.name());
		task.setUpdatedAt(OffsetDateTime.now());
		uploadTaskMapper.updateById(task);
		try {
			return new CompleteUploadResponse(toView(task), driveService.createFileFromStorage(userId, finalParentId, task.getFileName(), object));
		} catch (ResponseStatusException ex) {
			log.warn("Drive upload finalize failed, taskId={}, parentId={}, objectKey={}", taskId, finalParentId, finalOssKey, ex);
			throw translateCompleteFailure(ex);
		}
	}

	@Transactional(noRollbackFor = ResponseStatusException.class)
	public UploadTaskView cancel(UUID userId, UUID taskId) {
		UploadTask task = requireTask(userId, taskId);
		ResponseStatusException abortFailure = null;
		try {
			ticketService.abortMultipartUpload(task.getOssKey(), task.getUploadId());
		} catch (ResponseStatusException ex) {
			abortFailure = ex;
		}
		task.setStatus(UploadStatus.CANCELED.name());
		task.setUpdatedAt(OffsetDateTime.now());
		uploadTaskMapper.updateById(task);
		if (abortFailure != null) {
			throw abortFailure;
		}
		return toView(task);
	}

	private UploadTask requireTask(UUID userId, UUID taskId) {
		UploadTask task = uploadTaskMapper.selectById(taskId);
		if (task == null || !userId.equals(task.getUserId())) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "上传任务已失效，请重新上传");
		}
		return task;
	}

	private UploadTaskView toView(UploadTask task) {
		List<Integer> indexes = uploadChunkMapper.selectList(new LambdaQueryWrapper<UploadChunk>()
						.eq(UploadChunk::getUploadTaskId, task.getId())
						.orderByAsc(UploadChunk::getChunkIndex))
				.stream()
				.map(UploadChunk::getChunkIndex)
				.toList();
		return new UploadTaskView(
				task.getId(),
				task.getFileName(),
				task.getFileHash(),
				task.getFileSize(),
				task.getChunkSize(),
				task.getTotalChunks(),
				task.getUploadedChunks(),
				task.getStatus(),
				task.getOssBucket(),
				task.getOssKey(),
				task.getUploadId(),
				task.getContentType(),
				indexes,
				task.getUpdatedAt()
		);
	}

	private List<PartETag> requirePartEtags(UploadTask task, UUID taskId) {
		List<UploadChunk> chunks = uploadChunkMapper.selectList(new LambdaQueryWrapper<UploadChunk>()
				.eq(UploadChunk::getUploadTaskId, taskId)
				.orderByAsc(UploadChunk::getPartNumber));
		List<PartETag> partETags = new ArrayList<>(chunks.size());
		for (UploadChunk chunk : chunks) {
			partETags.add(new PartETag(chunk.getPartNumber(), chunk.getEtag()));
		}
		if (partETags.size() < task.getTotalChunks()) {
			throw badRequest("上传分片不完整，请点击继续重试");
		}
		return partETags;
	}

	private StorageObject findStorageObject(String sha256) {
		return storageObjectMapper.selectOne(new LambdaQueryWrapper<StorageObject>()
				.eq(StorageObject::getSha256, sha256)
				.last("limit 1"));
	}

	private StorageObject buildStorageObject(UploadTask task, String finalOssKey, String contentType) {
		StorageObject object = new StorageObject();
		object.setId(UUID.randomUUID());
		object.setSha256(task.getFileHash());
		object.setOssBucket(task.getOssBucket() == null ? storageProperties.getOss().getBucket() : task.getOssBucket());
		object.setOssKey(finalOssKey);
		object.setSizeBytes(task.getFileSize());
		object.setContentType(contentType == null ? task.getContentType() : contentType);
		object.setPreviewStatus("READY");
		object.setRefCount(0);
		object.setCreatedAt(OffsetDateTime.now());
		object.setUpdatedAt(OffsetDateTime.now());
		return object;
	}

	private boolean isNoSuchUpload(ResponseStatusException ex) {
		String reason = ex.getReason() == null ? "" : ex.getReason();
		String message = ex.getMessage() == null ? "" : ex.getMessage();
		return reason.contains("NoSuchUpload") || message.contains("NoSuchUpload");
	}

	private ResponseStatusException translateCompleteFailure(ResponseStatusException ex) {
		String reason = ex.getReason() == null ? "" : ex.getReason();
		if (reason.contains("storage quota exceeded")) {
			return new ResponseStatusException(HttpStatus.FORBIDDEN, "容量不足，无法完成上传", ex);
		}
		if (reason.contains("user not found")) {
			return new ResponseStatusException(HttpStatus.NOT_FOUND, "上传账号不存在或已失效", ex);
		}
		return ex;
	}

	private String normalizeEtag(String etag) {
		return etag == null ? null : etag.replace("\"", "").trim();
	}

	private ResponseStatusException badRequest(String message) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
	}

	public record InitUploadCommand(String fileName, String sha256, long totalBytes, long chunkSize, String contentType) {
	}
}
