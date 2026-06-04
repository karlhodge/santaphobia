import { useState, useEffect, useRef, useCallback } from "react";
import { KokoroTTS } from "kokoro-js";

const contacts = [
  {
    id: 1, name: "Dr. Sunita Patel", role: "Senior Lecturer, Public Health",
    org: "University of Leeds", avatar: "SP", color: "#4A90D9",
    stance: "Evidence-led academic specialising in health inequalities in West Yorkshire. Cautious, qualifies claims, cites data from Leeds Teaching Hospitals and regional NHS trusts. Critical of chronic underfunding of community health services. Will give a usable quote but hedges with caveats. Occasionally references the Marmot Review.",
    topics: "Leeds Teaching Hospitals, St James's, NHS West Yorkshire, health inequalities, Harehills, Beeston, deprivation",
    voice: "bf_emma",
  },
  {
    id: 2, name: "Tom Eccleston", role: "Head of Communications",
    org: "Leeds City Council", avatar: "TE", color: "#2ECC71",
    stance: "Council press officer. Stays firmly on message, defers to elected members, cites council strategy documents. Deflects criticism of service cuts by referencing central government funding reductions. Warm but evasive. Never speaks off the record.",
    topics: "Leeds City Council budget, local services, planning, housing development, Levelling Up, devolution, West Yorkshire Combined Authority",
    voice: "bm_george",
  },
  {
    id: 3, name: "Donna Hartley", role: "Regional Organiser",
    org: "UNISON West Yorkshire", avatar: "DH", color: "#E74C3C",
    stance: "Experienced union organiser. Frames everything around worker conditions, pay, and job security. Distrustful of both the council and private contractors. Gives direct, quotable statements. Draws on casework from NHS workers, school staff, and social care workers across the region.",
    topics: "Public sector pay, NHS staffing, Leeds City Council cuts, social care workforce, strike action, outsourcing",
    voice: "bf_isabella",
  },
  {
    id: 4, name: "Prof. Richard Sugden", role: "Professor of Regional Economics",
    org: "Leeds University Business School", avatar: "RS", color: "#9B59B6",
    stance: "Academic economist focused on northern economic development. Data-driven, uses productivity and regional disparity framing. Sceptical of government Levelling Up rhetoric, consistently points to structural underinvestment. Good with statistics. Will give clear, quotable analysis.",
    topics: "HS2 cancellation impact on Leeds, Levelling Up, West Yorkshire economy, regional inequality, employment, Leeds Bradford Airport",
    voice: "bm_lewis",
  },
  {
    id: 5, name: "Insp. Clare Mossop", role: "Force Communications Officer",
    org: "West Yorkshire Police", avatar: "CM", color: "#1A5276",
    stance: "Police media officer. Formal and measured. Sticks rigidly to confirmed facts, refuses to speculate. Uses passive voice. Will not comment on ongoing investigations or individual officers. Refers complex questions to the Police and Crime Commissioner's office.",
    topics: "West Yorkshire crime statistics, Harehills disorder, policing in Leeds, knife crime, community policing, major incidents",
    voice: "bf_emma",
  },
  {
    id: 6, name: "Callum Brierley", role: "Director",
    org: "Leeds Digital Festival", avatar: "CB", color: "#E67E22",
    stance: "Tech sector enthusiast and civic booster. Passionate about Leeds as a digital hub. Dismisses concerns about job displacement as overstated. Uses growth, investment, and talent pipeline framing. Slick and well-rehearsed. Apt to pivot any question into an opportunity.",
    topics: "Leeds tech sector, digital skills, AI adoption, Channel 4 Leeds, creative industries, Kirkgate Market tech incubators",
    voice: "bm_george",
  },
  {
    id: 7, name: "Sandra Osei", role: "Chief Executive",
    org: "St George's Crypt, Leeds", avatar: "SO", color: "#16A085",
    stance: "CEO of one of Leeds' oldest homeless charities. Emotionally grounded, cites individual cases and frontline data. Critical of both the council and central government. Will give powerful, human-led quotes. Frustrated by the revolving door of rough sleeping and temporary accommodation.",
    topics: "Homelessness in Leeds, rough sleeping, temporary accommodation, food poverty, Great George Street, Kirkgate, council housing",
    voice: "bf_isabella",
  },
  {
    id: 8, name: "Prof. Martin Caldwell", role: "Professor of Urban Planning",
    org: "Leeds Beckett University", avatar: "MC", color: "#27AE60",
    stance: "Planning academic with expertise in Leeds development and housing policy. Precise and analytical. Critical of speculative development that fails to meet affordable housing targets. References specific Leeds sites and planning decisions. Not an activist but will make pointed observations about planning failures.",
    topics: "Leeds housing crisis, South Bank regeneration, Aire Valley, gentrification, student housing, affordable homes targets, planning policy",
    voice: "bm_lewis",
  },
];

