/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Navigation, 
  Flame, 
  Activity, 
  Zap, 
  User, 
  Home as HomeIcon, 
  ChevronRight, 
  ChevronLeft, 
  Play, 
  Pause, 
  Square, 
  X, 
  Loader2, 
  Shield, 
  Settings,
  ArrowRight,
  Crown,
  Star,
  Map as MapIcon,
  BarChart2,
  Calendar as CalendarIcon,
  Plus,
  Heart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  AreaChart,
  Area
} from 'recharts';

// --- Types ---
interface RunSegment {
  km: number;
  pace: number;
  duration: number;
}

interface RunSession {
  id: string;
  timestamp: number;
  duration: number;
  distance: number;
  pace: number;
  avgSpeed: number;
  maxSpeed: number;
  elevationGain: number;
  avgHeartRate?: number;
  segments: RunSegment[];
}

interface UserData {
  name: string;
  gender: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
  streak: number;
  totalKm: number;
  joined: number;
  avatar?: string;
  plan: 'Free' | 'Pro' | 'Elite';
  hapticsEnabled: boolean;
}

interface ScheduledWorkout {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'Run' | 'Circuit' | 'Recovery';
}

// --- Utils ---
const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
};

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
};

// --- Components ---

const GlobalBackButton = ({ onClick, visible }: { onClick: () => void, visible: boolean }) => {
  if (!visible) return null;
  return (
    <motion.button 
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className="fixed top-8 left-8 z-[200] p-3 bg-red-600 text-white rounded-2xl shadow-xl active:scale-90 hover:bg-red-700 transition-all"
    >
      <ChevronLeft size={24} />
    </motion.button>
  );
};

const RouteMap = ({ route }: { route: { lat: number, lng: number }[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || route.length < 2) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const lats = route.map(p => p.lat);
    const lngs = route.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const padding = 20;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;

    const scaleX = width / (maxLng - minLng || 1);
    const scaleY = height / (maxLat - minLat || 1);
    const scale = Math.min(scaleX, scaleY);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    route.forEach((p, i) => {
      const x = padding + (p.lng - minLng) * scale;
      const y = canvas.height - (padding + (p.lat - minLat) * scale);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Start/End dots
    const startX = padding + (route[0].lng - minLng) * scale;
    const startY = canvas.height - (padding + (route[0].lat - minLat) * scale);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(startX, startY, 6, 0, Math.PI * 2);
    ctx.fill();

    const endX = padding + (route[route.length - 1].lng - minLng) * scale;
    const endY = canvas.height - (padding + (route[route.length - 1].lat - minLat) * scale);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, Math.PI * 2);
    ctx.fill();
  }, [route]);

  return (
    <div className="w-full h-48 bg-neutral-50 rounded-[3rem] border border-neutral-100 overflow-hidden relative">
      <canvas ref={canvasRef} width={400} height={200} className="w-full h-full" />
      <div className="absolute top-4 left-6 flex items-center gap-2">
        <MapIcon size={12} className="text-neutral-400" />
        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Route Protocol</span>
      </div>
    </div>
  );
};

