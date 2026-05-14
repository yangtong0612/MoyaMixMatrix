package com.moya.portal.banked.drive;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.moya.portal.banked.drive.dto.DriveListResult;
import com.moya.portal.banked.drive.dto.DriveNodeView;
import com.moya.portal.banked.drive.entity.DriveNode;
import com.moya.portal.banked.drive.entity.StorageObject;
import com.moya.portal.banked.drive.enums.NodeType;
import com.moya.portal.banked.drive.mapper.DriveNodeMapper;
import com.moya.portal.banked.drive.mapper.StorageObjectMapper;
import com.moya.portal.banked.storage.StorageService;
import com.moya.portal.banked.user.AuthService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class DriveService {

	private final DriveNodeMapper driveNodeMapper;
	private final StorageObjectMapper storageObjectMapper;
	private final AuthService authService;
	private final StorageService storageService;

	public DriveService(DriveNodeMapper driveNodeMapper, StorageObjectMapper storageObjectMapper, AuthService authService, StorageService storageService) {
		this.driveNodeMapper = driveNodeMapper;
		this.storageObjectMapper = storageObjectMapper;
		this.authService = authService;
		this.storageService = storageService;
	}

	public DriveListResult list(UUID userId, UUID parentId) {
		List<DriveNodeView> nodes = driveNodeMapper.selectList(new LambdaQueryWrapper<DriveNode>()
						.eq(DriveNode::getUserId, userId)
						.eq(parentId != null, DriveNode::getParentId, parentId)
						.isNull(parentId == null, DriveNode::getParentId)
						.eq(DriveNode::getDeleted, false)
						.orderByDesc(DriveNode::getNodeType)
						.orderByAsc(DriveNode::getName))
				.stream()
				.map(this::toView)
				.toList();
		return new DriveListResult(parentId, nodes);
	}

	public DriveNodeView detail(UUID userId, UUID nodeId) {
		return toView(requireNode(userId, nodeId));
	}

	@Transactional
	public DriveNodeView createFolder(UUID userId, UUID parentId, String name) {
		authService.requireUser(userId);
		requireFolderParent(userId, parentId);
		OffsetDateTime now = OffsetDateTime.now();
		DriveNode folder = new DriveNode();
		folder.setId(UUID.randomUUID());
		folder.setUserId(userId);
		folder.setParentId(parentId);
		folder.setName(name);
		folder.setNodeType(NodeType.FOLDER.name());
		folder.setSize(0L);
		folder.setDeleted(false);
		folder.setPreviewStatus("READY");
		folder.setCreatedAt(now);
		folder.setUpdatedAt(now);
		driveNodeMapper.insert(folder);
		return toView(folder);
	}

	@Transactional
	public DriveNodeView createFileFromStorage(UUID userId, UUID parentId, String name, StorageObject object) {
		authService.requireUser(userId);
		requireFolderParent(userId, parentId);
		authService.consumeQuota(userId, object.getSizeBytes());
		object.setRefCount((object.getRefCount() == null ? 0 : object.getRefCount()) + 1);
		object.setUpdatedAt(OffsetDateTime.now());
		storageObjectMapper.updateById(object);

		OffsetDateTime now = OffsetDateTime.now();
		DriveNode file = new DriveNode();
		file.setId(UUID.randomUUID());
		file.setUserId(userId);
		file.setParentId(parentId);
		file.setStorageObjectId(object.getId());
		file.setName(name);
		file.setNodeType(NodeType.FILE.name());
		file.setFileExt(fileExt(name));
		file.setMimeType(object.getContentType());
		file.setSize(object.getSizeBytes());
		file.setFileHash(object.getSha256());
		file.setOssBucket(object.getOssBucket());
		file.setOssKey(object.getOssKey());
		file.setDeleted(false);
		file.setPreviewStatus(object.getPreviewStatus());
		file.setCreatedAt(now);
		file.setUpdatedAt(now);
		driveNodeMapper.insert(file);
		return toView(file);
	}

	@Transactional
	public DriveNodeView rename(UUID userId, UUID nodeId, String name) {
		DriveNode node = requireNode(userId, nodeId);
		node.setName(name);
		node.setFileExt(NodeType.FILE.name().equals(node.getNodeType()) ? fileExt(name) : null);
		node.setUpdatedAt(OffsetDateTime.now());
		driveNodeMapper.updateById(node);
		return toView(node);
	}

	@Transactional
	public DriveNodeView move(UUID userId, UUID nodeId, UUID targetParentId) {
		DriveNode node = requireNode(userId, nodeId);
		requireFolderParent(userId, targetParentId);
		if (node.getId().equals(targetParentId)) {
			throw badRequest("cannot move node into itself");
		}
		node.setParentId(targetParentId);
		node.setUpdatedAt(OffsetDateTime.now());
		driveNodeMapper.updateById(node);
		return toView(node);
	}

	@Transactional
	public DriveNodeView recycle(UUID userId, UUID nodeId) {
		DriveNode node = requireNode(userId, nodeId);
		node.setDeleted(true);
		node.setOriginalParentId(node.getParentId());
		node.setParentId(null);
		node.setRecycledAt(OffsetDateTime.now());
		node.setUpdatedAt(OffsetDateTime.now());
		driveNodeMapper.updateById(node);
		return toView(node);
	}

	public List<DriveNodeView> recycleBin(UUID userId) {
		return driveNodeMapper.selectList(new LambdaQueryWrapper<DriveNode>()
						.eq(DriveNode::getUserId, userId)
						.eq(DriveNode::getDeleted, true)
						.orderByDesc(DriveNode::getRecycledAt))
				.stream()
				.map(this::toView)
				.toList();
	}

	@Transactional
	public DriveNodeView restore(UUID userId, UUID nodeId) {
		DriveNode node = driveNodeMapper.selectById(nodeId);
		if (node == null || !userId.equals(node.getUserId()) || !Boolean.TRUE.equals(node.getDeleted())) {
			throw notFound("recycled file not found");
		}
		requireFolderParent(userId, node.getOriginalParentId());
		node.setDeleted(false);
		node.setParentId(node.getOriginalParentId());
		node.setOriginalParentId(null);
		node.setRecycledAt(null);
		node.setUpdatedAt(OffsetDateTime.now());
		driveNodeMapper.updateById(node);
		return toView(node);
	}

	@Transactional
	public void permanentDelete(UUID userId, UUID nodeId) {
		DriveNode node = driveNodeMapper.selectById(nodeId);
		if (node == null || !userId.equals(node.getUserId()) || !Boolean.TRUE.equals(node.getDeleted())) {
			throw notFound("recycled file not found");
		}
		if (NodeType.FILE.name().equals(node.getNodeType()) && node.getStorageObjectId() != null) {
			StorageObject object = storageObjectMapper.selectById(node.getStorageObjectId());
			if (object != null) {
				object.setRefCount(Math.max(0, (object.getRefCount() == null ? 0 : object.getRefCount()) - 1));
				object.setUpdatedAt(OffsetDateTime.now());
				storageObjectMapper.updateById(object);
			}
			authService.releaseQuota(userId, node.getSize() == null ? 0 : node.getSize());
		}
		driveNodeMapper.deleteById(nodeId);
	}

	public DriveNode requireReadableFileNode(UUID userId, UUID nodeId) {
		return requireNode(userId, nodeId);
	}

	public DriveNode requireNode(UUID userId, UUID nodeId) {
		DriveNode node = driveNodeMapper.selectById(nodeId);
		if (node == null || !userId.equals(node.getUserId()) || Boolean.TRUE.equals(node.getDeleted())) {
			throw notFound("file node not found");
		}
		return node;
	}

	public DriveNodeView toView(DriveNode node) {
		String previewUrl = null;
		String downloadUrl = null;
		if (NodeType.FILE.name().equals(node.getNodeType()) && StringUtils.hasText(node.getOssKey())) {
			previewUrl = storageService.createDownloadUrl(node.getOssKey(), Duration.ofMinutes(20)).toString();
			downloadUrl = storageService.createDownloadUrl(node.getOssKey(), Duration.ofMinutes(20)).toString();
		}
		return new DriveNodeView(
				node.getId(),
				node.getParentId(),
				node.getName(),
				node.getNodeType(),
				node.getSize(),
				node.getMimeType(),
				node.getFileHash(),
				node.getOssBucket(),
				node.getOssKey(),
				previewUrl,
				downloadUrl,
				node.getCoverUrl(),
				node.getUpdatedAt()
		);
	}

	private void requireFolderParent(UUID userId, UUID parentId) {
		if (parentId == null) return;
		DriveNode parent = requireNode(userId, parentId);
		if (!NodeType.FOLDER.name().equals(parent.getNodeType())) {
			throw badRequest("parent must be a folder");
		}
	}

	private String fileExt(String name) {
		if (!StringUtils.hasText(name)) return null;
		int dotIndex = name.lastIndexOf('.');
		return dotIndex < 0 ? null : name.substring(dotIndex + 1).toLowerCase();
	}

	private ResponseStatusException badRequest(String message) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
	}

	private ResponseStatusException notFound(String message) {
		return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
	}
}
