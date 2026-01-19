export type InvokeArgs = Record<string, unknown>;

export function isDesktopEnvironment() {
	return (
		typeof window !== "undefined" &&
		typeof window.electronAPI?.invoke === "function"
	);
}

export async function invoke<T>(
	command: string,
	args?: InvokeArgs,
): Promise<T> {
	if (!isDesktopEnvironment()) {
		throw new Error("TAURI_UNAVAILABLE");
	}

	const input = (() => {
		const a = (args ?? {}) as Record<string, unknown>;
		if ("payload" in a) {
			const p = a.payload;
			if (p === undefined) return {};
			if (p !== null && typeof p === "object") return p as Record<string, unknown>;
		}

		if (command === "delete_provider") {
			if (typeof a.providerId === "string") return { id: a.providerId };
		}

		if (command === "check_provider_api_key") {
			if (typeof a.providerId === "string") return { provider_id: a.providerId };
		}

		if (command === "record_project_visit") {
			if (typeof a.projectId === "string") return { project_id: a.projectId };
		}

		if (command === "list_folders") {
			if (typeof a.projectId === "string") return { project_id: a.projectId };
			if (a.projectId === null) return { project_id: undefined };
		}

		if (command === "get_card_image_path") {
			if (typeof a.imagePath === "string") return { image_path: a.imagePath };
		}

		return a;
	})();

	return window.electronAPI.invoke(command as never, input as never) as Promise<T>;
}

export function convertFileSrc(filePath: string) {
	const normalized = filePath.replace(/\\/g, "/");
	if (normalized.startsWith("file://")) return normalized;
	const prefix = normalized.startsWith("/") ? "file://" : "file:///";
	return `${prefix}${encodeURI(normalized)}`;
}
