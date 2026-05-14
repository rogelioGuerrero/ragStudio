/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Settings, Database, PieChart, MessageSquare, Globe } from 'lucide-react';
import IngestionModule from './components/modules/IngestionModule';
import ExportModule from './components/modules/ExportModule';
import MetricsModule from './components/modules/MetricsModule';
import PlaygroundModule from './components/modules/PlaygroundModule';
import VisualizerModule from './components/modules/VisualizerModule';
import { useAppContext } from './context/AppContext';

export default function App() {
  const [activeTab, setActiveTab] = useState('ingest');
  const { logs } = useAppContext();

  const labels = {
    'ingest': 'Ingestión de Datos',
    'export': 'Exportar a JSON',
    'metrics': 'Panel de Métricas de Calidad',
    'playground': 'Playground Chat',
    'visualizer': 'Espacio de Vectores (UMAP)'
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC] font-sans text-slate-900">
      {/* Sidebar Navigation */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-800">RAG.Studio</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <TabButton 
            id="ingest" 
            label="Ingestión" 
            icon={<Settings className="w-5 h-5" />} 
            activeId={activeTab} 
            onClick={setActiveTab} 
          />
          <TabButton 
            id="export" 
            label="Exportar JSON" 
            icon={<Database className="w-5 h-5" />} 
            activeId={activeTab} 
            onClick={setActiveTab} 
          />
          <TabButton 
            id="metrics" 
            label="Analytics" 
            icon={<PieChart className="w-5 h-5" />} 
            activeId={activeTab} 
            onClick={setActiveTab} 
          />
          <TabButton 
            id="playground" 
            label="Playground Chat" 
            icon={<MessageSquare className="w-5 h-5" />} 
            activeId={activeTab} 
            onClick={setActiveTab} 
          />
          <TabButton 
            id="visualizer" 
            label="Espacio de Vectores" 
            icon={<Globe className="w-5 h-5" />} 
            activeId={activeTab} 
            onClick={setActiveTab} 
          />
        </nav>
        
        <div className="p-4 border-t border-slate-100 flex-shrink-0 flex flex-col h-48">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">System Logs</span>
            <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-50 border border-slate-100 rounded p-2 text-[10px] font-mono text-slate-500">
            {logs.length === 0 ? (
              <span>Esperando eventos...</span>
            ) : (
              logs.map((L, i) => <div key={i} className="mb-1 leading-snug">{L}</div>)
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0">
          <h1 className="text-lg font-semibold text-slate-800">Módulo: {labels[activeTab as keyof typeof labels]}</h1>
          <div className="flex items-center gap-3">
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-bold uppercase tracking-wider border border-emerald-100 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              Motor Activo
            </span>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto h-full">
            {activeTab === 'ingest' && <IngestionModule />}
            {activeTab === 'export' && <ExportModule />}
            {activeTab === 'metrics' && <MetricsModule />}
            {activeTab === 'visualizer' && <VisualizerModule />}
            {activeTab === 'playground' && <PlaygroundModule />}
          </div>
        </div>

        {/* Status Bar */}
        <footer className="h-8 bg-slate-100 border-t border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-slate-500">Ready</span>
          </div>
          <div className="text-[10px] text-slate-500 font-medium tracking-wider">
            Gemini Flash / In-memory DB
          </div>
        </footer>
      </main>
    </div>
  );
}

function TabButton({ id, label, icon, activeId, onClick }: { id: string, label: string, icon: React.ReactNode, activeId: string, onClick: (id: string) => void }) {
  const active = activeId === id;
  return (
    <div
      onClick={() => onClick(id)}
      className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
        active 
          ? 'bg-blue-50 text-blue-700 font-semibold' 
          : 'text-slate-500 hover:bg-slate-50 font-medium'
      }`}
    >
      {icon}
      <span className="text-sm">{label}</span>
    </div>
  );
}

