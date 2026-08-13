/**
 * ClipServiceSettings — 集成 · 剪藏服务
 *
 * 本机内嵌的 Clip HTTP 服务一直在跑（`127.0.0.1`，从 21064 起探测端口），
 * 但此前设置面板里没有任何入口：用户既看不到它有没有起来、起在哪个端口，
 * 也拿不到调用它需要的 token，等于有服务没门。
 *
 * 这个面板做三件事：
 *   1. 展示实时状态与实际端口（`http_get_status`）
 *   2. 展示 / 复制访问 token，并支持怀疑泄漏时一键轮换
 *   3. 生成带 token 的书签脚本（bookmarklet），一键复制即可拖进浏览器书签栏
 */
import {
	Bookmark,
	Check,
	Copy,
	KeyRound,
	Link2,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { safeInvoke } from "../../../../lib/tauriBridge";
import { confirmDialog } from "../../../ui/ConfirmDialog";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../ui/SettingsPrimitives";

interface ServiceEndpoint {
	port: number;
	baseUrl: string;
	/**
	 * 主进程较早的版本不返回 token，所以这里按可选处理：
	 * 字段存在才渲染 token 相关 UI，不存在就只展示端口与状态。
	 */
	token?: string;
}

interface HttpStatus {
	clip: ServiceEndpoint;
	anthropicProxy: ServiceEndpoint;
}

const ANCHOR = {
	status: "integrations.clip.status",
	token: "integrations.clip.token",
	bookmarklet: "integrations.clip.bookmarklet",
} as const;

/**
 * 生成书签脚本。
 *
 * 抓当前页面的标题 / URL / 选中文字，POST 到本机 Clip 服务。
 * token 通过 `x-api-key` 头携带（与主进程的鉴权口径一致）。
 */
function buildBookmarklet(baseUrl: string, token: string | undefined): string {
	const headers = token
		? `{'Content-Type':'application/json','x-api-key':'${token}'}`
		: `{'Content-Type':'application/json'}`;
	const source = [
		"javascript:(function(){",
		"var s=window.getSelection?String(window.getSelection()):'';",
		`fetch('${baseUrl}/api/clip',{`,
		"method:'POST',",
		`headers:${headers},`,
		"body:JSON.stringify({title:document.title,url:location.href,selection:s})",
		"}).then(function(r){",
		"alert(r.ok?'已剪藏到 IPO Workbench':'剪藏失败：'+r.status);",
		"}).catch(function(e){alert('剪藏失败：'+e.message)});",
		"})()",
	].join("");
	return source;
}

async function copyText(text: string, successMessage: string) {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(successMessage);
	} catch (error) {
		console.error("[ClipServiceSettings] 复制失败:", error);
		toast.error("复制失败，请手动选中复制");
	}
}

