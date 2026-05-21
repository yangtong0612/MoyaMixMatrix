package com.moya.portal.banked.drive;

import java.io.InputStream;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.moya.portal.banked.drive.dto.DriveListResult;
import com.moya.portal.banked.drive.dto.DriveNodeContent;
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
	private final ThumbnailService thumbnailService;

	public DriveService(DriveNodeMapper driveNodeMapper, StorageObjectMapper storageObjectMapper, AuthService authService, StorageService storageService, ThumbnailService thumbnailService) {
		this.driveNodeMapper = driveNodeMapper;
		this.storageObjectMapper = storageObjectMapper;
		this.authService = authService;
		this.storageService = storageService;
		this.thumbnailService = thumbnailService;
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

	public DriveNodeContent openContent(UUID userId, UUID nodeId) {
		DriveNode node = requireNode(userId, nodeId);
		if (!NodeType.FILE.name().equals(node.getNodeType())) {
			throw badRequest("node must be a file");
		}
		if (!StringUtils.hasText(node.getOssKey())) {
			throw badRequest("file has no readable storage object");
		}
		InputStream stream = storageService.openObjectStream(node.getOssKey());
		return new DriveNodeContent(node.getName(), node.getMimeType(), node.getSize(), stream);
	}

	public DriveNodeView findCompletedUploadNode(UUID userId, UUID parentId, String name, String fileHash) {
		DriveNode node = driveNodeMapper.selectOne(new LambdaQueryWrapper<DriveNode>()
				.eq(DriveNode::getUserId, userId)
				.eq(DriveNode::getNodeType, NodeType.FILE.name())
				.eq(DriveNode::getDeleted, false)
				.eq(DriveNode::getName, name)
				.eq(DriveNode::getFileHash, fileHash)
				.eq(parentId != null, DriveNode::getParentId, parentId)
				.isNull(parentId == null, DriveNode::getParentId)
				.orderByDesc(DriveNode::getUpdatedAt)
				.last("limit 1"));
		return node == null ? null : toView(node);
	}

	@Transactional
	public DriveNodeView createFolder(UUID userId, UUID parentId, String name) {
		authService.requireUser(userId);
		requireFolderParent(userId, parentId);
		requireNameAvailable(userId, parentId, name, null);
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
		requireNameAvailable(userId, parentId, name, null);
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
		thumbnailService.generateForAsync(file);
		return toView(file);
	}

	@Transactional
	public DriveNodeView rename(UUID userId, UUID nodeId, String name) {
		DriveNode node = requireNode(userId, nodeId);
		requireNameAvailable(userId, node.getParentId(), name, node.getId());
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
		if (NodeType.FOLDER.name().equals(node.getNodeType()) && isDescendantOf(userId, targetParentId, node.getId())) {
			throw badRequest("cannot move folder into its descendant");
		}
		requireNameAvailable(userId, targetParentId, node.getName(), node.getId());
		node.setParentId(targetParentId);
		node.setUpdatedAt(OffsetDateTime.now());
		driveNodeMapper.updateById(node);
		return toView(node);
	}

	@Transactional
	public DriveNodeView recycle(UUID userId, UUID nodeId) {
		DriveNode node = requireNode(userId, nodeId);
		OffsetDateTime now = OffsetDateTime.now();
		recycleTree(userId, node, true, now);
		return toView(node);
	}

	public List<DriveNodeView> recycleBin(UUID userId) {
		return driveNodeMapper.selectList(new LambdaQueryWrapper<DriveNode>()
				.eq(DriveNode::getUserId, userId)
				.eq(DriveNode::getDeleted, true)
				.isNull(DriveNode::getParentId)
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
		restoreTree(userId, node, OffsetDateTime.now());
		return toView(node);
	}

	@Transactional
	public void permanentDelete(UUID userId, UUID nodeId) {
		DriveNode node = driveNodeMapper.selectById(nodeId);
		if (node == null || !userId.equals(node.getUserId()) || !Boolean.TRUE.equals(node.getDeleted())) {
			throw notFound("recycled file not found");
		}
		permanentDeleteTree(userId, node);
	}

	private void recycleTree(UUID userId, DriveNode node, boolean recycleRoot, OffsetDateTime now) {
		List<DriveNode> children = childrenOf(userId, node.getId(), false);
		for (DriveNode child : children) {
			recycleTree(userId, child, false, now);
		}
		node.setDeleted(true);
		node.setOriginalParentId(node.getParentId());
		if (recycleRoot) {
			node.setParentId(null);
		}
		node.setRecycledAt(now);
		node.setUpdatedAt(now);
		driveNodeMapper.updateById(node);
	}

	private void restoreTree(UUID userId, DriveNode node, OffsetDateTime now) {
		UUID restoreParentId = validRestoreParent(userId, node.getOriginalParentId());
		requireNameAvailable(userId, restoreParentId, node.getName(), node.getId());
		node.setDeleted(false);
		node.setParentId(restoreParentId);
		node.setOriginalParentId(null);
		node.setRecycledAt(null);
		node.setUpdatedAt(now);
		driveNodeMapper.updateById(node);
		for (DriveNode child : childrenOf(userId, node.getId(), true)) {
			restoreTree(userId, child, now);
		}
	}

	private UUID validRestoreParent(UUID userId, UUID parentId) {
		if (parentId == null) return null;
		DriveNode parent = driveNodeMapper.selectById(parentId);
		if (parent == null || !userId.equals(parent.getUserId()) || Boolean.TRUE.equals(parent.getDeleted()) || !NodeType.FOLDER.name().equals(parent.getNodeType())) {
			return null;
		}
		return parentId;
	}

	private void permanentDeleteTree(UUID userId, DriveNode node) {
		for (DriveNode child : childrenOf(userId, node.getId(), true)) {
			permanentDeleteTree(userId, child);
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
		driveNodeMapper.deleteById(node.getId());
	}

	private List<DriveNode> childrenOf(UUID userId, UUID parentId, boolean includeDeleted) {
		return driveNodeMapper.selectList(new LambdaQueryWrapper<DriveNode>()
				.eq(DriveNode::getUserId, userId)
				.eq(DriveNode::getParentId, parentId)
				.eq(!includeDeleted, DriveNode::getDeleted, false));
	}

	private boolean isDescendantOf(UUID userId, UUID possibleDescendantId, UUID ancestorId) {
		UUID cursor = possibleDescendantId;
		while (cursor != null) {
			if (ancestorId.equals(cursor)) {
				return true;
			}
			DriveNode node = driveNodeMapper.selectById(cursor);
			if (node == null || !userId.equals(node.getUserId()) || Boolean.TRUE.equals(node.getDeleted())) {
				return false;
			}
			cursor = node.getParentId();
		}
		return false;
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
		String coverUrl = null;
		if (NodeType.FILE.name().equals(node.getNodeType()) && StringUtils.hasText(node.getOssKey())) {
			previewUrl = storageService.createDownloadUrl(node.getOssKey(), Duration.ofMinutes(20)).toString();
			downloadUrl = storageService.createDownloadUrl(node.getOssKey(), Duration.ofMinutes(20)).toString();
		}
		if (StringUtils.hasText(node.getCoverUrl())) {
			coverUrl = createFileUrl(node.getCoverUrl());
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
				coverUrl,
				node.getUpdatedAt()
		);
	}

	private String createFileUrl(String objectKeyOrUrl) {
		if (objectKeyOrUrl.startsWith("http://") || objectKeyOrUrl.startsWith("https://")) {
			return objectKeyOrUrl;
		}
		return storageService.createDownloadUrl(objectKeyOrUrl, Duration.ofMinutes(20)).toString();
	}

	private void requireFolderParent(UUID userId, UUID parentId) {
		if (parentId == null) return;
		DriveNode parent = requireNode(userId, parentId);
		if (!NodeType.FOLDER.name().equals(parent.getNodeType())) {
			throw badRequest("parent must be a folder");
		}
	}

	private void requireNameAvailable(UUID userId, UUID parentId, String name, UUID excludeNodeId) {
		if (!StringUtils.hasText(name)) {
			throw badRequest("name must not be blank");
		}
		Long count = driveNodeMapper.selectCount(new LambdaQueryWrapper<DriveNode>()
				.eq(DriveNode::getUserId, userId)
				.eq(DriveNode::getDeleted, false)
				.eq(DriveNode::getName, name)
				.eq(parentId != null, DriveNode::getParentId, parentId)
				.isNull(parentId == null, DriveNode::getParentId)
				.ne(excludeNodeId != null, DriveNode::getId, excludeNodeId));
		if (count != null && count > 0) {
			throw badRequest("当前目录已存在同名文件或文件夹");
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
