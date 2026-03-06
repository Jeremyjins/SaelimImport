import { cn } from "~/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
}

export function PageContainer({
  children,
  className,
  fullWidth = false,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-4 md:gap-6 md:p-6",
        !fullWidth && "max-w-7xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
}
