import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Database, ChevronDown, ChevronRight, File as FileIcon } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { searchVectors, ChunkData } from '../../lib/ragCore';
import { GoogleGenAI } from '@google/genai';
import { withExponentialBackoff } from '../../lib/geminiApi';
import { generateLocalEmbedding } from '../../lib/localEmbedder';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChunkData[];
}

export default function PlaygroundModule() {
  const { apiKey, exportData, addLog, addQueryMetric } = useAppContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;
    if (!apiKey) {
      alert("Please provide the Gemini API key in the Ingestion tab first.");
      return;
    }
    if (!exportData || exportData.data.length === 0) {
      alert("No data available to query. Please upload and process documents first.");
      return;
    }

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    const queryStr = input;
    setInput('');
    setIsTyping(true);

    let ai;
    try {
      ai = new GoogleGenAI({ apiKey });
    } catch (e) {
      addLog("Failed to initialize Gen AI client.");
      setIsTyping(false);
      return;
    }

    try {
      // 1. Embed user query
      const startTime = Date.now();
      let queryEmbedding: number[] = [];
      const usedModel = exportData.metadata.model || 'gemini-embedding-2-preview';
      
      if (usedModel === 'gemini-embedding-2-preview') {
        const embedRes = await withExponentialBackoff(
          () => ai.models.embedContent({
            model: 'gemini-embedding-2-preview',
            contents: queryStr,
          }),
          4,
          addLog
        );
        queryEmbedding = embedRes.embeddings?.[0]?.values || [];
      } else {
        queryEmbedding = await generateLocalEmbedding(queryStr, usedModel);
      }

      if (!queryEmbedding || queryEmbedding.length === 0) throw new Error("Failed to generate embedding for query.");

      // 2. Map Cosine Similarity
      const topK = searchVectors(queryEmbedding, exportData.data, 3);
      
      const sourcesUsed = topK.map(t => t.chunk);
      const avgSimilarity = topK.length > 0 ? topK.reduce((acc, curr) => acc + curr.score, 0) / topK.length : 0;

      // 3. Construct GenAI prompt
      const contextText = topK.map(result => `Document: ${result.chunk.source_file}\nContent:\n${result.chunk.raw_content || result.chunk.raw_content_preview}`).join('\n\n---\n\n');
      
      const systemPrompt = `You are an intelligent RAG assistant. Answer the user's question based ONLY on the provided context below.
If the answer cannot be found in the context, state that you do not know.

### CONTEXT:
${contextText}
`;

      const llmStartTime = Date.now();
      const assistantId = (Date.now() + 1).toString();
      
      // Create an empty assistant message that we will fill via streaming
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: '',
        sources: sourcesUsed
      }]);
      setIsTyping(false);

      let responseText = "";
      try {
        const result = await withExponentialBackoff(
          () => ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [
              { role: 'user', parts: [{ text: systemPrompt + `\n\nUser Question: ${queryStr}` }] }
            ],
          }),
          4,
          addLog
        );

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          responseText += chunkText;
          setMessages(prev => prev.map(msg => 
            msg.id === assistantId ? { ...msg, content: responseText } : msg
          ));
        }
      } catch (streamErr: any) {
        addLog(`Streaming Error: ${streamErr.message}`);
        responseText += `\n\n[Error during streaming: ${streamErr.message}]`;
        setMessages(prev => prev.map(msg => 
          msg.id === assistantId ? { ...msg, content: responseText } : msg
        ));
      }

      const llmResponseTimeMs = Date.now() - llmStartTime;

      addQueryMetric({
        query: queryStr,
        timestamp: new Date().toISOString(),
        retrievedCount: topK.length,
        averageSimilarity: avgSimilarity,
        llmResponseTimeMs
      });

      const rtt = Date.now() - startTime;
      addLog(`RAG Pipeline finished in ${rtt}ms (Top K: ${topK.length} chunks used)`);

    } catch (err: any) {
      addLog(`RAG Error: ${err.message}`);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] w-full animate-in slide-in-from-left-4 fade-in duration-500">
      {!exportData ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white border border-slate-200 shadow-sm rounded-xl">
           <Database className="w-12 h-12 text-slate-300 mx-auto mb-3" />
           <p className="text-slate-500 text-sm">Wait, no vectors found.</p>
           <p className="text-xs text-slate-400">You must ingest data before chatting.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          {/* Chat Transcript */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                <Bot className="w-12 h-12 text-blue-200" />
                <p className="text-sm">Hello! Ask me anything about the {exportData.data.length} chunks of knowledge in my database.</p>
              </div>
            )}
            
            {messages.map((msg) => (
              <div key={msg.id} className={`flex max-w-[85%] ${msg.role === 'user' ? 'ml-auto justify-end' : 'mr-auto justify-start'}`}>
                
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                    <Bot className="w-5 h-5 text-blue-600" />
                  </div>
                )}
                
                <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-3 rounded-xl text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 w-full max-w-sm">
                      <SourceAccordion sources={msg.sources} />
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-md bg-slate-200 flex items-center justify-center ml-3 mt-1 flex-shrink-0">
                    <User className="w-5 h-5 text-slate-500" />
                  </div>
                )}

              </div>
            ))}
            
            {isTyping && (
              <div className="flex max-w-[85%] mr-auto justify-start">
                 <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                    <Bot className="w-5 h-5 text-blue-600" />
                 </div>
                 <div className="bg-white border border-slate-200 p-4 rounded-xl rounded-bl-none shadow-sm flex space-x-1 items-center h-12">
                   <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse"></div>
                   <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                   <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                 </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="p-4 bg-white border-t border-slate-200">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder="Ask a question about your documents..."
                className="w-full bg-slate-50 border border-slate-200 rounded-full pl-5 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-shadow"
                disabled={isTyping}
              />
              <button 
                onClick={handleSend}
                disabled={isTyping || !input.trim()}
                className="absolute right-2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4 ml-0.5 mb-0.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceAccordion({ sources }: { sources: ChunkData[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm mt-1">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center space-x-1.5"><Database className="w-3 h-3 text-blue-500"/> <span>{sources.length} Context Sources</span></span>
        {isOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
      </button>
      
      {isOpen && (
        <div className="p-2 border-t border-slate-200 space-y-2 max-h-48 overflow-y-auto bg-slate-50 flex flex-col gap-2">
          {sources.map((s, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded p-2 text-[11px] text-slate-600 shadow-sm">
               <div className="flex items-center space-x-1.5 mb-1 font-semibold text-blue-600">
                 <FileIcon className="w-3 h-3" />
                 <span className="truncate">{s.source_file}</span>
               </div>
               <p className="line-clamp-3 text-slate-500 leading-relaxed bg-slate-50 p-1.5 rounded border border-slate-100">{s.raw_content_preview}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
