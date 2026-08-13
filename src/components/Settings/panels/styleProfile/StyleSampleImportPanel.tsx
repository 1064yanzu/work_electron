/**
 * StyleSampleImportPanel — 样本批量导入面板
 *
 * 支持三种导入方式：
 * 1. 多文件选择（txt/md/docx/pdf，可同时选多个）
 * 2. 文件夹导入（选中文件夹，自动扫描所有支持文件）
 * 3. zip 压缩包（调用主进程 IPC 解压并批量导入）
 *
 * 所有方式均有进度显示、逐文件状态反馈、汇总结果。
 */
import {
	Archive,
	CheckCircle2,
	Folder,
	Files,
	Loader2,
	XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
	addStyleSample,
	parseStyleSampleFile,
	importStyleSamplesFromZip,
} from "../../../../lib/api/styleProfile";

const SUPPORTED_EXTS = [".txt", ".md", ".docx", ".pdf"];
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface ImportResult {
	file: string;
	success: boolean;
	error?: string;
}

interface ImportState {
	running: boolean;
	total: number;
	done: number;
	results: ImportResult[];
}

const IDLE: ImportState = { running: false, total: 0, done: 0, results: [] };

interface Props {
	profileId: string;
	onComplete: () => void;
}

export function StyleSampleImportPanel({ profileId, onComplete }: Props) {
	const [state, setState] = useState<ImportState>(IDLE);

	const resetState = useCallback(() => setState(IDLE), []);

	// ── 多文件 / 文件夹导入（前端处理，复用 parse_file IPC） ──────────────────

	const handleFilePick = useCallback(
		async (folderMode: boolean) => {
			const input = document.createElement("input");
			input.type = "file";
			if (folderMode) {
				// 文件夹选择：浏览器会递归列出所有文件
				(
					input as HTMLInputElement & { webkitdirectory: boolean }
				).webkitdirectory = true;
			} else {
				input.multiple = true;
				input.accept = SUPPORTED_EXTS.join(",");
			}

			input.onchange = async () => {
				const rawFiles = Array.from(input.files ?? []);
				// 文件夹模式需要过滤扩展名
				const files = folderMode
					? rawFiles.filter((f) => {
							const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
							return SUPPORTED_EXTS.includes(ext);
						})
					: rawFiles;

				if (files.length === 0) return;

				setState({ running: true, total: files.length, done: 0, results: [] });

				const results: ImportResult[] = [];
				let completed = 0;

				for (const file of files) {
					const filePath = (file as File & { path?: string }).path;
					if (!filePath) {
						results.push({
							file: file.name,
							success: false,
							error: "无法获取文件路径",
						});
						completed++;
						setState((s) => ({ ...s, done: completed, results: [...results] }));
						continue;
					}

					if (file.size > MAX_FILE_SIZE_BYTES) {
						results.push({
							file: file.name,
							success: false,
							error: `超过 ${MAX_FILE_SIZE_MB}MB 限制`,
						});
						completed++;
						setState((s) => ({ ...s, done: completed, results: [...results] }));
						continue;
					}

					try {
						const parsed = await parseStyleSampleFile(filePath);
						await addStyleSample({
							profile_id: profileId,
							content: parsed.content,
							title: parsed.title || file.name,
						});
						results.push({ file: file.name, success: true });
					} catch (e) {
						results.push({
							file: file.name,
							success: false,
							error: e instanceof Error ? e.message : "解析失败",
						});
					}

					completed++;
					setState((s) => ({ ...s, done: completed, results: [...results] }));
				}

				setState((s) => ({ ...s, running: false }));
				// 至少有一个成功时刷新样本列表
				if (results.some((r) => r.success)) {
					onComplete();
				}
			};

			input.click();
		},
		[profileId, onComplete],
	);

	// ── ZIP 导入（主进程 IPC 负责解压） ──────────────────────────────────────

	const handleZipPick = useCallback(async () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".zip";

		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;

			const zipPath = (file as File & { path?: string }).path;
			if (!zipPath) return;

			setState({ running: true, total: 0, done: 0, results: [] });

			try {
				const result = await importStyleSamplesFromZip(profileId, zipPath);
				setState({
					running: false,
					total: result.imported + result.failed,
					done: result.imported + result.failed,
					results: result.results,
				});
				if (result.imported > 0) {
					onComplete();
				}
			} catch (e) {
				setState({
					running: false,
					total: 1,
					done: 1,
					results: [
						{
							file: file.name,
							success: false,
							error: e instanceof Error ? e.message : "导入失败",
						},
					],
				});
			}
		};

		input.click();
	}, [profileId, onComplete]);

	// ── 渲染 ─────────────────────────────────────────────────────────────────

	if (state.running || state.results.length > 0) {
		return <ImportProgress state={state} onClose={resetState} />;
	}

	return (
		<div className="flex items-center gap-2 flex-wrap">
			<ImportButton
				icon={<Files size={12} />}
				label="选择文件"
				hint="支持多选 txt/md/docx/pdf"
				onClick={() => void handleFilePick(false)}
			/>
			<ImportButton
				icon={<Folder size={12} />}
				label="导入文件夹"
				hint="自动识别文件夹内所有支持文件"
				onClick={() => void handleFilePick(true)}
			/>
			<ImportButton
				icon={<Archive size={12} />}
				label="导入 zip"
				hint="压缩包内所有文章一次导入"
				onClick={() => void handleZipPick()}
			/>
		</div>
	);
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

