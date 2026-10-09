export function ActionsEngine(summary: any, diagnostics: any, rootCause: any) {
  const good: string[] = [];
  const bad: string[] = [];

  if (summary.cac.variance > 0) {
    good.push("Increase budget by 20–40%");
    good.push("Duplicate winning creative");
    good.push("Expand high-performing audience set");
  }

  if (summary.trials.variance < 0 || summary.subs.variance < 0) {
    bad.push("Pause underperforming audience");
    bad.push("Replace weak thumbnail");
    bad.push("Rewrite Episode 1–3 hooks");
  }

  return { good, bad };
}
