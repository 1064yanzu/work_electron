/**
 * SettingsFormControls — 统一的表单基础控件
 *
 * 所有 Settings 面板的输入控件都应该走这里，禁止再直接用 <input> / <textarea>。
 * 视觉与 Select / SettingsSwitch / SettingsSlider 一致：
 *  - rounded-xl（控件） / rounded-2xl（容器）
 *  - border-border + 暖灰底色，hover 时 cream-400 边框
 *  - focus 时 primary 主色 ring（与 Select 完全相同的反馈）
 *  - 字号 13px，hint 11.5px，label 12.5px
 */
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import {
	forwardRef,
	useEffect,
	useId,
	useRef,
	useState,
	type FocusEvent,
	type KeyboardEvent,
	type ReactNode,
	type TextareaHTMLAttributes,
} from "react";
import { cn } from "../../../lib/utils";

// =====================================================================
// 共享样式 token
// =====================================================================

const SIZE_CONFIG = {
	sm: {
		input: "px-2.5 py-1 text-[12px]",
		text: "text-[12px]",
	},
	md: {
		input: "px-3.5 py-2 text-[13px]",
		text: "text-[13px]",
	},
	lg: {
		input: "px-4 py-2.5 text-[13.5px]",
		text: "text-[13.5px]",
	},
} as const;

type ControlSize = keyof typeof SIZE_CONFIG;

const baseControlClass = cn(
	"w-full rounded-xl border bg-surface text-text-primary",
	"placeholder:text-text-light",
	"transition-[border-color,box-shadow,background-color] duration-150",
	"focus:outline-none",
);

const restingClass = cn(
	"border-border/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
	"hover:border-cream-400 hover:bg-warm-50/60 hover:shadow-[0_2px_4px_rgba(0,0,0,0.04)]",
	"focus:border-primary/50 focus:bg-surface focus:ring-2 focus:ring-primary/10",
);

const errorClass = cn(
	"border-error/40",
	"hover:border-error/60",
	"focus:border-error focus:ring-2 focus:ring-error/15",
);

const disabledClass = "opacity-50 cursor-not-allowed";

