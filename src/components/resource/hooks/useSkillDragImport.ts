// Skill 拖拽导入 Hook
// 仅在技能库视图激活时注册全局 window drop 监听，将拖入的文件夹路径作为技能导入

import { useCallback, useEffect, useRef, useState } from "react";
import { skillsStore } from "../../../lib/skillsStore";
import { toast } from "../../ui/Toast";

export interface SkillDragImportState {
	isDragging: boolean;
	isImporting: boolean;
}

interface UseSkillDragImportOptions {
	/** 仅当技能库视图激活时传 true */
	enabled: boolean;
}

export function useSkillDragImport({
	enabled,
}: UseSkillDragImportOptions): SkillDragImportState {
	const [isDragging, setIsDragging] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const dragCounterRef = useRef(0);

	const resolveFilePath = useCallback((file: File): string => {
		const electronApi =
			typeof window !== "undefined" ? window.electronAPI : undefined;
		if (electronApi && typeof electronApi.getPathForFile === "function") {
			try {
				const p = electronApi.getPathForFile(file);
				if (p) return p;
			} catch {}
		}
		return (file as unknown as { path?: string }).path || "";
	}, []);

	useEffect(() => {
		if (!enabled) return;

		const isFileDrag = (e: DragEvent) => {
			const types = e.dataTransfer?.types;
			if (!types) return false;
			for (let i = 0; i < types.length; i += 1) {
				if (types[i] === "Files") return true;
			}
			return false;
		};

		const onDragEnter = (e: DragEvent) => {
			if (!isFileDrag(e)) return;
			e.preventDefault();
			dragCounterRef.current += 1;
			setIsDragging(true);
		};

		const onDragOver = (e: DragEvent) => {
			if (!isFileDrag(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
			setIsDragging(true);
		};

		const onDragLeave = (e: DragEvent) => {
			if (!isFileDrag(e)) return;
			dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
			if (dragCounterRef.current === 0) {
				setIsDragging(false);
			}
		};

		const onDrop = async (e: DragEvent) => {
			e.preventDefault();
			dragCounterRef.current = 0;
			setIsDragging(false);

			const files = Array.from(e.dataTransfer?.files ?? []);
			if (files.length === 0) {
				toast.error("没有检测到文件，请重试");
				return;
			}

			const paths = files
				.map((f) => resolveFilePath(f))
				.filter((p): p is string => Boolean(p));

			if (paths.length === 0) {
				toast.error("无法获取文件路径，请检查应用权限");
				return;
			}

		setIsImporting(true);
		let successCount = 0;
		const errors: string[] = [];

		for (const path of paths) {
			try {
				await skillsStore.importSkill(path);
				successCount += 1;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				errors.push(message);
			}
		}

		setIsImporting(false);

		if (successCount > 0) {
			toast.success(
				successCount === 1
					? "技能导入成功"
					: `成功导入 ${successCount} 个技能`,
			);
		}
		if (errors.length > 0) {
			toast.error(`导入失败：${errors[0]}${errors.length > 1 ? ` 等 ${errors.length} 个` : ""}`);
		}
	};

		const onDragEnd = () => {
			dragCounterRef.current = 0;
			setIsDragging(false);
		};

		window.addEventListener("dragenter", onDragEnter);
		window.addEventListener("dragover", onDragOver);
		window.addEventListener("dragleave", onDragLeave);
		window.addEventListener("drop", onDrop);
		window.addEventListener("dragend", onDragEnd);

		return () => {
			window.removeEventListener("dragenter", onDragEnter);
			window.removeEventListener("dragover", onDragOver);
			window.removeEventListener("dragleave", onDragLeave);
			window.removeEventListener("drop", onDrop);
			window.removeEventListener("dragend", onDragEnd);
			dragCounterRef.current = 0;
		};
	}, [enabled, resolveFilePath]);

	return { isDragging, isImporting };
}
