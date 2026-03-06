import { Link } from "react-router";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { ChevronLeft } from "~/components/ui/icons";

interface HeaderProps {
  title?: string;
  backTo?: string;
  children?: React.ReactNode;
}

export function Header({ title, backTo, children }: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {backTo && (
        <Link
          to={backTo}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 mr-1"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">뒤로</span>
        </Link>
      )}
      {title && (
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </header>
  );
}
