import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Activity, Clock, Crosshair, MapPin, Package, X } from 'lucide-react';

interface PlayerDetailsProps {
  serverId: string;
  uuid: string;
  username: string;
  onClose: () => void;
}

interface PlayerData {
  inventory: any[];
  health: number;
  foodLevel: number;
  pos: number[];
  stats: any;
  ping: string;
}

export default function PlayerDetails({ serverId, uuid, username, onClose }: PlayerDetailsProps) {
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlayerData = async () => {
      try {
        const response = await fetch(`/api/server/${serverId}/player/${uuid}?username=${username}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('mc_token')}` }
        });
        if (!response.ok) throw new Error('Failed to load player data');
        const resData = await response.json();
        setData(resData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPlayerData();
  }, [serverId, uuid, username]);

  const renderInventorySlot = (slotIndex: number) => {
    if (!data) return null;
    const item = data.inventory.find((i: any) => i.Slot === slotIndex);
    if (!item) {
      return <div key={slotIndex} className="w-10 h-10 bg-surface-800 border-2 border-surface-600/50 rounded-sm" />;
    }
    
    // Extract block name from 'minecraft:stone'
    const itemName = item.id.replace('minecraft:', '').replace(/_/g, ' ');
    
    return (
      <div 
        key={slotIndex} 
        className="w-10 h-10 bg-surface-700 border-2 border-surface-500 rounded-sm relative flex items-center justify-center group"
        title={itemName}
      >
        <span className="text-[10px] text-gray-400 break-all text-center leading-tight px-1 capitalize">
          {itemName.length > 8 ? itemName.substring(0, 7) + '..' : itemName}
        </span>
        {item.Count > 1 && (
          <span className="absolute -bottom-1 -right-1 bg-surface-900 text-white text-[10px] px-1 rounded-sm font-bold border border-surface-600 z-10">
            {item.Count}
          </span>
        )}
        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-surface-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow-lg border border-surface-600">
          {itemName} x{item.Count}
        </div>
      </div>
    );
  };

  // 36 slots: 9 hotbar (0-8), 27 inventory (9-35). Armor (100-103) and offhand (106)
  const hotbarSlots = Array.from({ length: 9 }, (_, i) => i);
  const inventorySlots = Array.from({ length: 27 }, (_, i) => i + 9);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-900 rounded-xl border border-surface-700 w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-surface-700 flex items-center justify-between bg-surface-800/50">
          <div className="flex items-center gap-4">
            <img 
              src={`https://crafatar.com/avatars/${uuid}?size=64&overlay`} 
              alt={username} 
              className="w-14 h-14 rounded-lg bg-surface-700 border-2 border-surface-600 shadow-md"
            />
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                {username}
                {data && data.ping !== 'N/A' && (
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30 flex items-center gap-1">
                    <Activity size={10} /> {data.ping}
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-400 font-mono mt-0.5">{uuid}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-700 rounded-lg text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-minecraft-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg">
              {error}
            </div>
          ) : data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Left Column: Stats & Vitals */}
              <div className="space-y-6">
                
                {/* Vitals */}
                <div className="bg-surface-800 p-4 rounded-xl border border-surface-700 shadow-inner">
                  <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <Activity size={16} className="text-minecraft-400" />
                    Vitals & Position
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-gray-400">Health</span>
                        <span className="text-red-400 font-bold">{Math.round(data.health)} / 20</span>
                      </div>
                      <div className="w-full bg-surface-900 rounded-full h-3 border border-surface-700 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-red-600 to-red-400 h-full transition-all duration-500 relative"
                          style={{ width: `${(data.health / 20) * 100}%` }}
                        >
                          <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')]"></div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-gray-400">Hunger</span>
                        <span className="text-yellow-500 font-bold">{Math.round(data.foodLevel)} / 20</span>
                      </div>
                      <div className="w-full bg-surface-900 rounded-full h-3 border border-surface-700 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-yellow-600 to-yellow-400 h-full transition-all duration-500 relative"
                          style={{ width: `${(data.foodLevel / 20) * 100}%` }}
                        >
                           <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')]"></div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-sm bg-surface-900/50 p-2.5 rounded-lg border border-surface-700/50">
                      <div className="flex items-center gap-2 text-gray-400">
                        <MapPin size={14} className="text-minecraft-400" />
                        Location
                      </div>
                      <div className="font-mono text-gray-200">
                        X: {Math.round(data.pos[0])} &nbsp; 
                        Y: {Math.round(data.pos[1])} &nbsp; 
                        Z: {Math.round(data.pos[2])}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Statistics */}
                <div className="bg-surface-800 p-4 rounded-xl border border-surface-700 shadow-inner">
                  <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <Crosshair size={16} className="text-minecraft-400" />
                    Statistics
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50 hover:border-minecraft-500/30 transition-colors">
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><Clock size={12}/> Playtime</div>
                      <div className="text-lg font-bold text-gray-200">
                        {data.stats?.stats?.['minecraft:custom']?.['minecraft:play_time'] 
                          ? Math.round(data.stats.stats['minecraft:custom']['minecraft:play_time'] / 20 / 60) + ' min' 
                          : '0 min'}
                      </div>
                    </div>
                    <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50 hover:border-minecraft-500/30 transition-colors">
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><Package size={12}/> Blocks Broken</div>
                      <div className="text-lg font-bold text-gray-200">
                        {data.stats?.stats?.['minecraft:mined'] 
                          ? (Object.values(data.stats.stats['minecraft:mined']) as number[]).reduce((a: number, b: number) => a + b, 0)
                          : '0'}
                      </div>
                    </div>
                    <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50 hover:border-minecraft-500/30 transition-colors">
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><Crosshair size={12}/> Entities Killed</div>
                      <div className="text-lg font-bold text-gray-200">
                        {data.stats?.stats?.['minecraft:killed'] 
                          ? (Object.values(data.stats.stats['minecraft:killed']) as number[]).reduce((a: number, b: number) => a + b, 0)
                          : '0'}
                      </div>
                    </div>
                    <div className="bg-surface-900 p-3 rounded-lg border border-surface-700/50 hover:border-minecraft-500/30 transition-colors">
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><MapPin size={12}/> Walked</div>
                      <div className="text-lg font-bold text-gray-200">
                        {data.stats?.stats?.['minecraft:custom']?.['minecraft:walk_one_cm'] 
                          ? Math.round(data.stats.stats['minecraft:custom']['minecraft:walk_one_cm'] / 100) + ' m'
                          : '0 m'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Inventory Grid */}
              <div className="bg-surface-800 p-4 rounded-xl border border-surface-700 shadow-inner flex flex-col">
                <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                  <Package size={16} className="text-minecraft-400" />
                  Inventory
                </h3>
                
                <div className="flex-1 flex flex-col justify-center items-center p-2 bg-[#c6c6c6] rounded-md border-4 border-[#555555] border-t-[#ffffff] border-l-[#ffffff]">
                  {/* Main Inventory */}
                  <div className="grid grid-cols-9 gap-1 mb-4">
                    {inventorySlots.map(slot => renderInventorySlot(slot))}
                  </div>
                  
                  {/* Hotbar */}
                  <div className="grid grid-cols-9 gap-1">
                    {hotbarSlots.map(slot => renderInventorySlot(slot))}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
