import { cn } from "../../../../lib/utils";

export function RemoteStatusBadge(props: {
	text: string;
	tone: "green" | "amber" | "red" | "zinc";
}) {
	const toneClass = {
		green:
			"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
		amber:
			"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
		red: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
		zinc: "border-border bg-warm-50 text-text-secondary",
	} as const;
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
				toneClass[props.tone],
			)}
		>
			{props.text}
		</span>
	);
}
