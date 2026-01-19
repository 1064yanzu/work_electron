import {
	Check,
	Copy,
	Download,
	Maximize2,
	RefreshCw,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import mermaid from "mermaid";
import { memo, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

mermaid.initialize({
	startOnLoad: false,
	theme: "default",
	securityLevel: "loose",
	fontFamily: "ui-sans-serif, system-ui, sans-serif",
});

interface MermaidRendererProps {
	chart: string;
	className?: string;
}

const MermaidRenderer = memo(function MermaidRenderer({
	chart,
	className,
}: MermaidRendererProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [svg, setSvg] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [scale, setScale] = useState(1);
	const [copied, setCopied] = useState(false);

	// Generate unique ID for each chart
	const [id] = useState(
		() => `mermaid-${Math.random().toString(36).substr(2, 9)}`,
	);

	useEffect(() => {
		let mounted = true;

		const renderChart = async () => {
			if (!chart || !containerRef.current) return;

			try {
				setError(null);
				// Clear previous SVG
				setSvg("");

				// mermaid.render usually returns an object with svg field in newer versions
				// In older versions, it returned just string.
				// We'll try to handle it.
				const { svg } = await mermaid.render(id, chart);

				if (mounted) {
					setSvg(svg);
				}
			} catch (err) {
				if (mounted) {
					console.error("Mermaid render error:", err);
					setError(
						err instanceof Error ? err.message : "Failed to render diagram",
					);
				}
			}
		};

		renderChart();

		return () => {
			mounted = false;
		};
	}, [chart, id]);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(chart);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3));
	const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));
	const handleReset = () => setScale(1);

	const [isFullscreen, setIsFullscreen] = useState(false);

	const handleDownload = async (format: "svg" | "png" = "svg") => {
		if (!containerRef.current) return;
		const svgElement = containerRef.current.querySelector("svg");
		if (!svgElement) return;

		try {
			// Create a clone to avoid polluting the UI
			const clonedSvg = svgElement.cloneNode(true) as SVGElement;

			// Ensure namespaces are present
			clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			clonedSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

			const serializer = new XMLSerializer();
			let svgData = serializer.serializeToString(clonedSvg);

			// Fix for some browser quirks
			if (!svgData.startsWith("<?xml")) {
				svgData = '<?xml version="1.0" standalone="no"?>\n' + svgData;
			}

			const timestamp = Date.now();
			const filename = `mermaid-chart-${timestamp}`;

			if (format === "svg") {
				const svgBlob = new Blob([svgData], {
					type: "image/svg+xml;charset=utf-8",
				});
				const url = URL.createObjectURL(svgBlob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `${filename}.svg`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			} else {
				// PNG Export - can still fail in WebKit due to SecurityError
				const img = new Image();
				const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
				const url = `data:image/svg+xml;base64,${svgBase64}`;

				img.onload = () => {
					try {
						const canvas = document.createElement("canvas");
						const scale = 2;
						const width = svgElement.clientWidth || 800;
						const height = svgElement.clientHeight || 600;

						canvas.width = width * scale;
						canvas.height = height * scale;
						const ctx = canvas.getContext("2d");
						if (!ctx) return;

						ctx.fillStyle = "#ffffff";
						ctx.fillRect(0, 0, canvas.width, canvas.height);
						ctx.scale(scale, scale);
						ctx.drawImage(img, 0, 0, width, height);

						const pngUrl = canvas.toDataURL("image/png");
						const a = document.createElement("a");
						a.href = pngUrl;
						a.download = `${filename}.png`;
						document.body.appendChild(a);
						a.click();
						document.body.removeChild(a);
					} catch (err) {
						console.error(
							"PNG export failed due to security restrictions, falling back to SVG:",
							err,
						);
						handleDownload("svg"); // Fallback to SVG
					}
				};
				img.src = url;
			}
		} catch (err) {
			console.error("Download failed:", err);
		}
	};

	const Controls = () => (
		<div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
			<button
				onClick={handleZoomOut}
				className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
				title="缩小"
			>
				<ZoomOut className="w-3.5 h-3.5" />
			</button>
			<button
				onClick={handleReset}
				className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
				title="重置"
			>
				<RefreshCw className="w-3.5 h-3.5" />
			</button>
			<button
				onClick={handleZoomIn}
				className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
				title="放大"
			>
				<ZoomIn className="w-3.5 h-3.5" />
			</button>
			<div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
			<button
				onClick={() => setIsFullscreen(true)}
				className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
				title="全屏预览"
			>
				<Maximize2 className="w-3.5 h-3.5" />
			</button>
			<div className="relative group/dl">
				<button
					onClick={() => handleDownload("svg")}
					className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
					title="保存 SVG (推荐)"
				>
					<Download className="w-3.5 h-3.5" />
				</button>
				{/* Optional PNG dropdown can be added here, but default to SVG is safer */}
			</div>
			<div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
			<button
				onClick={handleCopy}
				className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
				title="复制 Meramid 代码"
			>
				{copied ? (
					<Check className="w-3.5 h-3.5 text-emerald-500" />
				) : (
					<Copy className="w-3.5 h-3.5" />
				)}
			</button>
		</div>
	);

	if (error) {
		return (
			<div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-sm">
				<div className="font-semibold text-rose-600 dark:text-rose-400 mb-2">
					Mermaid Render Error
				</div>
				<pre className="whitespace-pre-wrap font-mono text-xs text-rose-500 dark:text-rose-300 overflow-x-auto">
					{error}
				</pre>
				<pre className="mt-4 p-2 bg-white dark:bg-zinc-900 rounded border border-rose-100 dark:border-rose-900/30 font-mono text-xs text-zinc-600 dark:text-zinc-400 overflow-x-auto">
					{chart}
				</pre>
			</div>
		);
	}

	return (
		<>
			<div
				className={cn(
					"relative group border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-950 my-4",
					className,
				)}
			>
				<Controls />
				<div
					ref={containerRef}
					className="overflow-auto flex items-center justify-center p-6 min-h-[100px]"
					style={{ backgroundColor: "#ffffff" }}
				>
					{svg ? (
						<div
							className="mermaid-svg-container transition-transform duration-200 ease-out origin-center"
							style={{ transform: `scale(${scale})` }}
							dangerouslySetInnerHTML={{ __html: svg }}
						/>
					) : (
						<div className="flex items-center gap-2 text-sm text-zinc-400 animate-pulse">
							<RefreshCw className="w-4 h-4 animate-spin" />
							Rendering chart...
						</div>
					)}
				</div>
			</div>

			{/* Fullscreen Modal */}
			{isFullscreen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8 animate-in fade-in duration-200">
					<div className="relative w-full h-full bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col">
						<div className="absolute top-4 right-4 flex items-center gap-2 z-10 bg-white/50 backdrop-blur-sm p-1 rounded-lg border border-zinc-200 shadow-sm">
							<button
								onClick={() => setIsFullscreen(false)}
								className="p-2 hover:bg-zinc-100 rounded-md text-zinc-500 hover:text-zinc-800 transition-colors"
							>
								<X className="w-5 h-5" />
							</button>
						</div>

						<div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-white">
							{svg && (
								<div
									className="origin-center"
									style={{ transform: `scale(${scale * 1.5})` }} // Zoom in a bit more for fullscreen
									dangerouslySetInnerHTML={{ __html: svg }}
								/>
							)}
						</div>

						{/* Toolbar at bottom */}
						<div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 backdrop-blur shadow-lg border border-zinc-200 rounded-full px-4 py-2">
							<button
								onClick={handleZoomOut}
								className="p-2 hover:bg-zinc-100 rounded-full"
							>
								<ZoomOut className="w-4 h-4" />
							</button>
							<button
								onClick={handleReset}
								className="p-2 hover:bg-zinc-100 rounded-full"
							>
								<RefreshCw className="w-4 h-4" />
							</button>
							<button
								onClick={handleZoomIn}
								className="p-2 hover:bg-zinc-100 rounded-full"
							>
								<ZoomIn className="w-4 h-4" />
							</button>
							<div className="w-px h-4 bg-zinc-300 mx-1" />
							<button
								onClick={() => handleDownload("svg")}
								className="p-2 hover:bg-zinc-100 rounded-full"
								title="保存 SVG"
							>
								<Download className="w-4 h-4" />
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
});

export default MermaidRenderer;
