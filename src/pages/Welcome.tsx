import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server } from 'lucide-react';

export default function Welcome() {
  const navigate = useNavigate();
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => navigate('/dashboard', { replace: true }), 500);
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  const handleClick = () => {
    setFadeOut(true);
    setTimeout(() => navigate('/dashboard', { replace: true }), 500);
  };

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center bg-surface-950 cursor-pointer transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
      onClick={handleClick}
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-minecraft-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-surface-800 border border-surface-700 glow animate-pulse">
          <Server className="w-10 h-10 text-minecraft-500" />
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-bold">
            <span className="text-minecraft-400">Mine</span>
            <span className="text-gray-100">Control</span>
            <span className="text-minecraft-500">OS</span>
          </h1>
          <p className="text-gray-500 text-sm mt-2">Minecraft Server Management</p>
        </div>

        <div className="w-48 h-1 bg-surface-800 rounded-full overflow-hidden mt-4">
          <div className="h-full bg-minecraft-500 rounded-full animate-loading-bar" />
        </div>

        <div className="mt-8 border-2 border-dashed border-surface-700 rounded-xl p-8 text-center max-w-md">
          <p className="text-gray-600 text-sm">Your splash image/video here</p>
          <p className="text-gray-700 text-xs mt-1">Replace this with a custom welcome screen</p>
        </div>

        <p className="text-gray-600 text-xs mt-4">Click anywhere to continue</p>
      </div>
    </div>
  );
}
