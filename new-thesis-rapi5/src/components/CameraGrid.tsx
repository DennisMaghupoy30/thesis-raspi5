import React from 'react';
import { motion } from 'framer-motion';
import { Video, CheckCircle, AlertTriangle, AlertCircle, Cpu, Clock, Signal } from 'lucide-react';

interface Camera {
  id: number;
  name?: string;
  device: string;
  streamPort: number;
  streamUrl: string;
}

interface Prediction {
  cameraId: number;
  model: string;
  timestamp: string;
  result: any;
}

interface SystemError {
  cameraId: number;
  error: string;
  timestamp: string;
}

interface CameraGridProps {
  cameras: Camera[];
  predictions: Prediction[];
  errors: SystemError[];
}

const CameraGrid: React.FC<CameraGridProps> = ({ cameras, predictions, errors }) => {

  const getLatestPrediction = (cameraId: number) => {
    return predictions
      .filter(p => p.cameraId === cameraId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  };

  const getResultSummary = (result: any) => {
    if (!result) return { text: 'Scanning...', Icon: Cpu, color: 'zinc' };

    if (result.detections && Array.isArray(result.detections)) {
      const count = result.detections.length;
      if (count === 0) return { text: 'Healthy', Icon: CheckCircle, color: 'emerald' };
      return { text: `${count} Issue${count > 1 ? 's' : ''}`, Icon: AlertTriangle, color: 'amber' };
    }

    return { text: result.prediction || 'Processing', Icon: Cpu, color: 'blue' };
  };

  if (cameras.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Video className="w-10 h-10 text-zinc-600" />
          </div>
          <h3 className="text-xl font-semibold text-zinc-300 mb-2">No Cameras Detected</h3>
          <p className="text-zinc-500">Waiting for camera initialization...</p>
        </div>
      </div>
    );
  }

  const getGridClass = (count: number) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 xl:grid-cols-2';
    if (count <= 4) return 'grid-cols-1 xl:grid-cols-2';
    return 'grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3';
  };

  return (
    <div className={`grid ${getGridClass(cameras.length)} gap-3 sm:gap-6 max-w-[2000px] mx-auto`}>
      {cameras.map((camera) => {
        const latestPrediction = getLatestPrediction(camera.id);
        const predictionSummary = latestPrediction ? getResultSummary(latestPrediction.result) : null;
        const hasError = errors.some(e => e.cameraId === camera.id);

        return (
          <motion.div
            key={camera.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: camera.id * 0.1 }}
            whileHover={{ scale: 1.02, borderColor: 'rgba(82, 82, 91, 0.8)' }}
            className="group relative bg-zinc-900 rounded-xl sm:rounded-2xl border-2 border-zinc-800/60 overflow-hidden shadow-2xl transition-all"
          >
            {/* Camera Stream Container */}
            <div className="relative aspect-video bg-black">
              <img
                src={camera.streamUrl}
                alt={`Camera ${camera.id + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Top Overlay - Camera Info */}
              <div className="absolute top-0 left-0 right-0 p-2 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                      <Video className="w-3 h-3 sm:w-4 sm:h-4 text-zinc-400 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium text-white truncate">
                        {camera.name || `Camera ${camera.id + 1}`}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-zinc-500 font-mono truncate max-w-[120px] sm:max-w-[200px]">
                      {camera.device}
                    </p>
                  </div>

                  {/* Live Indicator */}
                  <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-black/40 backdrop-blur-sm flex-shrink-0">
                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-[10px] sm:text-xs font-medium text-red-400">REC</span>
                  </div>
                </div>
              </div>

              {/* Bottom Overlay - Prediction Status */}
              {predictionSummary && (
                <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <div className={`inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 rounded-md sm:rounded-lg bg-${predictionSummary.color}-500/10 border border-${predictionSummary.color}-500/20 backdrop-blur-sm`}>
                    <predictionSummary.Icon className={`w-3 h-3 sm:w-4 sm:h-4 text-${predictionSummary.color}-400`} />
                    <span className={`text-xs sm:text-sm font-medium text-${predictionSummary.color}-300`}>
                      {predictionSummary.text}
                    </span>
                  </div>
                </div>
              )}

              {/* Error Overlay */}
              {hasError && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                  <div className="text-center px-4 sm:px-6">
                    <AlertCircle className="w-8 h-8 sm:w-12 sm:h-12 text-red-400 mx-auto mb-2 sm:mb-3" />
                    <p className="text-xs sm:text-sm font-medium text-red-300">Connection Error</p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 sm:mt-1">Attempting to reconnect...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Bar */}
            <div className="p-2 sm:p-3 bg-zinc-800/90 border-t-2 border-zinc-700/50">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-zinc-400 min-w-0">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <Signal className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 text-zinc-300" />
                    <span className="font-mono text-zinc-300">:{camera.streamPort}</span>
                  </div>
                  {latestPrediction && (
                    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                      <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 text-zinc-300" />
                      <span className="font-mono truncate text-zinc-300">
                        {new Date(latestPrediction.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-0.5 sm:gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                  <span className="text-[10px] sm:text-xs text-emerald-400 font-semibold">Online</span>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default CameraGrid;
