import type { LucideIcon, LucideProps } from "lucide-react";

type DocseraIconProps = Omit<LucideProps, "ref"> & {
  icon: LucideIcon;
  label?: string;
};

export function DocseraIcon({
  absoluteStrokeWidth = false,
  className,
  icon: Icon,
  label,
  size = 16,
  strokeWidth = 2,
  ...props
}: DocseraIconProps) {
  const iconClassName = className ? `docsera-icon ${className}` : "docsera-icon";

  return (
    <Icon
      absoluteStrokeWidth={absoluteStrokeWidth}
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      className={iconClassName}
      focusable={label ? undefined : "false"}
      role={label ? "img" : undefined}
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
