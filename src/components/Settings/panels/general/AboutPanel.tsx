/**
 * AboutPanel — 通用 · 关于与更新
 *
 * Phase 6 拆分自 `panels/GeneralSettings.tsx` 的「关于」区块。
 *   - 展示当前版本与检查更新按钮；
 *   - 用 `SettingsCardSection` 呈现；字段容器带 `id` + `data-settings-anchor`。
 */
import { Info } from "lucide-react";
import { useState } from "react";
import { confirmDialog } from "../../../ui/ConfirmDialog";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import {
	SettingsButton,
	SettingsCardSection,
	SettingsPageContainer,
	SettingsRow,
} from "../../ui/SettingsPrimitives";

const CURRENT_VERSION = "0.1.0-alpha";
const RELEASE_API =
	"https://api.github.com/repos/1064yanzu/ipo-workbench/releases/latest";
const RELEASE_PAGE = "https://github.com/1064yanzu/ipo-workbench/releases";

const ANCHOR = {
	version: "general.about.version",
} as const;

function compareVersion(latest: string, current: string): number {
	const toTuple = (v: string) =>
		v
			.replace(/^v/, "")
			.split(/[.\-]/)
			.map((s) => (Number.isFinite(Number(s)) ? Number(s) : 0));
	const a = toTuple(latest);
	const b = toTuple(current);
	const len = Math.max(a.length, b.length);
	for (let i = 0; i < len; i += 1) {
		const ai = a[i] ?? 0;
		const bi = b[i] ?? 0;
		if (ai !== bi) return ai - bi;
	}
	return 0;
}

export function AboutPanel() {
	const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

	const handleCheckUpdate = async () => {
		setIsCheckingUpdate(true);
		try {
			const response = await fetch(RELEASE_API, {
				headers: { Accept: "application/vnd.github.v3+json" },
			});

			if (response.ok) {
				const data = (await response.json()) as {
					tag_name?: string;
					html_url?: string;
				};
				const latestVersion = (data.tag_name ?? "0.0.0").replace(/^v/, "");
				if (compareVersion(latestVersion, CURRENT_VERSION) > 0) {
					const shouldUpdate = await confirmDialog.warning(
						`🎉 发现新版本 v${latestVersion}！\n\n当前版本: v${CURRENT_VERSION}\n\n是否前往下载页面？`,
						"发现新版本",
					);
					if (shouldUpdate) {
						window.open(data.html_url ?? RELEASE_PAGE, "_blank");
					}
				} else {
					toast.success("当前已是最新版本");
				}
			} else if (response.status === 404) {
				toast.info("当前已是最新版本（暂无发布版本）");
			} else {
				throw new Error(`HTTP ${response.status}`);
			}
		} catch (error) {
			console.error("[AboutPanel] 检查更新失败:", error);
			toast.info("当前已是最新版本（无法连接更新服务器）");
		} finally {
			setIsCheckingUpdate(false);
		}
	};

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={Info}
				title="关于与更新"
				description="查看当前版本信息并检查是否有新版本。"
			/>

			<SettingsCardSection
				title="应用信息"
				description="版本号与更新渠道。"
				bodyClassName="pt-1"
			>
				<div id={ANCHOR.version} data-settings-anchor={ANCHOR.version}>
					<SettingsRow
						label="当前版本"
						value={`v${CURRENT_VERSION}`}
						action={
							<SettingsButton
								variant="secondary"
								size="md"
								loading={isCheckingUpdate}
								onClick={handleCheckUpdate}
							>
								{isCheckingUpdate ? "检查中" : "检查更新"}
							</SettingsButton>
						}
					/>
				</div>
			</SettingsCardSection>
		</SettingsPageContainer>
	);
}
