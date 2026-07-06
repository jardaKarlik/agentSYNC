import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  FileText,
  HelpCircle,
  Laptop,
  Monitor,
  RefreshCw,
  Settings,
  Shield,
  Sliders,
  Sparkles,
} from 'lucide-react'
import React, {useState} from 'react'

interface Workstation {
  id: string
  ip: string
  lastSync: string
  name: string
  status: 'error' | 'out_of_sync' | 'synced'
  type: 'laptop' | 'studio' | 'vm'
}

export function AgentSyncControlPanel() {
  const [tier, setTier] = useState<'free' | 'paid'>('free')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [syncMemories, setSyncMemories] = useState(true)
  const [syncInstructions, setSyncInstructions] = useState(true)
  const [syncToolsets, setSyncToolsets] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)

  // Workstations list mapping scenarios 1, 2, 3
  const [workstations] = useState<Workstation[]>([
    {
      id: '1',
      ip: '192.168.1.105',
      lastSync: 'Just now',
      name: 'STUDIO-PC',
      status: 'synced',
      type: 'studio',
    },
    {
      id: '2',
      ip: '192.168.1.18',
      lastSync: '5 mins ago',
      name: 'LAPTOP-PRO',
      status: 'synced',
      type: 'laptop',
    },
    {
      id: '3',
      ip: '34.120.45.92',
      lastSync: '1 hour ago',
      name: 'GCP-VM-AGENT',
      status: 'out_of_sync',
      type: 'vm',
    },
  ])

  const handleToggleExclusion = (setter: React.Dispatch<React.SetStateAction<boolean>>, value: boolean) => {
    if (tier === 'free') {
      setShowUpgradeModal(true)
    } else {
      setter(!value)
    }
  }

  const triggerManualSync = () => {
    setIsSyncing(true)
    setTimeout(() => {
      setIsSyncing(false)
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-[#0d0f12] text-gray-100 font-sans p-8">
      {/* Background gradients for premium aesthetic */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-[#1a1333] to-transparent opacity-40 pointer-events-none" />

      {/* Header */}
      <div className="flex justify-between items-center mb-8 relative z-10">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
              AgentSync Control Center
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
              tier === 'paid' 
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-lg shadow-amber-500/20' 
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}>
              {tier === 'paid' ? 'PRO Plan' : 'Free Tier'}
            </span>
          </div>
          <p className="text-gray-400 mt-1 text-sm">
            Orchestrate memory graphs, agent profiles, and instructions across linked workstations.
          </p>
        </div>

        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-600/35 hover:shadow-indigo-600/50 hover:-translate-y-0.5 disabled:opacity-50"
          disabled={isSyncing}
          onClick={triggerManualSync}
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync All Workstations'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
        {/* Left 2 Columns: Workstations & Scope Configuration */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Workstations Section */}
          <div className="bg-[#12151c]/90 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-md shadow-2xl">
            <h2 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
              <Laptop className="w-5 h-5 text-indigo-400" />
              Connected Workstations
            </h2>
            
            <div className="space-y-4">
              {workstations.map((ws) => (
                <div
                  className="flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-[#161a24]/50 hover:bg-[#1a202e]/60 transition-all duration-200 group"
                  key={ws.id}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-indigo-400 group-hover:border-indigo-500/20 transition-all duration-300">
                      {ws.type === 'studio' && <Monitor className="w-5 h-5" />}
                      {ws.type === 'laptop' && <Laptop className="w-5 h-5" />}
                      {ws.type === 'vm' && <Cloud className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-200">{ws.name}</h3>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{ws.ip} • Last seen: {ws.lastSync}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                      ws.status === 'synced' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {ws.status === 'synced' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Synced
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5" />
                          Out of Sync
                        </>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sync Exclusions Configuration Section */}
          <div className="bg-[#12151c]/90 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                Granular Exclusions & Scope
              </h2>
              {tier === 'free' && (
                <span className="flex items-center gap-1 text-xs text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                  <Shield className="w-3 h-3" /> PRO Required
                </span>
              )}
            </div>

            <p className="text-zinc-400 text-sm mb-6">
              Configure which components sync from this workstation. Excluding items is a premium capability.
            </p>

            <div className="space-y-4">
              {/* Sync Category: Memories */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-[#161a24]/30">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h4 className="font-semibold text-gray-200">Global Memory Graph</h4>
                    <p className="text-xs text-zinc-500">Sync agentic entities, relations, and learned project progress.</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    checked={syncMemories} 
                    className="sr-only peer" 
                    onChange={() => handleToggleExclusion(setSyncMemories, syncMemories)}
                    type="checkbox" 
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                </label>
              </div>

              {/* Sync Category: Instructions */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-[#161a24]/30">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h4 className="font-semibold text-gray-200">Instructions Files (agent.md, soul.md)</h4>
                    <p className="text-xs text-zinc-500">Sync shared guidelines and rules (Free is restricted to ≤ 145 lines).</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    checked={syncInstructions} 
                    className="sr-only peer" 
                    onChange={() => handleToggleExclusion(setSyncInstructions, syncInstructions)}
                    type="checkbox" 
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                </label>
              </div>

              {/* Sync Category: Toolsets */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-[#161a24]/30">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h4 className="font-semibold text-gray-200">Toolsets & MCP Server Configs</h4>
                    <p className="text-xs text-zinc-500">Keep allowed tools, custom triggers, and MCP credentials aligned.</p>
                  </div>
                </div>
                <label className="relative inline-flex inline-flex items-center cursor-pointer">
                  <input 
                    checked={syncToolsets} 
                    className="sr-only peer" 
                    onChange={() => handleToggleExclusion(setSyncToolsets, syncToolsets)}
                    type="checkbox" 
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Monetization / Upgrade & Sync Status stats */}
        <div className="space-y-8">
          
          {/* Pro Premium Upgrade Card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#1b1536] via-[#101326] to-[#0c0d17] border border-violet-500/20 rounded-xl p-6 shadow-2xl">
            {/* Background glowing sphere */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-violet-600 rounded-full blur-[64px] opacity-40" />

            <div className="flex items-center gap-2 mb-3 text-violet-400 font-semibold text-sm tracking-wide uppercase">
              <Sparkles className="w-4 h-4" /> Upgrade to Pro
            </div>
            
            <h3 className="text-2xl font-black text-white mb-2 leading-tight">
              Unlock Workstation Customization
            </h3>
            
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              Enable sync exclusions for edge devices (GCP VMs) and sync instruction files exceeding 145 lines.
            </p>

            <ul className="space-y-3 mb-6 text-sm">
              <li className="flex items-center gap-2.5 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Unlimited rules / MD lines sync</span>
              </li>
              <li className="flex items-center gap-2.5 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Fine-grained workstation exclusions</span>
              </li>
              <li className="flex items-center gap-2.5 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Advanced graph semantic merging</span>
              </li>
            </ul>

            {tier === 'free' ? (
              <button
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/30 transition-all duration-300 hover:shadow-violet-600/55 hover:-translate-y-0.5"
                onClick={() => {
                  setTier('paid')
                  setShowUpgradeModal(false)
                }}
              >
                Upgrade Plan <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-full text-center py-2.5 rounded-lg border border-zinc-700 bg-zinc-800/40 text-emerald-400 font-bold text-sm">
                Active Pro Subscription
              </div>
            )}
          </div>

          {/* Sync Diagnostics Info */}
          <div className="bg-[#12151c]/90 border border-zinc-800/80 rounded-xl p-6 backdrop-blur-md shadow-2xl space-y-4">
            <h3 className="text-md font-bold text-gray-200 flex items-center gap-2">
              <HelpCircle className="w-4.5 h-4.5 text-indigo-400" /> Sync Diagnostics
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/50">
                <span className="text-zinc-500 block text-xs">Total Graph Nodes</span>
                <span className="font-semibold text-zinc-200 mt-1 block">1,248</span>
              </div>
              <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/50">
                <span className="text-zinc-500 block text-xs">Total Relations</span>
                <span className="font-semibold text-zinc-200 mt-1 block">4,816</span>
              </div>
              <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/50">
                <span className="text-zinc-500 block text-xs">Sync Protocol</span>
                <span className="font-semibold text-zinc-200 mt-1 block font-mono text-xs">CRDT (LWW)</span>
              </div>
              <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/50">
                <span className="text-zinc-500 block text-xs">Line-limit checks</span>
                <span className="font-semibold text-zinc-200 mt-1 block">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#12151c] border border-violet-500/25 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl relative">
            <h3 className="text-2xl font-black text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-violet-400" /> Premium Capability
            </h3>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              Excluding configurations and instruction scopes is a feature restricted to **AgentSync PRO** accounts. Upgrade now to enable customized client profiles.
            </p>
            <div className="flex gap-4">
              <button
                className="flex-1 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold text-sm transition-colors duration-200"
                onClick={() => setShowUpgradeModal(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/35 transition-all duration-200"
                onClick={() => {
                  setTier('paid')
                  setShowUpgradeModal(false)
                }}
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AgentSyncControlPanel
