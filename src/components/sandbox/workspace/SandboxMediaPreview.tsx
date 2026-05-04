import { Loader2 } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { safeInvoke } from "../../../lib/tauriBridge";

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi", "mkv", "m4v"]);
const AUDIO_EXTENSIONS = new Set([
	"mp3",
	"wav",
	"ogg",
	"flac",
	"aac",
	"m4a",
	"wma",
]);

function normalizeExtension(extension: string): string {
	return String(extension || "")
		.trim()
		.toLowerCase()
		.replace(/^\./, "");
}

export function isVideoPreviewExtension(extension: string): boolean {
	return VIDEO_EXTENSIONS.has(normalizeExtension(extension));
}

export function isAudioPreviewExtension(extension: string): boolean {
	return AUDIO_EXTENSIONS.has(normalizeExtension(extension));
}

function decodeBase64ToBlob(base64: string, mimeType: string): Blob {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

function useLocalMediaObjectUrl(filePath: string, mimeType: string) {
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let revoked = false;
		let currentUrl: string | null = null;
		setObjectUrl(null);
		setError(null);

		void safeInvoke<{ content: string; encoding: string }>("read_file_safe", {
			payload: {
				path: filePath,
				encoding: "base64",
			},
		})
			.then((result) => {
				if (!result?.content) {
					throw new Error("媒体内容为空");
				}
				const blob = decodeBase64ToBlob(result.content, mimeType);
				currentUrl = URL.createObjectURL(blob);
				if (revoked) {
					URL.revokeObjectURL(currentUrl);
					return;
				}
				setObjectUrl(currentUrl);
			})
			.catch((err) => {
				if (!revoked) {
					setError(err instanceof Error ? err.message : "媒体加载失败");
				}
			});

		return () => {
			revoked = true;
			if (currentUrl) {
				URL.revokeObjectURL(currentUrl);
			}
		};
	}, [filePath, mimeType]);

	return { objectUrl, error };
}

function MediaLoadingState({ label }: { label: string }) {
	return (
		<div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-gradient-to-b from-zinc-950 to-zinc-900 p-6 text-zinc-300">
			<Loader2 className="h-6 w-6 animate-spin" />
			<p className="text-sm">{label}</p>
		</div>
	);
}

function MediaErrorState({ message }: { message: string }) {
	return (
		<div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-gradient-to-b from-zinc-950 to-zinc-900 p-6 text-center">
			<p className="text-sm text-red-300">{message}</p>
		</div>
	);
}

export const SandboxVideoPreview = memo(function SandboxVideoPreview({
	filePath,
	fileName,
	mimeType,
}: {
	filePath: string;
	fileName: string;
	mimeType: string;
}) {
	const { objectUrl, error } = useLocalMediaObjectUrl(filePath, mimeType);

	if (error) {
		return <MediaErrorState message={`视频加载失败: ${error}`} />;
	}

	if (!objectUrl) {
		return <MediaLoadingState label="正在加载本地视频..." />;
	}

	return (
		<div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-950 to-zinc-900 p-5">
			<video
				src={objectUrl}
				controls
				preload="metadata"
				className="max-h-full w-full rounded-2xl border border-white/10 bg-black shadow-[0_20px_80px_-32px_rgba(0,0,0,0.9)]"
			>
				您的浏览器不支持视频播放
			</video>
			<span className="text-xs text-zinc-300">{fileName}</span>
		</div>
	);
});

export const SandboxAudioPreview = memo(function SandboxAudioPreview({
	filePath,
	fileName,
	mimeType,
}: {
	filePath: string;
	fileName: string;
	mimeType: string;
}) {
	const { objectUrl, error } = useLocalMediaObjectUrl(filePath, mimeType);

	if (error) {
		return <MediaErrorState message={`音频加载失败: ${error}`} />;
	}

	if (!objectUrl) {
		return <MediaLoadingState label="正在加载本地音频..." />;
	}

	return (
		<div className="flex h-full min-h-0 items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-amber-50 p-6 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800">
			<div className="w-full max-w-xl rounded-[28px] border border-black/5 bg-white/90 p-6 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.4)] backdrop-blur dark:border-white/10 dark:bg-cream-900/90">
				<div className="mb-5 flex items-center gap-4">
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/30 to-orange-500/20 text-amber-700 dark:from-amber-400/20 dark:to-orange-500/10 dark:text-amber-200">
						<svg
							className="h-7 w-7"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={1.5}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
							/>
						</svg>
					</div>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-text-primary dark:text-zinc-100">
							{fileName}
						</p>
						<p className="mt-1 text-xs text-text-muted">本地音频预览</p>
					</div>
				</div>
				<audio src={objectUrl} controls preload="metadata" className="w-full">
					您的浏览器不支持音频播放
				</audio>
			</div>
		</div>
	);
});
