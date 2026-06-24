import React from 'react';
import ServerStatusCard from '../components/Dashboard/ServerStatusCard';
import OnlinePlayers from '../components/Dashboard/OnlinePlayers';
import TPSCounter from '../components/Dashboard/TPSCounter';
import RAMChart from '../components/Dashboard/RAMChart';
import CPUChart from '../components/Dashboard/CPUChart';
import ActionButtons from '../components/Dashboard/ActionButtons';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-3">
          <ServerStatusCard />
        </div>
        <div className="col-span-3">
          <TPSCounter />
        </div>
        <div className="col-span-3">
          <RAMChart />
        </div>
        <div className="col-span-3">
          <CPUChart />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8">
          <ActionButtons />
        </div>
        <div className="col-span-4">
          <OnlinePlayers />
        </div>
      </div>
    </div>
  );
}
