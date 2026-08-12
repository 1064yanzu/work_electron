import { useMemo } from "react";

interface ActivityData {
	date: string;
	count: number;
}

interface ActivityHeatmapProps {
	data: ActivityData[];
	startDate?: Date;
}

// 限制显示的最大周数，避免溢出
const MAX_WEEKS = 26; // 约半年

export function ActivityHeatmap({ data, startDate }: ActivityHeatmapProps) {
	const weeks = useMemo(() => {
		// 默认显示最近半年的数据
		const daysToShow = MAX_WEEKS * 7;
		const start =
			startDate || new Date(Date.now() - daysToShow * 24 * 60 * 60 * 1000);
		const end = new Date();
		const weeks: ActivityData[][] = [];
		let currentWeek: ActivityData[] = [];

		const dataMap = new Map(data.map((d) => [d.date, d.count]));

		for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
			const dateStr = d.toISOString().split("T")[0];
			const count = dataMap.get(dateStr) || 0;

			currentWeek.push({ date: dateStr, count });

			if (currentWeek.length === 7) {
				weeks.push([...currentWeek]);
				currentWeek = [];
			}
		}

		if (currentWeek.length > 0) {
			while (currentWeek.length < 7) {
				currentWeek.push({ date: "", count: 0 });
			}
			weeks.push(currentWeek);
		}

		// 限制最大周数
		return weeks.slice(-MAX_WEEKS);
	}, [data, startDate]);

	const getColor = (count: number) => {
		if (count === 0) return "bg-cream-100";
		if (count <= 2) return "bg-green-200";
		if (count <= 5) return "bg-green-400";
		if (count <= 10) return "bg-green-600";
		return "bg-green-800";
	};

	const months = [
		"1月",
		"2月",
		"3月",
		"4月",
		"5月",
		"6月",
		"7月",
		"8月",
		"9月",
		"10月",
		"11月",
		"12月",
	];
	const days = ["周一", "周三", "周五"];

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-6">
				<div className="flex-1 overflow-hidden">
					<div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
						{/* Month labels */}
						<div className="flex flex-col gap-1 pr-2">
							<div className="h-3" /> {/* Spacer for months */}
							{days.map((day, i) => (
								<div
									key={i}
									className="text-[11px] text-text-muted h-3 leading-3"
								>
									{day}
								</div>
							))}
						</div>

						{weeks.map((week, weekIndex) => (
							<div key={weekIndex} className="flex flex-col gap-1">
								{weekIndex % 4 === 0 && weekIndex > 0 ? (
									<div className="text-[11px] text-text-muted h-3">
										{week[0]?.date
											? months[new Date(week[0].date).getMonth()]
											: ""}
									</div>
								) : (
									<div className="h-3" />
								)}
								{week.map((day, dayIndex) => (
									<div
										key={dayIndex}
										className={`w-3 h-3 rounded-sm ${day.count > 0 ? getColor(day.count) : "bg-cream-100"} ${day.date ? "cursor-pointer hover:ring-2 hover:ring-primary/50" : ""}`}
										title={day.date ? `${day.date}: ${day.count} 次活动` : ""}
									/>
								))}
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Legend */}
			<div className="flex items-center gap-2 text-xs text-text-muted">
				<span>少</span>
				<div className="flex gap-1">
					<div className="w-3 h-3 rounded-sm bg-cream-100" />
					<div className="w-3 h-3 rounded-sm bg-green-200" />
					<div className="w-3 h-3 rounded-sm bg-green-400" />
					<div className="w-3 h-3 rounded-sm bg-green-600" />
					<div className="w-3 h-3 rounded-sm bg-green-800" />
				</div>
				<span>多</span>
			</div>
		</div>
	);
}
