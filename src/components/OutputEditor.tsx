import { FileText, PenTool, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	createOutputAsset,
	deleteOutputAsset,
	listOutputAssets,
} from "../lib/api";
import { type OutputAsset, OutputType } from "../types";

export function OutputEditor() {
	const [assets, setAssets] = useState<OutputAsset[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);

	const fetchAssets = async () => {
		try {
			const data = await listOutputAssets();
			setAssets(data);
			if (data.length > 0 && !activeId) {
				setActiveId(data[0].id);
			}
		} catch (error) {
			console.error(error);
		}
	};

	useEffect(() => {
		fetchAssets();
	}, []);

	const handleCreateAsset = async () => {
		try {
			const newAsset = await createOutputAsset({
				title: "Untitled Draft",
				content: "# New Draft\n\nStart writing here...",
				output_type: OutputType.Article,
				related_notes: [],
			});
			await fetchAssets();
			setActiveId(newAsset.id);
		} catch (error) {
			console.error(error);
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm("Are you sure?")) return;
		try {
			await deleteOutputAsset(id);
			if (activeId === id) setActiveId(null);
			fetchAssets();
		} catch (error) {
			console.error(error);
		}
	};

	const activeAsset = assets.find((a) => a.id === activeId);

	return (
		<aside className="w-[400px] min-w-[300px] bg-panel-output flex flex-col h-full border-l border-border">
			<div className="p-4 border-b border-border flex items-center justify-between bg-white/50 backdrop-blur-sm">
				<div className="flex items-center gap-2 text-text-secondary">
					<PenTool className="w-5 h-5 text-primary" />
					<h2 className="font-serif font-medium tracking-wide text-sm">
						Output Stage
					</h2>
				</div>
				<div className="flex gap-1">
					<button
						onClick={handleCreateAsset}
						className="p-1.5 hover:bg-surface rounded text-text-secondary transition-colors"
					>
						<FileText className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Asset Tabs / List */}
			<div className="flex overflow-x-auto border-b border-border bg-surface/30 px-2 gap-1 hide-scrollbar">
				{assets.map((asset) => (
					<button
						key={asset.id}
						onClick={() => setActiveId(asset.id)}
						className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap max-w-[120px] truncate ${
							activeId === asset.id
								? "border-primary text-primary bg-white/50"
								: "border-transparent text-text-muted hover:text-text-secondary hover:bg-white/30"
						}`}
					>
						{asset.title}
					</button>
				))}
			</div>

			<div className="flex-1 overflow-y-auto p-8 bg-white">
				{activeAsset ? (
					<article className="prose prose-stone prose-sm max-w-none">
						<div className="flex items-center justify-between mb-6 not-prose">
							<div className="text-xs text-text-muted uppercase tracking-wider">
								{activeAsset.output_type} • v{activeAsset.version}
							</div>
							<div className="flex gap-2">
								<button
									onClick={() => handleDelete(activeAsset.id)}
									className="p-1 text-text-muted hover:text-red-500 transition-colors"
								>
									<Trash2 className="w-4 h-4" />
								</button>
								<button className="p-1 text-text-muted hover:text-primary transition-colors">
									<Save className="w-4 h-4" />
								</button>
							</div>
						</div>
						{/* Simple rendering for now, replacing newlines with br for demo */}
						<div
							dangerouslySetInnerHTML={{
								__html: activeAsset.content.replace(/\n/g, "<br/>"),
							}}
						/>
					</article>
				) : (
					<div className="h-full flex flex-col items-center justify-center text-text-muted">
						<FileText className="w-12 h-12 opacity-20 mb-4" />
						<p>Select or create a document</p>
					</div>
				)}
			</div>
		</aside>
	);
}
