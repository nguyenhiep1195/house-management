"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { resolveMode } from "@/lib/theme";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Chuyển chế độ sáng/tối"
      onClick={() =>
        setTheme({ mode: resolveMode(theme.mode) === "dark" ? "light" : "dark" })
      }
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