// ── Kokoro TTS singleton ─────────────────────────────────────
let kokoroInstance = null;
let kokoroLoading = false;
const kokoroCallbacks = [];

async function getKokoro(onProgress) {
  if (kokoroInstance) return kokoroInstance;
  if (kokoroLoading) {
    return new Promise((res, rej) => kokoroCallbacks.push({ res, rej }));
  }
  kokoroLoading = true;
  try {
    onProgress?.("Loading voice model… (first time only)");
    const isMac = /Mac/.test(navigator.platform);
    const hasWebGPU = isMac &&
      typeof navigator !== "undefined" &&
      navigator.gpu !== undefined &&
      await navigator.gpu.requestAdapter().then(a => a !== null).catch(() => false);
    const device = hasWebGPU ? "webgpu" : "wasm";
    const dtype = hasWebGPU ? "fp32" : "q4";
    if (!hasWebGPU) onProgress?.("Loading voice model… (first time only, CPU mode)");
    kokoroInstance = await KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-v1.0-ONNX",
      { dtype, device }
    );
    kokoroCallbacks.forEach(cb => cb.res(kokoroInstance));
    kokoroCallbacks.length = 0;
    return kokoroInstance;
  } catch (e) {
    kokoroLoading = false;
    kokoroCallbacks.forEach(cb => cb.rej(e));
    kokoroCallbacks.length = 0;
    throw e;
  }
}

