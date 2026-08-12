import { Mascot } from "../Mascot/Mascot";
import { useMascot } from "../../lib/mascotStore";

export function WelcomeScreen() {
	const { enabled } = useMascot();

	return (
		<div className="flex flex-col h-full items-center justify-center -mt-8 animate-in fade-in duration-700 slide-in-from-bottom-4 relative z-10 transition-[color,background-color,border-color,opacity,box-shadow,transform]">
			<div className="flex flex-col items-center text-center mb-10 z-10">
				{enabled ? (
					<Mascot slot="state-greet" size="2xl" float wrapperClassName="mb-4" />
				) : (
					<div
						className="w-12 h-12 rounded-full bai-avatar-glow mb-6"
						aria-hidden
					/>
				)}

				<h3
					className="text-[1.5rem] font-semibold text-text-primary mb-2 leading-tight"
					style={{ letterSpacing: "-0.02em" }}
				>
					有什么可以帮您的？
				</h3>

				<p className="text-[0.875rem] text-text-secondary max-w-[300px] leading-relaxed">
					深度研究、分析资料、撰写内容
				</p>
			</div>
		</div>
	);
}
