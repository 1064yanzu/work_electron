// 工具调用输出展示 — 处理 base64 图片、加载状态、错误降级
//
// 从 ToolCallInline 主文件抽出。
// 关键能力：识别 <persisted-output> 标签 + 提取 base64 图片 -> 保存到产物列表 -> 触发中间栏预览。

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAgentStore } from "../../../lib/agent/store";
import { events } from "../../../lib/events";
import { InlineImage } from "../../ui/InlineImage";

export function ToolOutputDisplay({
	output,
	toolCallId,
}: {
	output: unknown;
	toolCallId?: string;
}) {
	const [imagePath, setImagePath] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const agentStore = useAgentStore();

	const outputStr =
		typeof output === "string" ? output : JSON.stringify(output, null, 2);

	// 检测 persisted-output 标签
	const persistedMatch = outputStr.match(
		/<persisted-output>[\s\S]*?Full output saved to:\s*([^\n<]+)/,
	);
	const persistedFilePath = persistedMatch?.[1]?.trim();

	// 检测预览中的 base64 图片标记（不完整的，需要读取文件）
	const hasPartialBase64 =
		/data:image\/[a-z]+;base64,/.test(outputStr) && persistedFilePath;

	useEffect(() => {
		if (!persistedFilePath || !hasPartialBase64) return;

		let cancelled = false;
		setLoading(true);
		setError(null);

		(async () => {
			try {
				// 读取持久化文件
				const fileContent = await (window as any).electronAPI?.invoke(
					"read_file_utf8",
					{
						path: persistedFilePath,
					},
				);
				if (cancelled) return;

				if (!fileContent) {
					setError("无法读取文件");
					return;
				}

				// 解析 JSON 并提取 base64 图片
				let parsed: any;
				try {
					parsed = JSON.parse(fileContent);
				} catch {
					setError("文件格式错误");
					return;
				}

				// 查找图片（优先查找文件路径，避免重复保存）
				let imageData: string | null = null;
				const extractImagePathFromText = (text: string): string | null => {
					const value = String(text || "").trim();
					if (!value) return null;
					if (
						value.startsWith("/") &&
						/\.(png|jpg|jpeg|gif|webp|svg)\b/i.test(value)
					) {
						return value;
					}
					const absPathMatch = value.match(
						/(\/Users\/[^,\n)]+?\.(?:png|jpg|jpeg|gif|webp|svg))/i,
					);
					if (absPathMatch?.[1]) return absPathMatch[1].trim();
					return null;
				};
				const findImage = (obj: any): string | null => {
					if (typeof obj === "string") {
						// 检查是否是文件路径
						const pathCandidate = extractImagePathFromText(obj);
						if (pathCandidate) {
							return pathCandidate;
						}
						// 如果是 base64，也返回（备用方案）
						const match = obj.match(
							/(data:image\/[a-z]+;base64,[A-Za-z0-9+\/=]+)/,
						);
						if (match) return match[1];
						// 也检查 markdown 格式
						const mdMatch = obj.match(
							/!\[[^\]]*\]\((data:image\/[a-z]+;base64,[A-Za-z0-9+\/=]+)\)/,
						);
						if (mdMatch) return mdMatch[1];
					}
					if (Array.isArray(obj)) {
						for (const item of obj) {
							const found = findImage(item);
							if (found) return found;
						}
					}
					if (obj && typeof obj === "object") {
						for (const key of Object.keys(obj)) {
							const found = findImage(obj[key]);
							if (found) return found;
						}
					}
					return null;
				};

				imageData = findImage(parsed);
				if (!imageData) {
					setError("未找到图片");
					return;
				}

				// 如果是文件路径，直接使用；如果是 base64，需要保存
				let finalPath = imageData;
				if (imageData.startsWith("data:image/")) {
					// base64 格式：优先保存到当前任务 sandbox（中间栏可直接复用），否则回退全局目录
					const sandboxDir = (agentStore.currentTask?.metadata as any)
						?.sandboxDir as string | undefined;
					const fileName = `subagent-image-${Date.now()}.jpg`;
					let savedPath: string | null = null;
					if (sandboxDir) {
						const match = imageData.match(
							/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i,
						);
						if (match?.[1]) {
							const candidate = `${sandboxDir.replace(/[\\/]+$/, "")}/images/${fileName}`;
							try {
								await (window as any).electronAPI?.invoke("write_file_safe", {
									payload: {
										path: candidate,
										content: match[1],
										encoding: "base64",
										create_dirs: true,
									},
								});
								savedPath = candidate;
							} catch {
								savedPath = null;
							}
						}
					}
					if (!savedPath) {
						savedPath = await (window as any).electronAPI?.invoke(
							"save_base64_image",
							{
								base64Data: imageData,
								fileName,
							},
						);
					}
					if (cancelled) return;

					if (!savedPath) {
						setError("保存图片失败");
						return;
					}
					finalPath = savedPath;
				}

				if (cancelled) return;
				setImagePath(finalPath);
				const fileName =
					finalPath.split("/").pop() || `image-${Date.now()}.jpg`;
				console.log("[ToolOutputDisplay] Image path:", finalPath);

				// 添加到产物列表
				console.log("[ToolOutputDisplay] Adding artifact to task:", {
					finalPath,
					fileName,
					toolCallId,
				});
				const exists = (agentStore.currentTask?.artifacts || []).some(
					(a) => a.type === "image" && String(a.url || "").trim() === finalPath,
				);
				if (!exists) {
					agentStore.addArtifact({
						id: `artifact-image-${Date.now()}`,
						type: "image",
						title: fileName,
						url: finalPath,
						metadata: { toolCallId, source: "subagent" },
					});
					console.log("[ToolOutputDisplay] Artifact added successfully");
				}

				// 触发中间栏预览
				setTimeout(() => {
					events.emit("AGENT_FOCUS_TOOL_CALL", {
						toolCallId,
						artifactUrl: finalPath,
						autoPreview: true,
					});
				}, 300);
			} catch (err) {
				if (cancelled) return;
				setError(String(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [persistedFilePath, hasPartialBase64, toolCallId]);

	// 渲染图片（已添加到产物列表，会在中间栏自动预览）
	if (imagePath) {
		return (
			<div className="bg-warm-50/50 p-2 rounded border border-border/50">
				<InlineImage
					path={imagePath}
					title="生成的图片（已添加到产物列表）"
					className="max-w-full"
				/>
			</div>
		);
	}

	// 加载中
	if (loading) {
		return (
			<div className="bg-warm-50/50 p-4 rounded border border-border/50 flex items-center gap-3">
				<Loader2 className="w-5 h-5 animate-spin text-text-light" />
				<span className="text-sm text-text-muted">正在处理图片...</span>
			</div>
		);
	}

	// 错误
	if (error && hasPartialBase64) {
		return (
			<div className="bg-[rgba(181,51,51,0.08)] p-3 rounded border border-[rgba(181,51,51,0.2)]">
				<span className="text-sm text-error">{error}</span>
			</div>
		);
	}

	// 默认：显示截断的文本
	return (
		<div className="bg-warm-50/50 p-2 rounded border border-border/50">
			<pre className="whitespace-pre-wrap break-all text-text-secondary text-xs max-h-[200px] overflow-y-auto">
				{outputStr.slice(0, 500) + (outputStr.length > 500 ? "..." : "")}
			</pre>
		</div>
	);
}
