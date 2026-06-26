import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Clock, Plus, Play, Square, Trash2, Power } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Schedule {
  id: string;
  server_id: string;
  name: string;
  cron: string;
  action: 'start' | 'stop' | 'restart' | 'backup' | 'command';
  command?: string;
  enabled: number;
  last_run?: string;
}

export function Scheduler() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<Schedule>>({
    name: '',
    cron: '0 * * * *',
    action: 'backup',
    command: '',
    enabled: 1
  });

  const fetchSchedules = async () => {
    try {
      const data = await api.get('/schedules');
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleToggle = async (schedule: Schedule) => {
    try {
      await api.put(`/schedules/${schedule.id}`, { ...schedule, enabled: schedule.enabled ? 0 : 1 });
      fetchSchedules();
      toast.success(`Schedule ${schedule.enabled ? 'disabled' : 'enabled'}`);
    } catch (err) {
      toast.error('Failed to toggle schedule');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await api.delete(`/schedules/${id}`);
      fetchSchedules();
      toast.success('Schedule deleted');
    } catch (err) {
      toast.error('Failed to delete schedule');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/schedules', formData);
      setShowModal(false);
      fetchSchedules();
      toast.success('Schedule created');
    } catch (err) {
      toast.error('Failed to create schedule');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Clock className="w-6 h-6 text-emerald-400" />
            Task Scheduler
          </h2>
          <p className="text-gray-400">Automate server commands and backups with Cron</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading schedules...</div>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
          <table className="w-full text-left">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="p-4 text-gray-400 font-medium">Name</th>
                <th className="p-4 text-gray-400 font-medium">Cron Expression</th>
                <th className="p-4 text-gray-400 font-medium">Action</th>
                <th className="p-4 text-gray-400 font-medium">Status</th>
                <th className="p-4 text-gray-400 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    No scheduled tasks configured.
                  </td>
                </tr>
              )}
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-4 text-gray-200">{schedule.name}</td>
                  <td className="p-4">
                    <code className="bg-gray-900 px-2 py-1 rounded text-emerald-400">{schedule.cron}</code>
                  </td>
                  <td className="p-4 text-gray-300">
                    <span className="capitalize">{schedule.action}</span>
                    {schedule.action === 'command' && (
                      <span className="text-gray-500 ml-2 text-sm">{schedule.command}</span>
                    )}
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => handleToggle(schedule)}
                      className={`px-2 py-1 rounded text-xs font-medium ${schedule.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-600/50 text-gray-400'}`}
                    >
                      {schedule.enabled ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDelete(schedule.id)}
                      className="text-red-400 hover:text-red-300 p-2"
                      title="Delete Task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Create Schedule</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Task Name</label>
                <input
                  type="text"
                  required
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. Daily Backup"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Cron Expression</label>
                <input
                  type="text"
                  required
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-emerald-400 font-mono"
                  value={formData.cron}
                  onChange={e => setFormData({...formData, cron: e.target.value})}
                  placeholder="0 0 * * *"
                />
                <p className="text-xs text-gray-500 mt-1">Minute Hour Day Month Weekday</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Action</label>
                <select
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                  value={formData.action}
                  onChange={e => setFormData({...formData, action: e.target.value as any})}
                >
                  <option value="start">Start Server</option>
                  <option value="stop">Stop Server</option>
                  <option value="restart">Restart Server</option>
                  <option value="backup">Create Backup</option>
                  <option value="command">Run Command</option>
                </select>
              </div>
              {formData.action === 'command' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Command</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                    value={formData.command}
                    onChange={e => setFormData({...formData, command: e.target.value})}
                    placeholder="say Hello world!"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-medium"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
