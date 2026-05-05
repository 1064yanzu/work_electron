import type { DashboardStats } from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function getDashboardStats(): Promise<DashboardStats> {
	return await safeInvoke("dashboard_stats");
}

export interface DailyActivity {
	date: string;
	count: number;
}

export async function getDailyActivity(days: number): Promise<DailyActivity[]> {
	return await safeInvoke("get_daily_activity", { days });
}
