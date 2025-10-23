import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Cpu, CircleHelp, Loader, Clock, FileText } from 'lucide-react';

interface Prediction {
  cameraId: number;
  model: string;
  timestamp: string;
  result: any;
}

interface PredictionLogProps {
  predictions: Prediction[];
  isExpanded: boolean;
  onToggle: () => void;
}

const PredictionLog: React.FC<PredictionLogProps> = ({ predictions, isExpanded, onToggle }) => {
  const [displayedPredictions, setDisplayedPredictions] = useState<Prediction[]>([]);

  useEffect(() => {
    const newPredictions = predictions.filter(
      (pred) => !displayedPredictions.some(
        (displayed) =>
          displayed.cameraId === pred.cameraId &&
          displayed.model === pred.model &&
          displayed.timestamp === pred.timestamp
      )
    );

    if (newPredictions.length > 0) {
      setDisplayedPredictions(prev => [...newPredictions, ...prev].slice(0, 50));
    }
  }, [predictions]);


  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getResultSummary = (result: any) => {
    if (!result) return { text: 'No result', Icon: CircleHelp, color: 'zinc' };

    if (result.detections && Array.isArray(result.detections)) {
      const count = result.detections.length;
      if (count === 0) return { text: 'Healthy', Icon: CheckCircle, color: 'emerald' };
      return { text: `${count} Issue${count > 1 ? 's' : ''}`, Icon: AlertTriangle, color: 'amber' };
    }

    if (result.prediction) return { text: result.prediction, Icon: Cpu, color: 'blue' };
    if (result.class) return { text: result.class, Icon: Cpu, color: 'blue' };
    if (result.label) return { text: result.label, Icon: Cpu, color: 'blue' };

    return { text: 'Processing', Icon: Loader, color: 'zinc' };
  };

  const recentPredictions = displayedPredictions.slice(0, 2);
  console.log(recentPredictions); // now it's being read
  
  // Get summary stats for badges
  const healthyCount = displayedPredictions.filter(p => {
    const result = p.result;
    return result?.detections && Array.isArray(result.detections) && result.detections.length === 0;
  }).length;

  const issuesCount = displayedPredictions.filter(p => {
    const result = p.result;
    return result?.detections && Array.isArray(result.detections) && result.detections.length > 0;
  }).length;

  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="fixed bottom-0 left-0 right-0 z-40"
    >
      <motion.div
        animate={{ height: isExpanded ? '60vh' : 'auto' }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="bg-zinc-900/98 backdrop-blur-xl border-t-2 border-zinc-700/50 shadow-2xl"
      >
        {/* Header - Clickable Button */}
        <motion.div
          whileHover={{ backgroundColor: 'rgba(63, 63, 70, 0.3)' }}
          whileTap={{ scale: 0.99 }}
          className="flex items-center justify-between px-3 sm:px-6 py-2.5 cursor-pointer transition-colors"
          onClick={onToggle}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
              <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-white truncate">Activity</span>

            {/* Summary Badges */}
            <div className="flex items-center gap-1.5 ml-auto">
              {healthyCount > 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-mono text-emerald-400">{healthyCount}</span>
                </div>
              )}
              {issuesCount > 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] font-mono text-amber-400">{issuesCount}</span>
                </div>
              )}
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-800 border border-zinc-700">
                <span className="text-[10px] font-mono text-zinc-400">{displayedPredictions.length}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <div className="p-0.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-300" />
              ) : (
                <ChevronUp className="w-4 h-4 text-zinc-300" />
              )}
            </div>
          </div>
        </motion.div>


        {/* Expanded View - Full Log */}
        {isExpanded && (
          <div className="px-3 sm:px-6 pb-4 sm:pb-6 h-[calc(100%-4rem)] sm:h-[calc(100%-5rem)] overflow-y-auto">
            {displayedPredictions.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                    <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-zinc-600" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-zinc-300 mb-1 sm:mb-2">No Activity Yet</h3>
                  <p className="text-xs sm:text-sm text-zinc-500">Waiting for predictions...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedPredictions.map((prediction, index) => {
                  const summary = getResultSummary(prediction.result);
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.01 }}
                      className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-900/70 transition-colors"
                    >
                      {/* Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2 sm:mb-3">
                        <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-${summary.color}-500/10 border border-${summary.color}-500/20 flex items-center justify-center flex-shrink-0`}>
                            <summary.Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-${summary.color}-400`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span className="text-xs sm:text-sm font-medium text-white">
                                Cam {prediction.cameraId + 1}
                              </span>
                              <span className="px-1.5 sm:px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] sm:text-xs text-zinc-300 font-mono">
                                {prediction.model}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 mt-1">
                              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-500" />
                              <span className="text-[10px] sm:text-xs text-zinc-500 font-mono">
                                {formatTimestamp(prediction.timestamp)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className={`text-xs sm:text-sm font-medium text-${summary.color}-400 pl-9 sm:pl-0`}>
                          {summary.text}
                        </span>
                      </div>

                      {/* Detection Details */}
                      {prediction.result?.detections && prediction.result.detections.length > 0 && (
                        <div className="pt-2 sm:pt-3 border-t border-zinc-800/50">
                          <div className="space-y-1 sm:space-y-1.5">
                            {prediction.result.detections.map((detection: any, detIndex: number) => (
                              <div
                                key={detIndex}
                                className="flex items-center justify-between text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-zinc-950/50"
                              >
                                <span className="text-zinc-400 truncate pr-2">
                                  {detection.class || detection.label || `Detection ${detIndex + 1}`}
                                </span>
                                <span className="text-zinc-500 font-mono flex-shrink-0">
                                  {((detection.confidence || detection.score || 0) * 100).toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default PredictionLog;