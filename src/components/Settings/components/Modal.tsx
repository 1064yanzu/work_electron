import { X } from "lucide-react";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200">
				<div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
					<h3 className="font-semibold text-lg text-zinc-900">{title}</h3>
					<button
						onClick={onClose}
						className="p-2 -mr-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>
				<div className="p-6">{children}</div>
			</div>
		</div>
	);
}
