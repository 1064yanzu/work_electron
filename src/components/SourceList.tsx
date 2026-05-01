import {
	File,
	FileText,
	Globe,
	Image as ImageIcon,
	Layers,
	Mic,
	Plus,
	RefreshCw,
	Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createSource, listSources, searchSources } from "../lib/api";
import { type Source, SourceType } from "../types";

// 列表条数超过该阈值时启用虚拟化；少量数据时直接 .map 渲染避免 measureElement 开销。
const VIRTUALIZATION_THRESHOLD = 50;

export function SourceList() {
	const [sources, setSources] = useState<Source[]>([]);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");

	const fetchSources = async () => {
		setLoading(true);
		try {
			const data = search
				? await searchSources({ keyword: search })
				: await listSources();
			setSources(data);
		} catch (error) {
			console.error("Failed to fetch sources:", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		// Debounce search could be better, but simple effect for now
		const timer = setTimeout(fetchSources, 300);
		return () => clearTimeout(timer);
	}, [search]);

	const handleCreateMockSource = async () => {
		try {
			await createSource({
				title: `New Source ${new Date().toLocaleTimeString()}`,
				kind: SourceType.Web,
				url: "https://example.com",
				tags: ["research"],
			});
			fetchSources();
		} catch (error) {
			console.error(error);
		}
	};

	const getIcon = (kind: SourceType) => {
		switch (kind) {
			case SourceType.Web:
				return <Globe className="w-4 h-4" />;
			case SourceType.Audio:
				return <Mic className="w-4 h-4" />;
			case SourceType.Image:
				return <ImageIcon className="w-4 h-4" />;
			case SourceType.Text:
				return <FileText className="w-4 h-4" />;
			default:
				return <File className="w-4 h-4" />;
		}
	};

	const renderItem = (source: Source) => (
		<div className="group p-3 bg-surface rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
			<div className="flex items-start justify-between mb-1">
				<div className="font-medium text-sm text-text-primary line-clamp-2 leading-snug">
					{source.title}
				</div>
				<div className="text-text-muted group-hover:text-primary transition-colors">
					{getIcon(source.kind)}
				</div>
			</div>
			<div className="flex items-center gap-2 text-xs text-text-muted mt-2">
				<span className="px-1.5 py-0.5 bg-surface rounded text-[10px] uppercase tracking-wider border border-border">
					{source.kind}
				</span>
				<span>{new Date(source.created_at).toLocaleDateString()}</span>
			</div>
		</div>
	);

	const virtualized = sources.length >= VIRTUALIZATION_THRESHOLD;

	return (
		<aside className="w-[300px] min-w-[250px] border-r border-border bg-panel-input flex flex-col h-full">
			<div className="p-4 border-b border-border flex items-center justify-between bg-surface/50 backdrop-blur-sm">
				<div className="flex items-center gap-2 text-text-secondary">
					<Layers className="w-5 h-5 text-primary" />
					<h2 className="font-serif font-medium tracking-wide text-sm">
						Input Dock
					</h2>
				</div>
				<button
					onClick={fetchSources}
					className="p-1 hover:bg-black/5 rounded-md transition-colors"
				>
					<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
				</button>
			</div>

			<div className="p-3 border-b border-border">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search sources..."
						className="w-full pl-9 pr-3 py-1.5 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
					/>
				</div>
			</div>

			{virtualized ? (
				<VirtualizedSources sources={sources} renderItem={renderItem} />
			) : (
				<div className="flex-1 overflow-y-auto p-3 space-y-3">
					{sources.length === 0 && !loading && (
						<div className="text-center py-8 text-text-muted text-sm">
							No sources found.
						</div>
					)}
					{sources.map((source) => (
						<div key={source.id}>{renderItem(source)}</div>
					))}
				</div>
			)}

			<div className="p-4 border-t border-border bg-surface/50">
				<button
					onClick={handleCreateMockSource}
					className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors text-sm font-medium flex items-center justify-center gap-2 shadow-sm"
				>
					<Plus className="w-4 h-4" />
					Add Source
				</button>
			</div>
		</aside>
	);
}

interface VirtualizedSourcesProps {
	sources: Source[];
	renderItem: (source: Source) => React.ReactNode;
}

function VirtualizedSources({ sources, renderItem }: VirtualizedSourcesProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: sources.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 96, // 卡片 ~84px + 间距 12px
		overscan: 6,
	});

	return (
		<div ref={parentRef} className="flex-1 overflow-y-auto p-3">
			<div
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{virtualizer.getVirtualItems().map((virtualItem) => {
					const source = sources[virtualItem.index];
					return (
						<div
							key={source.id}
							data-index={virtualItem.index}
							ref={virtualizer.measureElement}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${virtualItem.start}px)`,
								paddingBottom: 12,
							}}
						>
							{renderItem(source)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