interface ImportButtonProps {
	icon: React.ReactNode;
	label: string;
	hint: string;
	onClick: () => void;
}

function ImportButton({ icon, label, hint, onClick }: ImportButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={hint}
			className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-border/70 text-text-secondary hover:text-text-primary hover:border-warm-500 hover:bg-surface transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150"
		>
			{icon}
			{label}
		</button>
	);
}

interface ImportProgressProps {
	state: ImportState;
	onClose: () => void;
}

function ImportProgress({ state, onClose }: ImportProgressProps) {
	const successCount = state.results.filter((r) => r.success).length;
	const failCount = state.results.filter((r) => !r.success).length;
	const isZipMode = state.total === 0 && state.running;

	return (
		<div className="rounded-xl border border-border/60 bg-surface/60 overflow-hidden">
			{/* 顶部状态栏 */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
				{state.running ? (
					<Loader2
						size={12}
						className="animate-spin text-text-muted shrink-0"
					/>
				) : successCount > 0 ? (
					<CheckCircle2 size={12} className="text-mint-500 shrink-0" />
				) : (
					<XCircle size={12} className="text-error shrink-0" />
				)}
				<span className="flex-1 text-xs text-text-secondary">
					{state.running
						? isZipMode
							? "正在解析压缩包…"
							: `正在导入 ${state.done}/${state.total}`
						: `完成：${successCount} 成功${failCount > 0 ? `，${failCount} 失败` : ""}`}
				</span>
				{!state.running && (
					<button
						type="button"
						onClick={onClose}
						className="text-xs text-text-muted hover:text-text-primary transition-colors duration-150"
					>
						关闭
					</button>
				)}
			</div>

			{/* 文件列表（超过 6 条滚动） */}
			{state.results.length > 0 && (
				<div className="max-h-36 overflow-y-auto divide-y divide-border/40">
					{state.results.map((r, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: 结果列表不会重排
							key={i}
							className="flex items-start gap-2 px-3 py-1.5"
						>
							{r.success ? (
								<CheckCircle2
									size={11}
									className="shrink-0 mt-0.5 text-mint-500"
								/>
							) : (
								<XCircle size={11} className="shrink-0 mt-0.5 text-error" />
							)}
							<span className="flex-1 min-w-0 text-2xs text-text-secondary truncate">
								{r.file}
							</span>
							{r.error && (
								<span className="text-2xs text-error shrink-0 max-w-[40%] truncate">
									{r.error}
								</span>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
