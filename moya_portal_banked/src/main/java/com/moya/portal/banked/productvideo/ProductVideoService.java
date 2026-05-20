package com.moya.portal.banked.productvideo;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.moya.portal.banked.productvideo.dto.ProductVideoCreateRequest;
import com.moya.portal.banked.productvideo.dto.ProductVideoCreateResponse;
import com.moya.portal.banked.productvideo.dto.ProductVideoConfigStatusResponse;
import com.moya.portal.banked.productvideo.dto.ProductVideoStatusResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProductVideoService {

	private static final String TASK_PATH = "/api/v3/contents/generations/tasks";
	private static final Logger log = LoggerFactory.getLogger(ProductVideoService.class);

	private final ProductVideoProperties properties;
	private final ObjectMapper objectMapper;
	private final HttpClient httpClient;

	public ProductVideoService(ProductVideoProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
		this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();
	}

	public ProductVideoCreateResponse create(ProductVideoCreateRequest request) {
		ensureEnabled();
		String prompt = buildPrompt(request);
		String model = normalizeModel(request);
		ObjectNode payload = objectMapper.createObjectNode();
		payload.put("model", model);
		payload.put("prompt", prompt);
		payload.put("generate_audio", true);
		payload.put("duration", durationSeconds(request.duration()));
		payload.put("ratio", normalizeRatio(request.ratio()));
		payload.put("resolution", normalizeQuality(request.quality()));
		payload.put("watermark", false);
		payload.set("content", buildContent(prompt, request));

		JsonNode body;
		try {
			body = exchange("POST", TASK_PATH, payload);
		} catch (ResponseStatusException e) {
			if (!isRealPersonImageRejected(e)) {
				throw e;
			}
			String safePrompt = prompt + "\n安全兜底：不要参考任何输入图片中的真实人物、人脸或海报人物；仅根据文字脚本、门店/商品描述和商业场景生成虚拟画面。";
			payload.put("prompt", safePrompt);
			payload.set("content", buildTextOnlyContent(safePrompt));
			body = exchange("POST", TASK_PATH, payload);
			prompt = safePrompt;
		}
		String taskId = firstText(body, "id", "task_id");
		if (taskId.isBlank() && body.has("data")) {
			taskId = firstText(body.get("data"), "id", "task_id");
		}
		if (taskId.isBlank()) {
			throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "火山视频任务创建成功但未返回任务 ID");
		}
		String status = firstText(body, "status");
		if (status.isBlank() && body.has("data")) {
			status = firstText(body.get("data"), "status");
		}
		return new ProductVideoCreateResponse(taskId, "volcengine-ark", model, status, prompt);
	}

	public ProductVideoConfigStatusResponse configStatus() {
		boolean hasApiKey = hasApiKey();
		boolean configured = properties.isEnabled() && hasApiKey;
		return new ProductVideoConfigStatusResponse(
				properties.isEnabled(),
				hasApiKey,
				configured,
				properties.getModel(),
				configured ? "火山视频生成配置正常" : disabledMessage()
		);
	}

	public ProductVideoStatusResponse status(String taskId) {
		ensureEnabled();
		JsonNode body = exchange("GET", TASK_PATH + "/" + taskId, null);
		JsonNode data = body.has("data") ? body.get("data") : body;
		String status = firstText(data, "status");
		String videoUrl = findVideoUrl(data);
		String message = firstText(data, "message", "error", "failure_reason");
		String normalized = status.toLowerCase(Locale.ROOT);
		boolean successful = normalized.contains("succeed") || normalized.contains("success") || normalized.equals("completed") || normalized.equals("done");
		boolean failed = normalized.contains("fail") || normalized.contains("cancel") || normalized.contains("error");
		boolean finished = successful || failed || !videoUrl.isBlank();
		return new ProductVideoStatusResponse(taskId, status, videoUrl, finished, successful || !videoUrl.isBlank(), message, body);
	}

	private ArrayNode buildContent(String prompt, ProductVideoCreateRequest request) {
		ArrayNode content = objectMapper.createArrayNode();
		ObjectNode text = content.addObject();
		text.put("type", "text");
		text.put("text", prompt);

		String firstFrameUrl = cleanText(request.imageUrls() != null && request.imageUrls().size() == 1 ? request.imageUrls().get(0) : "");
		if (firstFrameUrl.isBlank()) {
			firstFrameUrl = firstImageUrl(request.imageUrls());
		}
		List<String> referenceUrls = referenceImageUrls(request);
		boolean hasReferenceMedia = !cleanText(request.referenceVideoUrl()).isBlank();
		for (String referenceUrl : referenceUrls) {
			if (!referenceUrl.equals(firstFrameUrl)) {
				hasReferenceMedia = true;
				break;
			}
		}
		if (!firstFrameUrl.isBlank() && !hasReferenceMedia) {
			addImageContent(content, "first_frame", firstFrameUrl);
			return content;
		}
		for (String imageUrl : referenceUrls) {
			addImageContent(content, "reference_image", imageUrl);
		}
		String referenceVideoUrl = cleanText(request.referenceVideoUrl());
		if (!referenceVideoUrl.isBlank()) {
			addVideoContent(content, "reference_video", referenceVideoUrl);
		}
		return content;
	}

	private ArrayNode buildTextOnlyContent(String prompt) {
		ArrayNode content = objectMapper.createArrayNode();
		ObjectNode text = content.addObject();
		text.put("type", "text");
		text.put("text", prompt);
		return content;
	}

	private void addImageContent(ArrayNode content, String role, String url) {
		ObjectNode image = content.addObject();
		image.put("role", role);
		image.put("type", "image_url");
		ObjectNode imageUrl = image.putObject("image_url");
		imageUrl.put("url", url);
	}

	private void addVideoContent(ArrayNode content, String role, String url) {
		ObjectNode video = content.addObject();
		video.put("role", role);
		video.put("type", "video_url");
		ObjectNode videoUrl = video.putObject("video_url");
		videoUrl.put("url", url);
	}

	private List<String> referenceImageUrls(ProductVideoCreateRequest request) {
		List<String> urls = new ArrayList<>();
		for (String imageUrl : request.imageUrls() == null ? List.<String>of() : request.imageUrls()) {
			String value = cleanText(imageUrl);
			if (!value.isBlank() && !urls.contains(value)) urls.add(value);
		}
		return urls.stream().limit(4).toList();
	}

	private String firstImageUrl(List<String> imageUrls) {
		for (String imageUrl : imageUrls == null ? List.<String>of() : imageUrls) {
			if (imageUrl != null && !imageUrl.isBlank()) return imageUrl;
		}
		return "";
	}

	private String buildPrompt(ProductVideoCreateRequest request) {
		String scenario = scenarioName(request.scenario());
		String script = normalizeScript(request.description(), request.scenario());
		boolean hasAvatarName = request.avatarName() != null && !request.avatarName().isBlank();
		List<String> parts = new ArrayList<>();
		parts.add("请生成一条适合中文短视频平台的" + scenario + "视频。");
		parts.add("画面要求：竖屏优先、节奏紧凑、主体清晰、真实商业摄影质感、可直接用于电商和本地生活投放。");
		parts.add("音频要求：必须生成可播放的人声口播音轨，旁白声音清晰自然，不能静音。");
		parts.add("字幕要求：必须把下面【口播脚本】按语义分句烧录为中文字幕，字幕要与人声口播同步，不遮挡主体。");
		if (hasAvatarName || Boolean.TRUE.equals(request.identityLock())) {
			parts.add("人物一致性硬约束：按下面的数字人文字设定生成虚拟口播人物，必须保持同一张脸、同一性别、同一年龄感、同一发型、同一肤色和服装主特征。");
			parts.add("禁止事项：不要生成新的演员，不要换脸，不要改变人物性别/年龄/发型，不要把商品图或门店图里的人当作主角。若人物与场景冲突，优先保持数字人身份一致。");
			parts.add("商品图、门店图、参考视频只用于理解道具、环境、镜头节奏和商业场景，不能覆盖数字人身份。不要把参考素材中的真实人物作为主角。");
		}
		if (request.avatarName() != null && !request.avatarName().isBlank()) {
			parts.add("数字人形象：" + request.avatarName().trim() + "，该数字人作为主要出镜口播人物，口型跟随旁白同步。");
		}
		if (request.avatarPrompt() != null && !request.avatarPrompt().isBlank()) {
			parts.add("人物设定补充：" + request.avatarPrompt().trim());
		}
		int imageCount = request.imageUrls() == null ? 0 : (int) request.imageUrls().stream().filter((url) -> url != null && !url.isBlank()).count();
		if (imageCount > 1) {
			parts.add("用户上传了多张素材图；请把这些素材作为商品/门店/环境参考，在镜头语言中自然延展，不要替换数字人。");
		}
		parts.add("口播脚本：" + script);
		if (Boolean.TRUE.equals(request.scriptEnabled())) {
			parts.add("请严格围绕口播脚本生成镜头，不要改写成无声展示视频。");
		}
		if (request.referenceVideoUrl() != null && !request.referenceVideoUrl().isBlank()) {
			parts.add("参考视频地址仅用于理解节奏和结构：" + request.referenceVideoUrl());
		}
		parts.add(scenarioInstruction(request.scenario(), hasAvatarName));
		return String.join("\n", parts);
	}

	private String normalizeScript(String description, String scenario) {
		if (description != null && !description.isBlank()) {
			return description.trim().replaceAll("\\s+", " ");
		}
		return switch (scenario) {
			case "product-showcase" -> "这款商品质感出众，细节精致，适合日常使用。现在下单，体验更高级的生活方式。";
			case "store-traffic" -> "想吃一顿热乎又开胃的酸汤火锅，就来我们店。现熬酸汤，鲜爽开胃，朋友聚餐和家庭小聚都很合适，欢迎到店体验。";
			case "hot-replica" -> "这个爆款同款真的值得试试，核心卖点清晰，使用场景丰富，现在就来看看你的专属版本。";
			default -> "这款商品今天真的值得推荐，核心卖点清晰，使用体验很好，适合日常购买和分享。";
		};
	}

	private String scenarioName(String scenario) {
		return switch (scenario) {
			case "product-showcase" -> "商品展示";
			case "store-traffic" -> "门店引流";
			case "hot-replica" -> "爆款复刻";
			default -> "商品口播";
		};
	}

	private String scenarioInstruction(String scenario, boolean hasAvatar) {
		return switch (scenario) {
			case "product-showcase" -> hasAvatar
					? "镜头围绕数字人展示商品外观、细节、质感和使用场景展开，人物可手持、指向或站在商品旁讲解，商品是道具和卖点主体。"
					: "镜头围绕商品外观、细节、质感和使用场景展开，突出高级展示大片感。";
			case "store-traffic" -> "镜头突出门头、环境、服务、优惠和到店理由，由同一数字人完成口播引导，结尾给出同城到店行动引导。";
			case "hot-replica" -> "复刻爆款短视频的三段式结构：强钩子、密集卖点、转化 CTA；画面主体保持同一数字人，商品或门店素材作为道具/背景/转场参考。";
			default -> "生成数字人口播风格的带货视频，人物自然讲解商品卖点，字幕与口播同步。";
		};
	}

	private String cleanText(String value) {
		return value == null ? "" : value.trim();
	}

	private JsonNode exchange(String method, String path, JsonNode payload) {
		try {
			HttpRequest.Builder builder = HttpRequest.newBuilder()
					.uri(URI.create(trimTrailingSlash(properties.getBaseUrl()) + path))
					.timeout(Duration.ofMinutes(5))
					.header("Authorization", "Bearer " + properties.getApiKey())
					.header("Content-Type", "application/json");
			if ("POST".equals(method)) {
				builder.POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)));
			} else {
				builder.GET();
			}
			HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
			JsonNode body = response.body() == null || response.body().isBlank()
					? objectMapper.createObjectNode()
					: objectMapper.readTree(response.body());
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				String message = errorMessage(body);
				log.warn("Volcengine video API failed, method={}, path={}, status={}, message={}, body={}",
						method, path, response.statusCode(), message, body);
				throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, message.isBlank() ? "火山视频生成接口调用失败" : message);
			}
			return body;
		} catch (HttpTimeoutException e) {
			throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "火山视频生成任务创建超时，请减少图片数量或稍后重试", e);
		} catch (IOException e) {
			throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "火山视频生成接口响应解析失败", e);
		} catch (IllegalArgumentException e) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "火山视频生成服务地址配置无效，请检查 MOYA_VOLCENGINE_VIDEO_BASE_URL", e);
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "火山视频生成接口调用被中断", e);
		}
	}

	private void ensureEnabled() {
		if (!properties.isEnabled() || !hasApiKey()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, disabledMessage());
		}
		if (properties.getBaseUrl() == null || properties.getBaseUrl().isBlank()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "火山视频生成服务地址未配置，请检查 MOYA_VOLCENGINE_VIDEO_BASE_URL。");
		}
	}

	private boolean hasApiKey() {
		return properties.getApiKey() != null && !properties.getApiKey().isBlank();
	}

	private String disabledMessage() {
		if (!properties.isEnabled() && !hasApiKey()) {
			return "火山视频生成未启用，且未检测到 Ark API Key。当前 OSS/ICE 密钥不能替代火山 Ark Key，请在后台 .env 配置 MOYA_VOLCENGINE_VIDEO_ENABLED=true 和 MOYA_VOLCENGINE_ARK_API_KEY。";
		}
		if (!properties.isEnabled()) {
			return "火山视频生成开关未启用，请在后台 .env 配置 MOYA_VOLCENGINE_VIDEO_ENABLED=true。";
		}
		return "未检测到火山 Ark API Key，请在后台 .env 配置 MOYA_VOLCENGINE_ARK_API_KEY。";
	}

	private String normalizeModel(ProductVideoCreateRequest request) {
		if (usesReferenceContent(request)) {
			return "doubao-seedance-2-0-260128";
		}
		return normalizeModel(request.model());
	}

	private String normalizeModel(String requestedModel) {
		if (requestedModel != null && requestedModel.contains("2.0")) {
			return "doubao-seedance-2-0-260128";
		}
		if (requestedModel != null && requestedModel.contains("1.0")) {
			return "doubao-seedance-1-0-pro-250528";
		}
		if (requestedModel != null && requestedModel.contains("1.5")) {
			return "doubao-seedance-1-5-pro-251215";
		}
		return properties.getModel();
	}

	private boolean usesReferenceContent(ProductVideoCreateRequest request) {
		if (!cleanText(request.referenceVideoUrl()).isBlank()) {
			return true;
		}
		String firstFrameUrl = firstImageUrl(request.imageUrls());
		if (firstFrameUrl.isBlank()) {
			firstFrameUrl = firstImageUrl(request.imageUrls());
		}
		for (String referenceUrl : referenceImageUrls(request)) {
			if (!referenceUrl.equals(firstFrameUrl)) {
				return true;
			}
		}
		return false;
	}

	private String normalizeQuality(String quality) {
		return quality == null || quality.isBlank() ? "720p" : quality.trim();
	}

	private String normalizeRatio(String ratio) {
		return ratio == null || ratio.isBlank() ? "9:16" : ratio.trim();
	}

	private int durationSeconds(String duration) {
		if (duration == null || duration.isBlank()) return 5;
		String numeric = duration.replaceAll("[^0-9]", "");
		if (numeric.isBlank()) return 5;
		int seconds = Integer.parseInt(numeric);
		if (seconds <= 5) return 5;
		if (seconds <= 10) return 10;
		return 12;
	}

	private String findVideoUrl(JsonNode node) {
		String direct = firstText(node, "video_url", "videoUrl", "url");
		if (!direct.isBlank()) return direct;
		for (String key : List.of("content", "output", "result", "video")) {
			if (node.has(key)) {
				String nested = findVideoUrl(node.get(key));
				if (!nested.isBlank()) return nested;
			}
		}
		if (node.isArray()) {
			for (JsonNode child : node) {
				String nested = findVideoUrl(child);
				if (!nested.isBlank()) return nested;
			}
		}
		return "";
	}

	private String firstText(JsonNode node, String... fields) {
		if (node == null) return "";
		for (String field : fields) {
			JsonNode value = node.get(field);
			if (value != null && value.isTextual() && !value.asText().isBlank()) return value.asText();
		}
		return "";
	}

	private String errorMessage(JsonNode node) {
		if (node != null && node.isArray()) {
			for (JsonNode child : node) {
				String nested = errorMessage(child);
				if (!nested.isBlank()) return nested;
			}
		}
		String direct = firstText(node, "message", "error", "msg", "code");
		if (!direct.isBlank()) return direct;
		for (String key : List.of("error", "data", "detail")) {
			JsonNode child = node == null ? null : node.get(key);
			if (child == null) continue;
			String nested = errorMessage(child);
			if (!nested.isBlank()) return nested;
			if (child.isTextual() && !child.asText().isBlank()) return child.asText();
		}
		return "";
	}

	private boolean isRealPersonImageRejected(ResponseStatusException e) {
		String reason = e.getReason() == null ? "" : e.getReason().toLowerCase(Locale.ROOT);
		return reason.contains("input image may contain real person") || reason.contains("real person");
	}

	private String trimTrailingSlash(String value) {
		return value == null ? "" : value.replaceAll("/+$", "");
	}
}
