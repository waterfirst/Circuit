export type Pin = "G" | "S" | "D";
export interface Deg { dVT?: number; mu?: number; ioff?: number; ss?: number }

export interface CustomTftModel {
  name: string;
  type: "P" | "N";
  VT0: number;
  U0: number;
  SS?: number;
  GOFF?: number;
  rawCard?: string;
}

export interface Tft extends Deg {
  type?: "P" | "N";
  G: string;
  S: string;
  D: string;
  W: number;
  L: number;
  bml?: boolean;
  bml_node?: string;
  bml_gamma?: number;
  model_name?: string;
}

export interface Cap { a: string; b: string; pF: number }
export interface PixelCap { name?: string; a: string; b: string; fF: number }
export interface DiodeSpec { name?: string; a: string; k: string; is_A?: number; n?: number; rs_ohm?: number; IS?: number; N?: number }

export interface Circuit {
  name?: string;
  VGH: number; VGL: number; freq_kHz: number; stages: number; frames: number;
  hold_us: number; clock_mode: "continuous" | "burst";
  output?: "low_pulse" | "high_pulse"; start_width_H?: number; start_lead_H?: number;
  pw_frac?: number; clk_offset_us?: number;
  external_pcb_clock?: boolean;
  ext_vhigh?: number;
  ext_vlow?: number;
  ext_slew_ns?: number;
  ext_rs_ohm?: number;
  VT0?: number; U0?: number;
  models?: Record<"P" | "N", { VT0: number; U0: number; SS?: number; GOFF?: number }>;
  custom_models?: CustomTftModel[];
  flm_lead_us?: number; flm_lag_us?: number;
  out_low_req?: number; hold_drop?: number; temp_C?: number;
  tft: Record<string, Tft>;
  caps: Cap[];
  diodes?: DiodeSpec[];
}

export interface StageVerdict {
  frame: number; stage: number; pulses: number; t_first_us: number | null;
  width_us: number | null; active_V: number; rest_V: number; pass: boolean; why: string[];
}

export interface SimResult {
  ok: boolean; errors?: string[]; warnings?: string[]; job?: string; elapsed_s?: number;
  netlist?: string; internal?: string[];
  timing?: Record<string, number>;
  verdict?: { pass: boolean; problems: string[]; stages: StageVerdict[]; output: string };
  analysis?: {
    rise_time_us: number;
    fall_time_us: number;
    qb_stability: { min_V: number; max_V: number; avg_V: number; ripple_V: number; stable: boolean };
  };
  series?: Record<string, number[]>;
  rails?: { VGH: number; VGL: number };
}

export const PIN_NETS = ["VGH", "VGL", "CLK1", "CLK2", "IN", "OUT", "A", "B", "C", "D", "E", "Q", "QB",
  "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"];
export const CAP_NETS = [...PIN_NETS, "GND"];

export const PIXEL_NETS = ["ELVDD", "ELVSS", "VINT", "VOBS", "DATA", "GW", "GC", "GI", "EM", "GO", "G", "S", "D", "AN",
  "N1", "N2", "N3", "N4", "GND"];
export const PIXEL_SIGS = ["GI", "GC", "GW", "EM", "GO"] as const;

export const HPD_NETS = [
  "ELVDD", "ELVSS", "VINT", "VREF", "DATA",
  "EM", "EMB", "GW", "GR", "GI",
  "A", "B", "Q", "ANODE",
  "N1", "N2", "N3", "N4", "GND",
];
export const HPD_SIGS = ["GR", "GI", "EMB_init", "GW", "EM", "EMB"] as const;
export const HPD_WAVE_SIGS = ["EM", "EMB", "GW", "GR", "GI"] as const;

export interface PixelTft extends Deg {
  type: "P" | "N";
  G: string;
  S: string;
  D: string;
  W: number;
  L: number;
  bml?: boolean;
  bml_node?: string;
  bml_gamma?: number;
  model_name?: string;
}

export interface PixelCircuit {
  name?: string; VGH: number; VGL: number; ELVDD: number; ELVSS: number; VINT: number; VOBS: number;
  VDATA: number; Cst_fF: number; Coled_fF: number; frame_hz: number; vth_check: boolean; temp_C?: number;
  models: Record<"P" | "N", { VT0: number; U0: number; SS?: number; GOFF?: number }>;
  custom_models?: CustomTftModel[];
  timing_us: Record<string, [number, number]>;
  tft: Record<string, PixelTft>;
  extra_caps?: PixelCap[];
  diodes?: DiodeSpec[];
}

export interface HpdCircuit {
  name?: string;
  VGH: number;
  VGL: number;
  ELVDD: number;
  ELVSS: number;
  VINT: number;
  VREF: number;
  VDATA: number;
  Cst_fF: number;
  Chold_fF: number;
  Coled_fF: number;
  frame_us: number;
  frames: number;
  vth_check: boolean;
  temp_C?: number;
  models: Record<"P" | "N", { VT0: number; U0: number; SS?: number; GOFF?: number }>;
  custom_models?: CustomTftModel[];
  timing_us: Record<string, [number, number]>;
  tft: Record<string, PixelTft>;
  extra_caps?: PixelCap[];
  diodes?: DiodeSpec[];
}

export interface PixelComparison {
  fresh_I_em_nA: number;
  aged_I_em_nA: number;
  I_change_pct: number;
  fresh_Vg_after_GC_V: number;
  aged_Vg_after_GC_V: number;
  vg_shift_V: number;
  t1_dVT: number;
  compensated: boolean;
}

export interface PixelMetrics {
  I_em_nA: number;
  I_frame_nA: number;
  Vg_em_V: number;
  Vg_after_GC_V: number;
  VA_em_V?: number;
  VB_em_V?: number;
  VQ_em_V?: number;
  VANODE_em_V?: number;
  VQ_after_init_V?: number;
  VA_after_write_V?: number;
}

export interface PixelResult {
  ok: boolean; errors?: string[]; warnings?: string[]; job?: string; elapsed_s?: number; netlist?: string;
  metrics?: PixelMetrics; vth_check?: (PixelMetrics & { dVT: number; I_change_pct: number })[];
  comparison?: PixelComparison;
  series?: Record<string, number[]>; frame_us?: number;
  frames?: number;
}

export type AgingLawType = "stretched_exponential" | "power_law";

export interface AgingRow { duty_on: number; vgs_on_avg: number; dVT: number; mu: number; ioff: number; ss: number }
export interface AgingResult {
  ok: boolean;
  errors?: string[];
  tft?: Record<string, AgingRow>;
  note?: string;
  law?: Record<string, number>;
  law_type?: AgingLawType;
  temp_C?: number;
  hours?: number;
}
export interface MapCell { ok: boolean; pass?: boolean; err?: string; first?: string; n_problems?: number; I_em_nA?: number; change_pct?: number }
export interface MapJob {
  ok: boolean; state: "running" | "done" | "error"; kind: string; vgh: number[]; vgl: number[]; done: number; total: number;
  aged: (MapCell | null)[][]; fresh: (MapCell | null)[][]; ref?: number | null; tol_pct: number; error?: string; elapsed_s?: number;
  errors?: string[];
  deg_info?: Record<string, { dVT: number; mu: number; ss: number; ioff: number }>;
  aging_source?: string;
  fresh_pass_count?: number;
  aged_pass_count?: number;
  total_cells_per_map?: number;
  margin_reduced?: boolean;
}
