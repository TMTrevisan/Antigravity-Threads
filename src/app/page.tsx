'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

interface WardrobeItem {
  id: string;
  image_url: string;
  category: string;
  sub_category: string;
  brand: string | null;
  color_family: string;
  color_hex: string | null;
  tonal_value: string | null;
  fabric_type: string | null;
  fit_block: string | null;
  status: string;
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
  // App navigation
  const [activeTab, setActiveTab] = useState<'snap' | 'closet' | 'stylist'>('snap');

  // Wardrobe state
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // Ingestion (Snap) state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');
  const [uploadedItem, setUploadedItem] = useState<WardrobeItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Closet filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [editingItem, setEditingItem] = useState<WardrobeItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Stylist state
  const [weatherInput, setWeatherInput] = useState('');
  const [eventInput, setEventInput] = useState('');
  const [lookbookInput, setLookbookInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stylistResult, setStylistResult] = useState<StylistOutput | null>(null);
  const [stylingError, setStylingError] = useState('');

  // Fetch closet items on load
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

  // Client-side image compression
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000; // Optimal size for Gemini Vision & fast uploads
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
            0.8 // 80% compression quality
          );
        };
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Image Selection Handler
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadStatusMsg('Compressing image...');
      const compressed = await compressImage(file);
      setSelectedImage(compressed);
      setPreviewUrl(URL.createObjectURL(compressed));
      setUploadStatusMsg('');
      setUploadedItem(null);
    } catch (err) {
      console.error('Image compression failed:', err);
      // Fallback to original
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setUploadStatusMsg('');
    }
  };

  // Speech-to-text integration
  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported on this browser. Please type notes manually.');
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
      setNotes((prev) => (prev ? prev + ' ' + text : text));
    };
    rec.onerror = (err: any) => {
      console.error('Speech error:', err);
      setSpeechActive(false);
    };

    rec.start();
  };

  // Handle uploading and parsing
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedImage) return;

    setIsUploading(true);
    setUploadStatusMsg('Uploading image & analyzing style with Gemini...');

    try {
      const formData = new FormData();
      formData.append('image', selectedImage);
      if (notes) {
        formData.append('notes', notes);
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Server error during upload');
      }

      setUploadedItem(data.item);
      setItems((prev) => [data.item, ...prev]); // Add to dashboard list immediately
      setSelectedImage(null);
      setPreviewUrl(null);
      setNotes('');
      setUploadStatusMsg('Item successfully categorized!');
    } catch (err: any) {
      console.error(err);
      setUploadStatusMsg(`Error: ${err.message || 'Failed to analyze item'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Item Deletion
  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to remove this garment from your archive?')) return;

    try {
      const res = await fetch(`/api/items?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        if (editingItem?.id === id) setEditingItem(null);
      } else {
        const data = await res.json();
        alert(`Delete failed: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete item.');
    }
  };

  // Handle Item Editing / Saving
  const handleSaveItemEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setIsSavingEdit(true);
    try {
      const res = await fetch('/api/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem),
      });

      if (res.ok) {
        const data = await res.json();
        setItems((prev) => prev.map((item) => (item.id === data.item.id ? data.item : item)));
        setEditingItem(null);
      } else {
        const data = await res.json();
        alert(`Failed to save edit: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error updating wardrobe item.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Outfit & Stylist Generation
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

  // Export database utility
  const handleExportCSV = () => {
    if (items.length === 0) return;
    const headers = ['id', 'category', 'sub_category', 'brand', 'color_family', 'color_hex', 'tonal_value', 'fabric_type', 'fit_block', 'status', 'notes', 'created_at'];
    const csvRows = [
      headers.join(','),
      ...items.map(item => headers.map(header => {
        const val = item[header as keyof WardrobeItem] || '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wardrobe-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Filter items logic
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
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#0b0c10]/80 backdrop-blur-md border-b border-zinc-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 via-teal-400 to-emerald-400 flex items-center justify-center text-black font-extrabold text-sm tracking-tighter">
            WA
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Wardrobe Archivist <span className="text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full font-medium">AI v2.0</span>
            </h1>
          </div>
        </div>
        <button 
          onClick={handleExportCSV}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Export CSV
        </button>
      </header>

      {/* CORE LAYOUT */}
      <main className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6 mb-24 lg:mb-0">
        
        {/* SIDE BAR / LEFT NAV - Desktop only */}
        <aside className="hidden lg:flex flex-col w-64 gap-2 pr-4 border-r border-zinc-800/60">
          <p className="text-[10px] tracking-widest uppercase font-bold text-zinc-500 px-3 mb-2">Navigation</p>
          <button
            onClick={() => setActiveTab('snap')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'snap'
                ? 'bg-gradient-to-r from-teal-500/10 to-indigo-500/10 text-teal-400 border-l-2 border-teal-400'
                : 'hover:bg-zinc-800/40 text-zinc-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Snap & Ingest
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
            My Closet ({items.length})
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

        {/* TAB WORKSPACE */}
        <section className="flex-1 min-w-0">
          
          {/* TAB 1: SNAP & INGEST */}
          {activeTab === 'snap' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="border border-zinc-800 bg-[#1f2833]/20 rounded-2xl p-6 backdrop-blur-sm">
                <h2 className="text-lg font-bold text-white mb-2">Ingest Garment</h2>
                <p className="text-zinc-400 text-xs mb-6">
                  Snap a photo of any item. Gemini will automatically categorize, label fabric, fit block, tonal value, and suggest a HEX swatch.
                </p>

                <form onSubmit={handleUpload} className="space-y-5">
                  
                  {/* Visual Dropzone/Camera trigger */}
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[220px] ${
                      previewUrl 
                        ? 'border-teal-500/50 bg-[#1f2833]/40' 
                        : 'border-zinc-800 hover:border-teal-500/30 bg-[#0b0c10]/40'
                    }`}
                  >
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept="image/*" 
                      capture="environment" // Forces back camera on mobile devices!
                      onChange={handleImageChange}
                      className="hidden" 
                    />

                    {previewUrl ? (
                      <div className="relative w-44 h-44 rounded-lg overflow-hidden border border-zinc-700 bg-black flex items-center justify-center">
                        <img 
                          src={previewUrl} 
                          alt="Garment Preview" 
                          className="object-contain w-full h-full"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <span className="text-sm font-semibold text-white">Tap to Snap Photo or Upload</span>
                        <span className="text-zinc-500 text-xs">Supports normal uploads & mobile cameras</span>
                      </div>
                    )}
                  </div>

                  {/* Speech & Context Note */}
                  <div className="space-y-2">
                    <label className="text-xs uppercase font-bold tracking-wider text-zinc-400 flex items-center justify-between">
                      <span>Fitting Notes & Feedback</span>
                      <button
                        type="button"
                        onClick={startSpeechRecognition}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-normal uppercase transition ${
                          speechActive 
                            ? 'bg-rose-500/20 text-rose-400 animate-pulse border border-rose-500/30' 
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        {speechActive ? 'Listening...' : 'Speak Feedback'}
                      </button>
                    </label>
                    <textarea
                      placeholder="Speak or type: 'Fit is tight, keep for now, vintage 90s aesthetic'"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full text-sm bg-[#0b0c10]/80 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500 transition"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-zinc-400 font-medium">
                      {uploadStatusMsg}
                    </span>
                    <button
                      type="submit"
                      disabled={!selectedImage || isUploading}
                      className="px-6 py-2.5 rounded-xl bg-teal-400 text-black font-semibold text-sm hover:bg-teal-300 disabled:bg-zinc-800 disabled:text-zinc-500 transition"
                    >
                      {isUploading ? 'Analyzing...' : 'Add to Closet'}
                    </button>
                  </div>
                </form>
              </div>

              {/* UPLOADED ITEM CONFIRMATION SWATCH */}
              {uploadedItem && (
                <div className="border border-teal-500/30 bg-teal-500/5 rounded-2xl p-5 animate-fade-in flex flex-col md:flex-row gap-5 items-start md:items-center">
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-zinc-700 bg-black shrink-0">
                    <img 
                      src={uploadedItem.image_url} 
                      alt="Uploaded item" 
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{uploadedItem.category}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{uploadedItem.sub_category}</span>
                      {uploadedItem.color_hex && (
                        <span 
                          className="w-4 h-4 rounded-full border border-white/20 inline-block"
                          style={{ backgroundColor: uploadedItem.color_hex }}
                          title={uploadedItem.color_family}
                        />
                      )}
                    </div>
                    <p className="text-sm font-bold text-white">
                      {uploadedItem.brand ? `${uploadedItem.brand} - ` : ''} {uploadedItem.color_family} {uploadedItem.fabric_type}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                      <span>Fit: <strong className="text-zinc-200">{uploadedItem.fit_block}</strong></span>
                      <span>Tone: <strong className="text-zinc-200">{uploadedItem.tonal_value}</strong></span>
                      <span>Status: <strong className="text-zinc-200">{uploadedItem.status}</strong></span>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setUploadedItem(null); setActiveTab('closet'); }}
                    className="text-xs font-semibold text-teal-400 hover:text-teal-300 shrink-0 self-end md:self-center"
                  >
                    View in Closet &rarr;
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MY CLOSET */}
          {activeTab === 'closet' && (
            <div className="space-y-6">
              {/* FILTERS & SEARCH ROW */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border border-zinc-800 bg-[#1f2833]/10 rounded-2xl">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search by sub-category, color, notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0b0c10]/80 text-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-teal-500 transition"
                  />
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Category Pill Filters */}
                  <div className="flex rounded-lg bg-zinc-900/60 p-1 border border-zinc-800">
                    {['All', 'Tops', 'Bottoms', 'Outerwear', 'Shoes'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                          categoryFilter === cat 
                            ? 'bg-zinc-800 text-teal-400 shadow-sm' 
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Status Dropdown */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1 text-xs font-semibold text-zinc-300 focus:outline-none focus:border-teal-500"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Active">Keep / Active</option>
                    <option value="Donate">Donate</option>
                    <option value="Sell">Sell</option>
                  </select>
                </div>
              </div>

              {/* DATABASE GRID VIEW */}
              {loadingItems ? (
                <div className="text-center py-12">
                  <div className="animate-spin w-8 h-8 border-2 border-t-teal-400 border-zinc-800 rounded-full mx-auto mb-4"></div>
                  <p className="text-zinc-500 text-sm">Accessing wardrobe.db...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-16 border border-zinc-800/40 border-dashed rounded-2xl bg-zinc-900/10">
                  <p className="text-zinc-500 text-sm mb-4">No clothing matching these filters found.</p>
                  <button 
                    onClick={() => setActiveTab('snap')}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold transition"
                  >
                    Add Clothes
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {filteredItems.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => setEditingItem(item)}
                      className="group relative border border-zinc-800/60 bg-[#1f2833]/15 rounded-xl overflow-hidden hover:border-zinc-700 cursor-pointer flex flex-col transition-all hover:scale-[1.02]"
                    >
                      {/* Image Frame */}
                      <div className="relative w-full aspect-square bg-black border-b border-zinc-800 flex items-center justify-center">
                        <img 
                          src={item.image_url} 
                          alt={`${item.color_family} ${item.sub_category}`} 
                          className="object-cover w-full h-full group-hover:scale-105 transition duration-300"
                          loading="lazy"
                        />
                        {/* Swatch Indicator */}
                        {item.color_hex && (
                          <div 
                            className="absolute bottom-2 right-2 w-6 h-6 rounded-full border-2 border-[#0b0c10] shadow-md"
                            style={{ backgroundColor: item.color_hex }}
                            title={item.color_family}
                          />
                        )}
                        {/* Status Label */}
                        {item.status && item.status !== 'Active' && (
                          <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            item.status === 'Donate' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {item.status}
                          </div>
                        )}
                      </div>

                      {/* Info Panel */}
                      <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-zinc-500">{item.sub_category}</p>
                          <h4 className="text-xs font-bold text-white truncate">
                            {item.brand ? `${item.brand} ` : ''}{item.color_family}
                          </h4>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-800/60">
                          <span>{item.fit_block || 'N/A'}</span>
                          <span>{item.fabric_type || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI STYLIST */}
          {activeTab === 'stylist' && (
            <div className="space-y-6">
              <div className="border border-zinc-800 bg-[#1f2833]/20 rounded-2xl p-6 backdrop-blur-sm">
                <h2 className="text-lg font-bold text-white mb-2">AI Styling Assistant</h2>
                <p className="text-zinc-400 text-xs mb-6">
                  Input today's weather, the vibe of the event, and select your target lookbook aesthetic. Gemini will generate complete outfits from your closet and identify style gaps.
                </p>

                <form onSubmit={handleGenerateStylist} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Weather input */}
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-bold text-zinc-400">Weather Context</label>
                    <input
                      type="text"
                      placeholder="e.g. 70°F & Breezy, overcast"
                      value={weatherInput}
                      onChange={(e) => setWeatherInput(e.target.value)}
                      className="w-full bg-[#0b0c10]/80 text-sm border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 transition"
                    />
                  </div>

                  {/* Event Type */}
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-bold text-zinc-400">Event / Vibe</label>
                    <input
                      type="text"
                      placeholder="e.g. Smart casual dinner, office meeting"
                      value={eventInput}
                      onChange={(e) => setEventInput(e.target.value)}
                      className="w-full bg-[#0b0c10]/80 text-sm border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 transition"
                    />
                  </div>

                  {/* Lookbook */}
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-bold text-zinc-400">Lookbook / Aesthetic Target</label>
                    <input
                      type="text"
                      placeholder="e.g. Relaxed tailoring, high contrast"
                      value={lookbookInput}
                      onChange={(e) => setLookbookInput(e.target.value)}
                      className="w-full bg-[#0b0c10]/80 text-sm border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 transition"
                    />
                  </div>

                  <div className="md:col-span-3 flex items-center justify-between pt-2">
                    <span className="text-xs text-rose-400">{stylingError}</span>
                    <button
                      type="submit"
                      disabled={isGenerating}
                      className="w-full md:w-auto px-6 py-2.5 rounded-xl bg-teal-400 text-black font-semibold text-sm hover:bg-teal-300 disabled:bg-zinc-800 disabled:text-zinc-500 transition"
                    >
                      {isGenerating ? 'Designing Outfits...' : 'Generate Outfits'}
                    </button>
                  </div>
                </form>
              </div>

              {/* STYLIST GENERATION RESULT */}
              {isGenerating && (
                <div className="text-center py-16 border border-zinc-850 bg-zinc-950/20 rounded-2xl">
                  <div className="animate-pulse flex flex-col items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 text-lg font-bold">
                      ✍️
                    </div>
                    <p className="text-sm text-zinc-400">Styling wardrobe combinations, balancing contrasts and silhouettes...</p>
                  </div>
                </div>
              )}

              {stylistResult && (
                <div className="space-y-6">
                  {/* Generated Outfits */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {stylistResult.outfits.map((outfit, idx) => {
                      // Fetch full items corresponding to IDs
                      const outfitItems = outfit.item_ids
                        .map(id => items.find(item => item.id === id))
                        .filter((item): item is WardrobeItem => !!item);

                      return (
                        <div key={idx} className="border border-zinc-800 bg-[#1f2833]/10 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] uppercase font-extrabold tracking-wider bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded">Outfit Option {idx + 1}</span>
                            </div>
                            <h3 className="text-base font-bold text-white mb-4">{outfit.name}</h3>
                            
                            {/* Polaroid-style item cards stack/grid */}
                            <div className="grid grid-cols-3 gap-3 mb-4">
                              {outfitItems.map(oi => (
                                <div key={oi.id} className="border border-zinc-800 bg-black rounded-lg overflow-hidden flex flex-col">
                                  <div className="relative aspect-square w-full">
                                    <img src={oi.image_url} alt="" className="object-cover w-full h-full" />
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
                      <h4 className="text-sm font-bold text-amber-400 mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        Lookbook Wardrobe Gaps
                      </h4>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {stylistResult.gap_analysis}
                      </p>
                    </div>

                    <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-5">
                      <h4 className="text-sm font-bold text-teal-400 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
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

      {/* FOOTER MOBILE NAVIGATION */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0b0c10]/95 backdrop-blur-md border-t border-zinc-800/80 py-2.5 px-6 flex justify-around">
        <button 
          onClick={() => setActiveTab('snap')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold uppercase transition ${
            activeTab === 'snap' ? 'text-teal-400' : 'text-zinc-500'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Snap
        </button>

        <button 
          onClick={() => setActiveTab('closet')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold uppercase transition ${
            activeTab === 'closet' ? 'text-teal-400' : 'text-zinc-500'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          Closet
        </button>

        <button 
          onClick={() => setActiveTab('stylist')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold uppercase transition ${
            activeTab === 'stylist' ? 'text-teal-400' : 'text-zinc-500'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          Stylist
        </button>
      </nav>

      {/* EDITING ITEM POPUP MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#1f2833] border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white">Edit Clothing Details</h3>
              <button 
                onClick={() => setEditingItem(null)}
                className="text-zinc-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveItemEdit} className="space-y-3">
              <div className="relative w-36 h-36 mx-auto rounded-lg overflow-hidden border border-zinc-700 bg-black">
                <img src={editingItem.image_url} alt="" className="object-cover w-full h-full" />
              </div>

              {/* Status Select */}
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
                    <option value="Shoes">Shoes</option>
                    <option value="Accessories">Accessories</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Status</label>
                  <select
                    value={editingItem.status}
                    onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="Active">Keep / Active</option>
                    <option value="Donate">Donate</option>
                    <option value="Sell">Sell</option>
                  </select>
                </div>
              </div>

              {/* Sub Category & Brand */}
              <div className="grid grid-cols-2 gap-3">
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
              </div>

              {/* Color & Hex */}
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Hex Code Swatch</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={editingItem.color_hex || '#000000'}
                      onChange={(e) => setEditingItem({ ...editingItem, color_hex: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer border border-zinc-800 bg-transparent"
                    />
                    <input
                      type="text"
                      value={editingItem.color_hex || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, color_hex: e.target.value })}
                      className="flex-1 bg-[#0b0c10] border border-zinc-800 rounded-lg p-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Fabric & Fit Block */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Fabric Type</label>
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

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400">Garment Notes / Speech</label>
                <textarea
                  value={editingItem.notes || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value || null })}
                  rows={2}
                  className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div className="flex gap-3 justify-between pt-3 border-t border-zinc-800 mt-2">
                <button
                  type="button"
                  onClick={() => handleDeleteItem(editingItem.id)}
                  className="px-4 py-2 bg-rose-600/20 text-rose-400 border border-rose-500/20 hover:bg-rose-600/30 rounded-xl text-xs font-bold transition"
                >
                  Delete Item
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-xl text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="px-4 py-2 bg-teal-400 text-black hover:bg-teal-300 rounded-xl text-xs font-bold transition"
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
