import React, { createContext, useContext, useSyncExternalStore } from 'react';
import {
  StudioAudioEngine,
  studioAudioEngine,
  StudioEngineSnapshot,
} from './StudioAudioEngine';

const StudioAudioContext = createContext<StudioAudioEngine>(studioAudioEngine);

export const StudioAudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <StudioAudioContext.Provider value={studioAudioEngine}>
      {children}
    </StudioAudioContext.Provider>
  );
};

export function useStudioAudioEngine(): StudioAudioEngine {
  return useContext(StudioAudioContext);
}

export function useStudioAudioState(): StudioEngineSnapshot {
  const engine = useStudioAudioEngine();
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}
