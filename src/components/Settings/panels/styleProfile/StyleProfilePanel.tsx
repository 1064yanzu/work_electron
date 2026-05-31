/**
 * StyleProfilePanel — 语言风格包设置面板
 *
 * 重构要点：
 * - 合并原本"活跃风格选择器"与"风格包管理列表"两个分离区块，
 *   直接在每个 StyleProfileListItem 中内嵌 radio 选择，消除冗余。
 * - 注入强度控制始终显示，无激活包时置灰提示。
 * - "不使用风格包"作为列表顶部的特殊选项卡片。
 * - 归档包独立在底部折叠区，平时不干扰视线。
 */
import { Pen, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	listStyleProfiles,
	deleteStyleProfile,
	archiveStyleProfile,
} from "../../../../lib/api/styleProfile";
import type { StyleProfile } from "../../../../../electron/shared/ipc-schema";
import { getConfig, setConfig } from "../../../../lib/config";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import {
	SettingsCardSection,
	SettingsPageContainer,
	SettingsRow,
	SettingsChipGroup,
	SettingsHint,
	type SettingsChipOption,
} from "../../ui/SettingsPrimitives";
import { StyleProfileListItem } from "./StyleProfileListItem";
import { StyleProfileCreateModal } from "./StyleProfileCreateModal";

const ACTIVE_PROFILE_KEY = "active_style_profile_id";
const ACTIVE_INTENSITY_KEY = "active_style_profile_intensity";

type Intensity = "low" | "medium" | "high";

const INTENSITY_OPTIONS: SettingsChipOption<Intensity>[] = [
	{ value: "low", label: "弱", hint: "方向性提示" },
	{ value: "medium", label: "中", hint: "完整规则" },
	{ value: "high", label: "强", hint: "规则 + 锚点" },
];

