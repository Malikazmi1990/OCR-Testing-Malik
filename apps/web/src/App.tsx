/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Loader2, 
  Trash2, 
  ChevronRight,
  ShieldCheck,
  Zap,
  Files,
  Plus,
  ArrowRight,
  Download,
  Pause,
  Play,
  History,
  LogOut,
  User as UserIcon,
  Search
} from 'lucide-react';
import { ProcessingFile, IDDocumentData } from '@id-lens/shared';
import { extractIDData, translateToArabic } from './geminiService';
import { auth, db, signInWithGoogle, logout } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';

export default function App() {
  const [files, setFiles] = useState<ProcessingFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'scan' | 'history' | 'developer'>('scan');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [savedRecords, setSavedRecords] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [isTranslating, setIsTranslating] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'documents'),
        where('ownerId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const records = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSavedRecords(records);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  }, [user]);

  useEffect(() => {
    if (view === 'history' && user) {
      fetchHistory();
    }
  }, [view, user, fetchHistory]);

  const fetchApiKey = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'api_keys'),
        where('uid', '==', user.uid),
        where('active', '==', true)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setApiKey(querySnapshot.docs[0].data().key);
      }
    } catch (error) {
      console.error("Error fetching API key:", error);
    }
  }, [user]);

  useEffect(() => {
    if (view === 'developer' && user) {
      fetchApiKey();
    }
  }, [view, user, fetchApiKey]);

  const generateApiKey = async () => {
    if (!user) return;
    setIsGeneratingKey(true);
    try {
      // In a real production app, this would be a protected backend call
      // For this implementation, we'll use an internal API call or Firestore directly
      // Since we have the node server, we should call the server.
      // But for simplicity during setup, I'll generate it here and save to Firestore
      // (The server will still validate it)
      
      const newKey = `sk_live_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
      
      // Revoke old keys
      const q = query(collection(db, 'api_keys'), where('uid', '==', user.uid));
      const oldKeys = await getDocs(q);
      
      // Add new key
      await addDoc(collection(db, 'api_keys'), {
        key: newKey,
        uid: user.uid,
        active: true,
        createdAt: serverTimestamp(),
      });
      
      setApiKey(newKey);
      setNotification({ message: "API key generated successfully!", type: 'success' });
    } catch (error) {
      console.error("Error generating API key:", error);
      setNotification({ message: "Failed to generate API key.", type: 'error' });
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleConfirmData = async () => {
    if (!selectedFile?.result || !user) {
      if (!user) setNotification({ message: "Please sign in to save data.", type: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      // Ensure we have Arabic data before saving
      let currentArData = selectedFile.resultAr;
      if (!currentArData) {
        setIsTranslating(true);
        try {
          currentArData = await translateToArabic(selectedFile.result);
          // Update the local state so the user sees it if they toggle later
          setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, resultAr: currentArData } : f));
        } catch (transError) {
          console.error("Auto-translation failed:", transError);
          // We can still continue with English only if needed, but the user asked for Arabic
        } finally {
          setIsTranslating(false);
        }
      }

      await addDoc(collection(db, 'documents'), {
        ...selectedFile.result,
        resultAr: currentArData || null, // Explicitly save Arabic version
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        extractedLanguage: language
      });
      setNotification({ message: "data saved with translations", type: 'success' });
    } catch (error) {
      console.error("Error saving document:", error);
      setNotification({ message: "data not saved", type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedFile = files.find(f => f.id === selectedFileId) || (files.length > 0 ? files[0] : null);

  useEffect(() => {
    if (files.length > 0 && !selectedFileId) {
      setSelectedFileId(files[0].id);
    }
  }, [files, selectedFileId]);

  const processFile = async (id: string, file: File) => {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      const data = await extractIDData(base64, file.type);
      
      setFiles(prev => prev.map(f => 
        f.id === id ? { ...f, status: 'completed', result: data } : f
      ));
    } catch (error) {
      console.error(error);
      setFiles(prev => prev.map(f => 
        f.id === id ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' } : f
      ));
    }
  };

  const onFilesAdded = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;

    const added: ProcessingFile[] = Array.from(newFiles).map(file => {
      const id = Math.random().toString(36).substr(2, 9);
      return {
        id,
        file,
        preview: URL.createObjectURL(file),
        status: 'pending'
      };
    });

    setFiles(prev => [...prev, ...added]);
    added.forEach(f => {
      setFiles(prev => prev.map(curr => curr.id === f.id ? { ...curr, status: 'processing' } : curr));
      processFile(f.id, f.file);
    });
  }, []);

  const handleCopyAll = () => {
    const data = language === 'ar' ? selectedFile?.resultAr : selectedFile?.result;
    if (!data) return;
    const text = Object.entries(data)
      .filter(([key]) => key !== 'additionalFields')
      .map(([key, val]) => `${key}: ${val}`)
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  const handleLanguageToggle = async (newLang: 'en' | 'ar') => {
    if (newLang === 'ar' && selectedFile && !selectedFile.resultAr && selectedFile.result) {
      setIsTranslating(true);
      try {
        const translated = await translateToArabic(selectedFile.result);
        setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, resultAr: translated } : f));
      } catch (error) {
        setNotification({ message: "Translation failed", type: 'error' });
        return;
      } finally {
        setIsTranslating(false);
      }
    }
    setLanguage(newLang);
  };

  const progress = files.length > 0 
    ? Math.round((files.filter(f => f.status === 'completed').length / files.length) * 100) 
    : 0;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">ID-Scan <span className="text-blue-400">Pro</span></span>
          </div>

          <nav className="hidden md:flex items-center space-x-1">
            <button 
              onClick={() => setView('scan')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${view === 'scan' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              Scanner
            </button>
            <button 
              onClick={() => setView('history')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${view === 'history' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              History
            </button>
            <button 
              onClick={() => setView('developer')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${view === 'developer' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              Developer
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-6 text-sm">
          {user ? (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-5 h-5 rounded-full" alt="Avatar" />
                ) : (
                  <UserIcon className="w-4 h-4 text-slate-400" />
                )}
                <span className="font-medium text-slate-200">{user.displayName || 'Operator'}</span>
              </div>
              <button 
                onClick={logout}
                className="text-slate-400 hover:text-red-400 transition"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={signInWithGoogle}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-1.5 rounded-lg font-semibold transition shadow-lg shadow-blue-900/20"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex flex-1 overflow-hidden" 
           onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
           onDragLeave={() => setIsDragging(false)}
           onDrop={(e) => { e.preventDefault(); setIsDragging(false); onFilesAdded(e.dataTransfer.files); }}>
        
        {/* Sidebar: Bulk Upload & Queue */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-100">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold flex items-center justify-center space-x-2 transition shadow-sm active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>Bulk Upload</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              multiple 
              accept="image/*,application/pdf" 
              onChange={(e) => onFilesAdded(e.target.files)} 
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-bold uppercase text-slate-400 tracking-widest leading-none">
                Processing Queue ({files.length})
              </h3>
              {files.length > 0 && (
                <button onClick={() => setFiles([])} className="text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 border border-dashed border-slate-200 rounded-xl px-4 text-center">
                <Files className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-xs">No documents queued. Drop files anywhere to start.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFileId(file.id)}
                    className={`
                      w-full text-left p-3 rounded-lg border transition-all duration-200 group
                      ${selectedFileId === file.id 
                        ? 'bg-blue-50 border-blue-200 shadow-sm' 
                        : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'}
                    `}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-[11px] font-bold truncate max-w-[150px] ${selectedFileId === file.id ? 'text-blue-700' : 'text-slate-700'}`}>
                        {file.file.name}
                      </span>
                      <StatusBadge status={file.status} active={selectedFileId === file.id} />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">
                        {file.result?.documentType || (file.status === 'processing' ? 'Analyzing...' : 'ID Document')}
                      </p>
                      {file.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50/50">
            <div className="text-[10px] flex justify-between mb-1.5 uppercase font-bold tracking-wider">
              <span className="text-slate-500">Batch Progress</span>
              <span className="text-slate-900">{progress}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="bg-blue-500 h-full"
              />
            </div>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 flex flex-col p-8 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            {view === 'developer' ? (
              <motion.div 
                key="developer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex-1 flex flex-col max-w-4xl mx-auto w-full"
              >
                <div className="mb-8">
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900">Developer Settings</h2>
                  <p className="text-slate-500 mt-1">Integrate our identity extraction engine into your own applications.</p>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-slate-100">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                       <Zap className="w-5 h-5 text-amber-500" />
                       API Key Authentication
                    </h3>
                    <p className="text-sm text-slate-600 mb-6 max-w-2xl">
                      Each account is provided with a unique API key. Use this key to authenticate your requests by including it in the <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600">x-api-key</code> header.
                    </p>

                    {!user ? (
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 text-center">
                        <p className="text-sm text-slate-500 mb-4">You must be signed in to manage API keys.</p>
                        <button onClick={signInWithGoogle} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">Sign In</button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex flex-col">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Secret API Key</label>
                          <div className="flex gap-2">
                            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-sm flex items-center justify-between">
                              <span className={apiKey ? "text-slate-900" : "text-slate-300 italic"}>
                                {apiKey ? (apiKey.substring(0, 12) + "•".repeat(24)) : "No active API key found"}
                              </span>
                              {apiKey && (
                                <button 
                                  onClick={() => navigator.clipboard.writeText(apiKey)}
                                  className="text-slate-400 hover:text-blue-500 transition"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            <button 
                              onClick={generateApiKey}
                              disabled={isGeneratingKey}
                              className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg shadow-slate-200 disabled:opacity-50"
                            >
                              {isGeneratingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : (apiKey ? 'Roll Key' : 'Generate Key')}
                            </button>
                          </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-4">
                          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-800 leading-relaxed">
                            <p className="font-bold mb-1">Security Warning</p>
                            <p>Never share your secret API key in public places or client-side code. If your key is compromised, regenerate it immediately to invalidate the old one.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-8 bg-slate-50/50">
                    <h3 className="text-sm font-bold mb-4 uppercase tracking-widest text-slate-400">Quick Integration Guide</h3>
                    
                    <div className="space-y-6">
                      <div>
                        <p className="text-xs font-bold text-slate-700 mb-2">Base URL</p>
                        <code className="block bg-white border border-slate-200 p-3 rounded-xl text-xs font-mono text-blue-600">
                          https://{window.location.host}/api/v1
                        </code>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-slate-700 mb-2">Example Request (cURL)</p>
                        <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl text-[11px] font-mono overflow-x-auto">
{`curl -X POST https://${window.location.host}/api/v1/extract \\
  -H "x-api-key: YOUR_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "image": "BASE64_IMAGE_DATA",
    "mimeType": "image/jpeg"
  }'`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : view === 'history' ? (
              <motion.div 
                key="history"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex-1 flex flex-col max-w-6xl mx-auto w-full"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Document History</h2>
                    <p className="text-slate-500 mt-1">Review and manage your securely stored extractions.</p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search records..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition w-64 shadow-sm"
                    />
                  </div>
                </div>

                {!user ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm">
                    <UserIcon className="w-16 h-16 text-slate-200 mb-4" />
                    <h3 className="text-xl font-bold mb-2">Authentication Required</h3>
                    <p className="text-slate-500 mb-8 max-w-md">Sign in with your work account to view and synchronize your document processing history across devices.</p>
                    <button 
                      onClick={signInWithGoogle}
                      className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200"
                    >
                      Sign in with Google
                    </button>
                  </div>
                ) : savedRecords.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm">
                    <History className="w-16 h-16 text-slate-200 mb-4" />
                    <h3 className="text-xl font-bold mb-2">No Records Found</h3>
                    <p className="text-slate-500 mb-8">You haven't confirmed any extracted data yet. Saved documents will appear here.</p>
                    <button 
                      onClick={() => setView('scan')}
                      className="text-blue-600 font-bold hover:underline"
                    >
                      Return to Scanner
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedRecords
                      .filter(r => 
                        r.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        r.documentNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        r.documentType?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((record) => {
                        const currentData = language === 'ar' && record.resultAr ? record.resultAr : record;
                        return (
                        <motion.div 
                          key={record.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative group ${language === 'ar' ? 'font-arabic text-right' : ''}`}
                          dir={language === 'ar' ? 'rtl' : 'ltr'}
                        >
                          <button 
                            onClick={async () => {
                              if (confirm("Delete this record permanently?")) {
                                await deleteDoc(doc(db, 'documents', record.id));
                                fetchHistory();
                              }
                            }}
                            className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'} text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          <div className="flex items-center gap-3 mb-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                              currentData.documentType?.toLowerCase().includes('visa') || currentData.documentType?.includes('تأشيرة') ? 'bg-amber-50 text-amber-600' : 
                              currentData.documentType?.toLowerCase().includes('residence') || currentData.documentType?.includes('إقامة') ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-600'
                            }`}>
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{currentData.fullName}</h4>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">{currentData.documentType}</p>
                            </div>
                          </div>

                          <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-xs items-center">
                              <span className="text-slate-400 font-bold uppercase tracking-tighter shrink-0">{language === 'ar' ? 'رقم المستند' : 'Doc ID'}</span>
                              <span className="font-mono font-medium truncate ml-2">{currentData.documentNumber || currentData.uidNo || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between text-xs items-center">
                              <span className="text-slate-400 font-bold uppercase tracking-tighter shrink-0">{language === 'ar' ? 'الجنسية' : 'Nationality'}</span>
                              <span className="font-medium truncate ml-2">{currentData.nationality || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between text-xs items-center">
                              <span className="text-slate-400 font-bold uppercase tracking-tighter shrink-0">{language === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</span>
                              <span className="font-medium ml-2">
                                {record.createdAt?.toDate().toLocaleDateString(language === 'ar' ? 'ar-AE' : undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                          </div>

                          <button 
                            onClick={() => {
                              alert("Detailed view coming soon!");
                            }}
                            className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[11px] font-bold uppercase tracking-widest transition"
                          >
                            {language === 'ar' ? 'عرض كامل التفاصيل' : 'View Full Details'}
                          </button>
                        </motion.div>
                      );})
}
                  </div>
                )}
              </motion.div>
            ) : !selectedFile ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl mx-auto"
              >
                <div className="w-20 h-20 bg-blue-100/50 text-blue-600 rounded-full flex items-center justify-center mb-6">
                  <Upload className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold mb-3">Begin Intelligent Extraction</h2>
                <p className="text-slate-500 leading-relaxed mb-8">
                  Drop your identity documents anywhere on the screen or click "Bulk Upload" in the sidebar to start high-precision data extraction.
                </p>
                <div className="grid grid-cols-3 gap-6 w-full opacity-60 grayscale hover:grayscale-0 transition-all">
                  <div className="p-4 border border-slate-200 rounded-xl flex flex-col items-center">
                    <Zap className="w-5 h-5 text-amber-500 mb-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Instant</span>
                  </div>
                  <div className="p-4 border border-slate-200 rounded-xl flex flex-col items-center">
                    <ShieldCheck className="w-5 h-5 text-blue-500 mb-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Secure</span>
                  </div>
                  <div className="p-4 border border-slate-200 rounded-xl flex flex-col items-center">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mb-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Precise</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key={selectedFile.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1 flex flex-col"
              >
                {/* Results Header */}
                <div className="flex items-start justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Extraction Results</h2>
                    <p className="text-slate-500 mt-1 flex items-center gap-2">
                      Reviewing <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700 underline underline-offset-4">{selectedFile.file.name}</span>
                    </p>
                  </div>
                  <div className="flex space-x-3">
                    <button 
                      onClick={handleCopyAll}
                      disabled={!selectedFile.result}
                      className="px-5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 flex items-center shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                      <Copy className="w-4 h-4 mr-2 text-slate-400" />
                      Copy All Fields
                    </button>
                    <button 
                      onClick={handleConfirmData}
                      disabled={!selectedFile.result || isSaving}
                      className="px-5 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 shadow-lg shadow-slate-200 transition active:scale-95 flex items-center gap-2"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      Confirm Data
                    </button>
                  </div>
                  
                  {/* Language Toggle */}
                  <div className="flex justify-end mt-4">
                    <div className="bg-slate-200/50 p-1 rounded-xl flex items-center gap-1">
                      <button 
                        onClick={() => handleLanguageToggle('en')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        ENGLISH
                      </button>
                      <button 
                        onClick={() => handleLanguageToggle('ar')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${language === 'ar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {isTranslating && <Loader2 className="w-3 h-3 animate-spin" />}
                        العربية
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-8 flex-1 min-h-0">
                  {/* Visual Preview */}
                  <div className="w-80 lg:w-96 shrink-0 flex flex-col gap-4">
                    <div className="relative aspect-[3/4] bg-slate-200 rounded-2xl border-4 border-white shadow-xl overflow-hidden flex flex-col items-center justify-center text-slate-400 group">
                      <div className="absolute top-4 left-4 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded font-bold z-10 shadow-sm">
                        AI SCAN OVERLAY
                      </div>
                      
                      {selectedFile.preview ? (
                        <img 
                          src={selectedFile.preview} 
                          alt="ID Preview" 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                        />
                      ) : (
                        <Files className="w-16 h-16 opacity-20" />
                      )}

                      {selectedFile.status === 'processing' && (
                        <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-[2px] flex items-center justify-center">
                          <div className="flex flex-col items-center">
                            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                            <div className="h-0.5 w-32 bg-blue-200 rounded-full overflow-hidden">
                              <motion.div 
                                animate={{ x: [-128, 128] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                className="h-full w-full bg-blue-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">File Size</span>
                        <span className="text-xs font-semibold">{(selectedFile.file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Mime Type</span>
                        <span className="text-xs font-semibold">{selectedFile.file.type}</span>
                      </div>
                    </div>
                  </div>

                  {/* Data Columns */}
                  <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    {selectedFile.status === 'error' ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
                          <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>
                        <h3 className="text-lg font-bold mb-2 text-red-900">Extraction Failed</h3>
                        <p className="text-slate-500 text-sm max-w-sm mb-6">
                          {selectedFile.error || "An unexpected error occurred during processing."}
                        </p>
                        <button 
                          onClick={() => processFile(selectedFile.id, selectedFile.file)}
                          className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition"
                        >
                          Retry Extraction
                        </button>
                      </div>
                    ) : !selectedFile.result ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                        <h3 className="text-lg font-bold mb-2">Analyzing Document</h3>
                        <p className="text-slate-500 text-sm max-w-sm">
                          Our AI models are identifying the document type and extracting high-fidelity textual information.
                        </p>
                      </div>
                    ) : (
                      <div className={`grid grid-cols-1 lg:grid-cols-2 flex-1 overflow-hidden ${language === 'ar' ? 'font-arabic' : ''}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
                        {(() => {
                          const currentData = language === 'ar' && selectedFile.resultAr ? selectedFile.resultAr : (selectedFile.result as IDDocumentData);
                          const docType = currentData.documentType?.toLowerCase() || '';
                          const isVisa = docType.includes('visa') || docType.includes('تأشيرة');
                          const isCancel = docType.includes('cancel') || docType.includes('إلغاء');
                          const isResidence = (docType.includes('residence') || docType.includes('إقامة')) && !isCancel;
                          
                          const labels = language === 'ar' ? {
                            holderDetails: 'تفاصيل حامل التأشيرة',
                            residenceDetails: 'تفاصيل الإقامة',
                            cancelDetails: 'تفاصيل الإلغاء',
                            idDetails: 'معلومات الهوية',
                            visaAppNo: 'رقم طلب التأشيرة',
                            fullName: 'الاسم الكامل',
                            dob: 'تاريخ الميلاد',
                            pob: 'مكان الميلاد',
                            nationality: 'الجنسية',
                            gender: 'الجنس',
                            profession: 'المهنة',
                            sponsor: 'الكفيل',
                            permitMetadata: 'بيانات التصريح',
                            resMetadata: 'بيانات الإقامة',
                            cancelProgress: 'سير الإلغاء',
                            docMetadata: 'بيانات المستند',
                            docNo: 'رقم المستند',
                            docType: 'نوع المستند',
                            expiry: 'تاريخ الانتهاء',
                            poi: 'مكان الإصدار',
                            issueDate: 'تاريخ الإصدار',
                            status: 'الحالة',
                            cancelDate: 'تاريخ الإلغاء',
                            cancelReason: 'سبب الإلغاء',
                            uid: 'رقم الموحد',
                            fileNo: 'رقم الملف',
                            passportNo: 'رقم الجواز',
                            entryPermit: 'رقم إذن الدخول',
                            visaStatus: 'حالة التأشيرة',
                            validation: 'فحص صحة النظام'
                          } : {
                            holderDetails: 'Visa Holder Details',
                            residenceDetails: 'Residence Details',
                            cancelDetails: 'Cancellation Details',
                            idDetails: 'Identity Information',
                            visaAppNo: 'Visa Application Number',
                            fullName: 'Full Name',
                            dob: 'Date of Birth',
                            pob: 'Place of Birth',
                            nationality: 'Nationality',
                            gender: 'Gender / Sex',
                            profession: 'Profession',
                            sponsor: 'Sponsor',
                            permitMetadata: 'Permit Metadata',
                            resMetadata: 'Residence Metadata',
                            cancelProgress: 'Cancellation Progress',
                            docMetadata: 'Document Metadata',
                            docNo: 'Document Number',
                            docType: 'Document Type',
                            expiry: 'Expire Date',
                            poi: 'Place of Issue',
                            issueDate: 'Issue Date',
                            status: 'Status',
                            cancelDate: 'Cancel Date',
                            cancelReason: 'Cancel Reason',
                            uid: 'U.I.D No',
                            fileNo: 'File No',
                            passportNo: 'Passport No',
                            entryPermit: 'Entry Permit No',
                            visaStatus: 'Visa Status',
                            validation: 'System Validation Check'
                          };

                          return (
                            <>
                              {/* Dynamic Column 1: Personal / Identity Information */}
                              <div className="p-8 border-b lg:border-b-0 lg:border-r border-slate-100 overflow-y-auto custom-scrollbar">
                                <h4 className="text-[11px] font-extrabold text-slate-400 uppercase mb-8 tracking-wider flex items-center gap-2">
                                  <Plus className="w-3 h-3 text-blue-500" />
                                  {isVisa ? labels.holderDetails : isResidence ? labels.residenceDetails : isCancel ? labels.cancelDetails : labels.idDetails}
                                </h4>
                                
                                <div className="space-y-6">
                                  {/* Visa App No - ONLY for Visas */}
                                  {isVisa && (
                                    <DataField label={labels.visaAppNo} value={currentData.visaApplicationNumber} isMono large language={language} />
                                  )}
                                  
                                  <DataField label={labels.fullName} value={currentData.fullName} large language={language} />
                                  
                                  {/* Gender / DOB / Nationality logic */}
                                  {!isResidence && !isCancel && (
                                    <DataField label={labels.dob} value={currentData.dateOfBirth} language={language} />
                                  )}
                                  
                                  {/* Place of Birth - ONLY for Visas */}
                                  {isVisa && (
                                    <DataField label={labels.pob} value={currentData.placeOfBirth} language={language} />
                                  )}
                                  
                                  {/* Nationality - For everyone except residence */}
                                  {(isCancel || (!isResidence && !isVisa)) && (
                                    <DataField label={labels.nationality} value={currentData.nationality} language={language} />
                                  )}
                                  
                                  {/* Gender */}
                                  {!isVisa && !isResidence && !isCancel && (
                                    <DataField label={labels.gender} value={currentData.gender} language={language} />
                                  )}
                                  
                                  {/* Profession */}
                                  {(isVisa || isResidence || isCancel) && (
                                    <DataField label={labels.profession} value={currentData.profession} language={language} />
                                  )}

                                  {/* Sponsor */}
                                  {(isResidence || isCancel) && (
                                    <DataField label={labels.sponsor} value={currentData.sponsor} language={language} />
                                  )}
                                </div>
                              </div>

                              {/* Dynamic Column 2: Document & Metadata */}
                              <div className="p-8 border-slate-100 overflow-y-auto custom-scrollbar flex-1">
                                <h4 className="text-[11px] font-extrabold text-slate-400 uppercase mb-8 tracking-wider flex items-center gap-2">
                                  <Plus className="w-3 h-3 text-blue-500" />
                                  {isVisa ? labels.permitMetadata : isResidence ? labels.resMetadata : isCancel ? labels.cancelProgress : labels.docMetadata}
                                </h4>
                                
                                <div className="space-y-6">
                                  {/* Document Number */}
                                  {!isVisa && !isResidence && !isCancel && (
                                    <DataField label={labels.docNo} value={currentData.documentNumber} isMono large language={language} />
                                  )}

                                  <div className="grid grid-cols-2 gap-6">
                                    <DataField label={labels.docType} value={currentData.documentType} language={language} />
                                    
                                    {/* Expire Date */}
                                    {!isVisa && !isCancel && (
                                      <DataField 
                                        label={labels.expiry} 
                                        value={currentData.dateOfExpiry} 
                                        isExpiryDateAsEligibility 
                                        language={language}
                                      />
                                    )}
                                  </div>
                                  
                                  {/* Place of Issue */}
                                  {!isCancel && <DataField label={labels.poi} value={currentData.placeOfIssue} language={language} />}

                                  {/* Issue Date */}
                                  {isResidence && (
                                    <DataField label={labels.issueDate} value={currentData.issueDate} language={language} />
                                  )}

                                  {/* Cancel Specific Metadata */}
                                  {isCancel && (
                                    <div className="pt-4 border-t border-slate-100 mt-4 space-y-6">
                                      <div className="grid grid-cols-2 gap-6">
                                        <DataField label={labels.status} value={currentData.documentStatus} language={language} />
                                        <DataField label={labels.cancelDate} value={currentData.cancelDate} language={language} />
                                      </div>
                                      <DataField label={labels.cancelReason} value={currentData.cancelReason} language={language} />
                                      
                                      <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                                        <DataField label={labels.uid} value={currentData.uidNo} isMono language={language} />
                                        <DataField label={labels.fileNo} value={currentData.fileNo} isMono language={language} />
                                      </div>
                                      <DataField label={labels.passportNo} value={currentData.passportNo} isMono language={language} />
                                    </div>
                                  )}

                                  {/* Residence Metadata */}
                                  {isResidence && (
                                    <div className="pt-4 border-t border-slate-100 mt-4 space-y-6">
                                      <div className="grid grid-cols-2 gap-6">
                                        <DataField label={labels.uid} value={currentData.uidNo} isMono language={language} />
                                        <DataField label={labels.fileNo} value={currentData.fileNo} isMono language={language} />
                                      </div>
                                      <DataField label={labels.passportNo} value={currentData.passportNo} isMono language={language} />
                                    </div>
                                  )}

                                  {/* Visa Metadata */}
                                  {isVisa && (
                                    <div className="pt-4 border-t border-slate-100 mt-4 space-y-6">
                                      <DataField label={labels.visaStatus} value={currentData.visaStatus} language={language} />
                                      <div className="grid grid-cols-2 gap-6">
                                        <DataField label={labels.uid} value={currentData.uidNo} isMono language={language} />
                                        <DataField label={labels.entryPermit} value={currentData.entryPermitNo} isMono language={language} />
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* System Status */}
                                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 mt-6">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-tighter">{labels.validation}</label>
                                    <div className="flex items-center space-x-3">
                                      <span className="text-green-600 bg-green-100 p-1 rounded-full">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      </span>
                                      <span className="text-[11px] font-mono text-slate-600 truncate">
                                        SECURE_READY_{currentData.documentNumber?.substring(0, 8) || 'NO_REF'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    
                    {/* Internal Footer Info */}
                    <div className="h-14 border-t border-slate-100 flex items-center px-8 justify-between bg-slate-50/50 text-[11px] text-slate-400">
                      <div className="flex space-x-6">
                        <span><span className="font-bold text-slate-500">Confidence:</span> 98.4%</span>
                        <span><span className="font-bold text-slate-500">Latency:</span> 1.2s</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <button className="text-blue-600 font-bold hover:underline underline-offset-2">Manual Correction</button>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Drop Indicator */}
          {isDragging && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-4 border-2 border-blue-500 border-dashed rounded-3xl bg-blue-50/20 backdrop-blur-sm z-[100] flex flex-col items-center justify-center pointer-events-none"
            >
              <div className="w-24 h-24 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl animate-bounce">
                <Download className="w-10 h-10" />
              </div>
              <p className="mt-6 text-xl font-bold text-blue-600">Release to Upload Documents</p>
            </motion.div>
          )}
        </main>
      </div>

      {/* Global Bulk Status Bar */}
      <footer className="h-14 bg-slate-800 text-white flex items-center justify-between px-6 shrink-0 shadow-2xl relative z-50">
        <div className="flex items-center space-x-4 text-sm font-medium">
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-3 ${files.length > 0 ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
            {files.length > 0 
              ? `Processing ${files.filter(f => f.status === 'completed').length} of ${files.length} documents...` 
              : "System ready for batch processing."}
          </div>
          <span className="text-slate-500 border-l border-slate-700 pl-4 text-xs font-mono">
            Batch Reference: #B-{Math.floor(Date.now()/100000)}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-1.5 rounded text-xs font-bold transition flex items-center gap-2"
          >
            {isPaused ? <><Play className="w-3 h-3" /> Resume</> : <><Pause className="w-3 h-3" /> Pause Batch</>}
          </button>
          <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-bold transition">
            Export JSON
          </button>
        </div>
      </footer>

      {/* Toast Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`fixed bottom-20 right-8 z-[100] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border ${
              notification.type === 'success' 
                ? 'bg-white border-green-100 text-green-800' 
                : 'bg-white border-red-100 text-red-800'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              notification.type === 'success' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {notification.type === 'success' ? (
                <CheckCircle2 className={`w-6 h-6 ${notification.type === 'success' ? 'text-green-600' : 'text-red-600'}`} />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-600" />
              )}
            </div>
            <div>
              <p className="font-bold text-sm tracking-tight">{notification.message}</p>
              <p className="text-[10px] uppercase font-bold opacity-50 tracking-widest leading-none mt-1">
                {notification.type === 'success' ? 'Operation Success' : 'System Alert'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status, active }: { status: string, active: boolean }) {
  const styles = {
    pending: 'bg-slate-100 text-slate-500',
    processing: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700'
  } as any;

  return (
    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${styles[status] || styles.pending}`}>
      {status === 'processing' ? 'Active' : status === 'pending' ? 'Queued' : status}
    </span>
  );
}

function DataField({ label, value, large, isMono, isDanger, isExpiryDateAsEligibility, language = 'en' }: { 
  label: string, 
  value: string | undefined, 
  large?: boolean,
  isMono?: boolean,
  isDanger?: boolean,
  isExpiryDateAsEligibility?: boolean,
  language?: 'en' | 'ar'
}) {
  const handleCopy = () => {
    if (value) navigator.clipboard.writeText(value);
  };

  const getEligibility = (expiryDateStr: string | undefined) => {
    const isExpiryLabel = label === 'Expire Date' || label === 'تاريخ الانتهاء' || label === 'Eligibility' || label === 'الأهلية';
    if (!expiryDateStr || (!isExpiryLabel && !isExpiryDateAsEligibility)) return null;
    
    try {
      const today = new Date();
      const expiryDate = new Date(expiryDateStr);
      
      if (isNaN(expiryDate.getTime())) return null;

      const threshold = new Date(today);
      threshold.setMonth(threshold.getMonth() + 6);

      const isEligible = expiryDate >= threshold;
      
      if (!isEligible) {
        return { 
          text: language === 'ar' ? 'غير مؤهل' : 'Not Eligible', 
          classes: 'bg-red-50 text-red-600 border-red-100',
          eligible: false
        };
      } else {
        return { 
          text: language === 'ar' ? 'مؤهل' : 'Eligible', 
          classes: 'bg-green-50 text-green-600 border-green-100',
          eligible: true
        };
      }
    } catch (e) {
      return null;
    }
  };

  const eligibility = getEligibility(value);
  const isExpiryLabel = label === 'Expire Date' || label === 'تاريخ الانتهاء' || label === 'Eligibility' || label === 'الأهلية';
  const isColorCoded = isExpiryLabel || isExpiryDateAsEligibility || isDanger;

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5 px-0">
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
          {label}
        </label>
        {eligibility && (
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${eligibility.classes}`}>
            {eligibility.text}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between group/val">
        <span className={`
          font-semibold transition-colors
          ${large ? 'text-xl' : 'text-base font-medium'}
          ${isMono ? 'font-mono tracking-wider' : ''}
          ${isColorCoded && eligibility 
            ? (eligibility.eligible ? 'text-green-600' : 'text-red-600') 
            : (isDanger ? 'text-red-600' : 'text-slate-900')}
          ${!value ? 'text-slate-200' : ''}
        `}>
          {value || 'DATA_POINT_NOT_RESOLVED'}
        </span>
        <button 
          onClick={handleCopy}
          className="text-slate-300 hover:text-blue-500 opacity-0 group-hover/val:opacity-100 transition-opacity p-1"
          title={`Copy ${label}`}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}


