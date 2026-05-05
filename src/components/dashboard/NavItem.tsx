import type { LucideIcon } from "lucide-react";

interface NavItemProps {
	icon: LucideIcon;
	label: string;
	active?: boolean;
	badge?: string;
	onClick?: () => void;
}

export function NavItem({
	icon: Icon,
	label,
	active,
	badge,
	onClick,
}: NavItemProps) {
	return (
		<button
			onClick={onClick}
			aria-label={label}
			className={`
      w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative text-sm cursor-pointer
      ${
				active
					? "bg-warm-200 text-text-primary"
					: "text-text-secondary hover:bg-warm-200 hover:text-text-primary active:scale-[0.99]"
			}
    `}
		>
			<Icon
				className={`w-4 h-4 transition-colors ${active ? "text-text-primary" : "text-text-muted group-hover:text-text-primary"}`}
				strokeWidth={1.5}
			/>
			<span
				className={`font-medium hidden lg:block ${active ? "font-semibold" : ""}`}
			>
				{label}
			</span>
			{badge && (
				<span className="ml-auto bg-warm-300 text-text-secondary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
					{badge}
				</span>
			)}
		</button>
	);
}
