package com.moya.portal.banked.fission;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.aliyun.ice20201109.Client;
import com.aliyun.ice20201109.models.GetMediaProducingJobRequest;
import com.aliyun.ice20201109.models.GetMediaProducingJobResponse;
import com.aliyun.ice20201109.models.GetMediaProducingJobResponseBody.GetMediaProducingJobResponseBodyMediaProducingJob;
import com.aliyun.ice20201109.models.SubmitMediaProducingJobRequest;
import com.aliyun.ice20201109.models.SubmitMediaProducingJobResponse;
import com.aliyun.tea.TeaException;
import com.aliyun.teaopenapi.models.Config;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.moya.portal.banked.fission.dto.FissionMixRequest;
import com.moya.portal.banked.fission.dto.FissionMixJobStatusResponse;
import com.moya.portal.banked.fission.dto.FissionMixResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FissionMixService {

	private static final int DEFAULT_WIDTH = 720;
	private static final int DEFAULT_HEIGHT = 1280;
	private static final int DEFAULT_BITRATE = 6000;
	private static final double DEFAULT_SCENE_DURATION = 3.0;

	private final AliyunIceProperties properties;
	private final ObjectMapper objectMapper;

	public FissionMixService(AliyunIceProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
	}

	public FissionMixResponse produce(FissionMixRequest request) {
		JsonNode timeline = buildTimeline(request);
		JsonNode outputConfig = buildOutputMediaConfig(request);
		if (Boolean.TRUE.equals(request.dryRun())) {
			return new FissionMixResponse(null, request.outputMediaUrl(), timeline, outputConfig, false);
		}
		if (!properties.isEnabled()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "阿里云 ICE 未启用，请配置 MOYA_ALIYUN_ICE_ENABLED=true");
		}
		if (isBlank(properties.getAccessKeyId()) || isBlank(properties.getAccessKeySecret())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "阿里云访问密钥未配置");
		}

		try {
			Client client = createClient();
			SubmitMediaProducingJobRequest aliyunRequest = new SubmitMediaProducingJobRequest()
					.setTimeline(objectMapper.writeValueAsString(timeline))
					.setOutputMediaConfig(objectMapper.writeValueAsString(outputConfig));
			SubmitMediaProducingJobResponse aliyunResponse = client.submitMediaProducingJob(aliyunRequest);
			String jobId = aliyunResponse.getBody() == null ? null : aliyunResponse.getBody().getJobId();
			return new FissionMixResponse(jobId, request.outputMediaUrl(), timeline, outputConfig, true);
		} catch (ResponseStatusException exception) {
			throw exception;
		} catch (TeaException exception) {
			throw new ResponseStatusException(aliyunHttpStatus(exception), aliyunErrorMessage("提交阿里云混剪任务失败", exception), exception);
		} catch (Exception exception) {
			throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "提交阿里云混剪任务失败：" + exception.getMessage(), exception);
		}
	}

	public FissionMixJobStatusResponse getJobStatus(String jobId) {
		if (isBlank(jobId)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JobId 不能为空");
		}
		if (!properties.isEnabled()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "阿里云 ICE 未启用，请配置 MOYA_ALIYUN_ICE_ENABLED=true");
		}
		if (isBlank(properties.getAccessKeyId()) || isBlank(properties.getAccessKeySecret())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "阿里云访问密钥未配置");
		}

		try {
			Client client = createClient();
			GetMediaProducingJobResponse response = client.getMediaProducingJob(
					new GetMediaProducingJobRequest().setJobId(jobId)
			);
			GetMediaProducingJobResponseBodyMediaProducingJob job = response.getBody() == null
					? null
					: response.getBody().getMediaProducingJob();
			if (job == null) {
				throw new ResponseStatusException(HttpStatus.NOT_FOUND, "未查询到阿里云混剪任务：" + jobId);
			}
			String status = job.getStatus();
			boolean successful = isSuccessStatus(status);
			boolean finished = successful || isFailureStatus(status);
			return new FissionMixJobStatusResponse(
					job.getJobId(),
					status,
					job.getCode(),
					job.getMessage(),
					job.getMediaURL(),
					job.getDuration(),
					job.getCreateTime(),
					job.getCompleteTime(),
					finished,
					successful,
					objectMapper.valueToTree(job)
			);
		} catch (ResponseStatusException exception) {
			throw exception;
		} catch (TeaException exception) {
			throw new ResponseStatusException(aliyunHttpStatus(exception), aliyunErrorMessage("查询阿里云混剪任务失败", exception), exception);
		} catch (Exception exception) {
			throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "查询阿里云混剪任务失败：" + exception.getMessage(), exception);
		}
	}

	public JsonNode buildTimeline(FissionMixRequest request) {
		List<Map<String, Object>> videoClips = new ArrayList<>();
		List<Map<String, Object>> audioClips = new ArrayList<>();
		int variantIndex = Math.max(0, request.variantIndex() == null ? 0 : request.variantIndex());
		double cursor = 0;

		for (int groupIndex = 0; groupIndex < request.groups().size(); groupIndex++) {
			FissionMixRequest.ShotGroup group = request.groups().get(groupIndex);
			FissionMixRequest.VideoAsset video = pickVideo(group, variantIndex, groupIndex);
			FissionMixRequest.AudioAsset audio = pickAudio(group, request.audioItems(), variantIndex, groupIndex);
			validateCloudMediaUrl(video.mediaUrl(), "视频素材 " + video.name());
			if (audio != null) {
				validateCloudMediaUrl(audio.mediaUrl(), "音频素材 " + audio.name());
			}

			double videoDuration = firstPositive(parseDurationSeconds(video.duration()), parseDurationSeconds(group.duration()), DEFAULT_SCENE_DURATION);
			double audioDuration = audio == null ? 0 : firstPositive(parseDurationSeconds(audio.duration()), videoDuration);
			double sceneDuration = Boolean.TRUE.equals(settings(request).followAudioSpeed()) && audioDuration > 0
					? Math.min(videoDuration, audioDuration)
					: videoDuration;
			double audioClipDuration = audio == null ? 0 : Math.min(sceneDuration, audioDuration);
			String clipId = "scene-" + (group.sceneNo() == null ? groupIndex + 1 : group.sceneNo());

			Map<String, Object> videoClip = new LinkedHashMap<>();
			videoClip.put("ClipId", clipId);
			videoClip.put("MediaURL", video.mediaUrl());
			videoClip.put("Type", "Video");
			videoClip.put("TimelineIn", round(cursor));
			videoClip.put("TimelineOut", round(cursor + sceneDuration));
			videoClip.put("In", 0);
			videoClip.put("Out", round(sceneDuration));
			videoClip.put("AdaptMode", "Cover");
			videoClip.put("Width", 0.9999);
			videoClip.put("Height", 0.9999);
			videoClip.put("X", 0);
			videoClip.put("Y", 0);
			if (Boolean.FALSE.equals(settings(request).retainOriginalAudio())) {
				videoClip.put("Effects", List.of(Map.of("Type", "Volume", "Gain", 0)));
			} else if (Boolean.TRUE.equals(settings(request).ducking()) && audio != null) {
				videoClip.put("Effects", List.of(Map.of("Type", "Volume", "Gain", 0.2)));
			}
			videoClips.add(videoClip);

			if (audio != null) {
				Map<String, Object> audioClip = new LinkedHashMap<>();
				audioClip.put("ClipId", "audio-" + clipId);
				audioClip.put("ReferenceClipId", clipId);
				audioClip.put("MediaURL", audio.mediaUrl());
				audioClip.put("Type", "Audio");
				audioClip.put("TimelineIn", round(cursor));
				audioClip.put("TimelineOut", round(cursor + audioClipDuration));
				audioClip.put("In", 0);
				audioClip.put("Out", round(audioClipDuration));
				List<Map<String, Object>> effects = new ArrayList<>();
				effects.add(Map.of("Type", "Volume", "Gain", normalizedVolume(audio.volume(), settings(request).volume()) / 100.0));
				if (Boolean.TRUE.equals(settings(request).fadeInOut())) {
					effects.add(Map.of("Type", "AFade", "SubType", "In", "Duration", 0.3));
					effects.add(Map.of("Type", "AFade", "SubType", "Out", "Duration", 0.3));
				}
				audioClip.put("Effects", effects);
				audioClips.add(audioClip);
			}

			cursor += sceneDuration;
		}

		Map<String, Object> timeline = new LinkedHashMap<>();
		timeline.put("VideoTracks", List.of(Map.of("VideoTrackClips", videoClips)));
		if (!audioClips.isEmpty()) {
			timeline.put("AudioTracks", List.of(Map.of("AudioTrackClips", audioClips)));
		}
		return objectMapper.valueToTree(timeline);
	}

	private Client createClient() throws Exception {
		Config config = new Config()
				.setAccessKeyId(properties.getAccessKeyId())
				.setAccessKeySecret(properties.getAccessKeySecret());
		config.endpoint = properties.getEndpoint();
		return new Client(config);
	}

	private JsonNode buildOutputMediaConfig(FissionMixRequest request) {
		FissionMixRequest.MixSettings settings = settings(request);
		Map<String, Object> config = new LinkedHashMap<>();
		config.put("MediaURL", request.outputMediaUrl());
		config.put("Width", positiveOr(settings.width(), DEFAULT_WIDTH));
		config.put("Height", positiveOr(settings.height(), DEFAULT_HEIGHT));
		config.put("Bitrate", positiveOr(settings.bitrate(), DEFAULT_BITRATE));
		return objectMapper.valueToTree(config);
	}

	private FissionMixRequest.VideoAsset pickVideo(FissionMixRequest.ShotGroup group, int variantIndex, int groupIndex) {
		if (group.clips() == null || group.clips().isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "分镜「" + group.title() + "」缺少视频素材");
		}
		return group.clips().get(Math.floorMod(variantIndex + groupIndex, group.clips().size()));
	}

	private FissionMixRequest.AudioAsset pickAudio(
			FissionMixRequest.ShotGroup group,
			List<FissionMixRequest.AudioAsset> globalAudios,
			int variantIndex,
			int groupIndex
	) {
		List<FissionMixRequest.AudioAsset> groupAudios = group.groupAudios();
		if (groupAudios != null && !groupAudios.isEmpty()) {
			return groupAudios.get(Math.floorMod(variantIndex, groupAudios.size()));
		}
		if (globalAudios != null && !globalAudios.isEmpty()) {
			return globalAudios.get(Math.floorMod(variantIndex + groupIndex, globalAudios.size()));
		}
		return null;
	}

	private FissionMixRequest.MixSettings settings(FissionMixRequest request) {
		FissionMixRequest.MixSettings settings = request.settings();
		return settings == null
				? new FissionMixRequest.MixSettings(true, true, true, true, 100, DEFAULT_WIDTH, DEFAULT_HEIGHT, DEFAULT_BITRATE)
				: settings;
	}

	private void validateCloudMediaUrl(String mediaUrl, String label) {
		if (isBlank(mediaUrl) || !(mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://") || mediaUrl.startsWith("oss://"))) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " 需要 OSS 或公网 MediaURL，不能使用本地文件路径");
		}
	}

	private int normalizedVolume(Integer itemVolume, Integer settingsVolume) {
		int base = positiveOr(settingsVolume, 100);
		int item = positiveOr(itemVolume, 100);
		return Math.max(0, Math.min(100, Math.round(base * item / 100.0f)));
	}

	private int positiveOr(Integer value, int fallback) {
		return value == null || value <= 0 ? fallback : value;
	}

	private double firstPositive(double... values) {
		for (double value : values) {
			if (value > 0) return value;
		}
		return DEFAULT_SCENE_DURATION;
	}

	private double parseDurationSeconds(String value) {
		if (isBlank(value)) return 0;
		String trimmed = value.trim();
		int rangeIndex = Math.max(trimmed.indexOf('-'), trimmed.indexOf('~'));
		if (rangeIndex > 0) {
			return parseDurationSeconds(trimmed.substring(0, rangeIndex));
		}
		if (trimmed.matches("\\d{1,2}:\\d{2}(:\\d{2})?")) {
			String[] parts = trimmed.split(":");
			if (parts.length == 2) {
				return Integer.parseInt(parts[0]) * 60.0 + Integer.parseInt(parts[1]);
			}
			return Integer.parseInt(parts[0]) * 3600.0 + Integer.parseInt(parts[1]) * 60.0 + Integer.parseInt(parts[2]);
		}
		String numeric = trimmed.replaceAll("[^0-9.]", "");
		if (numeric.isEmpty()) return 0;
		try {
			return Double.parseDouble(numeric);
		} catch (NumberFormatException exception) {
			return 0;
		}
	}

	private double round(double value) {
		return Math.round(value * 1000.0) / 1000.0;
	}

	private boolean isBlank(String value) {
		return value == null || value.trim().isEmpty();
	}

	private HttpStatus aliyunHttpStatus(TeaException exception) {
		if (exception.getStatusCode() != null) {
			HttpStatus status = HttpStatus.resolve(exception.getStatusCode());
			if (status != null) return status;
		}
		if (exception.getCode() != null && exception.getCode().toLowerCase().contains("forbidden")) {
			return HttpStatus.FORBIDDEN;
		}
		return HttpStatus.BAD_GATEWAY;
	}

	private String aliyunErrorMessage(String prefix, TeaException exception) {
		String code = isBlank(exception.getCode()) ? "UNKNOWN" : exception.getCode();
		String message = firstText(exception.getDescription(), exception.getMessage(), exception.message);
		String requestId = aliyunRequestId(exception);
		String action = "";
		if (HttpStatus.FORBIDDEN.equals(aliyunHttpStatus(exception)) || code.toLowerCase().contains("forbidden")) {
			action = "。请在阿里云 RAM 为当前 AccessKey 所属用户/角色授予 ICE 混剪权限，并确认智能媒体服务已完成 OSS 访问授权";
		}
		return prefix + "：code=" + code + (isBlank(message) ? "" : "，" + message)
				+ (isBlank(requestId) ? "" : "，requestId=" + requestId) + action;
	}

	private String aliyunRequestId(TeaException exception) {
		if (exception.getData() == null) return "";
		Object requestId = exception.getData().get("RequestId");
		if (requestId == null) requestId = exception.getData().get("requestId");
		return requestId == null ? "" : requestId.toString();
	}

	private String firstText(String... values) {
		for (String value : values) {
			if (!isBlank(value)) return value;
		}
		return "";
	}

	private boolean isSuccessStatus(String status) {
		if (status == null) return false;
		String normalized = status.trim().toLowerCase();
		return normalized.equals("success") || normalized.equals("succeeded") || normalized.equals("finished");
	}

	private boolean isFailureStatus(String status) {
		if (status == null) return false;
		String normalized = status.trim().toLowerCase();
		return normalized.equals("failed") || normalized.equals("fail") || normalized.equals("error") || normalized.equals("canceled");
	}
}
