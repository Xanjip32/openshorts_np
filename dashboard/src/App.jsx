import React, { useState, useEffect } from 'react';
import { Upload, Settings, Play, RotateCcw, Terminal, X, Check } from 'lucide-react';
import MediaInput from './components/MediaInput';
import ResultCard from './components/ResultCard';
import ProcessingAnimation from './components/ProcessingAnimation';
import { getApiUrl } from './config';

const SECRET_KEY = import.meta.env.VITE_ENCRYPTION_KEY || "OpenShorts-Static-Salt-Change-Me";
const ENCRYPTION_PREFIX = "ENC:";

const encrypt = (text) => {
  if (!text) return '';
  try {
    const xor = text.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length))
    ).join('');
    return ENCRYPTION_PREFIX + btoa(xor);
  } catch (e) { return text; }
};

const decrypt = (text) => {
  if (!text) return '';
  if (text.startsWith(ENCRYPTION_PREFIX)) {
    try {
      const raw = text.slice(ENCRYPTION_PREFIX.length);
      const xor = atob(raw);
      return xor.split('').map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length))
      ).join('');
    } catch (e) { return ''; }
  }
  return text;
};

const pollJob = async (jobId) => {
  const res = await fetch(getApiUrl(`/api/status/${jobId}`));
  if (!res.ok) throw new Error('Status check failed');
  return res.json();
};

