/**
 * 设计系统缩略图。
 *
 * 工作流程：
 * 1. mount 时调用 design_get_system_thumbnail；若 ready=true 直接显示图片
 * 2. 若 ready=false，展示渐变占位 + 等待 `design:thumbnail-ready` 事件
 * 3. 收到事件后用同样的本地路径（带 file:// + cache-buster）渲染 <img>
 *
 * 失败时回退到 swatches 渐变占位，保证布局不抖。
 */
import { useEffect, useRef, useState } from "react";
import { designGetSystemThumbnail } from "../../../lib/api/design";
import { convertFileSrc } from "../../../lib/tauriCompat";
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
	mtime?: number;
}

export function SystemThumbnail({
	systemId,
	swatches,
	title,
	className,
}: SystemThumbnailProps) {
	const [path, setPath] = useState<string | null>(null);
	const [ready, setReady] = useState(false);
	const [version, setVersion] = useState(0);
	const aliveRef = useRef(true);

	useEffect(() => {
		aliveRef.current = true;
		setPath(null);
		setReady(false);

		void (async () => {
			try {
				const r = await designGetSystemThumbnail(systemId);
				if (!aliveRef.current) return;
				setPath(r.path);
				setReady(r.ready);
				if (r.ready) setVersion((v) => v + 1);
			} catch {
				// 留占位
			}
		})();

		const off = listen<ThumbnailReadyPayload>(
			"design:thumbnail-ready",
			(event) => {
				if (!aliveRef.current) return;
				const p = event?.payload;
				if (!p || p.system_id !== systemId) return;
				if (p.path) {
					setPath(p.path);
					setReady(true);
					setVersion((v) => v + 1);
				}
			},
		);

		return () => {
			aliveRef.current = false;
			void off.then((fn) => fn?.());
		};
	}, [systemId]);

	const sw =
		swatches && swatches.length > 0 ? swatches : ["#F2E9DC", "#E0CFB6", "#C9A98D"];

	const gradient = `linear-gradient(135deg, ${sw[0]}, ${sw[Math.min(sw.length - 1, 2)] || sw[0]})`;

	return (
		<div
			className={`relative w-full overflow-hidden ${className ?? ""}`}
			style={{ background: gradient }}
		>
			{ready && path ? (
				<img
					key={`${path}-${version}`}
					src={`${convertFileSrc(path)}?_=${version}`}
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
						<div className="text-base font-semibold text-text-primary truncate max-w-[14rem]">
							{title ?? systemId}
						</div>
						<div className="flex gap-1">
							{sw.slice(0, 5).map((c, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: swatch
									key={i}
									className="w-3 h-3 rounded-full ring-1 ring-black/5"
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
