import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export default function App() {
  const { theme, toggle } = useTheme();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <img
            src={theme === "dark" ? "/logo-dark.svg" : "/logo-light.svg"}
            alt="SheetSubmit"
            className="size-5"
          />
          <span className="text-sm font-semibold tracking-tight">SheetSubmit</span>
        </div>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">No files yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a Facebook file to get started.</p>
        </div>
      </main>
    </div>
  );
}
