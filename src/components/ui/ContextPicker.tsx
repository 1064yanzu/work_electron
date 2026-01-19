import { FileText, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { listOutputAssets, listSources } from "../../lib/api";

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
	const [items, setItems] = useState<ContextItem[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);

	useEffect(() => {
		const fetchData = async () => {
			try {
				const [sources, outputs] = await Promise.all([
					listSources(),
					listOutputAssets(),
				]);

				const contextItems: ContextItem[] = [
					...sources.map((s) => ({
						id: s.id,
						title: s.title,
						type: "source" as const,
						kind: s.kind,
					})),
					...outputs.map((o) => ({
						id: o.id,
						title: o.title,
						type: "output" as const,
						kind: o.output_type,
					})),
				];

				const filtered = contextItems.filter((item) =>
					item.title.toLowerCase().includes(filterText.toLowerCase()),
				);

				setItems(filtered);
				setSelectedIndex(0);
			} catch (error) {
				console.error("Failed to fetch context items", error);
			}
		};

		fetchData();
	}, [filterText]);

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
		<div className="absolute bottom-full left-0 mb-2 w-full max-h-[300px] overflow-y-auto bg-white rounded-xl shadow-xl border border-border z-50 animate-in fade-in zoom-in-95 duration-100">
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
