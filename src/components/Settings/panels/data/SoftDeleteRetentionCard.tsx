// 软删除保留期设置卡片 — D6 数据生命周期治理的设置闭环
//
// 已删除的资料 / 输出文稿（is_deleted=1）超过保留期后，由后台维护任务物理清除
// （连带全文索引、向量数据与 Vault 存储文件）。保留期存 app_config
// `soft_delete_retention_days`，经现有 get_config / set_config IPC 读写；0 = 永不清除。

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getConfig, setConfig } from "../../../../lib/config";
import { Select } from "../../../ui/Select";
import { toast } from "../../../ui/Toast";
import {
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../ui/SettingsPrimitives";

const CONFIG_KEY = "soft_delete_retention_days";
const DEFAULT_DAYS = "30";

const OPTIONS = [
	{ value: "7", label: "7 天" },
	{ value: "30", label: "30 天" },
	{ value: "90", label: "90 天" },
	{ value: "0", label: "永不清除" },
];

export function SoftDeleteRetentionCard() {
	const [value, setValue] = useState<string>(DEFAULT_DAYS);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const raw = await getConfig(CONFIG_KEY);
				if (cancelled || raw === null || raw === undefined || raw === "") {
					return;
				}
				const n = Number(raw);
				if (Number.isFinite(n) && n >= 0) {
					const normalized = String(Math.floor(n));
					// 非预设值（历史手改）也照常显示为最近的预设，避免 Select 空选
					setValue(
						OPTIONS.some((o) => o.value === normalized)
							? normalized
							: DEFAULT_DAYS,
					);
				}
			} catch {
				// 读取失败保持默认显示
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleChange = async (next: string) => {
		const prev = value;
		setValue(next);
		try {
			await setConfig(CONFIG_KEY, next);
		} catch (error) {
			setValue(prev);
			toast.error(
				`保存失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	return (
		<SettingsSectionCard>
			<div
				className="p-5"
				id="data.storage.soft_delete_retention"
				data-settings-anchor="data.storage.soft_delete_retention"
			>
				<SettingsSectionTitle>回收清理</SettingsSectionTitle>
				<SettingsRow
					label="软删除保留期"
					description="已删除的资料与输出文稿超过保留期后自动物理清除（含全文索引与向量数据），Vault 回收站同步清空"
					action={
						<Select
							value={value}
							onChange={(e) => void handleChange(e.target.value)}
							variant="inline"
							containerClassName="w-auto"
							options={OPTIONS}
						/>
					}
				/>
				<div className="flex items-center gap-1.5 mt-2 text-xs text-text-light">
					<Trash2 className="w-3.5 h-3.5 shrink-0" />
					清理由后台维护任务每 24 小时执行一次，保留期内的数据可随时找回。
				</div>
			</div>
		</SettingsSectionCard>
	);
}
