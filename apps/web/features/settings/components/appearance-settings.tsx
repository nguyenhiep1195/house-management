"use client";

import { Check, Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { toast } from "sonner";

import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  THEME_ACCENTS,
  THEME_FONT_SIZES,
  THEME_MODES,
  type ThemeMode,
} from "@/lib/theme";

const MODE_ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function AppearanceSettings() {
  const { theme, setTheme, resetTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Giao diện</CardTitle>
        <CardDescription>
          Tuỳ chỉnh chế độ hiển thị, màu sắc và cỡ chữ. Thiết lập được lưu trên
          trình duyệt và tự động áp dụng ở lần truy cập sau.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8">
        <section className="grid gap-3">
          <Label>Chế độ hiển thị</Label>
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {THEME_MODES.map((mode) => {
              const Icon = MODE_ICONS[mode.value];
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setTheme({ mode: mode.value })}
                  aria-pressed={theme.mode === mode.value}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-accent",
                    theme.mode === mode.value
                      ? "border-primary bg-accent"
                      : "border-border",
                  )}
                >
                  <Icon className="size-5" />
                  {mode.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3">
          <Label>Màu chủ đạo</Label>
          <div className="flex flex-wrap gap-3">
            {THEME_ACCENTS.map((accent) => (
              <button
                key={accent.value}
                type="button"
                onClick={() => setTheme({ accent: accent.value })}
                aria-pressed={theme.accent === accent.value}
                title={accent.label}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-105",
                  theme.accent === accent.value
                    ? "border-foreground"
                    : "border-transparent",
                )}
                style={{ backgroundColor: accent.swatch }}
              >
                {theme.accent === accent.value && (
                  <Check className="size-4 text-white" />
                )}
                <span className="sr-only">{accent.label}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Đang chọn:{" "}
            {THEME_ACCENTS.find((a) => a.value === theme.accent)?.label}
          </p>
        </section>

        <section className="grid gap-3">
          <Label>Cỡ chữ</Label>
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {THEME_FONT_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                onClick={() => setTheme({ fontSize: size.value })}
                aria-pressed={theme.fontSize === size.value}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors hover:bg-accent",
                  theme.fontSize === size.value
                    ? "border-primary bg-accent"
                    : "border-border",
                )}
              >
                <span
                  className="font-semibold"
                  style={{ fontSize: `${size.px}px` }}
                >
                  Aa
                </span>
                <span className="text-sm">{size.label}</span>
              </button>
            ))}
          </div>
        </section>

        <div>
          <Button
            variant="outline"
            onClick={() => {
              resetTheme();
              toast.success("Đã khôi phục giao diện mặc định");
            }}
          >
            <RotateCcw className="size-4" />
            Khôi phục mặc định
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
