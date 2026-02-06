/**
 * 冲突检测服务
 * 用于检测多设备同时修改的数据冲突
 */
import { getDbContext } from "../db/client";

export interface ConflictInfo {
	hasConflict: boolean;
	localLastModified: number;
	remoteLastModified: number;
	timeDifference: number; // 毫秒
}

export class ConflictDetectionService {
	/**
	 * 检测是否存在潜在冲突
	 * 简化策略：比较本地和远程的最后修改时间
	 */
	static async detectConflict(
		remoteLastModified: number,
	): Promise<ConflictInfo> {
		const db = getDbContext();

		// 获取本地最后修改时间
		const result = await db.client.execute({
			sql: "SELECT last_sync_at FROM sync_config WHERE id = 'default'",
			args: [],
		});

		const localLastModified = (result.rows[0]?.last_sync_at as number) || 0;
		const timeDifference = Math.abs(remoteLastModified - localLastModified);

		// 如果时间差大于 5 分钟，可能存在冲突
		const hasConflict = timeDifference > 5 * 60 * 1000 && localLastModified > 0;

		return {
			hasConflict,
			localLastModified,
			remoteLastModified,
			timeDifference,
		};
	}

	/**
	 * 格式化时间差
	 */
	static formatTimeDifference(ms: number): string {
		const minutes = Math.floor(ms / 60000);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days} 天前`;
		if (hours > 0) return `${hours} 小时前`;
		if (minutes > 0) return `${minutes} 分钟前`;
		return "刚刚";
	}
}
