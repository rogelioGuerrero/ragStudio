import React, { useEffect, useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ZAxis } from 'recharts';
import { Network, Search } from 'lucide-react';
import { UMAP } from 'umap-js';

export default function VisualizerModule() {
  const { exportData } = useAppContext();
  const [data2D, setData2D] = useState<any[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredData = useMemo(() => {
    if (!searchTerm) return data2D;
    return data2D.filter(d => 
      d.source_file.toLowerCase().includes(searchTerm.toLowerCase()) || 
      d.preview.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data2D, searchTerm]);

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
            <div>
              <h3 className="text-sm font-bold text-slate-700">Espacio Vectorial (UMAP 2D)</h3>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
                Visualizando {exportData.data.length} dimensiones reducidas a 2D
              </p>
            </div>
            
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

          <div className="flex-1 w-full bg-slate-50/50 rounded-xl border border-slate-100 overflow-hidden relative">
             {isComputing ? (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                 <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                 <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Computando UMAP...</p>
                 <p className="text-[10px] text-slate-400 mt-1">Reduciendo dimensiones de los vectores.</p>
               </div>
             ) : (
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
                         if (entry.type === 'image') fill = '#10b981';
                         if (entry.type === 'audio') fill = '#f59e0b';
                         
                         return <Cell key={`cell-${index}`} fill={fill} fillOpacity={0.7} stroke={fill} strokeWidth={1} />;
                       })
                     }
                   </Scatter>
                 </ScatterChart>
               </ResponsiveContainer>
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