function controlClass(opts: {
	size?: ControlSize;
	error?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	const { size = "md", error, disabled, className } = opts;
	return cn(
		baseControlClass,
		SIZE_CONFIG[size].input,
		error ? errorClass : restingClass,
		disabled && disabledClass,
		className,
	);
}

// =====================================================================
// SettingsTextInput
// =====================================================================

interface TextInputProps {
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	type?: "text" | "email" | "url" | "password";
	disabled?: boolean;
	error?: boolean;
	mono?: boolean;
	size?: ControlSize;
	autoComplete?: string;
	prefix?: ReactNode;
	suffix?: ReactNode;
	id?: string;
	name?: string;
	onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
	onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
	className?: string;
	"aria-label"?: string;
}

export const SettingsTextInput = forwardRef<HTMLInputElement, TextInputProps>(
	function SettingsTextInput(
		{
			value,
			onChange,
			placeholder,
			type = "text",
			disabled = false,
			error = false,
			mono = false,
			size = "md",
			autoComplete,
			prefix,
			suffix,
			id,
			name,
			onBlur,
			onKeyDown,
			className,
			"aria-label": ariaLabel,
		},
		ref,
	) {
		const hasAffix = !!prefix || !!suffix;
		if (!hasAffix) {
			return (
				<input
					ref={ref}
					type={type}
					id={id}
					name={name}
					value={value}
					placeholder={placeholder}
					disabled={disabled}
					autoComplete={autoComplete}
					aria-label={ariaLabel}
					onChange={(e) => onChange(e.target.value)}
					onBlur={onBlur}
					onKeyDown={onKeyDown}
					className={controlClass({
						size,
						error,
						disabled,
						className: cn(mono && "font-mono", className),
					})}
				/>
			);
		}
		// 带 prefix/suffix 时用 wrapper 把 ring 应用到容器，input 自身去掉边框
		return (
			<div
				className={cn(
					"flex items-center gap-2 rounded-xl border bg-surface transition-[border-color,box-shadow] duration-150",
					"focus-within:outline-none",
					error
						? "border-error/40 focus-within:border-error focus-within:ring-2 focus-within:ring-error/15"
						: cn(
								"border-border/80 hover:border-cream-400",
								"focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10",
							),
					disabled && disabledClass,
					SIZE_CONFIG[size].input,
					"py-0",
					className,
				)}
			>
				{prefix && (
					<span
						className={cn(
							"flex items-center text-text-muted",
							SIZE_CONFIG[size].text,
						)}
					>
						{prefix}
					</span>
				)}
				<input
					ref={ref}
					type={type}
					id={id}
					name={name}
					value={value}
					placeholder={placeholder}
					disabled={disabled}
					autoComplete={autoComplete}
					aria-label={ariaLabel}
					onChange={(e) => onChange(e.target.value)}
					onBlur={onBlur}
					onKeyDown={onKeyDown}
					className={cn(
						"flex-1 bg-transparent py-2 text-text-primary outline-none placeholder:text-text-light",
						SIZE_CONFIG[size].text,
						mono && "font-mono",
					)}
				/>
				{suffix && (
					<span
						className={cn(
							"flex items-center text-text-muted",
							SIZE_CONFIG[size].text,
						)}
					>
						{suffix}
					</span>
				)}
			</div>
		);
	},
);

// =====================================================================
// SettingsPasswordInput
// =====================================================================

interface PasswordInputProps
	extends Omit<TextInputProps, "type" | "suffix" | "prefix"> {
	revealable?: boolean;
}

export function SettingsPasswordInput({
	revealable = true,
	...rest
}: PasswordInputProps) {
	const [reveal, setReveal] = useState(false);
	if (!revealable) {
		return <SettingsTextInput {...rest} type="password" />;
	}
	return (
		<SettingsTextInput
			{...rest}
			type={reveal ? "text" : "password"}
			autoComplete={rest.autoComplete ?? "off"}
			suffix={
				<button
					type="button"
					tabIndex={-1}
					onClick={() => setReveal((v) => !v)}
					className="-mr-1 flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-cream-200 hover:text-text-primary"
					title={reveal ? "隐藏" : "显示"}
				>
					{reveal ? (
						<EyeOff className="h-3.5 w-3.5" strokeWidth={1.6} />
					) : (
						<Eye className="h-3.5 w-3.5" strokeWidth={1.6} />
					)}
				</button>
			}
		/>
	);
}

// =====================================================================
// SettingsTextArea
// =====================================================================

interface TextAreaProps
	extends Omit<
		TextareaHTMLAttributes<HTMLTextAreaElement>,
		"size" | "onChange"
	> {
	value: string;
	onChange: (next: string) => void;
	error?: boolean;
	mono?: boolean;
	resize?: "none" | "y" | "both";
	minHeight?: number;
	autoResize?: boolean;
}

export const SettingsTextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
	function SettingsTextArea(
		{
			value,
			onChange,
			error,
			mono,
			resize = "y",
			minHeight = 88,
			autoResize = false,
			disabled,
			className,
			rows = 3,
			...rest
		},
		ref,
	) {
		const innerRef = useRef<HTMLTextAreaElement | null>(null);
		const setRefs = (el: HTMLTextAreaElement | null) => {
			innerRef.current = el;
			if (typeof ref === "function") ref(el);
			else if (ref)
				(ref as React.MutableRefObject<HTMLTextAreaElement | null>).current =
					el;
		};
		useEffect(() => {
			if (!autoResize) return;
			const el = innerRef.current;
			if (!el) return;
			el.style.height = "auto";
			el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
		}, [autoResize, minHeight, value]);

		return (
			<textarea
				ref={setRefs}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				rows={rows}
				className={controlClass({
					error,
					disabled: !!disabled,
					className: cn(
						"py-2.5 leading-relaxed",
						mono && "font-mono text-[12.5px]",
						resize === "none" && "resize-none",
						resize === "y" && "resize-y",
						resize === "both" && "resize",
						className,
					),
				})}
				style={{ minHeight }}
				{...rest}
			/>
		);
	},
);

// =====================================================================
// SettingsNumberInput
// =====================================================================

interface NumberInputProps {
	value: number;
	onChange: (next: number) => void;
	min?: number;
	max?: number;
	step?: number;
	suffix?: ReactNode;
	disabled?: boolean;
	error?: boolean;
	size?: ControlSize;
	allowEmpty?: boolean;
	emptyValue?: number | null;
	emptyText?: string;
	width?: string;
	id?: string;
	className?: string;
	"aria-label"?: string;
}

/**
 * 数值输入：内嵌上下步进按钮 + 单位 suffix。
 * 失焦时按 min/max clamp，键盘上下箭头 ±step。
 *
 * width 控制 wrapper 宽度，默认 144px；suffix 会单独占位。
 */
