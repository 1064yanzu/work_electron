import { confirmDialog as confirmDialogUI } from "../components/ui/ConfirmDialog";
import { inputDialog } from "../components/ui/InputDialog";

export async function openDirectory(options?: {
	title?: string;
	defaultPath?: string;
}) {
	const value = await inputDialog.show({
		title: options?.title || "选择目录",
		message: "请输入目录绝对路径",
		defaultValue: options?.defaultPath ?? "",
		placeholder: "/Users/name/path",
		confirmText: "确定",
		cancelText: "取消",
		validate: (next) => {
			if (!next.trim()) return "目录路径不能为空";
			return null;
		},
	});
	return value?.trim() || null;
}

export async function saveFilePath(options?: {
	title?: string;
	defaultPath?: string;
}) {
	const value = await inputDialog.show({
		title: options?.title || "输入保存路径",
		message: "请输入保存文件的绝对路径",
		defaultValue: options?.defaultPath ?? "",
		placeholder: "/Users/name/file.md",
		confirmText: "确定",
		cancelText: "取消",
		validate: (next) => {
			if (!next.trim()) return "保存路径不能为空";
			return null;
		},
	});
	return value?.trim() || null;
}

export async function confirmDialog(message: string) {
	return confirmDialogUI.show({
		title: "确认操作",
		message,
		confirmText: "确认",
		cancelText: "取消",
	});
}
