import { cn } from "../../../../lib/utils";

export function RemoteStatusBadge(props: {
	text: string;
	tone: "green" | "amber" | "red" | "zinc";
}) {
	const toneClass = {
		green: "border-mint-500/30 bg-mint-500/10 text-mint-600",
		amber: "border-peach-500/30 bg-peach-500/10 text-peach-500",
		red: "border-[#b53333]/30 bg-[#b53333]/[0.08] text-[#b53333]",
		zinc: "border-border bg-warm-200 text-text-secondary",
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
