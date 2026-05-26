/**
 * Inspect 浮动 overlay。
 *
 * 通过 iframe.contentDocument.head.appendChild(<script>) 临时注入 inspect 脚本
 * (只改内存,不写磁盘),让用户在预览里 hover/click 元素 → postMessage 回父窗口 →
 * 写入 designPreviewStore.inspected。
 *
 * 退出 Inspect 时通过 bumpRefreshKey 让 iframe 重载,自动清除注入。
 */
import { Eraser, ScanSearch, X } from "lucide-react";
import { useEffect, type RefObject } from "react";
import {
	designPreviewStore,
	type InspectedElement,
	useDesignPreviewStoreSelector,
} from "../../../lib/stores/designPreviewStore";
import type { DesignViewportFrameHandle } from "./DesignViewportFrame";

interface DesignInspectOverlayProps {
	frameRef: RefObject<DesignViewportFrameHandle | null>;
	onClose: () => void;
}

const INJECT_FLAG = "__design_inspect_injected__";
const MESSAGE_TYPE = "design-inspect-element";

export function DesignInspectOverlay({
	frameRef,
	onClose,
}: DesignInspectOverlayProps) {
	const inspected = useDesignPreviewStoreSelector((s) => s.inspected);

	useEffect(() => {
		const iframe = frameRef.current?.getIframe();
		if (!iframe) return;

		const tryInject = () => {
			try {
				const doc = iframe.contentDocument;
				const win = iframe.contentWindow as
					| (Window & { [k: string]: unknown })
					| null;
				if (!doc || !win) return;
				if (win[INJECT_FLAG] === true) return;
				win[INJECT_FLAG] = true;

				const script = doc.createElement("script");
				script.textContent = INSPECT_SCRIPT;
				doc.head.appendChild(script);

				const style = doc.createElement("style");
				style.textContent = INSPECT_STYLE;
				doc.head.appendChild(style);
			} catch (err) {
				console.warn("[DesignInspectOverlay] inject failed", err);
			}
		};

		if (iframe.contentDocument?.readyState === "complete") {
			tryInject();
		}
		iframe.addEventListener("load", tryInject);

		const onMessage = (e: MessageEvent) => {
			if (e.source !== iframe.contentWindow) return;
			const data = e.data as { type?: string; payload?: InspectedElement };
			if (data?.type === MESSAGE_TYPE && data.payload) {
				designPreviewStore.setInspected(data.payload);
			}
		};
		window.addEventListener("message", onMessage);

		return () => {
			iframe.removeEventListener("load", tryInject);
			window.removeEventListener("message", onMessage);
		};
	}, [frameRef]);

	const handleClose = () => {
		designPreviewStore.setInspected(null);
		// 重新加载 iframe 以清除注入
		designPreviewStore.bumpRefreshKey();
		onClose();
	};

	const handleClear = () => {
		designPreviewStore.setInspected(null);
	};

	return (
		<div className="absolute top-3.5 right-3.5 z-[5] w-80 max-h-[calc(100%-28px)] rounded-xl bg-background border border-border shadow-bai-pop overflow-hidden flex flex-col">
			<header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-bg-surface">
				<div className="flex items-center gap-1.5 min-w-0">
					<ScanSearch
						className="w-3.5 h-3.5 text-primary shrink-0"
						strokeWidth={1.5}
					/>
					<span className="text-[11px] uppercase tracking-wider text-text-muted">
						Inspect
					</span>
				</div>
				<div className="flex items-center gap-0.5">
					<button
						type="button"
						onClick={handleClear}
						className="p-1 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded transition-colors"
						title="清除选择"
					>
						<Eraser className="w-3 h-3" strokeWidth={1.6} />
					</button>
					<button
						type="button"
						onClick={handleClose}
						className="p-1 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded transition-colors"
						title="关闭"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				</div>
			</header>

			<div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 text-[12px]">
				{!inspected ? (
					<div className="text-[11.5px] text-text-muted leading-relaxed py-4 text-center">
						在左侧预览中点击任意元素,这里会显示它的标签、类名 和关键样式。
					</div>
				) : (
					<div className="space-y-2">
						<div>
							<div className="text-[10.5px] uppercase tracking-wider text-text-muted">
								元素
							</div>
							<code className="block mt-1 text-[12px] text-primary break-all font-mono">
								&lt;{inspected.tagName}
								{inspected.id ? ` id="${inspected.id}"` : ""}
								{inspected.classes.length > 0
									? ` class="${inspected.classes.join(" ")}"`
									: ""}
								&gt;
							</code>
						</div>

						<div>
							<div className="text-[10.5px] uppercase tracking-wider text-text-muted">
								尺寸
							</div>
							<div className="mt-1 font-mono text-[11.5px] text-text-primary tabular-nums">
								{Math.round(inspected.rect.width)} ×{" "}
								{Math.round(inspected.rect.height)} px
							</div>
						</div>

						{inspected.styles.length > 0 ? (
							<div>
								<div className="text-[10.5px] uppercase tracking-wider text-text-muted">
									样式
								</div>
								<div className="mt-1 space-y-0.5">
									{inspected.styles.map((s) => (
										<div
											key={s.property}
											className="flex items-baseline gap-2 text-[11.5px] font-mono"
										>
											<span className="text-text-muted">{s.property}:</span>
											<span className="text-text-primary truncate">
												{s.value}
											</span>
										</div>
									))}
								</div>
							</div>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}

const INSPECT_STYLE = `
[data-design-inspect-hover] { outline: 2px solid #D96C46 !important; outline-offset: -2px !important; }
[data-design-inspect-active] { outline: 2px solid #c96442 !important; outline-offset: -2px !important; box-shadow: 0 0 0 9999px rgba(217,108,70,0.04); }
`;

const INSPECT_SCRIPT = `
(function(){
  var lastHover = null;
  var lastActive = null;
  var FACETS = ['color','background-color','font-size','font-family','line-height','padding','margin','border','border-radius','display','flex-direction','gap','width','height'];
  function pick(el){
    var cs = getComputedStyle(el);
    var styles = [];
    FACETS.forEach(function(p){
      var v = cs.getPropertyValue(p);
      if (v) styles.push({property:p,value:v.trim()});
    });
    var rect = el.getBoundingClientRect();
    var attrs = {};
    Array.from(el.attributes||[]).forEach(function(a){ attrs[a.name]=a.value; });
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || '',
      classes: Array.from(el.classList||[]),
      attrs: attrs,
      styles: styles,
      rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left }
    };
  }
  document.addEventListener('mouseover', function(e){
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (lastHover && lastHover !== t) lastHover.removeAttribute('data-design-inspect-hover');
    t.setAttribute('data-design-inspect-hover','');
    lastHover = t;
  }, true);
  document.addEventListener('mouseout', function(){
    if (lastHover) { lastHover.removeAttribute('data-design-inspect-hover'); lastHover=null; }
  }, true);
  document.addEventListener('click', function(e){
    var t = e.target;
    if (!(t instanceof Element)) return;
    e.preventDefault();
    e.stopPropagation();
    if (lastActive) lastActive.removeAttribute('data-design-inspect-active');
    t.setAttribute('data-design-inspect-active','');
    lastActive = t;
    parent.postMessage({ type: '${MESSAGE_TYPE}', payload: pick(t) }, '*');
  }, true);
})();
`;
