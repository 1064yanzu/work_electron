import {
	FileText,
	Globe,
	Image as ImageIcon,
	type LucideIcon,
	Mic,
	Type,
} from "lucide-react";
import { SourceType } from "../../../types";

/** 根据资料库 Source 的类型选择对应的 Lucide 图标 */
export function getSourceIcon(kind: SourceType): LucideIcon {
	switch (kind) {
		case SourceType.Web:
			return Globe;
		case SourceType.Audio:
			return Mic;
		case SourceType.Image:
			return ImageIcon;
		case SourceType.Text:
			return Type;
		default:
			return FileText;
	}
}