export function SettingsNumberInput({
	value,
	onChange,
	min,
	max,
	step = 1,
	suffix,
	disabled,
	error,
	size = "md",
	width,
	id,
	className,
	"aria-label": ariaLabel,
}: NumberInputProps) {
	const [draft, setDraft] = useState(String(value));
	useEffect(() => {
		setDraft(String(value));
	}, [value]);

	const clamp = (n: number) => {
		let v = n;
		if (typeof min === "number") v = Math.max(min, v);
		if (typeof max === "number") v = Math.min(max, v);
		return v;
	};

	const commit = () => {
		if (draft.trim() === "") {
			setDraft(String(value));
			return;
		}
		const num = Number(draft);
		if (!Number.isFinite(num)) {
			setDraft(String(value));
			return;
		}
		const next = clamp(num);
		setDraft(String(next));
		if (next !== value) onChange(next);
	};

	const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			event.currentTarget.blur();
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			const next = clamp((Number(draft) || 0) + step);
			setDraft(String(next));
			onChange(next);
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			const next = clamp((Number(draft) || 0) - step);
			setDraft(String(next));
			onChange(next);
		}
	};

	const handleStep = (delta: number) => {
		const next = clamp((Number(draft) || 0) + delta * step);
		setDraft(String(next));
		onChange(next);
	};

	const sizeCls = SIZE_CONFIG[size];
	const stepDisabled =
		(typeof max === "number" && value >= max) ||
		(typeof min === "number" && value <= min);
	const upDisabled = typeof max === "number" && value >= max;
	const downDisabled = typeof min === "number" && value <= min;

	return (
		<div
			className={cn(
				"flex items-stretch rounded-xl border bg-surface transition-[border-color,box-shadow] duration-150",
				"focus-within:outline-none",
				error
					? "border-error/40 focus-within:border-error focus-within:ring-2 focus-within:ring-error/15"
					: cn(
							"border-border/80 hover:border-cream-400",
							"focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10",
						),
				disabled && disabledClass,
				className,
			)}
			style={{ width: width ?? undefined }}
		>
			<input
				id={id}
				type="text"
				inputMode="numeric"
				value={draft}
				disabled={disabled}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={handleKey}
				aria-label={ariaLabel}
				className={cn(
					"min-w-0 flex-1 bg-transparent text-right tabular-nums text-text-primary outline-none placeholder:text-text-light",
					sizeCls.input,
					"px-3 py-0",
				)}
			/>
			{suffix && (
				<span
					className={cn(
						"pointer-events-none flex shrink-0 items-center pr-2 text-text-muted",
						sizeCls.text,
					)}
				>
					{suffix}
				</span>
			)}
			{!stepDisabled && (
				<div className="flex shrink-0 flex-col border-l border-border/70">
					<button
						type="button"
						tabIndex={-1}
						disabled={disabled || upDisabled}
						onClick={() => handleStep(1)}
						className="flex h-1/2 w-6 items-center justify-center text-text-muted transition-colors hover:bg-cream-100 hover:text-text-primary disabled:opacity-30"
					>
						<ChevronUp className="h-3 w-3" strokeWidth={1.8} />
					</button>
					<button
						type="button"
						tabIndex={-1}
						disabled={disabled || downDisabled}
						onClick={() => handleStep(-1)}
						className="flex h-1/2 w-6 items-center justify-center border-t border-border/70 text-text-muted transition-colors hover:bg-cream-100 hover:text-text-primary disabled:opacity-30"
					>
						<ChevronDown className="h-3 w-3" strokeWidth={1.8} />
					</button>
				</div>
			)}
		</div>
	);
}

// =====================================================================
// SettingsCheckbox
// =====================================================================

interface CheckboxProps {
	checked: boolean;
	onChange: (next: boolean) => void;
	label: ReactNode;
	hint?: ReactNode;
	disabled?: boolean;
	className?: string;
}

export function SettingsCheckbox({
	checked,
	onChange,
	label,
	hint,
	disabled,
	className,
}: CheckboxProps) {
	const id = useId();
	return (
		<label
			htmlFor={id}
			className={cn(
				"group inline-flex cursor-pointer items-start gap-2.5",
				disabled && "cursor-not-allowed opacity-50",
				className,
			)}
		>
			<button
				id={id}
				type="button"
				role="checkbox"
				aria-checked={checked}
				disabled={disabled}
				onClick={() => !disabled && onChange(!checked)}
				className={cn(
					"mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-all duration-150",
					checked
						? "border-primary bg-primary text-primary-foreground shadow-bai-card"
						: "border-cream-500 bg-surface group-hover:border-primary/40",
					disabled && "cursor-not-allowed",
				)}
			>
				{checked && (
					<svg
						viewBox="0 0 12 12"
						className="h-3 w-3"
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M2.5 6.5L4.8 8.8L9.5 3.8" />
					</svg>
				)}
			</button>
			<span className="min-w-0">
				<span className="block text-[12.5px] font-medium leading-snug text-text-primary">
					{label}
				</span>
				{hint && (
					<span className="mt-0.5 block text-[11px] leading-relaxed text-text-muted">
						{hint}
					</span>
				)}
			</span>
		</label>
	);
}
