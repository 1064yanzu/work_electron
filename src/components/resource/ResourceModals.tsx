// 资料侧边栏模态框组件

import { Folder as FolderIcon, Paperclip } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { Folder, Source } from "../../types";
import { UNASSIGNED_FOLDER_ID } from "./hooks/useFolderManagement";

interface ResourceModalsProps {
	// 新建文件夹
	isFolderModalOpen: boolean;
	setIsFolderModalOpen: (open: boolean) => void;
	newFolderName: string;
	setNewFolderName: (name: string) => void;
	handleCreateFolder: () => void;
	currentFolderId: string | null;
	foldersById: Map<string, Folder>;

	// 批量移动资料
	isMoveFolderModalOpen: boolean;
	setIsMoveFolderModalOpen: (open: boolean) => void;
	moveFolderTargetId: string;
	setMoveFolderTargetId: (id: string) => void;
	handleMoveSelectedToFolder: () => void;
	selectedIds: string[];
	flatFolderOptions: Array<{ id: string; name: string; depth: number }>;

	// 重命名文件夹
	isRenameFolderModalOpen: boolean;
	setIsRenameFolderModalOpen: (open: boolean) => void;
	renameFolderTarget: Folder | null;
	setRenameFolderTarget: (folder: Folder | null) => void;
	renameFolderName: string;
	setRenameFolderName: (name: string) => void;
	handleRenameFolder: () => void;

	// 移动文件夹
	isMoveFolderToModalOpen: boolean;
	setIsMoveFolderToModalOpen: (open: boolean) => void;
	moveFolderSource: Folder | null;
	setMoveFolderSource: (folder: Folder | null) => void;
	moveFolderToTargetId: string;
	setMoveFolderToTargetId: (id: string) => void;
	handleMoveFolderTo: () => void;
	getAvailableParentFolders: (
		excludeFolderId: string,
	) => Array<{ id: string; name: string; depth: number }>;

	// 单个资料移动
	singleSourceMoveModal: Source | null;
	setSingleSourceMoveModal: (source: Source | null) => void;
	singleSourceMoveTargetId: string;
	setSingleSourceMoveTargetId: (id: string) => void;
	handleSingleSourceMove: () => void;

	// 新增资料
	isAddModalOpen: boolean;
	setIsAddModalOpen: (open: boolean) => void;
	activeTab: "web" | "text" | "file";
	setActiveTab: (tab: "web" | "text" | "file") => void;
	newSourceTitle: string;
	setNewSourceTitle: (title: string) => void;
	newSourceContent: string;
	setNewSourceContent: (content: string) => void;
	selectedFile: File | null;
	setSelectedFile: (file: File | null) => void;
	handleCreateSource: () => void;
}

