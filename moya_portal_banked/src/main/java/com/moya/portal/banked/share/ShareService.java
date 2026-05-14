package com.moya.portal.banked.share;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.moya.portal.banked.drive.DriveService;
import com.moya.portal.banked.drive.dto.DriveNodeView;
import com.moya.portal.banked.drive.entity.DriveNode;
import com.moya.portal.banked.drive.entity.StorageObject;
import com.moya.portal.banked.drive.enums.NodeType;
import com.moya.portal.banked.drive.mapper.DriveNodeMapper;
import com.moya.portal.banked.drive.mapper.StorageObjectMapper;
import com.moya.portal.banked.share.dto.DirectShareView;
import com.moya.portal.banked.share.dto.ShareItemView;
import com.moya.portal.banked.share.dto.ShareLinkView;
import com.moya.portal.banked.share.entity.DirectShare;
import com.moya.portal.banked.share.entity.ShareItem;
import com.moya.portal.banked.share.entity.ShareLink;
import com.moya.portal.banked.share.enums.DirectShareStatus;
import com.moya.portal.banked.share.mapper.DirectShareMapper;
import com.moya.portal.banked.share.mapper.ShareItemMapper;
import com.moya.portal.banked.share.mapper.ShareLinkMapper;
import com.moya.portal.banked.user.AuthService;
import com.moya.portal.banked.user.entity.SysUser;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class ShareService {

	private final ShareLinkMapper shareLinkMapper;
	private final ShareItemMapper shareItemMapper;
	private final DirectShareMapper directShareMapper;
	private final DriveNodeMapper driveNodeMapper;
	private final StorageObjectMapper storageObjectMapper;
	private final DriveService driveService;
	private final AuthService authService;
	private final PasswordEncoder passwordEncoder;
	private final SecureRandom random = new SecureRandom();

	public ShareService(
			ShareLinkMapper shareLinkMapper,
			ShareItemMapper shareItemMapper,
			DirectShareMapper directShareMapper,
			DriveNodeMapper driveNodeMapper,
			StorageObjectMapper storageObjectMapper,
			DriveService driveService,
			AuthService authService,
			PasswordEncoder passwordEncoder
	) {
		this.shareLinkMapper = shareLinkMapper;
		this.shareItemMapper = shareItemMapper;
		this.directShareMapper = directShareMapper;
		this.driveNodeMapper = driveNodeMapper;
		this.storageObjectMapper = storageObjectMapper;
		this.driveService = driveService;
		this.authService = authService;
		this.passwordEncoder = passwordEncoder;
	}

	@Transactional
	public ShareLinkView createLink(UUID ownerId, CreateShareLinkCommand command) {
		if (command.fileNodeIds() == null || command.fileNodeIds().isEmpty()) {
			throw badRequest("fileNodeIds must not be empty");
		}
		OffsetDateTime now = OffsetDateTime.now();
		ShareLink link = new ShareLink();
		link.setId(UUID.randomUUID());
		link.setUserId(ownerId);
		link.setNodeId(command.fileNodeIds().get(0));
		link.setShareCode(nextShareCode());
		link.setExtractCodeHash(command.extractCode() == null || command.extractCode().isBlank() ? null : passwordEncoder.encode(command.extractCode()));
		link.setExpireAt(command.validityDays() == null ? null : now.plusDays(command.validityDays()));
		link.setStatus("ACTIVE");
		link.setAllowPreview(command.allowPreview());
		link.setAllowDownload(command.allowDownload());
		link.setCanceled(false);
		link.setCreatedAt(now);
		link.setUpdatedAt(now);
		shareLinkMapper.insert(link);

		for (UUID nodeId : command.fileNodeIds()) {
			driveService.requireReadableFileNode(ownerId, nodeId);
			ShareItem item = new ShareItem();
			item.setId(UUID.randomUUID());
			item.setShareLinkId(link.getId());
			item.setNodeId(nodeId);
			shareItemMapper.insert(item);
		}
		return toView(link);
	}

	public ShareLinkView publicView(String shareCode, String extractCode) {
		return toView(requireAvailableLink(shareCode, extractCode));
	}

	@Transactional
	public DriveNodeView saveLinkItem(UUID receiverId, String shareCode, String extractCode, UUID shareItemId, UUID targetParentId) {
		ShareLink link = requireAvailableLink(shareCode, extractCode);
		ShareItem item = requireShareItem(link.getId(), shareItemId);
		return copySharedFile(receiverId, targetParentId, item.getNodeId());
	}

	@Transactional
	public void cancelLink(UUID ownerId, UUID shareLinkId) {
		ShareLink link = shareLinkMapper.selectById(shareLinkId);
		if (link == null) {
			throw notFound("share link not found");
		}
		if (!ownerId.equals(link.getUserId())) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "cannot cancel other user's share");
		}
		link.setCanceled(true);
		link.setStatus("CANCELED");
		link.setUpdatedAt(OffsetDateTime.now());
		shareLinkMapper.updateById(link);
	}

	@Transactional
	public DirectShareView sendDirect(UUID senderId, UUID fileNodeId, String receiver) {
		SysUser receiverUser = authService.findReceiver(receiver);
		if (senderId.equals(receiverUser.getId())) {
			throw badRequest("cannot share to yourself");
		}
		driveService.requireReadableFileNode(senderId, fileNodeId);
		OffsetDateTime now = OffsetDateTime.now();
		DirectShare direct = new DirectShare();
		direct.setId(UUID.randomUUID());
		direct.setSenderId(senderId);
		direct.setReceiverId(receiverUser.getId());
		direct.setNodeId(fileNodeId);
		direct.setStatus(DirectShareStatus.PENDING.name());
		direct.setSaved(false);
		direct.setCanceled(false);
		direct.setCreatedAt(now);
		direct.setUpdatedAt(now);
		directShareMapper.insert(direct);
		return toView(direct);
	}

	public List<DirectShareView> inbox(UUID receiverId) {
		return directShareMapper.selectList(new LambdaQueryWrapper<DirectShare>()
						.eq(DirectShare::getReceiverId, receiverId)
						.orderByDesc(DirectShare::getCreatedAt))
				.stream()
				.map(this::toView)
				.toList();
	}

	@Transactional
	public DriveNodeView saveDirect(UUID receiverId, UUID directShareId, UUID targetParentId) {
		DirectShare direct = directShareMapper.selectById(directShareId);
		if (direct == null || !receiverId.equals(direct.getReceiverId())) {
			throw notFound("direct share not found");
		}
		if (Boolean.TRUE.equals(direct.getCanceled())) {
			throw badRequest("direct share is canceled");
		}
		DriveNodeView saved = copySharedFile(receiverId, targetParentId, direct.getNodeId());
		direct.setSaved(true);
		direct.setStatus(DirectShareStatus.SAVED.name());
		direct.setUpdatedAt(OffsetDateTime.now());
		directShareMapper.updateById(direct);
		return saved;
	}

	@Transactional
	public void cancelDirect(UUID senderId, UUID directShareId) {
		DirectShare direct = directShareMapper.selectById(directShareId);
		if (direct == null) {
			throw notFound("direct share not found");
		}
		if (!senderId.equals(direct.getSenderId())) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "cannot cancel other user's direct share");
		}
		direct.setCanceled(true);
		direct.setStatus(DirectShareStatus.CANCELED.name());
		direct.setUpdatedAt(OffsetDateTime.now());
		directShareMapper.updateById(direct);
	}

	private DriveNodeView copySharedFile(UUID receiverId, UUID targetParentId, UUID sourceNodeId) {
		DriveNode source = findSharedNode(sourceNodeId);
		if (!NodeType.FILE.name().equals(source.getNodeType()) || source.getStorageObjectId() == null) {
			throw badRequest("folder copy is not implemented in this version");
		}
		StorageObject object = storageObjectMapper.selectById(source.getStorageObjectId());
		if (object == null) {
			throw notFound("storage object not found");
		}
		return driveService.createFileFromStorage(receiverId, targetParentId, source.getName(), object);
	}

	private DriveNode findSharedNode(UUID sourceNodeId) {
		DriveNode source = driveNodeMapper.selectById(sourceNodeId);
		if (source == null || Boolean.TRUE.equals(source.getDeleted())) {
			throw notFound("shared file node not found");
		}
		return source;
	}

	private ShareLink requireAvailableLink(String shareCode, String extractCode) {
		ShareLink link = shareLinkMapper.selectOne(new LambdaQueryWrapper<ShareLink>()
				.eq(ShareLink::getShareCode, shareCode)
				.last("limit 1"));
		if (link == null) {
			throw notFound("share link not found");
		}
		if (Boolean.TRUE.equals(link.getCanceled()) || "CANCELED".equals(link.getStatus())) {
			throw badRequest("share link is canceled");
		}
		if (link.getExpireAt() != null && link.getExpireAt().isBefore(OffsetDateTime.now())) {
			throw badRequest("share link is expired");
		}
		if (link.getExtractCodeHash() != null && !passwordEncoder.matches(extractCode == null ? "" : extractCode, link.getExtractCodeHash())) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "extract code is wrong");
		}
		return link;
	}

	private ShareItem requireShareItem(UUID linkId, UUID itemId) {
		ShareItem item = shareItemMapper.selectById(itemId);
		if (item == null || !linkId.equals(item.getShareLinkId())) {
			throw notFound("share item not found");
		}
		return item;
	}

	private ShareLinkView toView(ShareLink link) {
		List<ShareItemView> items = shareItemMapper.selectList(new LambdaQueryWrapper<ShareItem>()
						.eq(ShareItem::getShareLinkId, link.getId()))
				.stream()
				.map(item -> new ShareItemView(item.getId(), item.getNodeId(), safeNodeView(item.getNodeId())))
				.toList();
		return new ShareLinkView(link.getId(), link.getShareCode(), link.getExpireAt(),
				Boolean.TRUE.equals(link.getAllowPreview()), Boolean.TRUE.equals(link.getAllowDownload()),
				Boolean.TRUE.equals(link.getCanceled()), items);
	}

	private DirectShareView toView(DirectShare direct) {
		return new DirectShareView(direct.getId(), direct.getSenderId(), direct.getReceiverId(), direct.getStatus(),
				Boolean.TRUE.equals(direct.getSaved()), Boolean.TRUE.equals(direct.getCanceled()), safeNodeView(direct.getNodeId()), direct.getCreatedAt());
	}

	private DriveNodeView safeNodeView(UUID nodeId) {
		DriveNode node = findSharedNode(nodeId);
		return driveService.toView(node);
	}

	private String nextShareCode() {
		byte[] bytes = new byte[6];
		String code;
		do {
			random.nextBytes(bytes);
			code = HexFormat.of().formatHex(bytes);
		} while (shareLinkMapper.selectCount(new LambdaQueryWrapper<ShareLink>().eq(ShareLink::getShareCode, code)) > 0);
		return code;
	}

	private ResponseStatusException badRequest(String message) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
	}

	private ResponseStatusException notFound(String message) {
		return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
	}

	public record CreateShareLinkCommand(List<UUID> fileNodeIds, String extractCode, Integer validityDays, boolean allowPreview, boolean allowDownload) {
	}
}
