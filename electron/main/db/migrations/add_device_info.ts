/**
 * 数据库迁移脚本 - 添加设备信息字段
 * 版本：v1.1.0
 * 日期：2026-02-02
 */

export const migration_add_device_info = `
-- 添加设备信息字段到 sync_config 表
-- 使用 ALTER TABLE 因为表可能已经存在

-- 检查并添加 device_id 列
ALTER TABLE sync_config ADD COLUMN device_id TEXT;

-- 检查并添加 device_name 列
ALTER TABLE sync_config ADD COLUMN device_name TEXT;
`;

/**
 * 安全的迁移执行函数
 * 会检查列是否已存在，避免重复添加
 */
export async function migrateAddDeviceInfo(db: any): Promise<void> {
	try {
		// 检查 device_id 列是否已存在
		const tableInfo = await db.client.execute({
			sql: "PRAGMA table_info(sync_config)",
			args: [],
		});

		const columns = tableInfo.rows.map((row: any) => row.name);
		const hasDeviceId = columns.includes("device_id");
		const hasDeviceName = columns.includes("device_name");

		// 只添加缺失的列
		if (!hasDeviceId) {
			await db.client.execute({
				sql: "ALTER TABLE sync_config ADD COLUMN device_id TEXT",
				args: [],
			});
			console.log("[Migration] Added device_id column to sync_config");
		}

		if (!hasDeviceName) {
			await db.client.execute({
				sql: "ALTER TABLE sync_config ADD COLUMN device_name TEXT",
				args: [],
			});
			console.log("[Migration] Added device_name column to sync_config");
		}

		if (hasDeviceId && hasDeviceName) {
			console.log("[Migration] Device info columns already exist, skipping");
		}
	} catch (error) {
		console.error("[Migration] Failed to add device info columns:", error);
		throw error;
	}
}
