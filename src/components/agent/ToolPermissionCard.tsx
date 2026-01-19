/**
 * Tool Permission Card Component
 *
 * 工具权限审批卡片，显示工具调用详情并提供允许/拒绝操作。
 * 参考 Cherry Studio 的 ToolPermissionRequestCard 设计。
 */

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
	type ToolPermissionRequest,
	toolPermissionStore,
} from "../../lib/agent/toolPermissionStore";

interface ToolPermissionCardProps {
	request: ToolPermissionRequest;
	onAllow: (id: string) => void;
	onDeny: (id: string) => void;
}

/**
 * 格式化工具输入显示
 */
function formatToolInput(input: Record<string, unknown>): string {
	try {
		const str = JSON.stringify(input, null, 2);
		// 限制显示长度
		if (str.length > 500) {
			return str.slice(0, 500) + "\n... (truncated)";
		}
		return str;
	} catch {
		return String(input);
	}
}

/**
 * 获取工具描述
 */
function getToolDescription(toolName: string): string {
	const descriptions: Record<string, string> = {
		Read: "读取文件内容",
		Write: "创建新文件",
		Edit: "修改现有文件",
		Bash: "执行终端命令",
		Glob: "搜索文件",
		Grep: "搜索文件内容",
		WebSearch: "网络搜索",
		WebFetch: "获取网页内容",
		Skill: "调用技能",
	};
	return descriptions[toolName] || "执行工具";
}

/**
 * 工具权限卡片
 */
export const ToolPermissionCard: React.FC<ToolPermissionCardProps> = ({
	request,
	onAllow,
	onDeny,
}) => {
	const [expanded, setExpanded] = useState(false);
	const [remainingTime, setRemainingTime] = useState(30);

	// 倒计时
	useEffect(() => {
		const interval = setInterval(() => {
			const remaining = Math.max(
				0,
				Math.ceil((request.expiresAt - Date.now()) / 1000),
			);
			setRemainingTime(remaining);
			if (remaining === 0) {
				clearInterval(interval);
			}
		}, 1000);
		return () => clearInterval(interval);
	}, [request.expiresAt]);

	const inputPreview = useMemo(
		() => formatToolInput(request.toolInput),
		[request.toolInput],
	);
	const isSubmitting =
		request.status === "submitting-allow" ||
		request.status === "submitting-deny";

	return (
		<div className="tool-permission-card">
			<div className="tool-permission-header">
				<div className="tool-info">
					<span className="tool-icon">🔧</span>
					<span className="tool-name">{request.toolName}</span>
					<span className="tool-description">
						{getToolDescription(request.toolName)}
					</span>
				</div>
				<div
					className="countdown"
					style={{ color: remainingTime <= 10 ? "#ef4444" : "#6b7280" }}
				>
					{remainingTime}s
				</div>
			</div>

			<div className="tool-permission-body">
				<div className="input-preview" onClick={() => setExpanded(!expanded)}>
					<span className="expand-icon">{expanded ? "▼" : "▶"}</span>
					<span className="preview-label">参数预览</span>
				</div>
				{expanded && <pre className="input-content">{inputPreview}</pre>}
			</div>

			<div className="tool-permission-actions">
				<button
					className="btn-deny"
					onClick={() => onDeny(request.id)}
					disabled={isSubmitting}
				>
					{request.status === "submitting-deny" ? "拒绝中..." : "拒绝"}
				</button>
				<button
					className="btn-allow"
					onClick={() => onAllow(request.id)}
					disabled={isSubmitting}
				>
					{request.status === "submitting-allow" ? "允许中..." : "允许"}
				</button>
			</div>

			<style>{`
                .tool-permission-card {
                    background: var(--bg-secondary, #f9fafb);
                    border: 1px solid var(--border-color, #e5e7eb);
                    border-radius: 8px;
                    padding: 12px;
                    margin: 8px 0;
                }

                .tool-permission-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .tool-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .tool-icon {
                    font-size: 16px;
                }

                .tool-name {
                    font-weight: 600;
                    color: var(--text-primary, #111827);
                }

                .tool-description {
                    color: var(--text-secondary, #6b7280);
                    font-size: 12px;
                }

                .countdown {
                    font-size: 14px;
                    font-weight: 500;
                }

                .tool-permission-body {
                    margin-bottom: 12px;
                }

                .input-preview {
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    color: var(--text-secondary, #6b7280);
                    font-size: 12px;
                }

                .expand-icon {
                    font-size: 10px;
                }

                .input-content {
                    background: var(--bg-tertiary, #f3f4f6);
                    padding: 8px;
                    border-radius: 4px;
                    margin-top: 8px;
                    font-size: 11px;
                    overflow-x: auto;
                    max-height: 200px;
                    overflow-y: auto;
                }

                .tool-permission-actions {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                }

                .btn-allow, .btn-deny {
                    padding: 6px 16px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn-allow {
                    background: var(--primary-color, #3b82f6);
                    color: white;
                    border: none;
                }

                .btn-allow:hover:not(:disabled) {
                    background: var(--primary-hover, #2563eb);
                }

                .btn-deny {
                    background: transparent;
                    color: var(--text-secondary, #6b7280);
                    border: 1px solid var(--border-color, #e5e7eb);
                }

                .btn-deny:hover:not(:disabled) {
                    background: var(--bg-tertiary, #f3f4f6);
                }

                .btn-allow:disabled, .btn-deny:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
		</div>
	);
};

/**
 * 工具权限请求列表
 */
export const ToolPermissionList: React.FC = () => {
	const [requests, setRequests] = useState<ToolPermissionRequest[]>([]);

	useEffect(() => {
		const unsubscribe = toolPermissionStore.subscribe(() => {
			setRequests(toolPermissionStore.getPendingRequests());
		});
		setRequests(toolPermissionStore.getPendingRequests());
		return unsubscribe;
	}, []);

	if (requests.length === 0) {
		return null;
	}

	const handleAllow = (id: string) => {
		toolPermissionStore.allowRequest(id);
	};

	const handleDeny = (id: string) => {
		toolPermissionStore.denyRequest(id);
	};

	return (
		<div className="tool-permission-list">
			{requests.map((request) => (
				<ToolPermissionCard
					key={request.id}
					request={request}
					onAllow={handleAllow}
					onDeny={handleDeny}
				/>
			))}
		</div>
	);
};

export default ToolPermissionCard;