const BreathingExercise = ({ onBack }: { onBack: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [phase, setPhase] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');
  const [phaseTime, setPhaseTime] = useState(4);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(t => t - 1);
        setPhaseTime(p => {
          if (p === 1) {
            if (phase === 'Inhale') {
              setPhase('Hold');
              return 4;
            } else if (phase === 'Hold') {
              setPhase('Exhale');
              return 4;
            } else {
              setPhase('Inhale');
              return 4;
            }
          }
          return p - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isActive, timeLeft, phase]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black text-white flex flex-col items-center justify-center p-8"
    >
      <div className="text-center mb-12">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500 mb-2">Guided Breathing</p>
        <h2 className="text-4xl font-black tracking-tighter">{formatDuration(timeLeft)}</h2>
      </div>

      <div className="relative flex items-center justify-center w-64 h-64">
        <motion.div 
          animate={{ 
            scale: phase === 'Inhale' ? 1.5 : phase === 'Exhale' ? 1 : 1.5,
            opacity: phase === 'Hold' ? 0.8 : 1
          }}
          transition={{ duration: 4, ease: "easeInOut" }}
          className="w-32 h-32 bg-white rounded-full flex items-center justify-center"
        >
          <p className="text-black font-black text-sm uppercase tracking-widest">{phase}</p>
        </motion.div>
        <div className="absolute inset-0 border-2 border-neutral-800 rounded-full scale-[1.6]" />
      </div>

      <div className="mt-24 w-full max-w-xs">
        <button 
          onClick={() => setIsActive(!isActive)}
          className="w-full py-6 bg-white text-black rounded-[2.5rem] font-black text-xl active:scale-95 transition-all"
        >
          {isActive ? "PAUSE" : timeLeft === 180 ? "START" : "RESUME"}
        </button>
        {timeLeft < 180 && (
          <button 
            onClick={() => { setTimeLeft(180); setIsActive(false); setPhase('Inhale'); setPhaseTime(4); }}
            className="w-full mt-4 py-4 text-neutral-500 font-bold text-sm uppercase tracking-widest"
          >
            Reset
          </button>
        )}
      </div>
    </motion.div>
  );
};

const Section = ({ id, title, text, items }: { id: string, title: string, text?: string, items?: string[] }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-4 mb-2">
      <span className="text-xs font-black text-neutral-400">{id}</span>
      <h4 className="font-bold text-xl tracking-tight text-black">{title}</h4>
    </div>
    {items ? (
      <ul className="pl-8 space-y-2">
        {items.map(i => <li key={i} className="text-neutral-500 text-sm list-disc">{i}</li>)}
      </ul>
    ) : (
      <p className="text-neutral-500 leading-relaxed pl-8 text-sm">{text}</p>
    )}
  </div>
);

const CalendarView = ({ scheduledWorkouts, onAddWorkout }: { scheduledWorkouts: ScheduledWorkout[], onAddWorkout: (date: string) => void }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);
  
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  
  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= days; i++) {
    calendarDays.push(i);
  }
  
  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
  };

  const getWorkoutsForDay = (day: number) => {
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return scheduledWorkouts.filter(w => w.date === dateStr);
  };

  return (
    <div className="p-8 bg-white rounded-[3rem] border border-neutral-100 shadow-sm">
      <div className="flex justify-between items-center mb-8">
        <h4 className="font-black text-2xl tracking-tighter">{monthName} {year}</h4>
        <div className="flex gap-2">
          <button onClick={() => setCurrentDate(new Date(year, month - 1))} className="p-2 bg-neutral-50 rounded-xl hover:bg-neutral-100 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(new Date(year, month + 1))} className="p-2 bg-neutral-50 rounded-xl hover:bg-neutral-100 transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-2 mb-4">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`header-${i}`} className="text-center text-[10px] font-black text-neutral-300 uppercase tracking-widest">{d}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((day, idx) => (
          <div key={idx} className="aspect-square relative">
            {day && (
              <button 
                onClick={() => onAddWorkout(`${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`)}
                className={`w-full h-full rounded-2xl flex flex-col items-center justify-center transition-all active:scale-90 ${isToday(day) ? 'bg-black text-white shadow-xl' : 'bg-neutral-50 text-neutral-900 hover:bg-neutral-100'}`}
              >
                <span className="text-xs font-bold">{day}</span>
                {getWorkoutsForDay(day).length > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {getWorkoutsForDay(day).map((w, i) => (
                      <div key={i} className={`w-1 h-1 rounded-full ${w.type === 'Run' ? 'bg-blue-500' : w.type === 'Circuit' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                    ))}
                  </div>
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const StatsView = ({ statsData }: { statsData: any[] }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="px-8 pt-24 pb-32"
    >
      <header className="mb-12">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-400">Performance Protocol</p>
        <h1 className="text-4xl font-black tracking-tighter">Progress Analytics</h1>
      </header>

      <div className="space-y-12">
        {/* Distance Chart */}
        <div className="p-8 bg-neutral-50 rounded-[3rem] border border-neutral-100">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h4 className="font-bold text-xl tracking-tight">Total Distance</h4>
              <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">Last 7 Days (KM)</p>
            </div>
            <Activity className="text-blue-500" size={24} />
          </div>
          {statsData.every(d => d.distance === 0) ? (
            <div className="h-48 flex flex-col items-center justify-center text-neutral-300 border-2 border-dashed border-neutral-100 rounded-3xl">
              <Activity size={32} className="mb-2 opacity-20" />
              <p className="text-[10px] font-black uppercase tracking-widest">No distance data</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statsData}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#A3A3A3' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 700 }}
                  cursor={{ fill: '#F5F5F5' }}
                />
                <Bar dataKey="distance" fill="#000" radius={[10, 10, 10, 10]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pace Chart */}
        <div className="p-8 bg-black text-white rounded-[3rem] shadow-2xl">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h4 className="font-bold text-xl tracking-tight">Average Pace</h4>
              <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">Last 7 Days (MIN/KM)</p>
            </div>
            <Zap className="text-yellow-400" size={24} />
          </div>
          {statsData.every(d => d.pace === 0) ? (
            <div className="h-48 flex flex-col items-center justify-center text-neutral-700 border-2 border-dashed border-neutral-800 rounded-3xl">
              <Zap size={32} className="mb-2 opacity-20" />
              <p className="text-[10px] font-black uppercase tracking-widest">No pace data</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={statsData}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#525252' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1.5rem', border: 'none', backgroundColor: '#FFF', color: '#000', fontWeight: 700 }}
                />
                <Line type="monotone" dataKey="pace" stroke="#FFF" strokeWidth={4} dot={{ r: 6, fill: '#FFF' }} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Frequency Chart */}
        <div className="p-8 bg-neutral-50 rounded-[3rem] border border-neutral-100">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h4 className="font-bold text-xl tracking-tight">Workout Frequency</h4>
              <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">Runs per day</p>
            </div>
            <Flame className="text-orange-500" size={24} />
          </div>
          {statsData.every(d => d.count === 0) ? (
            <div className="h-48 flex flex-col items-center justify-center text-neutral-300 border-2 border-dashed border-neutral-100 rounded-3xl">
              <Flame size={32} className="mb-2 opacity-20" />
              <p className="text-[10px] font-black uppercase tracking-widest">No sessions recorded</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statsData}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#A3A3A3' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 700 }}
                />
                <Bar dataKey="count" fill="#F97316" radius={[10, 10, 10, 10]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [indiaTime, setIndiaTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };
      setIndiaTime(new Intl.DateTimeFormat('en-IN', options).format(now));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const [view, setView] = useState<'splash' | 'onboarding' | 'home' | 'coach' | 'run' | 'profile' | 'privacy' | 'breathing' | 'stats'>('splash');
  const [runFocusMode, setRunFocusMode] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [userData, setUserData] = useState<UserData>({
    name: "",
    gender: 'Male',
    streak: 0,
    totalKm: 0,
    joined: Date.now(),
    avatar: undefined,
    plan: 'Free',
    hapticsEnabled: true
  });
  const [runs, setRuns] = useState<RunSession[]>([]);
  const [scheduledWorkouts, setScheduledWorkouts] = useState<ScheduledWorkout[]>([
    { id: '1', date: new Date().toISOString().split('T')[0], title: 'Morning Run', type: 'Run' },
    { id: '2', date: new Date(Date.now() + 86400000).toISOString().split('T')[0], title: 'Core Circuit', type: 'Circuit' }
  ]);
  const [sessionRoute, setSessionRoute] = useState<{ lat: number, lng: number, alt: number | null }[]>([]);

  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  }, []);

  const statsData = useMemo(() => {
    return last7Days.map(day => {
      const dayRuns = runs.filter(r => new Date(r.timestamp).toISOString().split('T')[0] === day);
      const totalDist = dayRuns.reduce((acc, r) => acc + r.distance, 0) / 1000;
      const totalDuration = dayRuns.reduce((acc, r) => acc + r.duration, 0);
      const avgPace = totalDist > 0 ? totalDuration / totalDist : 0;
      
      return {
        day: day.split('-').slice(2).join(''), // DD
        distance: Number(totalDist.toFixed(2)),
        pace: avgPace > 0 ? Number((avgPace / 60).toFixed(2)) : 0,
        count: dayRuns.length
      };
    });
  }, [runs, last7Days]);

  // AI States
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  const [aiWorkout, setAiWorkout] = useState<string | null>(null);
  const [isWorkoutLoading, setIsWorkoutLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  // Tracking Logic
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [elevationGain, setElevationGain] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [heartRate, setHeartRate] = useState(0);
  const [heartRates, setHeartRates] = useState<number[]>([]);
  const [segments, setSegments] = useState<RunSegment[]>([]);
  const [lastKmDistance, setLastKmDistance] = useState(0);
  const [lastKmElapsed, setLastKmElapsed] = useState(0);
  const [lastSessionSummary, setLastSessionSummary] = useState<RunSession | null>(null);
  const [route, setRoute] = useState<{ lat: number, lng: number, alt: number | null }[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPosRef = useRef<{ lat: number, lng: number, alt: number | null } | null>(null);

  // Initialize AI
  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" }), []);

  useEffect(() => {
    const timer = setTimeout(() => setView('onboarding'), 2500);
    return () => clearTimeout(timer);
  }, []);

  const triggerHaptic = (pattern: number | number[]) => {
    if (userData.hapticsEnabled && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  };

  const generateBriefing = async () => {
    setIsBriefingLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: `User has a ${userData.streak} day streak. Their total distance is ${userData.totalKm.toFixed(1)}km. Generate a short (2-sentence) elite "Morning Briefing" including a motivational tip and a specific tactical focus for today's workout.`,
        config: { systemInstruction: "You are Runo Elite AI, a high-performance fitness coach." }
      });
      setAiBriefing(response.text || "Protocol Active. Maintain consistent pace and focus on respiratory rhythm.");
    } catch (e) {
      setAiBriefing("Protocol active. Focus on high-intensity output today to maintain your streak.");
    } finally {
      setIsBriefingLoading(false);
    }
  };

  const generateWorkout = async (vibe: string) => {
    setIsWorkoutLoading(true);
    setAiWorkout(null);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: `User is feeling: "${vibe}". Generate a 10-minute supplementary bodyweight circuit. Format it as 4 exercises with reps/duration. Keep it concise and high-intensity.`,
        config: { systemInstruction: "You are Runo Elite AI, a high-performance fitness coach." }
      });
      setAiWorkout(response.text || "1. Squats (30s)\n2. Pushups (30s)\n3. Mountain Climbers (30s)\n4. Plank (60s)");
    } catch (e) {
      setAiWorkout("Circuit Generation Offline. Perform 100 air squats for base readiness.");
    } finally {
      setIsWorkoutLoading(false);
    }
  };

  const analyzeRun = async () => {
    setIsAnalysisLoading(true);
    try {
      const distKm = (distance / 1000).toFixed(2);
      const pace = distance > 0 ? (elapsed / (distance / 1000)) : 0;
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: `Analyze this run: ${distKm}km in ${Math.floor(elapsed / 60)}m ${elapsed % 60}s. Pace: ${Math.floor(pace / 60)}:${Math.floor(pace % 60)}/km. Provide one professional insight and one recovery tip.`,
        config: { systemInstruction: "You are Runo Elite AI, a high-performance fitness coach." }
      });
      setAiAnalysis(response.text || "Strong session. Focus on active recovery and magnesium intake.");
    } catch (e) {
      setAiAnalysis("Analysis server offline. Perform static stretching for 10 minutes.");
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  const startRun = () => {
    triggerHaptic(50);
    setIsRunning(true);
    setIsPaused(false);
    setAiAnalysis(null);
    setDistance(0);
    setElapsed(0);
    setElevationGain(0);
    setMaxSpeed(0);
    setHeartRate(0);
    setHeartRates([]);
    setSegments([]);
    setLastKmDistance(0);
    setLastKmElapsed(0);
    setRoute([]);
    lastPosRef.current = null;
    let lastTimestamp = Date.now();

    timerRef.current = setInterval(() => {
      setElapsed(e => e + 1);
      // Simulate heart rate with more realistic fluctuation
      setHeartRate(prev => {
        const base = 135;
        const variation = Math.sin(Date.now() / 5000) * 20;
        const noise = Math.random() * 6 - 3;
        const val = Math.round(base + variation + noise);
        setHeartRates(hrs => [...hrs, val]);
        return val;
      });
    }, 1000);

    if ("geolocation" in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now();
          const dt = (now - lastTimestamp) / 1000; // seconds
          lastTimestamp = now;

          const { latitude, longitude, altitude } = position.coords;
          const newPos = { lat: latitude, lng: longitude, alt: altitude };

          if (lastPosRef.current) {
            const d = getDistance(
              lastPosRef.current.lat,
              lastPosRef.current.lng,
              newPos.lat,
              newPos.lng
            );
            
            if (d > 1.5) { // Filter jitter
              setDistance(prev => {
                const newDist = prev + d;
                const currentKm = Math.floor(newDist / 1000);
                const prevKm = Math.floor(prev / 1000);
                if (currentKm > prevKm) {
                  triggerHaptic([200, 100, 200]);
                  const segmentDuration = elapsed - lastKmElapsed;
                  setSegments(s => [...s, {
                    km: currentKm,
                    duration: segmentDuration,
                    pace: segmentDuration
                  }]);
                  setLastKmElapsed(elapsed);
                }
                return newDist;
              });

              if (dt > 0) {
                const speedKmh = (d / 1000) / (dt / 3600);
                if (speedKmh < 45) { // Filter GPS jumps
                  setMaxSpeed(prev => Math.max(prev, speedKmh));
                }
              }

              if (lastPosRef.current.alt !== null && newPos.alt !== null) {
                const diff = newPos.alt - lastPosRef.current.alt;
                if (diff > 0) setElevationGain(prev => prev + diff);
              }
            }
          }
          
          lastPosRef.current = newPos;
          setRoute(prev => [...prev, newPos]);
        },
        (error) => console.error("GPS Error:", error),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  };

  const stopRun = () => {
    triggerHaptic([100, 50, 100]);
    if (timerRef.current) clearInterval(timerRef.current);
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);

    const sessionSummary: RunSession = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      duration: elapsed,
      distance: distance,
      pace: distance > 0 ? elapsed / (distance / 1000) : 0,
      avgSpeed: distance > 0 ? (distance / 1000) / (elapsed / 3600) : 0,
      maxSpeed: maxSpeed,
      elevationGain: elevationGain,
      avgHeartRate: heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : undefined,
      segments: segments
    };
    setLastSessionSummary(sessionSummary);
    setSessionRoute([...route]);
    setRuns(prev => [sessionSummary, ...prev]);
    setUserData(prev => ({
      ...prev,
      streak: prev.streak + 1,
      totalKm: prev.totalKm + (distance / 1000)
    }));
    setIsRunning(false);
  };

  const handleGlobalBack = () => {
    if (view === 'privacy') setView('profile');
    else if (view === 'breathing') setView('coach');
    else if (view === 'onboarding') {
      if (onboardingStep > 0) setOnboardingStep(onboardingStep - 1);
    }
    else if (view === 'run') {
      if (isRunning) {
        if (confirm("Stop current run?")) stopRun();
      } else {
        setView('home');
      }
    }
    else if (view === 'home') setView('onboarding');
    else setView('home');
  };

  // --- Views ---

  return (
    <div className="h-screen bg-white text-black overflow-hidden flex flex-col scroll-smooth">
      {/* India Standard Time Clock */}
      <div className="fixed top-0 left-0 w-full z-[200] flex justify-center pt-2 pointer-events-none">
        <div className="bg-black/5 backdrop-blur-md px-4 py-1 rounded-full border border-black/5">
          <p className="text-[9px] font-mono font-black tracking-[0.2em] text-black/40 uppercase">
            TIME IN INDIA AS <span className="text-black ml-2">{indiaTime}</span>
          </p>
        </div>
      </div>

      <GlobalBackButton 
        onClick={handleGlobalBack} 
        visible={['privacy', 'breathing', 'run', 'profile', 'coach', 'home', 'onboarding', 'stats'].includes(view) && (view !== 'onboarding' || onboardingStep > 0)} 
      />
      <main className="flex-1 overflow-y-auto relative scroll-smooth custom-scroll">
        <AnimatePresence mode="wait">
          {view === 'splash' && (
            <motion.div 
              key="splash"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center overflow-hidden"
            >
              <div className="absolute inset-0 elite-gradient opacity-50" />
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 flex flex-col items-center"
              >
                <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center mb-12 shadow-[0_0_60px_rgba(255,255,255,0.2)]">
                  <Zap size={48} className="text-black fill-black" />
                </div>
                <h1 className="text-8xl font-black tracking-tighter text-white mb-4">RUNO</h1>
                <p className="text-[10px] font-black tracking-[1em] text-white/40 uppercase ml-4">Elite Protocol v2.0</p>
              </motion.div>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: 200 }}
                transition={{ delay: 0.5, duration: 1.5 }}
                className="absolute bottom-24 h-[1px] bg-white/20"
              />
            </motion.div>
          )}

          {view === 'onboarding' && (
            <motion.div 
              key="onboarding"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-full bg-black text-white p-12 flex flex-col justify-center items-center text-center relative overflow-hidden"
            >
              <div className="absolute inset-0 elite-gradient opacity-30" />
              <AnimatePresence mode="wait">
                {onboardingStep === 0 && (
                  <motion.div
                    key="step0"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -40 }}
                    className="w-full max-w-md relative z-10"
                  >
                    <div className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center mb-12 mx-auto border border-white/10">
                      <Zap size={40} className="text-white fill-white" />
                    </div>
                    <h1 className="text-8xl font-black tracking-tighter mb-24">RUNO</h1>
                    <button 
                      onClick={() => setOnboardingStep(1)}
                      className="w-full py-8 bg-white text-black rounded-[3rem] font-black text-xl shadow-[0_20px_50px_rgba(255,255,255,0.2)] active:scale-95 transition-all uppercase tracking-widest"
                    >
                      GET STARTED
                    </button>
                  </motion.div>
                )}

                {onboardingStep === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="w-full max-w-md"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500 mb-4">Identity Protocol</p>
                    <h2 className="text-4xl font-black tracking-tighter mb-12">What shall we call you?</h2>
                    <input 
                      type="text"
                      value={userData.name}
                      onChange={(e) => setUserData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter Name"
                      className="w-full bg-neutral-900 border-none rounded-2xl p-6 text-xl font-bold mb-12 focus:ring-2 focus:ring-white outline-none text-center"
                    />
                    <button 
                      disabled={!userData.name}
                      onClick={() => setOnboardingStep(2)}
                      className="w-full py-6 bg-white text-black rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all disabled:opacity-50"
                    >
                      NEXT
                    </button>
                  </motion.div>
                )}

                {onboardingStep === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="w-full max-w-md"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500 mb-4">Physiology Protocol</p>
                    <h2 className="text-4xl font-black tracking-tighter mb-12">Select Gender</h2>
                    <div className="grid grid-cols-1 gap-4 mb-12">
                      {['Male', 'Female', 'Other', 'Prefer not to say'].map(g => (
                        <button 
                          key={g}
                          onClick={() => setUserData(prev => ({ ...prev, gender: g as any }))}
                          className={`py-6 rounded-2xl text-xl font-bold transition-all ${userData.gender === g ? 'bg-white text-black' : 'bg-neutral-900 text-neutral-500'}`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={() => setView('home')}
                      className="w-full py-6 bg-white text-black rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all"
                    >
                      COMPLETE
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="px-8 pt-24 pb-32 overflow-y-auto custom-scroll"
            >
              <header className="flex justify-between items-center mb-12">
                <div>
                  <h2 className="text-5xl font-black tracking-tighter text-black">Protocol</h2>
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.4em] mt-1">Active Session Ready</p>
                </div>
                <div className="w-14 h-14 bg-neutral-50 rounded-2xl flex items-center justify-center border border-neutral-100 shadow-sm overflow-hidden">
                  {userData.avatar ? <img src={userData.avatar} alt="Avatar" className="w-full h-full object-cover" /> : <User size={24} className="text-neutral-300" />}
                </div>
              </header>

              <div className="grid grid-cols-2 gap-6 mb-12">
                <div className="col-span-2 p-10 bg-black text-white rounded-[3.5rem] relative overflow-hidden premium-shadow group">
                  <div className="absolute inset-0 elite-gradient opacity-30" />
                  <div className="relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500 mb-8">Daily Streak</p>
                    <div className="flex items-baseline gap-4">
                      <h3 className="text-8xl font-black tracking-tighter">{userData.streak}</h3>
                      <p className="text-xl font-bold text-neutral-500 uppercase tracking-widest">Days</p>
                    </div>
                    <div className="mt-10 flex gap-2">
                      {[...Array(7)].map((_, i) => (
                        <div key={i} className={`h-1.5 flex-1 rounded-full ${i < userData.streak ? 'bg-white' : 'bg-neutral-800'}`} />
                      ))}
                    </div>
                  </div>
                  <Zap size={140} className="absolute -bottom-10 -right-10 text-white/5 rotate-12 group-hover:scale-110 transition-transform duration-700" />
                </div>

                <div className="p-8 bg-neutral-50 rounded-[3rem] border border-neutral-100 flex flex-col justify-between group hover:bg-white transition-colors duration-300">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Total KM</p>
                  <h4 className="text-4xl font-black tracking-tighter mt-4 group-hover:scale-105 transition-transform">{userData.totalKm.toFixed(1)}</h4>
                </div>

                <div className="p-8 bg-neutral-50 rounded-[3rem] border border-neutral-100 flex flex-col justify-between group hover:bg-white transition-colors duration-300">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Status</p>
                  <h4 className="text-xl font-black tracking-tighter mt-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Elite
                  </h4>
                </div>
              </div>

              <div className="mb-12">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black tracking-tighter">Performance Preview</h3>
                  <button onClick={() => setView('stats')} className="text-[10px] font-black uppercase tracking-widest text-neutral-400">View All</button>
                </div>
                <div className="p-8 bg-neutral-50 rounded-[3.5rem] border border-neutral-100 premium-shadow">
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={statsData}>
                        <defs>
                          <linearGradient id="colorKm" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#000" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#000" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="km" stroke="#000" strokeWidth={4} fillOpacity={1} fill="url(#colorKm)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setView('run')}
                className="w-full py-8 bg-black text-white rounded-[3rem] font-black text-lg uppercase tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all relative overflow-hidden group"
              >
                <div className="absolute inset-0 elite-gradient opacity-20 group-hover:opacity-40 transition-opacity" />
                <span className="relative z-10 flex items-center justify-center gap-4">
                  Initiate Protocol <Zap size={20} className="fill-white" />
                </span>
              </button>
              <div className="space-y-5">
                {runs.map((r, i) => (
                  <motion.div 
                    key={r.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-7 bg-white border border-neutral-100 rounded-[3rem] flex items-center justify-between shadow-sm"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-neutral-50 rounded-2xl flex items-center justify-center text-black shadow-inner">
                        <Navigation size={26} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold tracking-tight">{(r.distance / 1000).toFixed(2)} km</p>
                        <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">{new Date(r.timestamp).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-black">{formatDuration(r.duration)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'coach' && (
            <motion.div 
              key="coach"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="px-8 pt-24 pb-32"
            >
              <header className="mb-12">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-400">Personal AI Coach</p>
                <h1 className="text-4xl font-black tracking-tighter">✨ Training Protocol</h1>
              </header>

              <div className="mb-10">
                <CalendarView 
                  scheduledWorkouts={scheduledWorkouts} 
                  onAddWorkout={(date) => {
                    const title = prompt("Enter workout title:");
                    if (title) {
                      setScheduledWorkouts(prev => [...prev, {
                        id: Math.random().toString(36).substr(2, 9),
                        date,
                        title,
                        type: 'Run'
                      }]);
                    }
                  }}
                />
              </div>

              <div className="mb-10 p-8 bg-black text-white rounded-[3.5rem] shadow-2xl">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-6">Dynamic Circuit Generator</p>
                <div className="grid grid-cols-2 gap-4 mb-8">
                  {["Low Energy", "Sore Legs", "High Intensity", "Recovery"].map(v => (
                    <button 
                      key={v}
                      onClick={() => generateWorkout(v)}
                      className="py-4 px-5 rounded-2xl text-xs font-bold border border-neutral-800 text-neutral-400 hover:bg-white hover:text-black hover:border-white transition-all active:scale-95"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {isWorkoutLoading && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="animate-spin text-white" size={32} />
                  </div>
                )}
              </div>

              <div className="mb-10 p-8 bg-neutral-50 rounded-[3.5rem] border border-neutral-100">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h4 className="font-bold text-xl tracking-tight">Guided Breathing</h4>
                    <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">3 Minute Protocol</p>
                  </div>
                  <button 
                    onClick={() => setView('breathing')}
                    className="p-4 bg-black text-white rounded-2xl active:scale-95 transition-transform shadow-lg"
                  >
                    <Play size={20} fill="white" />
                  </button>
                </div>
              </div>

              {aiWorkout && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-10 border border-neutral-100 rounded-[4rem] bg-neutral-50 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-black text-white rounded-xl shadow-lg"><Zap size={18} /></div>
                    <h4 className="font-bold text-xl">Your Dynamic Circuit</h4>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-700">{aiWorkout}</pre>
                </motion.div>
              )}

              {scheduledWorkouts.length > 0 && (
                <div className="mt-12">
                  <h3 className="font-black text-xl tracking-tighter mb-6 px-2 uppercase text-[10px] text-neutral-400 tracking-widest">Upcoming Sessions</h3>
                  <div className="space-y-4">
                    {scheduledWorkouts
                      .filter(w => new Date(w.date) >= new Date(new Date().setHours(0,0,0,0)))
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map(w => (
                        <div key={w.id} className="p-6 bg-white border border-neutral-100 rounded-[2.5rem] flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${w.type === 'Run' ? 'bg-blue-50 text-blue-600' : w.type === 'Circuit' ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'}`}>
                              {w.type === 'Run' ? <Navigation size={20} /> : w.type === 'Circuit' ? <Zap size={20} /> : <Activity size={20} />}
                            </div>
                            <div>
                              <p className="font-bold">{w.title}</p>
                              <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">{w.date}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setScheduledWorkouts(prev => prev.filter(sw => sw.id !== w.id))}
                            className="p-2 text-neutral-300 hover:text-red-500 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'stats' && (
            <StatsView statsData={statsData} />
          )}

          {view === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="px-8 pt-24 pb-32"
            >
              <div className="flex flex-col items-center text-center mb-16">
                <div className="relative group">
                  <div className="w-32 h-32 bg-neutral-50 rounded-full flex items-center justify-center mb-8 border border-neutral-100 shadow-inner overflow-hidden">
                    {userData.avatar ? (
                      <img src={userData.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User size={64} className="text-neutral-300" />
                    )}
                  </div>
                  <label className="absolute bottom-6 right-0 p-2 bg-black text-white rounded-full cursor-pointer shadow-xl active:scale-90 transition-transform">
                    <Settings size={16} />
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setUserData(prev => ({ ...prev, avatar: reader.result as string }));
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
                <h2 className="text-5xl font-black tracking-tighter mb-2">{userData.name}</h2>
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Elite Member Since 2024</p>
              </div>

              <div className="space-y-5">
                <div className="p-8 bg-neutral-50 rounded-[3rem] border border-neutral-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-6">Current Plan</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center shadow-lg">
                        {userData.plan === 'Free' && <User size={24} />}
                        {userData.plan === 'Pro' && <Zap size={24} className="text-blue-400" />}
                        {userData.plan === 'Elite' && <Crown size={24} className="text-yellow-400" />}
                      </div>
                      <div>
                        <p className="font-bold text-xl">{userData.plan} Protocol</p>
                        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Active Subscription</p>
                      </div>
                    </div>
                    <button className="text-xs font-black uppercase tracking-widest text-neutral-300">Upgrade</button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-8">
                    {[
                      { name: 'Free', icon: User },
                      { name: 'Pro', icon: Zap },
                      { name: 'Elite', icon: Crown }
                    ].map(p => (
                      <button 
                        key={p.name}
                        onClick={() => setUserData(prev => ({ ...prev, plan: p.name as any }))}
                        className={`py-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${userData.plan === p.name ? 'bg-black text-white' : 'bg-white text-neutral-300 border border-neutral-100'}`}
                      >
                        <p.icon size={16} />
                        <span className="text-[8px] font-black uppercase tracking-widest">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div onClick={() => setView('privacy')} className="p-8 bg-black text-white rounded-[3rem] flex justify-between items-center cursor-pointer shadow-xl active:scale-[0.98] transition-all">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-neutral-900 rounded-2xl flex items-center justify-center border border-white/5"><Shield size={24} /></div>
                    <div>
                      <p className="font-bold text-lg">Privacy & Security</p>
                      <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Data Encryption Protocol</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-neutral-600" />
                </div>

                <div className="p-8 bg-neutral-50 rounded-[3rem] border border-neutral-100 flex justify-between items-center">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-neutral-100 text-black shadow-sm">
                      <Zap size={24} className={userData.hapticsEnabled ? "text-yellow-500" : "text-neutral-300"} />
                    </div>
                    <div>
                      <p className="font-bold text-lg">Haptic Feedback</p>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Tactile Response Protocol</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const newState = !userData.hapticsEnabled;
                      setUserData(prev => ({ ...prev, hapticsEnabled: newState }));
                      if (newState && "vibrate" in navigator) navigator.vibrate(50);
                    }}
                    className={`w-14 h-8 rounded-full transition-all relative ${userData.hapticsEnabled ? 'bg-black' : 'bg-neutral-200'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${userData.hapticsEnabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'privacy' && (
            <motion.div 
              key="privacy"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-[100] bg-white text-black flex flex-col"
            >
              <header className="px-8 pt-24 pb-6 border-b border-neutral-100 bg-white flex items-center justify-between sticky top-0 z-10">
                <div className="w-12"></div>
                <h2 className="text-2xl font-black tracking-tighter">Legal & Privacy</h2>
                <div className="w-12"></div>
              </header>
              <div className="flex-1 overflow-y-auto p-10 custom-scroll space-y-16">
                <div className="space-y-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Policy v1.4 | April 2026</p>
                  <h3 className="text-5xl font-black tracking-tighter text-black">Your privacy is our core protocol.</h3>
                </div>
                <Section id="01" title="Information We Collect" items={["Personal information (such as name and email)", "Fitness data (workouts, progress, goals)", "Device and usage data"]} />
                <Section id="02" title="How We Use Your Information" items={["To provide and improve the App", "To personalize your fitness experience", "To track progress and analytics", "To communicate updates or offers"]} />
                <Section id="03" title="Data Sharing" text="We do not sell your personal data. We may share limited data with trusted services (such as analytics and payment providers) to operate the App." />
                <Section id="04" title="Data Storage" text="Your data is stored securely and only retained as long as necessary within our encrypted environment." />
                <div className="h-24" />
              </div>
            </motion.div>
          )}

          {view === 'run' && (
            <motion.div 
              key="run"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="fixed inset-0 z-[60] bg-black text-white p-10 flex flex-col justify-between overflow-hidden"
            >
              <div className="absolute inset-0 elite-gradient opacity-40" />
              
              <header className="w-full flex justify-between items-center z-10 pt-4">
                <div className="w-12"></div>
                <div className="flex items-center gap-4 bg-neutral-900/50 backdrop-blur-xl px-6 py-2.5 rounded-full border border-white/10">
                  <div className={`w-2.5 h-2.5 rounded-full ${isRunning && !isPaused ? 'bg-green-500 animate-pulse' : 'bg-orange-500'}`} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{isRunning ? "Live Stream" : "Ready"}</span>
                </div>
                <button 
                  onClick={() => setRunFocusMode(!runFocusMode)}
                  className={`p-3 rounded-2xl transition-all border ${runFocusMode ? 'bg-white text-black border-white' : 'bg-neutral-900/50 text-white border-white/10 backdrop-blur-xl'}`}
                >
                  <Activity size={20} />
                </button>
              </header>

              <div className="relative flex-1 flex flex-col items-center justify-center">
                {!runFocusMode ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center"
                  >
                    <div className="text-center">
                      <p className="text-neutral-600 text-[10px] font-black uppercase tracking-[0.6em] mb-6">Distance</p>
                      <h1 className="text-[130px] font-black leading-none tracking-tighter tabular-nums text-glow">
                        {(distance / 1000).toFixed(2)}
                      </h1>
                      <p className="text-2xl font-medium text-neutral-500 -mt-2 tracking-wide uppercase text-[12px] font-bold tracking-widest">Kilometers</p>
                    </div>
                    
                    <div className="mt-12 flex gap-8 flex-wrap justify-center">
                      <div className="text-center p-6 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 min-w-[100px]">
                        <p className="text-neutral-600 text-[8px] font-black uppercase tracking-widest mb-1">Time</p>
                        <p className="text-2xl font-bold tabular-nums">{formatDuration(elapsed)}</p>
                      </div>
                      <div className="text-center p-6 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 min-w-[100px]">
                        <p className="text-neutral-600 text-[8px] font-black uppercase tracking-widest mb-1">Pace</p>
                        <p className="text-2xl font-bold tabular-nums">
                          {distance > 0 ? `${Math.floor((elapsed / (distance / 1000)) / 60)}:${Math.floor((elapsed / (distance / 1000)) % 60).toString().padStart(2, '0')}` : '0:00'}
                        </p>
                      </div>
                      <div className="text-center p-6 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 min-w-[100px]">
                        <p className="text-red-600 text-[8px] font-black uppercase tracking-widest mb-1">Heart Rate</p>
                        <p className="text-2xl font-bold tabular-nums text-red-500 flex items-center justify-center gap-1">
                          <Heart size={16} className="fill-red-500 animate-pulse" />
                          {heartRate}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full grid grid-cols-1 gap-12"
                  >
                    <div className="text-center">
                      <p className="text-neutral-600 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Current Pace</p>
                      <h2 className="text-8xl font-black tracking-tighter tabular-nums">
                        {distance > 0 ? `${Math.floor((elapsed / (distance / 1000)) / 60)}:${Math.floor((elapsed / (distance / 1000)) % 60).toString().padStart(2, '0')}` : '0:00'}
                      </h2>
                      <p className="text-neutral-500 font-bold uppercase text-[10px] tracking-widest mt-2">MIN/KM</p>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                      <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 text-center">
                        <p className="text-blue-500 text-[10px] font-black uppercase tracking-widest mb-3">Max Speed</p>
                        <p className="text-4xl font-black tabular-nums">{maxSpeed.toFixed(1)}</p>
                        <p className="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">KM/H</p>
                      </div>
                      <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 text-center">
                        <p className="text-yellow-500 text-[10px] font-black uppercase tracking-widest mb-3">Elevation</p>
                        <p className="text-4xl font-black tabular-nums">{elevationGain.toFixed(0)}</p>
                        <p className="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">METERS</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="w-full flex justify-center items-center gap-12 mb-20 z-20">
                {!isRunning ? (
                  <button 
                    onClick={startRun} 
                    className="w-32 h-32 bg-white text-black rounded-full flex items-center justify-center shadow-[0_20px_50px_rgba(255,255,255,0.2)] active:scale-90 transition-transform"
                  >
                    <Play size={48} className="fill-black" />
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => {
                        triggerHaptic(50);
                        setIsPaused(!isPaused);
                      }} 
                      className={`w-24 h-24 rounded-full flex items-center justify-center active:scale-95 transition-all border ${isPaused ? 'bg-white text-black border-white shadow-[0_20px_50px_rgba(255,255,255,0.2)]' : 'bg-white/5 text-white border-white/10 backdrop-blur-xl'}`}
                    >
                      {isPaused ? <Play size={32} /> : <Pause size={32} />}
                    </button>
                    <button 
                      onClick={stopRun} 
                      className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center shadow-[0_20px_50px_rgba(239,68,68,0.3)] active:scale-90 transition-all"
                    >
                      <Square size={28} className="fill-white text-white" />
                    </button>
                  </>
                )}
              </div>

              {lastSessionSummary && !isRunning && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 bg-white text-black p-10 flex flex-col justify-between z-50"
                >
                  <div>
                    <header className="flex justify-between items-center mb-16">
                      <h2 className="text-4xl font-black tracking-tighter">Session Summary</h2>
                      <button onClick={() => { setLastSessionSummary(null); setView('home'); }} className="p-3 bg-neutral-100 rounded-full">
                        <X size={24} />
                      </button>
                    </header>

                    <div className="grid grid-cols-2 gap-6 mb-10">
                      <div className="col-span-2">
                        <RouteMap route={sessionRoute} />
                      </div>
                      <div className="p-8 bg-black text-white rounded-[3rem]">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase mb-2">Distance</p>
                        <p className="text-4xl font-black">{(lastSessionSummary.distance / 1000).toFixed(2)} km</p>
                      </div>
                      <div className="p-8 bg-neutral-50 rounded-[3rem]">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase mb-2">Duration</p>
                        <p className="text-4xl font-black">{formatDuration(lastSessionSummary.duration)}</p>
                      </div>
                      <div className="p-8 bg-neutral-50 rounded-[3rem]">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase mb-2">Avg Speed</p>
                        <p className="text-4xl font-black">{lastSessionSummary.avgSpeed.toFixed(1)} <span className="text-xs">km/h</span></p>
                      </div>
                      <div className="p-8 bg-neutral-50 rounded-[3rem]">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase mb-2">Elevation</p>
                        <p className="text-4xl font-black">{lastSessionSummary.elevationGain.toFixed(0)} <span className="text-xs">m</span></p>
                      </div>
                      <div className="p-8 bg-red-50 rounded-[3rem]">
                        <p className="text-[10px] font-bold text-red-400 uppercase mb-2">Avg Heart Rate</p>
                        <p className="text-4xl font-black text-red-600">{lastSessionSummary.avgHeartRate} <span className="text-xs">bpm</span></p>
                      </div>
                      <div className="p-8 bg-blue-50 rounded-[3rem]">
                        <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">Max Speed</p>
                        <p className="text-4xl font-black text-blue-600">{lastSessionSummary.maxSpeed.toFixed(1)} <span className="text-xs">km/h</span></p>
                      </div>

                      {lastSessionSummary.segments.length > 0 && (
                        <div className="col-span-2 p-8 bg-neutral-50 rounded-[3rem]">
                          <p className="text-[10px] font-bold text-neutral-400 uppercase mb-6">Split Breakdown</p>
                          <div className="space-y-4">
                            {lastSessionSummary.segments.map((seg, idx) => (
                              <div key={idx} className="flex justify-between items-center border-b border-neutral-200 pb-2">
                                <span className="font-bold text-neutral-400">KM {seg.km}</span>
                                <span className="font-black">{Math.floor(seg.pace / 60)}:{Math.floor(seg.pace % 60).toString().padStart(2, '0')} /km</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mb-12">
                      <button 
                        onClick={analyzeRun}
                        disabled={isAnalysisLoading}
                        className="w-full py-6 bg-black text-white rounded-[2.5rem] font-bold flex items-center justify-center gap-3 mb-6 active:scale-95 transition-transform"
                      >
                        {isAnalysisLoading ? <Loader2 className="animate-spin" size={20} /> : "✨ Analyze with AI"}
                      </button>
                      
                      {aiAnalysis && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-8 bg-neutral-50 border border-neutral-100 rounded-[2.5rem]"
                        >
                          <p className="text-[10px] font-black uppercase text-neutral-400 mb-4 tracking-widest">Coach Insight</p>
                          <p className="text-sm font-medium leading-relaxed">{aiAnalysis}</p>
                        </motion.div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={() => { setLastSessionSummary(null); setView('home'); }} 
                    className="w-full py-7 border border-neutral-100 rounded-[2.5rem] font-black text-sm uppercase tracking-widest"
                  >
                    Return Home
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === 'breathing' && (
            <BreathingExercise onBack={() => setView('coach')} />
          )}
        </AnimatePresence>
      </main>

      {['home', 'profile', 'coach', 'stats'].includes(view) && (
        <nav className="fixed bottom-8 left-8 right-8 h-24 glass-nav rounded-[3rem] flex items-center justify-around px-4 z-[100] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
          <button onClick={() => setView('home')} className={`p-4 transition-all flex flex-col items-center gap-1.5 ${view === 'home' ? 'scale-110' : 'opacity-50'}`}>
            <div className={`p-3 rounded-2xl transition-all ${view === 'home' ? 'bg-black text-white shadow-xl' : 'text-neutral-400'}`}>
              <HomeIcon size={22} strokeWidth={view === 'home' ? 3 : 2} />
            </div>
            <span className={`text-[8px] font-black uppercase tracking-widest ${view === 'home' ? 'text-black' : 'text-neutral-400'}`}>Home</span>
          </button>
          <button onClick={() => setView('stats')} className={`p-4 transition-all flex flex-col items-center gap-1.5 ${view === 'stats' ? 'scale-110' : 'opacity-50'}`}>
            <div className={`p-3 rounded-2xl transition-all ${view === 'stats' ? 'bg-black text-white shadow-xl' : 'text-neutral-400'}`}>
              <BarChart2 size={22} strokeWidth={view === 'stats' ? 3 : 2} />
            </div>
            <span className={`text-[8px] font-black uppercase tracking-widest ${view === 'stats' ? 'text-black' : 'text-neutral-400'}`}>Stats</span>
          </button>
          <button onClick={() => setView('coach')} className={`p-4 transition-all flex flex-col items-center gap-1.5 ${view === 'coach' ? 'scale-110' : 'opacity-50'}`}>
            <div className={`p-3 rounded-2xl transition-all ${view === 'coach' ? 'bg-black text-white shadow-xl' : 'text-neutral-400'}`}>
              <Zap size={22} strokeWidth={view === 'coach' ? 3 : 2} />
            </div>
            <span className={`text-[8px] font-black uppercase tracking-widest ${view === 'coach' ? 'text-black' : 'text-neutral-400'}`}>Coach</span>
          </button>
          <button onClick={() => setView('profile')} className={`p-4 transition-all flex flex-col items-center gap-1.5 ${view === 'profile' ? 'scale-110' : 'opacity-50'}`}>
            <div className={`p-3 rounded-2xl transition-all ${view === 'profile' ? 'bg-black text-white shadow-xl' : 'text-neutral-400'}`}>
              <User size={22} strokeWidth={view === 'profile' ? 3 : 2} />
            </div>
            <span className={`text-[8px] font-black uppercase tracking-widest ${view === 'profile' ? 'text-black' : 'text-neutral-400'}`}>Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
}
