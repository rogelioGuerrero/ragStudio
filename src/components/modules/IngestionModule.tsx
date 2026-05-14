import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, CheckCircle, File as FileIcon, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { parseFile, chunkText } from '../../lib/fileParser';
import { ChunkData, RagMetadata } from '../../lib/ragCore';
import { GoogleGenAI } from '@google/genai';
import { withExponentialBackoff } from '../../lib/geminiApi';
import { generateLocalEmbedding } from '../../lib/localEmbedder';

export default function IngestionModule() {
  const { apiKey, setApiKey, setExportData, addLog } = useAppContext();
  const [files, setFiles] = useState<File[]>([]);
  const [chunkSize, setChunkSize] = useState(250);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [embeddingModel, setEmbeddingModel] = useState<string>('gemini-embedding-2-preview');
  const [modelLoadingInfo, setModelLoadingInfo] = useState<{file: string, progress: number, status: string} | null>(null);
  const cancelRef = useRef(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles]);
    addLog(`Added ${acceptedFiles.length} file(s) to queue`);
  }, [addLog]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    addLog("Lista de archivos limpia.");
  };

  const processFiles = async () => {
    if (embeddingModel === 'gemini-embedding-2-preview' && !apiKey) {
      alert("Please provide a Google AI Studio API Key para usar Gemini.");
      return;
    }
    if (files.length === 0) {
      alert("Please upload at least one file.");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    cancelRef.current = false;
    addLog(`Starting ingestion process for ${files.length} file(s)`);
    
    // Default model handling
    let ai: any;
    if (embeddingModel === 'gemini-embedding-2-preview') {
      try {
        ai = new GoogleGenAI({ apiKey });
      } catch (e) {
        addLog("Failed to initialize Google Gen AI client.");
        setIsProcessing(false);
        return;
      }
    }

    const chunksDataset: ChunkData[] = [];
    const startTime = Date.now();
    let tokensAccumulated = 0;

    for (let f = 0; f < files.length; f++) {
      if (cancelRef.current) {
        addLog("Proceso cancelado por el usuario.");
        break;
      }
      const file = files[f];
      try {
        addLog(`Parsing file: ${file.name}`);
        const parsed = await parseFile(file);
        
        if (parsed.type === "text" && parsed.content) {
          const textChunks = chunkText(parsed.content, chunkSize, chunkOverlap);
          
          for (let i = 0; i < textChunks.length; i++) {
            if (cancelRef.current) break;
            
            const chunkId = `${file.name}-chunk-${i}`;
            const textChunk = textChunks[i];
            
            try {
              let embedding: number[] = [];
              if (embeddingModel === 'gemini-embedding-2-preview') {
                const response = await withExponentialBackoff(
                  () => ai.models.embedContent({
                   model: 'gemini-embedding-2-preview', 
                   contents: [{ parts: [{ text: textChunk }] }],
                  }),
                  4,
                  addLog,
                  cancelRef
                );
                embedding = response.embedding?.values || response.embeddings?.[0]?.values || [];
              } else {
                embedding = await generateLocalEmbedding(textChunk, embeddingModel, (info: any) => {
                  if (info.status === 'initiate') {
                    setModelLoadingInfo({ file: info.file, progress: 0, status: 'Iniciando...' });
                  } else if (info.status === 'progress') {
                    setModelLoadingInfo({ file: info.file, progress: info.progress, status: 'Descargando' });
                  } else if (info.status === 'done') {
                    setModelLoadingInfo(null);
                  }
                });
              }
              
              if (embedding.length > 0) {
                 chunksDataset.push({
                   id: chunkId,
                   source_file: file.name,
                   content_type: "text",
                   raw_content: textChunk,
                   raw_content_preview: textChunk.substring(0, 80) + '...',
                   embedding,
                   tokens: Math.round(textChunk.length / 4) // naive fallback estimate
                 });
                 tokensAccumulated += Math.round(textChunk.length / 4);
              }
            } catch (embedError: any) {
              addLog(`Embedding failed for chunk in ${file.name}: ${embedError.message}`);
            }
          }
        } 
        else if (parsed.type === "image" || parsed.type === "audio") {
           try {
             let embedding: number[] = [];
             if (embeddingModel === 'gemini-embedding-2-preview') {
               const response = await withExponentialBackoff(
                 () => ai.models.embedContent({
                   model: 'gemini-embedding-2-preview',
                   contents: [{ parts: [{ text: `[${parsed.type.toUpperCase()} FILE] ${file.name}` }] }],
                 }),
                 4,
                 addLog,
                 cancelRef
               );
               embedding = response.embedding?.values || response.embeddings?.[0]?.values || [];
             } else {
               embedding = await generateLocalEmbedding(`[${parsed.type.toUpperCase()} FILE] ${file.name}`, embeddingModel);
             }
             
             chunksDataset.push({
               id: `${file.name}-media`,
               source_file: file.name,
               content_type: parsed.type,
               raw_content_preview: `Base64 media (${parsed.type})`,
               media_base64: parsed.base64,
               media_mime_type: parsed.mimeType,
               embedding: embedding,
               tokens: 50 // placeholder
             });
             tokensAccumulated += 50;
           } catch (e: any) {
             addLog(`Skipped embedding binary file ${file.name}: ${e.message}`);
           }
        }

        setProgress(Math.round(((f + 1) / files.length) * 100));

      } catch (err: any) {
        addLog(`File process error (${file.name}): ${err.message}`);
      }
    }

    if (cancelRef.current) {
      setIsProcessing(false);
      return;
    }

    const totalTime = Date.now() - startTime;
    
    const meta: RagMetadata = {
      total_chunks: chunksDataset.length,
      model: embeddingModel,
      timestamp: new Date().toISOString(),
      total_tokens: tokensAccumulated,
      total_time_ms: totalTime
    };

    setExportData({ metadata: meta, data: chunksDataset });
    addLog(`Finished. Processed ${chunksDataset.length} chunks in ${totalTime}ms.`);
    setIsProcessing(false);
  };

  const cancelProcess = () => {
    cancelRef.current = true;
    addLog("Cancelación solicitada...");
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-500">
      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* API Key Panel */}
        <div className="bg-white border rounded-xl p-5 border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Configuración API</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Google AI Studio API Key</label>
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..." 
                className="w-full flex h-9 rounded-md border border-slate-300 bg-transparent px-3 py-1.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              />
              <p className="text-[10px] text-slate-400">Se guarda localmente para esta sesión.</p>
            </div>

            <div className="pt-4 border-t border-slate-100">
               <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Modelo de Embedding</h4>
               <select 
                 value={embeddingModel}
                 onChange={(e) => setEmbeddingModel(e.target.value)}
                 className="w-full h-9 px-2 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/50 focus:outline-none mb-4"
               >
                 <option value="gemini-embedding-2-preview">Google: gemini-embedding-2-preview</option>
                 <option value="Xenova/all-MiniLM-L6-v2">Local: Xenova/all-MiniLM-L6-v2 (Rápido, ~22MB)</option>
                 <option value="onnx-community/embeddinggemma-300m-ONNX">Local: Gemma 300M ONNX (+Pesado, ~600MB)</option>
               </select>

               {modelLoadingInfo && (
                 <div className="mb-6 p-3 bg-blue-50 rounded-lg border border-blue-100 animate-in fade-in zoom-in duration-300">
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">{modelLoadingInfo.status}</span>
                       <span className="text-[10px] font-mono text-blue-400">{Math.round(modelLoadingInfo.progress)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-blue-600 transition-all duration-300 ease-out" 
                         style={{ width: `${modelLoadingInfo.progress}%` }}
                       />
                    </div>
                    <p className="text-[9px] text-blue-400 mt-2 truncate font-mono">Archivo: {modelLoadingInfo.file}</p>
                 </div>
               )}

               <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Estrategia de Fragmentación (Chunking)</h4>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs text-slate-600 block mb-1">Tamaño (palabras)</label>
                    <input type="number" value={chunkSize} onChange={(e)=>setChunkSize(Number(e.target.value))} className="w-full h-8 px-2 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/50 focus:outline-none" />
                 </div>
                 <div>
                    <label className="text-xs text-slate-600 block mb-1">Solapamiento</label>
                    <input type="number" value={chunkOverlap} onChange={(e)=>setChunkOverlap(Number(e.target.value))} className="w-full h-8 px-2 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/50 focus:outline-none" />
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Dropzone Panel */}
        <div className="bg-white border text-card-foreground shadow-sm rounded-xl p-5 border-slate-200 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-700">Carga de Documentos</h3>
            {files.length > 0 && !isProcessing && (
              <button 
                onClick={clearFiles}
                className="text-[10px] uppercase font-bold text-slate-400 hover:text-red-500 transition-colors"
                title="Limpiar cola"
              >
                Limpiar cola
              </button>
            )}
          </div>
          <div 
            {...getRootProps()} 
            className={`border border-dashed rounded-lg flex-1 flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
            }`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="w-8 h-8 text-blue-500 mb-2 opacity-80" />
            <p className="text-sm font-medium text-slate-700">Arrastra archivos o haz clic</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">TXT, MD, PDF, DOCX, IMG, AUDIO</p>
          </div>

          {files.length > 0 && (
            <div className="mt-4 max-h-[120px] overflow-y-auto space-y-1.5">
              {files.map((file, i) => (
                <div key={i} className="flex flex-row items-center justify-between px-3 py-2 rounded-md bg-slate-50 border border-slate-100">
                  <div className="flex items-center space-x-2 truncate">
                    <div className="h-6 w-6 bg-blue-100 text-blue-600 rounded flex items-center justify-center">
                      <FileIcon className="w-3 h-3" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-700 truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                  <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 ml-2">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Action Bar */}
      <div className="flex items-center space-x-4 bg-white border rounded-xl p-4 shadow-sm border-slate-200">
        <button 
          onClick={processFiles}
          disabled={isProcessing}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-6 py-2 rounded-md flex flex-row items-center transition-colors shadow-sm"
        >
          {isProcessing ? 'Procesando...' : 'Iniciar Extracción'} 
        </button>

        {isProcessing && (
           <button 
             onClick={cancelProcess}
             className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-sm font-medium px-4 py-2 rounded-md flex flex-row items-center transition-colors shadow-sm"
           >
             Cancelar
           </button>
        )}

        {isProcessing && (
           <div className="flex-1 flex flex-row items-center space-x-3">
             <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
               <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
             </div>
             <span className="text-[10px] font-bold text-slate-500">{progress}%</span>
           </div>
        )}
        {!isProcessing && progress === 100 && (
          <div className="flex flex-row items-center text-emerald-600 font-medium text-xs space-x-1.5">
            <CheckCircle className="w-4 h-4" /> <span>Completado exitosamente</span>
          </div>
        )}
      </div>

    </div>
  );
}
