import { FileText, Folder, Image as ImageIcon } from "lucide-react";
import { useMemo } from "react";
import { getOutputAsset } from "../../../lib/api/output";
import {
	filterSourcesByProjectAndFolder,
	useCardsQuery,
	useOutputAssetsQuery,
	useSourcesQuery,
} from "../../../lib/query";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../../lib/workspaceStore";
import type { SlashCommand } from "../SlashCommand";
import { getSourceIcon } from "./getSourceIcon";

const EMPTY_COMMANDS: SlashCommand[] = [];

interface UseDynamicSlashCommandsArgs {
	enabled: boolean;
	onTriggerFilePicker: () => void;
}

/**
 * 装配斜杠命令面板里的动态条目（资料库 / 卡片 / 文档 / 最近打开 + 导入文件）。
 *
 * - `enabled` 用来短路：菜单未打开时不订阅 docCache / projectId / 三个 React Query
 * - `onTriggerFilePicker` 抽出去后，斜杠命令的 action 回调与 fileInputRef 解耦
 */
export function useDynamicSlashCommands({
	enabled,
	onTriggerFilePicker,
}: UseDynamicSlashCommandsArgs) {
	const currentProjectId = useWorkspaceStoreSelector((state) =>
		enabled ? state.currentProjectId : null,
	);
	const currentFolderId = useWorkspaceStoreSelector((state) =>
		enabled ? state.currentFolderId : null,
	);
	const sourcesQuery = useSourcesQuery(currentProjectId, { enabled });
	const cardsQuery = useCardsQuery({ enabled });
	const outputsQuery = useOutputAssetsQuery({ enabled });

	const sources = useMemo(
		() =>
			!enabled
				? []
				: filterSourcesByProjectAndFolder(
						sourcesQuery.data ?? [],
						currentProjectId,
						currentFolderId,
					),
		[enabled, sourcesQuery.data, currentProjectId, currentFolderId],
	);
	const cards = useMemo(
		() => (enabled ? (cardsQuery.data ?? []) : []),
		[enabled, cardsQuery.data],
	);
	const outputs = useMemo(
		() => (enabled ? (outputsQuery.data ?? []) : []),
		[enabled, outputsQuery.data],
	);
	const recentDocs: Array<{ id: string; title: string; content: string }> = [];

	const addSelectionToContext =
		workspaceStore.addSelectionToContext.bind(workspaceStore);
	const addSourceToContext =
		workspaceStore.addSourceToContext.bind(workspaceStore);

	const dynamicCommands = useMemo(() => {
		if (!enabled) return EMPTY_COMMANDS;
		const commands: SlashCommand[] = [];

		// 1. 导入本地文件
		commands.push({
			id: "import-file",
			name: "导入本地文件",
			description: "选择并读取本地文件内容",
			icon: Folder,
			category: "data",
			group: "操作",
			action: onTriggerFilePicker,
		});

		// 2. 资料库
		sources.forEach((source) => {
			commands.push({
				id: `source-${source.id}`,
				name: source.title,
				description: "资料库",
				icon: getSourceIcon(source.kind),
				category: "data",
				group: "资料库",
				action: () => {
					addSourceToContext(source);
				},
			});
		});

		// 3. 卡片
		cards.forEach((card) => {
			commands.push({
				id: `card-${card.id}`,
				name: card.title || "分享卡片",
				description: card.text.slice(0, 30).replace(/\n/g, " ") + "...",
				icon: ImageIcon,
				category: "data",
				group: "卡片",
				action: () => {
					addSelectionToContext(card.text, `卡片: ${card.title}`);
				},
			});
		});

		// 4. 文档
		outputs.forEach((output) => {
			commands.push({
				id: `output-${output.id}`,
				name: output.title || "未命名文档",
				description: output.content.slice(0, 30).replace(/\n/g, " ") + "...",
				icon: FileText,
				category: "data",
				group: "文档",
				action: () => {
					// 列表缓存是 meta_only 摘要，注入上下文前按需拉全文
					void (async () => {
						const full = await getOutputAsset(output.id).catch(() => null);
						addSelectionToContext(
							full?.content ?? output.content,
							output.title,
						);
					})();
				},
			});
		});

		// 5. 最近打开
		recentDocs.forEach((doc) => {
			commands.push({
				id: `doc-${doc.id}`,
				name: doc.title || "未命名文档",
				description: doc.content.slice(0, 30).replace(/\n/g, " ") + "...",
				icon: FileText,
				category: "data",
				group: "最近打开",
				action: () => {
					addSelectionToContext(doc.content, doc.title);
				},
			});
		});

		return commands;
	}, [
		enabled,
		sources,
		cards,
		outputs,
		recentDocs,
		addSelectionToContext,
		addSourceToContext,
		onTriggerFilePicker,
	]);

	return dynamicCommands;
}
