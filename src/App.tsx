import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  Download, 
  Trash2, 
  Instagram, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DocumentRecord {
  id: number;
  original_name: string;
  original_file: string;
  converted_docx: string;
  converted_pdf: string;
  created_at: string;
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      setDocuments(data);
    } catch (err) {
      console.error('Failed to fetch documents');
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFile = async (file: File) => {
    if (!file) return;
    
    const validTypes = [
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    // Check extension as fallback for some browsers
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isTxt = file.name.toLowerCase().endsWith('.txt');
    
    if (!validTypes.includes(file.type) && !isDocx && !isPdf && !isTxt) {
      setError('Please upload only PDF, DOCX, or TXT files.');
      return;
    }

    setError(null);
    setUploading(true);
    
    const formData = new FormData();
    formData.append('document', file);
    formData.append('darkMode', isDarkMode.toString());

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) throw new Error('Conversion failed');
      
      await fetchDocuments();
    } catch (err) {
      setError('Conversion failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleTextConvert = async () => {
    if (!pastedText.trim()) {
      setError('Please paste some text first.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const res = await fetch('/api/convert-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: pastedText,
          darkMode: isDarkMode
        }),
      });
      
      if (!res.ok) throw new Error('Conversion failed');
      
      setPastedText('');
      await fetchDocuments();
    } catch (err) {
      setError('Conversion failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch('/api/documents/' + id, { method: 'DELETE' });
      fetchDocuments();
    } catch (err) {
      console.error('Failed to delete');
    }
  };

  const handleReset = async () => {
    try {
      await fetch('/api/documents-reset', { method: 'DELETE' });
      setShowResetConfirm(false);
      fetchDocuments();
    } catch (err) {
      console.error('Failed to reset');
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDownload = (path: string, fileName: string) => {
    const url = `/api/download?path=${encodeURIComponent(path)}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#1a1a1a] font-sans selection:bg-[#1a1a1a] selection:text-[#f4f1ea] overflow-x-hidden paper-texture">
      {/* Dynamic Background Watermark - Vintage Style */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.05] flex flex-wrap gap-12 p-4 rotate-[-12deg] scale-150">
        {Array.from({ length: 60 }).map((_, i) => (
          <div key={i} className="text-4xl md:text-6xl font-mono uppercase tracking-[0.3em] whitespace-nowrap select-none">
            CLASSIFIED
          </div>
        ))}
      </div>

      {/* Vintage Header / Nav */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-[#f4f1ea]/80 backdrop-blur-md border-b-2 border-[#1a1a1a]/10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-[#1a1a1a] flex items-center justify-center text-[#1a1a1a] font-mono font-bold text-xl">2</div>
            <span className="text-2xl font-mono tracking-tighter uppercase font-bold">2MIN<span className="underline decoration-2 underline-offset-4">CHEAT</span></span>
          </div>

          {/* Mobile-style Capsule Toggle */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`
                relative w-24 h-10 rounded-full p-0.5 transition-all duration-500 ease-in-out border-2 border-[#1a1a1a] flex items-center
                ${isDarkMode ? 'bg-[#1a1a1a]' : 'bg-white'}
              `}
            >
              <motion.div 
                animate={{ x: isDarkMode ? 56 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-bold font-mono transition-colors duration-500
                  ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'}
                `}
              >
                {isDarkMode ? 'BLACK' : 'WHITE'}
              </motion.div>
            </button>
          </div>
          
          <a 
            href="https://www.instagram.com/2mincheat?igsh=cXVmdGUwZGhqdHc3" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 border-2 border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f4f1ea] px-4 py-2 transition-all text-[10px] tracking-widest uppercase font-bold"
          >
            <Instagram size={14} />
            <span className="hidden sm:inline">INSTAGRAM</span>
          </a>
        </div>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-20">
        {/* Hero Section */}
        <header className="mb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-block border-4 border-[#1a1a1a] p-4 mb-8 rotate-[-2deg]">
              <h1 className="text-5xl md:text-8xl font-mono font-bold tracking-tighter uppercase leading-none">
                TOP SECRET<br />
                <span className="bg-[#1a1a1a] text-[#f4f1ea] px-2">FORMATTING</span>
              </h1>
            </div>
            <p className="text-[#1a1a1a]/70 font-bold tracking-[0.2em] text-[10px] md:text-xs uppercase max-w-md mx-auto leading-relaxed font-mono">
              SPECIALLY CRAFTED FOR MINI.
            </p>
          </motion.div>
        </header>

        {/* Action Grid */}
        <div className="max-w-4xl mx-auto">
          {/* Tab Switcher */}
          <div className="flex justify-center mb-8">
            <div className="bg-white border-2 border-[#1a1a1a] p-1 flex gap-1">
              <button 
                onClick={() => setActiveTab('upload')}
                className={`px-6 py-2 font-mono font-bold text-[10px] tracking-widest transition-all ${activeTab === 'upload' ? 'bg-[#1a1a1a] text-[#f4f1ea]' : 'hover:bg-[#1a1a1a]/5'}`}
              >
                FILE UPLOAD
              </button>
              <button 
                onClick={() => setActiveTab('paste')}
                className={`px-6 py-2 font-mono font-bold text-[10px] tracking-widest transition-all ${activeTab === 'paste' ? 'bg-[#1a1a1a] text-[#f4f1ea]' : 'hover:bg-[#1a1a1a]/5'}`}
              >
                PASTE TEXT
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Main Action Area */}
            <section className="lg:col-span-12">
              {activeTab === 'upload' ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -5 }}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    relative border-2 border-[#1a1a1a] p-12 text-center cursor-pointer transition-all duration-300 bg-white/50
                    ${dragActive ? 'bg-[#1a1a1a]/5 shadow-[8px_8px_0px_rgba(26,26,26,1)]' : 'hover:shadow-[4px_4px_0px_rgba(26,26,26,1)]'}
                    ${uploading ? 'pointer-events-none opacity-50' : ''}
                  `}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    accept=".pdf,.docx"
                  />
                  
                  <div className="flex flex-col items-center gap-8">
                    <div className={`w-20 h-20 border-2 border-[#1a1a1a] flex items-center justify-center ${dragActive ? 'bg-[#1a1a1a] text-[#f4f1ea]' : 'text-[#1a1a1a]'} transition-all duration-300`}>
                      {uploading ? (
                        <Loader2 className="animate-spin" size={32} />
                      ) : (
                        <Upload size={32} />
                      )}
                    </div>
                    <div>
                      <h2 className="text-2xl font-mono font-bold mb-2 tracking-tight uppercase">
                        {uploading ? 'PROCESSING...' : 'INSERT FILE'}
                      </h2>
                      <p className="text-[#1a1a1a]/60 text-sm font-bold uppercase tracking-widest">PDF / DOCX ONLY</p>
                    </div>
                  </div>

                  {uploading && (
                    <div className="absolute bottom-0 left-0 h-2 bg-[#1a1a1a] animate-pulse w-full" />
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border-2 border-[#1a1a1a] p-8 shadow-[8px_8px_0px_rgba(26,26,26,0.1)]"
                >
                  <textarea 
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="PASTE YOUR QUESTIONS AND ANSWERS HERE..."
                    className="w-full h-64 p-4 font-mono text-sm border-2 border-[#1a1a1a]/10 focus:border-[#1a1a1a] focus:outline-none resize-none transition-all uppercase placeholder:opacity-30"
                  />
                  <div className="mt-6 flex justify-end">
                    <button 
                      onClick={handleTextConvert}
                      disabled={uploading || !pastedText.trim()}
                      className={`
                        px-8 py-3 bg-[#1a1a1a] text-[#f4f1ea] font-mono font-bold text-xs tracking-widest rounded-none flex items-center gap-2 transition-all
                        ${uploading || !pastedText.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0px_rgba(0,0,0,0.2)]'}
                      `}
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      {uploading ? 'CONVERTING...' : 'CONVERT TEXT'}
                    </button>
                  </div>
                </motion.div>
              )}

              <AnimatePresence>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="mt-6 flex items-center justify-center gap-3 text-red-600 font-bold uppercase tracking-tighter text-[10px] border-2 border-red-600 p-4 bg-red-50"
                  >
                    <AlertCircle size={14} />
                    <span>ERROR: {error}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* History List - Moved below or kept separate */}
            <section className="lg:col-span-12 mt-12">
              <div className="flex items-center justify-between mb-6 px-2 border-b-2 border-[#1a1a1a] pb-2">
                <h3 className="text-xl font-mono font-bold uppercase tracking-tighter">FILE ARCHIVE</h3>
                <div className="flex items-center gap-4">
                {documents.length > 0 && (
                  <button 
                    onClick={() => setShowResetConfirm(true)}
                    className="text-[10px] font-bold text-red-600 hover:underline uppercase tracking-widest"
                  >
                    RESET ARCHIVE
                  </button>
                )}
                <div className="text-[10px] font-bold text-[#1a1a1a] uppercase tracking-widest">
                  {documents.length} ENTRIES
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              {documents.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-[#1a1a1a]/20 text-[#1a1a1a]/40 font-bold uppercase tracking-widest text-[10px]">
                  ARCHIVE EMPTY
                </div>
              ) : (
                documents.map((doc) => (
                  <motion.div 
                    layout
                    key={doc.id} 
                    className="group bg-white/30 border-2 border-[#1a1a1a] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-white/60 transition-all duration-300"
                  >
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <div className="w-10 h-10 border-2 border-[#1a1a1a] flex items-center justify-center text-[#1a1a1a] group-hover:bg-[#1a1a1a] group-hover:text-[#f4f1ea] transition-all">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm tracking-tight truncate max-w-[180px] sm:max-w-[240px] uppercase font-mono">{doc.original_name}</h4>
                        <p className="text-[#1a1a1a]/50 text-[9px] font-bold uppercase tracking-widest mt-0.5">
                          FILED: {new Date(doc.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} {new Date(doc.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button 
                        onClick={() => handleDownload(doc.converted_pdf, `2mincheat-${doc.original_name}.pdf`)}
                        className="h-9 px-4 border-2 border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f4f1ea] text-[9px] font-bold uppercase tracking-widest transition-all flex-1 sm:flex-none"
                      >
                        PDF
                      </button>
                      <button 
                        onClick={() => handleDownload(doc.converted_docx, `2mincheat-${doc.original_name}.docx`)}
                        className="h-9 px-4 border-2 border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f4f1ea] text-[9px] font-bold uppercase tracking-widest transition-all flex-1 sm:flex-none"
                      >
                        DOCX
                      </button>
                      <button 
                        onClick={() => handleDelete(doc.id)}
                        className="w-9 h-9 flex items-center justify-center text-[#1a1a1a]/40 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
        <footer className="mt-40 text-center border-t-2 border-[#1a1a1a] pt-12">
          <div className="flex flex-col items-center gap-10">
            <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.8em] text-[#1a1a1a]/40 select-none font-mono">
              <span>2MINCHEAT</span>
              <div className="w-1 h-1 bg-[#1a1a1a]/40 rounded-full" />
              <span>SECURE</span>
            </div>

            <a 
              href="https://techszdeveloper.vercel.app/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group"
            >
              <p className="text-[#1a1a1a]/50 text-[9px] font-bold uppercase tracking-widest mb-2">DEVELOPED BY</p>
              <p className="text-xl font-mono font-bold tracking-tighter group-hover:underline transition-all uppercase">TECHSZDEVELOPER</p>
            </a>
          </div>
        </footer>
      </main>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetConfirm(false)}
              className="absolute inset-0 bg-[#1a1a1a]/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#f4f1ea] border-4 border-[#1a1a1a] p-8 max-w-md w-full shadow-[12px_12px_0px_rgba(26,26,26,1)]"
            >
              <h3 className="text-2xl font-mono font-bold uppercase tracking-tighter mb-4">WIPE ARCHIVE?</h3>
              <p className="text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-widest leading-relaxed mb-8">
                THIS ACTION WILL PERMANENTLY DELETE ALL CONVERTED DOCUMENTS AND ORIGINAL FILES FROM THE SERVER. THIS CANNOT BE UNDONE.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={handleReset}
                  className="flex-1 bg-red-600 text-white border-2 border-[#1a1a1a] py-3 font-mono font-bold uppercase tracking-widest hover:bg-red-700 transition-colors"
                >
                  CONFIRM WIPE
                </button>
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 bg-white border-2 border-[#1a1a1a] py-3 font-mono font-bold uppercase tracking-widest hover:bg-[#1a1a1a] hover:text-[#f4f1ea] transition-all"
                >
                  CANCEL
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