function splitSentences(text) {
  const raw = text.match(/[^.!?]+[.!?]+[\"']?|[^.!?]+$/g) || [text];
  const out = [];
  let buf = "";
  for (const s of raw) {
    buf += s;
    if (buf.trim().length > 60) { out.push(buf.trim()); buf = ""; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length ? out : [text];
}

async function speakKokoro(text, voice, onStart, onEnd, onProgress, setCurrentAudio) {
  const tts = await getKokoro(onProgress);
  const sentences = splitSentences(text);
  onStart?.();
  const generateAudio = async (s) => {
    const audio = await tts.generate(s, { voice });
    const wav = audio.toWav();
    const blob = new Blob([wav], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  };
  let nextUrl = await generateAudio(sentences[0]);
  const speakLimit = Math.min(sentences.length, 2);
  for (let i = 0; i < speakLimit; i++) {
    const url = nextUrl;
    const nextPromise = i + 1 < speakLimit ? generateAudio(sentences[i + 1]) : null;
    await new Promise((resolve, reject) => {
      const el = new Audio(url);
      setCurrentAudio?.(el);
      el.onended = () => { URL.revokeObjectURL(url); resolve(); };
      el.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      el.play().catch(e => { URL.revokeObjectURL(url); reject(new Error(`Playback blocked: ${e.message}`)); });
    });
    if (nextPromise) nextUrl = await nextPromise;
  }
  onEnd?.();
}

function speakBrowser(text, onStart, onEnd) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();

  const doSpeak = () => {
    const all = window.speechSynthesis.getVoices();
    if (!all.length) { window.speechSynthesis.onvoiceschanged = doSpeak; return; }

    const score = (v) => {
      const name = v.name.toLowerCase();
      const isEnhanced = name.includes("enhanced") || name.includes("premium");
      const isBritish = v.lang === "en-GB" || name.includes("(uk)") || name.includes("british");
      const isEnglish = v.lang.startsWith("en");
      if (isBritish && isEnhanced) return 5;
      if (isEnglish && isEnhanced) return 4;
      if (isBritish) return 3;
      if (isEnglish) return 2;
      return 1;
    };
    const voice = all.slice().sort((a, b) => score(b) - score(a))[0];

    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = voice;
    utter.rate = 0.92;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    utter.onstart = onStart;

    const keepAlive = setInterval(() => {
      if (!window.speechSynthesis.speaking) { clearInterval(keepAlive); return; }
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 10000);
    utter.onend = () => { clearInterval(keepAlive); onEnd?.(); };
    utter.onerror = () => { clearInterval(keepAlive); onEnd?.(); };
    window.speechSynthesis.speak(utter);
  };
  doSpeak();
}

// ── UK ring tone (Web Audio API) ─────────────────────────────
function createRingTone() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  const pattern = [0.4, 0.2, 0.4, 2.0];
  let stopped = false;

  const playRing = (startTime) => {
    if (stopped) return;
    let t = startTime;
    for (let i = 0; i < pattern.length; i++) {
      if (i % 2 === 0) {
        [400, 450].forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = "sine";
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
          gain.gain.setValueAtTime(0.08, t + pattern[i] - 0.01);
          gain.gain.linearRampToValueAtTime(0, t + pattern[i]);
          osc.start(t);
          osc.stop(t + pattern[i]);
        });
      }
      t += pattern[i];
    }
    const cycleLength = pattern.reduce((a, b) => a + b, 0);
    if (!stopped) {
      setTimeout(() => playRing(ctx.currentTime), (cycleLength - 0.05) * 1000);
    }
  };

  playRing(ctx.currentTime + 0.1);

  return {
    stop: () => {
      stopped = true;
      try { ctx.close(); } catch {}
    }
  };
}

// ── Components ────────────────────────────────────────────────
function Avatar({ initials, color, size = 56, speaking = false }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {speaking && [1, 2, 3].map(i => (
        <div key={i} style={{
          position: "absolute", width: size + i * 22, height: size + i * 22,
          borderRadius: "50%", border: `1.5px solid ${color}${["77","44","22"][i-1]}`,
          animation: `ripple 1.8s ease-out ${i * 0.3}s infinite`, pointerEvents: "none"
        }} />
      ))}
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, ${color}ee, ${color}77)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.32, fontWeight: 700, color: "#fff", letterSpacing: "0.05em",
        boxShadow: speaking ? `0 0 0 2px ${color}, 0 0 32px ${color}88` : `0 0 0 1px ${color}44, 0 4px 16px ${color}33`,
        transition: "box-shadow 0.4s ease"
      }}>{initials}</div>
    </div>
  );
}

function WaveBar({ color, delay }) {
  return <div style={{ width: 3, borderRadius: 2, background: color, minHeight: 4, maxHeight: 18, animation: `wave ${0.6 + delay * 0.3}s ease-in-out ${delay * 0.1}s infinite alternate` }} />;
}

// ── Main App ──────────────────────────────────────────────────
const isMobileUA = /iPhone|iPad|iPod|Android/i.test(
  typeof navigator !== "undefined" ? navigator.userAgent : ""
);

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", () => setTimeout(update, 100));
    return () => window.removeEventListener("resize", update);
  }, []);
  return width;
}

