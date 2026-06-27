'use client';

import React, { useState, useEffect, useRef } from 'react';

interface GarmentImage {
  id: string;
  storage_path: string;
  is_primary_profile: boolean;
  asset_type: 'profile' | 'detail';
}

interface Garment {
  id: string;
  category: string;
  sub_category: string;
  brand: string | null;
  color_family: string;
  hex_code: string | null;
  tonal_value: string | null;
  fabric_type: string | null;
  fit_block: string | null;
  status: 'Active' | 'Archive' | 'Donate' | 'Discard' | 'Processing' | 'Processing_Failed';
  images: GarmentImage[];
  primary_image_url: string | null;
  notes: string | null;
  price: number;
  created_at: string;
}

interface WearLog {
  id: string;
  garment_id: string;
  worn_at: string;
}

interface SavedOutfit {
  id: string;
  name: string;
  item_ids: string[];
  styling_reasoning: string | null;
  created_at: string;
}

interface StylistOutput {
  outfits: Array<{
    name: string;
    item_ids: string[];
    styling_reasoning: string;
  }>;
  gap_analysis: string;
  general_tips: string[];
}

interface TelemetryStats {
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

interface IngestGroup {
  id: string;
  files: File[];
  notes: string;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'failed';
  error?: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'snap' | 'closet' | 'stylist'>('snap');
  const [closetSubTab, setClosetSubTab] = useState<'items' | 'outfits'>('items');

  // Core Curation State
  const [items, setItems] = useState<Garment[]>([]);
  const [wearLogs, setWearLogs] = useState<WearLog[]>([]);
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingOutfits, setLoadingOutfits] = useState(false);

  // Ingestion Groups State
  const [ingestGroups, setIngestGroups] = useState<IngestGroup[]>([]);
  const [speechActive, setSpeechActive] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [validationTarget, setValidationTarget] = useState<Garment | null>(null);

