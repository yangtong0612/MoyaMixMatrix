package com.moya.portal.banked.drive;

import java.net.URL;
import java.util.List;
import java.util.UUID;

import com.moya.portal.banked.drive.entity.DriveNode;
import com.moya.portal.banked.drive.entity.StorageObject;
import com.moya.portal.banked.drive.enums.NodeType;
import com.moya.portal.banked.drive.mapper.DriveNodeMapper;
import com.moya.portal.banked.drive.mapper.StorageObjectMapper;
import com.moya.portal.banked.storage.StorageService;
import com.moya.portal.banked.user.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DriveServiceTests {

	private final DriveNodeMapper driveNodeMapper = mock(DriveNodeMapper.class);
	private final StorageObjectMapper storageObjectMapper = mock(StorageObjectMapper.class);
	private final AuthService authService = mock(AuthService.class);
	private final StorageService storageService = mock(StorageService.class);
	private final ThumbnailService thumbnailService = mock(ThumbnailService.class);
	private final DriveService driveService = new DriveService(driveNodeMapper, storageObjectMapper, authService, storageService, thumbnailService);

	@Test
	void createFolderRejectsDuplicateNameInSameParent() {
		UUID userId = UUID.randomUUID();
		when(driveNodeMapper.selectCount(any())).thenReturn(1L);

		assertThatThrownBy(() -> driveService.createFolder(userId, null, "same"))
				.isInstanceOf(ResponseStatusException.class)
				.hasMessageContaining("当前目录已存在同名文件或文件夹");
	}

	@Test
	void renameRejectsDuplicateNameInSameParent() {
		UUID userId = UUID.randomUUID();
		DriveNode file = file(userId, UUID.randomUUID(), null, 12L);
		when(driveNodeMapper.selectById(file.getId())).thenReturn(file);
		when(driveNodeMapper.selectCount(any())).thenReturn(1L);

		assertThatThrownBy(() -> driveService.rename(userId, file.getId(), "same.txt"))
				.isInstanceOf(ResponseStatusException.class)
				.hasMessageContaining("当前目录已存在同名文件或文件夹");
	}

	@Test
	void moveRejectsFolderDescendantAsTarget() {
		UUID userId = UUID.randomUUID();
		DriveNode parent = folder(userId, UUID.randomUUID(), null);
		DriveNode child = folder(userId, UUID.randomUUID(), parent.getId());
		when(driveNodeMapper.selectById(parent.getId())).thenReturn(parent);
		when(driveNodeMapper.selectById(child.getId())).thenReturn(child);

		assertThatThrownBy(() -> driveService.move(userId, parent.getId(), child.getId()))
				.isInstanceOf(ResponseStatusException.class)
				.hasMessageContaining("cannot move folder into its descendant");
	}

	@Test
	void recycleFolderMarksChildrenDeletedWithoutFlatteningTree() {
		UUID userId = UUID.randomUUID();
		DriveNode folder = folder(userId, UUID.randomUUID(), null);
		DriveNode file = file(userId, UUID.randomUUID(), folder.getId(), 12L);
		when(driveNodeMapper.selectById(folder.getId())).thenReturn(folder);
		when(driveNodeMapper.selectList(any()))
				.thenReturn(List.of(file))
				.thenReturn(List.of());

		driveService.recycle(userId, folder.getId());

		assertThat(folder.getDeleted()).isTrue();
		assertThat(folder.getParentId()).isNull();
		assertThat(folder.getOriginalParentId()).isNull();
		assertThat(file.getDeleted()).isTrue();
		assertThat(file.getParentId()).isEqualTo(folder.getId());
		assertThat(file.getOriginalParentId()).isEqualTo(folder.getId());
		verify(driveNodeMapper).updateById(folder);
		verify(driveNodeMapper).updateById(file);
	}

	@Test
	void permanentDeleteFolderDeletesChildrenAndReleasesFileQuota() {
		UUID userId = UUID.randomUUID();
		UUID storageObjectId = UUID.randomUUID();
		DriveNode folder = folder(userId, UUID.randomUUID(), null);
		folder.setDeleted(true);
		DriveNode file = file(userId, UUID.randomUUID(), folder.getId(), 42L);
		file.setDeleted(true);
		file.setStorageObjectId(storageObjectId);
		StorageObject object = new StorageObject();
		object.setId(storageObjectId);
		object.setRefCount(2);
		when(driveNodeMapper.selectById(folder.getId())).thenReturn(folder);
		when(driveNodeMapper.selectList(any()))
				.thenReturn(List.of(file))
				.thenReturn(List.of());
		when(storageObjectMapper.selectById(storageObjectId)).thenReturn(object);

		driveService.permanentDelete(userId, folder.getId());

		assertThat(object.getRefCount()).isEqualTo(1);
		verify(authService).releaseQuota(userId, 42L);
		verify(storageObjectMapper).updateById(object);
		verify(driveNodeMapper).deleteById(file.getId());
		verify(driveNodeMapper).deleteById(folder.getId());
	}

	@Test
	void createFileSchedulesThumbnailWithoutWaitingForGeneration() throws Exception {
		UUID userId = UUID.randomUUID();
		StorageObject object = new StorageObject();
		object.setId(UUID.randomUUID());
		object.setContentType("image/jpeg");
		object.setSizeBytes(123L);
		object.setSha256("abc");
		object.setOssBucket("bucket");
		object.setOssKey("drive/file.jpg");
		object.setPreviewStatus("READY");
		object.setRefCount(0);
		when(storageService.createDownloadUrl(any(), any())).thenReturn(new URL("https://example.test/file.jpg"));

		driveService.createFileFromStorage(userId, null, "file.jpg", object);

		verify(authService).consumeQuota(userId, 123L);
		verify(thumbnailService).generateForAsync(any(DriveNode.class));
		verify(thumbnailService, never()).generateFor(any(DriveNode.class));
	}

	@Test
	void createFileRejectsDuplicateNameWithoutConsumingQuota() {
		UUID userId = UUID.randomUUID();
		StorageObject object = new StorageObject();
		object.setId(UUID.randomUUID());
		object.setContentType("image/jpeg");
		object.setSizeBytes(123L);
		object.setSha256("abc");
		object.setOssBucket("bucket");
		object.setOssKey("drive/file.jpg");
		object.setPreviewStatus("READY");
		object.setRefCount(0);
		when(driveNodeMapper.selectCount(any())).thenReturn(1L);

		assertThatThrownBy(() -> driveService.createFileFromStorage(userId, null, "file.jpg", object))
				.isInstanceOf(ResponseStatusException.class)
				.hasMessageContaining("当前目录已存在同名文件或文件夹");

		verify(authService, never()).consumeQuota(any(), anyLong());
		verify(storageObjectMapper, never()).updateById(any(StorageObject.class));
		verify(thumbnailService, never()).generateForAsync(any());
	}

	private DriveNode folder(UUID userId, UUID id, UUID parentId) {
		DriveNode node = new DriveNode();
		node.setId(id);
		node.setUserId(userId);
		node.setParentId(parentId);
		node.setName("folder");
		node.setNodeType(NodeType.FOLDER.name());
		node.setDeleted(false);
		node.setSize(0L);
		return node;
	}

	private DriveNode file(UUID userId, UUID id, UUID parentId, long size) {
		DriveNode node = new DriveNode();
		node.setId(id);
		node.setUserId(userId);
		node.setParentId(parentId);
		node.setName("file.txt");
		node.setNodeType(NodeType.FILE.name());
		node.setDeleted(false);
		node.setSize(size);
		return node;
	}
}
