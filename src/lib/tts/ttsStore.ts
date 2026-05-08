/**
 * TTS 全局朗读 Store — 单例
 *
 * 设计意图：
 *  - 任意时刻只有一段在播；新 speak 自动 stop 之前的
 *  - settings 由主进程持久化；store 本地缓存最新一份
 *  - 真正的播放控制句柄存在 store 内部（不暴露给消费者），
 *    消费者只通过 speak/stop/pause/resume 操作
 *
 * 不依赖 React，可在桌宠独立窗口中复用同一份逻辑。
 */

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "../stores/createStore";
import { ttsSettingsGet, ttsSettingsUpdate } from "../api/tts";
import type {
	RemoteAudioPayload,
	RemotePlaybackHandle,
	RemotePlayOptions,
} from "./providers/remoteProvider";
import {
	playRemoteAudioPayload,
	speakRemote,
} from "./providers/remoteProvider";
import {
	isSystemTTSAvailable,
	speakSystem,
	type SystemPlaybackHandle,
	type SystemPlayOptions,
} from "./providers/systemProvider";
import type {
	TTSProviderConfig,
	TTSScope,
	TTSSettings,
	TTSStatus,
	TTSSynthesizeRequest,
} from "./types";

export interface TTSPlaybackContext {
	scope: TTSScope;
	text: string;
	startedAt: number;
}

export interface TTSStoreState {
	status: TTSStatus;
	scope: TTSScope | null;
	current: TTSPlaybackContext | null;
	error: string | null;
	settings: TTSSettings | null;
	isLoadingSettings: boolean;
}

const INITIAL_STATE: TTSStoreState = {
	status: "idle",
	scope: null,
	current: null,
	error: null,
	settings: null,
	isLoadingSettings: false,
};

export const ttsStore = createStore<TTSStoreState>(INITIAL_STATE);

let activeHandle: SystemPlaybackHandle | RemotePlaybackHandle | null = null;
let settingsLoadPromise: Promise<TTSSettings | null> | null = null;
/**
 * 每次 speak / stop 自增的代际 ID。
 * speakTts 在 await 前后比对该值；若 await 期间被 stop 或被新的 speak 取代，
 * 当前请求拿到的 handle 立即被销毁，避免出现孤儿 audio（退出后还在播 / 多个声音叠加）。
 */
let activeRequestId = 0;

// 当前播放的"自然播完"和"被中止"回调，让上层（阅读器分段队列、桌宠批量朗读）
// 能感知一段播完并衔接下一段。
let activeOnCompleted: (() => void) | null = null;
let activeOnAborted: (() => void) | null = null;

/** 触发并清空"自然结束"回调，确保只触发一次 */
function fireCompleted(): void {
	const cb = activeOnCompleted;
	activeOnCompleted = null;
	activeOnAborted = null;
	if (cb) {
		try {
			cb();
		} catch (e) {
			console.warn("[tts] onCompleted handler threw:", e);
		}
	}
}

/** 触发并清空"被中止"回调，确保只触发一次 */
function fireAborted(): void {
	const cb = activeOnAborted;
	activeOnCompleted = null;
	activeOnAborted = null;
	if (cb) {
		try {
			cb();
		} catch (e) {
			console.warn("[tts] onAborted handler threw:", e);
		}
	}
}

function setStatus(patch: Partial<TTSStoreState>) {
	ttsStore.setState((prev) => ({ ...prev, ...patch }));
}

function isSystemProvider(provider: TTSProviderConfig | null | undefined) {
	return provider?.type === "system";
}

function pickSceneVoice(
	settings: TTSSettings,
	provider: TTSProviderConfig | null,
	scope: TTSScope,
): string | undefined {
	if (!provider) return undefined;
	const sceneOverride = (() => {
		switch (scope) {
			case "reader":
				return settings.scene_reader_voice_id;
			case "chat":
				return settings.scene_chat_voice_id;
			case "pet":
				return settings.scene_pet_voice_id;
			default:
				return null;
		}
	})();
	if (sceneOverride) return sceneOverride;
	if (settings.default_voice_id) return settings.default_voice_id;
	return provider.voice;
}

function isSceneEnabled(settings: TTSSettings, scope: TTSScope): boolean {
	switch (scope) {
		case "reader":
			return settings.scene_reader_enabled;
		case "chat":
			return settings.scene_chat_enabled;
		case "pet":
			return settings.scene_pet_enabled;
		default:
			return true;
	}
}

