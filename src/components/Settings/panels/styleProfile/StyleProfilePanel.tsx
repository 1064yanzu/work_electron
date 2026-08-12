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
import { Blend, Pen, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	listStyleProfiles,
	deleteStyleProfile,
	archiveStyleProfile,
	listStyleRecipes,
	deleteStyleRecipe,
} from "../../../../lib/api/styleProfile";
import type {
	StyleProfile,
	StyleProfileRecipe,
} from "../../../../../electron/shared/ipc-schema";
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
import { StyleRecipeListItem } from "./StyleRecipeListItem";
import { StyleRecipeCreateModal } from "./StyleRecipeCreateModal";
import { EmptyState } from "../../../ui/EmptyState";

const ACTIVE_PROFILE_KEY = "active_style_profile_id";
const ACTIVE_INTENSITY_KEY = "active_style_profile_intensity";
const ACTIVE_RECIPE_KEY = "active_style_recipe_id";

type Intensity = "low" | "medium" | "high";

const INTENSITY_OPTIONS: SettingsChipOption<Intensity>[] = [
	{ value: "low", label: "弱", hint: "方向性提示" },
	{ value: "medium", label: "中", hint: "完整规则" },
	{ value: "high", label: "强", hint: "规则 + 锚点" },
];

export function StyleProfilePanel() {
	const [profiles, setProfiles] = useState<StyleProfile[]>([]);
	const [recipes, setRecipes] = useState<StyleProfileRecipe[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
	const [intensity, setIntensity] = useState<Intensity>("medium");
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [showRecipeModal, setShowRecipeModal] = useState(false);
	const [loading, setLoading] = useState(true);
	const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		try {
			const [ps, rcs, activeId, recipeId, intensityVal] = await Promise.all([
				listStyleProfiles(),
				listStyleRecipes(),
				getConfig(ACTIVE_PROFILE_KEY),
				getConfig(ACTIVE_RECIPE_KEY),
				getConfig(ACTIVE_INTENSITY_KEY),
			]);
			setProfiles(ps);
			setRecipes(rcs);
			setActiveProfileId(activeId ?? null);
			setActiveRecipeId(recipeId ?? null);
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

	// 单包与配方互斥：选中单包时清空配方，反之亦然
	const handleSetActive = useCallback(async (id: string | null) => {
		setActiveProfileId(id);
		setActiveRecipeId(null);
		await Promise.all([
			setConfig(ACTIVE_PROFILE_KEY, id ?? null),
			setConfig(ACTIVE_RECIPE_KEY, null),
		]);
	}, []);

	const handleSetActiveRecipe = useCallback(async (id: string | null) => {
		setActiveRecipeId(id);
		setActiveProfileId(null);
		await Promise.all([
			setConfig(ACTIVE_RECIPE_KEY, id ?? null),
			setConfig(ACTIVE_PROFILE_KEY, null),
		]);
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

	const handleCreated = useCallback(
		async (profileId: string) => {
			setShowCreateModal(false);
			setNewlyCreatedId(profileId);
			await loadData();
		},
		[loadData],
	);

	const handleRecipeCreated = useCallback(
		async (_recipeId: string) => {
			setShowRecipeModal(false);
			await loadData();
		},
		[loadData],
	);

	const handleDeleteRecipe = useCallback(
		async (id: string) => {
			await deleteStyleRecipe(id);
			if (activeRecipeId === id) {
				setActiveRecipeId(null);
				await setConfig(ACTIVE_RECIPE_KEY, null);
			}
			await loadData();
		},
		[activeRecipeId, loadData],
	);

	const activeProfiles = profiles.filter((p) => p.status === "active");
	const archivedProfiles = profiles.filter((p) => p.status === "archived");
	const hasActiveProfile = activeProfileId !== null || activeRecipeId !== null;

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
						<div
							className={
								hasActiveProfile ? "" : "opacity-40 pointer-events-none"
							}
						>
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
						selected={activeProfileId === null && activeRecipeId === null}
						onClick={() => {
							void handleSetActive(null);
							setActiveRecipeId(null);
							void setConfig(ACTIVE_RECIPE_KEY, null);
						}}
					/>

					{loading ? (
						<SettingsHint>正在加载风格包列表…</SettingsHint>
					) : activeProfiles.length === 0 ? (
						<EmptyState
							size="sm"
							title="还没有风格包"
							description="点击下方「新建」创建第一个"
						/>
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

			{/* 混搭配方 */}
			<SettingsCardSection
				title="混搭配方"
				description="从不同风格包中挑选各层级（认知模式 / 话语姿态 / 语言审美 / 校准锚点），组合成自定义配方。"
			>
				<div className="flex flex-col gap-2">
					{recipes.length === 0 ? (
						<EmptyState
							size="sm"
							title="还没有混搭配方"
							description="创建至少两个风格包后，可以将它们的不同维度组合在一起使用"
						/>
					) : (
						recipes.map((r) => (
							<StyleRecipeListItem
								key={r.id}
								recipe={r}
								isActive={activeRecipeId === r.id}
								onSetActive={() => void handleSetActiveRecipe(r.id)}
								onDelete={() => void handleDeleteRecipe(r.id)}
							/>
						))
					)}
				</div>

				{activeProfiles.length >= 2 && (
					<div className="mt-4">
						<button
							type="button"
							onClick={() => setShowRecipeModal(true)}
							className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border border-dashed border-amber-400/60 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 hover:border-amber-500 dark:hover:border-amber-400/60 hover:bg-amber-50/50 dark:hover:bg-amber-900/20 transition-colors duration-150"
						>
							<Blend size={14} strokeWidth={1.8} />
							新建混搭配方
						</button>
					</div>
				)}
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

			{showRecipeModal && (
				<StyleRecipeCreateModal
					onClose={() => setShowRecipeModal(false)}
					onCreated={handleRecipeCreated}
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
			className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ${
				selected
					? "border-cream-400/60 dark:border-cream-500/50 bg-cream-100/80 dark:bg-cream-800/50"
					: "border-cream-200/70 dark:border-cream-600/30 bg-transparent hover:bg-cream-50 dark:hover:bg-cream-800/20 hover:border-cream-300 dark:hover:border-cream-500/40"
			}`}
		>
			{/* Radio 指示器 */}
			<div
				className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ${
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
