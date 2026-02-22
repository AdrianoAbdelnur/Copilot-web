import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-slate-900 text-white border-slate-900 hover:bg-slate-800",
  secondary: "bg-white text-slate-900 border-slate-300 hover:bg-slate-50",
  danger: "bg-rose-700 text-white border-rose-700 hover:bg-rose-600",
  ghost: "bg-transparent text-slate-700 border-transparent hover:bg-slate-100",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  leftIcon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...props}
    >
      {leftIcon ? <span className="opacity-90">{leftIcon}</span> : null}
      {children}
    </button>
  );
}