/** 加载 settings；并发安全 */
export async function loadTtsSettings(
	force = false,
): Promise<TTSSettings | null> {
	const current = ttsStore.getState().settings;
	if (current && !force) return current;
	if (settingsLoadPromise && !force) return settingsLoadPromise;

	setStatus({ isLoadingSettings: true });
	settingsLoadPromise = (async () => {
		try {
			const next = await ttsSettingsGet();
			setStatus({ settings: next, isLoadingSettings: false });
			return next;
		} catch (e) {
			setStatus({
				isLoadingSettings: false,
				error: e instanceof Error ? e.message : String(e),
			});
			return null;
		} finally {
			settingsLoadPromise = null;
		}
	})();
	return settingsLoadPromise;
}

export async function updateTtsSettings(patch: Partial<TTSSettings>) {
	try {
		const next = await ttsSettingsUpdate(patch);
		setStatus({ settings: next, error: null });
		return next;
	} catch (e) {
		setStatus({ error: e instanceof Error ? e.message : String(e) });
		throw e;
	}
}

export function stopTts(): void {
	activeRequestId += 1;
	if (activeHandle) {
		try {
			activeHandle.stop();
		} catch {}
		activeHandle = null;
	}
	setStatus({ status: "idle", scope: null, current: null });
	// 主动停止 / 被新 speak 替换 → 通知上层"被中止"
	fireAborted();
}

export function pauseTts(): void {
	if (activeHandle) {
		try {
			activeHandle.pause();
			setStatus({ status: "paused" });
		} catch {}
	}
}

export function resumeTts(): void {
	if (activeHandle) {
		try {
			activeHandle.resume();
			setStatus({ status: "playing" });
		} catch {}
	}
}

export interface SpeakOptions {
	scope: TTSScope;
	/** 若为 true，则忽略场景启用开关（用于明确的用户主动操作） */
	force?: boolean;
	/** 覆盖语速，默认走 settings.rate */
	rate?: number;
	/** 覆盖音色 id（不传走场景音色 → 全局默认 → provider 默认） */
	voiceId?: string;
	/** 覆盖 provider id（不传走 settings.default_provider_id） */
	providerId?: string;
	/**
	 * 当前段"自然播完"时触发；用于上层（阅读器分段队列、桌宠批量朗读）衔接下一段。
	 * 用户主动 stopTts、被新 speakTts 替换、合成失败时不触发。
	 */
	onCompleted?: () => void;
	/**
	 * 当前段被 stopTts / 新 speakTts 替换 / 合成失败 时触发。
	 * 与 onCompleted 互斥：一次播放生命周期里两个回调最多触发其中一个。
	 */
	onAborted?: () => void;
}

/**
 * 把 SpeakOptions 解析成"可被 tts_synthesize 直接消费的请求 + 期望的 rate/volume"。
 *
 * - 当 settings 还没加载好（极少见的初始化竞争）→ 触发加载，返回 null
 * - 当当前路径应该走 system fallback（无 provider / provider 是 system / provider 禁用）→ 返回 { kind: "system", ... }
 * - 否则返回 { kind: "remote", request, rate, volume }
 *
 * 给「阅读器预取器」使用：上层据此决定要不要预合成。
 */
export interface ResolvedSpeakSystem {
	kind: "system";
	rate: number;
	volume: number;
	pitch: number;
	voiceId: string | undefined;
}
export interface ResolvedSpeakRemote {
	kind: "remote";
	request: TTSSynthesizeRequest;
	rate: number;
	volume: number;
}
export type ResolvedSpeakConfig = ResolvedSpeakSystem | ResolvedSpeakRemote;

export async function resolveSpeakConfig(
	text: string,
	options: SpeakOptions,
): Promise<ResolvedSpeakConfig | null> {
	const trimmed = (text || "").trim();
	if (!trimmed) return null;

	const settings = await loadTtsSettings();
	if (!settings) return null;

	if (!options.force && !isSceneEnabled(settings, options.scope)) return null;

	const providerId = options.providerId || settings.default_provider_id;
	const provider = providerId
		? settings.providers.find((p) => p.id === providerId) || null
		: null;

	const fallbackToSystem =
		!provider || !provider.is_enabled || isSystemProvider(provider);

	const rate = options.rate ?? settings.rate;
	const voiceId =
		options.voiceId ?? pickSceneVoice(settings, provider, options.scope);

	if (fallbackToSystem) {
		return {
			kind: "system",
			rate,
			volume: settings.volume,
			pitch: settings.pitch,
			voiceId: voiceId,
		};
	}

	return {
		kind: "remote",
		request: {
			providerId: provider!.id,
			text: trimmed,
			voice: voiceId,
			rate,
		},
		rate,
		volume: settings.volume,
	};
}

