import React, { useState, useEffect } from 'react';
import { Incident } from './types';
import { fetchRealTimeIncidents } from './services/xService';
import MinimalEventCard from './components/EventCard';
import ExpandedEventDetail from './components/EventDetail';
import ThreatGraph from './components/ThreatGraph';
import { Search, RefreshCw, AlertTriangle, Radio, Activity, Map } from 'lucide-react';

const App: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

  const loadData = async (query: string = "") => {
    setLoading(true);
    setError(null);
    setApiError(null);
    try {
      // If query is empty, search all Bay Area cities. Otherwise use custom query
      const effectiveQuery = query || "";
      const response = await fetchRealTimeIncidents(effectiveQuery);
      setIncidents(response.incidents);
      
      if (response.incidents.length > 0) {
        // If we found incidents, check if they are "Nearby" rather than "Local" to auto-switch to graph
        // For this demo, if the location isn't strictly 'Stanford', we assume it's nearby/knowledge graph material
        const hasDirectLocalThreat = response.incidents.some(i => 
          i.location.toLowerCase().includes('stanford') || 
          i.location.toLowerCase().includes('palo alto')
        );

        // If multiple incidents found, show map view. Otherwise show list.
        if (response.incidents.length > 1) {
           setViewMode('graph');
        } else if (hasDirectLocalThreat) {
           setViewMode('list');
           const critical = response.incidents.find(i => i.severity === 'critical');
           setSelectedIncident(critical || response.incidents[0]);
        } else {
          setViewMode('graph');
        }
      } else {
        setViewMode('graph'); // Empty state graph
        // Set a message if no incidents found (but not an error - API worked, just no results)
        setError("No incidents found. The API search completed successfully but no matching incidents were detected in the Bay Area.");
      }

    } catch (err: any) {
      const errorMessage = err.message || "Connection to X API failed. Verify API key configuration.";
      setError(errorMessage);
      setApiError(errorMessage);
      console.error("API Error Details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(searchQuery);
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden font-sans selection:bg-white selection:text-black">
      
      {/* Top Navigation Bar - Minimalist B&W */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-neutral-900 bg-black z-30">
        <div className="flex items-center gap-4">
           <div className={`w-8 h-8 ${loading ? 'bg-neutral-800' : 'bg-white'} text-black flex items-center justify-center rounded-sm transition-colors duration-500`}>
             <Radio size={20} strokeWidth={3} className={loading ? "animate-pulse text-white" : "text-black"} />
           </div>
           <div>
             <h1 className="text-lg font-bold tracking-tight leading-none">STANFORD<span className="text-neutral-500">.WATCH</span></h1>
             <p className="text-[9px] text-neutral-500 font-mono tracking-widest uppercase">Live Intelligence Wire</p>
           </div>
        </div>

        <div className="flex items-center gap-4">
           {/* View Toggle */}
           <div className="hidden md:flex bg-neutral-900 rounded-sm p-0.5 border border-neutral-800">
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-sm transition-all ${viewMode === 'list' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}`}
                title="List View"
              >
                <Activity className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('graph')}
                className={`p-1.5 rounded-sm transition-all ${viewMode === 'graph' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}`}
                title="Knowledge Graph"
              >
                <Map className="w-4 h-4" />
              </button>
           </div>

           <form onSubmit={handleSearch} className="relative hidden md:block group">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 w-3 h-3 group-focus-within:text-white transition-colors" />
             <input 
               type="text" 
               placeholder="Search logs..." 
               className="bg-black border border-neutral-800 text-xs pl-9 pr-4 py-1.5 w-48 focus:outline-none focus:border-neutral-600 focus:w-64 transition-all text-white placeholder-neutral-700 rounded-sm"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
           </form>
           
           <button 
             onClick={() => setViewMode('graph')}
             className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border border-neutral-800 hover:border-white hover:bg-white hover:text-black transition-all ${viewMode === 'graph' ? 'bg-white text-black border-white' : 'text-neutral-400'}`}
             title="View Map"
           >
             View Map
           </button>
           
           <button 
             onClick={() => loadData(searchQuery)}
             className={`p-2 text-neutral-500 hover:text-white transition-colors border border-transparent hover:border-neutral-800 rounded-sm ${loading ? 'animate-spin' : ''}`}
             title="Sync Feed"
           >
             <RefreshCw className="w-4 h-4" />
           </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* VIEW MODE: GRAPH / MAP */}
        {viewMode === 'graph' && (
           <div className="absolute inset-0 z-20 bg-black" style={{ height: '100%', width: '100%' }}>
              <ThreatGraph 
                incidents={incidents} 
                onSelect={(i) => {
                  setSelectedIncident(i);
                  // Optional: Switch back to list view style details overlay? 
                  // For now, we keep graph and show overlay on top
                }} 
              />
              
              {/* API Error Message Overlay */}
              {apiError && (
                <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-950/90 border border-red-800 rounded-sm p-4 max-w-md backdrop-blur-md">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-red-400 mb-1">API Connection Failed</h3>
                      <p className="text-xs text-neutral-300 mb-3">{apiError}</p>
                      <button 
                        onClick={() => loadData(searchQuery)}
                        className="text-xs px-3 py-1.5 bg-red-900/50 border border-red-800 text-red-300 hover:bg-red-900 transition-colors"
                      >
                        Retry Connection
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* No Results Message */}
              {!apiError && !loading && incidents.length === 0 && (
                <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 bg-neutral-950/90 border border-neutral-800 rounded-sm p-4 max-w-md backdrop-blur-md">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-neutral-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-neutral-400 mb-1">No Incidents Detected</h3>
                      <p className="text-xs text-neutral-500 mb-3">
                        The API search completed successfully, but no incidents were found in the Bay Area. 
                        This could mean there are no active incidents, or the search terms need adjustment.
                      </p>
                      <button 
                        onClick={() => loadData(searchQuery)}
                        className="text-xs px-3 py-1.5 bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-colors"
                      >
                        Refresh Search
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Overlay List on Graph Mode (Bottom Left) */}
              <div className="absolute bottom-6 left-6 w-72 max-h-64 overflow-y-auto bg-black/80 backdrop-blur-md border border-neutral-800 rounded-sm hidden md:block">
                 <div className="p-3 border-b border-neutral-800 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Detected Signals ({incidents.length})
                 </div>
                 {incidents.length > 0 ? (
                   incidents.map(inc => (
                      <div 
                        key={inc.id} 
                        onClick={() => setSelectedIncident(inc)}
                        className="p-3 border-b border-neutral-900 cursor-pointer hover:bg-neutral-800/50 transition-colors"
                      >
                         <div className="flex justify-between mb-1">
                            <span className={`text-[9px] font-bold uppercase ${inc.severity === 'critical' ? 'text-red-500' : 'text-neutral-500'}`}>{inc.severity}</span>
                            <span className="text-[9px] text-neutral-600">{inc.location.split(',')[0]}</span>
                         </div>
                         <div className="text-xs text-neutral-300 truncate">{inc.title}</div>
                      </div>
                   ))
                 ) : (
                   <div className="p-3 text-xs text-neutral-600 text-center">
                      {loading ? 'Searching...' : apiError ? 'API Error' : 'No signals detected'}
                   </div>
                 )}
              </div>
           </div>
        )}

        {/* VIEW MODE: LIST (Standard) */}
        <aside className={`${viewMode === 'list' && !selectedIncident ? 'flex' : 'hidden lg:flex'} w-full lg:w-[450px] flex-col border-r border-neutral-900 bg-black z-10 ${viewMode === 'graph' ? 'hidden lg:hidden' : ''}`}>
          <div className="p-3 border-b border-neutral-900 flex justify-between items-center bg-black sticky top-0 z-20">
             <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest pl-2">Incoming Reports</span>
             <div className="flex items-center gap-2 pr-2">
                <span className="text-[10px] text-neutral-600 font-mono">LIVE</span>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                </span>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading && incidents.length === 0 ? (
               <div className="space-y-0 divide-y divide-neutral-900">
                 {[1, 2, 3, 4].map(i => (
                   <div key={i} className="h-32 bg-neutral-950/50 animate-pulse"></div>
                 ))}
               </div>
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <AlertTriangle className="w-10 h-10 text-neutral-700 mb-4" />
                <p className="text-neutral-500 text-sm mb-4">{error}</p>
                <button 
                  onClick={() => loadData()}
                  className="px-6 py-2 border border-white text-white text-xs font-bold uppercase tracking-wider hover:bg-white hover:text-black transition-all"
                >
                  Retry Connection
                </button>
              </div>
            ) : apiError ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <AlertTriangle className="w-10 h-10 text-red-500 mb-4" />
                <h3 className="text-sm font-bold text-red-400 mb-2">API Connection Failed</h3>
                <p className="text-neutral-500 text-sm mb-4">{apiError}</p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => loadData()}
                    className="px-6 py-2 border border-red-800 text-red-400 text-xs font-bold uppercase tracking-wider hover:bg-red-950 transition-all"
                  >
                    Retry Connection
                  </button>
                  <button 
                    onClick={() => setViewMode('graph')}
                    className="px-6 py-2 border border-neutral-800 text-neutral-400 text-xs font-bold uppercase tracking-wider hover:bg-neutral-900 transition-all"
                  >
                    View Map
                  </button>
                </div>
              </div>
            ) : incidents.length === 0 ? (
               <div className="p-10 text-center text-neutral-600">
                  <AlertTriangle className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
                  <p className="mb-2">No incidents detected in the Bay Area.</p>
                  <p className="text-xs text-neutral-700 mb-4">
                    The API search completed successfully, but no matching incidents were found. 
                    This could mean there are no active incidents, or the search needs adjustment.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button 
                      onClick={() => loadData()} 
                      className="px-4 py-2 border border-neutral-800 text-neutral-400 text-xs font-bold uppercase tracking-wider hover:bg-neutral-900 transition-all"
                    >
                      Refresh Search
                    </button>
                    <button 
                      onClick={() => setViewMode('graph')} 
                      className="px-4 py-2 border border-neutral-800 text-neutral-400 text-xs font-bold uppercase tracking-wider hover:bg-neutral-900 transition-all"
                    >
                      View Map
                    </button>
                  </div>
               </div>
            ) : (
              <div className="divide-y divide-neutral-900">
                {incidents.map((incident) => (
                  <MinimalEventCard 
                    key={incident.id} 
                    incident={incident} 
                    onClick={(i) => { setSelectedIncident(i); setViewMode('list'); }}
                    isSelected={selectedIncident?.id === incident.id}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Detail Overlay (Common) */}
        <section className={`
             flex-1 bg-neutral-950 
             ${!selectedIncident && viewMode === 'list' ? 'hidden lg:block' : ''} 
             ${selectedIncident ? 'absolute inset-0 lg:static z-40' : ''}
             ${viewMode === 'graph' && !selectedIncident ? 'hidden' : ''}
        `}>
          {selectedIncident ? (
            <ExpandedEventDetail 
              incident={selectedIncident} 
              onClose={() => setSelectedIncident(null)} 
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-neutral-800 select-none p-10 text-center">
              <div className="w-32 h-32 border border-neutral-900 rounded-full flex items-center justify-center mb-8">
                <Activity className="w-10 h-10 opacity-20" />
              </div>
              <h2 className="text-xl font-bold text-neutral-700 tracking-tight mb-2">AWAITING SELECTION</h2>
              <p className="text-sm text-neutral-700 font-mono">Select a report from the wire to view analysis.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;