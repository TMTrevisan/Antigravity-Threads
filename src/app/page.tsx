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
  purchase_year: number | null;
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
  const [activeTab, setActiveTab] = useState<'snap' | 'closet' | 'spreadsheet' | 'stylist' | 'metrics'>('snap');
  const [closetSubTab, setClosetSubTab] = useState<'items' | 'outfits' | 'locker' | 'analytics' | 'guide'>('items');
  const [editedItems, setEditedItems] = useState<Record<string, Partial<Garment>>>({});

  // Core Curation State
  const [items, setItems] = useState<Garment[]>([]);
  const [wearLogs, setWearLogs] = useState<WearLog[]>([]);
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingOutfits, setLoadingOutfits] = useState(false);

  // Ingestion Groups State
  const [ingestGroups, setIngestGroups] = useState<IngestGroup[]>([]);
  const [selectedIngestGroupIds, setSelectedIngestGroupIds] = useState<string[]>([]);
  const [speechActive, setSpeechActive] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [validationTarget, setValidationTarget] = useState<Garment | null>(null);

  // Active group details selection ref
  const detailFilePickerRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const detailCameraInputRef = useRef<HTMLInputElement>(null);
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
  const [continuousSnap, setContinuousSnap] = useState(false);
  const [cutoutProgress, setCutoutProgress] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearchingImage, setIsSearchingImage] = useState(false);
  const [isReplacingImage, setIsReplacingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [searchQueryText, setSearchQueryText] = useState('');

  useEffect(() => {
    if (editingItem) {
      setSearchQueryText(`${editingItem.brand || ''} ${editingItem.sub_category || ''} ${editingItem.color_family || ''}`.trim());
    } else if (validationTarget) {
      setSearchQueryText(`${validationTarget.brand || ''} ${validationTarget.sub_category || ''} ${validationTarget.color_family || ''}`.trim());
    } else {
      setSearchQueryText('');
    }
  }, [editingItem, validationTarget]);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatProvider, setChatProvider] = useState<'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'minimax'>('gemini');
  const [chatApiKey, setChatApiKey] = useState('');
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [isChatTyping, setIsChatTyping] = useState(false);

  useEffect(() => {
    const savedProvider = localStorage.getItem('threads_chat_provider') as any;
    const savedKey = localStorage.getItem('threads_chat_key') || '';
    if (savedProvider) setChatProvider(savedProvider);
    if (savedKey) setChatApiKey(savedKey);
  }, []);

  const sendChatMessage = async (customText?: string) => {
    const textToSend = customText || chatInput;
    if (!textToSend.trim()) return;

    const newMessages = [...chatMessages, { role: 'user' as const, content: textToSend }];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatTyping(true);

    try {
      const wardrobeContext = items
        .map(
          (i) =>
            `${i.id} | ${i.category} | ${i.sub_category} | ${i.color_family} | ${i.fabric_type} | ${i.fit_block} | Wears: ${
              wearLogs.filter((log) => log.garment_id === i.id).length
            }`
        )
        .join('\n');

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          provider: chatProvider,
          apiKey: chatApiKey,
          wardrobe: wardrobeContext
        })
      });

      const data = await res.json();
      if (res.ok) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${data.error || 'Failed to generate response.'}` }]);
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${err.message}` }]);
    } finally {
      setIsChatTyping(false);
    }
  };

  const uploadImageToGarment = async (file: File) => {
    if (!editingItem) return;
    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('garmentId', editingItem.id);
      formData.append('file', file);
      
      const res = await fetch('/api/items/add-image', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setEditingItem({
          ...editingItem,
          images: data.images
        });
        await fetchItems();
      } else {
        alert(`Upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error uploading image: ${err.message}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const setPrimaryImage = async (imageId: string) => {
    if (!editingItem) return;
    setIsUploadingImage(true);
    try {
      const res = await fetch('/api/items/set-primary-image', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentId: editingItem.id,
          imageId
        })
      });
      const data = await res.json();
      if (res.ok) {
        const primaryUrl = data.images.find((img: any) => img.is_primary_profile)?.storage_path || editingItem.primary_image_url;
        setEditingItem({
          ...editingItem,
          primary_image_url: primaryUrl,
          images: data.images
        });
        await fetchItems();
      } else {
        alert(`Failed to set primary: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const deleteGarmentImage = async (imageId: string) => {
    if (!editingItem) return;
    setIsUploadingImage(true);
    try {
      const res = await fetch('/api/items/delete-image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentId: editingItem.id,
          imageId
        })
      });
      const data = await res.json();
      if (res.ok) {
        setEditingItem({
          ...editingItem,
          images: data.images
        });
        await fetchItems();
      } else {
        alert(`Delete failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error deleting: ${err.message}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const [visualModal, setVisualModal] = useState<{
    outfitName: string;
    items: Garment[];
    tab: 'collage' | 'generative' | 'tryon';
    genUrl?: string;
    loading?: boolean;
    loadingMsg?: string;
    personImage?: string | null;
  } | null>(null);

  const drawOutfitCollage = (canvas: HTMLCanvasElement, outfitItems: Garment[]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(102, 252, 241, 0.04)';
    ctx.lineWidth = 1.5;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    let loadedCount = 0;
    const itemsToDraw = outfitItems.filter(item => item.primary_image_url);
    
    if (itemsToDraw.length === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px monospace';
      ctx.fillText('No images available for collage.', 50, canvas.height / 2);
      return;
    }

    itemsToDraw.forEach(item => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = item.primary_image_url!;
      img.onload = () => {
        let x = 0, y = 0, w = 240, h = 240;
        const cat = item.category.toLowerCase();
        
        if (cat.includes('top') || cat.includes('outerwear') || cat.includes('tailoring')) {
          x = (canvas.width - w) / 2;
          y = 50;
        } else if (cat.includes('bottom')) {
          x = (canvas.width - w) / 2;
          y = 250;
        } else if (cat.includes('footwear')) {
          x = (canvas.width - w) / 2;
          y = 470;
        } else {
          x = 100;
          y = 100 + loadedCount * 150;
        }

        ctx.drawImage(img, x, y, w, h);
        
        loadedCount++;
        if (loadedCount === itemsToDraw.length) {
          ctx.fillStyle = 'rgba(102, 252, 241, 0.6)';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('ANTIGRAVITY THREADS • OUTFIT COLLAGE', 20, canvas.height - 20);
        }
      };
      img.onerror = () => {
        loadedCount++;
      };
    });
  };

  const runClientSideCutout = async (garmentId: string, storagePath: string) => {
    setCutoutProgress('Initializing AI engine...');
    try {
      setCutoutProgress('Loading AI cutout model (this may take a moment on first run)...');
      let segmentator;
      try {
        const { pipeline, env } = await import('@huggingface/transformers');
        // Prevent transformer.js from making unauthorized local filesystem calls
        env.allowLocalModels = false;
        
        segmentator = await pipeline('image-segmentation', 'Xenova/RMBG-1.4');
      } catch (loadErr: any) {
        console.warn('Browser-side model load failed, falling back to server-side execution:', loadErr);
        setCutoutProgress('Running background removal on the server...');
        const res = await fetch('/api/upload/cutout-server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ garmentId, storagePath }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server-side background removal failed.');
        
        await fetchItems();
        alert('✨ Background removed successfully (processed on server)!');
        return;
      }

      setCutoutProgress('Fetching original garment image...');
      const response = await fetch(storagePath);
      if (!response.ok) throw new Error('Failed to retrieve original image from storage.');
      const imageBlob = await response.blob();
      
      setCutoutProgress('Processing cutout (segmenting background)...');
      const { RawImage } = await import('@huggingface/transformers');
      const rawImg = await RawImage.fromBlob(imageBlob);
      const output = await segmentator(rawImg) as any;
      
      setCutoutProgress('Generating transparent image canvas...');
      const canvas = output[0].mask.toCanvas();
      
      setCutoutProgress('Uploading transparent cutout to closet...');
      const uploadBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob: Blob | null) => resolve(blob), 'image/png');
      });
      
      if (!uploadBlob) throw new Error('Canvas rendering failed.');
      
      const formData = new FormData();
      formData.append('garmentId', garmentId);
      formData.append('file', new File([uploadBlob], 'cutout.png', { type: 'image/png' }));
      
      const uploadRes = await fetch('/api/upload/cutout', {
        method: 'POST',
        body: formData,
      });
      
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed.');
      
      await fetchItems();
      alert('✨ Background removed successfully!');
    } catch (err: any) {
      console.error('AI cutout failed:', err);
      alert(`AI Cutout Failed: ${err.message || err}`);
    } finally {
      setCutoutProgress(null);
    }
  };

  // Telemetry Dashboard state
  const [telemetry, setTelemetry] = useState<TelemetryStats | null>(null);
  const [telemetryLogs, setTelemetryLogs] = useState<any[]>([]);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);

  // Measurements Locker state
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [loadingMeasurements, setLoadingMeasurements] = useState(false);

  const fetchMeasurements = async () => {
    setLoadingMeasurements(true);
    try {
      const res = await fetch('/api/measurements');
      const data = await res.json();
      if (data.measurements) setMeasurements(data.measurements);
    } catch (err) {
      console.error('Failed to load measurements:', err);
    } finally {
      setLoadingMeasurements(false);
    }
  };

  // Fetch core data on load
  useEffect(() => {
    fetchItems();
    fetchWearLogs();
    fetchSavedOutfits();
    fetchTelemetry();
    fetchMeasurements();
  }, []);
  // Global clipboard paste helper for existing garments in Edit Modal
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      if (!editingItem) return;

      // 1. Check for image files in clipboard
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              await uploadImageToGarment(file);
              return;
            }
          }
        }
      }

      // 2. Check for copied image URL in clipboard text
      const pastedText = e.clipboardData?.getData('text') || '';
      if (pastedText.trim().startsWith('http://') || pastedText.trim().startsWith('https://')) {
        e.preventDefault();
        setIsUploadingImage(true);
        try {
          const res = await fetch('/api/items/add-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              garmentId: editingItem.id,
              imageUrl: pastedText.trim()
            })
          });
          const data = await res.json();
          if (res.ok) {
            setEditingItem({
              ...editingItem,
              images: data.images
            });
            await fetchItems();
          } else {
            alert(`URL paste failed: ${data.error || 'Unknown error'}`);
          }
        } catch (err: any) {
          alert(`URL paste error: ${err.message}`);
        } finally {
          setIsUploadingImage(false);
        }
      }
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => {
      document.removeEventListener('paste', handleGlobalPaste);
    };
  }, [editingItem]);

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

  const handleSpreadsheetFieldChange = (id: string, field: string, value: any) => {
    setEditedItems(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSaveSpreadsheetRow = async (id: string) => {
    const changes = editedItems[id];
    if (!changes) return;
    try {
      const res = await fetch('/api/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...changes })
      });
      if (res.ok) {
        setEditedItems(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        await fetchItems();
      } else {
        alert('Failed to save changes.');
      }
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    }
  };

  const handleDeleteSpreadsheetRow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this garment?')) return;
    try {
      const res = await fetch(`/api/items?id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchItems();
      } else {
        alert('Failed to delete item.');
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Brand', 'Category', 'Sub-Category', 'Color Family', 'Fabric Blend', 'Fit Block', 'Purchase Price', 'Purchase Year'];
    const rows = items.map(i => [
      i.id,
      i.brand || '',
      i.category,
      i.sub_category,
      i.color_family,
      i.fabric_type || '',
      i.fit_block || '',
      i.price || 0,
      i.purchase_year || ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "threads_wardrobe_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
  const handleFilesSelected = (files: FileList | null, isCameraInput: boolean = false) => {
    if (!files || files.length === 0) return;
    const newGroups = Array.from(files).map((f) => ({
      id: Math.random().toString(36).substring(2, 9),
      files: [f],
      notes: '',
      status: 'pending' as const,
    }));
    setIngestGroups(prev => [...prev, ...newGroups]);

    if (continuousSnap && isCameraInput) {
      setTimeout(() => {
        cameraInputRef.current?.click();
      }, 700);
    }
  };

  // Add detail image to a specific group
  const triggerAddDetail = (groupId: string) => {
    setActiveDetailGroupId(groupId);
    detailFilePickerRef.current?.click();
  };

  const triggerAddDetailCamera = (groupId: string) => {
    setActiveDetailGroupId(groupId);
    detailCameraInputRef.current?.click();
  };

  const handleDetailFilesSelected = (files: FileList | null) => {
    if (!files || !activeDetailGroupId) return;
    const addedFiles = Array.from(files);

    setIngestGroups(prev =>
      prev.map(g => g.id === activeDetailGroupId ? { ...g, files: [...g.files, ...addedFiles] } : g)
    );
    setActiveDetailGroupId(null);
  };

  const handleDeleteGroup = (groupId: string) => {
    setIngestGroups(prev => prev.filter(g => g.id !== groupId));
    setSelectedIngestGroupIds(prev => prev.filter(id => id !== groupId));
  };

  const handleDeleteFileFromGroup = (groupId: string, fileIdx: number) => {
    setIngestGroups(prev =>
      prev.map(g => {
        if (g.id !== groupId) return g;
        return { ...g, files: g.files.filter((_, idx) => idx !== fileIdx) };
      }).filter(g => g.files.length > 0)
    );
  };

  const handleMergeSelectedGroups = () => {
    if (selectedIngestGroupIds.length < 2) return;
    const targetGroupId = selectedIngestGroupIds[0];
    const targetGroup = ingestGroups.find(g => g.id === targetGroupId);
    if (!targetGroup) return;

    const mergedFiles = [...targetGroup.files];
    let mergedNotes = targetGroup.notes;

    ingestGroups.forEach(g => {
      if (g.id !== targetGroupId && selectedIngestGroupIds.includes(g.id)) {
        mergedFiles.push(...g.files);
        if (g.notes) {
          mergedNotes = mergedNotes ? `${mergedNotes}; ${g.notes}` : g.notes;
        }
      }
    });

    setIngestGroups(prev => {
      const updated = prev.map(g => {
        if (g.id === targetGroupId) {
          return { ...g, files: mergedFiles, notes: mergedNotes };
        }
        return g;
      });
      return updated.filter(g => g.id === targetGroupId || !selectedIngestGroupIds.includes(g.id));
    });

    setSelectedIngestGroupIds([]);
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

  const retryGroupUpload = async (groupId: string) => {
    setIngestGroups(prev => prev.map(g => g.id === groupId ? { ...g, status: 'uploading', error: undefined } : g));

    try {
      const groupIdx = ingestGroups.findIndex(g => g.id === groupId);
      if (groupIdx === -1) return;
      const group = ingestGroups[groupIdx];

      const formData = new FormData();
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

      // Set status to processing
      setIngestGroups(prev => prev.map(g => g.id === groupId ? { ...g, status: 'processing' } : g));

      // Trigger pipeline processing for this single ID
      const processRes = await fetch('/api/ingest/batch-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [data.item.id] }),
      });
      
      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.error || 'Processing failed');

      setIngestGroups(prev => prev.map(g => g.id === groupId ? { ...g, status: 'done' } : g));
      
      // Auto-validate if successful
      const successItem = items.find(i => i.id === data.item.id);
      if (successItem) setValidationTarget(successItem);

      await fetchItems();
      fetchTelemetry();
    } catch (err: any) {
      console.error(err);
      setIngestGroups(prev => prev.map(g => g.id === groupId ? { ...g, status: 'failed', error: err.message } : g));
    }
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
    <div className="flex-1 flex flex-col bg-[var(--bg-main)] text-[var(--text-primary)] min-h-screen">
      
      {/* HIDDEN FILE INPUT FOR DETAIL IMAGES */}
      <input 
        ref={detailFilePickerRef}
        type="file" 
        multiple
        accept="image/*"
        onChange={(e) => handleDetailFilesSelected(e.target.files)}
        className="hidden"
      />

      {/* HIDDEN CAMERA INPUTS */}
      <input 
        ref={cameraInputRef}
        type="file" 
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          if (e.target.files) {
            handleFilesSelected(e.target.files, true);
            e.target.value = '';
          }
        }}
        className="hidden"
      />
      <input 
        ref={detailCameraInputRef}
        type="file" 
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          if (e.target.files) {
            handleDetailFilesSelected(e.target.files);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* HEADER */}
      <header className="sticky top-0 z-45 bg-[var(--bg-main)]/95 backdrop-blur-md border-b border-[#EAE5D9] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--bg-card-primary)] border border-[#EAE5D9] flex items-center justify-center overflow-hidden shadow-inner p-1">
            <img src="/icon-192.png" alt="Antigravity Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
              <span className="embroidered-logo">Antigravity Threads</span>
              <span className="text-[10px] bg-[var(--accent-terracotta)]/10 text-[var(--accent-terracotta)] border border-[var(--accent-terracotta)]/25 px-2 py-0.5 rounded-full font-bold">v2.7</span>
            </h1>
          </div>
        </div>
        {telemetry && (
          <button 
            onClick={() => {
              setShowTelemetry(!showTelemetry);
              if (!showTelemetry) fetchTelemetry();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-full bg-[var(--bg-card-primary)] border border-[#EAE5D9] text-[var(--text-secondary)] hover:bg-[var(--bg-card-secondary)] transition tactile-shadow-sm"
          >
            📉 Cost Metrics: ${telemetry.totalCost}
          </button>
        )}
      </header>

      {/* CORE WORKSPACE */}
      <main className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6 mb-24 lg:mb-0">
        
        {/* DESKTOP SIDEBAR NAV */}
        <aside className="hidden lg:flex flex-col w-60 gap-1.5 p-4 pr-3 bg-[var(--bg-sidebar)] rounded-3xl border border-[#DCD1C0] tactile-shadow-md self-start">
          <p className="text-[10px] tracking-widest uppercase font-bold text-[var(--text-secondary)] px-3.5 mb-2 select-none">Atelier Navigation</p>
          <button
            onClick={() => setActiveTab('snap')}
            className={`flex items-center gap-3 px-4.5 py-3 rounded-full font-bold text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 ${
              activeTab === 'snap' 
                ? 'bg-[var(--accent-terracotta)] text-white shadow-md' 
                : 'hover:bg-white/40 text-[var(--text-primary)]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Batch Ingest
          </button>
          
          <button
            onClick={() => setActiveTab('closet')}
            className={`flex items-center gap-3 px-4.5 py-3 rounded-full font-bold text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 ${
              activeTab === 'closet' 
                ? 'bg-[var(--accent-terracotta)] text-white shadow-md' 
                : 'hover:bg-white/40 text-[var(--text-primary)]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            My Closet ({items.length})
          </button>

          <button
            onClick={() => setActiveTab('spreadsheet')}
            className={`flex items-center gap-3 px-4.5 py-3 rounded-full font-bold text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 ${
              activeTab === 'spreadsheet' 
                ? 'bg-[var(--accent-terracotta)] text-white shadow-md' 
                : 'hover:bg-white/40 text-[var(--text-primary)]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            Spreadsheet
          </button>

          <button
            onClick={() => setActiveTab('stylist')}
            className={`flex items-center gap-3 px-4.5 py-3 rounded-full font-bold text-xs uppercase tracking-wider transition-all duration-200 active:scale-95 ${
              activeTab === 'stylist' 
                ? 'bg-[var(--accent-terracotta)] text-white shadow-md' 
                : 'hover:bg-white/40 text-[var(--text-primary)]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            AI Stylist
          </button>
        </aside>

        {/* WORKSPACE AREA */}
        <section className="flex-1 min-w-0 space-y-6">
          
          {/* TAB 1: BATCH INGEST */}
          {activeTab === 'snap' && (
            <div className="space-y-6">
              
              <div className="border border-[#EAE5D9] bg-[var(--bg-card-secondary)] rounded-3xl p-6 tactile-shadow-md">
                <h2 className="text-base font-extrabold text-[var(--text-primary)] mb-1">Tactile Atelier Ingest Queue</h2>
                <p className="text-[var(--text-secondary)] text-xs mb-6">
                  Select primary garment layout photos. Then, add detail shots (laundry tags, textures, sizing labels) under each card container. Gemini will synthesize the data concurrently to extract perfect tags.
                </p>

                <div className="space-y-6">
                  {/* Primary Ingestion Controller */}
                  <div className="border-2 border-dashed border-[#DCD1C0] bg-white/50 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 text-center">
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      multiple 
                      accept="image/*" 
                      onChange={(e) => handleFilesSelected(e.target.files, false)}
                      className="hidden" 
                    />
                    <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                      <svg className="w-8 h-8 text-[var(--accent-terracotta)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <span className="text-xs font-bold text-[var(--text-primary)]">Add Primary Garment Photos</span>
                    </div>

                    <div className="flex w-full max-w-sm gap-3 mt-1">
                      <button
                        type="button"
                        style={{ minHeight: '44px' }}
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex-1 py-3 text-xs font-black bg-[var(--accent-terracotta)] text-white rounded-full active:scale-[0.98] transition shadow-md flex items-center justify-center gap-1.5 hover:bg-[var(--accent-terracotta)]/90"
                      >
                        📸 Take Photo
                      </button>
                      <button
                        type="button"
                        style={{ minHeight: '44px' }}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 py-3 text-xs font-bold bg-[var(--accent-sage)] text-white rounded-full active:scale-[0.98] transition shadow-md flex items-center justify-center gap-1.5 hover:bg-[var(--accent-sage)]/90"
                      >
                        📁 Choose Files
                      </button>
                    </div>

                    <div className="flex items-center justify-between w-full max-w-sm border-t border-[#EAE5D9] pt-3.5 mt-1 select-none">
                      <span className="text-[10px] font-black uppercase text-[var(--text-secondary)] flex items-center gap-1.5">
                        🔄 Continuous Snap Mode
                      </span>
                      <button
                        type="button"
                        onClick={() => setContinuousSnap(!continuousSnap)}
                        className={`text-[9px] font-bold px-3 py-1.5 rounded-full border transition-all ${
                          continuousSnap 
                            ? 'bg-[var(--accent-terracotta)]/15 text-[var(--accent-terracotta)] border-[var(--accent-terracotta)]/30 font-black' 
                            : 'bg-white/60 text-[var(--text-secondary)] border-[#DCD1C0]'
                        }`}
                      >
                        {continuousSnap ? 'ON (Auto-Open)' : 'OFF (Single-Snap)'}
                      </button>
                    </div>
                  </div>

                  {/* Grouped Ingest Cards */}
                  {ingestGroups.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-[#EAE5D9]">
                      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-bold">
                        <span>Items Queue ({ingestGroups.length} items configured)</span>
                        <div className="flex items-center gap-3">
                          {selectedIngestGroupIds.length >= 2 && (
                            <button 
                              onClick={handleMergeSelectedGroups} 
                              className="px-3 py-1 bg-[var(--accent-apricot)] text-[var(--text-primary)] font-black rounded-full text-[9px] hover:bg-[var(--accent-apricot)]/90 transition shadow-sm"
                            >
                              🔗 Merge Selected ({selectedIngestGroupIds.length})
                            </button>
                          )}
                          <button onClick={clearIngestGroups} className="text-[var(--accent-terracotta)] font-bold hover:underline">Clear All</button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {ingestGroups.map((group) => (
                          <div key={group.id} className="p-5 bg-white border border-[#EAE5D9] rounded-2xl flex flex-col justify-between space-y-4 relative tactile-shadow-sm">
                            {/* Card Header with Merge Checkbox & Delete */}
                            <div className="flex items-center justify-between border-b border-[#F5F2EA] pb-2">
                              <label className="flex items-center gap-1.5 cursor-pointer text-[9px] text-[var(--text-secondary)] font-bold select-none">
                                <input
                                  type="checkbox"
                                  checked={selectedIngestGroupIds.includes(group.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedIngestGroupIds(prev => [...prev, group.id]);
                                    } else {
                                      setSelectedIngestGroupIds(prev => prev.filter(id => id !== group.id));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded border-[#DCD1C0] text-[var(--accent-terracotta)] focus:ring-0 focus:ring-offset-0 bg-white"
                                />
                                Select to Merge
                              </label>
                              <button
                                type="button"
                                onClick={() => handleDeleteGroup(group.id)}
                                className="text-[9px] font-bold text-[var(--accent-terracotta)] hover:underline"
                              >
                                ✕ Delete Card
                              </button>
                            </div>

                            <div className="space-y-3">
                              {/* Stack of thumbnails in polaroid frames */}
                              <div className="flex items-center flex-wrap gap-3.5">
                                {group.files.map((file, fIdx) => (
                                  <div key={fIdx} className="polaroid-frame w-14 h-14 shrink-0 relative">
                                    <img src={URL.createObjectURL(file)} alt="" className="object-cover w-full h-full rounded-sm" />
                                    {fIdx === 0 && (
                                      <span className="absolute bottom-0 inset-x-0 bg-[var(--accent-sage)]/90 text-white text-[6px] font-black uppercase text-center py-0.5 rounded-b-sm">Primary</span>
                                    )}
                                    {/* Delete individual photo button */}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFileFromGroup(group.id, fIdx)}
                                      className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-[var(--accent-terracotta)] text-white hover:bg-[var(--accent-terracotta)]/95 text-[8px] flex items-center justify-center rounded-full shadow-sm transition"
                                      title="Remove image"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                                <button 
                                  onClick={() => triggerAddDetailCamera(group.id)}
                                  className="w-14 h-14 rounded-xl border-2 border-dashed border-[#DCD1C0] bg-[var(--bg-card-secondary)]/50 flex flex-col items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-card-secondary)] transition"
                                  title="Snap Tag Close-up or detail shot"
                                >
                                  <span className="text-[10px]">📸</span>
                                  <span className="text-[6px] font-bold uppercase tracking-wider mt-0.5">Snap</span>
                                </button>
                                <button 
                                  onClick={() => triggerAddDetail(group.id)}
                                  className="w-14 h-14 rounded-xl border-2 border-dashed border-[#DCD1C0] bg-[var(--bg-card-secondary)]/50 flex flex-col items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-card-secondary)] transition"
                                  title="Add Tag Close-up or detail shot"
                                >
                                  <span className="text-[10px]">+</span>
                                  <span className="text-[6px] font-bold uppercase tracking-wider mt-0.5">Detail</span>
                                </button>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[8px] uppercase font-bold text-[var(--text-secondary)]">Staging notes (e.g. fit, location)</span>
                                <input 
                                  type="text"
                                  value={group.notes}
                                  onChange={(e) => handleUpdateNotes(group.id, e.target.value)}
                                  className="w-full text-[10px] bg-[var(--bg-card-secondary)] border border-[#EAE5D9] rounded-xl px-3 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-terracotta)]/40"
                                  placeholder="Brand details, sizing labels details..."
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] pt-2.5 border-t border-[#F5F2EA]">
                              <span className="text-[var(--text-secondary)] font-bold">Images: {group.files.length}</span>
                              <div className="flex items-center gap-2">
                                {group.status === 'failed' && (
                                  <button
                                    type="button"
                                    onClick={() => retryGroupUpload(group.id)}
                                    className="px-2.5 py-1 rounded-full bg-[var(--accent-terracotta)]/10 text-[var(--accent-terracotta)] border border-[var(--accent-terracotta)]/20 hover:bg-[var(--accent-terracotta)]/20 transition text-[9px] font-bold"
                                  >
                                    🔄 Retry
                                  </button>
                                )}
                                <span className={`font-bold text-[9px] px-2 py-0.5 rounded-full ${
                                  group.status === 'done' ? 'bg-[var(--accent-sage)]/10 text-[var(--accent-sage)]' :
                                  group.status === 'uploading' ? 'text-[var(--text-secondary)] animate-pulse' :
                                  group.status === 'processing' ? 'text-[var(--accent-apricot)] animate-pulse' :
                                  group.status === 'failed' ? 'bg-[var(--accent-terracotta)]/10 text-[var(--accent-terracotta)]' : 'text-zinc-550'
                                }`}>{group.status.toUpperCase()}</span>
                              </div>
                            </div>
                            {group.status === 'failed' && group.error && (
                              <div className="text-[9px] text-[var(--accent-terracotta)] bg-[var(--accent-terracotta)]/5 border border-[var(--accent-terracotta)]/10 rounded-xl p-2.5 mt-1.5 leading-relaxed font-mono">
                                ❌ Error: {group.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={triggerBatchUpload}
                        disabled={isProcessingBatch}
                        className="w-full py-3 bg-[var(--accent-terracotta)] text-white font-extrabold text-xs rounded-full hover:bg-[var(--accent-terracotta)]/90 transition shadow-md active:scale-95 duration-200"
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
                      <div className="flex flex-col items-center justify-center p-4 bg-zinc-950/40 rounded-xl border border-zinc-850 space-y-4">
                        <div className="relative w-44 h-44 flex flex-col items-center justify-center rounded-lg overflow-hidden bg-black">
                          <img 
                            src={validationTarget.primary_image_url || ''} 
                            alt="Garment preview" 
                            className="object-contain w-full h-full mix-blend-lighten filter saturate-[1.1] contrast-[1.05]"
                          />
                        </div>
                        <div className="w-full flex gap-2">
                          <input
                            type="text"
                            value={searchQueryText}
                            onChange={(e) => setSearchQueryText(e.target.value)}
                            placeholder="Search query (e.g. White Oxford Shirt)..."
                            className="flex-1 bg-[#0b0c10] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-400"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              setIsSearchingImage(true);
                              setSearchResults(null);
                              try {
                                const res = await fetch('/api/items/search-image', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    brand: '',
                                    description: searchQueryText
                                  }),
                                });
                                const data = await res.json();
                                if (res.ok) {
                                  setSearchResults(data.images || []);
                                } else {
                                  alert(`Search failed: ${data.error || 'Unknown error'}`);
                                }
                              } catch (err: any) {
                                alert(`Search error: ${err.message}`);
                              } finally {
                                setIsSearchingImage(false);
                              }
                            }}
                            className="px-4 py-2 text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 font-bold rounded-xl transition flex items-center justify-center gap-1.5 shrink-0"
                          >
                            {isSearchingImage ? 'Searching...' : '🔍 Find Photo'}
                          </button>
                        </div>

                        {/* SEARCH RESULTS PANEL IN VALIDATION */}
                        {searchResults && (
                          <div className="w-full border border-zinc-800 rounded-xl p-3 bg-zinc-950/60 space-y-3 animate-fade-in">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] uppercase font-bold text-teal-400">Web Search Results</h4>
                              <button
                                type="button"
                                onClick={() => setSearchResults(null)}
                                className="text-zinc-500 hover:text-white text-xs"
                              >
                                ✕ Close
                              </button>
                            </div>
                            
                            {searchResults.length === 0 ? (
                              <p className="text-[10px] text-zinc-500 text-center py-2">No matching manufacturer photos found.</p>
                            ) : (
                              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                                {searchResults.map((img: any, idx: number) => (
                                  <div
                                    key={idx}
                                    onClick={async () => {
                                      if (isReplacingImage) return;
                                      setIsReplacingImage(true);
                                      try {
                                        const res = await fetch('/api/items/search-image', {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            garmentId: validationTarget.id,
                                            imageUrl: img.url
                                          }),
                                        });
                                        const data = await res.json();
                                        if (res.ok) {
                                          setValidationTarget({
                                            ...validationTarget,
                                            primary_image_url: data.url,
                                            images: validationTarget.images.map((gImg: any) =>
                                              gImg.is_primary_profile ? { ...gImg, storage_path: data.url } : gImg
                                            )
                                          });
                                          await fetchItems();
                                          setSearchResults(null);
                                          alert('✨ Garment photo successfully replaced!');
                                        } else {
                                          alert(`Failed to replace photo: ${data.error || 'Unknown error'}`);
                                        }
                                      } catch (err: any) {
                                        alert(`Error replacing photo: ${err.message}`);
                                      } finally {
                                        setIsReplacingImage(false);
                                      }
                                    }}
                                    className="relative aspect-square border border-zinc-800 rounded-lg overflow-hidden bg-black cursor-pointer hover:border-teal-400 transition group"
                                  >
                                    <img src={img.url} alt="" className="object-contain w-full h-full" />
                                    <div className="absolute inset-x-0 bottom-0 bg-black/80 text-[7px] text-zinc-400 px-1 py-0.5 truncate text-center group-hover:text-teal-400">
                                      {img.source}
                                    </div>
                                    {isReplacingImage && (
                                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[8px] text-teal-400 animate-pulse">
                                        Replacing...
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        
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
                            <label className="text-[10px] uppercase font-bold text-zinc-500">Purchase Year</label>
                            <input
                              type="number"
                              placeholder="e.g. 2026"
                              value={validationTarget.purchase_year || ''}
                              onChange={(e) => setValidationTarget({ ...validationTarget, purchase_year: e.target.value ? Number(e.target.value) : null })}
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
                            onClick={async () => {
                              const primaryImg = validationTarget.images?.find((img: any) => img.is_primary_profile) || validationTarget.images?.[0] || { storage_path: validationTarget.primary_image_url };
                              if (!primaryImg || !primaryImg.storage_path) {
                                alert('No image found for this garment.');
                                return;
                              }
                              setValidationTarget(null);
                              await runClientSideCutout(validationTarget.id, primaryImg.storage_path);
                            }}
                            className="px-4 py-2 bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 rounded-lg text-xs font-bold transition"
                          >
                            ✨ Run AI Cutout
                          </button>
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

                        {/* Brand, Price, & Year inputs */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Brand</span>
                            <input
                              type="text"
                              value={validationTarget.brand || ''}
                              onChange={(e) => setValidationTarget({ ...validationTarget, brand: e.target.value || null })}
                              className="w-full bg-zinc-900/60 border border-zinc-850 rounded-xl p-3.5 text-xs text-white placeholder-zinc-600 focus:border-teal-400 outline-none"
                              placeholder="Brand"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Price ($)</span>
                            <input
                              type="number"
                              value={validationTarget.price || ''}
                              onChange={(e) => setValidationTarget({ ...validationTarget, price: Number(e.target.value) })}
                              className="w-full bg-zinc-900/60 border border-zinc-850 rounded-xl p-3.5 text-xs text-white placeholder-zinc-600 focus:border-teal-400 outline-none"
                              placeholder="Price"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Year</span>
                            <input
                              type="number"
                              value={validationTarget.purchase_year || ''}
                              onChange={(e) => setValidationTarget({ ...validationTarget, purchase_year: e.target.value ? Number(e.target.value) : null })}
                              className="w-full bg-zinc-900/60 border border-zinc-850 rounded-xl p-3.5 text-xs text-white placeholder-zinc-600 focus:border-teal-400 outline-none"
                              placeholder="Year"
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

          {/* TAB: SPREADSHEET BULK EDITOR */}
          {activeTab === 'spreadsheet' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    📊 Wardrobe Spreadsheet Editor
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Edit garment metadata inline, paste image URLs to replace photos instantly, and perform bulk updates.
                  </p>
                </div>
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2.5 bg-teal-500 text-black font-black text-xs rounded-xl hover:bg-teal-400 active:scale-95 transition-all shadow-lg flex items-center gap-1.5 self-start md:self-auto"
                >
                  📥 Export CSV
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-[#1f2833]/10 shadow-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-950/40 border-b border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider text-[10px] select-none">
                      <th className="p-2.5 w-[100px]">Image</th>
                      <th className="p-2.5 min-w-[90px]">Brand</th>
                      <th className="p-2.5 w-[88px]">Category</th>
                      <th className="p-2.5 min-w-[90px]">Sub-Cat</th>
                      <th className="p-2.5 min-w-[70px]">Color</th>
                      <th className="p-2.5 min-w-[100px]">Fabric</th>
                      <th className="p-2.5 min-w-[80px]">Fit</th>
                      <th className="p-2.5 w-[64px]">$ Price</th>
                      <th className="p-2.5 w-[60px]">Year</th>
                      <th className="p-2.5 text-right w-[90px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850/60 bg-[#0b0c10]/20">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-zinc-500 font-semibold">
                          No garments found in wardrobe.
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => {
                        const hasChanges = !!editedItems[item.id];
                        const brandVal = editedItems[item.id]?.brand !== undefined ? (editedItems[item.id]?.brand || '') : (item.brand || '');
                        const categoryVal = editedItems[item.id]?.category || item.category;
                        const subCategoryVal = editedItems[item.id]?.sub_category !== undefined ? (editedItems[item.id]?.sub_category || '') : (item.sub_category || '');
                        const colorVal = editedItems[item.id]?.color_family !== undefined ? (editedItems[item.id]?.color_family || '') : (item.color_family || '');
                        const fabricVal = editedItems[item.id]?.fabric_type !== undefined ? (editedItems[item.id]?.fabric_type || '') : (item.fabric_type || '');
                        const fitVal = editedItems[item.id]?.fit_block !== undefined ? (editedItems[item.id]?.fit_block || '') : (item.fit_block || '');
                        const priceVal = editedItems[item.id]?.price !== undefined ? (editedItems[item.id]?.price || 0) : (item.price || 0);
                        const yearVal = editedItems[item.id]?.purchase_year !== undefined ? (editedItems[item.id]?.purchase_year || '') : (item.purchase_year || '');
                        
                        return (
                          <tr key={item.id} className="hover:bg-zinc-900/30 transition-colors">
                            {/* Image Swap */}
                            <td className="p-2">
                               <div className="flex flex-col items-center gap-1">
                                 <div
                                   className="w-10 h-10 rounded bg-black overflow-hidden border border-zinc-800 cursor-pointer hover:border-teal-400 transition"
                                   onClick={() => setEditingItem(item)}
                                   title="Click to open editor"
                                 >
                                   {item.primary_image_url ? (
                                     <img src={item.primary_image_url} alt="" className="w-full h-full object-contain" />
                                   ) : (
                                     <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px]">📷</div>
                                   )}
                                 </div>
                                 <input
                                   type="text"
                                   placeholder="Paste URL..."
                                   onBlur={async (e) => {
                                     const val = e.target.value.trim();
                                     if (val && (val.startsWith('http://') || val.startsWith('https://'))) {
                                       try {
                                         const res = await fetch('/api/items/search-image', {
                                           method: 'PUT',
                                           headers: { 'Content-Type': 'application/json' },
                                           body: JSON.stringify({ garmentId: item.id, imageUrl: val })
                                         });
                                         if (res.ok) {
                                           e.target.value = '';
                                           await fetchItems();
                                         } else {
                                           alert('Failed to add image.');
                                         }
                                       } catch (err: any) {
                                         alert(`Error: ${err.message}`);
                                       }
                                     }
                                   }}
                                   className="w-full text-[8px] bg-zinc-900/80 border border-zinc-800 rounded px-1 py-0.5 text-zinc-300 placeholder-zinc-650 focus:outline-none focus:border-teal-400"
                                 />
                               </div>
                             </td>
                            {/* Brand */}
                            <td className="p-2">
                              <input
                                type="text"
                                value={brandVal}
                                onChange={(e) => handleSpreadsheetFieldChange(item.id, 'brand', e.target.value || null)}
                                className="w-full text-[11px] bg-zinc-900/60 border border-zinc-800/80 rounded px-2 py-1.5 text-white focus:outline-none focus:border-teal-400/50"
                              />
                            </td>
                            {/* Category */}
                            <td className="p-3">
                              <select
                                value={categoryVal}
                                onChange={(e) => handleSpreadsheetFieldChange(item.id, 'category', e.target.value)}
                                className="w-full text-[11px] bg-zinc-900/60 border border-zinc-800/80 rounded px-2 py-1.5 text-white focus:outline-none focus:border-teal-400/50"
                              >
                                <option value="Tops">Tops</option>
                                <option value="Bottoms">Bottoms</option>
                                <option value="Outerwear">Outerwear</option>
                                <option value="Footwear">Footwear</option>
                                <option value="Tailoring">Tailoring</option>
                              </select>
                            </td>
                            {/* Sub-Category */}
                            <td className="p-3">
                              <input
                                type="text"
                                value={subCategoryVal}
                                onChange={(e) => handleSpreadsheetFieldChange(item.id, 'sub_category', e.target.value)}
                                className="w-full text-[11px] bg-zinc-900/60 border border-zinc-800/80 rounded px-2 py-1.5 text-white focus:outline-none focus:border-teal-400/50"
                              />
                            </td>
                            {/* Color */}
                            <td className="p-3">
                              <input
                                type="text"
                                value={colorVal}
                                onChange={(e) => handleSpreadsheetFieldChange(item.id, 'color_family', e.target.value)}
                                className="w-full text-[11px] bg-zinc-900/60 border border-zinc-800/80 rounded px-2 py-1.5 text-white focus:outline-none focus:border-teal-400/50"
                              />
                            </td>
                            {/* Fabric Blend */}
                            <td className="p-3">
                              <input
                                type="text"
                                value={fabricVal}
                                onChange={(e) => handleSpreadsheetFieldChange(item.id, 'fabric_type', e.target.value || null)}
                                className="w-full text-[11px] bg-zinc-900/60 border border-zinc-800/80 rounded px-2 py-1.5 text-white focus:outline-none focus:border-teal-400/50"
                                placeholder="e.g. 100% Cotton"
                              />
                            </td>
                            {/* Fit Block */}
                            <td className="p-3">
                              <input
                                type="text"
                                value={fitVal}
                                onChange={(e) => handleSpreadsheetFieldChange(item.id, 'fit_block', e.target.value || null)}
                                className="w-full text-[11px] bg-zinc-900/60 border border-zinc-800/80 rounded px-2 py-1.5 text-white focus:outline-none focus:border-teal-400/50"
                              />
                            </td>
                            {/* Price */}
                            <td className="p-3">
                              <input
                                type="number"
                                value={priceVal}
                                onChange={(e) => handleSpreadsheetFieldChange(item.id, 'price', Number(e.target.value))}
                                className="w-full text-[11px] bg-zinc-900/60 border border-zinc-800/80 rounded px-2 py-1.5 text-white focus:outline-none focus:border-teal-400/50"
                              />
                            </td>
                            {/* Year */}
                            <td className="p-3">
                              <input
                                type="number"
                                value={yearVal}
                                onChange={(e) => handleSpreadsheetFieldChange(item.id, 'purchase_year', e.target.value ? Number(e.target.value) : null)}
                                className="w-full text-[11px] bg-zinc-900/60 border border-zinc-800/80 rounded px-2 py-1.5 text-white focus:outline-none focus:border-teal-400/50"
                                placeholder="YYYY"
                              />
                            </td>
                            {/* Actions */}
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={!hasChanges}
                                  onClick={() => handleSaveSpreadsheetRow(item.id)}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${
                                    hasChanges 
                                      ? 'bg-teal-400 text-zinc-950 hover:bg-teal-300 active:scale-95' 
                                      : 'bg-zinc-850 text-zinc-600 cursor-not-allowed'
                                  }`}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSpreadsheetRow(item.id)}
                                  className="px-2 py-1.5 text-[10px] font-bold bg-zinc-900 text-rose-400 hover:bg-rose-500/10 rounded-lg border border-zinc-800 transition active:scale-95"
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: MY CLOSET */}
          {activeTab === 'closet' && (
            <div className="space-y-6">
              
              <div className="flex border-b border-zinc-800 gap-6 overflow-x-auto scrollbar-none whitespace-nowrap pb-1">
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
                <button
                  onClick={() => setClosetSubTab('locker')}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition ${
                    closetSubTab === 'locker' ? 'border-b-2 border-teal-400 text-teal-400' : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  📏 Sizing Locker ({measurements.length})
                </button>
                <button
                  onClick={() => setClosetSubTab('analytics')}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition ${
                    closetSubTab === 'analytics' ? 'border-b-2 border-teal-400 text-teal-400' : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  🔍 Gap Finder
                </button>
                <button
                  onClick={() => setClosetSubTab('guide')}
                  className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition ${
                    closetSubTab === 'guide' ? 'border-b-2 border-teal-400 text-teal-400' : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  📖 Style Guide
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
                    <div className="text-center py-12"><p className="text-[var(--text-secondary)] text-xs">Loading items...</p></div>
                  ) : filteredItems.length === 0 ? (
                    <div className="text-center py-12 border border-[#EAE5D9] border-dashed rounded-2xl bg-white/40">
                      <p className="text-[var(--text-secondary)] text-xs">No matching garments found in your closet.</p>
                    </div>
                  ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                      {filteredItems.map((item) => (
                        <div 
                          key={item.id}
                          onClick={() => setEditingItem(item)}
                          className="group relative border border-[#EAE5D9] bg-white rounded-3xl overflow-hidden hover:border-[#DCD1C0] cursor-pointer flex flex-col transition-all duration-200 hover:-translate-y-0.5 tactile-shadow-sm"
                        >
                          <input 
                            type="checkbox"
                            checked={selectedItemIds.includes(item.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleSelectItem(item.id);
                            }}
                            className="absolute top-3 right-3 z-10 w-4 h-4 rounded border-[#DCD1C0] text-[var(--accent-terracotta)] accent-[var(--accent-terracotta)] focus:ring-0 bg-white"
                          />

                          <div className="relative w-full aspect-square bg-[#FBFBFA] border-b border-[#EAE5D9] flex items-center justify-center p-2.5">
                            {item.primary_image_url ? (
                              <img src={item.primary_image_url} alt="" className="object-contain w-full h-full mix-blend-multiply" />
                            ) : (
                              <div className="text-[10px] text-[var(--text-secondary)] font-bold">No Photo</div>
                            )}
                            
                            {item.images && item.images.length > 1 && (
                              <span className="absolute bottom-2.5 right-2.5 bg-white/90 border border-[#EAE5D9] px-2 py-0.5 rounded-full text-[8px] font-black text-[var(--accent-terracotta)] shadow-sm">
                                📷 {item.images.length}
                              </span>
                            )}

                            {item.status === 'Processing' && (
                              <div className="absolute inset-0 bg-white/70 flex items-center justify-center backdrop-blur-xs">
                                <div className="w-5 h-5 border-2 border-t-[var(--accent-terracotta)] border-[#EAE5D9] rounded-full animate-spin"></div>
                              </div>
                            )}
                          </div>

                          <div className="p-3.5 space-y-1">
                            <div className="flex items-center justify-between text-[8px] uppercase font-extrabold text-[var(--text-secondary)]">
                              <span>{item.sub_category}</span>
                              {getItemWornCount(item.id) > 0 && (
                                <span className="text-[var(--accent-sage)] font-black">Worn {getItemWornCount(item.id)}x</span>
                              )}
                            </div>
                            <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{item.brand ? `${item.brand} ` : ''}{item.color_family}</h4>
                            <div className="flex items-center justify-between text-[9px] text-[var(--text-secondary)] pt-2 border-t border-[#F5F2EA] mt-1.5">
                              <span>CPW: <strong className="text-[var(--text-primary)] font-black">${getItemCostPerWear(item)}</strong></span>
                              <button
                                onClick={(e) => logGarmentWorn(item.id, e)}
                                className="text-[var(--accent-terracotta)] hover:text-[var(--accent-terracotta)]/85 font-black uppercase text-[8px] tracking-wider"
                              >
                                + Log Wear
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Matrix View - Refactored as soft cards list to demolish strict table layout */
                    <div className="space-y-3.5">
                      {filteredItems.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setEditingItem(item)}
                          className="flex items-center justify-between gap-4 p-4 bg-white border border-[#EAE5D9] rounded-2xl cursor-pointer hover:border-[#DCD1C0] transition-all tactile-shadow-sm group"
                        >
                          <div className="flex items-center gap-4 min-w-0" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox"
                              checked={selectedItemIds.includes(item.id)}
                              onChange={() => handleSelectItem(item.id)}
                              className="w-4 h-4 rounded border-[#DCD1C0] text-[var(--accent-terracotta)] accent-[var(--accent-terracotta)] focus:ring-0 bg-white"
                            />
                            <div className="w-12 h-12 rounded-xl border border-[#EAE5D9] overflow-hidden bg-[#FBFBFA] p-1 flex-shrink-0 flex items-center justify-center">
                              {item.primary_image_url ? (
                                <img src={item.primary_image_url} alt="" className="object-contain w-full h-full mix-blend-multiply" />
                              ) : (
                                <span className="text-[8px] text-[var(--text-secondary)]">📷</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[8px] font-black uppercase text-[var(--text-secondary)] tracking-wider">{item.category}</span>
                              <h4 className="text-xs font-extrabold text-[var(--text-primary)] truncate mt-0.5">
                                {item.brand ? `${item.brand} ` : ''}{item.color_family} {item.sub_category}
                              </h4>
                              {/* Style specs into rounded textile tags */}
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[8px] font-black uppercase bg-[var(--bg-card-secondary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full border border-[#EAE5D9]">
                                  Fabric: {item.fabric_type || 'N/A'}
                                </span>
                                <span className="text-[8px] font-black uppercase bg-[var(--bg-card-secondary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full border border-[#EAE5D9]">
                                  Fit: {item.fit_block || 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 shrink-0">
                            <div className="text-right">
                              <span className="text-[8px] font-bold text-[var(--text-secondary)] uppercase block">Price</span>
                              <span className="text-xs font-bold text-[var(--text-primary)]">${item.price || '0'}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[8px] font-bold text-[var(--text-secondary)] uppercase block">Worn</span>
                              <span className="text-xs font-bold text-[var(--accent-sage)]">{getItemWornCount(item.id)}x</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[8px] font-bold text-[var(--text-secondary)] uppercase block">CPW</span>
                              <span className="text-xs font-extrabold text-[var(--accent-terracotta)]">${getItemCostPerWear(item)}</span>
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => logGarmentWorn(item.id)}
                                className="px-3 py-1.5 rounded-full bg-[var(--accent-terracotta)] text-white hover:bg-[var(--accent-terracotta)]/90 text-[9px] font-extrabold transition shadow-sm"
                              >
                                + Wear
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
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

              {/* MEASUREMENTS LOCKER SUB-TAB */}
              {closetSubTab === 'locker' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white">📏 Sizing & Measurements Locker</h3>
                    <p className="text-zinc-400 text-xs leading-relaxed">
                      Store your exact body sizes and reference measurements of garments that fit you perfectly. Reference them anytime when shopping!
                    </p>

                    <form 
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const label = formData.get('label') as string;
                        const type = formData.get('type') as 'body' | 'garment';
                        const details = {
                          chest: formData.get('chest') as string,
                          waist: formData.get('waist') as string,
                          inseam: formData.get('inseam') as string,
                          sleeve: formData.get('sleeve') as string,
                          shoulder: formData.get('shoulder') as string,
                          length: formData.get('length') as string,
                        };

                        try {
                          const res = await fetch('/api/measurements', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ label, measurement_type: type, details }),
                          });
                          if (res.ok) {
                            fetchMeasurements();
                            e.currentTarget.reset();
                          }
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="space-y-3 pt-3 border-t border-zinc-850"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-550">Label / Name</label>
                          <input 
                            name="label" 
                            type="text" 
                            required 
                            placeholder="e.g. My Body, Favorite Overshirt" 
                            className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2.5 text-xs text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-zinc-550">Measurement Type</label>
                          <select 
                            name="type" 
                            className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2.5 text-xs text-white"
                          >
                            <option value="body">Personal Body Sizes</option>
                            <option value="garment">Flat-Laid Garment Sizes</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-zinc-550">Chest (")</label>
                          <input name="chest" type="text" placeholder='e.g. 40' className="w-full bg-[#0b0c10] border border-zinc-850 rounded p-1.5 text-xs text-center text-white" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-zinc-550">Waist (")</label>
                          <input name="waist" type="text" placeholder='e.g. 32' className="w-full bg-[#0b0c10] border border-zinc-855 rounded p-1.5 text-xs text-center text-white" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-zinc-550">Inseam (")</label>
                          <input name="inseam" type="text" placeholder='e.g. 30' className="w-full bg-[#0b0c10] border border-zinc-855 rounded p-1.5 text-xs text-center text-white" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-zinc-550">Sleeve (")</label>
                          <input name="sleeve" type="text" placeholder='e.g. 34' className="w-full bg-[#0b0c10] border border-zinc-855 rounded p-1.5 text-xs text-center text-white" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-zinc-550">Shoulder (")</label>
                          <input name="shoulder" type="text" placeholder='e.g. 18' className="w-full bg-[#0b0c10] border border-zinc-855 rounded p-1.5 text-xs text-center text-white" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-zinc-550">Length (")</label>
                          <input name="length" type="text" placeholder='e.g. 28' className="w-full bg-[#0b0c10] border border-zinc-855 rounded p-1.5 text-xs text-center text-white" />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 text-xs font-black bg-teal-400 text-zinc-950 rounded-xl active:scale-[0.98] transition shadow"
                      >
                        💾 Save to Locker
                      </button>
                    </form>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {measurements.map((m) => (
                      <div key={m.id} className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl flex flex-col justify-between space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-[8px] uppercase font-bold px-2 py-0.5 rounded-full ${
                              m.measurement_type === 'body' 
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                                : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                            }`}>
                              {m.measurement_type}
                            </span>
                            <h4 className="text-sm font-bold text-white mt-1.5">{m.label}</h4>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/measurements?id=${m.id}`, { method: 'DELETE' });
                                if (res.ok) fetchMeasurements();
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="text-xs text-rose-400 hover:text-rose-300 font-bold"
                          >
                            Delete
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2 bg-[#1f2833]/10 border border-zinc-850 rounded-xl p-3 text-[10px]">
                          {Object.entries(m.details as Record<string, any>).map(([key, val]) => (
                            val ? (
                              <div key={key} className="text-center">
                                <span className="text-zinc-550 uppercase text-[8px] block font-bold">{key}</span>
                                <span className="text-white font-black font-mono">{String(val)}"</span>
                              </div>
                            ) : null
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GAP FINDER & ANALYTICS SUB-TAB */}
              {closetSubTab === 'analytics' && (
                <div className="space-y-6 animate-fade-in text-[var(--text-primary)]">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Indexing breakdown */}
                    <div className="border border-[#EAE5D9] bg-white rounded-3xl p-5 space-y-4 tactile-shadow-sm">
                      <h3 className="text-sm font-extrabold text-[var(--text-primary)]">📊 Category Distribution</h3>
                      <div className="space-y-3.5">
                        {['Tops', 'Bottoms', 'Outerwear', 'Footwear', 'Tailoring'].map((cat) => {
                          const count = items.filter(i => i.category === cat).length;
                          const percentage = items.length > 0 ? (count / items.length) * 100 : 0;
                          return (
                            <div key={cat} className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold">
                                <span className="text-[var(--text-primary)]">{cat}</span>
                                <span className="text-[var(--text-secondary)]">{count} items ({Math.round(percentage)}%)</span>
                              </div>
                              <div className="w-full bg-[var(--bg-card-secondary)] rounded-full h-2 overflow-hidden shadow-inner">
                                <div className="bg-[var(--accent-sage)] h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Gap finder */}
                    <div className="border border-[#EAE5D9] bg-white rounded-3xl p-5 space-y-4 tactile-shadow-sm">
                      <h3 className="text-sm font-extrabold text-[var(--text-primary)]">🔍 Gap & Overindexing Analysis</h3>
                      <div className="space-y-3 text-xs leading-relaxed text-[var(--text-primary)] font-medium">
                        {items.filter(i => i.category === 'Footwear').length === 0 ? (
                          <div className="border-l-4 border-[var(--accent-terracotta)] bg-[var(--bg-card-secondary)] rounded-r-xl p-3.5 text-[var(--text-primary)]">
                            <strong className="text-[var(--accent-terracotta)] font-black">⚠️ Footwear Gap</strong>: You have no footwear registered! Trousers need shoes to complete silouhettes. Register calfskin loafers or canvas sneakers.
                          </div>
                        ) : null}
                        {items.filter(i => i.category === 'Tailoring').length === 0 ? (
                          <div className="border-l-4 border-[var(--accent-apricot)] bg-[var(--bg-card-secondary)] rounded-r-xl p-3.5 text-[var(--text-primary)]">
                            <strong className="text-[var(--accent-apricot)] font-black">💡 Tailoring Gap</strong>: No tailoring curated. Consider adding a charcoal blazer to elevate casual bottom coordinates.
                          </div>
                        ) : null}
                        {items.filter(i => i.category === 'Tops').length > 10 ? (
                          <div className="border-l-4 border-[var(--accent-sage)] bg-[var(--bg-card-secondary)] rounded-r-xl p-3.5 text-[var(--text-primary)]">
                            <strong className="text-[var(--accent-sage)] font-black">📈 Overindexed on Tops</strong>: You have {items.filter(i => i.category === 'Tops').length} tops. Focus on coordinating bottoms and outerwear layers to maximize wear combinations.
                          </div>
                        ) : null}
                        <div className="bg-[var(--bg-card-secondary)] border border-[#EAE5D9] rounded-2xl p-4 space-y-1.5 shadow-xs">
                          <span className="text-[9px] uppercase font-black tracking-wider text-[var(--accent-terracotta)]">Closet Balance Index</span>
                          <p className="text-[var(--text-secondary)] leading-relaxed font-bold">
                            Your wardrobe ratio is <strong>{Math.round((items.filter(i => i.category === 'Tops').length / Math.max(items.filter(i => i.category === 'Bottoms').length, 1)) * 10) / 10} Tops to 1 Bottom</strong>. An optimal ratio is 3:1 to prevent styling fatigue.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* COLOR HARMONY PANEL */}
                  <div className="border border-[#EAE5D9] bg-white rounded-3xl p-5 space-y-4 tactile-shadow-sm">
                    <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                      <span>🎨 Tonal Harmony & Color Palette Analysis</span>
                    </h3>
                    <p className="text-[var(--text-secondary)] text-xs font-semibold">
                      Evaluating color wheel pairings, tonal contrast distribution, and classic menswear formulas using your active closet.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* Dominant Swatches */}
                      <div className="p-4 bg-[var(--bg-card-secondary)]/50 border border-[#EAE5D9] rounded-2xl space-y-3.5">
                        <span className="text-[10px] uppercase font-black text-[var(--accent-terracotta)] tracking-wider">Dominant Wardrobe Swatches</span>
                        <div className="flex flex-wrap gap-2.5">
                          {items.length === 0 ? (
                            <span className="text-[var(--text-secondary)] text-xs">No garments registered yet.</span>
                          ) : (
                            Object.entries(
                              items.reduce((acc: Record<string, { count: number; hex?: string }>, item) => {
                                const col = item.color_family;
                                if (!col) return acc;
                                if (!acc[col]) acc[col] = { count: 0, hex: item.hex_code || undefined };
                                acc[col].count += 1;
                                return acc;
                              }, {})
                            )
                              .sort((a, b) => b[1].count - a[1].count)
                              .slice(0, 6)
                              .map(([color, data]) => (
                                <div key={color} className="flex items-center gap-2.5 bg-white border border-[#EAE5D9] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] shadow-xs transition-transform duration-200 hover:-translate-y-0.5">
                                  <span 
                                    className="w-4 h-4 rounded-full border border-[#DCD1C0] shrink-0" 
                                    style={{ backgroundColor: data.hex || '#333' }}
                                    title={color}
                                  />
                                  <div className="flex flex-col">
                                    <span className="font-extrabold text-[var(--text-primary)] truncate max-w-[70px] text-[10px]">{color}</span>
                                    <span className="text-[8px] text-[var(--text-secondary)] font-bold">{data.count} items</span>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      {/* Tonal Contrast Balance */}
                      <div className="p-4 bg-[var(--bg-card-secondary)]/50 border border-[#EAE5D9] rounded-2xl space-y-3.5">
                        <span className="text-[10px] uppercase font-black text-[var(--accent-terracotta)] tracking-wider">Contrast Distribution</span>
                        {items.length === 0 ? (
                          <span className="text-[var(--text-secondary)] text-xs">No contrast data.</span>
                        ) : (() => {
                          const light = items.filter(i => i.tonal_value?.toLowerCase() === 'light').length;
                          const medium = items.filter(i => i.tonal_value?.toLowerCase() === 'medium').length;
                          const dark = items.filter(i => i.tonal_value?.toLowerCase() === 'dark').length;
                          const total = items.length;

                          const pLight = Math.round((light / total) * 100) || 0;
                          const pMedium = Math.round((medium / total) * 100) || 0;
                          const pDark = Math.round((dark / total) * 100) || 0;

                          let advice = "Your closet has a balanced tonal weight. You can easily construct high-contrast looks (light shirt with dark trousers) and low-contrast tonal lookbooks.";
                          if (pDark > 70) {
                            advice = "Wardrobe is heavily dark-dominant. Focus on mixing fabrics (e.g. textured knits, suede shoes) to introduce depth when low contrast makes styling flat.";
                          } else if (pLight > 70) {
                            advice = "Wardrobe is light-dominant. Consider adding navy, charcoal, or chocolate outerwear pieces to anchor your lighter tonal coordinates.";
                          }

                          return (
                            <div className="space-y-3">
                              <div className="flex h-3 rounded-full overflow-hidden w-full border border-[#EAE5D9] bg-white shadow-inner">
                                <div className="bg-[#FAF9F6]" style={{ width: `${pLight}%` }} title={`Light: ${pLight}%`} />
                                <div className="bg-[var(--bg-sidebar)]" style={{ width: `${pMedium}%` }} title={`Medium: ${pMedium}%`} />
                                <div className="bg-[var(--text-primary)]" style={{ width: `${pDark}%` }} title={`Dark: ${pDark}%`} />
                              </div>
                              <div className="flex justify-between text-[9px] text-[var(--text-secondary)] font-bold">
                                <span>Light: {pLight}%</span>
                                <span>Medium: {pMedium}%</span>
                                <span>Dark: {pDark}%</span>
                              </div>
                              <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed font-bold">
                                {advice}
                              </p>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Classic Formulas */}
                      <div className="p-4 bg-[var(--bg-card-secondary)]/50 border border-[#EAE5D9] rounded-2xl space-y-3.5">
                        <span className="text-[10px] uppercase font-black text-[var(--accent-terracotta)] tracking-wider">Color Formulas Checklist</span>
                        {items.length === 0 ? (
                          <span className="text-[var(--text-secondary)] text-xs">Awaiting inventory.</span>
                        ) : (() => {
                          const families = items.map(i => (i.color_family || '').toLowerCase());
                          
                          const formulas = [
                            {
                              name: "Earthy Tonal",
                              colors: ["Olive", "Beige", "White"],
                              check: families.some(f => f.includes('olive')) &&
                                     families.some(f => f.match(/beige|cream|khaki/)) &&
                                     families.some(f => f.includes('white'))
                            },
                            {
                              name: "Modern Navy",
                              colors: ["Navy/Blue", "Grey", "Brown/Black/Charcoal"],
                              check: families.some(f => f.includes('navy') || f.includes('blue')) &&
                                     families.some(f => f.includes('grey') || f.includes('gray')) &&
                                     families.some(f => f.match(/brown|black|charcoal/))
                            },
                            {
                              name: "High Contrast",
                              colors: ["Black", "White", "Grey"],
                              check: families.some(f => f.includes('black')) &&
                                     families.some(f => f.includes('white')) &&
                                     families.some(f => f.includes('grey') || f.includes('gray'))
                            },
                            {
                              name: "Autumnal Warmth",
                              colors: ["Burgundy/Rust", "Camel/Beige", "Dark Grey"],
                              check: families.some(f => f.match(/burgundy|rust/)) &&
                                     families.some(f => f.match(/camel|beige|brown/)) &&
                                     families.some(f => f.match(/grey|gray|charcoal/))
                            },
                            {
                              name: "Monochromatic Slate",
                              colors: ["Charcoal", "Grey", "Light Grey"],
                              check: families.some(f => f.includes('charcoal') || f.includes('black')) &&
                                     families.some(f => f.includes('grey') || f.includes('gray')) &&
                                     families.some(f => f.includes('light') && (f.includes('grey') || f.includes('gray')))
                            },
                            {
                              name: "Classic Prep",
                              colors: ["Navy", "White", "Tan/Beige"],
                              check: families.some(f => f.includes('navy') || f.includes('blue')) &&
                                     families.some(f => f.includes('white')) &&
                                     families.some(f => f.match(/tan|beige|khaki/))
                            },
                            {
                              name: "Sage & Sand",
                              colors: ["Sage/Olive", "Sand/Beige", "Cream/White"],
                              check: families.some(f => f.match(/sage|olive/)) &&
                                     families.some(f => f.match(/sand|beige|khaki/)) &&
                                     families.some(f => f.match(/cream|white/))
                            }
                          ];

                          return (
                            <div className="space-y-2 max-h-[16vh] overflow-y-auto pr-1">
                              {formulas.map(f => (
                                <div key={f.name} className="flex items-center justify-between bg-zinc-950/40 p-2 border border-zinc-850 rounded text-[10px]">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-white">{f.name}</span>
                                    <span className="text-[8px] text-zinc-500">{f.colors.join(' + ')}</span>
                                  </div>
                                  <span className={`px-1.5 py-0.5 rounded font-black text-[8px] uppercase ${
                                    f.check 
                                      ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' 
                                      : 'bg-zinc-800 text-zinc-500'
                                  }`}>
                                    {f.check ? '✓ Wearable' : 'Missing Colors'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                    </div>
                  </div>

                  {/* DYNAMIC SHOPPING LIST CARD */}
                  <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>🛒 Curation Shopping List (Wardrobe Gaps to Fill)</span>
                    </h3>
                    <p className="text-zinc-400 text-xs">
                      These shopping recommendations are dynamically generated to unlock the maximum number of color formulas and category coordinates in your closet.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Category Gaps */}
                      <div className="p-4 bg-zinc-950/20 border border-zinc-850 rounded-xl space-y-3">
                        <span className="text-[10px] uppercase font-bold text-amber-400">Category Essentials Gaps</span>
                        <div className="space-y-2 text-xs font-medium text-zinc-300">
                          {items.filter(i => i.category === 'Footwear').length === 0 && (
                            <div className="flex items-start gap-2 bg-rose-950/15 border border-rose-500/10 p-2.5 rounded-lg text-rose-450">
                              <span>👟</span>
                              <div>
                                <p className="font-bold text-[11px] text-white">Add Footwear</p>
                                <p className="text-[10px] text-zinc-400 mt-0.5">Missing shoes. Add white minimalist leather sneakers or dark brown suede chelsea boots to tie bottoms coordinates together.</p>
                              </div>
                            </div>
                          )}
                          {items.filter(i => i.category === 'Tailoring').length === 0 && (
                            <div className="flex items-start gap-2 bg-amber-950/15 border border-amber-500/10 p-2.5 rounded-lg text-amber-450">
                              <span>🧥</span>
                              <div>
                                <p className="font-bold text-[11px] text-white">Add Tailoring</p>
                                <p className="text-[10px] text-zinc-400 mt-0.5">Missing blazers. Add a textured grey tweed or structured navy wool blazer to elevate casual denim and knitwear.</p>
                              </div>
                            </div>
                          )}
                          {items.filter(i => i.category === 'Outerwear').length === 0 && (
                            <div className="flex items-start gap-2 bg-zinc-900 border border-zinc-855 p-2.5 rounded-lg text-zinc-300">
                              <span>🧥</span>
                              <div>
                                <p className="font-bold text-[11px] text-white">Add Outerwear Layer</p>
                                <p className="text-[10px] text-zinc-400 mt-0.5">Add a classic olive field jacket or charcoal overcoat to introduce layering silhouettes.</p>
                              </div>
                            </div>
                          )}
                          {items.filter(i => i.category === 'Bottoms').length === 0 && (
                            <div className="flex items-start gap-2 bg-rose-950/15 border border-rose-500/10 p-2.5 rounded-lg text-rose-450">
                              <span>👖</span>
                              <div>
                                <p className="font-bold text-[11px] text-white">Add Bottoms</p>
                                <p className="text-[10px] text-zinc-400 mt-0.5">Add raw denim jeans or charcoal wool trousers to build basic styling blocks.</p>
                              </div>
                            </div>
                          )}
                          {items.filter(i => i.category === 'Footwear').length > 0 && items.filter(i => i.category === 'Tailoring').length > 0 && items.filter(i => i.category === 'Outerwear').length > 0 && items.filter(i => i.category === 'Bottoms').length > 0 && (
                            <p className="text-zinc-550 text-[11px]">✓ You own all essential wardrobe category blocks!</p>
                          )}
                        </div>
                      </div>

                      {/* Color Swatch Gaps */}
                      <div className="p-4 bg-zinc-950/20 border border-zinc-850 rounded-xl space-y-3">
                        <span className="text-[10px] uppercase font-bold text-teal-400">Color Swatch Gaps (Based on Formula Misses)</span>
                        <div className="space-y-2 text-xs font-medium text-zinc-300">
                          {(() => {
                            const families = items.map(i => (i.color_family || '').toLowerCase());
                            const missingReccos = [];

                            if (!families.some(f => f.includes('olive') || f.includes('sage'))) {
                              missingReccos.push({ color: "Olive Green / Sage", formula: "Earthy Tonal / Sage & Sand", suggestion: "Add an olive overshirt or chinos to anchor warm earth-toned palettes." });
                            }
                            if (!families.some(f => f.match(/beige|cream|khaki|sand/))) {
                              missingReccos.push({ color: "Beige / Cream / Sand", formula: "Earthy Tonal / Sage & Sand / Autumnal Warmth", suggestion: "Add sand trousers or a cream knit sweater to soften monochrome blocks." });
                            }
                            if (!families.some(f => f.includes('white'))) {
                              missingReccos.push({ color: "White / Off-White", formula: "Earthy Tonal / High Contrast", suggestion: "Add a crisp white cotton tee or off-white button-down shirt for layering contrast." });
                            }
                            if (!families.some(f => f.includes('navy') || f.includes('blue'))) {
                              missingReccos.push({ color: "Navy Blue", formula: "Modern Navy / Classic Prep", suggestion: "Add a navy crewneck or blazer. Navy functions as a soft neutral that coordinates with everything." });
                            }
                            if (!families.some(f => f.includes('grey') || f.includes('gray'))) {
                              missingReccos.push({ color: "Grey / Charcoal", formula: "Modern Navy / High Contrast / Monochromatic Slate", suggestion: "Add grey flannels or a charcoal hoodie. Grey absorbs surrounding colors smoothly." });
                            }
                            if (!families.some(f => f.match(/burgundy|rust|camel|brown/))) {
                              missingReccos.push({ color: "Burgundy / Rust / Camel", formula: "Autumnal Warmth", suggestion: "Add a camel overcoat or rust knitwear to inject a rich autumnal accent hue." });
                            }

                            if (missingReccos.length === 0) {
                              return <p className="text-zinc-550 text-[11px]">✓ You own all essential neutral and accent colors!</p>;
                            }

                            return (
                              <div className="space-y-2 max-h-[25vh] overflow-y-auto pr-1">
                                {missingReccos.slice(0, 3).map(r => (
                                  <div key={r.color} className="p-2 bg-zinc-950/40 border border-zinc-850 rounded text-[10px] space-y-0.5">
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold text-white">{r.color}</span>
                                      <span className="text-[7px] text-zinc-500 uppercase font-black">{r.formula}</span>
                                    </div>
                                    <p className="text-zinc-400 text-[9px] leading-relaxed">{r.suggestion}</p>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* PROPORTIONAL & TEXTURAL HARMONY PANEL */}
                  <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>🎭 Silhouette, Texture & Proportion Rules</span>
                    </h3>
                    <p className="text-zinc-400 text-xs">
                      Evaluating style pairings that rely on proportions, texture contrasts, and physical silhouettes rather than simple color wheels.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* The Sandwich Rule */}
                      <div className="p-4 bg-zinc-950/20 border border-zinc-850 rounded-xl space-y-3">
                        <span className="text-[10px] uppercase font-bold text-teal-400">The Sandwich Rule Matcher</span>
                        {items.length === 0 ? (
                          <span className="text-zinc-500 text-xs">Awaiting closet items.</span>
                        ) : (() => {
                          const outerColors = items.filter(i => i.category === 'Outerwear' || i.category === 'Tops').map(i => (i.color_family || '').toLowerCase());
                          const shoeColors = items.filter(i => i.category === 'Footwear').map(i => (i.color_family || '').toLowerCase());
                          
                          const matchingColors = outerColors.filter(c => shoeColors.includes(c));
                          const uniqueMatches = Array.from(new Set(matchingColors));

                          if (uniqueMatches.length === 0) {
                            return (
                              <div className="space-y-1.5 text-[10px] text-zinc-400 leading-relaxed font-medium">
                                <p className="text-amber-400 font-bold">⚠️ Sandwich Color Contrast Unavailable</p>
                                <p>You have no matching top-layer and footwear colors. Try registering shoes in the same color family as your jackets or shirts (e.g. brown boots with a brown overshirt) to construct balanced vertical silhouettes.</p>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-1.5 text-[10px] text-zinc-400 leading-relaxed font-medium">
                              <p className="text-teal-400 font-bold">✓ Sandwich Formulas Unlocked</p>
                              <p>You can create a balanced "sandwich" outfit by matching your <strong className="text-white capitalize">{uniqueMatches.slice(0, 2).join(' or ')}</strong> jackets/tops with matching footwear, layered over light/contrasting bottoms in the middle.</p>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Textural Contrast Analysis */}
                      <div className="p-4 bg-zinc-950/20 border border-zinc-850 rounded-xl space-y-3">
                        <span className="text-[10px] uppercase font-bold text-indigo-400">Textural Clash Index</span>
                        {items.length === 0 ? (
                          <span className="text-zinc-555 text-xs">No texture data.</span>
                        ) : (() => {
                          const fabrics = items.map(i => (i.fabric_type || '').toLowerCase());
                          
                          const rough = fabrics.filter(f => f.match(/denim|wool|corduroy|leather|tweed|knit|suede/)).length;
                          const smooth = fabrics.filter(f => f.match(/linen|silk|cotton|tencel|poplin|nylon/)).length;
                          
                          const total = rough + smooth || 1;
                          const pRough = Math.round((rough / total) * 100);
                          const pSmooth = Math.round((smooth / total) * 100);

                          let textureAdvice = "Excellent textural mix! Try clashing heavy, structured textures (e.g. corduroy/denim bottoms) with lightweight smooth drapery (e.g. linen/cotton tops) to add styling depth.";
                          if (pRough > 80) {
                            textureAdvice = "Highly weighted towards rough/structured fabrics. Consider adding lightweight smooth layers (cotton/linen tops) to prevent outfits from looking too heavy.";
                          } else if (pSmooth > 80) {
                            textureAdvice = "Highly weighted towards smooth summer drape. Consider adding a rough texture like a denim jacket or corduroy/wool pieces to introduce structural weight.";
                          }

                          return (
                            <div className="space-y-2 text-[10px] text-zinc-400 font-medium">
                              <div className="flex justify-between text-[9px] text-zinc-500 font-bold">
                                <span>Rough/Structured: {pRough}%</span>
                                <span>Smooth/Drape: {pSmooth}%</span>
                              </div>
                              <p className="leading-relaxed">{textureAdvice}</p>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Silhouette Volume Checker */}
                      <div className="p-4 bg-zinc-950/20 border border-zinc-850 rounded-xl space-y-3">
                        <span className="text-[10px] uppercase font-bold text-amber-400">Silhouette Proportions</span>
                        {items.length === 0 ? (
                          <span className="text-zinc-555 text-xs">Awaiting fit blocks.</span>
                        ) : (() => {
                          const fits = items.map(i => (i.fit_block || '').toLowerCase());
                          
                          const relaxed = fits.filter(f => f.includes('relaxed') || f.includes('oversized') || f.includes('loose')).length;
                          const fitted = fits.filter(f => f.includes('slim') || f.includes('tailored') || f.includes('fitted')).length;

                          let silhouetteFormula = "Classic Proportions: Layer fitted/tucked-in tops inside tailored outerwear over straight or relaxed pants to create a modern drape aesthetic.";
                          if (relaxed > 0 && fitted > 0) {
                            silhouetteFormula = "Proportion pairings ready: Try clashing a Relaxed bottom with a Tailored/Slim top (creates an A-Line silhouette), or vice-versa (creates an Inverted Triangle).";
                          }

                          return (
                            <div className="space-y-2 text-[10px] text-zinc-400 font-medium">
                              <div className="flex justify-between text-[9px] text-zinc-500 font-bold">
                                <span>Relaxed Fits: {relaxed}</span>
                                <span>Fitted/Tailored: {fitted}</span>
                              </div>
                              <p className="leading-relaxed">{silhouetteFormula}</p>
                            </div>
                          );
                        })()}
                      </div>

                    </div>
                  </div>

                  {/* Purging Ledger */}
                  <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white">🗑️ Wardrobe Culling Suggestions (To Par Down)</h3>
                    <p className="text-zinc-400 text-xs">
                      The easiest way to par down is culling clothes with zero logged wears or those explicitly marked for archive/donation.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Zero wears */}
                      <div className="p-4 bg-zinc-950/20 border border-zinc-850 rounded-xl space-y-3">
                        <span className="text-[10px] uppercase font-bold text-amber-400">0 Wears Logged (Inactive Weight)</span>
                        <div className="space-y-2 max-h-[25vh] overflow-y-auto">
                          {items.filter(i => getItemWornCount(i.id) === 0).length === 0 ? (
                            <p className="text-[11px] text-zinc-550">Great job! You have worn every item in your closet at least once.</p>
                          ) : (
                            items.filter(i => getItemWornCount(i.id) === 0).map(i => (
                              <div key={i.id} className="flex justify-between items-center bg-zinc-950/40 p-2 rounded border border-zinc-855 text-xs text-zinc-350 font-medium">
                                <span className="truncate">{i.brand || 'Unbranded'} {i.sub_category}</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingItem(i)}
                                  className="text-[10px] font-bold text-teal-400 underline shrink-0"
                                >
                                  Cull
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Explicitly flagged for discard/donate */}
                      <div className="p-4 bg-zinc-950/20 border border-zinc-850 rounded-xl space-y-3">
                        <span className="text-[10px] uppercase font-bold text-rose-400">Flagged to Donate/Discard</span>
                        <div className="space-y-2 max-h-[25vh] overflow-y-auto">
                          {items.filter(i => i.status === 'Donate' || i.status === 'Discard').length === 0 ? (
                            <p className="text-[11px] text-zinc-550">No items are currently marked for donation or discard.</p>
                          ) : (
                            items.filter(i => i.status === 'Donate' || i.status === 'Discard').map(i => (
                              <div key={i.id} className="flex justify-between items-center bg-zinc-950/40 p-2 rounded border border-zinc-855 text-xs text-zinc-350 font-medium">
                                <span className="truncate">{i.brand || 'Unbranded'} {i.sub_category} ({i.status})</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingItem(i)}
                                  className="text-[10px] font-bold text-teal-400 underline shrink-0"
                                >
                                  Manage
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {closetSubTab === 'guide' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white">📖 Wardrobe Curation & Styling Guide</h3>
                    <p className="text-zinc-400 text-xs">
                      A reference dictionary of key styling concepts used by the system to evaluate your closet coordination.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Rule 1: The Sandwich Rule */}
                      <div className="p-5 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-teal-400 font-black">01. The Sandwich Rule</span>
                        <h4 className="font-bold text-white text-xs">Creating Vertical Symmetry</h4>
                        <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                          This rule coordinates your outfit by matching the color family or visual weight of your top layer (shirt, sweater, jacket) with your footwear, while wearing a contrasting color or value in the middle (trousers). 
                        </p>
                        <div className="bg-zinc-900/60 p-2.5 rounded border border-zinc-850 text-[10px] text-zinc-350 space-y-1 font-medium">
                          <p>💡 <strong>Example:</strong> Brown leather jacket + Off-white chinos + Brown leather boots.</p>
                          <p>🎨 <strong>Why it works:</strong> It creates visual balance by anchoring the top and bottom of the silhouette, making the outfit look structured and deliberate.</p>
                        </div>
                      </div>

                      {/* Rule 2: Textural Contrast */}
                      <div className="p-5 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-indigo-400 font-black">02. Textural Contrast</span>
                        <h4 className="font-bold text-white text-xs">Adding Depth Without Color</h4>
                        <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                          Pairing items of similar colors works beautifully if you clash textures. Avoid pairing smooth cotton tops with smooth flat trousers. Instead, contrast rough/structured fabrics against light/drape fabrics.
                        </p>
                        <div className="bg-zinc-900/60 p-2.5 rounded border border-zinc-850 text-[10px] text-zinc-350 space-y-1 font-medium">
                          <p>💡 <strong>Example:</strong> A chunky wool cardigan or rugged denim jacket layered over a smooth silk or fine cotton tee.</p>
                          <p>🎨 <strong>Why it works:</strong> Texture absorbs and reflects light differently, generating visual interest and preventing monochrome outfits from looking flat.</p>
                        </div>
                      </div>

                      {/* Rule 3: Silhouette Proportions */}
                      <div className="p-5 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-amber-400 font-black">03. Fit & Silhouette Proportions</span>
                        <h4 className="font-bold text-white text-xs">Volume Contrast (A-Line & Inverted Triangle)</h4>
                        <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                          Coordination relies heavily on balancing fit volumes. Try clashing a wide/relaxed garment with a slim/fitted one. Avoid wearing all-tight or all-loose clothing unless executing a specific silhouette layout.
                        </p>
                        <div className="bg-zinc-900/60 p-2.5 rounded border border-zinc-850 text-[10px] text-zinc-350 space-y-1 font-medium">
                          <p>💡 <strong>A-Line Formula:</strong> Fitted knit top tucked into relaxed-fit pleated trousers.</p>
                          <p>💡 <strong>Inverted Triangle:</strong> Oversized boxy hoodie/jacket over slim-fit raw denim.</p>
                          <p>🎨 <strong>Why it works:</strong> It creates dynamic proportions and draws focus to your natural structure rather than draping shape-lessly.</p>
                        </div>
                      </div>

                      {/* Rule 4: Tonal Contrast */}
                      <div className="p-5 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-emerald-400 font-black">04. Tonal Contrast Value</span>
                        <h4 className="font-bold text-white text-xs">Matching Light, Medium & Dark Levels</h4>
                        <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                          Your wardrobe needs a healthy spread of tonal values. High-contrast outfits separate top and bottom cleanly. Low-contrast tonal outfits create a continuous vertical line, lengthening your look.
                        </p>
                        <div className="bg-zinc-900/60 p-2.5 rounded border border-zinc-850 text-[10px] text-zinc-350 space-y-1 font-medium">
                          <p>💡 <strong>High Contrast:</strong> Crisp white linen shirt paired with dark charcoal trousers.</p>
                          <p>💡 <strong>Low Tonal:</strong> Slate grey tee paired with light grey flannel trousers.</p>
                          <p>🎨 <strong>Why it works:</strong> Tonal spacing dictates the mood (formal/academic vs. relaxed/casual) and balances vertical highlights.</p>
                        </div>
                      </div>

                    </div>
                  </div>
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

                              <p className="text-xs text-zinc-400 leading-relaxed mb-3">{outfit.styling_reasoning}</p>
                              
                              <button
                                type="button"
                                onClick={() => setVisualModal({
                                  outfitName: outfit.name,
                                  items: outfitItems,
                                  tab: 'collage'
                                })}
                                className="w-full py-2 bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                              >
                                🎨 View Outfit Visuals
                              </button>
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

          {/* TAB 4: METRICS (First-class View) */}
          {activeTab === 'metrics' && (
            <div className="space-y-6 animate-fade-in">
              <div className="border border-zinc-800 bg-[#1f2833]/15 rounded-2xl p-6 backdrop-blur-sm">
                <h2 className="text-base font-bold text-white mb-2">📊 System Telemetry & Cost Ledger</h2>
                <p className="text-zinc-400 text-xs mb-6">
                  Detailed real-time accounting of Gemini API consumption, token usage, and latency.
                </p>

                {telemetry ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-zinc-550">Cumulative Cost</span>
                        <p className="text-2xl font-black text-emerald-400 font-mono mt-1">${telemetry.totalCost}</p>
                      </div>
                      <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-zinc-550">Prompt Tokens (In)</span>
                        <p className="text-2xl font-black text-white font-mono mt-1">{telemetry.totalTokensIn.toLocaleString()}</p>
                      </div>
                      <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-zinc-550">Candidates Tokens (Out)</span>
                        <p className="text-2xl font-black text-white font-mono mt-1">{telemetry.totalTokensOut.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-zinc-400">Transactions Log</h4>
                      <div className="border border-zinc-855 bg-zinc-950/20 rounded-xl overflow-hidden overflow-x-auto text-[10px] font-mono">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-zinc-850 bg-zinc-900/60 text-zinc-400">
                              <th className="p-2.5">Time</th>
                              <th className="p-2.5">Service</th>
                              <th className="p-2.5">In/Out Tokens</th>
                              <th className="p-2.5">Est. Cost</th>
                              <th className="p-2.5">Latency</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-850">
                            {telemetryLogs.map((log) => (
                              <tr key={log.id} className="text-zinc-300">
                                <td className="p-2.5">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                <td className="p-2.5 text-teal-400 font-bold">{log.service}</td>
                                <td className="p-2.5">{log.tokens_in} / {log.tokens_out}</td>
                                <td className="p-2.5 text-emerald-400 font-bold">${log.estimated_cost}</td>
                                <td className="p-2.5">{log.latency_ms || 120}ms</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Loading telemetry data...</p>
                )}
              </div>
            </div>
          )}

        </section>

        <footer className="mt-16 border-t border-zinc-850 pt-8 pb-12 text-center text-[10px] text-zinc-500">
          <p>© 2026 Antigravity Threads • v2.31.0 Release</p>
        </footer>
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

      {/* CLIENT-SIDE CUTOUT PROGRESS OVERLAY */}
      {cutoutProgress && (
        <div className="fixed inset-0 z-55 flex flex-col items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-[#1f2833] border border-teal-500/20 rounded-2xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl shadow-teal-500/5">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-zinc-800"></div>
              <div className="absolute inset-0 rounded-full border-4 border-teal-400 border-t-transparent animate-spin"></div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">AI Cutout Processing</h3>
              <p className="text-xs text-teal-400 font-medium animate-pulse">{cutoutProgress}</p>
            </div>
            <p className="text-[10px] text-zinc-500 leading-normal">
              Running background removal client-side using Transformers.js. The first execution will download the model weights (approx. 40MB). Subsequent cutouts are instant.
            </p>
          </div>
        </div>
      )}

      {/* OUTFIT VISUALS MODAL (COLLAGE / GENERATIVE / TRY-ON) */}
      {visualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-[#1f2833] border border-zinc-800 rounded-3xl p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl shadow-teal-500/5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Outfit Visualizer</h3>
                <p className="text-[10px] text-zinc-400 mt-0.5">{visualModal.outfitName}</p>
              </div>
              <button 
                onClick={() => setVisualModal(null)} 
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Visual Tabs */}
            <div className="flex border-b border-zinc-850">
              <button
                type="button"
                onClick={() => setVisualModal({ ...visualModal, tab: 'collage' })}
                className={`flex-1 pb-2.5 text-xs font-bold transition-all border-b-2 ${
                  visualModal.tab === 'collage' 
                    ? 'border-teal-400 text-teal-400' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🖼️ Option A: Collage
              </button>
              <button
                type="button"
                onClick={() => setVisualModal({ ...visualModal, tab: 'generative' })}
                className={`flex-1 pb-2.5 text-xs font-bold transition-all border-b-2 ${
                  visualModal.tab === 'generative' 
                    ? 'border-teal-400 text-teal-400' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ✨ Option B: AI Flat-lay
              </button>
              <button
                type="button"
                onClick={() => setVisualModal({ ...visualModal, tab: 'tryon' })}
                className={`flex-1 pb-2.5 text-xs font-bold transition-all border-b-2 ${
                  visualModal.tab === 'tryon' 
                    ? 'border-teal-400 text-teal-400' 
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                👤 AI Virtual Try-On
              </button>
            </div>

            {/* TAB CONTENT */}
            <div className="py-2">
              {visualModal.tab === 'collage' && (
                <div className="space-y-4 text-center">
                  <canvas
                    ref={(canvas) => {
                      if (canvas) {
                        drawOutfitCollage(canvas, visualModal.items);
                      }
                    }}
                    width={600}
                    height={800}
                    className="mx-auto max-h-[50vh] w-full object-contain border border-zinc-800 rounded-xl bg-zinc-950 shadow-inner"
                  />
                  <p className="text-[10px] text-zinc-500">
                    Stitched locally using garment cutout layers. Instant, free, and lightweight.
                  </p>
                </div>
              )}

              {visualModal.tab === 'generative' && (
                <div className="space-y-4 text-center">
                  {visualModal.loading ? (
                    <div className="h-64 flex flex-col items-center justify-center space-y-3 bg-zinc-950/40 rounded-xl border border-zinc-850">
                      <div className="w-8 h-8 rounded-full border-2 border-teal-400 border-t-transparent animate-spin"></div>
                      <p className="text-xs text-teal-400 animate-pulse">{visualModal.loadingMsg || 'Generating...'}</p>
                    </div>
                  ) : visualModal.genUrl ? (
                    <div className="space-y-4">
                      <img 
                        src={visualModal.genUrl} 
                        alt="AI Generated Outfit" 
                        className="mx-auto max-h-[50vh] object-contain border border-zinc-800 rounded-xl shadow-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setVisualModal({ ...visualModal, genUrl: undefined })}
                        className="px-4 py-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg text-xs font-semibold"
                      >
                        Regenerate
                      </button>
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center space-y-4 bg-zinc-950/40 rounded-xl border border-zinc-850 p-6">
                      <p className="text-xs text-zinc-400 max-w-sm leading-normal">
                        Generate a professional editorial flat-lay photo of this outfit using Stable Diffusion XL via Hugging Face.
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          setVisualModal({ ...visualModal, loading: true, loadingMsg: 'Prompting Stable Diffusion...' });
                          try {
                            const desc = visualModal.items
                              .map(i => `${i.color_family} ${i.sub_category} by ${i.brand || 'boutique'}`)
                              .join(', and a ');
                            const prompt = `A professional high-end editorial flat-lay men's fashion photo of: a ${desc}. Flat lay arrangement, studio lighting, clean solid neutral background, high fashion asset.`;
                            
                            const res = await fetch('/api/outfits/generate-image', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ prompt }),
                            });
                            const data = await res.json();
                            if (res.ok) {
                              setVisualModal({ ...visualModal, genUrl: data.url, loading: false });
                            } else {
                              alert(`Generation failed: ${data.error || 'Check server logs.'}`);
                              setVisualModal({ ...visualModal, loading: false });
                            }
                          } catch (err: any) {
                            alert(`Error generating image: ${err.message}`);
                            setVisualModal({ ...visualModal, loading: false });
                          }
                        }}
                        className="px-5 py-2 bg-teal-400 text-black hover:bg-teal-300 rounded-xl text-xs font-bold transition"
                      >
                        ✨ Generate AI Flat-lay
                      </button>
                    </div>
                  )}
                </div>
              )}

              {visualModal.tab === 'tryon' && (
                <div className="space-y-4">
                  {visualModal.loading ? (
                    <div className="h-64 flex flex-col items-center justify-center space-y-3 bg-zinc-950/40 rounded-xl border border-zinc-850">
                      <div className="w-8 h-8 rounded-full border-2 border-teal-400 border-t-transparent animate-spin"></div>
                      <p className="text-xs text-teal-400 animate-pulse">{visualModal.loadingMsg || 'Processing Virtual Try-On...'}</p>
                    </div>
                  ) : visualModal.genUrl ? (
                    <div className="text-center space-y-4">
                      <img 
                        src={visualModal.genUrl} 
                        alt="Try-On Result" 
                        className="mx-auto max-h-[50vh] object-contain border border-zinc-800 rounded-xl shadow-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setVisualModal({ ...visualModal, genUrl: undefined })}
                        className="px-4 py-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg text-xs font-semibold"
                      >
                        Try Another Item
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Left side: Upload portrait */}
                      <div className="border border-dashed border-zinc-800 bg-zinc-950/30 rounded-xl p-4 flex flex-col items-center justify-center text-center min-h-[250px]">
                        {visualModal.personImage ? (
                          <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-black flex items-center justify-center">
                            <img src={visualModal.personImage} alt="User Portrait" className="object-contain w-full h-full" />
                            <button
                              type="button"
                              onClick={() => setVisualModal({ ...visualModal, personImage: null })}
                              className="absolute top-2 right-2 bg-black/70 hover:bg-black p-1.5 rounded-full text-xs text-zinc-400 hover:text-white"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <span className="text-2xl">👤</span>
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-white">Upload Your Photo</p>
                              <p className="text-[9px] text-zinc-500">Provide a clear full-body portrait image</p>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              id="vton-file"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    setVisualModal({ ...visualModal, personImage: reader.result as string });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            <label
                              htmlFor="vton-file"
                              className="inline-block px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-lg text-[10px] cursor-pointer"
                            >
                              Choose File
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Right side: Select item & run */}
                      <div className="border border-zinc-850 bg-zinc-950/20 rounded-xl p-4 flex flex-col justify-between min-h-[250px]">
                        <div className="space-y-3">
                          <h4 className="text-[10px] uppercase font-bold text-zinc-400">Target Garment</h4>
                          <div className="flex gap-3 items-center border border-zinc-850 bg-zinc-950/40 p-2.5 rounded-lg">
                            <div className="w-12 h-12 bg-black rounded overflow-hidden flex-shrink-0">
                              <img src={visualModal.items[0]?.primary_image_url || ''} alt="" className="object-cover w-full h-full" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white truncate max-w-[150px]">{visualModal.items[0]?.sub_category}</p>
                              <p className="text-[9px] text-zinc-500">{visualModal.items[0]?.brand || 'Boutique'}</p>
                            </div>
                          </div>
                          <p className="text-[10px] text-zinc-500 leading-normal">
                            Using IDM-VTON diffusion models to drape your garment onto your uploaded portrait.
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={!visualModal.personImage}
                          onClick={async () => {
                            if (!visualModal.personImage) return;
                            setVisualModal({ ...visualModal, loading: true, loadingMsg: 'Draping clothing via AI...' });
                            try {
                              const res = await fetch('/api/outfits/virtual-try-on', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  personImage: visualModal.personImage,
                                  garmentImage: visualModal.items[0]?.primary_image_url,
                                  category: visualModal.items[0]?.category.toLowerCase()
                                }),
                              });
                              const data = await res.json();
                              if (res.ok) {
                                setVisualModal({ ...visualModal, genUrl: data.url, loading: false });
                                if (data.isMock) {
                                  alert(`Demo Try-On Output:\n\n${data.message}`);
                                }
                              } else {
                                alert(`Try-on failed: ${data.error || 'Check server logs.'}`);
                                setVisualModal({ ...visualModal, loading: false });
                              }
                            } catch (err: any) {
                              alert(`Try-on error: ${err.message}`);
                              setVisualModal({ ...visualModal, loading: false });
                            }
                          }}
                          className={`w-full py-2 rounded-xl text-xs font-bold transition ${
                            visualModal.personImage 
                              ? 'bg-teal-400 text-black hover:bg-teal-300' 
                              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                          }`}
                        >
                          ✨ Run Try-On
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDITING DIALOG MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) {
                await uploadImageToGarment(file);
              }
            }}
            className="bg-[#1f2833] border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto relative"
          >
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
              
              <div className="relative w-32 h-32 mx-auto rounded-lg overflow-hidden border border-zinc-700 bg-black flex flex-col items-center justify-center">
                {editingItem.primary_image_url && (
                  <img src={editingItem.primary_image_url} alt="" className="object-contain w-full h-full" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQueryText}
                    onChange={(e) => setSearchQueryText(e.target.value)}
                    placeholder="Search query (e.g. White Oxford Shirt)..."
                    className="flex-1 bg-[#0b0c10] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-400"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setIsSearchingImage(true);
                      setSearchResults(null);
                      try {
                        const res = await fetch('/api/items/search-image', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            brand: '',
                            description: searchQueryText
                          }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setSearchResults(data.images || []);
                        } else {
                          alert(`Search failed: ${data.error || 'Unknown error'}`);
                        }
                      } catch (err: any) {
                        alert(`Search error: ${err.message}`);
                      } finally {
                        setIsSearchingImage(false);
                      }
                    }}
                    className="px-4 py-1.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {isSearchingImage ? 'Searching...' : '🔍 Find Photo'}
                  </button>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  id="manual-photo-upload"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      await uploadImageToGarment(file);
                    }
                  }}
                />
                <label
                  htmlFor="manual-photo-upload"
                  className="w-full py-2 text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer text-center"
                >
                  📁 Upload Photo
                </label>
              </div>

              {/* SEARCH RESULTS PANEL */}
              {searchResults && (
                <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-950/60 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] uppercase font-bold text-teal-400">Web Search Results</h4>
                    <button
                      type="button"
                      onClick={() => setSearchResults(null)}
                      className="text-zinc-500 hover:text-white text-xs"
                    >
                      ✕ Close
                    </button>
                  </div>
                  
                  {searchResults.length === 0 ? (
                    <p className="text-[10px] text-zinc-500 text-center py-2">No matching manufacturer photos found.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                      {searchResults.map((img: any, idx: number) => (
                        <div
                          key={idx}
                          onClick={async () => {
                            if (isReplacingImage) return;
                            setIsReplacingImage(true);
                            try {
                              const res = await fetch('/api/items/search-image', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  garmentId: editingItem.id,
                                  imageUrl: img.url
                                }),
                              });
                              const data = await res.json();
                              if (res.ok) {
                                setEditingItem({
                                  ...editingItem,
                                  images: data.images
                                });
                                await fetchItems();
                                setSearchResults(null);
                                alert('✨ Garment photo successfully added to gallery!');
                              } else {
                                alert(`Failed to add photo: ${data.error || 'Unknown error'}`);
                              }
                            } catch (err: any) {
                              alert(`Error replacing photo: ${err.message}`);
                            } finally {
                              setIsReplacingImage(false);
                            }
                          }}
                          className="relative aspect-square border border-zinc-800 rounded-lg overflow-hidden bg-black cursor-pointer hover:border-teal-400 transition group"
                        >
                          <img src={img.url} alt="" className="object-contain w-full h-full" />
                          <div className="absolute inset-x-0 bottom-0 bg-black/80 text-[7px] text-zinc-400 px-1 py-0.5 truncate text-center group-hover:text-teal-400">
                            {img.source}
                          </div>
                          {isReplacingImage && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[8px] text-teal-400 animate-pulse">
                              Replacing...
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Thumbnails list in editor */}
              <div className="relative flex justify-center gap-1.5 overflow-x-auto py-1">
                {isUploadingImage && (
                  <div className="absolute inset-0 bg-black/60 z-30 flex items-center justify-center rounded-lg">
                    <div className="w-4 h-4 rounded-full border border-teal-400 border-t-transparent animate-spin"></div>
                  </div>
                )}
                {editingItem.images.map((img) => (
                  <div 
                    key={img.id} 
                    onClick={() => setPrimaryImage(img.id)}
                    className={`relative w-9 h-9 border rounded overflow-hidden bg-black shrink-0 cursor-pointer group transition ${
                      img.is_primary_profile ? 'border-teal-400 ring-1 ring-teal-400' : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <img src={img.storage_path} alt="" className="object-cover w-full h-full" />
                    {!img.is_primary_profile && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteGarmentImage(img.id);
                        }}
                        className="absolute top-0.5 right-0.5 w-3 h-3 bg-rose-600 hover:bg-rose-500 rounded-full flex items-center justify-center text-[6px] text-white font-extrabold opacity-0 group-hover:opacity-100 transition"
                      >
                        ✕
                      </button>
                    )}
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
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Purchase Year</label>
                  <input
                    type="number"
                    placeholder="e.g. 2026"
                    value={editingItem.purchase_year || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, purchase_year: e.target.value ? Number(e.target.value) : null })}
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

              {/* Notes Field */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-zinc-400">📝 Notes</label>
                <textarea
                  value={editingItem.notes || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value || null })}
                  placeholder="Add personal notes, care instructions, styling ideas..."
                  rows={3}
                  className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white resize-none focus:outline-none focus:border-teal-400/50"
                />
              </div>

              {/* Created / Updated dates */}
              <div className="flex gap-3 text-[10px] text-zinc-600">
                <span>Added: <span className="text-zinc-500">{editingItem.created_at ? new Date(editingItem.created_at).toLocaleDateString() : '—'}</span></span>
              </div>

              {/* Curation Actions + Wear History */}
              <div className="space-y-2 border-t border-zinc-800 pt-2.5">
                <div className="flex gap-2 items-center justify-between text-xs text-zinc-400">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">Wear History</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-300 font-bold">{getItemWornCount(editingItem.id)}x total</span>
                    <button
                      type="button"
                      onClick={() => logGarmentWorn(editingItem.id)}
                      className="px-3 py-1 rounded bg-teal-400 text-black font-bold text-xs"
                    >
                      + Log Wear
                    </button>
                  </div>
                </div>
                {/* Collapsible scrollable history */}
                {wearLogs.filter(l => l.garment_id === editingItem.id).length > 0 && (
                  <details className="group">
                    <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300 transition select-none list-none flex items-center gap-1">
                      <span className="group-open:hidden">▶</span>
                      <span className="hidden group-open:inline">▼</span>
                      {wearLogs.filter(l => l.garment_id === editingItem.id).length} wear entries
                    </summary>
                    <div className="mt-1.5 max-h-32 overflow-y-auto space-y-0.5 bg-zinc-950/50 rounded-lg p-2">
                      {wearLogs
                        .filter(l => l.garment_id === editingItem.id)
                        .sort((a, b) => new Date(b.worn_at).getTime() - new Date(a.worn_at).getTime())
                        .map((log, idx) => (
                          <div key={log.id} className="flex items-center justify-between text-[10px] text-zinc-400 py-0.5 border-b border-zinc-800/60 last:border-0">
                            <span>#{wearLogs.filter(l => l.garment_id === editingItem.id).length - idx}</span>
                            <span>{new Date(log.worn_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </div>

              {/* STYLE PAIRINGS COORDINATION */}
              <div className="space-y-2 border-t border-zinc-800 pt-2.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400">👖 Wardrobe Pairings (In Closet)</span>
                <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none">
                  {items
                    .filter(i => i.id !== editingItem.id && (
                      (editingItem.category === 'Tops' && (i.category === 'Bottoms' || i.category === 'Outerwear')) ||
                      (editingItem.category === 'Bottoms' && (i.category === 'Tops' || i.category === 'Footwear')) ||
                      (editingItem.category === 'Outerwear' && i.category === 'Tops') ||
                      (editingItem.category === 'Footwear' && i.category === 'Bottoms')
                    ))
                    .slice(0, 5)
                    .map(pairing => (
                      <button
                        key={pairing.id}
                        type="button"
                        onClick={() => setEditingItem(pairing)}
                        className="w-10 h-10 border border-zinc-800 rounded-lg overflow-hidden bg-black shrink-0 relative hover:border-teal-400 transition"
                        title={`Pair with ${pairing.brand || 'Unbranded'} ${pairing.sub_category}`}
                      >
                        <img src={pairing.primary_image_url || ''} alt="" className="object-cover w-full h-full" />
                      </button>
                    ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLookbookInput(`Construct a premium outfit centered around wearing my ${editingItem.brand || 'Unbranded'} ${editingItem.sub_category} (${editingItem.color_family})`);
                    setActiveTab('stylist');
                    setEditingItem(null);
                  }}
                  className="w-full py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-[0.98] transition mt-1"
                >
                  🤖 Style Outfit Around This
                </button>
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
                    onClick={async () => {
                      const primaryImg = editingItem.images?.find((img: any) => img.is_primary_profile) || editingItem.images?.[0] || { storage_path: editingItem.primary_image_url };
                      if (!primaryImg || !primaryImg.storage_path) {
                        alert('No image found for this garment.');
                        return;
                      }
                      setEditingItem(null);
                      await runClientSideCutout(editingItem.id, primaryImg.storage_path);
                    }}
                    className="px-4 py-2 bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 rounded-xl text-xs font-bold transition flex items-center gap-1"
                  >
                    ✨ Run AI Cutout
                  </button>
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

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      {!validationTarget && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-45 bg-[#0b0c10]/95 backdrop-blur-md border-t border-zinc-850 flex justify-around items-center py-2.5 pb-6 select-none shadow-2xl">
          <button
            onClick={() => setActiveTab('snap')}
            className={`flex flex-col items-center gap-1.5 py-1 px-3 rounded-xl transition-all ${
              activeTab === 'snap' ? 'text-teal-400 font-black' : 'text-zinc-550 font-semibold'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="text-[10px]">Ingest</span>
          </button>

          <button
            onClick={() => setActiveTab('closet')}
            className={`flex flex-col items-center gap-1.5 py-1 px-3 rounded-xl transition-all ${
              activeTab === 'closet' ? 'text-teal-400 font-black' : 'text-zinc-550 font-semibold'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            <span className="text-[10px]">Closet</span>
          </button>

          <button
            onClick={() => setActiveTab('spreadsheet')}
            className={`flex flex-col items-center gap-1.5 py-1 px-3 rounded-xl transition-all ${
              activeTab === 'spreadsheet' ? 'text-teal-400 font-black' : 'text-zinc-550 font-semibold'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            <span className="text-[10px]">Grid</span>
          </button>

          <button
            onClick={() => setActiveTab('stylist')}
            className={`flex flex-col items-center gap-1.5 py-1 px-3 rounded-xl transition-all ${
              activeTab === 'stylist' ? 'text-teal-400 font-black' : 'text-zinc-550 font-semibold'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            <span className="text-[10px]">Stylist</span>
          </button>

          <button
            onClick={() => setActiveTab('metrics')}
            className={`flex flex-col items-center gap-1.5 py-1 px-3 rounded-xl transition-all ${
              activeTab === 'metrics' ? 'text-teal-400 font-black' : 'text-zinc-550 font-semibold'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" /></svg>
            <span className="text-[10px]">Metrics</span>
          </button>
        </nav>
      )}
      {/* FLOATING CHAT BUBBLE */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 w-12 h-12 rounded-full bg-teal-500 hover:bg-teal-400 text-black shadow-2xl flex items-center justify-center transition transform hover:scale-105 active:scale-95"
        title="Threads AI Stylist"
      >
        <span className="text-xl">💬</span>
      </button>

      {/* CHAT DRAWER PANEL */}
      {chatOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#1f2833] border-l border-zinc-800 shadow-2xl flex flex-col animate-slide-left">
          {/* HEADER */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse"></span>
              <h3 className="text-sm font-bold text-white">Threads AI Stylist</h3>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowChatSettings(!showChatSettings)} 
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition text-sm"
                title="AI Settings"
              >
                ⚙️
              </button>
              <button 
                onClick={() => setChatOpen(false)} 
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition text-sm"
              >
                ✕
              </button>
            </div>
          </div>

          {/* SETTINGS PANEL OVERLAY */}
          {showChatSettings ? (
            <div className="p-4 border-b border-zinc-800 bg-[#0b0c10]/40 space-y-3">
              <h4 className="text-[10px] uppercase font-bold text-teal-400">Stylist Model Configuration</h4>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-400">AI Provider</label>
                  <select 
                    value={chatProvider}
                    onChange={(e) => setChatProvider(e.target.value as any)}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="gemini">Google Gemini (Recommended)</option>
                    <option value="openai">OpenAI GPT-4o-Mini</option>
                    <option value="anthropic">Anthropic Claude 3.5 Haiku</option>
                    <option value="deepseek">DeepSeek Chat</option>
                    <option value="minimax">MiniMax Text-01</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-400">Custom API Key (Optional)</label>
                  <input
                    type="password"
                    placeholder="Enter key to override env default..."
                    value={chatApiKey}
                    onChange={(e) => {
                      setChatApiKey(e.target.value);
                      localStorage.setItem('threads_chat_key', e.target.value);
                    }}
                    className="w-full bg-[#0b0c10] border border-zinc-800 rounded-lg p-2 text-xs text-white"
                  />
                  <span className="text-[8px] text-zinc-500">Stored locally in your browser's secure cache.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('threads_chat_provider', chatProvider);
                    setShowChatSettings(false);
                  }}
                  className="w-full py-1.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 text-[10px] font-bold rounded-lg transition"
                >
                  Save Config
                </button>
              </div>
            </div>
          ) : null}

          {/* MESSAGES */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0b0c10]/20">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                <span className="text-3xl">🧥</span>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-300">How can I help style you today?</p>
                  <p className="text-[10px] text-zinc-500">Ask about outfits, coordinate combinations, or identify closet clutter.</p>
                </div>
                <div className="w-full max-w-xs space-y-2 pt-2">
                  <button
                    onClick={() => sendChatMessage("Suggest a stylish outfit combination for warm weather")}
                    className="w-full p-2 bg-[#0b0c10]/50 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-[10px] text-left text-zinc-300 transition"
                  >
                    ☀️ Suggest a warm weather outfit...
                  </button>
                  <button
                    onClick={() => sendChatMessage("Which items in my closet have the least number of wear counts?")}
                    className="w-full p-2 bg-[#0b0c10]/50 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-[10px] text-left text-zinc-300 transition"
                  >
                    📉 Find my least worn items...
                  </button>
                  <button
                    onClick={() => sendChatMessage("Give me a styling recommendation using my green linen shirt")}
                    className="w-full p-2 bg-[#0b0c10]/50 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-[10px] text-left text-zinc-300 transition"
                  >
                    🟢 Style my green linen shirt...
                  </button>
                </div>
              </div>
            ) : (
              chatMessages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                    m.role === 'user' 
                      ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' 
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {isChatTyping && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-2xl px-3.5 py-2 text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
          </div>

          {/* INPUT FORM */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              sendChatMessage();
            }} 
            className="p-3 border-t border-zinc-800 bg-[#0b0c10]/40 flex gap-2"
          >
            <input
              type="text"
              placeholder="Ask Stylist..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-[#0b0c10] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-400"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-teal-500 text-black font-bold text-xs rounded-xl hover:bg-teal-400 transition"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
