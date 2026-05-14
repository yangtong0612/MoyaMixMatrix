package com.moya.portal.banked.drive;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.moya.portal.banked.drive.dto.CompleteUploadResponse;
import com.moya.portal.banked.drive.dto.InstantUploadResponse;
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
import com.moya.portal.banked.storage.dto.OssUploadTicketRequest;
import com.moya.portal.banked.storage.dto.OssUploadTicketResponse;
import com.moya.portal.banked.user.AuthService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class UploadService {

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
		task.setContentType(command.contentType());
		task.setCreatedAt(now);
		task.setUpdatedAt(now);
		uploadTaskMapper.insert(task);
		return toView(task);
	}

	@Transactional
	public UploadTaskView registerChunk(UUID userId, UUID taskId, int chunkIndex, long sizeBytes, String checksum) {
		UploadTask task = requireTask(userId, taskId);
		if (UploadStatus.CANCELED.name().equals(task.getStatus()) || UploadStatus.COMPLETED.name().equals(task.getStatus())) {
			throw badRequest("upload task is not writable");
		}
		if (chunkIndex < 0 || chunkIndex >= task.getTotalChunks()) {
			throw badRequest("chunk index out of range");
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
			chunk.setSizeBytes(sizeBytes);
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

	public OssUploadTicketResponse createTicket(UUID userId, UUID taskId, String fileName, String contentType, long size) {
		UploadTask task = requireTask(userId, taskId);
		OssUploadTicketResponse ticket = ticketService.createTicket(new OssUploadTicketRequest(
				fileName == null ? task.getFileName() : fileName,
				contentType == null ? task.getContentType() : contentType,
				task.getTempPrefix(),
				size
		));
		task.setOssBucket(ticket.bucket());
		task.setOssKey(ticket.objectKey());
		task.setContentType(ticket.contentType());
		task.setUpdatedAt(OffsetDateTime.now());
		uploadTaskMapper.updateById(task);
		return ticket;
	}

	@Transactional
	public CompleteUploadResponse complete(UUID userId, UUID taskId, UUID parentId, String ossKey, String contentType) {
		UploadTask task = requireTask(userId, taskId);
		if (UploadStatus.CANCELED.name().equals(task.getStatus())) {
			throw badRequest("upload task is canceled");
		}
		if (task.getUploadedChunks() < task.getTotalChunks()) {
			throw badRequest("upload chunks are incomplete");
		}
		String finalOssKey = ossKey == null || ossKey.isBlank() ? task.getOssKey() : ossKey;
		if (finalOssKey == null || finalOssKey.isBlank()) {
			throw badRequest("ossKey is required");
		}
		StorageObject object = storageObjectMapper.selectOne(new LambdaQueryWrapper<StorageObject>()
				.eq(StorageObject::getSha256, task.getFileHash())
				.last("limit 1"));
		if (object == null) {
			object = new StorageObject();
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
			storageObjectMapper.insert(object);
		}
		task.setParentId(parentId);
		task.setOssKey(finalOssKey);
		task.setStatus(UploadStatus.COMPLETED.name());
		task.setUpdatedAt(OffsetDateTime.now());
		uploadTaskMapper.updateById(task);
		return new CompleteUploadResponse(toView(task), driveService.createFileFromStorage(userId, parentId, task.getFileName(), object));
	}

	@Transactional
	public UploadTaskView cancel(UUID userId, UUID taskId) {
		UploadTask task = requireTask(userId, taskId);
		task.setStatus(UploadStatus.CANCELED.name());
		task.setUpdatedAt(OffsetDateTime.now());
		uploadTaskMapper.updateById(task);
		return toView(task);
	}

	private UploadTask requireTask(UUID userId, UUID taskId) {
		UploadTask task = uploadTaskMapper.selectById(taskId);
		if (task == null || !userId.equals(task.getUserId())) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "upload task not found");
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
				task.getContentType(),
				indexes,
				task.getUpdatedAt()
		);
	}

	private ResponseStatusException badRequest(String message) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
	}

	public record InitUploadCommand(String fileName, String sha256, long totalBytes, long chunkSize, String contentType) {
	}
}
