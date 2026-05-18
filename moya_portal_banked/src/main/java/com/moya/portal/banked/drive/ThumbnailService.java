package com.moya.portal.banked.drive;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.OffsetDateTime;
import java.util.concurrent.CompletableFuture;
import java.util.Locale;
import java.util.Optional;

import javax.imageio.ImageIO;

import com.moya.portal.banked.drive.entity.DriveNode;
import com.moya.portal.banked.drive.mapper.DriveNodeMapper;
import com.moya.portal.banked.storage.StorageProperties;
import com.moya.portal.banked.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

@Service
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class ThumbnailService {

	private static final Logger log = LoggerFactory.getLogger(ThumbnailService.class);
	private static final int MAX_EDGE = 320;
	private static final String CONTENT_TYPE = "image/jpeg";

	private final StorageService storageService;
	private final StorageProperties storageProperties;
	private final DriveNodeMapper driveNodeMapper;

	public ThumbnailService(StorageService storageService, StorageProperties storageProperties, DriveNodeMapper driveNodeMapper) {
		this.storageService = storageService;
		this.storageProperties = storageProperties;
		this.driveNodeMapper = driveNodeMapper;
	}

	public void generateForAsync(DriveNode node) {
		DriveNode snapshot = thumbnailSnapshot(node);
		if (snapshot == null || !storageService.enabled() || !StringUtils.hasText(snapshot.getOssKey()) || !isSupportedImage(snapshot)) {
			return;
		}
		Runnable task = () -> CompletableFuture.runAsync(() -> generateAndPersist(snapshot));
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override
				public void afterCommit() {
					task.run();
				}
			});
			return;
		}
		task.run();
	}

	public Optional<String> generateFor(DriveNode node) {
		if (!storageService.enabled() || node == null || !StringUtils.hasText(node.getOssKey()) || !isSupportedImage(node)) {
			return Optional.empty();
		}
		String thumbnailKey = buildThumbnailKey(node);
		try {
			byte[] sourceBytes = storageService.readObject(node.getOssKey());
			BufferedImage source = ImageIO.read(new ByteArrayInputStream(sourceBytes));
			if (source == null || source.getWidth() <= 0 || source.getHeight() <= 0) {
				return Optional.empty();
			}
			byte[] thumbnail = renderJpegThumbnail(source);
			storageService.writeObject(thumbnailKey, thumbnail, CONTENT_TYPE);
			return Optional.of(thumbnailKey);
		} catch (Exception ex) {
			log.warn("Generate drive thumbnail failed, nodeId={}, ossKey={}", node.getId(), node.getOssKey(), ex);
			return Optional.empty();
		}
	}

	private void generateAndPersist(DriveNode node) {
		try {
			generateFor(node).ifPresent((coverKey) -> {
				DriveNode update = new DriveNode();
				update.setId(node.getId());
				update.setCoverUrl(coverKey);
				update.setUpdatedAt(OffsetDateTime.now());
				driveNodeMapper.updateById(update);
			});
		} catch (Exception ex) {
			log.warn("Persist drive thumbnail failed, nodeId={}, ossKey={}", node.getId(), node.getOssKey(), ex);
		}
	}

	private DriveNode thumbnailSnapshot(DriveNode node) {
		if (node == null || node.getId() == null) {
			return null;
		}
		DriveNode snapshot = new DriveNode();
		snapshot.setId(node.getId());
		snapshot.setOssKey(node.getOssKey());
		snapshot.setMimeType(node.getMimeType());
		snapshot.setFileExt(node.getFileExt());
		return snapshot;
	}

	private byte[] renderJpegThumbnail(BufferedImage source) throws Exception {
		int width = source.getWidth();
		int height = source.getHeight();
		double scale = Math.min(1.0d, MAX_EDGE / (double) Math.max(width, height));
		int targetWidth = Math.max(1, (int) Math.round(width * scale));
		int targetHeight = Math.max(1, (int) Math.round(height * scale));

		BufferedImage target = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_RGB);
		Graphics2D graphics = target.createGraphics();
		try {
			graphics.setColor(Color.WHITE);
			graphics.fillRect(0, 0, targetWidth, targetHeight);
			graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
			graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
			graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			graphics.drawImage(source, 0, 0, targetWidth, targetHeight, null);
		} finally {
			graphics.dispose();
		}

		ByteArrayOutputStream output = new ByteArrayOutputStream();
		if (!ImageIO.write(target, "jpg", output)) {
			throw new IllegalStateException("No JPEG writer available");
		}
		return output.toByteArray();
	}

	private boolean isSupportedImage(DriveNode node) {
		String mimeType = node.getMimeType() == null ? "" : node.getMimeType().toLowerCase(Locale.ROOT);
		String ext = node.getFileExt() == null ? "" : node.getFileExt().toLowerCase(Locale.ROOT);
		if ("image/svg+xml".equals(mimeType) || "svg".equals(ext) || "webp".equals(ext)) {
			return false;
		}
		return mimeType.matches("image/(jpeg|jpg|png|gif|bmp)") || ext.matches("jpe?g|png|gif|bmp");
	}

	private String buildThumbnailKey(DriveNode node) {
		String rootPrefix = storageProperties.getOss().getRootPrefix();
		String safeRoot = StringUtils.hasText(rootPrefix) ? rootPrefix.replaceAll("^/+", "").replaceAll("/+$", "") : "moya-drive";
		return safeRoot + "/thumbnails/" + node.getId() + ".jpg";
	}
}