export function ClipServiceSettings() {
	const [status, setStatus] = useState<HttpStatus | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRotating, setIsRotating] = useState(false);
	const [tokenVisible, setTokenVisible] = useState(false);

	const loadStatus = useCallback(async () => {
		setIsLoading(true);
		try {
			const next = await safeInvoke<HttpStatus>("http_get_status");
			setStatus(next);
			setLoadError(null);
		} catch (error) {
			console.error("[ClipServiceSettings] 读取服务状态失败:", error);
			setStatus(null);
			setLoadError(error instanceof Error ? error.message : String(error));
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadStatus();
	}, [loadStatus]);

	const clip = status?.clip;
	const isRunning = Boolean(clip && clip.port > 0);

	const handleRotateToken = useCallback(async () => {
		const confirmed = await confirmDialog.show({
			type: "warning",
			title: "轮换剪藏 token",
			message:
				"轮换后旧 token 立即失效，已经配置过的浏览器扩展和书签脚本都需要重新生成。确定继续吗？",
			confirmText: "轮换",
			cancelText: "取消",
		});
		if (!confirmed) return;

		setIsRotating(true);
		try {
			const result = await safeInvoke<{ success: boolean; error?: string }>(
				"http_rotate_service_token",
				{ service: "clip" },
			);
			if (!result.success) {
				throw new Error(result.error || "轮换失败");
			}
			await loadStatus();
			toast.success("已轮换，记得重新复制书签脚本");
		} catch (error) {
			console.error("[ClipServiceSettings] 轮换 token 失败:", error);
			toast.error(
				`轮换失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsRotating(false);
		}
	}, [loadStatus]);

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Bookmark}
				title="剪藏服务"
				description="本机内嵌的 HTTP 剪藏服务：浏览器里选中内容，一键存进资料库。"
			/>

			<SettingsSectionCard>
				<div
					className="p-5"
					id={ANCHOR.status}
					data-settings-anchor={ANCHOR.status}
				>
					<SettingsSectionTitle>服务状态</SettingsSectionTitle>

					<SettingsRow
						label="运行状态"
						description={
							isLoading
								? "正在检查…"
								: loadError
									? `读取失败：${loadError}`
									: isRunning
										? "服务已就绪，随应用启动自动运行"
										: "服务未启动"
						}
						action={
							<div className="flex items-center gap-2">
								<span
									className={
										isRunning
											? "inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
											: "inline-flex items-center gap-1.5 rounded-full bg-warm-200 px-2.5 py-1 text-xs font-medium text-text-light"
									}
								>
									<ShieldCheck className="h-3 w-3" />
									{isLoading ? "检查中" : isRunning ? "运行中" : "未运行"}
								</span>
								<button
									type="button"
									onClick={() => void loadStatus()}
									disabled={isLoading}
									aria-label="刷新服务状态"
									className="rounded-lg p-1.5 text-text-light transition-colors hover:bg-warm-200 hover:text-text-secondary disabled:opacity-50"
								>
									<RefreshCw
										className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
									/>
								</button>
							</div>
						}
					/>

					{clip && (
						<SettingsRow
							label="服务地址"
							description={`端口 ${clip.port}，仅监听本机回环地址`}
							action={
								<button
									type="button"
									onClick={() => void copyText(clip.baseUrl, "已复制服务地址")}
									className="inline-flex items-center gap-1.5 rounded-lg bg-warm-200 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-warm-300"
								>
									<Link2 className="h-3.5 w-3.5" />
									{clip.baseUrl}
								</button>
							}
						/>
					)}
				</div>
			</SettingsSectionCard>

			{clip?.token !== undefined && (
				<SettingsSectionCard>
					<div
						className="p-5"
						id={ANCHOR.token}
						data-settings-anchor={ANCHOR.token}
					>
						<SettingsSectionTitle>访问 token</SettingsSectionTitle>

						<SettingsRow
							label="token"
							description="调用 POST /api/clip 时通过 x-api-key 头携带；只在本机有效。"
							action={
								<div className="flex items-center gap-2">
									<code className="max-w-[14rem] truncate rounded-lg bg-warm-200 px-2.5 py-1.5 font-mono text-xs text-text-secondary">
										{tokenVisible
											? clip.token
											: "•".repeat(Math.min(clip.token.length, 24))}
									</code>
									<button
										type="button"
										onClick={() => setTokenVisible((v) => !v)}
										className="rounded-lg px-2 py-1.5 text-xs text-text-light transition-colors hover:bg-warm-200 hover:text-text-secondary"
									>
										{tokenVisible ? "隐藏" : "显示"}
									</button>
									<button
										type="button"
										onClick={() =>
											void copyText(clip.token ?? "", "已复制 token")
										}
										aria-label="复制 token"
										className="rounded-lg p-1.5 text-text-light transition-colors hover:bg-warm-200 hover:text-text-secondary"
									>
										<Copy className="h-3.5 w-3.5" />
									</button>
								</div>
							}
						/>

						<SettingsRow
							label="轮换 token"
							description="怀疑泄漏时重置。旧 token 立即失效，需要重新配置书签脚本。"
							action={
								<button
									type="button"
									onClick={() => void handleRotateToken()}
									disabled={isRotating}
									className="inline-flex items-center gap-1.5 rounded-lg bg-warm-200 px-3 py-1.5 text-xs transition-colors hover:bg-warm-300 disabled:opacity-50"
								>
									<KeyRound className="h-3.5 w-3.5" />
									{isRotating ? "轮换中…" : "轮换"}
								</button>
							}
						/>
					</div>
				</SettingsSectionCard>
			)}

			{clip && (
				<SettingsSectionCard>
					<div
						className="p-5"
						id={ANCHOR.bookmarklet}
						data-settings-anchor={ANCHOR.bookmarklet}
					>
						<SettingsSectionTitle>书签脚本</SettingsSectionTitle>
						<p className="mb-4 text-sm leading-relaxed text-text-secondary">
							复制下面的脚本，在浏览器里新建一个书签、把它粘进「网址」一栏。
							之后在任意网页点这个书签，就会把标题、链接和选中的文字剪藏进来。
						</p>

						<div className="rounded-xl border border-border bg-warm-100/60 p-3">
							<code className="line-clamp-3 block break-all font-mono text-2xs leading-relaxed text-text-light">
								{buildBookmarklet(clip.baseUrl, clip.token)}
							</code>
						</div>

						<div className="mt-4 flex items-center gap-2">
							<button
								type="button"
								onClick={() =>
									void copyText(
										buildBookmarklet(clip.baseUrl, clip.token),
										"已复制书签脚本",
									)
								}
								className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
							>
								<Check className="h-3.5 w-3.5" />
								复制书签脚本
							</button>
							{clip.token === undefined && (
								<span className="text-xs text-text-light">
									当前服务未启用 token 鉴权，脚本不带认证头
								</span>
							)}
						</div>
					</div>
				</SettingsSectionCard>
			)}
		</SettingsPageContainer>
	);
}

export default ClipServiceSettings;
