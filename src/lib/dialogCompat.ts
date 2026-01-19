export async function openDirectory(options?: {
	title?: string;
	defaultPath?: string;
}) {
	const hint = options?.title ? `${options.title}\n` : "";
	const defaultValue = options?.defaultPath ?? "";
	const value = window.prompt(`${hint}请输入目录路径：`, defaultValue);
	if (!value) return null;
	return value;
}

export async function saveFilePath(options?: {
	title?: string;
	defaultPath?: string;
}) {
	const hint = options?.title ? `${options.title}\n` : "";
	const defaultValue = options?.defaultPath ?? "";
	const value = window.prompt(`${hint}请输入保存路径：`, defaultValue);
	if (!value) return null;
	return value;
}

export async function confirmDialog(message: string) {
	return window.confirm(message);
}
