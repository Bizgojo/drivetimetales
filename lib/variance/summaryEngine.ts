export function SummaryEngine(forecast: any, actual: any) {
  const delta = (f: number, a: number) => ((a - f) / f) * 100;

  return {
    trials: { forecast: forecast.trials, actual: actual.trials, variance: delta(forecast.trials, actual.trials) },
    subs:   { forecast: forecast.subs,   actual: actual.subs,   variance: delta(forecast.subs,   actual.subs) },
    cac:    { forecast: forecast.cac,    actual: actual.cac,    variance: delta(forecast.cac,    actual.cac) }
  };
}
