import { Box, Circle, Coins, Crown, Diamond, Gem, Package, Sparkles, Watch, type LucideIcon } from "lucide-react";

/** Icons a tenant can pick for a category, keyed by CategoryDefinition.icon. */
export const CATEGORY_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  diamond: { icon: Diamond, label: "Diamond" },
  gem: { icon: Gem, label: "Gem" },
  watch: { icon: Watch, label: "Watch" },
  coins: { icon: Coins, label: "Coins" },
  crown: { icon: Crown, label: "Crown" },
  circle: { icon: Circle, label: "Ring / pearl" },
  sparkles: { icon: Sparkles, label: "Sparkles" },
  box: { icon: Box, label: "Box" },
  package: { icon: Package, label: "Package" },
};

export function categoryIcon(name: string | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]?.icon) || Package;
}
