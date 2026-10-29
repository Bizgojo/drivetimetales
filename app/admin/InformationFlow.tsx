export default function InformationFlow() {
  return <div>
    <p className="cc-muted">Interactive process reference: select a stage, then inspect what happens, its handoff package, AI models and tools, or usage definitions. Model assignments and balances in this guide are not live telemetry.</p>
    <iframe title="Information Flow and detailed process documentation" src="/api/admin/center/information-flow" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" style={{width:'100%',height:'min(900px,85vh)',minHeight:600,border:'1px solid #dce3e7',borderRadius:12}}/>
    <p><a href="/api/admin/center/information-flow" target="_blank" rel="noreferrer">Open the full-size process guide ↗</a></p>
  </div>
}
