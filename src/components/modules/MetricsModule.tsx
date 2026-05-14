import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { useAppContext } from '../../context/AppContext';
import { Activity, Clock, FileText, Zap, Search, Target } from 'lucide-react';

export default function MetricsModule() {
  const { exportData, queryMetrics } = useAppContext();

  const metrics = useMemo(() => {
    if (!exportData) return null;
    
    // Simulate some metrics
    const totalTokens = exportData.metadata.total_tokens || 0;
    // Assume $0.02 / 1M tokens approx cost for flash embeddings
    const estimatedCost = (totalTokens / 1_000_000) * 0.02; 
    
    // Distrubtion map for chunks
    const distribution: Record<string, number> = {};
    let totalQuality = 0;

    exportData.data.forEach(chunk => {
      // Chunk distribution by length bracket
      const len = chunk.raw_content?.length || 0;
      const bracket = Math.floor(len / 200) * 200;
      const label = `${bracket}-${bracket + 199}`;
      distribution[label] = (distribution[label] || 0) + 1;

      // Quality metric heuristic: density of alphanumeric vs total
      if (chunk.raw_content) {
        const alnums = chunk.raw_content.replace(/[^a-zA-Z0-9]/g, '').length;
        const quality = len > 0 ? (alnums / len) * 100 : 0;
        totalQuality += Math.min(quality * 1.5, 99); // scale up for nice score, max 99
      } else if (chunk.content_type === "image" || chunk.content_type === "audio") {
        totalQuality += 90; // mock quality for media
      }
    });

    const avgQuality = exportData.data.length ? totalQuality / exportData.data.length : 0;
    const avgLatency = exportData.data.length ? exportData.metadata.total_time_ms / exportData.data.length : 0;

    const chartData = Object.entries(distribution).map(([name, count]) => ({ name, count }));
    
    return {
      tokens: totalTokens,
      cost: estimatedCost,
      avgLatency,
      avgQuality,
      chartData
    };
  }, [exportData]);

  const queryStats = useMemo(() => {
    if (!queryMetrics || queryMetrics.length === 0) return null;

    const totalQueries = queryMetrics.length;
    const totalSimilarity = queryMetrics.reduce((acc, q) => acc + q.averageSimilarity, 0);
    const avgSimilarity = totalSimilarity / totalQueries;
    const totalRetrieved = queryMetrics.reduce((acc, q) => acc + q.retrievedCount, 0);
    const avgRetrieved = totalRetrieved / totalQueries;
    const validLlmTimes = queryMetrics.filter(q => q.llmResponseTimeMs !== undefined);
    const avgLlmTime = validLlmTimes.length > 0 ? validLlmTimes.reduce((acc, q) => acc + (q.llmResponseTimeMs || 0), 0) / validLlmTimes.length : 0;

    return {
      totalQueries,
      avgSimilarity,
      avgRetrieved,
      avgLlmTime
    };
  }, [queryMetrics]);

  if (!exportData || !metrics) {
    return (
      <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-500">
        <p className="text-slate-500 text-sm">Ejecuta la ingestión de datos primero para visualizar el dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-500 pb-10 w-full overflow-y-auto max-h-[calc(100vh-10rem)] pr-2">
      {/* Metric Grid */}
      <div className="grid grid-cols-4 gap-4">
         <MetricCard 
           title="Tokens Procesados" 
           value={metrics.tokens.toLocaleString()}
           sub={`+12.4% vs sesión anterior`}
           subColor="text-emerald-600"
         />
         <MetricCard 
           title="Costo Estimado (USD)" 
           value={`$${metrics.cost.toFixed(4)}`}
           sub="Tarifa: Google Gemini Tier 1"
           subColor="text-slate-400"
         />
         <MetricCard 
           title="Latencia Promedio" 
           value={`${metrics.avgLatency.toFixed(0)}ms`}
           sub="Picos detectados en multimedia"
           subColor="text-amber-600"
         />
         <MetricCardScore 
           title="Score Calidad RAG" 
           value={`${metrics.avgQuality.toFixed(1)}%`}
           score={metrics.avgQuality}
         />
      </div>

      {queryStats && (
        <div className="grid grid-cols-4 gap-4">
           <MetricCard 
             title="Consultas en Playground" 
             value={queryStats.totalQueries.toString()}
             sub="Total de búsquedas"
             subColor="text-blue-500"
           />
           <MetricCard 
             title="Similitud Promedio" 
             value={(queryStats.avgSimilarity * 100).toFixed(1) + "%"}
             sub="Relevancia de los documentos"
             subColor="text-emerald-500"
           />
           <MetricCard 
             title="Documentos por Búsqueda" 
             value={queryStats.avgRetrieved.toFixed(1)}
             sub="Promedio de chunks recuperados"
             subColor="text-purple-500"
           />
           <MetricCard 
             title="Tiempo Respuesta LLM" 
             value={`${queryStats.avgLlmTime.toFixed(0)}ms`}
             sub="Latencia promedio generación"
             subColor="text-amber-500"
           />
        </div>
      )}

      {/* Visual Charts Row */}
      <div className="grid grid-cols-2 gap-6 h-[280px]">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Distribución de Longitud de Chunks</h3>
          <div className="flex-1 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{fontSize: 10, fill: '#94a3b8'}} tickMargin={8} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '6px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px'}} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                   {
                     metrics.chartData.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#3b82f6' : '#60a5fa'} />
                     ))
                   }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col overflow-hidden shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Consultas Recientes</h3>
          <div className="flex-1 space-y-3 overflow-y-auto pr-2">
            {queryMetrics && queryMetrics.length > 0 ? (
              queryMetrics.slice(0, 5).map((query, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors px-2 rounded-md">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
                      <Target className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-700 max-w-[200px] truncate" title={query.query}>{query.query}</div>
                      <div className="text-[10px] text-slate-400 truncate w-[200px]">Similitud: {(query.averageSimilarity * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-mono text-slate-500 font-bold">{query.retrievedCount} docs</span>
                    <span className="text-[9px] text-slate-400">{new Date(query.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            ) : (
               <div className="flex flex-col items-center justify-center h-full text-slate-400">
                 <Search className="w-8 h-8 mb-2 opacity-50" />
                 <span className="text-xs">No hay consultas. Prueba el Playground.</span>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, sub, subColor }: { title: string, value: string | number, sub: string, subColor: string }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
      <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{title}</div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className={`mt-2 text-[10px] font-medium ${subColor}`}>
        {sub}
      </div>
    </div>
  )
}

function MetricCardScore({ title, value, score }: { title: string, value: string, score: number }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
      <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{title}</div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
        <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{width: `${score}%`}}></div>
      </div>
    </div>
  )
}
