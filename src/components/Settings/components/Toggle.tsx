interface ToggleProps {
	checked: boolean;
	onChange: () => void;
	size?: "sm" | "md";
}

export function Toggle({ checked, onChange, size = "md" }: ToggleProps) {
	const sizeClasses = {
		sm: { track: "w-8 h-5", dot: "h-4 w-4", translate: "translate-x-3" },
		md: { track: "w-11 h-6", dot: "h-5 w-5", translate: "translate-x-5" },
	}[size];

	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={onChange}
			className={`relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${sizeClasses.track} ${
				checked ? "bg-primary" : "bg-warm-300"
			}`}
		>
			<span
				className={`pointer-events-none inline-block rounded-full bg-surface shadow-bai-card ring-0 transition-transform duration-200 ease-in-out ${sizeClasses.dot} ${
					checked ? sizeClasses.translate : "translate-x-0"
				}`}
				style={{ marginTop: "2px", marginLeft: "2px" }}
			/>
		</button>
	);
}
