export function RootCauseEngine(summary: any, diagnostics: any) {
  const all = [
    ...diagnostics.creative,
    ...diagnostics.audience,
    ...diagnostics.funnel,
    ...diagnostics.story,
    ...diagnostics.external
  ];
  return {
    primary: all[0] || "No dominant variance factor",
    secondary: all[1] || "No secondary factor",
    tertiary: all[2] || "No tertiary factor"
  };
}
