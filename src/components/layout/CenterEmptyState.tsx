/**
 * CenterEmptyState —— 一个分屏里什么都没开时的空态。
 *
 * 两种情况会看到它：把标签全关光了，或者刚点了「分屏」开出一屏空的。
 * 后者是新手第一次分屏的落点，所以这里不能只留一片灰——它得直接回答
 * 「这一屏可以放什么」，并且顺手把"还能拖标签进来"这件事说出来
 *（拖拽手势本身完全不可见，不说没人会发现）。
 */

import {
	Compass,
	Eye,
	Globe,
	Move,
	SquareTerminal,
	Workflow,
} from "lucide-react";
import { useRef } from "react";

import { EASE, useGsapMotion } from "../../lib/motion";
import { formatKeys } from "../../lib/shortcuts";
import {
	centerTabsStore,
	useCenterTabsStoreSelector,
} from "../../lib/stores/centerTabsStore";
import { EVENTS, events } from "../../lib/events";
import { cn } from "../../lib/utils";
import { toast } from "../ui/Toast";

const HARNESS_HUB_SETTINGS_TAB = "integrations.harnessHub";

export function CenterEmptyState({ groupId }: { groupId?: string }) {
	const clis = useCenterTabsStoreSelector((s) => s.clis);
	const webSites = useCenterTabsStoreSelector((s) => s.webSites);
	const hasSplit = useCenterTabsStoreSelector(
		(s) => Object.keys(s.groups).length > 1,
	);
	const scopeRef = useRef<HTMLDivElement>(null);

	// 这块是"新手第一次分屏"的落点，六个入口逐个铺开比整块淡入更容易被逐条读到。
	useGsapMotion(
		({ gsap, dur, amp, expressive }) => {
			const tl = gsap.timeline();
			tl.from("[data-empty-head]", {
				y: amp(12),
				opacity: 0,
				duration: dur(0.42),
				ease: EASE.outExpo,
				clearProps: "transform,opacity",
			});
			tl.from(
				"[data-empty-action]",
				{
					y: amp(14),
					scale: expressive ? 0.94 : 1,
					opacity: 0,
					duration: dur(0.44),
					ease: EASE.spring,
					stagger: expressive ? { each: 0.045, from: "start" } : 0,
					clearProps: "transform,opacity",
				},
				dur(0.08),
			);
			tl.from(
				"[data-empty-foot]",
				{
					opacity: 0,
					duration: dur(0.36),
					ease: "none",
					clearProps: "opacity",
				},
				dur(0.24),
			);
		},
		{ scope: scopeRef },
	);

	const openWebSite = async () => {
		const ok = await centerTabsStore.openWebSite(undefined, groupId);
		if (ok) return;
		toast.info("尚未启用任何 Web AI 站点，请先在设置中启用");
		events.emit(EVENTS.OPEN_SETTINGS, { tab: HARNESS_HUB_SETTINGS_TAB });
	};

	return (
		<div
			ref={scopeRef}
			className="flex h-full flex-col items-center justify-center gap-5 px-8"
		>
			<div data-empty-head className="text-center">
				<p className="text-sm font-medium text-text-secondary">
					{hasSplit ? "这一屏还空着" : "打开一个工作视图"}
				</p>
				<p className="mt-1 text-xs text-text-muted">
					{hasSplit
						? "挑一个放进来，或者把别的标签拖过来"
						: "对话在右栏进行；这里放运行图、预览、终端这些视图"}
				</p>
			</div>

			<div className="grid w-full max-w-md grid-cols-2 gap-2">
				<EmptyAction
					icon={<Workflow className="h-4 w-4" strokeWidth={1.5} />}
					label="运行图"
					hint="看任务跑到哪了"
					onClick={() => centerTabsStore.openSandboxView("graph")}
				/>
				<EmptyAction
					icon={<Eye className="h-4 w-4" strokeWidth={1.5} />}
					label="预览"
					hint="看产物"
					onClick={() => centerTabsStore.openSandboxView("preview")}
				/>
				<EmptyAction
					icon={<SquareTerminal className="h-4 w-4" strokeWidth={1.5} />}
					label={clis[0] ? clis[0].label : "本机 CLI"}
					hint={clis.length > 0 ? "在中栏跑本机 coding agent" : "未探测到"}
					disabled={clis.length === 0}
					onClick={() => {
						const first = clis[0];
						if (first) void centerTabsStore.openCli(first, groupId);
					}}
				/>
				<EmptyAction
					icon={<Globe className="h-4 w-4" strokeWidth={1.5} />}
					label="Web AI"
					hint={
						webSites.length > 0
							? `${webSites.length} 个已启用站点`
							: "去设置启用"
					}
					onClick={() => void openWebSite()}
				/>
				<EmptyAction
					icon={<Compass className="h-4 w-4" strokeWidth={1.5} />}
					label="浏览器"
					hint="内嵌网页"
					onClick={() => centerTabsStore.openBrowser(groupId)}
				/>
			</div>

			{hasSplit ? (
				<p
					data-empty-foot
					className="flex items-center gap-1.5 text-xs text-text-light"
				>
					<Move className="h-3 w-3" strokeWidth={1.5} />
					把其它标签拖进来也行；不想要这一屏就点标签条右侧的 ×
				</p>
			) : (
				<p data-empty-foot className="text-xs text-text-light">
					也可以点标签条右侧的 +，或用{" "}
					{formatKeys("mod+alt+arrowright").join(" ")} 在标签间切换
				</p>
			)}
		</div>
	);
}

function EmptyAction({
	icon,
	label,
	hint,
	disabled,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	hint: string;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			data-empty-action
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left",
				"transition-colors duration-150 focus-ring",
				disabled
					? "cursor-not-allowed opacity-40"
					: "cursor-pointer hover:border-warm-400 hover:bg-warm-100",
			)}
		>
			{/* 图标垫一层暖底 —— 六个裸线性图标贴在白卡上会显得像一列表单字段 */}
			<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warm-200/70 text-text-secondary">
				{icon}
			</span>
			<span className="min-w-0">
				<span className="block truncate text-sm font-medium text-text-primary">
					{label}
				</span>
				<span className="mt-px block truncate text-xs text-text-muted">
					{hint}
				</span>
			</span>
		</button>
	);
}
