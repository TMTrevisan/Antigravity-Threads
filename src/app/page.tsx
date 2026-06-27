'use client';

import React, { useState, useEffect, useRef } from 'react';

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
  raw_image_url: string;
  processed_image_url: string | null;
  notes: string | null;
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<'snap' | 'closet' | 'stylist'>('snap');

  // Garment records state
  const [items, setItems] = useState<Garment[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // Ingestion (Batch Snap) state
  const [uploadQueue, setUploadQueue] = useState<Array<{ file: File; status: 'pending' | 'uploading' | 'processing' | 'done' | 'failed'; error?: string; progress?: number }>>([]);
  const [batchNotes, setBatchNotes] = useState('');
  const [speechActive, setSpeechActive] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Split-Screen Interactive Validation Workspace
  const [validationTarget, setValidationTarget] = useState<Garment | null>(null);

  // Closet View & Bulk Actions state
  const [viewMode, setViewMode] = useState<'grid' | 'matrix'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<Garment | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Stylist state
  const [weatherInput, setWeatherInput] = useState('');
  const [eventInput, setEventInput] = useState('');
  const [lookbookInput, setLookbookInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stylistResult, setStylistResult] = useState<StylistOutput | null>(null);
  const [stylingError, setStylingError] = useState('');
  const [isSyncingWeather, setIsSyncingWeather] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Closet items
  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoadingItems(true);
    try {
      const res = await fetch('/api/items');
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
      }
    } catch (err) {
      console.error('Failed to load items:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  // Canvas Image Compression Utility
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
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
            0.8
          );
        };
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Drag and Drop & File selection triggers
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files) return;
    const fileList = Array.from(files);

    const newQueueItems = fileList.map(f => ({
      file: f,
      status: 'pending' as const,
    }));

    setUploadQueue(prev => [...prev, ...newQueueItems]);
  };

  // Batch process ingestion loop
  const triggerBatchUpload = async () => {
    if (uploadQueue.length === 0) return;

    setIsProcessingBatch(true);
    const successfullyUploadedIds: string[] = [];

    // Map through pending queue items and upload concurrently (Promise pool or simple parallel execution)
    const uploadPromises = uploadQueue.map(async (queueItem, index) => {
      if (queueItem.status !== 'pending') return;

      // Update status to uploading
      setUploadQueue(prev => prev.map((item, idx) => idx === index ? { ...item, status: 'uploading' } : item));

      try {
        // Compress image first
        const compressed = await compressImage(queueItem.file);

        const formData = new FormData();
        formData.append('image', compressed);
        if (batchNotes) {
          formData.append('notes', batchNotes);
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        successfullyUploadedIds.push(data.item.id);
        
        // Add skeleton loader garment to closet view
        setItems(prev => [data.item, ...prev]);

        setUploadQueue(prev => prev.map((item, idx) => idx === index ? { ...item, status: 'processing' } : item));
      } catch (err: any) {
        console.error(err);
        setUploadQueue(prev => prev.map((item, idx) => idx === index ? { ...item, status: 'failed', error: err.message } : item));
      }
    });

    await Promise.all(uploadPromises);

    // If any uploads succeeded, trigger the backend Gemini Edge worker asynchronously
    if (successfullyUploadedIds.length > 0) {
      try {
        const processRes = await fetch('/api/ingest/batch-process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: successfullyUploadedIds }),
        });

        const processData = await processRes.json();
        
        // Refetch garments to show populated tags
        await fetchItems();

        // Load the first successfully processed item into the Validation Workspace
        if (processData.results && processData.results.length > 0) {
          const successItem = items.find(i => i.id === successfullyUploadedIds[0]);
          if (successItem) {
            setValidationTarget(successItem);
          } else {
            // Fetch fresh state and set target
            const res = await fetch('/api/items');
            const data = await res.json();
            const freshlyProcessed = data.items?.find((i: any) => i.id === successfullyUploadedIds[0]);
            if (freshlyProcessed) setValidationTarget(freshlyProcessed);
          }
        }
      } catch (err) {
        console.error('Batch processing worker error:', err);
      }
    }

    setUploadQueue(prev => prev.map(item => item.status === 'processing' ? { ...item, status: 'done' } : item));
    setIsProcessingBatch(false);
  };

  // Confirm validation tags adjustments
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
          status: 'Active', // Ensure active status
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setItems(prev => prev.map(item => item.id === data.item.id ? data.item : item));
        
        // Auto-load next pending/unvalidated item in the closet if any
        const nextTarget = items.find(item => item.status === 'Processing' && item.id !== validationTarget.id);
        setValidationTarget(nextTarget || null);
      } else {
        const data = await res.json();
        alert(`Failed to confirm validation: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error validating garment.');
    }
  };

  // Weather Caching geolocation hook
  const syncLocalWeather = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsSyncingWeather(true);
    setWeatherInput('Fetching coordinates...');

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
          } else {
            throw new Error(data.error || 'Failed to parse weather');
          }
        } catch (err: any) {
          console.error(err);
          setWeatherInput('Failed to sync weather. Please type manually.');
        } finally {
          setIsSyncingWeather(false);
        }
      },
      (err) => {
        console.error(err);
        setWeatherInput('Location permissions denied. Please type manually.');
        setIsSyncingWeather(false);
      }
    );
  };

  // Stylist engine trigger
  const handleGenerateStylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setStylingError('Your closet is empty. Ingest some clothes first!');
      return;
    }

    setIsGenerating(true);
    setStylingError('');
    setStylistResult(null);

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
      if (!res.ok) {
        throw new Error(data.error || 'Stylist failed to process');
      }

      setStylistResult(data.recommendations);
    } catch (err: any) {
      console.error(err);
      setStylingError(err.message || 'An error occurred while generating outfits.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Bulk options actions
  const handleBulkChangeStatus = async (status: 'Active' | 'Archive' | 'Donate') => {
    if (selectedItemIds.length === 0) return;
    try {
      const promises = selectedItemIds.map(async (id) => {
        await fetch('/api/items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status }),
        });
      });
      await Promise.all(promises);
      fetchItems();
      setSelectedItemIds([]);
    } catch (err) {
      console.error(err);
      alert('Failed to complete bulk update.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItemIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete these ${selectedItemIds.length} items from your wardrobe?`)) return;

    try {
      const promises = selectedItemIds.map(id => 
        fetch(`/api/items?id=${id}`, { method: 'DELETE' })
      );
      await Promise.all(promises);
      fetchItems();
      setSelectedItemIds([]);
    } catch (err) {
      console.error(err);
      alert('Failed to execute bulk delete.');
    }
  };

  const toggleSelectAllItems = () => {
    if (selectedItemIds.length === filteredItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map(item => item.id));
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Speech notes capture
  const startSpeechNotes = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported on this browser.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => setSpeechActive(true);
    rec.onend = () => setSpeechActive(false);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setBatchNotes(prev => prev ? prev + ' ' + text : text);
    };
    rec.onerror = () => setSpeechActive(false);
    rec.start();
  };

  const clearQueue = () => {
    setUploadQueue([]);
  };

  // Filter closet items logic
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
    <div className="flex-1 flex flex-col bg-[#0b0c10] text-[#c5c6c7] min-h-screen font-sans">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#0b0c10]/95 backdrop-blur-md border-b border-zinc-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 via-teal-400 to-emerald-400 flex items-center justify-center text-black font-extrabold text-sm tracking-tighter">
            AT
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Antigravity Threads <span className="text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full font-medium">v2.5</span>
            </h1>
          </div>
        </div>
      </header>

      {/* CORE FRAMEWORK CONTAINER */}
      <main className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6 mb-24 lg:mb-0">
        
        {/* DESKTOP SIDE NAVIGATION */}
        <aside className="hidden lg:flex flex-col w-60 gap-2 pr-4 border-r border-zinc-800/60">
          <p className="text-[10px] tracking-widest uppercase font-bold text-zinc-500 px-3 mb-2">Navigation</p>
          <button
            onClick={() => setActiveTab('snap')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'snap'
                ? 'bg-gradient-to-r from-teal-500/10 to-indigo-500/10 text-teal-400 border-l-2 border-teal-400'
                : 'hover:bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Batch Ingest
          </button>
          
          <button
            onClick={() => setActiveTab('closet')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'closet'
                ? 'bg-gradient-to-r from-teal-500/10 to-indigo-500/10 text-teal-400 border-l-2 border-teal-400'
                : 'hover:bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            Closet Curation
          </button>

          <button
            onClick={() => setActiveTab('stylist')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'stylist'
                ? 'bg-gradient-to-r from-teal-500/10 to-indigo-500/10 text-teal-400 border-l-2 border-teal-400'
                : 'hover:bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            AI Stylist
          </button>
        </aside>

        {/* WORKSPACE CONTENT LAYOUT */}
        <section className="flex-1 min-w-0">
          
          {/* TAB 1: BATCH INGEST */}
          {activeTab === 'snap' && (
            <div className="space-y-6">
              
              {/* Batch Upload Form Card */}
              <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-6 backdrop-blur-sm">
                <h2 className="text-base font-bold text-white mb-2">Asynchronous Bulk Ingest Queue</h2>
                <p className="text-zinc-400 text-xs mb-6">
                  Select or drag up to 50 photos of your clothes. They will upload directly in the background while you review processed items in the validation panel.
                </p>

                <div className="space-y-4">
                  {/* Drag-n-drop Dropzone */}
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-zinc-800 hover:border-teal-500/30 bg-[#0b0c10]/40 rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[140px]"
                  >
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      multiple 
                      accept="image/*" 
                      onChange={(e) => handleFilesSelected(e.target.files)}
                      className="hidden" 
                    />
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <span className="text-xs font-semibold text-white">Select or Drag Multiple Images</span>
                      <span className="text-[10px] text-zinc-500">Supports JPEG/PNG uploads</span>
                    </div>
                  </div>

                  {/* Optional Notes & Speech */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-zinc-400">Contextual Ingestion Notes</label>
                      <button
                        onClick={startSpeechNotes}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase transition ${
                          speechActive 
                            ? 'bg-rose-500/20 text-rose-400 animate-pulse border border-rose-500/30' 
                            : 'bg-zinc-850 text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        🎤 {speechActive ? 'Recording...' : 'Voice Note'}
                      </button>
                    </div>
                    <input 
                      type="text"
                      placeholder="e.g. Vintage 90s wear, fits slim, summer linen staple..."
                      value={batchNotes}
                      onChange={(e) => setBatchNotes(e.target.value)}
                      className="w-full text-xs bg-[#0b0c10]/80 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500 transition"
                    />
                  </div>

                  {/* Batch Upload State/Progress */}
                  {uploadQueue.length > 0 && (
                    <div className="space-y-2 border-t border-zinc-800/80 pt-3">
                      <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
                        <span>Queue List ({uploadQueue.length} files selected)</span>
                        <button onClick={clearQueue} className="text-rose-400 hover:text-rose-300">Clear</button>
                      </div>
                      
                      {/* Flex wrap previews */}
                      <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1.5 bg-zinc-950/40 rounded-lg">
                        {uploadQueue.map((item, idx) => (
                          <div key={idx} className="relative w-12 h-12 rounded border border-zinc-800 overflow-hidden bg-black shrink-0">
                            <img 
                              src={URL.createObjectURL(item.file)} 
                              alt="" 
                              className="object-cover w-full h-full"
                            />
                            {/* Overlay status indicator */}
                            <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                              {item.status === 'uploading' && <div className="w-3 h-3 border-2 border-t-teal-400 border-zinc-800 rounded-full animate-spin"></div>}
                              {item.status === 'processing' && <span className="text-[8px] text-teal-300 animate-pulse">AI</span>}
                              {item.status === 'done' && <span className="text-[10px] text-teal-400">✔</span>}
                              {item.status === 'failed' && <span className="text-[10px] text-rose-500" title={item.error}>✖</span>}
                              {item.status === 'pending' && <span className="text-[8px] text-zinc-400">🕒</span>}
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={triggerBatchUpload}
                        disabled={isProcessingBatch}
                        className="w-full py-2 bg-teal-400 text-black font-bold text-xs rounded-lg hover:bg-teal-300 transition"
                      >
                        {isProcessingBatch ? 'Running Background Workers...' : 'Start Ingestion Queue'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* SPLIT SCREEN METADATA VALIDATION WORKSPACE */}
              {validationTarget && (
                <div className="border border-zinc-800 bg-[#1f2833]/10 rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
                    Interactive Validation Workspace (Recently Processed)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: Background-removed image cutout */}
                    <div className="flex flex-col items-center justify-center p-4 bg-zinc-950/40 rounded-xl border border-zinc-850">
                      <div className="relative w-48 h-48 rounded-lg overflow-hidden flex items-center justify-center">
                        <img 
                          src={validationTarget.processed_image_url || validationTarget.raw_image_url} 
                          alt="Cutout Garment" 
                          className="object-contain w-full h-full mix-blend-lighten filter saturate-[1.1] contrast-[1.05]"
                        />
                      </div>
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-3">Background Cutout Preview</span>
                    </div>

                    {/* Right: Confidence Metadata Form */}
                    <form onSubmit={handleConfirmValidation} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        {/* Category */}
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-500">Category</label>
                          <select
                            value={validationTarget.category}
                            onChange={(e) => setValidationTarget({ ...validationTarget, category: e.target.value })}
                            className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-teal-500"
                          >
                            <option value="Tops">Tops</option>
                            <option value="Bottoms">Bottoms</option>
                            <option value="Outerwear">Outerwear</option>
                            <option value="Footwear">Footwear</option>
                            <option value="Tailoring">Tailoring</option>
                          </select>
                        </div>

                        {/* Sub Category */}
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-500">Sub-Category</label>
                          <input
                            type="text"
                            value={validationTarget.sub_category}
                            onChange={(e) => setValidationTarget({ ...validationTarget, sub_category: e.target.value })}
                            className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>

                        {/* Color Family */}
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-500">Color Family</label>
                          <input
                            type="text"
                            value={validationTarget.color_family}
                            onChange={(e) => setValidationTarget({ ...validationTarget, color_family: e.target.value })}
                            className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>

                        {/* Hex Swatch */}
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-500">Hex Swatch</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={validationTarget.hex_code || '#000000'}
                              onChange={(e) => setValidationTarget({ ...validationTarget, hex_code: e.target.value })}
                              className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                            />
                            <input
                              type="text"
                              value={validationTarget.hex_code || ''}
                              onChange={(e) => setValidationTarget({ ...validationTarget, hex_code: e.target.value })}
                              className="flex-1 bg-[#0b0c10] border border-zinc-800 rounded-lg p-1.5 text-xs text-white font-mono"
                            />
                          </div>
                        </div>

                        {/* Fabric */}
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-500">Fabric Type</label>
                          <input
                            type="text"
                            value={validationTarget.fabric_type || ''}
                            onChange={(e) => setValidationTarget({ ...validationTarget, fabric_type: e.target.value })}
                            className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>

                        {/* Fit Block */}
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-500">Fit Block</label>
                          <input
                            type="text"
                            value={validationTarget.fit_block || ''}
                            onChange={(e) => setValidationTarget({ ...validationTarget, fit_block: e.target.value })}
                            className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>

                        {/* Brand */}
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-500">Brand</label>
                          <input
                            type="text"
                            value={validationTarget.brand || ''}
                            onChange={(e) => setValidationTarget({ ...validationTarget, brand: e.target.value || null })}
                            className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>

                        {/* Tonality */}
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-500">Tonal Value</label>
                          <select
                            value={validationTarget.tonal_value || 'Light'}
                            onChange={(e) => setValidationTarget({ ...validationTarget, tonal_value: e.target.value as any })}
                            className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                          >
                            <option value="Light">Light</option>
                            <option value="Medium">Medium</option>
                            <option value="Dark">Dark</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-3 border-t border-zinc-800">
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
              )}
            </div>
          )}

          {/* TAB 2: MY CLOSET CURATION */}
          {activeTab === 'closet' && (
            <div className="space-y-6">
              
              {/* FILTERS, SEARCH, DUAL VIEW TOGGLE */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border border-zinc-800 bg-[#1f2833]/10 rounded-2xl">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search closet attributes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0b0c10]/80 text-xs border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-teal-500 transition"
                  />
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Category Filter */}
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

                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-300"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Active">Active Closet</option>
                    <option value="Archive">Archive (Doesn't Fit)</option>
                    <option value="Donate">Pending Donate</option>
                    <option value="Discard">Discard / Sell</option>
                    <option value="Processing">Processing...</option>
                  </select>

                  {/* Layout switch buttons */}
                  <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-850">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded transition ${viewMode === 'grid' ? 'bg-zinc-800 text-teal-400' : 'text-zinc-500 hover:text-white'}`}
                      title="Grid View"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                    </button>
                    <button
                      onClick={() => setViewMode('matrix')}
                      className={`p-1.5 rounded transition ${viewMode === 'matrix' ? 'bg-zinc-800 text-teal-400' : 'text-zinc-500 hover:text-white'}`}
                      title="Matrix Spreadsheet View"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* GRID VIEW */}
              {loadingItems ? (
                <div className="text-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-t-teal-400 border-zinc-850 rounded-full mx-auto mb-3"></div>
                  <p className="text-zinc-500 text-xs">Accessing garments database...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-16 border border-zinc-800/40 border-dashed rounded-2xl bg-zinc-900/10">
                  <p className="text-zinc-500 text-xs mb-3">No matching closet items found.</p>
                  <button onClick={() => setActiveTab('snap')} className="px-3.5 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-bold tracking-wider uppercase transition">Add Clothes</button>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {filteredItems.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => setEditingItem(item)}
                      className="group relative border border-zinc-800/50 bg-[#1f2833]/15 rounded-xl overflow-hidden hover:border-zinc-700 cursor-pointer flex flex-col transition-all hover:scale-[1.01]"
                    >
                      {/* Selector Checkbox (prevents modal opening if clicked) */}
                      <input 
                        type="checkbox"
                        checked={selectedItemIds.includes(item.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectItem(item.id);
                        }}
                        className="absolute top-2 right-2 z-10 w-4.5 h-4.5 rounded border-zinc-800 bg-[#0b0c10] accent-teal-400 cursor-pointer"
                      />

                      {/* Image Frame */}
                      <div className="relative w-full aspect-square bg-black border-b border-zinc-800 flex items-center justify-center">
                        <img 
                          src={item.raw_image_url} 
                          alt="" 
                          className="object-cover w-full h-full group-hover:scale-105 transition duration-300"
                          loading="lazy"
                        />
                        {/* Swatch hex indicator */}
                        {item.hex_code && (
                          <div 
                            className="absolute bottom-2 left-2 w-5 h-5 rounded-full border border-zinc-900"
                            style={{ backgroundColor: item.hex_code }}
                          />
                        )}
                        {/* Skeleton spinner or error indicators */}
                        {item.status === 'Processing' && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5">
                            <div className="w-4 h-4 border-2 border-t-teal-400 border-zinc-800 rounded-full animate-spin"></div>
                            <span className="text-[8px] text-teal-400 font-bold uppercase tracking-widest animate-pulse">Extracting</span>
                          </div>
                        )}
                        {item.status === 'Processing_Failed' && (
                          <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center">
                            <span className="text-[14px]">⚠️</span>
                            <span className="text-[8px] text-rose-500 font-bold uppercase tracking-wider mt-1">Failed</span>
                          </div>
                        )}
                        {item.status && item.status !== 'Active' && item.status !== 'Processing' && item.status !== 'Processing_Failed' && (
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            {item.status}
                          </div>
                        )}
                      </div>

                      {/* Info Panel */}
                      <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                        <div>
                          <p className="text-[9px] uppercase font-bold text-zinc-500">{item.sub_category}</p>
                          <h4 className="text-xs font-bold text-white truncate">
                            {item.brand ? `${item.brand} ` : ''}{item.color_family}
                          </h4>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-zinc-400 pt-1.5 border-t border-zinc-800/60">
                          <span>{item.fit_block || 'N/A'}</span>
                          <span>{item.fabric_type || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* MATRIX SPREADSHEET TABLE VIEW */
                <div className="border border-zinc-800 bg-[#1f2833]/10 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px] text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/60 font-bold text-zinc-400">
                        <th className="p-3 w-10 text-center">
                          <input 
                            type="checkbox"
                            checked={selectedItemIds.length === filteredItems.length}
                            onChange={toggleSelectAllItems}
                            className="w-4 h-4 rounded border-zinc-800 bg-[#0b0c10] accent-teal-400 cursor-pointer"
                          />
                        </th>
                        <th className="p-3 w-16">Preview</th>
                        <th className="p-3">Sub-Category</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Color</th>
                        <th className="p-3">Brand</th>
                        <th className="p-3">Fabric</th>
                        <th className="p-3">Fit Block</th>
                        <th className="p-3 w-24">Status</th>
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
                            <div className="w-10 h-10 rounded border border-zinc-800 overflow-hidden bg-black flex items-center justify-center">
                              <img src={item.raw_image_url} alt="" className="object-cover w-full h-full" />
                            </div>
                          </td>
                          <td className="p-3 font-semibold text-white">{item.sub_category}</td>
                          <td className="p-3">{item.category}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              {item.hex_code && (
                                <span className="w-3.5 h-3.5 rounded-full border border-zinc-900 inline-block" style={{ backgroundColor: item.hex_code }} />
                              )}
                              <span>{item.color_family}</span>
                            </div>
                          </td>
                          <td className="p-3">{item.brand || 'Unknown'}</td>
                          <td className="p-3">{item.fabric_type || 'N/A'}</td>
                          <td className="p-3">{item.fit_block || 'N/A'}</td>
                          <td className="p-3">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              item.status === 'Active' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' : 
                              item.status === 'Processing' ? 'bg-zinc-800 text-zinc-400 animate-pulse' :
                              item.status === 'Processing_Failed' ? 'bg-rose-500/25 text-rose-400 border border-rose-500/30' :
                              'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* STICKY BOTTOM BULK ACTIONS FOOTER */}
              {selectedItemIds.length > 0 && (
                <div className="fixed bottom-16 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#1f2833] border border-zinc-700 shadow-2xl rounded-full px-5 py-3 animate-slide-up text-xs font-semibold text-white">
                  <span>Selected {selectedItemIds.length} items:</span>
                  <div className="h-4 w-[1px] bg-zinc-700"></div>
                  <button 
                    onClick={() => handleBulkChangeStatus('Active')}
                    className="text-teal-400 hover:text-teal-300"
                  >
                    Keep / Active
                  </button>
                  <button 
                    onClick={() => handleBulkChangeStatus('Archive')}
                    className="text-amber-400 hover:text-amber-300"
                  >
                    Archive
                  </button>
                  <button 
                    onClick={() => handleBulkChangeStatus('Donate')}
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    Donate
                  </button>
                  <div className="h-4 w-[1px] bg-zinc-700"></div>
                  <button 
                    onClick={handleBulkDelete}
                    className="text-rose-400 hover:text-rose-300"
                  >
                    Delete
                  </button>
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
                  Sync your local weather instantly to auto-fill current conditions, select a vibe preset, and retrieve optimized outfits utilizing Gemini Flash.
                </p>

                <form onSubmit={handleGenerateStylist} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Weather input */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-zinc-400 flex items-center justify-between">
                        <span>Weather Conditions</span>
                        <button
                          type="button"
                          onClick={syncLocalWeather}
                          disabled={isSyncingWeather}
                          className="flex items-center gap-1 text-[9px] font-bold text-teal-400 hover:text-teal-300 uppercase tracking-normal"
                        >
                          ⚡ {isSyncingWeather ? 'Syncing...' : 'Sync Weather'}
                        </button>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Temp: 72°F | Precipitation: 0% | Conditions: Sunny"
                        value={weatherInput}
                        onChange={(e) => setWeatherInput(e.target.value)}
                        className="w-full bg-[#0b0c10]/80 text-xs border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500 transition"
                      />
                    </div>

                    {/* Vibe / Event */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-zinc-400">Event / Vibe context</label>
                      <input
                        type="text"
                        placeholder="Type context or click a vibe preset below..."
                        value={eventInput}
                        onChange={(e) => setEventInput(e.target.value)}
                        className="w-full bg-[#0b0c10]/80 text-xs border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500 transition"
                      />
                    </div>
                  </div>

                  {/* Vibe presetting chips */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-bold text-zinc-500">Event Presets</span>
                    <div className="flex flex-wrap gap-2">
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
                          className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-[10px] font-semibold text-zinc-400 hover:text-white transition"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Lookbook / Target Style */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-zinc-400">Lookbook / Aesthetic Target</label>
                    <input
                      type="text"
                      placeholder="e.g. Minimalist neutral tones, tailored structures, or high contrast"
                      value={lookbookInput}
                      onChange={(e) => setLookbookInput(e.target.value)}
                      className="w-full bg-[#0b0c10]/80 text-xs border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-rose-400">{stylingError}</span>
                    <button
                      type="submit"
                      disabled={isGenerating}
                      className="px-6 py-2.5 rounded-xl bg-teal-400 text-black font-semibold text-sm hover:bg-teal-300 disabled:bg-zinc-800 disabled:text-zinc-500 transition"
                    >
                      {isGenerating ? 'Designing Outfits...' : 'Generate Outfits'}
                    </button>
                  </div>
                </form>
              </div>

              {/* STYLIST GENERATION RESULT */}
              {isGenerating && (
                <div className="text-center py-16 border border-zinc-850 bg-zinc-950/20 rounded-2xl">
                  <div className="animate-pulse flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 text-sm font-bold">
                      ✍️
                    </div>
                    <p className="text-xs text-zinc-400">Styling wardrobe combinations, executing silhouette and tonality contrast checks...</p>
                  </div>
                </div>
              )}

              {stylistResult && (
                <div className="space-y-6">
                  {/* Generated Outfits */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {stylistResult.outfits.map((outfit, idx) => {
                      const outfitItems = outfit.item_ids
                        .map(id => items.find(item => item.id === id))
                        .filter((item): item is Garment => !!item);

                      return (
                        <div key={idx} className="border border-zinc-800 bg-[#1f2833]/10 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[9px] uppercase font-extrabold tracking-wider bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded">Outfit Option {idx + 1}</span>
                            </div>
                            <h3 className="text-sm font-bold text-white mb-4">{outfit.name}</h3>
                            
                            {/* Polaroid-style item cards stack/grid */}
                            <div className="grid grid-cols-3 gap-3 mb-4">
                              {outfitItems.map(oi => (
                                <div key={oi.id} className="border border-zinc-800 bg-black rounded-lg overflow-hidden flex flex-col">
                                  <div className="relative aspect-square w-full">
                                    <img src={oi.raw_image_url} alt="" className="object-cover w-full h-full" />
                                  </div>
                                  <div className="p-1 text-center border-t border-zinc-900 bg-zinc-950">
                                    <p className="text-[8px] font-bold text-zinc-300 truncate">{oi.brand ? `${oi.brand} ` : ''}{oi.sub_category}</p>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                              {outfit.styling_reasoning}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Wardrobe Gaps & Tips Banner */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 border border-amber-500/15 bg-amber-500/5 rounded-2xl p-5">
                      <h4 className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-2">
                        ⚠️ Lookbook Wardrobe Gaps
                      </h4>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {stylistResult.gap_analysis}
                      </p>
                    </div>

                    <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-5">
                      <h4 className="text-xs font-bold text-teal-400 mb-3 flex items-center gap-2">
                        Styling Tips
                      </h4>
                      <ul className="space-y-1.5 list-disc pl-4 text-xs text-zinc-400">
                        {stylistResult.general_tips.map((tip, index) => (
                          <li key={index}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </section>
      </main>

      {/* MOBILE STICKY NAVIGATION */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0b0c10]/95 backdrop-blur-md border-t border-zinc-800/80 py-2.5 px-6 flex justify-around">
        <button 
          onClick={() => setActiveTab('snap')}
          className={`flex flex-col items-center gap-1 text-[9px] font-bold uppercase transition ${
            activeTab === 'snap' ? 'text-teal-400' : 'text-zinc-500'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Ingest
        </button>

        <button 
          onClick={() => setActiveTab('closet')}
          className={`flex flex-col items-center gap-1 text-[9px] font-bold uppercase transition ${
            activeTab === 'closet' ? 'text-teal-400' : 'text-zinc-500'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          Curation
        </button>

        <button 
          onClick={() => setActiveTab('stylist')}
          className={`flex flex-col items-center gap-1 text-[9px] font-bold uppercase transition ${
            activeTab === 'stylist' ? 'text-teal-400' : 'text-zinc-500'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          Stylist
        </button>
      </nav>

      {/* DETAILED Garment Edit/Curation modal popup */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1f2833] border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white">Curation Details</h3>
              <button onClick={() => setEditingItem(null)} className="text-zinc-400 hover:text-white">
                ✕
              </button>
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
                } else {
                  const data = await res.json();
                  alert(`Update failed: ${data.error}`);
                }
              } catch (err) {
                console.error(err);
              } finally {
                setIsSavingEdit(false);
              }
            }} className="space-y-3">
              <div className="relative w-36 h-36 mx-auto rounded-lg overflow-hidden border border-zinc-700 bg-black flex items-center justify-center">
                <img src={editingItem.raw_image_url} alt="" className="object-contain w-full h-full" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Category</label>
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
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Status</label>
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
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Color Family</label>
                  <input
                    type="text"
                    value={editingItem.color_family}
                    onChange={(e) => setEditingItem({ ...editingItem, color_family: e.target.value })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Hex Code</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={editingItem.hex_code || '#000000'}
                      onChange={(e) => setEditingItem({ ...editingItem, hex_code: e.target.value })}
                      className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={editingItem.hex_code || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, hex_code: e.target.value })}
                      className="flex-1 bg-[#0b0c10] border border-zinc-800 rounded-lg p-1.5 text-xs text-white font-mono"
                    />
                  </div>
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
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400">Notes / Speech</label>
                <textarea
                  value={editingItem.notes || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value || null })}
                  rows={2}
                  className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-between pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Are you sure you want to delete this garment?')) return;
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
