import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "thread_project_pins";

function readPinnedProjectKeys(): Set<string> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return new Set();
		return new Set(
			parsed.filter((item): item is string => typeof item === "string"),
		);
	} catch (error) {
		console.warn("[ThreadsView] 读取固定项目失败:", error);
		return new Set();
	}
}

function writePinnedProjectKeys(keys: Set<string>) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keys)));
	} catch (error) {
		console.warn("[ThreadsView] 保存固定项目失败:", error);
	}
}

export function useThreadProjectPins() {
	const [pinnedProjectKeys, setPinnedProjectKeys] = useState<Set<string>>(() =>
		readPinnedProjectKeys(),
	);

	useEffect(() => {
		writePinnedProjectKeys(pinnedProjectKeys);
	}, [pinnedProjectKeys]);

	const toggleProjectPin = useCallback((key: string) => {
		setPinnedProjectKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	return { pinnedProjectKeys, toggleProjectPin };
}
