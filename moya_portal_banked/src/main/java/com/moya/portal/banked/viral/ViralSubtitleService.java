package com.moya.portal.banked.viral;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.aliyun.ice20201109.Client;
import com.aliyun.ice20201109.models.GetSmartHandleJobRequest;
import com.aliyun.ice20201109.models.GetSmartHandleJobResponse;
import com.aliyun.ice20201109.models.GetSmartHandleJobResponseBody;
import com.aliyun.ice20201109.models.SubmitASRJobRequest;
import com.aliyun.ice20201109.models.SubmitASRJobResponse;
import com.aliyun.tea.TeaException;
import com.aliyun.teaopenapi.models.Config;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.moya.portal.banked.fission.AliyunIceProperties;
import com.moya.portal.banked.storage.StorageProperties;
import com.moya.portal.banked.viral.dto.ViralSubtitleJobResponse;
import com.moya.portal.banked.viral.dto.ViralSubtitleRecognizeRequest;
import com.moya.portal.banked.viral.dto.ViralSubtitleSegment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ViralSubtitleService {

	private final AliyunIceProperties iceProperties;
	private final StorageProperties storageProperties;
	private final ObjectMapper objectMapper;

	public ViralSubtitleService(AliyunIceProperties iceProperties, StorageProperties storageProperties, ObjectMapper objectMapper) {
		this.iceProperties = iceProperties;
		this.storageProperties = storageProperties;
		this.objectMapper = objectMapper;
	}

	public ViralSubtitleJobResponse submit(ViralSubtitleRecognizeRequest request) {
		validateAliyunConfig();
		try {
			SubmitASRJobRequest aliyunRequest = new SubmitASRJobRequest()
					.setInputFile(toAliyunInputFile(request.mediaUrl()))
					.setTitle(isBlank(request.title()) ? "viral-subtitle" : trimToBytes(request.title(), 120))
					.setDescription("网感剪辑上传视频字幕断句");
			if (!isBlank(request.startTime())) {
				aliyunRequest.setStartTime(request.startTime().trim());
			}
			if (!isBlank(request.duration())) {
				aliyunRequest.setDuration(request.duration().trim());
			}
			SubmitASRJobResponse response = createClient().submitASRJob(aliyunRequest);
			String jobId = response.getBody() == null ? "" : response.getBody().getJobId();
			String state = response.getBody() == null ? "Submitted" : response.getBody().getState();
			return new ViralSubtitleJobResponse(jobId, normalizeStatus(state), false, false, List.of(), "", objectMapper.valueToTree(response.getBody()));
		} catch (ResponseStatusException exception) {
			throw exception;
		} catch (TeaException exception) {
			throw new ResponseStatusException(aliyunHttpStatus(exception), aliyunErrorMessage("提交阿里云字幕识别失败", exception), exception);
		} catch (Exception exception) {
			throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "提交阿里云字幕识别失败：" + exception.getMessage(), exception);
		}
	}

	public ViralSubtitleJobResponse getJob(String jobId) {
		if (isBlank(jobId)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JobId 不能为空");
		}
		validateAliyunConfig();
		try {
			GetSmartHandleJobResponse response = createClient().getSmartHandleJob(new GetSmartHandleJobRequest().setJobId(jobId));
			GetSmartHandleJobResponseBody body = response.getBody();
			String state = body == null ? "" : body.getState();
			String output = body == null ? "" : firstNotBlank(
					body.getOutput(),
					body.getJobResult() == null ? "" : body.getJobResult().getAiResult()
			);
			List<ViralSubtitleSegment> segments = parseSegments(output);
			boolean successful = isSuccessStatus(state) && !segments.isEmpty();
			boolean finished = successful || isFailureStatus(state);
			return new ViralSubtitleJobResponse(
					body == null ? jobId : firstNotBlank(body.getJobId(), jobId),
					normalizeStatus(state),
					finished,
					successful,
					segments,
					joinText(segments),
					objectMapper.valueToTree(body)
			);
		} catch (ResponseStatusException exception) {
			throw exception;
		} catch (TeaException exception) {
			throw new ResponseStatusException(aliyunHttpStatus(exception), aliyunErrorMessage("查询阿里云字幕识别失败", exception), exception);
		} catch (Exception exception) {
			throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "查询阿里云字幕识别失败：" + exception.getMessage(), exception);
		}
	}

	private List<ViralSubtitleSegment> parseSegments(String output) throws Exception {
		if (isBlank(output)) return List.of();
		JsonNode root = objectMapper.readTree(output);
		List<ViralSubtitleSegment> segments = new ArrayList<>();
		collectSegments(segments, root, 0);
		return segments;
	}

	private void collectSegments(List<ViralSubtitleSegment> segments, JsonNode root, int depth) throws Exception {
		if (root == null || root.isNull() || depth > 4) return;
		if (root.isArray()) {
			for (JsonNode item : root) {
				if (!addSegment(segments, item)) {
					collectSegments(segments, item, depth + 1);
				}
			}
			return;
		}
		if (root.isTextual() && (root.asText("").trim().startsWith("{") || root.asText("").trim().startsWith("["))) {
			collectSegments(segments, objectMapper.readTree(root.asText()), depth + 1);
			return;
		}
		if (root.isObject() && addSegment(segments, root)) return;
		for (String key : List.of("sentences", "Sentences", "segments", "Segments", "result", "Result", "data", "Data", "asr", "Asr", "transcripts", "Transcripts")) {
			JsonNode child = root.get(key);
			if (child != null) {
				collectSegments(segments, child, depth + 1);
			}
		}
	}

	private boolean addSegment(List<ViralSubtitleSegment> segments, JsonNode item) {
		if (item == null || !item.isObject()) return false;
		String text = firstNotBlank(textValue(item, "content"), textValue(item, "Content"), textValue(item, "text"), textValue(item, "Text"), textValue(item, "sentence"), textValue(item, "Sentence"), textValue(item, "word"), textValue(item, "Word"));
		double start = firstNumber(item, "from", "start", "begin", "BeginTime", "StartTime");
		double end = firstNumber(item, "to", "end", "EndTime", "End");
		if (start > 1000 || end > 1000) {
			start = start / 1000.0;
			end = end / 1000.0;
		}
		if (isBlank(text) || end <= start) return false;
		segments.add(new ViralSubtitleSegment(round(start), round(end), text.trim()));
		return true;
	}

	private String toAliyunInputFile(String mediaUrl) {
		String value = mediaUrl == null ? "" : mediaUrl.trim();
		if (value.startsWith("oss://")) return value;
		if (!value.startsWith("http://") && !value.startsWith("https://")) return value;
		try {
			URI uri = URI.create(value);
			String host = uri.getHost();
			if (host == null || host.isBlank()) return value;
			String bucket = storageProperties.getOss().getBucket();
			String path = trimSlashes(uri.getPath());
			if (path.isBlank()) return value;
			if (!bucket.isBlank() && host.toLowerCase(Locale.ROOT).startsWith((bucket + ".").toLowerCase(Locale.ROOT))) {
				return "oss://" + host + "/" + path;
			}
			return value;
		} catch (IllegalArgumentException exception) {
			return value;
		}
	}

	private Client createClient() throws Exception {
		Config config = new Config()
				.setAccessKeyId(iceProperties.getAccessKeyId())
				.setAccessKeySecret(iceProperties.getAccessKeySecret());
		config.endpoint = iceProperties.getEndpoint();
		return new Client(config);
	}

	private void validateAliyunConfig() {
		if (!iceProperties.isEnabled()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "阿里云 ICE 未启用，请配置 MOYA_ALIYUN_ICE_ENABLED=true");
		}
		if (isBlank(iceProperties.getAccessKeyId()) || isBlank(iceProperties.getAccessKeySecret())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "阿里云访问密钥未配置，无法调用智能字幕断句");
		}
	}

	private static String textValue(JsonNode item, String key) {
		JsonNode node = item.get(key);
		return node == null || node.isNull() ? "" : node.asText("");
	}

	private static double firstNumber(JsonNode item, String... keys) {
		for (String key : keys) {
			JsonNode node = item.get(key);
			if (node == null || node.isNull()) continue;
			if (node.isNumber()) return node.asDouble();
			double parsed = parseNumber(node.asText(""));
			if (parsed >= 0) return parsed;
		}
		return 0;
	}

	private static double parseNumber(String value) {
		if (isBlank(value)) return -1;
		try {
			return Double.parseDouble(value.trim());
		} catch (NumberFormatException ignored) {
			return -1;
		}
	}

	private static String joinText(List<ViralSubtitleSegment> segments) {
		StringBuilder builder = new StringBuilder();
		for (ViralSubtitleSegment segment : segments) {
			if (!builder.isEmpty()) builder.append('\n');
			builder.append(segment.text());
		}
		return builder.toString();
	}

	private static boolean isSuccessStatus(String status) {
		return "Finished".equalsIgnoreCase(status) || "Success".equalsIgnoreCase(status) || "Succeeded".equalsIgnoreCase(status);
	}

	private static boolean isFailureStatus(String status) {
		return "Failed".equalsIgnoreCase(status) || "Fail".equalsIgnoreCase(status) || "Error".equalsIgnoreCase(status);
	}

	private static String normalizeStatus(String status) {
		return isBlank(status) ? "Submitted" : status;
	}

	private static HttpStatus aliyunHttpStatus(TeaException exception) {
		if (exception.getStatusCode() != null && exception.getStatusCode() >= 400 && exception.getStatusCode() < 500) {
			return HttpStatus.BAD_REQUEST;
		}
		return HttpStatus.BAD_GATEWAY;
	}

	private static String aliyunErrorMessage(String prefix, TeaException exception) {
		String message = firstNotBlank(exception.getMessage(), exception.getData() == null ? "" : String.valueOf(exception.getData().get("Message")));
		String code = exception.getCode();
		return prefix + (isBlank(code) ? "" : "（" + code + "）") + (isBlank(message) ? "" : "：" + message);
	}

	private static String trimToBytes(String value, int maxChars) {
		if (value == null) return "";
		String trimmed = value.trim();
		return trimmed.length() <= maxChars ? trimmed : trimmed.substring(0, maxChars);
	}

	private static String trimSlashes(String value) {
		if (value == null) return "";
		return value.replaceAll("^/+", "").replaceAll("/+$", "");
	}

	private static double round(double value) {
		return Math.round(value * 1000.0) / 1000.0;
	}

	private static String firstNotBlank(String... values) {
		for (String value : values) {
			if (!isBlank(value)) return value;
		}
		return "";
	}

	private static boolean isBlank(String value) {
		return value == null || value.isBlank();
	}
}
