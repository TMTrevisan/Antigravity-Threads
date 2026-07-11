/**
 * Shared DB and API types for Antigravity Threads.
 *
 * Kept in one place so server routes, lib utilities, and components
 * can all import the same source of truth. If you need to derive a
 * narrower type for a particular view, define it next to the view
 * (e.g. `GarmentCard` in a closet-grid component) rather than
 * redefining the core shape here.
 */

export interface GarmentImage {
  id: string;
  storage_path: string;
  is_primary_profile: boolean;
  asset_type: 'profile' | 'detail';
}

export type GarmentStatus =
  | 'Active'
  | 'Archive'
  | 'Donate'
  | 'Discard'
  | 'Processing'
  | 'Processing_Failed';

export interface Garment {
  id: string;
  category: string;
  sub_category: string;
  brand: string | null;
  color_family: string;
  hex_code: string | null;
  tonal_value: string | null;
  fabric_type: string | null;
  fit_block: string | null;
  style_detail: string | null;
  status: GarmentStatus;
  images: GarmentImage[];
  primary_image_url: string | null;
  notes: string | null;
  price: number;
  purchase_year: number | null;
  created_at: string;
}

export interface WearLog {
  id: string;
  garment_id: string;
  worn_at: string;
}

export interface SavedOutfit {
  id: string;
  name: string;
  item_ids: string[];
  styling_reasoning: string | null;
  created_at: string;
}

export interface StylistOutput {
  outfits: Array<{
    name: string;
    item_ids: string[];
    styling_reasoning: string;
  }>;
  gap_analysis: string;
  general_tips: string[];
}

export interface TelemetryStats {
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  services: Array<{
    service: string;
    count: number;
    avgLatencyMs: number;
    totalCost: number;
  }>;
}

export type IngestGroupStatus = 'pending' | 'uploading' | 'processing' | 'done' | 'failed';

export interface IngestGroup {
  id: string;
  files: File[];
  notes: string;
  status: IngestGroupStatus;
  error?: string;
}