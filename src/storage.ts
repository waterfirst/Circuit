import { Circuit, PixelCircuit } from './types';

export interface SavedSpiceItem {
  id: string;
  name: string;
  description?: string;
  netlist: string;
  updatedAt: string;
}

export interface SavedDriverCircuit {
  id: string;
  name: string;
  circuit: Circuit;
  updatedAt: string;
}

export interface SavedPixelCircuit {
  id: string;
  name: string;
  circuit: PixelCircuit;
  updatedAt: string;
}

const SPICE_STORAGE_KEY = 'gw_spice_netlists_v1';
const DRIVER_STORAGE_KEY = 'gw_driver_circuits_v1';
const PIXEL_STORAGE_KEY = 'gw_pixel_circuits_v1';

// ==========================================
// SPICE Netlist LocalStorage Operations
// ==========================================

export function getSavedSpiceNetlists(): SavedSpiceItem[] {
  try {
    const raw = localStorage.getItem(SPICE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[Storage] Error reading SPICE netlists:', err);
    return [];
  }
}

export function saveSpiceNetlist(name: string, netlist: string, description?: string): SavedSpiceItem {
  const list = getSavedSpiceNetlists();
  const existingIndex = list.findIndex((item) => item.name === name.trim());
  const now = new Date().toISOString();

  let item: SavedSpiceItem;
  if (existingIndex >= 0) {
    item = {
      ...list[existingIndex],
      netlist,
      description: description ?? list[existingIndex].description,
      updatedAt: now,
    };
    list[existingIndex] = item;
  } else {
    item = {
      id: `spice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || `넷리스트_${new Date().toLocaleTimeString()}`,
      description,
      netlist,
      updatedAt: now,
    };
    list.unshift(item);
  }

  localStorage.setItem(SPICE_STORAGE_KEY, JSON.stringify(list));
  return item;
}

export function deleteSpiceNetlist(id: string): void {
  const list = getSavedSpiceNetlists().filter((item) => item.id !== id);
  localStorage.setItem(SPICE_STORAGE_KEY, JSON.stringify(list));
}

export function downloadJsonFile(filename: string, data: any): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadSpiceFile(filename: string, netlistContent: string): void {
  const cleanName = filename.replace(/\.(sp|cir)$/i, '');
  const finalName = `${cleanName}.sp`;
  const blob = new Blob([netlistContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================
// Display Driver Circuit LocalStorage Operations
// ==========================================

export function getSavedDriverCircuits(): SavedDriverCircuit[] {
  try {
    const raw = localStorage.getItem(DRIVER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[Storage] Error reading driver circuits:', err);
    return [];
  }
}

export function saveDriverCircuit(name: string, circuit: Circuit): SavedDriverCircuit {
  const list = getSavedDriverCircuits();
  const existingIndex = list.findIndex((item) => item.name === name.trim());
  const now = new Date().toISOString();

  let item: SavedDriverCircuit;
  if (existingIndex >= 0) {
    item = {
      ...list[existingIndex],
      circuit: structuredClone(circuit),
      updatedAt: now,
    };
    list[existingIndex] = item;
  } else {
    item = {
      id: `driver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || `회로설정_${new Date().toLocaleTimeString()}`,
      circuit: structuredClone(circuit),
      updatedAt: now,
    };
    list.unshift(item);
  }

  localStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(list));
  return item;
}

export function deleteDriverCircuit(id: string): void {
  const list = getSavedDriverCircuits().filter((item) => item.id !== id);
  localStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(list));
}

// ==========================================
// Pixel Circuit LocalStorage Operations
// ==========================================

export function getSavedPixelCircuits(): SavedPixelCircuit[] {
  try {
    const raw = localStorage.getItem(PIXEL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[Storage] Error reading pixel circuits:', err);
    return [];
  }
}

export function savePixelCircuit(name: string, circuit: PixelCircuit): SavedPixelCircuit {
  const list = getSavedPixelCircuits();
  const existingIndex = list.findIndex((item) => item.name === name.trim());
  const now = new Date().toISOString();

  let item: SavedPixelCircuit;
  if (existingIndex >= 0) {
    item = {
      ...list[existingIndex],
      circuit: structuredClone(circuit),
      updatedAt: now,
    };
    list[existingIndex] = item;
  } else {
    item = {
      id: `pixel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || `화소설정_${new Date().toLocaleTimeString()}`,
      circuit: structuredClone(circuit),
      updatedAt: now,
    };
    list.unshift(item);
  }

  localStorage.setItem(PIXEL_STORAGE_KEY, JSON.stringify(list));
  return item;
}

export function deletePixelCircuit(id: string): void {
  const list = getSavedPixelCircuits().filter((item) => item.id !== id);
  localStorage.setItem(PIXEL_STORAGE_KEY, JSON.stringify(list));
}

