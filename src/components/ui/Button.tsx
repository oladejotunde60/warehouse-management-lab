import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const base = "inline-flex items-center justify-center rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
const variants: Record<Variant, string> = {
  primary:   "bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500",
  secondary: "bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 focus:ring-slate-400",
  danger:    "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500",
  ghost:     "bg-transparent text-slate-700 hover:bg-slate-100",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
  )
);
Button.displayName = "Button";