export async function speakTts(
	text: string,
	options: SpeakOptions,
): Promise<void> {
	const trimmed = (text || "").trim();
	if (!trimmed) return;

	const settings = await loadTtsSettings();
	if (!settings) return;

	if (!options.force && !isSceneEnabled(settings, options.scope)) {
		return;
	}

	stopTts();
	const myRequestId = activeRequestId;
	// 注册本次播放的"自然结束 / 被中止"回调；
	// stopTts() 已经把上一次 onAborted 清掉了，所以这里覆盖是安全的。
	activeOnCompleted = options.onCompleted ?? null;
	activeOnAborted = options.onAborted ?? null;

	const providerId = options.providerId || settings.default_provider_id;
	const provider = providerId
		? settings.providers.find((p) => p.id === providerId) || null
		: null;

	const fallbackToSystem =
		!provider || !provider.is_enabled || isSystemProvider(provider);

	const rate = options.rate ?? settings.rate;
	const voiceId =
		options.voiceId ?? pickSceneVoice(settings, provider, options.scope);

	setStatus({
		status: "loading",
		scope: options.scope,
		current: { scope: options.scope, text: trimmed, startedAt: Date.now() },
		error: null,
	});

	if (fallbackToSystem) {
		if (!isSystemTTSAvailable()) {
			setStatus({
				status: "idle",
				current: null,
				error: "当前环境不支持系统 TTS",
			});
			return;
		}
		const sysOpts: SystemPlayOptions = {
			voiceId: voiceId,
			rate,
			pitch: settings.pitch,
			volume: settings.volume,
			onStart: () => {
				if (myRequestId !== activeRequestId) return;
				setStatus({ status: "playing" });
			},
			onEnd: () => {
				if (myRequestId !== activeRequestId) return;
				fireCompleted();
				stopTts();
			},
			onError: () => {
				if (myRequestId !== activeRequestId) return;
				setStatus({ status: "idle", current: null, error: "系统朗读失败" });
				fireAborted();
			},
			onPause: () => {
				if (myRequestId !== activeRequestId) return;
				setStatus({ status: "paused" });
			},
			onResume: () => {
				if (myRequestId !== activeRequestId) return;
				setStatus({ status: "playing" });
			},
		};
		const sysHandle = speakSystem(trimmed, sysOpts);
		if (myRequestId !== activeRequestId) {
			if (sysHandle) {
				try {
					sysHandle.stop();
				} catch {}
			}
			return;
		}
		activeHandle = sysHandle;
		return;
	}

	const remoteOpts: RemotePlayOptions = {
		rate,
		volume: settings.volume,
		onStart: () => {
			if (myRequestId !== activeRequestId) return;
			setStatus({ status: "playing" });
		},
		onEnd: () => {
			if (myRequestId !== activeRequestId) return;
			fireCompleted();
			stopTts();
		},
		onError: (err) => {
			if (myRequestId !== activeRequestId) return;
			console.warn("[tts] remote synthesize failed, fallback to system:", err);
			// 远程失败 → 自动 fallback 到 system；保留上层注册的 onCompleted/onAborted，
			// 让队列即便走了 fallback 也能正常推进
			const inheritedOnCompleted = activeOnCompleted;
			const inheritedOnAborted = activeOnAborted;
			if (isSystemTTSAvailable()) {
				const fallbackRequestId = ++activeRequestId;
				activeOnCompleted = inheritedOnCompleted;
				activeOnAborted = inheritedOnAborted;
				const sysOpts: SystemPlayOptions = {
					voiceId: undefined,
					rate,
					pitch: settings.pitch,
					volume: settings.volume,
					onStart: () => {
						if (fallbackRequestId !== activeRequestId) return;
						setStatus({ status: "playing" });
					},
					onEnd: () => {
						if (fallbackRequestId !== activeRequestId) return;
						fireCompleted();
						stopTts();
					},
					onError: () => {
						if (fallbackRequestId !== activeRequestId) return;
						setStatus({ status: "idle", current: null, error: err.message });
						fireAborted();
					},
				};
				const sysHandle = speakSystem(trimmed, sysOpts);
				if (fallbackRequestId !== activeRequestId) {
					if (sysHandle) {
						try {
							sysHandle.stop();
						} catch {}
					}
					return;
				}
				activeHandle = sysHandle;
			} else {
				setStatus({ status: "idle", current: null, error: err.message });
				fireAborted();
			}
		},
		onPause: () => {
			if (myRequestId !== activeRequestId) return;
			setStatus({ status: "paused" });
		},
		onResume: () => {
			if (myRequestId !== activeRequestId) return;
			setStatus({ status: "playing" });
		},
	};

	const remoteHandle = await speakRemote(
		{
			providerId: provider!.id,
			text: trimmed,
			voice: voiceId,
			rate,
		},
		remoteOpts,
	);

	// await 期间被 stop 或被新的 speak 取代 → 立即销毁孤儿 handle，不更新状态
	if (myRequestId !== activeRequestId) {
		if (remoteHandle) {
			try {
				remoteHandle.stop();
			} catch {}
		}
		return;
	}

	if (!remoteHandle) {
		setStatus({ status: "idle", current: null });
		return;
	}

	activeHandle = remoteHandle;
}