export default function App() {
  const windowWidth = useWindowWidth();
  const isMobile = isMobileUA || windowWidth < 500;
  const [screen, setScreen] = useState("contacts");
  const [activeContact, setActiveContact] = useState(null);
  const [callStatus, setCallStatus] = useState("idle");
  const [transcript, setTranscript] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [search, setSearch] = useState("");

  const audioCtxRef = useRef(null);
  const timerRef = useRef(null);
  const transcriptRef = useRef(null);
  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const ringRef = useRef(null);
  const recognitionRef = useRef(null);

  const filtered = contacts.filter(c =>
    [c.name, c.org, c.topics, c.role].some(f => f.toLowerCase().includes(search.toLowerCase()))
  );
  const grouped = filtered.reduce((acc, c) => {
    const l = c.name[0]; if (!acc[l]) acc[l] = []; acc[l].push(c); return acc;
  }, {});

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const canSend = callStatus === "connected" && !loading && !speaking && !listening;

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.stop?.(); } catch {}
      try { audioRef.current.pause?.(); } catch {}
      audioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  // ── Send message ──
  const sendMessage = useCallback(async (text, contact) => {
    const msg = text.trim();
    if (!msg) return;
    setInput("");
    let historySnap = [];
    setTranscript(prev => {
      historySnap = prev.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
      return [...prev, { role: "user", text: msg }];
    });
    setLoading(true);
    setStatusLabel("thinking…");

    const sys = `You are ${contact.name}, ${contact.role} at ${contact.org}.
Character: ${contact.stance}
You are on the phone with a journalist. Reply as this person in a real press call: direct, natural, in-character. 1–2 sentences only. No markdown, no lists, plain speech only.
Expertise: ${contact.topics}. If asked outside your expertise, politely deflect.`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: sys,
          messages: [...historySnap, { role: "user", content: msg }]
        })
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error?.message || JSON.stringify(data);
        throw new Error(`Anthropic ${res.status}: ${errMsg}`);
      }
      const reply = data.content?.find(b => b.type === "text")?.text;
      if (!reply) {
        console.error("Unexpected Anthropic response:", JSON.stringify(data));
        throw new Error(`Unexpected response format: ${JSON.stringify(data).slice(0, 200)}`);
      }
      setTranscript(t => [...t, { role: "assistant", text: reply }]);
      setLoading(false);

      try {
        speak(
          reply,
          contact.voice,
          () => { setSpeaking(true); setStatusLabel(""); },
          () => { setSpeaking(false); setStatusLabel(""); },
          (el) => { audioRef.current = el; }
        );
      } catch (e) {
        console.error("TTS error:", e);
      }
    } catch (e) {
      console.error("API error:", e);
      setTranscript(t => [...t, { role: "assistant", text: `(error: ${e.message})` }]);
      setLoading(false);
      setStatusLabel("");
    }
  }, []);

  // ── Voice input via Web Speech API ──
  const startListening = useCallback((contact) => {
    if (!canSend) return;
    stopAudio();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusLabel("Speech recognition not supported in this browser");
      setTimeout(() => setStatusLabel(""), 3000);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      recognitionRef.current = null;
      setListening(false);
      setStatusLabel("");
      if (text) sendMessage(text, contact);
    };

    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setListening(false);
      if (event.error !== "no-speech") {
        setStatusLabel(`Recognition error: ${event.error}`);
        setTimeout(() => setStatusLabel(""), 3000);
      } else {
        setStatusLabel("");
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        recognitionRef.current = null;
        setListening(false);
      }
    };

    try {
      recognition.start();
      setListening(true);
      setStatusLabel("recording…");
    } catch {
      recognitionRef.current = null;
      setStatusLabel("Could not start recording");
      setTimeout(() => setStatusLabel(""), 3000);
    }
  }, [canSend, sendMessage, stopAudio]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setStatusLabel("");
  }, []);

  const startCall = (contact) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    audioCtxRef.current.resume();
    stopAudio();
    setActiveContact(contact);
    setScreen("call");
    setCallStatus("ringing");
    setTranscript([]);
    setCallDuration(0);
    setSpeaking(false);
    setStatusLabel("");

    ringRef.current = createRingTone();

    setTimeout(() => {
      ringRef.current?.stop();
      ringRef.current = null;
      setCallStatus("connected");
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);

      const greeting = `${contact.name} speaking.`;
      setTranscript([{ role: "assistant", text: greeting }]);
      speak(
        greeting,
        contact.voice,
        () => setSpeaking(true),
        () => { setSpeaking(false); setTimeout(() => inputRef.current?.focus(), 100); },
        (el) => { audioRef.current = el; }
      );
    }, 2600);
  };

  const endCall = () => {
    stopAudio();
    ringRef.current?.stop();
    ringRef.current = null;
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    clearInterval(timerRef.current);
    setSpeaking(false); setListening(false); setStatusLabel("");
    setCallStatus("ended");
    setTimeout(() => { setScreen("contacts"); setCallStatus("idle"); setActiveContact(null); setTranscript([]); setInput(""); }, 900);
  };

  // Kokoro on all devices, browser speech synthesis as fallback
  const speak = useCallback((text, voice, onStart, onEnd, setAudioEl) => {
    speakKokoro(text, voice, onStart, onEnd, (msg) => setStatusLabel(msg), setAudioEl)
      .catch(() => speakBrowser(text, onStart, onEnd));
  }, []);

  useEffect(() => {
    setStatusLabel("Loading voice model… (first time only)");
    getKokoro((msg) => setStatusLabel(msg))
      .then(() => setStatusLabel(""))
      .catch(() => setStatusLabel("Voice model unavailable — browser fallback will be used"));
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript, loading]);

  useEffect(() => () => { clearInterval(timerRef.current); stopAudio(); }, []);

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'SF Pro Display',-apple-system,'Helvetica Neue',sans-serif",
      background: "#060606",
      ...(isMobile ? {
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
      } : {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      })
    }}>
      <style>{`
        @keyframes ripple { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(1.6);opacity:0} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes slideUp { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes shake { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-9deg)} 40%{transform:rotate(9deg)} 60%{transform:rotate(-5deg)} 80%{transform:rotate(5deg)} }
        @keyframes wave { 0%{height:4px} 100%{height:18px} }
        @keyframes micPulse { 0%,100%{box-shadow:0 0 0 0 rgba(231,76,60,0.6)} 60%{box-shadow:0 0 0 14px rgba(231,76,60,0)} }
        ::-webkit-scrollbar{width:0} textarea:focus,input:focus{outline:none} button{font-family:inherit}
      `}</style>

      {/* Phone body — fixed size on desktop, full screen on mobile */}
      <div style={{
        width: isMobile ? "100%" : 390,
        maxWidth: isMobile ? "100%" : 390,
        flex: isMobile ? 1 : "none",
        height: isMobile ? "auto" : 844,
        alignSelf: isMobile ? "stretch" : "auto",
        background: "linear-gradient(180deg,#1c1c1e 0%,#111 100%)",
        borderRadius: isMobile ? 0 : 52,
        position: "relative",
        boxShadow: isMobile ? "none" : "0 0 0 1px #2a2a2a,0 0 0 2.5px #1a1a1a,0 50px 140px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,255,255,0.09)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>

        {/* Dynamic island — desktop only */}
        {!isMobile && <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", width: callStatus==="connected"?(speaking?200:148):120, height: 36, background: "#000", borderRadius: 22, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", transition: "width 0.45s cubic-bezier(0.34,1.4,0.64,1)", boxShadow: "0 0 0 1px rgba(255,255,255,0.07)" }}>
          {callStatus==="connected"&&speaking&&(
            <div style={{display:"flex",gap:3,alignItems:"center",padding:"0 8px"}}>
              {[0,1,2,1,0,2,1].map((d,i)=><WaveBar key={i} color={activeContact?.color||"#2ECC71"} delay={d}/>)}
              <span style={{color:activeContact?.color,fontSize:10,fontWeight:700,marginLeft:5}}>{fmt(callDuration)}</span>
            </div>
          )}
          {callStatus==="connected"&&!speaking&&(
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#34C759",animation:"blink 2.5s infinite"}}/>
              <span style={{color:"#34C759",fontSize:11,fontWeight:600}}>{fmt(callDuration)}</span>
            </div>
          )}
          {callStatus==="ringing"&&<span style={{color:"#fff",fontSize:10,fontWeight:700,letterSpacing:1,animation:"blink 0.9s infinite"}}>CALLING</span>}
        </div>}

        {/* Status bar — desktop only */}
        {!isMobile && <div style={{ height: 56, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 28px 10px", flexShrink: 0 }}>
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>{new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <svg width="17" height="12" viewBox="0 0 17 12" fill="white"><rect x="0" y="4" width="3" height="8" rx="1" opacity="0.4"/><rect x="4.5" y="2.5" width="3" height="9.5" rx="1" opacity="0.6"/><rect x="9" y="0.5" width="3" height="11.5" rx="1"/><rect x="13.5" y="0.5" width="3" height="11.5" rx="1" opacity="0.3"/></svg>
            <svg width="26" height="12" viewBox="0 0 26 12" fill="none"><rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke="white" strokeOpacity="0.35"/><rect x="1.5" y="1.5" width="18" height="9" rx="2" fill="white"/><path d="M24 4v4a2 2 0 0 0 0-4Z" fill="white" opacity="0.4"/></svg>
          </div>
        </div>}

        {/* ── CONTACTS ── */}
        {screen === "contacts" && (
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: isMobile ? "calc(env(safe-area-inset-top, 44px) + 4px) 20px 14px" : "4px 20px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
                <h1 style={{ color: "#fff", fontSize: 34, fontWeight: 700, margin: 0, letterSpacing: -1 }}>Contacts</h1>
              </div>
              <div style={{ background: "rgba(255,255,255,0.09)", borderRadius: 13, display: "flex", alignItems: "center", padding: "10px 14px", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="rgba(255,255,255,0.38)"><path d="M6.5 1a5.5 5.5 0 0 1 4.383 8.823l3.896 3.896-.707.707-3.896-3.896A5.5 5.5 0 1 1 6.5 1zm0 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, topic..."
                  style={{ background: "none", border: "none", color: "#fff", fontSize: 16, flex: 1, caretColor: "#fff", outline: "none" }} />
              </div>
            </div>
            <div style={{ flex: 1, paddingBottom: 100 }}>
              {Object.keys(grouped).sort().map(letter => (
                <div key={letter}>
                  <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 13, fontWeight: 600, padding: "8px 20px 3px", letterSpacing: 0.6 }}>{letter}</div>
                  {grouped[letter].map(c => (
                    <div key={c.id} onClick={() => startCall(c)}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 20px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)", transition: "background 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.04)"}
                      onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                      <Avatar initials={c.avatar} color={c.color} size={50} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#fff", fontSize: 16, fontWeight: 500, marginBottom: 2 }}>{c.name}</div>
                        <div style={{ color: "rgba(255,255,255,0.42)", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.role} · {c.org}</div>
                      </div>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${c.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill={c.color}><path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328z"/></svg>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {/* Tab bar */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 84, background: "rgba(18,18,18,0.97)", backdropFilter: "blur(24px)", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "flex-start", justifyContent: "space-around", padding: "14px 0 0" }}>
              {[{l:"Favourites",d:"M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"},{l:"Recents",d:"M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5zM8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"},{l:"Contacts",d:"M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4z"},{l:"Keypad",d:"M1 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V2zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V2zM1 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V7zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zm5 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V7z"}].map(tab => (
                <div key={tab.l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <svg width="24" height="24" viewBox="0 0 16 16" fill={tab.l==="Contacts"?"#34C759":"rgba(255,255,255,0.32)"}><path d={tab.d}/></svg>
                  <span style={{ fontSize: 10, color: tab.l==="Contacts"?"#34C759":"rgba(255,255,255,0.32)", fontWeight: tab.l==="Contacts"?600:400 }}>{tab.l}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CALL SCREEN ── */}
        {screen === "call" && activeContact && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: `linear-gradient(170deg,#0d0d1a 0%,#111827 50%,${activeContact.color}18 100%)`, animation: "fadeIn 0.35s ease", minHeight: 0 }}>
            <div style={{ padding: isMobile ? "calc(env(safe-area-inset-top, 44px) + 8px) 24px 0" : "10px 24px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                {callStatus==="ringing"&&"calling..."}{callStatus==="connected"&&`connected · ${fmt(callDuration)}`}{callStatus==="ended"&&"call ended"}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: -0.6 }}>{activeContact.name}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{activeContact.role}</div>
              <div style={{ fontSize: 12, color: `${activeContact.color}cc` }}>{activeContact.org}</div>

              <div style={{ margin: callStatus==="ringing"?"16px 0 8px":"10px 0 2px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {callStatus==="ringing"&&(
                  <>{[1,2,3].map(i=><div key={i} style={{position:"absolute",width:80+i*44,height:80+i*44,borderRadius:"50%",border:`1.5px solid ${activeContact.color}${["55","33","22"][i-1]}`,animation:`ripple 2s ease-out ${i*0.45}s infinite`}}/>)}
                  <div style={{animation:"shake 1.1s ease infinite"}}><Avatar initials={activeContact.avatar} color={activeContact.color} size={80}/></div></>
                )}
                {callStatus==="connected"&&<Avatar initials={activeContact.avatar} color={activeContact.color} size={68} speaking={speaking}/>}
              </div>

              {/* Status line */}
              <div style={{ minHeight: 28, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                {speaking&&(
                  <div style={{display:"flex",gap:3,alignItems:"center"}}>
                    {[0,1,2,1,0,1,2].map((d,i)=><WaveBar key={i} color={activeContact.color} delay={d}/>)}
                    <span style={{fontSize:11,color:activeContact.color,fontWeight:600,marginLeft:5}}>{activeContact.name.split(" ")[0]} speaking</span>
                  </div>
                )}
                {listening&&!speaking&&<span style={{fontSize:11,color:"#ff453a",fontWeight:600,animation:"blink 0.7s infinite"}}>● recording — tap mic to send</span>}
                {(loading||statusLabel)&&!speaking&&!listening&&(
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.4)",letterSpacing:0.4,textAlign:"center",padding:"0 16px"}}>{statusLabel || (loading?"thinking…":"")}</span>
                )}
              </div>
            </div>

            {callStatus==="connected"&&(
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "0 14px", minHeight: 0 }}>
                <div ref={transcriptRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                  {transcript.length===0&&(
                    <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 13, textAlign: "center", padding: "16px", lineHeight: 1.8 }}>
                      "Tap the mic to speak, or type below."<br/>
                      <span style={{fontSize:11,opacity:0.7}}>Voices by Kokoro</span>
                    </div>
                  )}
                  {transcript.map((msg, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role==="user"?"flex-end":"flex-start", animation: "slideUp 0.22s ease" }}>
                      <div style={{ maxWidth: "84%", background: msg.role==="user"?"rgba(52,199,89,0.16)":"rgba(255,255,255,0.06)", border:`1px solid ${msg.role==="user"?"rgba(52,199,89,0.25)":"rgba(255,255,255,0.09)"}`, borderRadius: msg.role==="user"?"18px 18px 5px 18px":"18px 18px 18px 5px", padding: "9px 13px", color: "#f0f0f0", fontSize: 13.5, lineHeight: 1.55 }}>
                        {msg.role==="assistant"&&<div style={{fontSize:9.5,color:activeContact.color,fontWeight:700,marginBottom:4,letterSpacing:0.7}}>{activeContact.name.toUpperCase()}</div>}
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {loading&&(
                    <div style={{display:"flex",justifyContent:"flex-start",animation:"fadeIn 0.3s"}}>
                      <div style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:"18px 18px 18px 5px",padding:"12px 16px",display:"flex",gap:5,alignItems:"center"}}>
                        {[0,0.22,0.44].map((d,i)=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.4)",animation:`blink 1.3s ${d}s infinite`}}/>)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Input row */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "10px 0", paddingBottom: "max(10px, env(safe-area-inset-bottom, 10px))" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <button onClick={() => listening ? stopListening() : startListening(activeContact)} disabled={!canSend && !listening}
                      style={{ width: 46, height: 46, borderRadius: "50%", border: "none", flexShrink: 0, cursor: (canSend||listening)?"pointer":"default", background: listening?"#ff453a":canSend?"rgba(255,255,255,0.12)":"rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", animation: listening?"micPulse 1s infinite":"none", transition: "background 0.2s" }}>
                      <svg width="20" height="20" viewBox="0 0 16 16" fill={listening?"#fff":canSend?"rgba(255,255,255,0.8)":"rgba(255,255,255,0.2)"}>
                        <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
                        <path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 0 1 4 0v5zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3z"/>
                      </svg>
                    </button>
                    <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(canSend&&input.trim())sendMessage(input,activeContact);}}}
                      placeholder={listening?"Recording…":canSend?`Ask ${activeContact.name.split(" ")[0]}…`:speaking?"Speaking…":"Processing…"}
                      disabled={!canSend||listening} rows={2}
                      style={{ flex:1, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.11)", borderRadius:16, padding:"10px 13px", color:canSend&&!listening?"#fff":"rgba(255,255,255,0.3)", fontSize:14, resize:"none", caretColor:"#34C759", lineHeight:1.4 }}
                    />
                    <button onClick={()=>{if(canSend&&input.trim())sendMessage(input,activeContact);}} disabled={!canSend||!input.trim()}
                      style={{ width:46, height:46, borderRadius:"50%", background:canSend&&input.trim()?"#34C759":"rgba(255,255,255,0.07)", border:"none", cursor:canSend&&input.trim()?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"background 0.25s" }}>
                      <svg width="17" height="17" viewBox="0 0 16 16" fill={canSend&&input.trim()?"#000":"rgba(255,255,255,0.22)"}>
                        <path d="M15.964.686a.5.5 0 0 0-.65-.65L.767 5.855H.766l-.452.18a.5.5 0 0 0-.082.887l.41.26.001.002 4.995 3.178 3.178 4.995.002.002.26.41a.5.5 0 0 0 .886-.083l6-15Zm-1.833 1.89L6.637 10.07l-.215-.338a.5.5 0 0 0-.154-.154l-.338-.215 7.494-7.494 1.178-.471-.431 1.08z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Controls */}
            <div style={{ padding: "6px 32px 26px", display: "flex", justifyContent: "center", gap: 28, flexShrink: 0, alignItems: "center" }}>
              {callStatus==="connected"&&(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                  <button onClick={stopAudio} disabled={!speaking} style={{ width:60,height:60,borderRadius:"50%",background:speaking?`${activeContact.color}22`:"rgba(255,255,255,0.07)",border:`1.5px solid ${speaking?activeContact.color+"55":"transparent"}`,cursor:speaking?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s" }}>
                    <svg width="22" height="22" viewBox="0 0 16 16" fill={speaking?activeContact.color:"rgba(255,255,255,0.25)"}>
                      <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zm7.137 2.096a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0z"/>
                    </svg>
                  </button>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>Skip</span>
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                <button onClick={endCall} style={{ width:72,height:72,borderRadius:"50%",background:"#ff3b30",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 6px 24px rgba(255,59,48,0.45)" }}>
                  <svg width="28" height="28" viewBox="0 0 16 16" fill="white"><path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328z" transform="rotate(135,8,8)"/></svg>
                </button>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>End call</span>
              </div>
            </div>
            <div style={{height: isMobile ? "env(safe-area-inset-bottom, 20px)" : 28, minHeight: isMobile ? 20 : 28, display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {!isMobile && <div style={{width:128,height:4,background:"rgba(255,255,255,0.18)",borderRadius:2}}/>}
            </div>
          </div>
        )}

        {(screen==="contacts"||screen==="setup")&&(
          <div style={{height: isMobile ? "env(safe-area-inset-bottom, 20px)" : 28, minHeight: isMobile ? 20 : 28, display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:"#111"}}>
            {!isMobile && <div style={{width:128,height:4,background:"rgba(255,255,255,0.18)",borderRadius:2}}/>}
          </div>
        )}
      </div>
    </div>
  );
}
