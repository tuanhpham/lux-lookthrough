import { create } from "zustand";
import type { SectorVolume, PatternSignal } from "@/types";

interface AppState {
  // Sectors
  sectors: SectorVolume[];
  setSectors: (sectors: SectorVolume[]) => void;

  // Patterns feed
  patternSignals: PatternSignal[];
  setPatternSignals: (signals: PatternSignal[]) => void;

  // Selected symbol for drill-down
  selectedSymbol: string | null;
  setSelectedSymbol: (symbol: string | null) => void;

  // Selected sector
  selectedSector: string | null;
  setSelectedSector: (sector: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sectors: [],
  setSectors: (sectors) => set({ sectors }),

  patternSignals: [],
  setPatternSignals: (patternSignals) => set({ patternSignals }),

  selectedSymbol: null,
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),

  selectedSector: null,
  setSelectedSector: (selectedSector) => set({ selectedSector }),
}));
