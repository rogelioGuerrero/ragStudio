import React from 'react';
import { Download, Code } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

export default function ExportModule() {
  const { exportData } = useAppContext();

  const handleDownload = () => {
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rag-embeddings-v1-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-500 w-full h-full flex flex-col">
      {!exportData ? (
        <div className="text-center py-20 bg-slate-50 border border-dashed rounded-xl border-slate-300">
           <Code className="w-12 h-12 text-slate-300 mx-auto mb-3" />
           <p className="text-slate-500 text-sm">No data available yet.</p>
           <p className="text-xs text-slate-400">Go to Ingestion module and run the pipeline first.</p>
        </div>
      ) : (
        <div className="space-y-6 flex-1 flex flex-col">
          <div className="flex justify-between items-center bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div>
              <p className="text-sm font-bold text-slate-800">Total Chunks Generated: {exportData.metadata.total_chunks}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Model used: {exportData.metadata.model}</p>
            </div>
            <button 
              onClick={handleDownload}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-medium text-sm px-4 py-2 rounded-md flex items-center space-x-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Descargar JSON</span>
            </button>
          </div>

          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                <span className="text-[10px] text-slate-400 font-mono ml-4 uppercase tracking-widest">dataset-preview.json</span>
              </div>
              <button 
                onClick={() => navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))}
                className="text-[10px] text-slate-400 hover:text-white transition-colors uppercase font-bold tracking-wider"
              >
                Copiar
              </button>
            </div>
            <div className="flex-1 overflow-y-auto w-full">
              <pre className="text-[11px] font-mono text-blue-300 leading-relaxed whitespace-pre-wrap">
{JSON.stringify({
  metadata: exportData.metadata,
  data: [
    ...exportData.data.slice(0, 4).map(d => {
      const omittedObj: any = {
        ...d,
        embedding: d.embedding ? `[${(d.embedding[0] ?? 0).toFixed(4)}, ${(d.embedding[1] ?? 0).toFixed(4)}, ${(d.embedding[2] ?? 0).toFixed(4)}, ... ${d.embedding.length} dimensions omitted]` : '[]',
      };
      if (d.media_base64) omittedObj.media_base64 = `(base64 data omitted for preview)`;
      if (d.raw_content) omittedObj.raw_content = `(full content string omitted, showing preview only)`;
      return omittedObj;
    }),
    ...(exportData.data.length > 4 ? [{ _omitted_info_: `... ${exportData.data.length - 4} more chunk items omitted in this preview ...` }] : [])
  ]
}, null, 2).replace(/"(metadata)":/g, '<span class="text-emerald-400">"metadata"</span>:')
           .replace(/"(total_chunks)":/g, '<span class="text-emerald-400">"total_chunks"</span>:')
           .replace(/"(model)":/g, '<span class="text-emerald-400">"model"</span>:')
           .replace(/"(data)":/g, '<span class="text-emerald-400">"data"</span>:')
           .replace(/"(id)":/g, '<span class="text-emerald-400">"id"</span>:')
           .replace(/"(content_type)":/g, '<span class="text-emerald-400">"content_type"</span>:')
           .replace(/"(raw_content_preview)":/g, '<span class="text-emerald-400">"raw_content_preview"</span>:')
           .replace(/"(embedding)":/g, '<span class="text-emerald-400">"embedding"</span>:')}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
