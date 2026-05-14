import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ZAxis } from 'recharts';
import { Network, Search, Share2, Info } from 'lucide-react';
import { UMAP } from 'umap-js';
import * as d3 from 'd3';

export default function VisualizerModule() {
  const { exportData, queryMetrics } = useAppContext();
  const [data2D, setData2D] = useState<any[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'umap' | 'graph'>('umap');
  const d3Container = useRef<SVGSVGElement | null>(null);

  const lastRetrievedIds = useMemo(() => {
    return queryMetrics[0]?.retrievedIds || [];
  }, [queryMetrics]);

  useEffect(() => {
    if (!exportData || exportData.data.length < 3) return;
    
    // We compute this asynchronously to avoid blocking the UI too much, 
    // although umap.fit is synchronous, we can run it in a setTimeout.
    setIsComputing(true);
    
    const computeUMAP = async () => {
      // Small delay to let React render the loading state
      await new Promise(r => setTimeout(r, 100));
      
      try {
        const embeddings = exportData.data.map(d => d.embedding);
        const umap = new UMAP({
          nNeighbors: Math.min(15, Math.max(2, embeddings.length - 1)),
          minDist: 0.1,
          nComponents: 2,
        });
        
        const embedding2D = umap.fit(embeddings);
        
        const chartData = exportData.data.map((chunk, i) => ({
          x: embedding2D[i][0],
          y: embedding2D[i][1],
          id: chunk.id,
          source_file: chunk.source_file,
          type: chunk.content_type,
          preview: chunk.raw_content_preview || '(media)',
        }));
        
        setData2D(chartData);
      } catch (err) {
        console.error("UMAP computation failed:", err);
      } finally {
        setIsComputing(false);
      }
    };
    
    computeUMAP();
  }, [exportData]);

  useEffect(() => {
    if (viewMode !== 'graph' || !exportData || !d3Container.current) return;

    const width = d3Container.current.clientWidth || 800;
    const height = d3Container.current.clientHeight || 500;

    d3.select(d3Container.current).selectAll("*").remove();

    const svg = d3.select(d3Container.current)
      .attr("viewBox", [0, 0, width, height]);

    const g = svg.append("g");

    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      }));

    const retrievedSet = new Set(lastRetrievedIds);
    const filteredNodes = exportData.data.filter(d => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return d.source_file.toLowerCase().includes(term) || 
             (d.raw_content_preview || '').toLowerCase().includes(term);
    });

    const nodes = filteredNodes.map(d => ({
      ...d,
      isRetrieved: retrievedSet.has(d.id),
      x: Math.random() * width,
      y: Math.random() * height
    })).sort((a, b) => (a.isRetrieved === b.isRetrieved ? 0 : a.isRetrieved ? 1 : -1)); // Nodos rojos arriba

    const edges: any[] = [];
    const threshold = 0.85;

    function cosineSimilarity(a: number[], b: number[]): number {
      let dot = 0; let magA = 0; let magB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
      }
      return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const sim = cosineSimilarity(nodes[i].embedding, nodes[j].embedding);
        if (sim > threshold) {
          edges.push({ source: nodes[i].id, target: nodes[j].id, value: sim });
        }
      }
    }

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(edges).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = g.append("g")
      .attr("stroke", "#e2e8f0")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke-width", d => (d.value - threshold) * 20);

    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(d3.drag<any, any>()
        .on("start", (event) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on("drag", (event) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on("end", (event) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        }) as any);

    node.append("circle")
      .attr("r", d => d.isRetrieved ? 10 : 6)
      .attr("fill", d => d.isRetrieved ? "#ef4444" : (d.content_type === 'image' ? '#10b981' : (d.content_type === 'audio' ? '#f59e0b' : '#3b82f6')))
      .attr("stroke", d => d.isRetrieved ? "#fecaca" : "white")
      .attr("stroke-width", d => d.isRetrieved ? 3 : 1.5)
      .attr("class", d => d.isRetrieved ? "retrieved-node" : "");

    node.append("title")
      .text(d => `${d.source_file}\n${d.raw_content_preview || ''}`);

    // Pulse animation for retrieved nodes
    g.selectAll(".retrieved-node")
      .append("animate")
      .attr("attributeName", "r")
      .attr("values", "10;13;10")
      .attr("dur", "2s")
      .attr("repeatCount", "indefinite");

    node.append("text")
      .attr("x", 10)
      .attr("y", "0.31em")
      .text(d => d.source_file.length > 15 ? d.source_file.substring(0, 12) + "..." : d.source_file)
      .attr("font-size", "7px")
      .attr("fill", "#94a3b8")
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
          .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [viewMode, exportData, lastRetrievedIds, searchTerm]);

  const filteredData = useMemo(() => {
    let base = data2D;
    if (searchTerm) {
      base = data2D.filter(d => 
        d.source_file.toLowerCase().includes(searchTerm.toLowerCase()) || 
        d.preview.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    // Sort so retrieved IDs are last (rendered on top)
    const retrievedSet = new Set(lastRetrievedIds);
    return [...base].sort((a, b) => {
      const aRet = retrievedSet.has(a.id);
      const bRet = retrievedSet.has(b.id);
      if (aRet === bRet) return 0;
      return aRet ? 1 : -1;
    });
  }, [data2D, searchTerm, lastRetrievedIds]);

  if (!exportData || exportData.data.length < 3) {
    return (
      <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-500 pb-10 w-full h-full flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center bg-white border border-slate-200 shadow-sm rounded-xl p-8">
           <Network className="w-12 h-12 text-slate-300 mx-auto mb-3" />
           <p className="text-slate-500 text-sm">No hay suficientes datos para visualizar.</p>
           <p className="text-xs text-slate-400 mt-1">Ingresa al menos 3 documentos/fragmentos en el módulo de Ingestión.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-500 pb-10 w-full h-full flex flex-col">
      <div className="bg-white border text-card-foreground shadow-sm rounded-xl p-6 border-slate-200 flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-700">
                  {viewMode === 'umap' ? 'Espacio Vectorial (UMAP 2D)' : 'Grafo de Relaciones Semánticas'}
                </h3>
                <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
                  {viewMode === 'umap' 
                    ? `Visualizando ${exportData.data.length} dimensiones reducidas a 2D` 
                    : `Mostrando conexiones por similitud (umbral > 0.85)`}
                </p>
              </div>
              
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setViewMode('umap')}
                  className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all ${viewMode === 'umap' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  MAPA
                </button>
                <button 
                  onClick={() => setViewMode('graph')}
                  className={`px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all ${viewMode === 'graph' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  GRAFO
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {lastRetrievedIds.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-600 rounded-md border border-red-100 animate-pulse">
                  <Share2 className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase">Última Consulta</span>
                </div>
              )}
              <div className="relative w-64">
                 <input 
                   type="text" 
                   placeholder="Buscar documento..." 
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="w-full bg-slate-50 border border-slate-200 rounded-md pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                 />
                 <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              </div>
            </div>
          </div>

          <div className="flex-1 w-full bg-slate-50/50 rounded-xl border border-slate-100 overflow-hidden relative">
             {isComputing ? (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                 <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                 <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Computando...</p>
               </div>
             ) : viewMode === 'umap' ? (
               <ResponsiveContainer width="100%" height="100%">
                 <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                   <XAxis type="number" dataKey="x" name="UMAP 1" tick={false} axisLine={false} tickLine={false} />
                   <YAxis type="number" dataKey="y" name="UMAP 2" tick={false} axisLine={false} tickLine={false} />
                   <ZAxis type="number" range={[40, 40]} />
                   <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                   <Scatter name="Chunks" data={filteredData}>
                     {
                       filteredData.map((entry, index) => {
                         let fill = '#3b82f6';
                         if (lastRetrievedIds.includes(entry.id)) fill = '#ef4444';
                         else if (entry.type === 'image') fill = '#10b981';
                         else if (entry.type === 'audio') fill = '#f59e0b';
                         
                         return <Cell key={`cell-${index}`} fill={fill} fillOpacity={0.7} stroke={fill} strokeWidth={lastRetrievedIds.includes(entry.id) ? 2 : 1} />;
                       })
                     }
                   </Scatter>
                 </ScatterChart>
               </ResponsiveContainer>
             ) : (
               <div className="w-full h-full relative cursor-grab active:cursor-grabbing">
                  <svg ref={d3Container} className="w-full h-full" />
                  <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg border border-slate-200 shadow-sm max-w-[200px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-[10px] font-bold text-slate-700 uppercase">Guía del Grafo</span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-tight">
                      Arrastra los nodos para explorar relaciones. Usa el scroll para hacer zoom. 
                      Los puntos <span className="text-red-500 font-bold">ROJOS</span> fueron los chunks usados en tu última pregunta.
                    </p>
                  </div>
               </div>
             )}
          </div>
          
          <div className="mt-4 flex items-center gap-4 justify-center">
             <div className="flex items-center gap-1.5">
               <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
               <span className="text-[10px] text-slate-500 uppercase font-semibold">Texto</span>
             </div>
             <div className="flex items-center gap-1.5">
               <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
               <span className="text-[10px] text-slate-500 uppercase font-semibold">Imágenes</span>
             </div>
             <div className="flex items-center gap-1.5">
               <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
               <span className="text-[10px] text-slate-500 uppercase font-semibold">Audio</span>
             </div>
             <div className="flex items-center gap-1.5">
               <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
               <span className="text-[10px] text-slate-500 uppercase font-semibold">Recuperados</span>
             </div>
          </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-lg max-w-[250px]">
        <div className="text-xs font-bold text-slate-700 mb-1 truncate">{data.source_file}</div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-100 pb-2">
          {data.type} CHUNK
        </div>
        <div className="text-[11px] text-slate-600 line-clamp-3 leading-relaxed">
          {data.preview}
        </div>
      </div>
    );
  }

  return null;
};
