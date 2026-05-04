import { FileText, Globe } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOutputAssetsQuery, useSourcesQuery } from "../../lib/query";

interface ContextPickerProps {
	filterText: string;
	onSelect: (item: ContextItem) => void;
	onClose: () => void;
}

export interface ContextItem {
	id: string;
	title: string;
	type: "source" | "output";
	kind?: string;
}

export function ContextPicker({
	filterText,
	onSelect,
	onClose,
}: ContextPickerProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const sourcesQuery = useSourcesQuery();
	const outputsQuery = useOutputAssetsQuery();

	const items = useMemo(() => {
		const sources = sourcesQuery.data ?? [];
		const outputs = outputsQuery.data ?? [];
		const allItems: ContextItem[] = [
			...sources.map((source) => ({
				id: source.id,
				title: source.title,
				type: "source" as const,
				kind: source.kind,
			})),
			...outputs.map((output) => ({
				id: output.id,
				title: output.title,
				type: "output" as const,
				kind: output.output_type,
			})),
		];
		const keyword = filterText.toLowerCase();
		return allItems.filter((item) =>
			item.title.toLowerCase().includes(keyword),
		);
	}, [sourcesQuery.data, outputsQuery.data, filterText]);

	useEffect(() => {
		setSelectedIndex(0);
	}, [filterText, items.length]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (items.length === 0) return;

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((prev) => (prev + 1) % items.length);
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
					break;
				case "Enter":
					e.preventDefault();
					onSelect(items[selectedIndex]);
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [items, selectedIndex, onSelect, onClose]);

	if (items.length === 0) return null;

	return (
		<div className="absolute bottom-full left-0 mb-2 w-full max-h-[300px] overflow-y-auto bg-cream-50 dark:bg-cream-900 rounded-2xl shadow-bai-pop border border-cream-400 dark:border-cream-500 z-50 animate-in fade-in zoom-in-95 duration-100">
			<div className="p-2 text-xs font-medium text-text-muted uppercase tracking-wider bg-surface/50 sticky top-0 backdrop-blur-sm border-b border-border">
				选择上下文
			</div>
			<div className="p-1">
				{items.map((item, index) => (
					<button
						key={item.id}
						onClick={() => onSelect(item)}
						className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
							index === selectedIndex
								? "bg-primary text-white"
								: "text-text-primary hover:bg-surface"
						}`}
					>
						{item.type === "source" ? (
							<Globe
								className={`w-4 h-4 ${index === selectedIndex ? "text-white" : "text-text-secondary"}`}
							/>
						) : (
							<FileText
								className={`w-4 h-4 ${index === selectedIndex ? "text-white" : "text-text-secondary"}`}
							/>
						)}
						<div className="flex-1 truncate">
							<div className="font-medium">{item.title}</div>
						</div>
						<span
							className={`text-xs ${index === selectedIndex ? "text-white/80" : "text-text-muted"}`}
						>
							{item.type === "source" ? "来源" : "输出"}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
