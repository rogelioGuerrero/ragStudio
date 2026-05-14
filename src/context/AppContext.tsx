import React, { createContext, useContext, useState, ReactNode } from 'react';
import { RagExport } from '../lib/ragCore';

export interface QueryMetric {
  query: string;
  timestamp: string;
  retrievedCount: number;
  averageSimilarity: number;
  llmResponseTimeMs?: number;
  retrievedIds?: string[];
}

interface AppState {
  apiKey: string;
  setApiKey: (key: string) => void;
  exportData: RagExport | null;
  setExportData: (data: RagExport | null) => void;
  logs: string[];
  addLog: (log: string) => void;
  clearLogs: () => void;
  queryMetrics: QueryMetric[];
  addQueryMetric: (metric: QueryMetric) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [apiKey, setApiKey] = useState("");
  const [exportData, setExportData] = useState<RagExport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [queryMetrics, setQueryMetrics] = useState<QueryMetric[]>([]);

  const addLog = (log: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${log}`, ...prev]);
  };

  const addQueryMetric = (metric: QueryMetric) => {
    setQueryMetrics(prev => [metric, ...prev]);
  };

  const clearLogs = () => setLogs([]);

  return (
    <AppContext.Provider value={{ apiKey, setApiKey, exportData, setExportData, logs, addLog, clearLogs, queryMetrics, addQueryMetric }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};
