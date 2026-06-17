import SteveViewer from '../components/ModelViewer/SteveViewer';

export default function Models() {
  return (
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-2xl font-bold text-sky-400 mb-2">3D Model Viewer</h1>
      <p className="text-gray-400 mb-4">
        Preview the Steve avatar with walk animation. Drag to rotate, scroll to zoom.
      </p>
      <div className="flex-1 rounded-lg overflow-hidden border border-gray-700">
        <SteveViewer />
      </div>
    </div>
  );
}
