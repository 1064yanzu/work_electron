import { useEffect, useRef, useState } from "react";
import { designGetSystemThumbnail } from "../../../lib/api/design";
import { listen } from "../../../lib/tauriEventCompat";

interface SystemThumbnailProps {
	systemId: string;
	swatches?: string[];
	title?: string;
	className?: string;
}

interface ThumbnailReadyPayload {
	system_id: string;
	path: string;
	mtime_ms?: number;
	base64?: string;
}

type ThumbnailListener = (payload: ThumbnailReadyPayload) => void;

const thumbnailListeners = new Map<string, Set<ThumbnailListener>>();
let globalUnlistenPromise: Promise<() => void> | null = null;

function ensureGlobalListener() {
	if (globalUnlistenPromise) return;
	globalUnlistenPromise = listen<ThumbnailReadyPayload>(
		"design:thumbnail-ready",
		(event) => {
			const p = event?.payload;
			if (!p?.system_id) return;
			const bucket = thumbnailListeners.get(p.system_id);
			if (!bucket) return;
			for (const fn of bucket) {
				try {
					fn(p);
				} catch (err) {
					console.error("[SystemThumbnail] listener error", err);
				}
			}
		},
	);
}

function subscribeThumbnail(systemId: string, fn: ThumbnailListener) {
	ensureGlobalListener();
	let bucket = thumbnailListeners.get(systemId);
	if (!bucket) {
		bucket = new Set();
		thumbnailListeners.set(systemId, bucket);
	}
	bucket.add(fn);
	return () => {
		const b = thumbnailListeners.get(systemId);
		if (!b) return;
		b.delete(fn);
		if (b.size === 0) thumbnailListeners.delete(systemId);
	};
}

export function SystemThumbnail({
	systemId,
	swatches,
	title,
	className,
}: SystemThumbnailProps) {
	const [imageSrc, setImageSrc] = useState<string | null>(null);
	const [ready, setReady] = useState(false);
	const [visible, setVisible] = useState(false);
	const [version, setVersion] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const aliveRef = useRef(true);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "100px" },
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!visible) return;

		aliveRef.current = true;
		setImageSrc(null);
		setReady(false);

		void (async () => {
			try {
				const r = await designGetSystemThumbnail(systemId);
				if (!aliveRef.current) return;
				if (r.ready && r.base64) {
					setImageSrc(`data:image/png;base64,${r.base64}`);
				}
				setReady(r.ready);
				if (r.ready) setVersion((v) => v + 1);
			} catch {
				// 留占位
			}
		})();

		const off = subscribeThumbnail(systemId, (p) => {
			if (!aliveRef.current) return;
			if (p.base64) {
				setImageSrc(`data:image/png;base64,${p.base64}`);
				setReady(true);
				setVersion((v) => v + 1);
			}
		});

		return () => {
			aliveRef.current = false;
			off();
		};
	}, [systemId, visible]);

	const sw =
		swatches && swatches.length > 0
			? swatches
			: ["#F2E9DC", "#E0CFB6", "#C9A98D"];

	const gradient = `linear-gradient(135deg, ${sw[0]}, ${sw[Math.min(sw.length - 1, 2)] || sw[0]})`;

	return (
		<div
			ref={containerRef}
			className={`relative w-full overflow-hidden ${className ?? ""}`}
			style={{ background: gradient }}
		>
			{ready && imageSrc ? (
				<img
					key={`${imageSrc.slice(-20)}-${version}`}
					src={imageSrc}
					alt={title ?? systemId}
					loading="lazy"
					className="absolute inset-0 w-full h-full object-cover object-top opacity-0 animate-thumbnail-fade-in"
					onError={(e) => {
						(e.currentTarget as HTMLImageElement).style.display = "none";
					}}
				/>
			) : (
				<div className="absolute inset-0 flex items-end p-4">
					<div className="flex flex-col gap-1.5">
						<div className="text-[12px] font-semibold text-text-primary truncate max-w-[14rem] opacity-70">
							{title ?? systemId}
						</div>
						<div className="flex gap-1">
							{sw.slice(0, 5).map((c, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: swatch
									key={i}
									className="w-2.5 h-2.5 rounded-full ring-1 ring-black/5"
									style={{ backgroundColor: c }}
								/>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
