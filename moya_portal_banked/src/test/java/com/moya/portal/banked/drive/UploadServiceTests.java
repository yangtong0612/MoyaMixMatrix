package com.moya.portal.banked.drive;

import java.util.List;
import java.util.UUID;

import com.aliyun.oss.model.PartETag;
import com.moya.portal.banked.drive.dto.CompleteUploadResponse;
import com.moya.portal.banked.drive.dto.DriveNodeView;
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
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UploadServiceTests {

	private final UploadTaskMapper uploadTaskMapper = mock(UploadTaskMapper.class);
	private final UploadChunkMapper uploadChunkMapper = mock(UploadChunkMapper.class);
	private final StorageObjectMapper storageObjectMapper = mock(StorageObjectMapper.class);
	private final DriveService driveService = mock(DriveService.class);
	private final AuthService authService = mock(AuthService.class);
	private final OssUploadTicketService ticketService = mock(OssUploadTicketService.class);
	private final StorageProperties storageProperties = mock(StorageProperties.class);
	private final UploadService uploadService = new UploadService(uploadTaskMapper, uploadChunkMapper, storageObjectMapper, driveService, authService, ticketService, storageProperties);

	@Test
	void completeReturnsExistingNodeWithoutRepeatingOssMerge() {
		UUID userId = UUID.randomUUID();
		UploadTask task = task(userId, UploadStatus.COMPLETED.name());
		DriveNodeView existing = nodeView(task);
		when(uploadTaskMapper.selectById(task.getId())).thenReturn(task);
		when(uploadChunkMapper.selectList(any())).thenReturn(List.of());
		when(driveService.findCompletedUploadNode(userId, task.getParentId(), task.getFileName(), task.getFileHash())).thenReturn(existing);

		CompleteUploadResponse response = uploadService.complete(userId, task.getId(), task.getParentId(), task.getOssKey(), task.getContentType());

		assertThat(response.file()).isEqualTo(existing);
		verify(ticketService, never()).completeMultipartUpload(any(), any(), any());
		verify(driveService, never()).createFileFromStorage(any(), any(), any(), any());
	}

	@Test
	void completeRepairsDatabaseWhenOssUploadAlreadyCompleted() {
		UUID userId = UUID.randomUUID();
		UploadTask task = task(userId, UploadStatus.UPLOADING.name());
		UploadChunk chunk = chunk(task.getId());
		DriveNodeView created = nodeView(task);
		when(uploadTaskMapper.selectById(task.getId())).thenReturn(task);
		when(uploadChunkMapper.selectList(any())).thenReturn(List.of(chunk));
		when(storageObjectMapper.selectOne(any())).thenReturn(null);
		doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "complete multipart upload failed: NoSuchUpload"))
				.when(ticketService).completeMultipartUpload(any(), any(), anyList());
		when(ticketService.objectExists(task.getOssKey())).thenReturn(true);
		when(driveService.createFileFromStorage(eq(userId), eq(task.getParentId()), eq(task.getFileName()), any(StorageObject.class))).thenReturn(created);

		CompleteUploadResponse response = uploadService.complete(userId, task.getId(), task.getParentId(), task.getOssKey(), task.getContentType());

		assertThat(response.file()).isEqualTo(created);
		assertThat(task.getStatus()).isEqualTo(UploadStatus.COMPLETED.name());
		verify(storageObjectMapper).insert(any(StorageObject.class));
		verify(uploadTaskMapper).updateById(task);
	}

	@Test
	@SuppressWarnings("unchecked")
	void completePassesMutablePartEtagsToOssMerge() {
		UUID userId = UUID.randomUUID();
		UploadTask task = task(userId, UploadStatus.UPLOADING.name());
		UploadChunk chunk = chunk(task.getId());
		StorageObject object = new StorageObject();
		object.setId(UUID.randomUUID());
		DriveNodeView created = nodeView(task);
		when(uploadTaskMapper.selectById(task.getId())).thenReturn(task);
		when(uploadChunkMapper.selectList(any())).thenReturn(List.of(chunk));
		when(storageObjectMapper.selectOne(any())).thenReturn(object);
		when(driveService.createFileFromStorage(eq(userId), eq(task.getParentId()), eq(task.getFileName()), eq(object))).thenReturn(created);

		uploadService.complete(userId, task.getId(), task.getParentId(), task.getOssKey(), task.getContentType());

		ArgumentCaptor<List<PartETag>> partETagsCaptor = ArgumentCaptor.forClass(List.class);
		verify(ticketService).completeMultipartUpload(eq(task.getOssKey()), eq(task.getUploadId()), partETagsCaptor.capture());
		partETagsCaptor.getValue().add(new PartETag(2, "etag-2"));
		assertThat(partETagsCaptor.getValue()).hasSize(2);
	}

	@Test
	void completeTranslatesQuotaFailure() {
		UUID userId = UUID.randomUUID();
		UploadTask task = task(userId, UploadStatus.COMPLETED.name());
		StorageObject object = new StorageObject();
		object.setId(UUID.randomUUID());
		when(uploadTaskMapper.selectById(task.getId())).thenReturn(task);
		when(uploadChunkMapper.selectList(any())).thenReturn(List.of());
		when(storageObjectMapper.selectOne(any())).thenReturn(object);
		doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "storage quota exceeded"))
				.when(driveService).createFileFromStorage(userId, task.getParentId(), task.getFileName(), object);

		assertThatThrownBy(() -> uploadService.complete(userId, task.getId(), task.getParentId(), task.getOssKey(), task.getContentType()))
				.isInstanceOf(ResponseStatusException.class)
				.hasMessageContaining("容量不足，无法完成上传");
	}

	private UploadTask task(UUID userId, String status) {
		UploadTask task = new UploadTask();
		task.setId(UUID.randomUUID());
		task.setUserId(userId);
		task.setParentId(null);
		task.setFileName("demo.jpg");
		task.setFileHash("sha256");
		task.setFileSize(12L);
		task.setChunkSize(12L);
		task.setTotalChunks(1);
		task.setUploadedChunks(1);
		task.setStatus(status);
		task.setOssBucket("bucket");
		task.setOssKey("drive/demo.jpg");
		task.setUploadId("upload-id");
		task.setContentType("image/jpeg");
		return task;
	}

	private UploadChunk chunk(UUID taskId) {
		UploadChunk chunk = new UploadChunk();
		chunk.setId(UUID.randomUUID());
		chunk.setUploadTaskId(taskId);
		chunk.setChunkIndex(0);
		chunk.setPartNumber(1);
		chunk.setSizeBytes(12L);
		chunk.setEtag("etag");
		return chunk;
	}

	private DriveNodeView nodeView(UploadTask task) {
		return new DriveNodeView(UUID.randomUUID(), task.getParentId(), task.getFileName(), "FILE", task.getFileSize(), task.getContentType(), task.getFileHash(), task.getOssBucket(), task.getOssKey(), null, null, null, null);
	}
}