  // Active group details selection ref
  const detailFilePickerRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeDetailGroupId, setActiveDetailGroupId] = useState<string | null>(null);

  // Closet filtering
  const [viewMode, setViewMode] = useState<'grid' | 'matrix'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<Garment | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Stylist State
  const [weatherInput, setWeatherInput] = useState('');
  const [eventInput, setEventInput] = useState('');
  const [lookbookInput, setLookbookInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stylistResult, setStylistResult] = useState<StylistOutput | null>(null);
  const [stylingError, setStylingError] = useState('');
  const [isSyncingWeather, setIsSyncingWeather] = useState(false);
  const [savingOutfitIds, setSavingOutfitIds] = useState<string[]>([]);
  // Mobile touch gesture validation states
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [currentOutfitIdx, setCurrentOutfitIdx] = useState(0);

  // Telemetry Dashboard state
  const [telemetry, setTelemetry] = useState<TelemetryStats | null>(null);
  const [telemetryLogs, setTelemetryLogs] = useState<any[]>([]);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);

  // Fetch core data on load
  useEffect(() => {
    fetchItems();
    fetchWearLogs();
    fetchSavedOutfits();
    fetchTelemetry();
  }, []);

  const fetchItems = async () => {
    setLoadingItems(true);
    try {
      const res = await fetch('/api/items');
      const data = await res.json();
      if (data.items) setItems(data.items);
    } catch (err) {
      console.error('Failed to load items:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  const fetchWearLogs = async () => {
    try {
      const res = await fetch('/api/items/wear');
      const data = await res.json();
      if (data.logs) setWearLogs(data.logs);
    } catch (err) {
      console.error('Failed to load wear logs:', err);
    }
  };

  const fetchSavedOutfits = async () => {
    setLoadingOutfits(true);
    try {
      const res = await fetch('/api/outfits');
      const data = await res.json();
      if (data.outfits) setSavedOutfits(data.outfits);
    } catch (err) {
      console.error('Failed to load saved outfits:', err);
    } finally {
      setLoadingOutfits(false);
    }
  };

  const fetchTelemetry = async () => {
    setLoadingTelemetry(true);
    try {
      const res = await fetch('/api/telemetry');
      const data = await res.json();
      if (data.success) {
        setTelemetry(data.stats);
        setTelemetryLogs(data.recentLogs);
      }
    } catch (err) {
      console.error('Failed to fetch telemetry:', err);
    } finally {
      setLoadingTelemetry(false);
    }
  };

  // Image Compressor
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                reject(new Error('Failed to create canvas blob'));
              }
            },
            'image/jpeg',
            0.85
          );
        };
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Drag and select profile image (creates new group)
  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const newGroups = Array.from(files).map((f) => ({
      id: Math.random().toString(36).substring(2, 9),
      files: [f],
      notes: '',
      status: 'pending' as const,
    }));
    setIngestGroups(prev => [...prev, ...newGroups]);
  };

  // Add detail image to a specific group
  const triggerAddDetail = (groupId: string) => {
    setActiveDetailGroupId(groupId);
    detailFilePickerRef.current?.click();
  };

  const handleDetailFilesSelected = (files: FileList | null) => {
    if (!files || !activeDetailGroupId) return;
    const addedFiles = Array.from(files);

    setIngestGroups(prev =>
      prev.map(g => g.id === activeDetailGroupId ? { ...g, files: [...g.files, ...addedFiles] } : g)
    );
    setActiveDetailGroupId(null);
  };

  // Trigger batch upload and process loop
  const triggerBatchUpload = async () => {
    if (ingestGroups.length === 0) return;
    setIsProcessingBatch(true);
    const successfullyUploadedIds: string[] = [];

    const uploadPromises = ingestGroups.map(async (group, index) => {
      if (group.status !== 'pending') return;

      setIngestGroups(prev => prev.map((g, idx) => idx === index ? { ...g, status: 'uploading' } : g));

      try {
        const formData = new FormData();
        
        // Compress and append all files
        for (let i = 0; i < group.files.length; i++) {
          const compressed = await compressImage(group.files[i]);
          formData.append(`image_${i}`, compressed);
        }

        if (group.notes) {
          formData.append('notes', group.notes);
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        successfullyUploadedIds.push(data.item.id);
        
        // Insert item in local state
        setItems(prev => [data.item, ...prev]);

        setIngestGroups(prev => prev.map((g, idx) => idx === index ? { ...g, status: 'processing' } : g));
      } catch (err: any) {
        console.error(err);
        setIngestGroups(prev => prev.map((g, idx) => idx === index ? { ...g, status: 'failed', error: err.message } : g));
      }
    });

    await Promise.all(uploadPromises);

    if (successfullyUploadedIds.length > 0) {
      try {
        const processRes = await fetch('/api/ingest/batch-process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: successfullyUploadedIds }),
        });
        const processData = await processRes.json();
        
        await fetchItems();
        fetchTelemetry(); // Update telemetry metrics

        if (processData.results && processData.results.length > 0) {
          const successItem = items.find(i => i.id === successfullyUploadedIds[0]);
          if (successItem) setValidationTarget(successItem);
        }
      } catch (err) {
        console.error('Batch processing error:', err);
      }
    }

    setIngestGroups(prev => prev.map(g => g.status === 'processing' ? { ...g, status: 'done' } : g));
    setIsProcessingBatch(false);
  };

  // Validation confirm tags
  const handleConfirmValidation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validationTarget) return;

    try {
      const res = await fetch('/api/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: validationTarget.id,
          category: validationTarget.category,
          sub_category: validationTarget.sub_category,
          brand: validationTarget.brand,
          color_family: validationTarget.color_family,
          hex_code: validationTarget.hex_code,
          tonal_value: validationTarget.tonal_value,
          fabric_type: validationTarget.fabric_type,
          fit_block: validationTarget.fit_block,
          price: validationTarget.price,
          status: 'Active',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setItems(prev => prev.map(item => item.id === data.item.id ? data.item : item));
        
        const nextTarget = items.find(item => item.status === 'Processing' && item.id !== validationTarget.id);
        setValidationTarget(nextTarget || null);
      } else {
        const data = await res.json();
        alert(`Failed to validate item: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmValidationMobile = async (actionStatus: 'Active' | 'Donate') => {
    if (!validationTarget) return;

    try {
      if (actionStatus === 'Donate') {
        // Discard: Call DELETE
        const res = await fetch('/api/items', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: validationTarget.id }),
        });

        if (res.ok) {
          setItems(prev => prev.filter(item => item.id !== validationTarget.id));
          const nextTarget = items.find(item => item.status === 'Processing' && item.id !== validationTarget.id);
          setValidationTarget(nextTarget || null);
        } else {
          const data = await res.json();
          alert(`Failed to discard item: ${data.error}`);
        }
      } else {
        // Save: Call PATCH
        const res = await fetch('/api/items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: validationTarget.id,
            category: validationTarget.category,
            sub_category: validationTarget.sub_category,
            brand: validationTarget.brand,
            color_family: validationTarget.color_family,
            hex_code: validationTarget.hex_code,
            tonal_value: validationTarget.tonal_value,
            fabric_type: validationTarget.fabric_type,
            fit_block: validationTarget.fit_block,
            price: validationTarget.price,
            status: 'Active',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setItems(prev => prev.map(item => item.id === data.item.id ? data.item : item));
          const nextTarget = items.find(item => item.status === 'Processing' && item.id !== validationTarget.id);
          setValidationTarget(nextTarget || null);
        } else {
          const data = await res.json();
          alert(`Failed to save item: ${data.error}`);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Weather geohash lookup
  const syncLocalWeather = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported.');
      return;
    }
    setIsSyncingWeather(true);
    setWeatherInput('Querying spatial geohash...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch('/api/weather', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lon: position.coords.longitude,
            }),
          });
          const data = await res.json();
          if (data.success && data.weather) {
            setWeatherInput(data.weather);
            fetchTelemetry();
          }
        } catch (err) {
          console.error(err);
          setWeatherInput('Failed to lookup weather.');
        } finally {
          setIsSyncingWeather(false);
        }
      },
      () => {
        setWeatherInput('Location permissions denied.');
        setIsSyncingWeather(false);
      }
    );
  };

  // Log Wear (CPW Tracker)
  const logGarmentWorn = async (garmentId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch('/api/items/wear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ garment_id: garmentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setWearLogs(prev => [...prev, data.log]);
        if (editingItem?.id === garmentId) fetchWearLogs();
      }
    } catch (err) {
      console.error('Failed to log wear event:', err);
    }
  };

  // Save AI Styling Outfit
  const saveStylistOutfit = async (name: string, itemIds: string[], stylingReasoning: string) => {
    setSavingOutfitIds(prev => [...prev, name]);
    try {
      const res = await fetch('/api/outfits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          item_ids: itemIds,
          styling_reasoning: stylingReasoning,
        }),
      });
      if (res.ok) {
        fetchSavedOutfits();
        alert(`Outfit "${name}" saved successfully!`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingOutfitIds(prev => prev.filter(n => n !== name));
    }
  };

  const deleteSavedOutfit = async (id: string) => {
    if (!confirm('Are you sure you want to delete this saved outfit?')) return;
    try {
      const res = await fetch(`/api/outfits?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSavedOutfits(prev => prev.filter(o => o.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Styling generation
  const [touchStartStylist, setTouchStartStylist] = useState<number | null>(null);
  const [touchCurrentStylist, setTouchCurrentStylist] = useState<number | null>(null);
  const [isSwipingStylist, setIsSwipingStylist] = useState(false);

  const handleGenerateStylist = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setStylingError('');
    setStylistResult(null);
    setCurrentOutfitIdx(0);

    try {
      const res = await fetch('/api/stylist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weather: weatherInput,
          event: eventInput,
          lookbook: lookbookInput,
          items: items,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Stylist processing failed.');

      setStylistResult(data.recommendations);
      fetchTelemetry();
    } catch (err: any) {
      console.error(err);
      setStylingError(err.message || 'Error occurred.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Bulk curation
  const handleBulkChangeStatus = async (status: Garment['status']) => {
    if (selectedItemIds.length === 0) return;
    try {
      const promises = selectedItemIds.map(id => 
        fetch('/api/items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status }),
        })
      );
      await Promise.all(promises);
      fetchItems();
      setSelectedItemIds([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItemIds.length === 0) return;
    if (!confirm(`Confirm bulk deletion of ${selectedItemIds.length} garments?`)) return;

    try {
      const promises = selectedItemIds.map(id => 
        fetch(`/api/items?id=${id}`, { method: 'DELETE' })
      );
      await Promise.all(promises);
      fetchItems();
      setSelectedItemIds([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const clearIngestGroups = () => {
    setIngestGroups([]);
  };

  const toggleSelectAllItems = () => {
    if (selectedItemIds.length === filteredItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map(item => item.id));
    }
  };

  const getItemWornCount = (id: string) => {
    return wearLogs.filter(l => l.garment_id === id).length;
  };

  const getItemCostPerWear = (item: Garment) => {
    const wears = getItemWornCount(item.id);
    if (wears === 0) return item.price || 0;
    return Number(((item.price || 0) / wears).toFixed(2));
  };

  const handleUpdateNotes = (groupId: string, notes: string) => {
    setIngestGroups(prev =>
      prev.map(g => g.id === groupId ? { ...g, notes } : g)
    );
  };

  // Speech helper
  const startSpeechNotes = (groupId: string) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => setSpeechActive(true);
    rec.onend = () => setSpeechActive(false);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setIngestGroups(prev =>
        prev.map(g => g.id === groupId ? { ...g, notes: g.notes ? g.notes + ' ' + text : text } : g)
      );
    };
    rec.onerror = () => setSpeechActive(false);
    rec.start();
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      (item.sub_category?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.brand?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.color_family?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.fabric_type?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.notes?.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="flex-1 flex flex-col bg-[#0b0c10] text-[#c5c6c7] min-h-screen">
      
      {/* HIDDEN FILE INPUT FOR DETAIL IMAGES */}
      <input 
        ref={detailFilePickerRef}
        type="file" 
        multiple
        accept="image/*"
        onChange={(e) => handleDetailFilesSelected(e.target.files)}
        className="hidden"
      />

      {/* HEADER */}
      <header className="sticky top-0 z-45 bg-[#0b0c10]/95 backdrop-blur-md border-b border-zinc-805 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 via-teal-400 to-emerald-400 flex items-center justify-center text-black font-extrabold text-sm tracking-tighter">
            AT
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Antigravity Threads <span className="text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full font-medium">v2.7</span>
            </h1>
          </div>
        </div>
        {telemetry && (
          <button 
            onClick={() => {
              setShowTelemetry(!showTelemetry);
              if (!showTelemetry) fetchTelemetry();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-750 transition"
          >
            📉 Cost Metrics: ${telemetry.totalCost}
          </button>
        )}
      </header>

      {/* CORE WORKSPACE */}
      <main className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6 mb-24 lg:mb-0">
        
        {/* DESKTOP SIDEBAR NAV */}
        <aside className="hidden lg:flex flex-col w-60 gap-2 pr-4 border-r border-zinc-805">
          <p className="text-[10px] tracking-widest uppercase font-bold text-zinc-500 px-3 mb-2">Navigation</p>
          <button
            onClick={() => setActiveTab('snap')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'snap' ? 'bg-gradient-to-r from-teal-500/10 to-indigo-500/10 text-teal-400 border-l-2 border-teal-400' : 'hover:bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Batch Ingest
          </button>
          
          <button
            onClick={() => setActiveTab('closet')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'closet' ? 'bg-gradient-to-r from-teal-500/10 to-indigo-500/10 text-teal-400 border-l-2 border-teal-400' : 'hover:bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            My Closet ({items.length})
          </button>

          <button
            onClick={() => setActiveTab('stylist')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'stylist' ? 'bg-gradient-to-r from-teal-500/10 to-indigo-500/10 text-teal-400 border-l-2 border-teal-400' : 'hover:bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            AI Stylist
          </button>
        </aside>

        {/* WORKSPACE AREA */}
        <section className="flex-1 min-w-0 space-y-6">
          
          {/* TAB 1: BATCH INGEST */}
          {activeTab === 'snap' && (
            <div className="space-y-6">
              
              <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-6 backdrop-blur-sm">
                <h2 className="text-base font-bold text-white mb-2">Relational Multi-Image Ingest Queue</h2>
                <p className="text-zinc-400 text-xs mb-6">
                  Select primary garment layout photos. Then, add detail shots (laundry tags, textures, sizing labels) under each card container. Gemini will synthesize the data concurrently to extract perfect tags.
                </p>

                <div className="space-y-6">
                  {/* Primary Dropzone */}
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-zinc-850 hover:border-teal-500/25 bg-[#0b0c10]/40 rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[100px]"
                  >
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      multiple 
                      accept="image/*" 
                      onChange={(e) => handleFilesSelected(e.target.files)}
                      className="hidden" 
                    />
                    <div className="flex flex-col items-center gap-1">
                      <svg className="w-7 h-7 text-zinc-550" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <span className="text-xs font-semibold text-white">Select Primary Garment Layout Photos</span>
                    </div>
                  </div>

                  {/* Grouped Ingest Cards */}
                  {ingestGroups.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-zinc-850">
                      <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
                        <span>Items Queue ({ingestGroups.length} items configured)</span>
                        <button onClick={clearIngestGroups} className="text-rose-400">Clear All</button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {ingestGroups.map((group) => (
                          <div key={group.id} className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl flex flex-col justify-between space-y-3">
                            <div className="space-y-2">
                              {/* Stack of thumbnails */}
                              <div className="flex items-center flex-wrap gap-2">
                                {group.files.map((file, fIdx) => (
                                  <div key={fIdx} className="relative w-12 h-12 rounded border border-zinc-800 bg-black overflow-hidden group shrink-0">
                                    <img src={URL.createObjectURL(file)} alt="" className="object-cover w-full h-full" />
                                    {fIdx === 0 && (
                                      <span className="absolute bottom-0 inset-x-0 bg-teal-400/90 text-black text-[7px] font-extrabold uppercase text-center py-0.5">Primary</span>
                                    )}
                                  </div>
                                ))}
                                <button 
                                  onClick={() => triggerAddDetail(group.id)}
                                  className="w-12 h-12 rounded border border-dashed border-zinc-700 hover:border-teal-500/35 bg-zinc-900/60 flex items-center justify-center text-zinc-500 hover:text-white transition"
                                  title="Add Tag Close-up or detail shot"
                                >
                                  + Detail
                                </button>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[8px] uppercase font-bold text-zinc-500">Staging notes (e.g. fit, location)</span>
                                <input 
                                  type="text"
                                  value={group.notes}
                                  onChange={(e) => handleUpdateNotes(group.id, e.target.value)}
                                  className="w-full text-[10px] bg-[#0b0c10] border border-zinc-850 rounded px-2 py-1 text-white focus:outline-none"
                                  placeholder="Brand details, sizing labels details..."
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] pt-2 border-t border-zinc-855">
                              <span className="text-zinc-500">Images: {group.files.length}</span>
                              <span className={`font-bold ${
                                group.status === 'done' ? 'text-teal-400' :
                                group.status === 'uploading' ? 'text-zinc-400 animate-pulse' :
                                group.status === 'processing' ? 'text-indigo-400 animate-pulse' :
                                group.status === 'failed' ? 'text-rose-500' : 'text-zinc-550'
                              }`}>{group.status.toUpperCase()}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={triggerBatchUpload}
                        disabled={isProcessingBatch}
                        className="w-full py-2 bg-teal-400 text-black font-bold text-xs rounded-lg hover:bg-teal-300 transition"
                      >
                        {isProcessingBatch ? 'Running Pipeline Workers...' : 'Start Ingest Pipeline'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* SPLIT VALIDATION PANEL */}
              {validationTarget && (
                <>
                  {/* Desktop Validation View (Hidden on mobile) */}
                  <div className="hidden md:block border border-zinc-850 bg-[#1f2833]/10 rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse"></span>
                      Interactive Validation Workspace
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col items-center justify-center p-4 bg-zinc-950/40 rounded-xl border border-zinc-850">
                        <div className="relative w-44 h-44 flex items-center justify-center">
                          <img 
                            src={validationTarget.primary_image_url || ''} 
                            alt="Garment preview" 
                            className="object-contain w-full h-full mix-blend-lighten filter saturate-[1.1] contrast-[1.05]"
                          />
                        </div>
                        
                        {/* Secondary thumbnails view */}
                        <div className="flex items-center gap-1.5 mt-4 overflow-x-auto max-w-xs py-1">
                          {validationTarget.images.map((img) => (
                            <div key={img.id} className="w-9 h-9 border border-zinc-800 rounded overflow-hidden shrink-0 bg-black">
                              <img src={img.storage_path} alt="" className="object-cover w-full h-full" />
                            </div>
                          ))}
                        </div>
                      </div>

                      <form onSubmit={handleConfirmValidation} className="space-y-3.5">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-500">Category</label>
                            <select
                              value={validationTarget.category}
                              onChange={(e) => setValidationTarget({ ...validationTarget, category: e.target.value })}
                              className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                            >
                              <option value="Tops">Tops</option>
                              <option value="Bottoms">Bottoms</option>
                              <option value="Outerwear">Outerwear</option>
                              <option value="Footwear">Footwear</option>
                              <option value="Tailoring">Tailoring</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-500">Sub-Category</label>
                            <input
                              type="text"
                              value={validationTarget.sub_category}
                              onChange={(e) => setValidationTarget({ ...validationTarget, sub_category: e.target.value })}
                              className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-500">Color Family</label>
                            <input
                              type="text"
                              value={validationTarget.color_family}
                              onChange={(e) => setValidationTarget({ ...validationTarget, color_family: e.target.value })}
                              className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-500">Brand</label>
                            <input
                              type="text"
                              value={validationTarget.brand || ''}
                              onChange={(e) => setValidationTarget({ ...validationTarget, brand: e.target.value || null })}
                              className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-500">Purchase Price ($)</label>
                            <input
                              type="number"
                              value={validationTarget.price || 0}
                              onChange={(e) => setValidationTarget({ ...validationTarget, price: Number(e.target.value) })}
                              className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-500">Fabric</label>
                            <input
                              type="text"
                              value={validationTarget.fabric_type || ''}
                              onChange={(e) => setValidationTarget({ ...validationTarget, fabric_type: e.target.value })}
                              className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-850">
                          <button
                            type="button"
                            onClick={() => setValidationTarget(null)}
                            className="px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg text-xs font-semibold"
                          >
                            Skip
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 bg-teal-400 text-black hover:bg-teal-300 rounded-lg text-xs font-bold"
                          >
                            ✔ Confirm & Save to Closet
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>

                  {/* Mobile Ergonomic Thumb-Zone & Gestures View */}
                  <div className="md:hidden fixed inset-0 z-[100] h-screen w-screen overflow-hidden bg-zinc-950 select-none flex flex-col">
                    {/* Visual drag glow indicators */}
                    <div 
                      className="absolute inset-0 pointer-events-none transition-opacity duration-200"
                      style={{
                        background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
                        opacity: isSwiping && touchCurrent !== null && touchStart !== null && (touchCurrent - touchStart) > 0
                          ? Math.min((touchCurrent - touchStart) / 150, 1)
                          : 0
                      }}
                    />
                    <div 
                      className="absolute inset-0 pointer-events-none transition-opacity duration-200"
                      style={{
                        background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.15) 0%, transparent 70%)',
                        opacity: isSwiping && touchCurrent !== null && touchStart !== null && (touchCurrent - touchStart) < 0
                          ? Math.min(Math.abs(touchCurrent - touchStart) / 150, 1)
                          : 0
                      }}
                    />

                    {/* Top 50%: Bounded non-interactive visual cutout card */}
                    <div 
                      className="h-[43vh] w-full flex flex-col items-center justify-center relative p-6 mt-2"
                      onTouchStart={(e) => {
                        setTouchStart(e.touches[0].clientX);
                        setIsSwiping(true);
                      }}
                      onTouchMove={(e) => {
                        if (touchStart === null) return;
                        setTouchCurrent(e.touches[0].clientX);
                      }}
                      onTouchEnd={async () => {
                        if (touchStart !== null && touchCurrent !== null) {
                          const diff = touchCurrent - touchStart;
                          if (diff > 70) {
                            await handleConfirmValidationMobile('Active');
                          } else if (diff < -70) {
                            await handleConfirmValidationMobile('Donate');
                          }
                        }
                        setTouchStart(null);
                        setTouchCurrent(null);
                        setIsSwiping(false);
                      }}
                    >
                      <div 
                        className="w-56 h-56 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex flex-col items-center justify-center shadow-xl relative overflow-hidden transition-all duration-300 active:scale-95"
                        style={{
                          transform: isSwiping && touchCurrent !== null && touchStart !== null
                            ? `translateX(${touchCurrent - touchStart}px) rotate(${(touchCurrent - touchStart) * 0.08}deg)`
                            : 'translateX(0px) rotate(0deg)',
                          transition: isSwiping ? 'none' : 'transform 0.3s ease-out'
                        }}
                      >
                        <img 
                          src={validationTarget.primary_image_url || ''} 
                          alt="Garment preview" 
                          className="object-contain w-36 h-36 mix-blend-lighten filter saturate-[1.1] contrast-[1.05]"
                        />
                        
                        {/* Overlay text actions */}
                        {isSwiping && touchCurrent !== null && touchStart !== null && (touchCurrent - touchStart) > 20 && (
                          <div className="absolute top-4 right-4 bg-emerald-500 text-zinc-950 font-black text-xs px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">
                            Save
                          </div>
                        )}
                        {isSwiping && touchCurrent !== null && touchStart !== null && (touchCurrent - touchStart) < -20 && (
                          <div className="absolute top-4 left-4 bg-red-500 text-white font-black text-xs px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">
                            Discard
                          </div>
                        )}
                      </div>

                      <div className="text-zinc-500 text-[9px] mt-4 uppercase tracking-widest font-black flex items-center gap-1.5 animate-pulse">
                        Swipe Left to Discard • Swipe Right to Save
                      </div>
                    </div>

                    {/* Bottom 50%: Sticky Bottom Sheet anchored under thumb */}
                    <div className="h-[57vh] bg-[#0b0c10]/95 border-t border-zinc-800 rounded-t-3xl p-6 flex flex-col justify-between shadow-2xl relative z-10 select-none pb-8">
                      {/* Drag handle */}
                      <div className="w-12 h-1 bg-zinc-850 rounded-full mx-auto mb-4" />

                      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-none">
                        
                        {/* Category selection - static option pills matrix */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Category</span>
                          <div className="flex flex-wrap gap-2">
                            {['Tops', 'Bottoms', 'Outerwear', 'Footwear', 'Tailoring'].map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                style={{ minHeight: '44px' }}
                                onClick={() => setValidationTarget({ ...validationTarget, category: cat })}
                                className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                                  validationTarget.category === cat 
                                    ? 'bg-teal-400 text-zinc-950 border-teal-400 shadow-md scale-105' 
                                    : 'bg-zinc-900/60 text-zinc-400 border-zinc-850 hover:text-white'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Subcategory Input */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Sub-Category</span>
                          <input
                            type="text"
                            value={validationTarget.sub_category}
                            onChange={(e) => setValidationTarget({ ...validationTarget, sub_category: e.target.value })}
                            className="w-full bg-zinc-900/60 border border-zinc-850 rounded-xl p-3.5 text-xs text-white placeholder-zinc-600 focus:border-teal-400 outline-none"
                            placeholder="e.g. Linen Shirt, Chinos, Boots"
                          />
                        </div>

                        {/* Fits and Tonal Values matrix */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Tonal Value</span>
                            <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                              {['Light', 'Medium', 'Dark'].map((tonal) => (
                                <button
                                  key={tonal}
                                  type="button"
                                  style={{ minHeight: '40px' }}
                                  onClick={() => setValidationTarget({ ...validationTarget, tonal_value: tonal as any })}
                                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all shrink-0 ${
                                    validationTarget.tonal_value === tonal 
                                      ? 'bg-white text-zinc-950 border-white font-bold' 
                                      : 'bg-zinc-900/60 text-zinc-400 border-zinc-850'
                                  }`}
                                >
                                  {tonal}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Fit Block</span>
                            <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                              {['Slim', 'Regular', 'Relaxed', 'Tailored'].map((fit) => (
                                <button
                                  key={fit}
                                  type="button"
                                  style={{ minHeight: '40px' }}
                                  onClick={() => setValidationTarget({ ...validationTarget, fit_block: fit })}
                                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all shrink-0 ${
                                    validationTarget.fit_block === fit 
                                      ? 'bg-white text-zinc-950 border-white font-bold' 
                                      : 'bg-zinc-900/60 text-zinc-400 border-zinc-850'
                                  }`}
                                >
                                  {fit}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Fabric types matrix */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Fabric Type</span>
                          <div className="flex gap-2 overflow-x-auto scrollbar-none py-1">
                            {['Linen', 'Denim', 'Knitwear', 'Wool', 'Cotton', 'Silk', 'Leather'].map((fab) => (
                              <button
                                key={fab}
                                type="button"
                                style={{ minHeight: '40px' }}
                                onClick={() => setValidationTarget({ ...validationTarget, fabric_type: fab })}
                                className={`px-4 py-2 text-xs font-semibold rounded-xl border shrink-0 transition-all ${
                                  validationTarget.fabric_type === fab 
                                    ? 'bg-teal-400 text-zinc-950 border-teal-400 font-bold' 
                                    : 'bg-zinc-900/60 text-zinc-400 border-zinc-850'
                                }`}
                              >
                                {fab}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Brand & Price input */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Brand</span>
                            <input
                              type="text"
                              value={validationTarget.brand || ''}
                              onChange={(e) => setValidationTarget({ ...validationTarget, brand: e.target.value || null })}
                              className="w-full bg-zinc-900/60 border border-zinc-850 rounded-xl p-3.5 text-xs text-white placeholder-zinc-600 focus:border-teal-400 outline-none"
                              placeholder="Brand name"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Est. Price ($)</span>
                            <input
                              type="number"
                              value={validationTarget.price || ''}
                              onChange={(e) => setValidationTarget({ ...validationTarget, price: Number(e.target.value) })}
                              className="w-full bg-zinc-900/60 border border-zinc-850 rounded-xl p-3.5 text-xs text-white placeholder-zinc-600 focus:border-teal-400 outline-none"
                              placeholder="Price"
                            />
                          </div>
                        </div>

                      </div>

                      {/* Controls action baseline buttons */}
                      <div className="pt-4 border-t border-zinc-850 flex gap-3">
                        <button
                          type="button"
                          onClick={() => setValidationTarget(null)}
                          className="w-1/4 py-3.5 text-xs font-bold bg-zinc-900 text-zinc-400 rounded-xl active:scale-[0.97] transition-all border border-zinc-850"
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmValidationMobile('Active')}
                          className="w-3/4 py-3.5 text-xs font-black bg-teal-400 text-zinc-950 rounded-xl active:scale-[0.97] transition-all shadow-lg uppercase tracking-wider"
                        >
                          Save to Closet
                        </button>
                      </div>

                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: MY CLOSET */}
          {activeTab === 'closet' && (
            <div className="space-y-6">
              
              <div className="flex border-b border-zinc-800 gap-6">
                <button
                  onClick={() => setClosetSubTab('items')}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition ${
                    closetSubTab === 'items' ? 'border-b-2 border-teal-400 text-teal-400' : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  Garments ({items.length})
                </button>
                <button
                  onClick={() => setClosetSubTab('outfits')}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition ${
                    closetSubTab === 'outfits' ? 'border-b-2 border-teal-400 text-teal-400' : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  Saved Outfits ({savedOutfits.length})
                </button>
              </div>

              {closetSubTab === 'items' && (
                <div className="space-y-6">
                  {/* Filters bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border border-zinc-800 bg-[#1f2833]/10 rounded-2xl">
                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="Search items, brands, materials..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#0b0c10]/80 text-xs border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none"
                      />
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-300"
                      >
                        <option value="All">All Categories</option>
                        <option value="Tops">Tops</option>
                        <option value="Bottoms">Bottoms</option>
                        <option value="Outerwear">Outerwear</option>
                        <option value="Footwear">Footwear</option>
                        <option value="Tailoring">Tailoring</option>
                      </select>

                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-300"
                      >
                        <option value="All">All Statuses</option>
                        <option value="Active">Active Closet</option>
                        <option value="Archive">Archive (Doesn't Fit)</option>
                        <option value="Donate">Pending Donate</option>
                        <option value="Processing">Processing...</option>
                      </select>

                      <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-850">
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`p-1.5 rounded transition ${viewMode === 'grid' ? 'bg-zinc-800 text-teal-400' : 'text-zinc-500'}`}
                        >
                          Grid
                        </button>
                        <button
                          onClick={() => setViewMode('matrix')}
                          className={`p-1.5 rounded transition ${viewMode === 'matrix' ? 'bg-zinc-800 text-teal-400' : 'text-zinc-500'}`}
                        >
                          Matrix
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Grid View */}
                  {loadingItems ? (
                    <div className="text-center py-12"><p className="text-zinc-500 text-xs">Loading items...</p></div>
                  ) : filteredItems.length === 0 ? (
                    <div className="text-center py-12 border border-zinc-800/40 border-dashed rounded-xl bg-zinc-900/10">
                      <p className="text-zinc-500 text-xs">No matching garments found.</p>
                    </div>
                  ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {filteredItems.map((item) => (
                        <div 
                          key={item.id}
                          onClick={() => setEditingItem(item)}
                          className="group relative border border-zinc-800/50 bg-[#1f2833]/15 rounded-xl overflow-hidden hover:border-zinc-700 cursor-pointer flex flex-col transition"
                        >
                          <input 
                            type="checkbox"
                            checked={selectedItemIds.includes(item.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleSelectItem(item.id);
                            }}
                            className="absolute top-2.5 right-2.5 z-10 w-4 h-4 rounded border-zinc-800 accent-teal-400"
                          />

                          <div className="relative w-full aspect-square bg-black border-b border-zinc-850 flex items-center justify-center">
                            {item.primary_image_url ? (
                              <img src={item.primary_image_url} alt="" className="object-cover w-full h-full" />
                            ) : (
                              <div className="text-[10px] text-zinc-500">No Image</div>
                            )}
                            
                            {item.images && item.images.length > 1 && (
                              <span className="absolute bottom-2 right-2 bg-black/75 px-1.5 py-0.5 rounded text-[8px] font-bold text-teal-400">
                                📷 {item.images.length}
                              </span>
                            )}

                            {item.status === 'Processing' && (
                              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                <div className="w-3.5 h-3.5 border-2 border-t-teal-400 border-zinc-850 rounded-full animate-spin"></div>
                              </div>
                            )}
                          </div>

                          <div className="p-3 space-y-1">
                            <div className="flex items-center justify-between text-[8px] uppercase font-extrabold text-zinc-500">
                              <span>{item.sub_category}</span>
                              {getItemWornCount(item.id) > 0 && (
                                <span className="text-teal-400">Worn {getItemWornCount(item.id)}x</span>
                              )}
                            </div>
                            <h4 className="text-xs font-bold text-white truncate">{item.brand ? `${item.brand} ` : ''}{item.color_family}</h4>
                            <div className="flex items-center justify-between text-[9px] text-zinc-400 pt-1 border-t border-zinc-800/50 mt-1">
                              <span>CPW: <strong className="text-zinc-200">${getItemCostPerWear(item)}</strong></span>
                              <button
                                onClick={(e) => logGarmentWorn(item.id, e)}
                                className="text-teal-400 hover:text-teal-300 font-bold"
                              >
                                + Log Wear
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Matrix View */
                    <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-xl overflow-hidden overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[700px] text-xs">
                        <thead>
                          <tr className="border-b border-zinc-850 bg-zinc-900/60 font-semibold text-zinc-400">
                            <th className="p-3 w-10 text-center">
                              <input 
                                type="checkbox"
                                checked={selectedItemIds.length === filteredItems.length}
                                onChange={toggleSelectAllItems}
                                className="w-4 h-4 rounded border-zinc-800 bg-[#0b0c10] accent-teal-400 cursor-pointer"
                              />
                            </th>
                            <th className="p-3 w-14">Preview</th>
                            <th className="p-3">Garment</th>
                            <th className="p-3">Category</th>
                            <th className="p-3">Specs (Fabric/Fit)</th>
                            <th className="p-3 w-16">Price</th>
                            <th className="p-3 w-16">Worn</th>
                            <th className="p-3 w-20">CPW</th>
                            <th className="p-3 w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850 bg-transparent">
                          {filteredItems.map((item) => (
                            <tr 
                              key={item.id}
                              onClick={() => setEditingItem(item)}
                              className="hover:bg-zinc-800/20 cursor-pointer transition text-zinc-300"
                            >
                              <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox"
                                  checked={selectedItemIds.includes(item.id)}
                                  onChange={() => handleSelectItem(item.id)}
                                  className="w-4 h-4 rounded border-zinc-800 bg-[#0b0c10] accent-teal-400 cursor-pointer"
                                />
                              </td>
                              <td className="p-2">
                                <div className="w-9 h-9 rounded border border-zinc-800 overflow-hidden bg-black">
                                  {item.primary_image_url && (
                                    <img src={item.primary_image_url} alt="" className="object-cover w-full h-full" />
                                  )}
                                </div>
                              </td>
                              <td className="p-3 font-semibold text-white">
                                {item.brand ? `${item.brand} ` : ''}{item.color_family} {item.sub_category}
                              </td>
                              <td className="p-3">{item.category}</td>
                              <td className="p-3 text-zinc-400">{item.fabric_type || 'N/A'} • {item.fit_block || 'N/A'}</td>
                              <td className="p-3 font-mono">${item.price || '0.00'}</td>
                              <td className="p-3 text-center font-bold text-teal-400">{getItemWornCount(item.id)}x</td>
                              <td className="p-3 font-mono text-teal-300 font-bold">${getItemCostPerWear(item)}</td>
                              <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => logGarmentWorn(item.id)}
                                  className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 transition font-bold"
                                >
                                  + Wear
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Bulk bar */}
                  {selectedItemIds.length > 0 && (
                    <div className="fixed bottom-16 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#1f2833] border border-zinc-700 shadow-2xl rounded-full px-5 py-3 text-xs font-semibold text-white">
                      <span>Selected {selectedItemIds.length} items:</span>
                      <div className="h-4 w-[1px] bg-zinc-750"></div>
                      <button onClick={() => handleBulkChangeStatus('Active')} className="text-teal-400">Keep</button>
                      <button onClick={() => handleBulkChangeStatus('Archive')} className="text-amber-400">Archive</button>
                      <button onClick={() => handleBulkChangeStatus('Donate')} className="text-indigo-400">Donate</button>
                      <div className="h-4 w-[1px] bg-zinc-750"></div>
                      <button onClick={handleBulkDelete} className="text-rose-400">Delete</button>
                    </div>
                  )}
                </div>
              )}

              {/* SAVED OUTFITS SUB-TAB */}
              {closetSubTab === 'outfits' && (
                <div className="space-y-6">
                  {loadingOutfits ? (
                    <div className="text-center py-12"><p className="text-zinc-500 text-xs">Loading outfits...</p></div>
                  ) : savedOutfits.length === 0 ? (
                    <div className="text-center py-12 border border-zinc-800/40 border-dashed rounded-xl bg-zinc-900/10">
                      <p className="text-zinc-500 text-xs">No saved outfits yet. Generate some in the AI Stylist tab!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {savedOutfits.map((outfit) => {
                        const outfitItems = outfit.item_ids
                          .map(id => items.find(item => item.id === id))
                          .filter((item): item is Garment => !!item);

                        return (
                          <div key={outfit.id} className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                            <div>
                              <div className="flex justify-between items-start mb-3">
                                <h3 className="text-sm font-bold text-white">{outfit.name}</h3>
                                <button 
                                  onClick={() => deleteSavedOutfit(outfit.id)}
                                  className="text-xs font-semibold text-rose-400 hover:text-rose-300"
                                >
                                  Delete
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-2 mb-3">
                                {outfitItems.map(oi => (
                                  <div key={oi.id} className="border border-zinc-800 bg-black rounded-lg overflow-hidden flex flex-col">
                                    <div className="relative aspect-square w-full">
                                      <img src={oi.primary_image_url || ''} alt="" className="object-cover w-full h-full" />
                                    </div>
                                    <div className="p-1 text-center bg-zinc-950">
                                      <p className="text-[8px] font-bold text-zinc-400 truncate">{oi.sub_category}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {outfit.styling_reasoning && (
                                <p className="text-xs text-zinc-400 leading-relaxed">{outfit.styling_reasoning}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI STYLIST */}
          {activeTab === 'stylist' && (
            <div className="space-y-6">
              <div className="border border-zinc-800 bg-[#1f2833]/20 rounded-2xl p-6 backdrop-blur-sm">
                <h2 className="text-base font-bold text-white mb-2">Automated AI Stylist</h2>
                <p className="text-zinc-400 text-xs mb-6">
                  Sync weather parameters, pick a preset, and let Gemini compile clothes based on your lookbook constraints.
                </p>

                <form onSubmit={handleGenerateStylist} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-400 flex items-center justify-between">
                        <span>Weather Conditions</span>
                        <button
                          type="button"
                          onClick={syncLocalWeather}
                          disabled={isSyncingWeather}
                          className="text-[9px] text-teal-400 uppercase"
                        >
                          ⚡ {isSyncingWeather ? 'Syncing...' : 'Sync Weather'}
                        </button>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Temp: 72°F | Precipitation: 0% | Conditions: Sunny"
                        value={weatherInput}
                        onChange={(e) => setWeatherInput(e.target.value)}
                        className="w-full bg-[#0b0c10]/80 text-xs border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-400">Event / Vibe</label>
                      <input
                        type="text"
                        placeholder="e.g. Smart casual dinner, office meeting"
                        value={eventInput}
                        onChange={(e) => setEventInput(e.target.value)}
                        className="w-full bg-[#0b0c10]/80 text-xs border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-zinc-500">Event Presets</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '💼 Corporate Casual', text: 'Smart business casual meeting' },
                        { label: '🍕 Weekend Lounge', text: 'Relaxed weekend lounge hang' },
                        { label: '🍷 Date Night', text: 'Sleek dark nighttime dinner date' },
                        { label: '✈️ Travel / Packing', text: 'Comfortable lightweight layered travel wear' }
                      ].map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setEventInput(preset.text)}
                          className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-850 text-[10px] text-zinc-400 hover:text-white"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-zinc-400">Lookbook / Aesthetic Vibe</label>
                    <input
                      type="text"
                      placeholder="e.g. Warm minimal capsule, tailored shapes, high contrast"
                      value={lookbookInput}
                      onChange={(e) => setLookbookInput(e.target.value)}
                      className="w-full bg-[#0b0c10]/80 text-xs border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-xs text-rose-400">{stylingError}</span>
                    <button
                      type="submit"
                      disabled={isGenerating}
                      className="px-5 py-2 rounded-xl bg-teal-400 text-black font-semibold text-xs hover:bg-teal-300 transition"
                    >
                      {isGenerating ? 'Designing...' : 'Generate Outfits'}
                    </button>
                  </div>
                </form>
              </div>

              {/* RESULT */}
              {stylistResult && (
                <div className="space-y-6">
                  {/* Desktop Layout (Hidden on mobile) */}
                  <div className="hidden md:block space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {stylistResult.outfits.map((outfit, idx) => {
                        const outfitItems = outfit.item_ids
                          .map(id => items.find(item => item.id === id))
                          .filter((item): item is Garment => !!item);

                        return (
                          <div key={idx} className="border border-zinc-850 bg-[#1f2833]/10 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                            <div>
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-[9px] uppercase font-extrabold tracking-wider bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded">Option {idx + 1}</span>
                                <button
                                  onClick={() => saveStylistOutfit(outfit.name, outfit.item_ids, outfit.styling_reasoning)}
                                  disabled={savingOutfitIds.includes(outfit.name)}
                                  className="text-xs text-teal-400 hover:text-teal-300 font-bold"
                                >
                                  {savingOutfitIds.includes(outfit.name) ? 'Saving...' : '💾 Save Outfit'}
                                </button>
                              </div>
                              <h3 className="text-sm font-bold text-white mb-3">{outfit.name}</h3>

                              <div className="grid grid-cols-3 gap-2 mb-3">
                                {outfitItems.map(oi => (
                                  <div key={oi.id} className="border border-zinc-800 bg-black rounded-lg overflow-hidden">
                                    <img src={oi.primary_image_url || ''} alt="" className="object-cover w-full aspect-square" />
                                  </div>
                                ))}
                              </div>

                              <p className="text-xs text-zinc-400 leading-relaxed">{outfit.styling_reasoning}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2 border border-amber-500/15 bg-amber-500/5 rounded-2xl p-5">
                        <h4 className="text-xs font-bold text-amber-400 mb-2">⚠️ Lookbook Wardrobe Gaps</h4>
                        <p className="text-xs text-zinc-300 leading-relaxed">{stylistResult.gap_analysis}</p>
                      </div>

                      <div className="border border-zinc-850 bg-[#1f2833]/15 rounded-2xl p-5 text-xs">
                        <h4 className="text-xs font-bold text-teal-400 mb-2">Styling Tips</h4>
                        <ul className="space-y-1 list-disc pl-4 text-zinc-400">
                          {stylistResult.general_tips.map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Layout (Interactive Swipe Card Stack) */}
                  <div className="md:hidden space-y-6">
                    {currentOutfitIdx < stylistResult.outfits.length ? (
                      (() => {
                        const outfit = stylistResult.outfits[currentOutfitIdx];
                        const outfitItems = outfit.item_ids
                          .map(id => items.find(item => item.id === id))
                          .filter((item): item is Garment => !!item);

                        return (
                          <div className="relative min-h-[50vh] flex flex-col justify-between">
                            {/* Visual swipe glows */}
                            <div 
                              className="absolute inset-0 pointer-events-none transition-opacity duration-200 z-0"
                              style={{
                                background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.1) 0%, transparent 70%)',
                                opacity: isSwipingStylist && touchCurrentStylist !== null && touchStartStylist !== null && (touchCurrentStylist - touchStartStylist) > 0
                                  ? Math.min((touchCurrentStylist - touchStartStylist) / 150, 1)
                                  : 0
                              }}
                            />
                            <div 
                              className="absolute inset-0 pointer-events-none transition-opacity duration-200 z-0"
                              style={{
                                background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.1) 0%, transparent 70%)',
                                opacity: isSwipingStylist && touchCurrentStylist !== null && touchStartStylist !== null && (touchCurrentStylist - touchStartStylist) < 0
                                  ? Math.min(Math.abs(touchCurrentStylist - touchStartStylist) / 150, 1)
                                  : 0
                              }}
                            />

                            {/* Swipeable card */}
                            <div
                              onTouchStart={(e) => {
                                setTouchStartStylist(e.touches[0].clientX);
                                setIsSwipingStylist(true);
                              }}
                              onTouchMove={(e) => {
                                if (touchStartStylist === null) return;
                                setTouchCurrentStylist(e.touches[0].clientX);
                              }}
                              onTouchEnd={async () => {
                                if (touchStartStylist !== null && touchCurrentStylist !== null) {
                                  const diff = touchCurrentStylist - touchStartStylist;
                                  if (diff > 70) {
                                    // Save Outfit
                                    await saveStylistOutfit(outfit.name, outfit.item_ids, outfit.styling_reasoning);
                                    setCurrentOutfitIdx(prev => prev + 1);
                                  } else if (diff < -70) {
                                    // Pass Outfit
                                    setCurrentOutfitIdx(prev => prev + 1);
                                  }
                                }
                                setTouchStartStylist(null);
                                setTouchCurrentStylist(null);
                                setIsSwipingStylist(false);
                              }}
                              className="w-full bg-[#1f2833]/15 border border-zinc-800 rounded-3xl p-5 shadow-2xl relative z-10 transition-transform flex flex-col justify-between space-y-4"
                              style={{
                                transform: isSwipingStylist && touchCurrentStylist !== null && touchStartStylist !== null
                                  ? `translateX(${touchCurrentStylist - touchStartStylist}px) rotate(${(touchCurrentStylist - touchStartStylist) * 0.05}deg)`
                                  : 'translateX(0px) rotate(0deg)',
                                transition: isSwipingStylist ? 'none' : 'transform 0.3s ease-out'
                              }}
                            >
                              <div>
                                <div className="flex justify-between items-center mb-3">
                                  <span className="text-[8px] uppercase font-black tracking-wider bg-teal-400 text-zinc-950 px-2 py-0.5 rounded-full">
                                    Option {currentOutfitIdx + 1} of {stylistResult.outfits.length}
                                  </span>
                                  <span className="text-[9px] text-zinc-500 uppercase font-bold animate-pulse">
                                    ← Swipe to Pass • Save to Swipe →
                                  </span>
                                </div>
                                <h3 className="text-base font-black text-white">{outfit.name}</h3>
                              </div>

                              {/* Constituents grid (Large polaroid thumbs) */}
                              <div className="grid grid-cols-3 gap-2">
                                {outfitItems.map(oi => (
                                  <div key={oi.id} className="border border-zinc-800 bg-black rounded-2xl overflow-hidden aspect-square flex items-center justify-center p-1.5 shadow-md relative">
                                    <img src={oi.primary_image_url || ''} alt="" className="object-contain w-full h-full mix-blend-lighten" />
                                    <span className="absolute bottom-1 inset-x-1 bg-zinc-900/80 text-[7px] font-bold text-center text-zinc-400 py-0.5 rounded-md truncate">
                                      {oi.sub_category}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-950/40 p-3.5 border border-zinc-850 rounded-2xl">
                                {outfit.styling_reasoning}
                              </p>

                              {/* Thumb-friendly baseline buttons */}
                              <div className="flex gap-3 pt-2">
                                <button
                                  type="button"
                                  onClick={() => setCurrentOutfitIdx(prev => prev + 1)}
                                  className="w-1/3 py-3 text-xs font-bold bg-zinc-900 text-zinc-500 border border-zinc-850 rounded-xl active:scale-95 transition"
                                >
                                  Pass
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await saveStylistOutfit(outfit.name, outfit.item_ids, outfit.styling_reasoning);
                                    setCurrentOutfitIdx(prev => prev + 1);
                                  }}
                                  disabled={savingOutfitIds.includes(outfit.name)}
                                  className="w-2/3 py-3 text-xs font-black bg-teal-400 text-zinc-950 rounded-xl active:scale-95 transition shadow-lg"
                                >
                                  {savingOutfitIds.includes(outfit.name) ? 'Saving...' : '💾 Save Outfit'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="space-y-4 animate-fade-in">
                        <div className="border border-amber-500/15 bg-amber-500/5 rounded-2xl p-5">
                          <h4 className="text-xs font-bold text-amber-400 mb-2">⚠️ Lookbook Wardrobe Gaps</h4>
                          <p className="text-xs text-zinc-300 leading-relaxed">{stylistResult.gap_analysis}</p>
                        </div>

                        <div className="border border-zinc-850 bg-[#1f2833]/15 rounded-2xl p-5 text-xs">
                          <h4 className="text-xs font-bold text-teal-400 mb-2">Styling Tips</h4>
                          <ul className="space-y-2 list-disc pl-4 text-zinc-400">
                            {stylistResult.general_tips.map((t, i) => <li key={i}>{t}</li>)}
                          </ul>
                        </div>

                        <button
                          type="button"
                          onClick={() => setCurrentOutfitIdx(0)}
                          className="w-full py-3.5 text-xs font-bold bg-zinc-900 text-white rounded-xl border border-zinc-800"
                        >
                          🔄 Review Swiped Outfits
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </section>
      </main>

      {/* TELEMETRY DRAWER */}
      {showTelemetry && telemetry && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#1f2833] border-t border-zinc-800 shadow-2xl p-6 max-h-[45vh] overflow-y-auto animate-slide-up">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              📊 System Telemetry & Cost Accounting Ledger
            </h3>
            <button onClick={() => setShowTelemetry(false)} className="text-zinc-400 hover:text-white">✕</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-zinc-500">Cumulative API Cost</span>
              <p className="text-2xl font-black text-emerald-400 font-mono mt-1">${telemetry.totalCost}</p>
            </div>
            <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-zinc-500">Prompt Tokens (In)</span>
              <p className="text-2xl font-black text-white font-mono mt-1">{telemetry.totalTokensIn.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-zinc-500">Candidates Tokens (Out)</span>
              <p className="text-2xl font-black text-white font-mono mt-1">{telemetry.totalTokensOut.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-zinc-400">Transactions Ledger (Latency & Cost)</h4>
            <div className="border border-zinc-855 bg-zinc-950/20 rounded-xl overflow-hidden overflow-x-auto text-[10px] font-mono">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-850 bg-zinc-900/60 text-zinc-400">
                    <th className="p-2">Timestamp</th>
                    <th className="p-2">Service</th>
                    <th className="p-2">Tokens In/Out</th>
                    <th className="p-2">Est. Cost</th>
                    <th className="p-2">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850">
                  {telemetryLogs.map((log) => (
                    <tr key={log.id} className="text-zinc-300">
                      <td className="p-2">{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td className="p-2 text-teal-400 font-bold">{log.service}</td>
                      <td className="p-2">{log.tokens_in} / {log.tokens_out}</td>
                      <td className="p-2 text-emerald-400 font-bold">${log.estimated_cost}</td>
                      <td className="p-2">{log.latency_ms || 120}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EDITING DIALOG MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#1f2833] border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white">Edit Garment Curation</h3>
              <button onClick={() => setEditingItem(null)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsSavingEdit(true);
              try {
                const res = await fetch('/api/items', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(editingItem),
                });
                if (res.ok) {
                  const data = await res.json();
                  setItems(prev => prev.map(i => i.id === data.item.id ? data.item : i));
                  setEditingItem(null);
                }
              } catch (err) {
                console.error(err);
              } finally {
                setIsSavingEdit(false);
              }
            }} className="space-y-3">
              
              <div className="relative w-32 h-32 mx-auto rounded-lg overflow-hidden border border-zinc-700 bg-black flex items-center justify-center">
                {editingItem.primary_image_url && (
                  <img src={editingItem.primary_image_url} alt="" className="object-contain w-full h-full" />
                )}
              </div>

              {/* Thumbnails list in editor */}
              <div className="flex justify-center gap-1.5 overflow-x-auto py-1">
                {editingItem.images.map((img) => (
                  <div key={img.id} className="relative w-9 h-9 border border-zinc-800 rounded overflow-hidden bg-black shrink-0">
                    <img src={img.storage_path} alt="" className="object-cover w-full h-full" />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-505">Category</label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="Tops">Tops</option>
                    <option value="Bottoms">Bottoms</option>
                    <option value="Outerwear">Outerwear</option>
                    <option value="Footwear">Footwear</option>
                    <option value="Tailoring">Tailoring</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-505">Status</label>
                  <select
                    value={editingItem.status}
                    onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value as any })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="Active">Active Closet</option>
                    <option value="Archive">Archive (Doesn't Fit)</option>
                    <option value="Donate">Pending Donate</option>
                    <option value="Discard">Discard / Sell</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Sub-Category</label>
                  <input
                    type="text"
                    value={editingItem.sub_category}
                    onChange={(e) => setEditingItem({ ...editingItem, sub_category: e.target.value })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Brand</label>
                  <input
                    type="text"
                    value={editingItem.brand || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, brand: e.target.value || null })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Purchase Price ($)</label>
                  <input
                    type="number"
                    value={editingItem.price || 0}
                    onChange={(e) => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Fabric</label>
                  <input
                    type="text"
                    value={editingItem.fabric_type || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, fabric_type: e.target.value || null })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Fit Block</label>
                  <input
                    type="text"
                    value={editingItem.fit_block || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, fit_block: e.target.value || null })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Color Family</label>
                  <input
                    type="text"
                    value={editingItem.color_family}
                    onChange={(e) => setEditingItem({ ...editingItem, color_family: e.target.value })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="space-y-1 border-t border-zinc-800 pt-2.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Curation Actions</span>
                <div className="flex gap-2 items-center justify-between text-xs text-zinc-400 mt-1">
                  <span>Wears logged: <strong className="text-white">{getItemWornCount(editingItem.id)}x</strong></span>
                  <button
                    type="button"
                    onClick={() => logGarmentWorn(editingItem.id)}
                    className="px-3 py-1 rounded bg-teal-400 text-black font-bold text-xs"
                  >
                    + Log Wear Today
                  </button>
                </div>
              </div>

              <div className="flex justify-between pt-3 border-t border-zinc-800 mt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Confirm deletion?')) return;
                    try {
                      const res = await fetch(`/api/items?id=${editingItem.id}`, { method: 'DELETE' });
                      if (res.ok) {
                        setItems(prev => prev.filter(i => i.id !== editingItem.id));
                        setEditingItem(null);
                      }
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="px-4 py-2 bg-rose-600/20 text-rose-400 border border-rose-500/20 hover:bg-rose-600/30 rounded-xl text-xs font-bold transition"
                >
                  Delete
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 bg-zinc-850 text-zinc-300 hover:bg-zinc-800 rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-teal-400 text-black hover:bg-teal-300 rounded-xl text-xs font-bold"
                  >
                    {isSavingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
