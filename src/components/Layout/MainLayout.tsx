import { useLogWatchController } from "../../hooks/useLogWatch";
import { Sidebar } from "./Sidebar";

interface Props {
  children: React.ReactNode;
}

export function MainLayout({ children }: Props) {
  useLogWatchController();

  return (
    <div className="flex h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)] overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {children}
      </main>
    </div>
  );
}