/**
 * 拖动滑块时密集打 IPC 会让设置面板和数据库压力骤增；
 * 用一个最末值 timer 把"持久化"延后到用户停手。
 * 当前段实时变速 + 本地 settings 同步 都不延迟。
 */
let pendingRatePersistTimer: ReturnType<typeof setTimeout> | null = null;
const RATE_PERSIST_DEBOUNCE_MS = 350;

export function setTtsRate(rate: number): void {
	// 1. 当前段实时变速 —— 远程 audio.playbackRate 立即生效；
	//    系统 TTS 的 utter.rate 改了对当前段无影响（Web Speech API 限制），
	//    但下一段会按 settings.rate 重新合成 / 重新 speak。
	if (activeHandle) {
		try {
			activeHandle.setRate(rate);
		} catch {}
	}
	// 2. 立即同步本地 settings.rate —— TTSPlaybackBar 的滑块/数字标签靠这个；
	//    阅读器预取 schedule 时读 settings.rate 当成 TTSSynthesizeRequest.rate；
	//    chat / pet 下一次 speakTts 也会按新 rate 走。
	const cur = ttsStore.getState().settings;
	if (cur && cur.rate !== rate) {
		setStatus({ settings: { ...cur, rate } });
	}
	// 3. 节流持久化到主进程，避免拖滑块时密集打 IPC 写库
	if (pendingRatePersistTimer) {
		clearTimeout(pendingRatePersistTimer);
	}
	pendingRatePersistTimer = setTimeout(() => {
		pendingRatePersistTimer = null;
		void ttsSettingsUpdate({ rate }).catch((e) => {
			console.warn("[tts] persist rate failed:", e);
		});
	}, RATE_PERSIST_DEBOUNCE_MS);
}

/**
 * 播放一段已经合成好的远程音频负载（来自预取器缓存）。
 *
 * 与 speakTts 的差异：
 *  - 不调 tts_synthesize，跳过合成阶段，直接 audio.play
 *  - 不会触发系统 TTS fallback —— 因为传进来的负载就是远程合成的；如果调用方拿不到
 *    payload（例如 system 路径或合成失败），应该自己 fallback 到 speakTts
 *  - 仍然复用 ttsStore 单例：自动 stop 上一段、注册 onCompleted/onAborted、
 *    与 stopTts/pauseTts/setTtsRate 联动，TTSPlaybackBar 状态与 speakTts 一致
 */
export function speakPrefetchedTts(
	payload: RemoteAudioPayload,
	options: SpeakOptions & { volume?: number },
): void {
	stopTts();
	const myRequestId = activeRequestId;
	activeOnCompleted = options.onCompleted ?? null;
	activeOnAborted = options.onAborted ?? null;

	const settings = ttsStore.getState().settings;
	const rate = options.rate ?? settings?.rate ?? 1;
	const volume = options.volume ?? settings?.volume ?? 1;

	setStatus({
		status: "loading",
		scope: options.scope,
		current: { scope: options.scope, text: "", startedAt: Date.now() },
		error: null,
	});

	const remoteOpts: RemotePlayOptions = {
		rate,
		volume,
		onStart: () => {
			if (myRequestId !== activeRequestId) return;
			setStatus({ status: "playing" });
		},
		onEnd: () => {
			if (myRequestId !== activeRequestId) return;
			fireCompleted();
			stopTts();
		},
		onError: (err) => {
			if (myRequestId !== activeRequestId) return;
			console.warn("[tts] prefetched payload play failed:", err);
			setStatus({ status: "idle", current: null, error: err.message });
			fireAborted();
		},
		onPause: () => {
			if (myRequestId !== activeRequestId) return;
			setStatus({ status: "paused" });
		},
		onResume: () => {
			if (myRequestId !== activeRequestId) return;
			setStatus({ status: "playing" });
		},
	};

	const handle = playRemoteAudioPayload(payload, remoteOpts);
	if (myRequestId !== activeRequestId) {
		if (handle) {
			try {
				handle.stop();
			} catch {}
		}
		return;
	}
	if (!handle) {
		setStatus({ status: "idle", current: null });
		fireAborted();
		return;
	}
	activeHandle = handle;
}

/** 在 main 渲染进程启动时调用一次，主动加载设置 */
export function initTtsStore(): void {
	void loadTtsSettings();
}

export const useTtsStore = createUseStore(ttsStore);
export const useTtsStoreSelector = createUseStoreSelector(ttsStore);