export function ResourceModals({
	isFolderModalOpen,
	setIsFolderModalOpen,
	newFolderName,
	setNewFolderName,
	handleCreateFolder,
	currentFolderId,
	foldersById,
	isMoveFolderModalOpen,
	setIsMoveFolderModalOpen,
	moveFolderTargetId,
	setMoveFolderTargetId,
	handleMoveSelectedToFolder,
	selectedIds,
	flatFolderOptions,
	isRenameFolderModalOpen,
	setIsRenameFolderModalOpen,
	renameFolderTarget: _renameFolderTarget,
	setRenameFolderTarget,
	renameFolderName,
	setRenameFolderName,
	handleRenameFolder,
	isMoveFolderToModalOpen,
	setIsMoveFolderToModalOpen,
	moveFolderSource,
	setMoveFolderSource,
	moveFolderToTargetId,
	setMoveFolderToTargetId,
	handleMoveFolderTo,
	getAvailableParentFolders,
	singleSourceMoveModal,
	setSingleSourceMoveModal,
	singleSourceMoveTargetId,
	setSingleSourceMoveTargetId,
	handleSingleSourceMove,
	isAddModalOpen,
	setIsAddModalOpen,
	activeTab,
	setActiveTab,
	newSourceTitle,
	setNewSourceTitle,
	newSourceContent,
	setNewSourceContent,
	selectedFile,
	setSelectedFile,
	handleCreateSource,
}: ResourceModalsProps) {
	return (
		<>
			{/* Folder Modal */}
			<Modal
				isOpen={isFolderModalOpen}
				onClose={() => setIsFolderModalOpen(false)}
				title="新建文件夹"
			>
				<div className="space-y-4">
					<div className="text-xs text-zinc-500">
						{currentFolderId && currentFolderId !== UNASSIGNED_FOLDER_ID
							? `父文件夹：${foldersById.get(currentFolderId)?.name || "（未知）"}`
							: "父文件夹：根目录"}
					</div>
					<input
						type="text"
						value={newFolderName}
						onChange={(e) => setNewFolderName(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-base font-medium placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
						placeholder="输入文件夹名称..."
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreateFolder();
						}}
					/>
					<div className="flex items-center justify-end gap-2">
						<button
							onClick={() => setIsFolderModalOpen(false)}
							className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleCreateFolder}
							disabled={!newFolderName.trim()}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							创建
						</button>
					</div>
				</div>
			</Modal>

			{/* Move Folder Modal */}
			<Modal
				isOpen={isMoveFolderModalOpen}
				onClose={() => setIsMoveFolderModalOpen(false)}
				title="移动到文件夹"
			>
				<div className="space-y-4">
					<div className="text-xs text-zinc-500">
						将 {selectedIds.length} 条资料移动到：
					</div>
					<select
						value={moveFolderTargetId}
						onChange={(e) => setMoveFolderTargetId(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
					>
						<option value={UNASSIGNED_FOLDER_ID}>未归类</option>
						{flatFolderOptions.map((opt) => (
							<option key={opt.id} value={opt.id}>
								{`${"—".repeat(opt.depth)}${opt.depth > 0 ? " " : ""}${opt.name}`}
							</option>
						))}
					</select>
					<div className="flex items-center justify-end gap-2">
						<button
							onClick={() => setIsMoveFolderModalOpen(false)}
							className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleMoveSelectedToFolder}
							disabled={!selectedIds.length}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							移动
						</button>
					</div>
				</div>
			</Modal>

			{/* Rename Folder Modal */}
			<Modal
				isOpen={isRenameFolderModalOpen}
				onClose={() => {
					setIsRenameFolderModalOpen(false);
					setRenameFolderTarget(null);
					setRenameFolderName("");
				}}
				title="重命名文件夹"
			>
				<div className="space-y-4">
					<input
						type="text"
						value={renameFolderName}
						onChange={(e) => setRenameFolderName(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-base font-medium placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
						placeholder="输入新名称..."
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRenameFolder();
						}}
					/>
					<div className="flex items-center justify-end gap-2">
						<button
							onClick={() => {
								setIsRenameFolderModalOpen(false);
								setRenameFolderTarget(null);
								setRenameFolderName("");
							}}
							className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleRenameFolder}
							disabled={!renameFolderName.trim()}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							确认
						</button>
					</div>
				</div>
			</Modal>

			{/* Move Folder To Modal */}
			<Modal
				isOpen={isMoveFolderToModalOpen}
				onClose={() => {
					setIsMoveFolderToModalOpen(false);
					setMoveFolderSource(null);
					setMoveFolderToTargetId("");
				}}
				title="移动文件夹"
			>
				<div className="space-y-4">
					<div className="text-xs text-zinc-500">
						将「{moveFolderSource?.name}」移动到：
					</div>
					<select
						value={moveFolderToTargetId}
						onChange={(e) => setMoveFolderToTargetId(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
					>
						<option value="">根目录</option>
						{moveFolderSource &&
							getAvailableParentFolders(moveFolderSource.id).map((opt) => (
								<option key={opt.id} value={opt.id}>
									{`${"—".repeat(opt.depth)}${opt.depth > 0 ? " " : ""}${opt.name}`}
								</option>
							))}
					</select>
					<div className="flex items-center justify-end gap-2">
						<button
							onClick={() => {
								setIsMoveFolderToModalOpen(false);
								setMoveFolderSource(null);
								setMoveFolderToTargetId("");
							}}
							className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleMoveFolderTo}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90"
						>
							移动
						</button>
					</div>
				</div>
			</Modal>

			{/* Single Source Move Modal */}
			<Modal
				isOpen={!!singleSourceMoveModal}
				onClose={() => {
					setSingleSourceMoveModal(null);
					setSingleSourceMoveTargetId("");
				}}
				title="移动到文件夹"
			>
				<div className="space-y-4">
					<div className="text-xs text-zinc-500 dark:text-zinc-400">
						将「{singleSourceMoveModal?.title}」移动到：
					</div>
					<div className="max-h-[300px] overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/30">
						<div className="p-2 space-y-1">
							{/* 未归类选项 */}
							<button
								onClick={() =>
									setSingleSourceMoveTargetId(UNASSIGNED_FOLDER_ID)
								}
								className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
									singleSourceMoveTargetId === UNASSIGNED_FOLDER_ID
										? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
										: "hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
								}`}
							>
								<FolderIcon className="w-4 h-4 shrink-0" />
								<span className="text-sm font-medium">未归类</span>
							</button>
							{/* 文件夹树 */}
							{flatFolderOptions.map((opt) => (
								<button
									key={opt.id}
									onClick={() => setSingleSourceMoveTargetId(opt.id)}
									className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
										singleSourceMoveTargetId === opt.id
											? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
											: "hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
									}`}
									style={{ paddingLeft: 12 + opt.depth * 20 }}
								>
									<FolderIcon className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
									<span className="text-sm font-medium truncate">
										{opt.name}
									</span>
								</button>
							))}
						</div>
					</div>
					<div className="flex items-center justify-end gap-2 pt-2">
						<button
							onClick={() => {
								setSingleSourceMoveModal(null);
								setSingleSourceMoveTargetId("");
							}}
							className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleSingleSourceMove}
							className="px-4 py-2 text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity font-medium"
						>
							移动
						</button>
					</div>
				</div>
			</Modal>

			{/* Add Modal */}
			<Modal
				isOpen={isAddModalOpen}
				onClose={() => setIsAddModalOpen(false)}
				title="新增资料"
			>
				<div className="space-y-4">
					{/* Tabs */}
					<div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
						{(["web", "text", "file"] as const).map((tab) => (
							<button
								key={tab}
								onClick={() => setActiveTab(tab)}
								className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
									activeTab === tab
										? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
										: "text-zinc-500"
								}`}
							>
								{tab === "web" ? "网页" : tab === "text" ? "笔记" : "文件"}
							</button>
						))}
					</div>

					<input
						type="text"
						value={newSourceTitle}
						onChange={(e) => setNewSourceTitle(e.target.value)}
						className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-base font-medium placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
						placeholder="输入标题..."
					/>

					{activeTab === "web" && (
						<input
							type="url"
							value={newSourceContent}
							onChange={(e) => setNewSourceContent(e.target.value)}
							className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-sm font-mono placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
							placeholder="https://..."
						/>
					)}

					{activeTab === "text" && (
						<textarea
							value={newSourceContent}
							onChange={(e) => setNewSourceContent(e.target.value)}
							className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-none rounded-xl text-sm h-48 resize-none placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 leading-relaxed"
							placeholder="输入内容..."
						/>
					)}

					{activeTab === "file" && (
						<div className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-8 text-center hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors relative group">
							<input
								type="file"
								accept=".txt,.md,.markdown,.json,.csv,.html,.htm,.xml,.yaml,.yml,.toml,.rst,.log,.conf,.ini,.rtf,.pdf,.docx,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.svg"
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (!file) return;
									const reader = new FileReader();
									reader.onload = (event) => {
										setNewSourceContent(event.target?.result as string);
										setNewSourceTitle(file.name);
										setSelectedFile(file);
									};
									reader.readAsText(file);
								}}
							/>
							<div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
								<Paperclip className="w-5 h-5 text-zinc-400" />
							</div>
							<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
								{selectedFile ? selectedFile.name : "点击或拖拽文件上传"}
							</p>
							<p className="text-xs text-zinc-400 mt-1">
								支持文本、PDF、Word、图片等常见格式
							</p>
						</div>
					)}

					<div className="flex justify-end gap-2 pt-4">
						<button
							onClick={() => setIsAddModalOpen(false)}
							className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleCreateSource}
							className="px-6 py-2 bg-black dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-black text-sm font-medium rounded-lg shadow-sm transition-colors"
						>
							创建文档
						</button>
					</div>
				</div>
			</Modal>
		</>
	);
}
