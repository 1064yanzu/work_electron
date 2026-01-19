import { X } from "lucide-react";
import type * as React from "react";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200">
			<div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
				<div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface">
					<h3 className="font-serif font-medium text-lg text-text-primary">
						{title}
					</h3>
					<button
						onClick={onClose}
						className="rounded-full p-1 hover:bg-border/50 text-text-muted hover:text-text-primary transition-colors"
					>
						<X className="h-4 w-4" />
						<span className="sr-only">Close</span>
					</button>
				</div>
				<div className="p-6">{children}</div>
			</div>
		</div>
	);
}