function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_key') || '');
  const [mimoKey, setMimoKey] = useState(() => {
    const stored = localStorage.getItem('mimoKey_v1');
    if (stored) return decrypt(stored);
    return '';
  });
  const [llmProvider, setLlmProvider] = useState(() => localStorage.getItem('llm_provider') || 'gemini');
  const [language, setLanguage] = useState(() => localStorage.getItem('transcription_language') || 'ne');

  const [view, setView] = useState('dashboard');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState(null);
  const [logs, setLogs] = useState([]);
  const [processingMedia, setProcessingMedia] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { localStorage.setItem('gemini_key', apiKey); }, [apiKey]);
  useEffect(() => { if (mimoKey) localStorage.setItem('mimoKey_v1', encrypt(mimoKey)); }, [mimoKey]);
  useEffect(() => { localStorage.setItem('llm_provider', llmProvider); }, [llmProvider]);
  useEffect(() => { localStorage.setItem('transcription_language', language); }, [language]);

  useEffect(() => {
    let interval;
    if ((status === 'processing') && jobId) {
      interval = setInterval(async () => {
        try {
          const data = await pollJob(jobId);
          if (data.result) setResults(data.result);
          if (data.status === 'completed') { setStatus('complete'); clearInterval(interval); }
          else if (data.status === 'failed') {
            setStatus('error');
            const errorMsg = data.error || (data.logs?.length > 0 ? data.logs[data.logs.length - 1] : "Process failed");
            setLogs(prev => [...prev, "Error: " + errorMsg]);
            clearInterval(interval);
          } else { if (data.logs) setLogs(data.logs); }
        } catch (e) { console.error("Polling error", e); }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [status, jobId]);

  const handleProcess = async (data) => {
    if (llmProvider === 'gemini' && !apiKey) { alert('Set your Gemini API key in Settings first.'); setShowSettings(true); return; }
    if (llmProvider === 'mimo' && !mimoKey) { alert('Set your MiMo API key in Settings first.'); setShowSettings(true); return; }

    setStatus('processing');
    setLogs(["Starting..."]);
    setResults(null);
    setProcessingMedia(data);

    try {
      const headers = {};
      if (llmProvider === 'gemini') headers['X-Gemini-Key'] = apiKey;
      else headers['X-Mimo-Key'] = mimoKey;

      let body;
      if (data.type === 'url') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ url: data.payload, acknowledged: true, language });
      } else {
        const fd = new FormData();
        fd.append('file', data.payload);
        fd.append('acknowledged', 'true');
        fd.append('language', language);
        body = fd;
      }

      const res = await fetch(getApiUrl('/api/process'), { method: 'POST', headers, body });
      if (!res.ok) throw new Error(await res.text());
      const resData = await res.json();
      setJobId(resData.job_id);
    } catch (e) {
      setStatus('error');
      setLogs(l => [...l, `Error: ${e.message}`]);
    }
  };

  const handleReset = () => { setStatus('idle'); setJobId(null); setResults(null); setLogs([]); setProcessingMedia(null); };

  if (showSettings) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-white p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Settings</h1>
          <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* LLM Provider */}
        <div className="bg-[#141418] border border-white/10 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">AI Provider</h2>
          <p className="text-xs text-zinc-500 mb-4">Choose which AI detects viral moments in your video.</p>
          <div className="flex gap-3 mb-4">
            <button onClick={() => setLlmProvider('gemini')}
              className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${llmProvider === 'gemini' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-white/10 text-zinc-500 hover:bg-white/5'}`}>
              Gemini (Google, free tier)
            </button>
            <button onClick={() => setLlmProvider('mimo')}
              className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${llmProvider === 'mimo' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 text-zinc-500 hover:bg-white/5'}`}>
              MiMo V2.5 (OpenAI-compatible)
            </button>
          </div>

          {llmProvider === 'gemini' && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Gemini API Key</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                placeholder="AIza..." />
              <p className="text-[10px] text-zinc-600 mt-1">Free at <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400">aistudio.google.com</a></p>
            </div>
          )}
          {llmProvider === 'mimo' && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">MiMo API Key</label>
              <input type="password" value={mimoKey} onChange={e => setMimoKey(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                placeholder="sk-..." />
              <p className="text-[10px] text-zinc-600 mt-1">Works with <a href="https://openrouter.ai" target="_blank" className="text-blue-400">OpenRouter</a>, <a href="https://deepinfra.com" target="_blank" className="text-blue-400">DeepInfra</a>, or <a href="https://api.xiaomimimo.com" target="_blank" className="text-blue-400">Xiaomi direct</a></p>
            </div>
          )}
        </div>

        {/* Language */}
        <div className="bg-[#141418] border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-2">Transcription Language</h2>
          <p className="text-xs text-zinc-500 mb-4">Language of your video. Whisper medium model used for best accuracy.</p>
          <select value={language} onChange={e => setLanguage(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
            <option value="ne">Nepali</option>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
            <option value="auto">Auto-detect</option>
          </select>
        </div>

        <button onClick={() => setShowSettings(false)}
          className="w-full mt-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-colors">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold">OpenShorts</h1>
        <div className="flex items-center gap-3">
          {status !== 'idle' && (
            <button onClick={handleReset} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
              <RotateCcw size={14} /> New
            </button>
          )}
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <Settings size={14} /> Settings
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 overflow-hidden">
        {/* Idle: Upload */}
        {status === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center p-6">
            <div className="max-w-xl w-full text-center space-y-6">
              <div>
                <h2 className="text-4xl font-black bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
                  Nepali Podcast → Viral Clips
                </h2>
                <p className="text-zinc-400 mt-2">Upload your video. AI finds the best moments.</p>
              </div>
              <MediaInput onProcess={handleProcess} isProcessing={false} />
              <p className="text-xs text-zinc-600">Language: {language === 'ne' ? 'Nepali' : language === 'hi' ? 'Hindi' : language === 'en' ? 'English' : 'Auto'} | Provider: {llmProvider === 'gemini' ? 'Gemini' : 'MiMo'}</p>
            </div>
          </div>
        )}

        {/* Processing / Results */}
        {(status === 'processing' || status === 'complete' || status === 'error') && (
          <div className="h-full flex flex-col md:flex-row">
            {/* Left: Status + Logs */}
            <div className={`h-full flex flex-col border-r border-white/5 bg-black/20 p-6 overflow-y-auto ${status === 'complete' ? 'w-full md:w-[30%]' : 'w-full md:w-[55%]'}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${status === 'processing' ? 'bg-yellow-400 animate-pulse' : status === 'complete' ? 'bg-green-400' : 'bg-red-400'}`} />
                  {status === 'processing' ? 'Processing...' : status === 'complete' ? 'Complete' : 'Failed'}
                </h2>
                {results?.clips?.length > 0 && (
                  <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{results.clips.length} clips</span>
                )}
              </div>

              {processingMedia && <ProcessingAnimation media={processingMedia} isComplete={status === 'complete'} />}

              <div className="bg-[#0c0c0e] rounded-xl border border-white/10 mt-4 flex-1 min-h-[150px] flex flex-col">
                <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 bg-white/5 shrink-0">
                  <Terminal size={12} className="text-zinc-400" />
                  <span className="text-xs text-zinc-400">Logs</span>
                </div>
                <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1 text-zinc-400">
                  {logs.map((log, i) => (
                    <div key={i} className={log.toLowerCase().includes('error') ? 'text-red-400' : ''}>{log}</div>
                  ))}
                  {status === 'processing' && <div className="animate-pulse text-blue-400">_</div>}
                </div>
              </div>
            </div>

            {/* Right: Results */}
            <div className={`h-full flex flex-col p-6 overflow-y-auto ${status === 'complete' ? 'w-full md:w-[70%]' : 'w-full md:w-[45%]'}`}>
              <h2 className="text-lg font-semibold mb-4 shrink-0">Generated Shorts</h2>
              <div className="flex-1 overflow-y-auto">
                {results?.clips?.length > 0 ? (
                  <div className="grid gap-4 grid-cols-1 xl:grid-cols-2 pb-10">
                    {results.clips.map((clip, i) => (
                      <ResultCard key={i} clip={clip} index={i} jobId={jobId} geminiApiKey={apiKey} />
                    ))}
                  </div>
                ) : status === 'processing' ? (
                  <div className="h-full flex items-center justify-center text-zinc-500 text-sm">Waiting for clips...</div>
                ) : status === 'error' ? (
                  <div className="h-full flex items-center justify-center text-red-400 text-sm">Generation failed. Check logs.</div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
