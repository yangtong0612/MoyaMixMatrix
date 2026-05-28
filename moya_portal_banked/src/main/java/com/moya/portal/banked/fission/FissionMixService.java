package com.moya.portal.banked.fission;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

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
	private static final double SUBTITLE_MASK_CROP_HEIGHT_RATIO = 0.86;
	private static final double PRESENTER_MIN_EFFECTIVE_SPEECH_SECONDS = 0.45;
	private static final double PRESENTER_OVERLONG_CLIP_THRESHOLD_SECONDS = 0.55;
	private static final double PRESENTER_OVERLONG_AUDIO_THRESHOLD_SECONDS = 1.15;
	private static final SpeechWindow EMPTY_SPEECH_WINDOW = new SpeechWindow(0, 0, 0, 0);
	private static final Set<String> GENERIC_MATCH_TOKENS = Set.of(
			"scene", "clip", "audio", "video", "mix", "group", "voice", "music", "bgm",
			"音频", "视频", "素材", "片段", "镜头", "分镜", "混剪"
	);

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
			VariantSelection selection = pickVariantSelection(group, List.of(), variantIndex, groupIndex);
			FissionMixRequest.VideoAsset video = selection.video();
			FissionMixRequest.AudioAsset audio = selection.audio();
			validateCloudMediaUrl(video.mediaUrl(), "视频素材 " + video.name());
			if (audio != null) {
				validateCloudMediaUrl(audio.mediaUrl(), "音频素材 " + audio.name());
			}

			double videoDuration = firstPositive(parseDurationSeconds(video.duration()), parseDurationSeconds(group.duration()), DEFAULT_SCENE_DURATION);
			SpeechWindow audioSpeechWindow = audio == null ? EMPTY_SPEECH_WINDOW : resolveSpeechWindow(audio, videoDuration);
			double audioDuration = audio == null ? 0 : firstPositive(audioSpeechWindow.effectiveDuration(), parseDurationSeconds(audio.duration()), videoDuration);
			boolean lockSceneToAudio = selection.voiceLocked() && audioDuration > 0;
			double sceneDuration = (Boolean.TRUE.equals(settings(request).followAudioSpeed()) || lockSceneToAudio) && audioDuration > 0
					? Math.min(videoDuration, audioDuration)
					: videoDuration;
			double audioClipDuration = audio == null ? 0 : Math.min(sceneDuration, audioDuration);
			double presenterSourceIn = lockSceneToAudio
					? clampDuration(audioSpeechWindow.speechStart(), 0, Math.max(0, videoDuration - sceneDuration))
					: 0;
			String clipId = "scene-" + (group.sceneNo() == null ? groupIndex + 1 : group.sceneNo());

			Map<String, Object> videoClip = new LinkedHashMap<>();
			videoClip.put("ClipId", clipId);
			videoClip.put("MediaURL", video.mediaUrl());
			videoClip.put("Type", "Video");
			videoClip.put("TimelineIn", round(cursor));
			videoClip.put("TimelineOut", round(cursor + sceneDuration));
			videoClip.put("In", round(presenterSourceIn));
			videoClip.put("Out", round(clampDuration(presenterSourceIn + sceneDuration, presenterSourceIn, videoDuration)));
			videoClip.put("AdaptMode", "Cover");
			videoClip.put("Width", 0.9999);
			videoClip.put("Height", 0.9999);
			videoClip.put("X", 0);
			videoClip.put("Y", 0);
			List<Map<String, Object>> videoEffects = new ArrayList<>();
			if (Boolean.TRUE.equals(settings(request).maskSubtitles())) {
				videoEffects.add(Map.of(
						"Type", "Crop",
						"X", 0,
						"Y", 0,
						"Width", 1,
						"Height", SUBTITLE_MASK_CROP_HEIGHT_RATIO
				));
			}
			if (Boolean.FALSE.equals(settings(request).retainOriginalAudio()) || lockSceneToAudio) {
				videoEffects.add(Map.of("Type", "Volume", "Gain", 0));
			} else if (Boolean.TRUE.equals(settings(request).ducking()) && audio != null) {
				videoEffects.add(Map.of("Type", "Volume", "Gain", 0.2));
			}
			if (!videoEffects.isEmpty()) {
				videoClip.put("Effects", videoEffects);
			}
			videoClips.add(videoClip);

			if (audio != null) {
				double audioSourceIn = lockSceneToAudio
						? clampDuration(audioSpeechWindow.speechStart(), 0, Math.max(0, audioSpeechWindow.rawDuration() - audioClipDuration))
						: 0;
				double audioSourceOut = lockSceneToAudio
						? clampDuration(audioSourceIn + audioClipDuration, audioSourceIn, audioSpeechWindow.rawDuration())
						: audioClipDuration;
				Map<String, Object> audioClip = new LinkedHashMap<>();
				audioClip.put("ClipId", "audio-" + clipId);
				audioClip.put("ReferenceClipId", clipId);
				audioClip.put("MediaURL", audio.mediaUrl());
				audioClip.put("Type", "Audio");
				audioClip.put("TimelineIn", round(cursor));
				audioClip.put("TimelineOut", round(cursor + audioClipDuration));
				audioClip.put("In", round(audioSourceIn));
				audioClip.put("Out", round(audioSourceOut));
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

		List<Map<String, Object>> bgmClips = buildBackgroundMusicClips(request.bgmItems(), cursor, request);
		Map<String, Object> timeline = new LinkedHashMap<>();
		timeline.put("VideoTracks", List.of(Map.of("VideoTrackClips", videoClips)));
		if (!audioClips.isEmpty() || !bgmClips.isEmpty()) {
			List<Map<String, Object>> audioTracks = new ArrayList<>();
			if (!audioClips.isEmpty()) {
				audioTracks.add(Map.of("AudioTrackClips", audioClips));
			}
			if (!bgmClips.isEmpty()) {
				audioTracks.add(Map.of("AudioTrackClips", bgmClips));
			}
			timeline.put("AudioTracks", audioTracks);
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

	private VariantSelection pickVariantSelection(
			FissionMixRequest.ShotGroup group,
			List<FissionMixRequest.AudioAsset> globalAudios,
			int variantIndex,
			int groupIndex
	) {
		if (group.clips() == null || group.clips().isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "分镜「" + group.title() + "」缺少视频素材");
		}

		String selectionProfile = normalizeSelectionProfile(group);
		List<AudioCandidate> groupCandidates = buildAudioCandidates(group.groupAudios(), "group");
		List<AudioCandidate> globalCandidates = buildAudioCandidates(globalAudios, "global");
		int cursor = Math.max(0, variantIndex + groupIndex);
		int anchorSize = Math.max(1, Math.max(group.clips().size(), groupCandidates.size() + globalCandidates.size()));
		FissionMixRequest.VideoAsset video = group.clips().get(
				isPresenterSelectionProfile(selectionProfile)
						? alignedPoolIndex(cursor, group.clips().size(), anchorSize)
						: positiveModulo(cursor, group.clips().size())
		);
		AudioCandidate audioCandidate = pickAudioCandidate(selectionProfile, group, video, groupCandidates, globalCandidates, cursor);
		boolean voiceLocked = audioCandidate != null && isPresenterSelectionProfile(selectionProfile) && isVoiceLikeUsage(audioCandidate.usageType());
		return new VariantSelection(video, audioCandidate == null ? null : audioCandidate.audio(), selectionProfile, voiceLocked);
	}

	private List<AudioCandidate> buildAudioCandidates(List<FissionMixRequest.AudioAsset> audios, String source) {
		if (audios == null || audios.isEmpty()) return List.of();
		List<AudioCandidate> candidates = new ArrayList<>();
		for (int index = 0; index < audios.size(); index++) {
			FissionMixRequest.AudioAsset audio = audios.get(index);
			candidates.add(new AudioCandidate(audio, source, normalizeUsageType(audio, source), index));
		}
		return candidates;
	}

	private List<Map<String, Object>> buildBackgroundMusicClips(
			List<FissionMixRequest.AudioAsset> bgmItems,
			double totalDuration,
			FissionMixRequest request
	) {
		if (bgmItems == null || bgmItems.isEmpty() || totalDuration <= 0.05) {
			return List.of();
		}
		List<FissionMixRequest.AudioAsset> usableItems = bgmItems.stream()
				.filter(Objects::nonNull)
				.filter(item -> item.mediaUrl() != null && !item.mediaUrl().isBlank())
				.toList();
		if (usableItems.isEmpty()) {
			return List.of();
		}

		List<Map<String, Object>> clips = new ArrayList<>();
		double cursor = 0;
		int bgmIndex = 0;
		while (cursor < totalDuration - 0.01) {
			FissionMixRequest.AudioAsset bgm = usableItems.get(bgmIndex % usableItems.size());
			validateCloudMediaUrl(bgm.mediaUrl(), "全局BGM " + bgm.name());
			double remaining = totalDuration - cursor;
			double sourceDuration = firstPositive(parseDurationSeconds(bgm.duration()), remaining, DEFAULT_SCENE_DURATION);
			double clipDuration = Math.max(0.1, Math.min(sourceDuration, remaining));

			Map<String, Object> audioClip = new LinkedHashMap<>();
			audioClip.put("ClipId", "bgm-" + (bgmIndex + 1));
			audioClip.put("MediaURL", bgm.mediaUrl());
			audioClip.put("Type", "Audio");
			audioClip.put("TimelineIn", round(cursor));
			audioClip.put("TimelineOut", round(cursor + clipDuration));
			audioClip.put("In", 0);
			audioClip.put("Out", round(clipDuration));
			List<Map<String, Object>> effects = new ArrayList<>();
			effects.add(Map.of("Type", "Volume", "Gain", normalizedVolume(bgm.volume(), settings(request).volume()) / 100.0));
			if (Boolean.TRUE.equals(settings(request).fadeInOut())) {
				double fadeDuration = Math.min(0.6, Math.max(0.12, clipDuration / 2));
				if (cursor <= 0.01) {
					effects.add(Map.of("Type", "AFade", "SubType", "In", "Duration", round(fadeDuration)));
				}
				if (cursor + clipDuration >= totalDuration - 0.01) {
					effects.add(Map.of("Type", "AFade", "SubType", "Out", "Duration", round(fadeDuration)));
				}
			}
			audioClip.put("Effects", effects);
			clips.add(audioClip);

			cursor += clipDuration;
			bgmIndex += 1;
		}
		return clips;
	}

	private AudioCandidate pickAudioCandidate(
			String selectionProfile,
			FissionMixRequest.ShotGroup group,
			FissionMixRequest.VideoAsset video,
			List<AudioCandidate> groupCandidates,
			List<AudioCandidate> globalCandidates,
			int cursor
	) {
		for (List<AudioCandidate> pool : buildAudioPriorityPools(selectionProfile, groupCandidates, globalCandidates)) {
			if (pool.isEmpty()) continue;
			int desiredIndex = alignedPoolIndex(cursor, pool.size(), Math.max(1, Math.max(group.clips().size(), pool.size())));
			AudioCandidate best = null;
			int bestScore = Integer.MIN_VALUE;
			int bestDistance = Integer.MAX_VALUE;
			for (int poolIndex = 0; poolIndex < pool.size(); poolIndex++) {
				AudioCandidate candidate = pool.get(poolIndex);
				int score = scoreAudioCandidate(candidate, video, group, selectionProfile);
				int distance = circularDistance(poolIndex, desiredIndex, pool.size());
				if (best == null
						|| score > bestScore
						|| (score == bestScore && distance < bestDistance)
						|| (score == bestScore && distance == bestDistance && preferCandidate(candidate, best))) {
					best = candidate;
					bestScore = score;
					bestDistance = distance;
				}
			}
			if (best != null) return best;
		}
		return null;
	}

	private List<List<AudioCandidate>> buildAudioPriorityPools(
			String selectionProfile,
			List<AudioCandidate> groupCandidates,
			List<AudioCandidate> globalCandidates
	) {
		List<AudioCandidate> groupAi = filterByUsage(groupCandidates, "ai_voice");
		List<AudioCandidate> globalAi = filterByUsage(globalCandidates, "ai_voice");
		List<AudioCandidate> groupVoice = filterByUsage(groupCandidates, "voice");
		List<AudioCandidate> globalVoice = filterByUsage(globalCandidates, "voice");
		List<AudioCandidate> groupUnknown = filterByUsage(groupCandidates, "unknown");
		List<AudioCandidate> globalUnknown = filterByUsage(globalCandidates, "unknown");
		List<AudioCandidate> groupMusicLike = filterMusicLike(groupCandidates);
		List<AudioCandidate> globalMusicLike = filterMusicLike(globalCandidates);

		if ("digital_human".equals(selectionProfile)) {
			return List.of(
					mergeCandidates(groupAi, globalAi),
					mergeCandidates(groupVoice, globalVoice),
					mergeCandidates(groupUnknown, globalUnknown),
					mergeCandidates(groupMusicLike, globalMusicLike)
			);
		}

		if ("human_presenter".equals(selectionProfile)) {
			return List.of(
					mergeCandidates(mergeCandidates(groupVoice, groupAi), mergeCandidates(globalVoice, globalAi)),
					mergeCandidates(groupUnknown, globalUnknown),
					mergeCandidates(groupMusicLike, globalMusicLike)
			);
		}

		return List.of(
				mergeCandidates(mergeCandidates(groupAi, groupVoice), mergeCandidates(groupUnknown, groupMusicLike)),
				mergeCandidates(mergeCandidates(globalAi, globalVoice), globalUnknown),
				globalMusicLike
		);
	}

	private List<AudioCandidate> mergeCandidates(List<AudioCandidate> left, List<AudioCandidate> right) {
		List<AudioCandidate> merged = new ArrayList<>(left.size() + right.size());
		merged.addAll(left);
		merged.addAll(right);
		return merged;
	}

	private List<AudioCandidate> filterByUsage(List<AudioCandidate> candidates, String usageType) {
		return candidates.stream().filter((candidate) -> usageType.equals(candidate.usageType())).toList();
	}

	private List<AudioCandidate> filterMusicLike(List<AudioCandidate> candidates) {
		return candidates.stream()
				.filter((candidate) -> "music".equals(candidate.usageType()) || "effect".equals(candidate.usageType()))
				.toList();
	}

	private boolean preferCandidate(AudioCandidate left, AudioCandidate right) {
		if (!left.source().equals(right.source())) return "group".equals(left.source());
		return left.originalIndex() < right.originalIndex();
	}

	private int scoreAudioCandidate(
			AudioCandidate candidate,
			FissionMixRequest.VideoAsset video,
			FissionMixRequest.ShotGroup group,
			String selectionProfile
	) {
		boolean voiceLike = isVoiceLikeUsage(candidate.usageType());
		int score = usageBaseScore(candidate.usageType(), selectionProfile);
		if ("group".equals(candidate.source())) score += "human_presenter".equals(selectionProfile) ? 12 : 8;
		if (!"standard".equals(selectionProfile)) score += voiceLike ? 22 : -28;

		String audioStem = mediaStem(candidate.audio().name());
		String videoStem = mediaStem(video == null ? null : video.name());
		List<String> audioTokens = mediaTokens(firstText(candidate.audio().matchKey(), candidate.audio().name()));
		List<String> videoTokens = mediaTokens(firstText(video == null ? "" : video.matchKey(), video == null ? "" : video.name()));
		List<String> groupTokens = mediaTokens(firstText(group.title(), "") + " " + firstText(group.script(), "") + " " + firstText(group.voiceover(), ""));
		List<String> filteredAudioTokens = filterGenericTokens(audioTokens);
		List<String> filteredVideoTokens = filterGenericTokens(videoTokens);
		List<String> filteredGroupTokens = filterGenericTokens(groupTokens);

		if (!isBlank(audioStem) && audioStem.equals(videoStem)) {
			score += 80;
		}

		score += intersectCount(filteredAudioTokens, filteredVideoTokens) * 16;
		score += intersectCount(filteredAudioTokens, filteredGroupTokens) * 4;

		String audioSceneToken = firstMatchingToken(audioTokens, "scene");
		String videoSceneToken = firstMatchingToken(videoTokens, "scene");
		if (!isBlank(audioSceneToken) && audioSceneToken.equals(videoSceneToken)) score += 34;

		String audioVersionToken = firstVersionToken(audioTokens);
		String videoVersionToken = firstVersionToken(videoTokens);
		if (!isBlank(audioVersionToken) && audioVersionToken.equals(videoVersionToken)) score += 24;

		double preferredDuration = firstPositive(parseDurationSeconds(video == null ? null : video.duration()), parseDurationSeconds(group.duration()));
		SpeechWindow speechWindow = resolveSpeechWindow(candidate.audio(), preferredDuration);
		double audioDuration = firstPositive(speechWindow.effectiveDuration(), parseDurationSeconds(candidate.audio().duration()));
		if (audioDuration > 0 && preferredDuration > 0) {
			double diff = Math.abs(audioDuration - preferredDuration);
			if (diff <= 0.25) score += voiceLike && isPresenterSelectionProfile(selectionProfile) ? 34 : 18;
			else if (diff <= 0.8) score += voiceLike && isPresenterSelectionProfile(selectionProfile) ? 24 : 12;
			else if (diff <= 1.6) score += voiceLike && isPresenterSelectionProfile(selectionProfile) ? 14 : 6;
			else if (diff <= 2.8) score += 2;
			else if (voiceLike && isPresenterSelectionProfile(selectionProfile)) score -= Math.min(24, (int) Math.round(diff * 4));
			score += presenterSpeechAlignmentPenalty(preferredDuration, candidate.audio(), selectionProfile, candidate.usageType());
		}
		return score;
	}

	private int usageBaseScore(String usageType, String selectionProfile) {
		if ("digital_human".equals(selectionProfile)) {
			if ("ai_voice".equals(usageType)) return 120;
			if ("voice".equals(usageType)) return 96;
			if ("unknown".equals(usageType)) return 64;
			if ("music".equals(usageType)) return 18;
			return 10;
		}
		if ("human_presenter".equals(selectionProfile)) {
			if ("voice".equals(usageType)) return 112;
			if ("ai_voice".equals(usageType)) return 108;
			if ("unknown".equals(usageType)) return 60;
			if ("music".equals(usageType)) return 22;
			return 16;
		}
		if ("ai_voice".equals(usageType)) return 90;
		if ("voice".equals(usageType)) return 82;
		if ("unknown".equals(usageType)) return 58;
		if ("music".equals(usageType)) return 40;
		return 24;
	}

	private String normalizeSelectionProfile(FissionMixRequest.ShotGroup group) {
		String explicit = firstText(group.contentProfile()).trim().toLowerCase(Locale.ROOT);
		if ("digital_human".equals(explicit)) return "digital_human";
		if ("human_presenter".equals(explicit) || "presenter".equals(explicit) || "human".equals(explicit)) return "human_presenter";
		String text = String.join(" ", firstText(group.title()), firstText(group.script()), firstText(group.voiceover()),
				group.clips() == null ? "" : group.clips().stream().map(FissionMixRequest.VideoAsset::name).reduce("", (left, right) -> left + " " + right));
		String normalized = text.toLowerCase(Locale.ROOT);
		if (normalized.matches(".*(数字人|虚拟人|虚拟主播|虚拟讲解|digital\\s*human|avatar|metahuman|ai主播).*")) {
			return "digital_human";
		}
		return normalized.matches(".*(真人|人物|人像|出镜|露脸|口播|讲解|解说|主持|主播|采访|试用|体验|模特|达人|博主|上脸|自拍|vlog|presenter|host|speaker|talking\\s*head|onscreen|person).*")
				? "human_presenter"
				: "standard";
	}

	private String normalizeUsageType(FissionMixRequest.AudioAsset audio, String source) {
		String explicit = firstText(audio.usageType()).toLowerCase(Locale.ROOT);
		if (explicit.equals("ai_voice") || explicit.equals("voice") || explicit.equals("music") || explicit.equals("effect") || explicit.equals("unknown")) {
			return explicit;
		}
		String text = (firstText(audio.name()) + " " + firstText(audio.mediaUrl())).toLowerCase(Locale.ROOT);
		if (text.matches(".*((^|[\\s_-])(ai|tts)([\\s_-]|$)|数字人|ai配音|智能配音|voiceover|speech|synthetic).*")) return "ai_voice";
		if (text.matches(".*(配音|旁白|口播|讲解|解说|人声|主播|台词|narrat|voice|speech|dub).*")) return "voice";
		if (text.matches(".*(bgm|伴奏|纯音乐|音乐|music|beat|loop|song|melody|instrumental).*")) return "music";
		if (text.matches(".*(音效|效果|sfx|fx|effect).*")) return "effect";
		return "group".equals(source) ? "voice" : "unknown";
	}

	private boolean isVoiceLikeUsage(String usageType) {
		return "ai_voice".equals(usageType) || "voice".equals(usageType);
	}

	private boolean isPresenterSelectionProfile(String selectionProfile) {
		return "digital_human".equals(selectionProfile) || "human_presenter".equals(selectionProfile);
	}

	private FissionMixRequest.MixSettings settings(FissionMixRequest request) {
		FissionMixRequest.MixSettings settings = request.settings();
		return settings == null
				? new FissionMixRequest.MixSettings(true, true, true, true, 100, false, DEFAULT_WIDTH, DEFAULT_HEIGHT, DEFAULT_BITRATE)
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

	private int positiveModulo(int value, int divisor) {
		if (divisor <= 0) return 0;
		return ((value % divisor) + divisor) % divisor;
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

	private SpeechWindow resolveSpeechWindow(FissionMixRequest.AudioAsset audio, double fallbackDuration) {
		if (audio == null) return EMPTY_SPEECH_WINDOW;
		double speechStart = clampDuration(audio.speechStart() == null ? 0 : audio.speechStart(), 0, Double.MAX_VALUE);
		double rawDuration = firstPositive(
				parseDurationSeconds(audio.duration()),
				audio.speechEnd() == null ? 0 : audio.speechEnd(),
				speechStart + (audio.speechDuration() == null ? 0 : audio.speechDuration()),
				audio.speechDuration() == null ? 0 : audio.speechDuration(),
				fallbackDuration
		);
		if (!(rawDuration > 0)) return EMPTY_SPEECH_WINDOW;
		speechStart = clampDuration(speechStart, 0, rawDuration);
		double speechDuration = audio.speechDuration() == null ? 0 : audio.speechDuration();
		double speechEnd = audio.speechEnd() != null
				? clampDuration(audio.speechEnd(), speechStart, rawDuration)
				: clampDuration(speechStart + firstPositive(speechDuration, parseDurationSeconds(audio.duration()), fallbackDuration), speechStart, rawDuration);
		double effectiveDuration = speechEnd > speechStart
				? speechEnd - speechStart
				: firstPositive(speechDuration, parseDurationSeconds(audio.duration()), fallbackDuration);
		effectiveDuration = clampDuration(effectiveDuration, 0, Math.max(0, rawDuration - speechStart));
		if (!(effectiveDuration >= PRESENTER_MIN_EFFECTIVE_SPEECH_SECONDS)) {
			double fallback = clampDuration(firstPositive(parseDurationSeconds(audio.duration()), fallbackDuration), 0, rawDuration);
			return new SpeechWindow(rawDuration, 0, fallback, fallback);
		}
		double normalizedSpeechEnd = clampDuration(speechStart + effectiveDuration, speechStart, rawDuration);
		return new SpeechWindow(rawDuration, speechStart, normalizedSpeechEnd, Math.max(0, normalizedSpeechEnd - speechStart));
	}

	private int presenterSpeechAlignmentPenalty(
			double clipDurationSeconds,
			FissionMixRequest.AudioAsset audio,
			String selectionProfile,
			String usageType
	) {
		if (!isPresenterSelectionProfile(selectionProfile) || !isVoiceLikeUsage(usageType)) return 0;
		SpeechWindow speechWindow = resolveSpeechWindow(audio, clipDurationSeconds);
		if (!(clipDurationSeconds > 0) || !(speechWindow.effectiveDuration() > 0)) return 0;

		double clipLongerThanSpeech = clipDurationSeconds - speechWindow.effectiveDuration();
		if (clipLongerThanSpeech > PRESENTER_OVERLONG_CLIP_THRESHOLD_SECONDS) {
			return -Math.min(54, (int) Math.round(clipLongerThanSpeech * 12));
		}

		double speechLongerThanClip = speechWindow.effectiveDuration() - clipDurationSeconds;
		if (speechLongerThanClip > PRESENTER_OVERLONG_AUDIO_THRESHOLD_SECONDS) {
			return -Math.min(30, (int) Math.round(speechLongerThanClip * 6));
		}
		return 0;
	}

	private double clampDuration(double value, double min, double max) {
		if (!Double.isFinite(value)) return min;
		return Math.min(max, Math.max(min, value));
	}

	private int alignedPoolIndex(int variantIndex, int size, int anchorSize) {
		if (size <= 1) return 0;
		int safeAnchor = Math.max(1, anchorSize);
		double normalized = (positiveModulo(variantIndex, safeAnchor) + 0.5) / safeAnchor;
		return Math.min(size - 1, (int) Math.floor(normalized * size));
	}

	private int circularDistance(int index, int desiredIndex, int size) {
		if (size <= 1) return 0;
		int direct = Math.abs(index - desiredIndex);
		return Math.min(direct, size - direct);
	}

	private String mediaStem(String value) {
		if (isBlank(value)) return "";
		String fileName = value.contains("/") || value.contains("\\")
				? value.replace('\\', '/').substring(value.replace('\\', '/').lastIndexOf('/') + 1)
				: value;
		return fileName.replaceFirst("\\.[^.]+$", "").trim().toLowerCase(Locale.ROOT);
	}

	private List<String> mediaTokens(String value) {
		String stem = mediaStem(value);
		if (isBlank(stem)) return List.of();
		String normalized = stem
				.replaceAll("([a-zA-Z\\u4e00-\\u9fa5])(\\d)", "$1 $2")
				.replaceAll("(\\d)([a-zA-Z\\u4e00-\\u9fa5])", "$1 $2");
		String[] rawTokens = normalized.split("[^a-zA-Z0-9\\u4e00-\\u9fa5]+");
		Set<String> tokens = new LinkedHashSet<>();
		for (String token : rawTokens) {
			if (!isBlank(token)) tokens.add(token.toLowerCase(Locale.ROOT));
		}
		return List.copyOf(tokens);
	}

	private List<String> filterGenericTokens(List<String> tokens) {
		return tokens.stream().filter((token) -> !GENERIC_MATCH_TOKENS.contains(token)).toList();
	}

	private int intersectCount(List<String> left, List<String> right) {
		if (left.isEmpty() || right.isEmpty()) return 0;
		Set<String> rightSet = new LinkedHashSet<>(right);
		int count = 0;
		for (String token : left) {
			if (rightSet.contains(token)) count += 1;
		}
		return count;
	}

	private String firstMatchingToken(List<String> tokens, String prefix) {
		return tokens.stream().filter((token) -> token.startsWith(prefix) && token.length() > prefix.length()).findFirst().orElse("");
	}

	private String firstVersionToken(List<String> tokens) {
		return tokens.stream().filter((token) -> token.matches("v\\d+")).findFirst().orElse("");
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

	private record AudioCandidate(
			FissionMixRequest.AudioAsset audio,
			String source,
			String usageType,
			int originalIndex
	) {
	}

	private record VariantSelection(
			FissionMixRequest.VideoAsset video,
			FissionMixRequest.AudioAsset audio,
			String selectionProfile,
			boolean voiceLocked
	) {
	}

	private record SpeechWindow(
			double rawDuration,
			double speechStart,
			double speechEnd,
			double effectiveDuration
	) {
	}
}
