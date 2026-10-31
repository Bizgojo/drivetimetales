// A downloaded copy never writes back. Text cells are escaped against Excel formula injection.
export function csvCell(value:unknown):string{if(value==null)return '';if(typeof value==='number')return Number.isFinite(value)?String(value):'';let s=String(value);if(/^[\s]*[=+@-]|^[\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
export function csvText(rows:unknown[][]){return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n'}
export function downloadCsv(name:string,rows:unknown[][]){const url=URL.createObjectURL(new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name.replace(/[^a-zA-Z0-9._-]/g,'-')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
