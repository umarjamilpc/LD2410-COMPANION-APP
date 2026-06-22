import { createContext, useContext, useState } from 'react';

const SensorContext = createContext(null);

export function SensorProvider({ children }) {
  const [selectedSensor, setSelectedSensor] = useState('');

  return (
    <SensorContext.Provider value={{ selectedSensor, setSelectedSensor }}>
      {children}
    </SensorContext.Provider>
  );
}

export function useSensor() {
  const ctx = useContext(SensorContext);
  if (!ctx) throw new Error('useSensor must be used within SensorProvider');
  return ctx;
}
