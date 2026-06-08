import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Trophy, 
  Play, 
  RotateCcw, 
  Cpu, 
  Tv, 
  Flame, 
  Volume2, 
  VolumeX, 
  Target,
  User,
  Users,
  Settings,
  CircleDot,
  Crown,
  Medal,
  Activity,
  ArrowRight,
  Layers,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const GRID_COLS = 20;
const GRID_ROWS = 20;
const CELL_SIZE = 20; // 400x400 virtual grid

type Point = { x: number; y: number };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
  decay: number;
};

type FloatingText = {
  x: number;
  y: number;
  text: string;
  alpha: number;
  size: number;
  vy: number;
};

type TournamentPlayer = {
  id: number;
  name: string;
  score: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'pro';
  speedMs: number;
  done: boolean;
};

const FOOD_EMOJIS = ['🍕', '🍔', '🥘'];

const STAGE_THEMES = [
  { name: 'WAKING', bg: '#020617', grid: '#0f172a', text: '#1e293b' },
  { name: 'NEON', bg: '#1e1b4b', grid: '#312e81', text: '#3730a3' },
  { name: 'TOXIC', bg: '#14532d', grid: '#166534', text: '#15803d' },
  { name: 'BLAZE', bg: '#451a03', grid: '#78350f', text: '#92400e' },
  { name: 'BLOOD', bg: '#4c0519', grid: '#881337', text: '#9f1239' },
  { name: 'VOID', bg: '#2e1065', grid: '#4c1d95', text: '#5b21b6' },
  { name: 'ACID', bg: '#164e63', grid: '#155e75', text: '#0e7490' },
  { name: 'SOLAR', bg: '#422006', grid: '#713f12', text: '#854d0e' },
  { name: 'ABYSS', bg: '#000000', grid: '#171717', text: '#262626' },
  { name: 'APEX', bg: '#3f000f', grid: '#6b0f1a', text: '#991b27' },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Audio state
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Tournament Player Queue (Strict limit of 4)
  const [players, setPlayers] = useState<TournamentPlayer[]>([
    { id: 1, name: "Player_1", score: 0, difficulty: "medium", speedMs: 130, done: false },
  ]);
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(0);
  const [newPlayerName, setNewPlayerName] = useState("");
  
  // Tournament Status
  const [tournamentFinished, setTournamentFinished] = useState(false);

  // Difficulty Config
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'pro'>('medium');
  const [customSpeedMs, setCustomSpeedMs] = useState<number>(150); // Slider for easy mode only (100 - 200 ms)

  // Current session/play stats
  const [score, setScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [streak, setStreak] = useState(0);

  // Game UI State
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'ended'>('menu');
  const [eliminationReason, setEliminationReason] = useState('');
  const [stage, setStage] = useState(1);

  // Refs for loop state
  const stageRef = useRef(1);
  const foodsEatenRef = useRef(0);
  const snakeRef = useRef<Point[]>([]);
  const dirRef = useRef<Point>({ x: 1, y: 0 });
  const lastDirRef = useRef<Point>({ x: 1, y: 0 });
  const foodRef = useRef<Point>({ x: 5, y: 5 });
  const foodEmojiRef = useRef<string>('🍕');
  
  // VFX particles & floats
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const foodPulseRef = useRef<number>(0);

  // Retrieve matching interval
  const getCurrentInterval = useCallback(() => {
    let baseMs = 130;
    switch (difficulty) {
      case 'easy':
        baseMs = customSpeedMs; break;
      case 'medium':
        baseMs = 130; break;
      case 'hard':
        baseMs = 90; break;
      case 'pro':
        baseMs = 60; break;
    }
    const stageMultiplier = Math.pow(0.96, stageRef.current - 1);
    return Math.max(30, baseMs * stageMultiplier);
  }, [difficulty, customSpeedMs]);

  // Audio synths
  const playSound = useCallback((type: 'eat' | 'crash' | 'click' | 'cheer') => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'eat') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(30, audioCtx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } else if (type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
      } else if (type === 'cheer') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      }
    } catch (e) {
      // Audio context block protection
    }
  }, [soundEnabled]);

  // Create Neon explosions upon eating food
  const createExplosion = useCallback((gx: number, gy: number, color: string) => {
    const cx = gx * CELL_SIZE + CELL_SIZE / 2;
    const cy = gy * CELL_SIZE + CELL_SIZE / 2;
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        alpha: 1.0,
        size: Math.random() * 3 + 2,
        decay: Math.random() * 0.03 + 0.02
      });
    }
  }, []);

  // Spawn food with validation
  const spawnFood = useCallback(() => {
    const totalCells = GRID_COLS * GRID_ROWS;
    let attempts = 0;
    while (attempts < totalCells) {
      const rx = Math.floor(Math.random() * GRID_COLS);
      const ry = Math.floor(Math.random() * GRID_ROWS);
      
      const onSnake = snakeRef.current.some(s => s.x === rx && s.y === ry);
      if (!onSnake) {
        foodRef.current = { x: rx, y: ry };
        break;
      }
      attempts++;
    }
    // Randomize the active food emoji from the funny list ['🍕', '🍔', '🥘']
    foodEmojiRef.current = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
  }, []);

  // Launch a specified player run
  const triggerMatchStart = useCallback(() => {
    playSound('click');
    setScore(0);
    setStreak(0);
    setMultiplier(1);
    setStage(1);
    stageRef.current = 1;
    foodsEatenRef.current = 0;
    particlesRef.current = [];
    floatingTextsRef.current = [];
    foodPulseRef.current = 0;
    
    // Spawn player in the center moving right
    snakeRef.current = [
      { x: 5, y: 10 },
      { x: 4, y: 10 },
      { x: 3, y: 10 }
    ];
    dirRef.current = { x: 1, y: 0 };
    lastDirRef.current = { x: 1, y: 0 };

    spawnFood();
    setGameState('playing');
  }, [spawnFood, playSound]);

  // Handle player rename for active slot
  const updatePlayerName = (index: number, newName: string) => {
    if (!newName.trim()) return;
    const updated = [...players];
    updated[index] = {
      ...updated[index],
      name: newName
    };
    setPlayers(updated);
  };

  const updatePlayerCount = (count: number) => {
    playSound('click');
    const defaultNames = ["Player_1", "Player_2", "Player_3", "Player_4"];
    const updated = [];
    for(let i=0; i<count; i++){
      updated.push({
        id: i + 1,
        name: players[i]?.name && players[i]?.name !== defaultNames[i] ? players[i].name : defaultNames[i],
        score: 0,
        difficulty: difficulty,
        speedMs: 130,
        done: false
      });
    }
    setPlayers(updated);
    setActivePlayerIndex(0);
    setTournamentFinished(false);
    setGameState('menu');
  };

  const rematchSamePlayers = () => {
    playSound('click');
    const fresh = players.map(p => ({ ...p, score: 0, done: false }));
    setPlayers(fresh);
    setActivePlayerIndex(0);
    setTournamentFinished(false);
    setGameState('menu');
  };

  const winnerContinuesSolo = () => {
    playSound('click');
    const sorted = [...players].sort((a,b) => b.score - a.score);
    if (sorted.length > 0) {
      setPlayers([{
        id: 1,
        name: sorted[0].name,
        score: 0,
        difficulty: difficulty,
        speedMs: 130,
        done: false
      }]);
    }
    setActivePlayerIndex(0);
    setTournamentFinished(false);
    setGameState('menu');
  };

  // Direction handler for on-screen controls
  const handleDirection = useCallback((dir: 'up'|'down'|'left'|'right') => {
    if (gameState !== 'playing') return;
    const d = lastDirRef.current;
    if (dir === 'up' && d.y === 0) dirRef.current = { x: 0, y: -1 };
    if (dir === 'down' && d.y === 0) dirRef.current = { x: 0, y: 1 };
    if (dir === 'left' && d.x === 0) dirRef.current = { x: -1, y: 0 };
    if (dir === 'right' && d.x === 0) dirRef.current = { x: 1, y: 0 };
  }, [gameState]);

  // Key Event Mapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.key;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        if (gameState === 'playing') e.preventDefault();
      }

      const d = lastDirRef.current;
      if (code === 'ArrowUp' && d.y === 0) dirRef.current = { x: 0, y: -1 };
      if (code === 'ArrowDown' && d.y === 0) dirRef.current = { x: 0, y: 1 };
      if (code === 'ArrowLeft' && d.x === 0) dirRef.current = { x: -1, y: 0 };
      if (code === 'ArrowRight' && d.x === 0) dirRef.current = { x: 1, y: 0 };
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // Main Loop Render/Update Logic context
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let movementTimer = 0;
    const currentMs = getCurrentInterval();
    let lastTime = performance.now();
    let animFrame: number;

    const gameTick = () => {
      const head = { ...snakeRef.current[0] };
      head.x += dirRef.current.x;
      head.y += dirRef.current.y;
      lastDirRef.current = { ...dirRef.current };

      let crash = false;
      let reason = '';

      // Barrier Wall crashes
      if (head.x < 0 || head.x >= GRID_COLS || head.y < 0 || head.y >= GRID_ROWS) {
        crash = true;
        reason = 'COLLIDED WITH STAGE PERIMETER FRAME!';
      } else if (snakeRef.current.some(s => s.x === head.x && s.y === head.y)) {
        crash = true;
        reason = 'COLLIDED WITH OWN SNAKE SEGMENTS!';
      }

      if (crash) {
        playSound('crash');
        setGameState('ended');
        setEliminationReason(reason);

        // Commit active round player progress
        const updatedQueue = [...players];
        updatedQueue[activePlayerIndex] = {
          ...updatedQueue[activePlayerIndex],
          score: score,
          difficulty: difficulty,
          speedMs: currentMs,
          done: true
        };
        setPlayers(updatedQueue);

        // Determine if there is next player or session completes
        const nextIndex = activePlayerIndex + 1;
        if (nextIndex >= players.length) {
          setTournamentFinished(true);
          playSound('cheer');
        } else {
          setActivePlayerIndex(nextIndex);
        }
        return;
      }

      // Append and slide snake segments
      snakeRef.current.unshift(head);

      // Check food consumption
      if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        playSound('eat');
        // Spawn yummy text floating up
        floatingTextsRef.current.push({
          x: foodRef.current.x * CELL_SIZE + CELL_SIZE / 2,
          y: foodRef.current.y * CELL_SIZE,
          text: "+10 YUMMY!",
          alpha: 1.0,
          size: 16,
          vy: -1.2
        });
        
        // Spawn beautiful neon rose explosions
        createExplosion(foodRef.current.x, foodRef.current.y, '#f43f5e');

        // Score update with eSports multiplier
        setScore(s => s + 10 * multiplier);
        setStreak(st => {
          const nextStreak = st + 1;
          setMultiplier(Math.min(5, Math.floor(nextStreak / 3) + 1));
          return nextStreak;
        });

        foodsEatenRef.current += 1;
        const newStage = Math.min(10, Math.floor(foodsEatenRef.current / 5) + 1);
        if (newStage > stageRef.current) {
          stageRef.current = newStage;
          setStage(newStage);
          playSound('cheer');
          floatingTextsRef.current.push({
            x: 200,
            y: 200,
            text: newStage === 10 ? "FINAL STAGE: APEX!" : `STAGE 0${newStage} REACHED!`,
            alpha: 2.0,
            size: 24,
            vy: -0.6
          });
        }

        spawnFood();
      } else {
        snakeRef.current.pop();
      }
    };

    const mainAnimationLoop = (timestamp: number) => {
      animFrame = requestAnimationFrame(mainAnimationLoop);

      const elapsed = timestamp - lastTime;
      lastTime = timestamp;
      movementTimer += elapsed;

      // Pulse food visual indicator
      foodPulseRef.current += elapsed * 0.005;

      // Only tick movement coordinates based on active speed MS
      if (movementTimer >= currentMs) {
        movementTimer = 0;
        gameTick();
      }

      // --- CANVAS RENDERING CORE ---
      const activeTheme = STAGE_THEMES[stageRef.current - 1];
      ctx.fillStyle = activeTheme.bg; // Midnight slate
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Cyber Punk Grid Space representation
      ctx.strokeStyle = activeTheme.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID_COLS; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL_SIZE, 0); ctx.lineTo(i * CELL_SIZE, canvas.height); ctx.stroke();
      }
      for (let j = 0; j <= GRID_ROWS; j++) {
        ctx.beginPath(); ctx.moveTo(0, j * CELL_SIZE); ctx.lineTo(canvas.width, j * CELL_SIZE); ctx.stroke();
      }

      // Draw watermark stage
      ctx.save();
      ctx.fillStyle = activeTheme.text;
      ctx.font = "bold 60px 'Orbitron'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.5;
      ctx.fillText(stageRef.current === 10 ? "FINAL" : `0${stageRef.current}`, canvas.width / 2, canvas.height / 2);
      ctx.font = "bold 20px 'Orbitron'";
      ctx.fillText(activeTheme.name, canvas.width / 2, canvas.height / 2 + 45);
      ctx.restore();

      // Draw Spinning custom Target food (emoji centering inside cell)
      ctx.save();
      ctx.translate(
        foodRef.current.x * CELL_SIZE + CELL_SIZE / 2,
        foodRef.current.y * CELL_SIZE + CELL_SIZE / 2
      );
      const pulseScale = 1 + Math.sin(foodPulseRef.current * 4) * 0.15;
      ctx.scale(pulseScale, pulseScale);
      ctx.rotate(foodPulseRef.current * 1.5); 
      
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#f43f5e';
      ctx.font = `18px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(foodEmojiRef.current, 0, 1);
      
      // Draw a glowing aura behind the food
      ctx.globalCompositeOperation = "destination-over";
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(244, 63, 94, 0.25)";
      ctx.fill();
      
      ctx.restore();

      // Render colorful explosive particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw glowing segmented Neon Cyan Snake body as a continuous organic tube
      if (snakeRef.current.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        for (let i = 0; i < snakeRef.current.length; i++) {
          const seg = snakeRef.current[i];
          const segX = seg.x * CELL_SIZE + CELL_SIZE / 2;
          const segY = seg.y * CELL_SIZE + CELL_SIZE / 2;
          if (i === 0) ctx.moveTo(segX, segY);
          else ctx.lineTo(segX, segY);
        }
        
        // Outer glowing cyan body
        ctx.lineWidth = CELL_SIZE - 4;
        ctx.strokeStyle = '#22d3ee';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#22d3ee';
        ctx.stroke();

        // Inner bright core
        ctx.lineWidth = CELL_SIZE - 12;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#ffffff';
        ctx.stroke();
        
        // Render Snake Head with Real Eyes
        const head = snakeRef.current[0];
        const hx = head.x * CELL_SIZE + CELL_SIZE / 2;
        const hy = head.y * CELL_SIZE + CELL_SIZE / 2;
        
        ctx.translate(hx, hy);
        
        // Rotate head based on direction for eye placement
        if (lastDirRef.current.x === 1) ctx.rotate(0);
        else if (lastDirRef.current.x === -1) ctx.rotate(Math.PI);
        else if (lastDirRef.current.y === 1) ctx.rotate(Math.PI / 2);
        else if (lastDirRef.current.y === -1) ctx.rotate(-Math.PI / 2);
        
        ctx.shadowBlur = 0;
        
        // Black outline of the eyes
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.arc(3, -4, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(3, 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
        
        // White pupils
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(3.5, -4, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(3.5, 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }

      // Render Floating eSports "+10 YUMMY!" Indicator labels
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy;
        ft.alpha -= 0.035;
        if (ft.alpha <= 0) {
          floatingTextsRef.current.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.fillStyle = '#10b981'; // Vivid green emerald
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#10b981';
        ctx.font = `bold italic ${ft.size}px 'Orbitron'`;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }
    };

    animFrame = requestAnimationFrame(mainAnimationLoop);
    return () => cancelAnimationFrame(animFrame);
  }, [gameState, activePlayerIndex, difficulty, customSpeedMs, score, multiplier, spawnFood, playSound, createExplosion, players, getCurrentInterval]);

  // Sorted list of players by current score for placing live badges
  const scoreboardSorted = [...players].sort((a,b) => b.score - a.score);

  return (
    <div className="min-h-screen bg-[#070b19] font-rajdhani text-neutral-300 flex flex-col justify-between overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      
      {/* ESPORTS HEADLIGHT BLOCK */}
      <header className="border-b border-[#1e293b] bg-[#020617]/95 backdrop-blur px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-[0_4px_30px_rgba(34,211,238,0.05)] sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="p-2 border border-cyan-500/30 rounded bg-cyan-950/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
            <Crown className="w-6 h-6 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <h1 className="font-orbitron text-2xl font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-100 to-cyan-400 drop-shadow-[0_2px_10px_rgba(34,211,238,0.3)]">
              SNAKE X PRO BRACKET
            </h1>
            <p className="text-[10px] text-neutral-500 uppercase font-orbitron tracking-widest">Grand Tournament Series</p>
          </div>
        </div>

        {/* Prize Pool Info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border border-rose-500/30 px-3 py-1.5 rounded bg-rose-500/10 text-xs font-semibold text-rose-400 font-orbitron uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-rose-500 block animate-ping"></span>
            LIVE BROADCASTING
          </div>

          <div className="relative border border-amber-500/30 rounded px-4 py-1.5 bg-amber-500/5 flex items-center gap-2">
            <span className="text-[#f59e0b] font-orbitron font-bold text-xs uppercase tracking-wider">PRIZE POOL:</span>
            <span className="text-white font-orbitron font-extrabold text-sm tracking-wider animate-bounce">$2,500 USD</span>
          </div>

          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded border border-neutral-800 hover:border-cyan-500/30 text-neutral-400 hover:text-cyan-400 transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* DASHBOARD LAYOUT */}
      <main className="max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start flex-grow">
        
        {/* LEFT PANEL: PLAYER QUEUE MANAGEMENT & CONFIGS */}
        <section className="lg:col-span-1 bg-[#020617]/80 border border-[#1e293b] rounded-lg p-5 flex flex-col gap-5 backdrop-blur shadow-xl">
          <div>
            <h2 className="font-orbitron text-xs font-bold uppercase text-cyan-400 tracking-widest mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> ACTIVE BRACKET QUEUE
            </h2>
            <p className="text-xs text-neutral-500 mb-4 uppercase tracking-wider">Up to 4 players allowed per session</p>

            {/* Player Count Selection */}
            <div className="mb-4 bg-[#0b1329]/30 border border-neutral-800 rounded p-3">
              <div className="text-[10px] text-neutral-500 mb-2 uppercase tracking-wider font-bold">MODE / PLAYER COUNT:</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map(num => (
                  <button
                    key={num}
                    onClick={() => updatePlayerCount(num)}
                    disabled={gameState === 'playing' || activePlayerIndex > 0 || (tournamentFinished && activePlayerIndex > 0)}
                    className={`py-1.5 px-1 text-[9px] font-orbitron font-bold rounded transition-colors disabled:opacity-50 ${
                      players.length === num
                        ? 'bg-[#22d3ee] text-black shadow-[0_0_10px_rgba(34,211,238,0.5)]'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-cyan-400'
                    }`}
                  >
                    {num === 1 ? 'SOLO' : `${num} VS`}
                  </button>
                ))}
              </div>
            </div>

            {/* List and editable nickname slots */}
            <div className="flex flex-col gap-2.5">
              {players.map((item, idx) => (
                <div 
                  key={item.id} 
                  className={`border p-3 rounded flex flex-col gap-2 transition-all duration-300 ${
                    idx === activePlayerIndex && !item.done && !tournamentFinished
                      ? 'border-cyan-500 bg-cyan-950/20 shadow-[0_0_15px_rgba(34,211,238,0.15)] scale-[1.02]'
                      : 'border-neutral-800 bg-[#0b1329]/40'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-orbitron font-bold text-xs text-neutral-500">
                      SLOT_0{item.id}
                    </span>
                    {item.done ? (
                      <span className="text-[10px] text-emerald-400 font-bold border border-emerald-500/20 px-1.5 py-0.5 rounded bg-emerald-500/10">
                        COMPLETED
                      </span>
                    ) : idx === activePlayerIndex && !tournamentFinished ? (
                      <span className="text-[10px] text-cyan-400 font-bold border border-cyan-500/20 px-1.5 py-0.5 rounded bg-cyan-500/10 animate-pulse">
                        ON_DECK
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-600 font-bold">
                        PENDING
                      </span>
                    )}
                  </div>

                  {/* Nickname modification allowed prior to doing their turn */}
                  {!item.done ? (
                    <div className="flex gap-1.5">
                      <input 
                        type="text" 
                        placeholder={`Gamer ${item.id} Name`}
                        value={item.name}
                        onChange={(e) => updatePlayerName(idx, e.target.value)}
                        className="bg-[#020617] border border-neutral-800 focus:border-cyan-500 text-xs px-2 py-1.5 rounded text-white font-mono flex-grow focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div className="flex justify-between items-center bg-[#020617] px-2.5 py-1.5 rounded border border-neutral-900">
                      <span className="text-xs text-white font-mono font-bold">{item.name}</span>
                      <span className="text-xs text-[#22d3ee] font-mono font-black">{item.score.toString().padStart(3, '0')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <hr className="border-neutral-850" />

          {/* Difficulty & Speed parameters configuration */}
          <div>
            <h3 className="font-orbitron text-xs font-bold uppercase text-[#e879f9] tracking-widest mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" /> ENGINE METRIC SPEED
            </h3>
            
            <div className="grid grid-cols-4 gap-1.5 mb-4">
              {(['easy', 'medium', 'hard', 'pro'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    playSound('click');
                    setDifficulty(level);
                  }}
                  disabled={gameState === 'playing'}
                  className={`py-1.5 text-[10px] font-orbitron font-bold rounded uppercase transition-colors disabled:opacity-50 ${
                    difficulty === level
                      ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-black'
                      : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            {/* Custom Speed Tweak Slider - Unlocked in Easy Mode ONLY */}
            <div className="bg-[#0b1329]/50 border border-neutral-800 rounded p-3 text-xs">
              <div className="flex justify-between items-center text-[10px] font-bold text-neutral-400 mb-2 uppercase tracking-wide">
                <span>Velocity Slide (Easy ONLY)</span>
                <span className="text-pink-400 font-mono">{getCurrentInterval().toFixed(0)}ms</span>
              </div>
              <input 
                type="range"
                min="100"
                max="200"
                step="10"
                value={customSpeedMs}
                onChange={(e) => setCustomSpeedMs(parseInt(e.target.value))}
                disabled={difficulty !== 'easy' || gameState === 'playing'}
                className="w-full accent-[#e879f9] bg-neutral-800 rounded h-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              />
              {difficulty !== 'easy' && (
                <p className="text-[10px] text-neutral-500 mt-1.5 italic">Slider locked for pro standard parameters.</p>
              )}
            </div>
          </div>

          <hr className="border-neutral-850" />

          <button
            onClick={rematchSamePlayers}
            className="w-full py-2.5 border border-dashed border-neutral-800 hover:border-rose-500/40 text-neutral-500 hover:text-rose-400 text-xs font-orbitron font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> REMATCH ACTIVE PLAYERS
          </button>
        </section>

        {/* CENTER COLUMN: LIVE GAMING ARENA VIEWPORT */}
        <section className="lg:col-span-2 flex flex-col items-center justify-center gap-4">
          
          {/* Active Tournament Match Header stats */}
          <div className="w-full bg-[#020617]/90 border border-[#1e293b] rounded-lg p-4 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] text-neutral-500 uppercase font-orbitron tracking-widest">ACTIVE DRIVER SLOT</span>
                <span className="text-xl font-orbitron font-black text-white">
                  {tournamentFinished ? 'SESSION COMPLETED' : players[activePlayerIndex]?.name || 'N/A'}
                </span>
                <span className="text-[9px] text-cyan-400 font-mono tracking-widest font-black flex items-center gap-1.5 mt-0.5">
                  <Activity className="w-3 h-3 text-cyan-400" /> TWEAKED VEL_LEVEL: {difficulty.toUpperCase()} ({getCurrentInterval().toFixed(0)}MS)
                </span>
                <span className="text-[9px] text-[#e879f9] font-mono tracking-widest font-black flex items-center gap-1.5 mt-0.5 animate-pulse">
                  <Layers className="w-3 h-3 text-[#e879f9]" /> STAGE: {stage === 10 ? 'FINAL' : `0${stage}`} - {STAGE_THEMES[stage - 1]?.name}
                </span>
              </div>
            </div>

            {/* Live Score block */}
            <div className="flex items-center gap-4 text-right">
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-neutral-500 uppercase font-orbitron tracking-widest block">RUN_SCORE</span>
                <span className="text-3xl font-orbitron font-black text-[#22d3ee] drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
                  {score.toString().padStart(3, '0')}
                </span>
              </div>

              {gameState === 'playing' && (
                <div className="flex items-center gap-1 bg-[#22d3ee]/10 border border-[#22d3ee]/20 px-2 py-1 rounded text-xs font-bold text-cyan-400 font-orbitron animate-pulse">
                  <Flame className="w-3.5 h-3.5 text-orange-500 fill-current" />
                  x{multiplier}
                </div>
              )}
            </div>
          </div>

          {/* Arena Border block wrapping Canvas view */}
          <div className="relative group w-full aspect-square border border-[#1e293b] p-1.5 rounded-lg bg-black shadow-[0_0_50px_rgba(34,211,238,0.03)] focus:outline-none">
            
            <canvas
              ref={canvasRef}
              width={400}
              height={400}
              className="bg-[#020617] rounded block w-full h-full"
              style={{ imageRendering: 'pixelated' }}
            />

            {/* Preparation Menu Overlay */}
            {gameState === 'menu' && !tournamentFinished && (
              <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center p-6 text-center z-10 transition-opacity">
                <div className="w-16 h-16 rounded-full border-2 border-[#22d3ee] flex items-center justify-center bg-[#22d3ee]/5 shadow-[0_0_20px_rgba(34,211,238,0.2)] mb-4">
                  <Tv className="w-8 h-8 text-[#22d3ee] animate-pulse" />
                </div>
                <h3 className="font-orbitron font-black text-2xl tracking-widest text-[#22d3ee] mb-1">
                  ARENA LOCKED
                </h3>
                <p className="text-xs text-neutral-500 uppercase tracking-widest font-orbitron mb-6 max-w-xs">
                  {players[activePlayerIndex]?.name || 'N/A'}&apos;s turn to record their tournament run
                </p>
                <button
                  onClick={triggerMatchStart}
                  className="px-8 py-3 bg-[#22d3ee] hover:bg-[#67e8f9] text-black font-orbitron font-extrabold rounded-md transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)] text-xs tracking-widest uppercase flex items-center gap-2"
                >
                  INITIATE RUN <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Running Crashed Transition Screen */}
            {gameState === 'ended' && !tournamentFinished && (
              <div className="absolute inset-0 bg-black/90 backdrop-blur-md rounded-lg flex flex-col items-center justify-center p-6 text-center z-10">
                <span className="text-[10px] tracking-widest text-rose-500 font-orbitron font-black border border-rose-500/30 px-3 py-1 rounded bg-rose-500/10 mb-2 uppercase">
                  ELIMINATED
                </span>
                
                <h3 className={`font-orbitron font-black text-2xl tracking-wide mb-2 filter drop-shadow-[0_2px_10px_rgba(244,63,94,0.3)] select-all ${score === 0 ? 'text-rose-500' : 'text-neutral-300'}`}>
                  {score === 0 ? "YOU LOOSE! TRY AGAIN! GOOD LUCK!" : `RUN ENDED FOR ${players[activePlayerIndex - 1]?.name || 'PREVIOUS'}`}
                </h3>
                
                <p className="text-xs text-[#e879f9] font-mono italic max-w-xs mb-6">
                  {score === 0 && <span className="text-neutral-400 block mb-1">RUN ENDED FOR {players[activePlayerIndex - 1]?.name || 'PREVIOUS'}</span>}
                  &quot;{eliminationReason}&quot;
                </p>

                <div className="bg-[#0a0f24] border border-neutral-800 rounded p-4 flex flex-col items-center gap-1.5 mb-8 w-64">
                  <span className="text-[10px] text-neutral-500 font-orbitron uppercase tracking-wider block">FINAL CRASH SCORE</span>
                  <span className="text-3xl font-black font-orbitron text-white leading-none">{score.toString().padStart(3, '0')}</span>
                </div>

                <button
                  onClick={() => setGameState('menu')}
                  className="flex items-center gap-2 px-8 py-3 bg-white hover:bg-neutral-250 text-black font-orbitron font-extrabold rounded-md transition-all uppercase tracking-widest text-xs shadow-[0_0_35px_rgba(255,255,255,0.2)]"
                >
                  PREPARE SLOT_0{activePlayerIndex + 1}
                </button>
              </div>
            )}

            {/* Full Tournament Medals Board */}
            {tournamentFinished && gameState !== 'playing' && (
              <div className="absolute inset-0 bg-[#020617]/95 backdrop-blur-lg rounded-lg flex flex-col items-center justify-center p-6 text-center z-30 animate-fadeIn">
                <Medal className="w-12 h-12 text-yellow-500 mb-2 animate-bounce" />
                <h2 className={`font-orbitron font-black text-2xl tracking-wider text-center uppercase filter drop-shadow-[0_2px_10px_rgba(232,121,249,0.3)] ${scoreboardSorted[0]?.score === 0 ? 'text-rose-500' : 'text-[#e879f9]'}`}>
                  {players.length === 1 
                    ? (scoreboardSorted[0]?.score === 0 ? "YOU LOOSE! TRY AGAIN! GOOD LUCK!" : "SOLO RUN COMPLETE!")
                    : (scoreboardSorted[0]?.score === 0 ? "EVERYONE SCORED 0! YOU LOOSE!" : `🏆 WINNER: ${scoreboardSorted[0]?.name}! 🏆`)}
                </h2>
                <p className="text-[10px] text-neutral-500 uppercase font-orbitron tracking-widest mb-6">
                  {players.length === 1 
                    ? "final score recorded" 
                    : "bracket pool awards standing"}
                </p>

                {/* Final Medals Standings */}
                <div className="flex flex-col gap-2.5 w-full max-w-xs mb-8">
                  {scoreboardSorted.map((p, idx) => (
                    <div 
                      key={p.id} 
                      className={`bg-[#0b1329] border ${idx === 0 && p.score > 0 ? 'border-yellow-500' : 'border-neutral-800'} px-4 py-2.5 rounded flex justify-between items-center text-xs transition-colors`}
                    >
                      <div className="flex items-center gap-2">
                        {p.score === 0 ? (
                          <span className="text-rose-500 font-bold">❌ FAIL</span>
                        ) : (
                          <>
                            {idx === 0 && <span className="text-yellow-500 font-bold">🥇 1ST</span>}
                            {idx === 1 && <span className="text-neutral-400 font-bold">🥈 2ND</span>}
                            {idx === 2 && <span className="text-amber-700 font-bold">🥉 3RD</span>}
                            {idx === 3 && <span className="text-neutral-600 font-bold">🎗️ 4TH</span>}
                          </>
                        )}
                        <span className="text-white font-semibold font-mono">{p.name} {idx === 0 && p.score > 0 && players.length > 1 && <span className="text-yellow-500 ml-1 text-[10px] uppercase">(WINNER)</span>}</span>
                      </div>
                      <span className="text-[#22d3ee] font-orbitron font-bold">{p.score} pts</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button
                    onClick={rematchSamePlayers}
                    className="w-full py-3 bg-[#e879f9] hover:bg-[#f472b6] text-black font-orbitron font-extrabold rounded-md transition-all uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(232,121,249,0.3)]"
                  >
                    REMATCH SESSION
                  </button>
                  {players.length > 1 && scoreboardSorted[0]?.score > 0 && (
                    <button
                      onClick={winnerContinuesSolo}
                      className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-orbitron font-extrabold rounded-md transition-all uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(234,179,8,0.3)]"
                    >
                      WINNER: CONTINUE SOLO
                    </button>
                  )}
                  <button
                    onClick={() => updatePlayerCount(1)}
                    className="w-full py-3 bg-transparent border border-neutral-800 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-neutral-400 hover:text-cyan-400 font-orbitron font-extrabold rounded-md transition-all uppercase tracking-widest text-[10px]"
                  >
                    START OVER / NEW SOLO
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* MOBILE D-PAD CONTROLS */}
          <div className={`w-full flex lg:hidden flex-col items-center gap-2 mt-4 transition-opacity duration-300 ${gameState === 'playing' ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
            <button 
              onPointerDown={(e) => { e.preventDefault(); handleDirection('up'); }} 
              className="p-4 bg-[#1e293b]/50 rounded-xl border border-cyan-500/30 active:bg-cyan-500/40 touch-none shadow-[0_0_15px_rgba(34,211,238,0.1)]"
            >
              <ChevronUp className="w-8 h-8 text-cyan-400" />
            </button>
            <div className="flex gap-16">
              <button 
                onPointerDown={(e) => { e.preventDefault(); handleDirection('left'); }} 
                className="p-4 bg-[#1e293b]/50 rounded-xl border border-cyan-500/30 active:bg-cyan-500/40 touch-none shadow-[0_0_15px_rgba(34,211,238,0.1)]"
              >
                <ChevronLeft className="w-8 h-8 text-cyan-400" />
              </button>
              <button 
                onPointerDown={(e) => { e.preventDefault(); handleDirection('right'); }} 
                className="p-4 bg-[#1e293b]/50 rounded-xl border border-cyan-500/30 active:bg-cyan-500/40 touch-none shadow-[0_0_15px_rgba(34,211,238,0.1)]"
              >
                <ChevronRight className="w-8 h-8 text-cyan-400" />
              </button>
            </div>
            <button 
              onPointerDown={(e) => { e.preventDefault(); handleDirection('down'); }} 
              className="p-4 bg-[#1e293b]/50 rounded-xl border border-cyan-500/30 active:bg-cyan-500/40 touch-none shadow-[0_0_15px_rgba(34,211,238,0.1)]"
            >
              <ChevronDown className="w-8 h-8 text-cyan-400" />
            </button>
          </div>
        </section>

        {/* RIGHT COLUMN: TOUR STANDINGS & ONLINE LIVE FEED */}
        <section className="lg:col-span-1 bg-[#020617]/80 border border-[#1e293b] rounded-lg p-5 flex flex-col gap-4 backdrop-blur shadow-xl">
          <div>
            <h2 className="font-orbitron text-sm font-bold uppercase text-yellow-500 tracking-widest mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-500" /> TOURNAMENT MONITORS
            </h2>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-4 font-semibold">Active Ranking Sequence Board</p>

            {/* Displaying Live Tournament Rank Order sorted */}
            <div className="flex flex-col gap-2">
              {scoreboardSorted.map((item, idx) => (
                <div 
                  key={item.id} 
                  className={`border p-2.5 rounded flex justify-between items-center text-xs ${
                    item.done ? 'border-neutral-800 bg-[#0b1329]/50' : 'border-neutral-900 bg-neutral-950/25 opacity-40'
                  }`}
                >
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-yellow-500 font-orbitron font-mono">#{idx+1}</span>
                    <span className="text-white font-semibold">{item.name}</span>
                    {idx === 0 && item.done && <Crown className="w-3.5 h-3.5 text-yellow-500 inline fill-current" />}
                  </div>
                  <span className="text-[#22d3ee] font-mono leading-none">{item.score}</span>
                </div>
              ))}
            </div>
          </div>

          <hr className="border-neutral-850" />

          {/* Quick info sheet */}
          <div className="bg-gradient-to-r from-cyan-500/5 to-pink-500/5 border border-neutral-800 rounded p-4 text-xs">
            <h3 className="font-orbitron font-bold text-[#22d3ee] mb-1 text-[11px] uppercase tracking-wider">TARGET CHANCE: FOOD SPINS</h3>
            <p className="text-neutral-400 font-mono text-[10px]">
              Fierce targets spawn custom spinning items (🍕, 🍔, 🥘). Collect them repeatedly to charge your multiplier meter index and advance through 9 dynamic stages up to the <strong className="text-rose-500">FINAL APEX</strong>!
            </p>
          </div>
        </section>

      </main>

      {/* FOOTER METRICS */}
      <footer className="border-t border-[#1e293b] py-3 bg-[#020617] px-6 flex justify-between items-center text-[10px] text-neutral-600 font-semibold tracking-widest font-mono uppercase">
        <div>TOURNAMENT_POOL: STAGE_01_OK</div>
        <div>Developed by Abdul Ahad - Aim Architect.</div>
      </footer>
    </div>
  );
}
