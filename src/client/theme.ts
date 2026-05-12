export type ThemePreference = "light" | "dark";

export function resolveInitialTheme(savedTheme: string | null | undefined, systemPrefersDark: boolean): ThemePreference {
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return systemPrefersDark ? "dark" : "light";
}

export function nextTheme(current: ThemePreference): ThemePreference {
  return current === "dark" ? "light" : "dark";
}
