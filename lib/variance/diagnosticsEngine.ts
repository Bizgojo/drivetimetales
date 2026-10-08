export function DiagnosticsEngine({ creative, audience, funnel, story, external }: any) {
  const fmt = (x: any) => ${x.finding} (${x.delta}%);
  return {
    creative: creative.map(fmt),
    audience: audience.map(fmt),
    funnel:   funnel.map(fmt),
    story:    story.map(fmt),
    external: external.map(fmt)
  };
}