export function StyleProfilePanel() {
	const [profiles, setProfiles] = useState<StyleProfile[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [intensity, setIntensity] = useState<Intensity>("medium");
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [loading, setLoading] = useState(true);
	const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		try {
			const [ps, activeId, intensityVal] = await Promise.all([
				listStyleProfiles(),
				getConfig(ACTIVE_PROFILE_KEY),
				getConfig(ACTIVE_INTENSITY_KEY),
			]);
			setProfiles(ps);
			setActiveProfileId(activeId ?? null);
			setIntensity((intensityVal as Intensity) || "medium");
		} catch (e) {
			console.warn("[StyleProfilePanel] load failed:", e);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const handleSetActive = useCallback(async (id: string | null) => {
		setActiveProfileId(id);
		await setConfig(ACTIVE_PROFILE_KEY, id ?? null);
	}, []);

	const handleSetIntensity = useCallback(async (val: Intensity) => {
		setIntensity(val);
		await setConfig(ACTIVE_INTENSITY_KEY, val);
	}, []);

	const handleDelete = useCallback(
		async (id: string) => {
			await deleteStyleProfile(id);
			if (activeProfileId === id) {
				setActiveProfileId(null);
				await setConfig(ACTIVE_PROFILE_KEY, null);
			}
			await loadData();
		},
		[activeProfileId, loadData],
	);

	const handleArchive = useCallback(
		async (id: string, archived: boolean) => {
			await archiveStyleProfile(id, archived);
			// 如果归档了当前激活包，清空激活状态
			if (archived && activeProfileId === id) {
				setActiveProfileId(null);
				await setConfig(ACTIVE_PROFILE_KEY, null);
			}
			await loadData();
		},
		[activeProfileId, loadData],
	);

	const handleCreated = useCallback(async (profileId: string) => {
		setShowCreateModal(false);
		setNewlyCreatedId(profileId);
		await loadData();
	}, [loadData]);

	const activeProfiles = profiles.filter((p) => p.status === "active");
	const archivedProfiles = profiles.filter((p) => p.status === "archived");
	const hasActiveProfile = activeProfileId !== null;

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Pen}
				title="语言风格包"
				description="为 AI 生成内容定义独特的写作风格，注入到聊天和 Agent 的系统提示词中。"
			/>

			{/* 注入强度控制 */}
			<SettingsCardSection
				title="注入强度"
				description={
					hasActiveProfile
						? "控制风格约束在 system prompt 中的详细程度"
						: "选择一个风格包后生效"
				}
			>
				<SettingsRow
					label="强度级别"
					description="弱：方向性提示；中：完整规则；强：规则 + 语言锚点"
					action={
						<div className={hasActiveProfile ? "" : "opacity-40 pointer-events-none"}>
							<SettingsChipGroup
								options={INTENSITY_OPTIONS}
								value={intensity}
								onChange={(v) => void handleSetIntensity(v)}
							/>
						</div>
					}
				/>
			</SettingsCardSection>

			{/* 统一风格包列表 */}
			<SettingsCardSection
				title="我的风格包"
				description="点击左侧圆圈激活风格包；展开可管理样本和校准风格维度。"
			>
				<div className="flex flex-col gap-2">
					{/* 「不使用」选项 */}
					<NoStyleCard
						selected={activeProfileId === null}
						onClick={() => void handleSetActive(null)}
					/>

					{loading ? (
						<SettingsHint>正在加载风格包列表…</SettingsHint>
					) : activeProfiles.length === 0 ? (
						<div className="py-4 text-center text-xs text-text-muted">
							还没有风格包。点击下方「新建」创建第一个。
						</div>
					) : (
						activeProfiles.map((p) => (
							<StyleProfileListItem
								key={p.id}
								profile={p}
								isActive={activeProfileId === p.id}
								initialExpanded={p.id === newlyCreatedId}
								onSetActive={() => void handleSetActive(p.id)}
								onDelete={() => void handleDelete(p.id)}
								onArchive={() => void handleArchive(p.id, true)}
								onRefresh={loadData}
							/>
						))
					)}
				</div>

				{/* 新建按钮 */}
				<div className="mt-4">
					<button
						type="button"
						onClick={() => setShowCreateModal(true)}
						className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border border-dashed border-cream-400 dark:border-cream-500/60 text-text-secondary hover:text-text-primary hover:border-cream-500 dark:hover:border-cream-400/60 hover:bg-cream-100/50 dark:hover:bg-cream-800/30 transition-colors duration-150"
					>
						<Plus size={14} strokeWidth={1.8} />
						新建风格包
					</button>
				</div>
			</SettingsCardSection>

			{/* 已归档（仅有归档包时展示） */}
			{archivedProfiles.length > 0 && (
				<SettingsCardSection
					title="已归档"
					description="归档的风格包不参与激活，可随时恢复。"
				>
					<div className="flex flex-col gap-2">
						{archivedProfiles.map((p) => (
							<StyleProfileListItem
								key={p.id}
								profile={p}
								isActive={false}
								onSetActive={() => void handleSetActive(p.id)}
								onDelete={() => void handleDelete(p.id)}
								onArchive={() => void handleArchive(p.id, false)}
								onRefresh={loadData}
								archived
							/>
						))}
					</div>
				</SettingsCardSection>
			)}

			{showCreateModal && (
				<StyleProfileCreateModal
					onClose={() => setShowCreateModal(false)}
					onCreated={handleCreated}
				/>
			)}
		</SettingsPageContainer>
	);
}

// ── 「不使用风格包」选项卡 ────────────────────────────────────────────────────

interface NoStyleCardProps {
	selected: boolean;
	onClick: () => void;
}

function NoStyleCard({ selected, onClick }: NoStyleCardProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-150 ${
				selected
					? "border-cream-400/60 dark:border-cream-500/50 bg-cream-100/80 dark:bg-cream-800/50"
					: "border-cream-200/70 dark:border-cream-600/30 bg-transparent hover:bg-cream-50 dark:hover:bg-cream-800/20 hover:border-cream-300 dark:hover:border-cream-500/40"
			}`}
		>
			{/* Radio 指示器 */}
			<div
				className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
					selected
						? "border-cream-700 dark:border-cream-300"
						: "border-cream-300 dark:border-cream-500/60"
				}`}
			>
				{selected && (
					<div className="w-2 h-2 rounded-full bg-cream-800 dark:bg-cream-200" />
				)}
			</div>

			<div className="flex-1 min-w-0">
				<div
					className={`text-sm font-medium ${selected ? "text-text-primary" : "text-text-secondary"}`}
				>
					不使用风格包
				</div>
				<div className="mt-0.5 text-xs text-text-muted">
					保持默认风格，不注入额外约束
				</div>
			</div>
		</button>
	);
}
