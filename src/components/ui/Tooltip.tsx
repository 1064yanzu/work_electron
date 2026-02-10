import { type ReactNode, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

interface TooltipProps {
    children: ReactNode;
    content: string;
    /** 延迟显示毫秒数 */
    delay?: number;
    /** 位置偏好 */
    placement?: "top" | "bottom";
}

/**
 * 简易 Tooltip 组件，鼠标悬浮显示文字说明
 */
export function Tooltip({
    children,
    content,
    delay = 400,
    placement = "bottom",
}: TooltipProps) {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

    const showTooltip = () => {
        timeoutRef.current = setTimeout(() => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = placement === "bottom" ? rect.bottom + 6 : rect.top - 6;
                setPosition({ x, y });
                setVisible(true);
            }
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setVisible(false);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return (
        <>
            <div
                ref={triggerRef}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                onFocus={showTooltip}
                onBlur={hideTooltip}
                className="inline-flex"
            >
                {children}
            </div>
            {visible &&
                createPortal(
                    <div
                        role="tooltip"
                        className={cn(
                            "fixed z-[9999] px-2.5 py-1.5 text-xs font-medium rounded-lg",
                            "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900",
                            "shadow-lg pointer-events-none whitespace-nowrap",
                            "animate-in fade-in-0 zoom-in-95 duration-150",
                        )}
                        style={{
                            left: position.x,
                            top: position.y,
                            transform:
                                placement === "bottom"
                                    ? "translateX(-50%)"
                                    : "translateX(-50%) translateY(-100%)",
                        }}
                    >
                        {content}
                    </div>,
                    document.body,
                )}
        </>
    );
}
