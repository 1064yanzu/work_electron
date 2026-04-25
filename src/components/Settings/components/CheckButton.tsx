import { AlertCircle, Check, Loader2 } from "lucide-react";

export type CheckStatus = "idle" | "checking" | "success" | "error";

interface CheckButtonProps {
	status: CheckStatus;
	onClick: () => void;
}

export function CheckButton({ status, onClick }: CheckButtonProps) {
	const config = {
		idle: {
			bg: "bg-warm-200 hover:bg-warm-300 active:bg-zinc-300",
			text: "text-text-secondary",
			label: "检 测",
		},
		checking: {
			bg: "bg-warm-200",
			text: "text-text-light",
			label: "",
		},
		success: {
			bg: "bg-emerald-500 hover:bg-emerald-600",
			text: "text-white",
			label: "成功",
		},
		error: {
			bg: "bg-red-500 hover:bg-red-600",
			text: "text-white",
			label: "失败",
		},
	}[status];

	return (
		<button
			onClick={onClick}
			disabled={status === "checking"}
			className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 min-w-[72px] ${config.bg} ${config.text}`}
		>
			{status === "checking" && <Loader2 className="w-4 h-4 animate-spin" />}
			{status === "success" && <Check className="w-4 h-4" />}
			{status === "error" && <AlertCircle className="w-4 h-4" />}
			{config.label}
		</button>
	);
}
