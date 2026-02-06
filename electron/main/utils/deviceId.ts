/**
 * 设备指纹生成器
 * 用于多设备同步时区分不同设备的备份
 */
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";

/**
 * 生成设备唯一 ID
 * 基于 MAC 地址 + 机器名 + UUID
 */
export function generateDeviceId(): string {
	try {
		// 获取第一个有效的 MAC 地址
		const nets = networkInterfaces();
		let mac = "";

		for (const name of Object.keys(nets)) {
			const netInfo = nets[name];
			if (!netInfo) continue;

			for (const net of netInfo) {
				// 跳过内部和非 IPv4 地址
				if (net.internal || net.family !== "IPv4") continue;

				mac = net.mac;
				break;
			}

			if (mac) break;
		}

		// 如果没有找到 MAC 地址，使用机器名
		if (!mac || mac === "00:00:00:00:00:00") {
			const hostname = require("os").hostname();
			mac = hostname.replace(/[^a-zA-Z0-9]/g, "_");
		}

		// 清理 MAC 地址（移除冒号）
		const cleanMac = mac.replace(/:/g, "").toLowerCase();

		// 生成短 UUID（前 8 位）
		const shortUuid = randomUUID().split("-")[0];

		// 组合：mac-uuid
		return `${cleanMac}-${shortUuid}`;
	} catch (error) {
		console.error("[DeviceId] Failed to generate device ID:", error);
		// 回退：使用随机 UUID
		return `device-${randomUUID().split("-")[0]}`;
	}
}

/**
 * 获取设备友好名称
 * 例如："MacBook Pro (macOS)"
 */
export function getDeviceName(): string {
	try {
		const { hostname: getHostname, platform } = require("os");
		const hostnameStr = getHostname();
		const platformStr = platform();

		// 平台友好名称
		const platformNames: Record<string, string> = {
			darwin: "macOS",
			win32: "Windows",
			linux: "Linux",
		};

		const platformName = platformNames[platformStr] || platformStr;

		return `${hostnameStr} (${platformName})`;
	} catch (error) {
		return "Unknown Device";
	}
}

/**
 * 从备份文件名中提取设备 ID
 * 格式：backup_{deviceId}_{timestamp}.zip
 * 例如：backup_mac-abc123_2025-02-02T12-00-00.zip
 */
export function extractDeviceIdFromFileName(fileName: string): string | null {
	const match = fileName.match(/^backup_([^_]+)_/);
	return match ? match[1] : null;
}

/**
 * 生成带设备 ID 的备份文件名
 */
export function generateBackupFileName(deviceId: string): string {
	const now = new Date();
	const timestamp = now.toISOString().replace(/[:.]/g, "-").split(".")[0];
	return `backup_${deviceId}_${timestamp}.zip`;
}

/**
 * 检查是否为新格式的备份文件名（包含设备 ID）
 */
export function isMultiDeviceBackupFileName(fileName: string): boolean {
	return /^backup_[^_]+_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/.test(
		fileName,
	);
}
