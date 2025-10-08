"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Trash2 } from "lucide-react";
import { Share } from "lucide-react";

type Player = { id: string; name: string };
type Phase = "search" | "play";
type GameState = {
  players: Player[];
  hasStarted: boolean;
  phase: Phase;
  trimanIndex: number | null;
  currentIndex: number;
  roundOrder: number[];
  roundCursor: number;
  dice: [number, number] | null;
  messages: string[];
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pluralizeGorgees(count: number): string {
  return `gorgée${count > 1 ? "s" : ""}`;
}

function bolding(name: string): string {
  return `<strong>${name}</strong>`;
}

// Composant d'animation de dés avec changement de valeurs
function AnimatedDice({ value, isAnimating, delay = 0, istotal, diceIndex, diceValues, phase }: { 
  value: number | null; 
  isAnimating: boolean; 
  delay?: number; 
  istotal?: boolean;
  diceIndex?: number;
  diceValues?: [number, number] | null;
  phase?: "search" | "play";
}) {
  const [displayValue, setDisplayValue] = useState<number>(1);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Nettoyer les animations précédentes
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (value === null) {
      setDisplayValue(1);
      return;
    }

    if (!isAnimating) {
      setDisplayValue(value);
      return;
    }

    // Démarrer l'animation après le délai
    const startAnimation = () => {
      // Intervalle pour changer les valeurs rapidement
      intervalRef.current = setInterval(() => {
        const randomValue = Math.floor(Math.random() * 6) + 1;
        setDisplayValue(randomValue);
      }, 50);

      // Arrêter l'animation et afficher la vraie valeur après 1.5s
      timeoutRef.current = setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setDisplayValue(value);
      }, 1000);
    };

    // Démarrer l'animation avec le délai
    if (delay > 0) {
      timeoutRef.current = setTimeout(startAnimation, delay);
    } else {
      startAnimation();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, isAnimating, delay]);

  // Fonction pour déterminer si un dé doit être rouge
  const shouldBeRed = () => {
    if (!diceValues || diceIndex === undefined || isAnimating) return false;
    
    const [d1, d2] = diceValues;
    const sum = d1 + d2;
    
    // En phase 1 (recherche du Triman) : seuls les 3 deviennent rouges
    if (phase === "search") {
      return value === 3 || sum === 3;
    }
    
    // En phase 2 (jeu avec le Triman) : toutes les règles s'appliquent
    if (phase === "play") {
      // Règle du 3 : si le dé est un 3 OU si la somme fait 3
      if (value === 3 || sum === 3) return true;
      
      // Double : si les deux dés sont identiques
      if (d1 === d2) return true;
      
      // Règles des sommes spéciales (9, 10, 11)
      if (sum === 9 || sum === 10 || sum === 11) return true;
    }
    
    return false;
  };

  const isRed = shouldBeRed();

  // Spécifique à la tuile TOTAL: devient rouge quand la somme déclenche une règle
  const shouldTotalBeRed = () => {
    if (!istotal) return false;
    if (!diceValues || isAnimating) return false;
    const [d1, d2] = diceValues;
    const sum = d1 + d2;
    if (phase === "search") return sum === 3; // phase 1: seulement somme==3
    if (phase === "play") return sum === 9 || sum === 10 || sum === 11 || sum === 3; // phase 2: 9/10/11 (et 3)
    return false;
  };
  const isTotalRed = shouldTotalBeRed();

  if (!istotal) {return (
    <div 
      className="relative w-16 h-16 bg-white border-2 border-gray-300 rounded-lg shadow-lg flex items-center justify-center text-2xl font-bold"
      style={{
        backgroundColor: isRed ? '#fef2f2' : 'white',
        borderColor: isRed ? '#7e22ce' : '#d1d5db',
        color: isRed ? '#7e22ce' : '#1f2937',
        transition: 'all 0.3s ease'
      }}
    >
      <div className="text-3xl font-extrabold">
        {displayValue}
      </div>
    </div>
  );} else {return (
    <div 
      className="relative w-16 h-16 bg-white border-2 border-gray-300 rounded-lg shadow-lg flex items-center justify-center text-2xl font-bold"
      style={{
        backgroundColor: isTotalRed ? '#fef2f2' : 'white',
        borderColor: isTotalRed ? '#7e22ce' : '#d1d5db',
        color: isTotalRed ? '#7e22ce' : '#1f2937',
        transition: 'all 0.3s ease'
      }}
    >
      <div className="text-3xl font-extrabold">
        {displayValue}
      </div>
    </div>
  )}
}

function HomeInner() {
  const searchParams = useSearchParams();
  const roomIdFromUrl = (searchParams?.get("room") as string | null) || "default";
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("search");
  const [trimanIndex, setTrimanIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [roundOrder, setRoundOrder] = useState<number[]>([]);
  const [roundCursor, setRoundCursor] = useState<number>(0);
  const [dice, setDice] = useState<[number, number] | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const localPlayerStoredRef = useRef<Player | null>(null);
  const [roomInput, setRoomInput] = useState<string>("");
  const [canShare, setCanShare] = useState<boolean>(false);
  const [copyOk, setCopyOk] = useState<boolean>(false);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const [isDiceAnimating, setIsDiceAnimating] = useState<boolean>(false);
  const [diceAnimationId, setDiceAnimationId] = useState<string | null>(null);
  

  // Socket.IO client
  const socketRef = useRef<Socket | null>(null);
  const applyRollRef = useRef<(d1: number, d2: number) => void>(() => {});
  const stateRef = useRef<GameState>({
    players: [],
    hasStarted: false,
    phase: "search",
    trimanIndex: null,
    currentIndex: 0,
    roundOrder: [],
    roundCursor: 0,
    dice: null,
    messages: [],
  });
  // IDs récemment supprimés depuis cet appareil (pour éviter réapparition)
  const suppressedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      try {
        // Assure l'initialisation du serveur Socket.IO côté API avant de se connecter
        await fetch("/api/socket");
      } catch {
        // ignore
      }
      if (cancelled) return;
      const socket = io({ path: "/api/socketio" });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("room:join", roomIdFromUrl);
        socket.emit("state:request", { requesterId: socket.id });
        // Si nous avons un joueur local (après refresh ou si seul dans la room), on le ré-annonce
        const lp = localPlayerStoredRef.current;
        if (lp && !suppressedIdsRef.current.has(lp.id)) {
          setPlayers((prev) => (prev.some((p) => p.id === lp.id) ? prev : [...prev, lp]));
          socket.emit("player:add", lp);
        }
      });

      // Listeners: players
      socket.on("player:add", (payload: Player) => {
        if (suppressedIdsRef.current.has(payload.id)) return; // ignore réapparition
        setPlayers((prev) => (prev.some((p) => p.id === payload.id) ? prev : [...prev, payload]));
      });
      socket.on("player:remove", (payload: { id: string }) => {
        setPlayers((prev) => prev.filter((p) => p.id !== payload.id));
        if (payload.id === localPlayerId) {
          // si suppression distante de mon joueur, on nettoie localement aussi
          setLocalPlayerId(null);
          localPlayerStoredRef.current = null;
          try { localStorage.removeItem(`room:${roomIdFromUrl}:player`); } catch {}
        }
      });
      socket.on("player:update", (payload: Player) => {
        setPlayers((prev) => prev.map((p) => (p.id === payload.id ? payload : p)));
      });

      // Listeners: game lifecycle
      socket.on("game:start", () => {
        setHasStarted(true);
        setPhase("search");
        setTrimanIndex(null);
        setCurrentIndex(0);
        setRoundOrder([]);
        setRoundCursor(0);
        setDice(null);
        setMessages([]);
      });
      socket.on("game:reset", () => {
        setHasStarted(false);
        setPhase("search");
        setTrimanIndex(null);
        setCurrentIndex(0);
        setRoundOrder([]);
        setRoundCursor(0);
        setDice(null);
        setMessages([]);
        // on garde le joueur local pour rejouer sans recréer
      });

      // Listeners: dice
      socket.on("dice:roll", (payload: { d1: number; d2: number; meta?: string; animationId?: string }) => {
        if (payload.animationId) {
          setDiceAnimationId(payload.animationId);
          setIsDiceAnimating(true);
          // Démarrer l'animation avec un délai pour la synchronisation
          setTimeout(() => {
            applyRollRef.current(payload.d1, payload.d2);
            // Arrêter l'animation après 1.5s
            setTimeout(() => {
              setIsDiceAnimating(false);
              setDiceAnimationId(null);
            }, 1000);
          }, 100); // Petit délai pour synchroniser l'animation
        } else {
          applyRollRef.current(payload.d1, payload.d2);
        }
      });

      // Listener pour l'animation de dés
      socket.on("dice:animate", (payload: { animationId: string }) => {
        setDiceAnimationId(payload.animationId);
        setIsDiceAnimating(true);
        // Arrêter l'animation après 1.5s
        setTimeout(() => {
          setIsDiceAnimating(false);
          setDiceAnimationId(null);
        }, 1000);
      });

      // State sync
      socket.on("state:request", (payload: { requesterId: string }) => {
        const target = payload?.requesterId;
        if (!target) return;
        const state: GameState = stateRef.current;
        socket.emit("state:update", { to: target, state });
      });

      socket.on("state:update", (payload: { state: GameState }) => {
        const s = payload?.state;
        if (!s) return;
      // Merge: ensure we keep our local player if it's missing from incoming state
      const incomingPlayers = Array.isArray(s.players) ? s.players : [];
      let mergedPlayers = incomingPlayers;
      if (localPlayerId && !suppressedIdsRef.current.has(localPlayerId)) {
        const hasLocalInIncoming = incomingPlayers.some((p: Player) => p.id === localPlayerId);
        if (!hasLocalInIncoming) {
          const localInCurrent = stateRef.current.players.find((p) => p.id === localPlayerId);
          if (localInCurrent) {
            mergedPlayers = [...incomingPlayers, localInCurrent];
          }
        }
      }
      setPlayers(mergedPlayers);
      // Auto-claim sur mobile après refresh: si aucun joueur local, mais un joueur enregistré par nom existe dans la liste → on le revendique
      if (!localPlayerId && localPlayerStoredRef.current) {
        const byName = mergedPlayers.find((p) => p.name === localPlayerStoredRef.current!.name);
        if (byName) {
          setLocalPlayerId(byName.id);
          localPlayerStoredRef.current = byName;
          try { localStorage.setItem(`room:${roomIdFromUrl}:player`, JSON.stringify(byName)); } catch {}
        }
      }
        setHasStarted(!!s.hasStarted);
        setPhase(s.phase ?? "search");
        setTrimanIndex(s.trimanIndex ?? null);
        setCurrentIndex(s.currentIndex ?? 0);
        setRoundOrder(s.roundOrder ?? []);
        setRoundCursor(s.roundCursor ?? 0);
        setDice(s.dice ?? null);
        setMessages(s.messages ?? []);
      });
    };
    setup();

    return () => {
      cancelled = true;
      const s = socketRef.current;
      if (s) {
        s.disconnect();
      }
      socketRef.current = null;
    };
  }, [roomIdFromUrl, localPlayerId]);

  // Charger le joueur local (id+name) depuis localStorage pour cette room
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`room:${roomIdFromUrl}:player`);
      if (stored) {
        const parsed = JSON.parse(stored) as Player;
        localPlayerStoredRef.current = parsed;
        setLocalPlayerId(parsed.id);
      } else {
        localPlayerStoredRef.current = null;
        setLocalPlayerId(null);
      }
    } catch {
      setLocalPlayerId(null);
    }
    setRoomInput(roomIdFromUrl || "");
  }, [roomIdFromUrl]);

  // Keep a stable ref to the latest applyRoll implementation
  // (will be set after applyRoll definition below)

  const currentPlayer = useMemo(() => {
    if (players.length === 0) return null;
    return players[currentIndex % players.length];
  }, [players, currentIndex]);

  const triman = useMemo(() => {
    if (trimanIndex == null) return null;
    return players[trimanIndex] ?? null;
  }, [players, trimanIndex]);

  const localPlayer = useMemo(() => {
    return localPlayerId ? players.find((p) => p.id === localPlayerId) ?? null : null;
  }, [players, localPlayerId]);

  function addPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;
    if (localPlayerId) return; // un seul joueur par client
    const newP = { id: generateId(), name };
    setPlayers((prev) => [...prev, newP]);
    socketRef.current?.emit("player:add", newP);
    setNewPlayerName("");
    setLocalPlayerId(newP.id);
    localPlayerStoredRef.current = newP;
    try { localStorage.setItem(`room:${roomIdFromUrl}:player`, JSON.stringify(newP)); } catch {}
  }

  function removePlayer(id: string) {
    if (hasStarted) return; // on bloque la modification pendant la partie
    if (id !== localPlayerId) return; // ne peut supprimer que son propre joueur
    suppressedIdsRef.current.add(id);
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    socketRef.current?.emit("player:remove", { id });
    setCurrentIndex(0);
    setLocalPlayerId(null);
    localPlayerStoredRef.current = null;
    try { localStorage.removeItem(`room:${roomIdFromUrl}:player`); } catch {}
  }

  function updatePlayerName(id: string, name: string) {
    if (hasStarted) return;
    if (id !== localPlayerId) return; // ne peut renommer que son propre joueur
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    socketRef.current?.emit("player:update", { id, name });
    // persister le nom localement
    if (localPlayerStoredRef.current && localPlayerStoredRef.current.id === id) {
      localPlayerStoredRef.current = { ...localPlayerStoredRef.current, name };
      try { localStorage.setItem(`room:${roomIdFromUrl}:player`, JSON.stringify(localPlayerStoredRef.current)); } catch {}
    }
  }

  function claimPlayer(player: Player) {
    setLocalPlayerId(player.id);
    localPlayerStoredRef.current = player;
    try { localStorage.setItem(`room:${roomIdFromUrl}:player`, JSON.stringify(player)); } catch {}
  }

  function resetGame() {
    setHasStarted(false);
    setPhase("search");
    setTrimanIndex(null);
    setCurrentIndex(0);
    setRoundOrder([]);
    setRoundCursor(0);
    setDice(null);
    setMessages([]);
    socketRef.current?.emit("game:reset");
  }

  function startGame() {
    if (players.length < 2) return;
    setHasStarted(true);
    setPhase("search");
    setTrimanIndex(null);
    setCurrentIndex(0);
    setRoundOrder([]);
    setRoundCursor(0);
    setDice(null);
    setMessages([]);
    socketRef.current?.emit("game:start");
  }

  function computeRoundOrderForTriman(tIndex: number, total: number): number[] {
    const order: number[] = [];
    for (let i = 1; i < total; i += 1) {
      order.push((tIndex + i) % total);
    }
    order.push(tIndex);
    return order;
  }

  const evaluatePhase2Roll = useCallback((d1: number, d2: number): string[] => {
    if (!currentPlayer || !triman) return [];
    const totalPlayers = players.length;
    const outcomes: string[] = [];

    const sum = d1 + d2;
    let threeRuleCount = 0;
    if (d1 === 3) threeRuleCount += 1;
    if (d2 === 3) threeRuleCount += 1;
    if (sum === 3) threeRuleCount += 1;
    if (threeRuleCount > 0) {
      outcomes.push(`${bolding(triman.name)} boit ${threeRuleCount} ${pluralizeGorgees(threeRuleCount)} (règle du 3).`);
    }

    if (d1 === d2) {
      outcomes.push(`${bolding(currentPlayer.name)} distribue ${d1} ${pluralizeGorgees(d1)} (double ${d1}).`);
    }

    if (sum === 9) {
      const leftIndex = (currentIndex - 1 + totalPlayers) % totalPlayers;
      outcomes.push(`${bolding(players[leftIndex].name)} boit 1 ${pluralizeGorgees(1)} (règle du 9).`);
    }
    if (sum === 10) {
      outcomes.push(`${bolding(currentPlayer.name)} boit 1 ${pluralizeGorgees(1)} (règle du 10).`);
    }
    if (sum === 11) {
      const rightIndex = (currentIndex + 1) % totalPlayers;
      outcomes.push(`${bolding(players[rightIndex].name)} boit 1 ${pluralizeGorgees(1)} (règle du 11).`);
    }

    return outcomes.length > 0 ? outcomes : ["Aucune règle ne s'applique."];
  }, [currentPlayer, triman, players, currentIndex]);

  const applyRoll = useCallback((d1: number, d2: number) => {
    setDice([d1, d2]);

    if (phase === "search") {
      const foundTriman = d1 === 3 || d2 === 3 || d1 + d2 === 3;
      if (foundTriman) {
        if (!currentPlayer) return; // guard
        const newMessages = [`${bolding(currentPlayer.name)} devient Triman et boit 1 ${pluralizeGorgees(1)}.`];
        const tIndex = currentIndex;
        const n = players.length;
        const order = computeRoundOrderForTriman(tIndex, n);
        
        // Attendre la fin de l'animation pour révéler le Triman
        setTimeout(() => {
          setTrimanIndex(tIndex);
          setPhase("play");
          setRoundOrder(order);
          setRoundCursor(0);
          setMessages(newMessages);
          setCurrentIndex(order[0]);
        }, 1000); // Attendre la fin de l'animation (1s)
      } else {
        setMessages(["Pas de 3 → on passe au joueur suivant."]);
        setCurrentIndex((prev) => (prev + 1) % players.length);
      }
      return;
    }

    if (phase === "play") {
      const newMessages = evaluatePhase2Roll(d1, d2);
      setMessages(newMessages);

      const noAction = newMessages.length === 1 && newMessages[0] === "Aucune règle ne s'applique.";
      if (noAction) {
        const nextCursor = roundCursor + 1;
        if (nextCursor < roundOrder.length) {
          setRoundCursor(nextCursor);
          setCurrentIndex(roundOrder[nextCursor]);
        } else {
          const lastTrimanIndex = trimanIndex ?? 0;
          const n = players.length;
          const nextStart = (lastTrimanIndex + 1) % n;
          setTrimanIndex(null);
          setPhase("search");
          setRoundOrder([]);
          setRoundCursor(0);
          setCurrentIndex(nextStart);
        }
      } else {
        // Il y a une action → le joueur actuel rejoue, on ne change pas d'index ni de curseur
      }
    }
  }, [phase, currentPlayer, currentIndex, players, roundCursor, roundOrder, trimanIndex, evaluatePhase2Roll]);

  // Mirror local state into a ref for stable access from listeners
  useEffect(() => {
    stateRef.current = {
      players,
      hasStarted,
      phase,
      trimanIndex,
      currentIndex,
      roundOrder,
      roundCursor,
      dice,
      messages,
    };
  }, [players, hasStarted, phase, trimanIndex, currentIndex, roundOrder, roundCursor, dice, messages]);

  // Now that applyRoll exists, sync the ref to latest implementation
  useEffect(() => {
    applyRollRef.current = applyRoll;
  }, [applyRoll]);

  // URL de la room et capacités de partage
  const roomUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${location.origin}/?room=${encodeURIComponent(roomIdFromUrl)}`;
  }, [roomIdFromUrl]);

  useEffect(() => {
    try {
      const hasNavigator = typeof navigator !== "undefined";
      const supportsShare = hasNavigator && "share" in navigator;
      const supportsCanShare = hasNavigator && "canShare" in navigator;
      const secure = typeof window !== "undefined" ? window.isSecureContext : false;
      let ok = supportsShare && secure;
      // Si canShare existe, valide le partage d'une URL
      if (ok && supportsCanShare) {
        try {
          ok = (navigator as Navigator & { canShare: (data: ShareData) => boolean }).canShare({ url: window.location?.href || "" });
        } catch {
          // ignore, garde ok
        }
      }
      setCanShare(!!ok);
    } catch {
      setCanShare(false);
    }
  }, []);

  // Nettoyage du timeout d'état "copié"
  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        window.clearTimeout(copyResetTimeoutRef.current);
        copyResetTimeoutRef.current = null;
      }
    };
  }, []);

  async function copyTextToClipboard(text: string): Promise<boolean> {
    // Tentative moderne
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback iOS/Android anciens: execCommand
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
      } catch {
        return false;
      }
    }
  }

  const handleCopyLink = useCallback(async () => {
    if (!roomUrl) return;
    const ok = await copyTextToClipboard(roomUrl);
    if (ok) {
      setCopyOk(true);
      if (copyResetTimeoutRef.current) window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopyOk(false);
        copyResetTimeoutRef.current = null;
      }, 2000);
    }
  }, [roomUrl]);

  const handleShare = useCallback(() => {
    if (!roomUrl) return;
    if (typeof navigator === "undefined") return;
    if ("share" in navigator) {
      const navWithShare = navigator as Navigator & { share: (data: ShareData) => Promise<void> };
      navWithShare
        .share({ title: "Triman", text: "Rejoins ma salle Triman", url: roomUrl })
        .catch(() => {});
    }
  }, [roomUrl]);
  

  

  function rollDice() {
    if (!hasStarted || players.length < 2 || !currentPlayer) return;
    // Guard: seul le joueur courant peut lancer depuis ce client
    if (!localPlayerId || currentPlayer.id !== localPlayerId) return;
    
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const animationId = `dice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    console.log('🎲 Démarrage animation:', { animationId, d1, d2 });
    
    // Démarrer l'animation localement
    setDiceAnimationId(animationId);
    setIsDiceAnimating(true);
    
    // Envoyer l'animation à tous les joueurs
    socketRef.current?.emit("dice:animate", { animationId });
    
    // Envoyer le résultat après un délai pour synchroniser avec l'animation
    setTimeout(() => {
      console.log('🎲 Envoi résultat:', { d1, d2 });
      socketRef.current?.emit("dice:roll", { d1, d2, animationId });
      applyRoll(d1, d2);
      
      // Arrêter l'animation après 1.5s
      setTimeout(() => {
        console.log('🎲 Fin animation');
        setIsDiceAnimating(false);
        setDiceAnimationId(null);
      }, 1000);
    }, 100);
  }

  return (
    <div className="font-sans min-h-screen p-4 sm:p-6 md:p-8 bg-transparent text-neutral-900 dark:text-neutral-100">
      <main className="container-responsive w-full flex flex-col gap-5 sm:gap-6 overflow-x-hidden">
        <h1 className="text-3xl font-extrabold tracking-tight text-center">Triman</h1>

          <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur p-3 sm:p-4 md:p-5 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Salle</h2>
          <div className="flex gap-2 items-center">
            <input
              className="flex-1 min-w-0 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 outline-none text-sm sm:text-base ellipsis"
              placeholder="ID de la room (ex: party1)"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
            />
            <button
              className="touch-target rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
              onClick={() => {
                const id = roomInput.trim() || `room-${Math.random().toString(36).slice(2,8)}`;
                router.push(`/?room=${encodeURIComponent(id)}`);
              }}
            >
              Rejoindre
            </button>
            <button
              className="touch-target rounded-md bg-purple-600 text-white px-3 sm:px-4 py-2 text-sm font-medium hover:bg-purple-700 shrink-0"
              onClick={() => {
                const id = `room-${Math.random().toString(36).slice(2,8)}`;
                router.push(`/?room=${encodeURIComponent(id)}`);
                setRoomInput(id);
              }}
            >
              Créer
            </button>
          </div>
          {roomIdFromUrl && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400 ">Room actuelle: <span className="font-semibold">{roomIdFromUrl}</span></span>
              <div className="flex items-center gap-2">
                {canShare && (
                  <button
                    className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onClick={handleShare}
                  >
                  <Share size={18} className=" " />

                  </button>
                )}
                <button
                  className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={handleCopyLink}
                  style={{fontSize: "14px"}}
                >
                  {copyOk ? "Lien copié" : "Copier le lien"}
                </button>
              </div>
              {/* Annonce discrète pour lecteurs d'écran */}
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {copyOk ? "Lien copié dans le presse-papiers" : ""}
              </span>
            </div>
          )}
        </section>

        {!hasStarted ? (
          <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur p-3 sm:p-4 md:p-5 flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Joueurs</h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="flex-1 min-w-0 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-400 text-sm sm:text-base ellipsis"
                placeholder="Pseudo du joueur"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addPlayer();
                }}
                disabled={!!localPlayerId}
              />
              <button
                className="touch-target rounded-md bg-purple-600 text-white px-3 sm:px-4 py-2 font-medium hover:bg-purple-700 disabled:opacity-50 w-full sm:w-auto shrink-0"
                onClick={addPlayer}
                disabled={!newPlayerName.trim() || !!localPlayerId}
              >
                Ajouter
              </button>
            </div>

            {players.length > 0 && (
              <ul className="flex flex-col gap-2">
                {players.map((p, idx) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="text-sm text-neutral-400 font-bold w-6 text-right">{idx + 1}.</span>
                    <input
                      className="flex-1 min-w-0 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 outline-none text-sm sm:text-base"
                      value={p.name}
                      onChange={(e) => updatePlayerName(p.id, e.target.value)}
                      disabled={p.id !== localPlayerId}
                    />
                    {p.id !== localPlayerId && (
                      <button
                        className="text-xs px-2 py-1 rounded-md border border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 shrink-0"
                        onClick={() => claimPlayer(p)}
                        aria-label={`Assigner ${p.name} à cet appareil`}
                      >
                        C&#39;est moi
                      </button>
                    )}
                    <button
                      className="touch-target rounded-md  bg-red-700 text-white p-2 sm:p-2.5 shadow hover:bg-red-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center"
                      onClick={() => removePlayer(p.id)}
                      aria-label={`Supprimer ${p.name}`}
                      disabled={p.id !== localPlayerId}
                    >
                      <Trash2 size={16} className="sm:hidden" />
                      <Trash2 size={18} className="hidden sm:block " />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mt-2">
              <span className="text-xs text-neutral-400">
                {localPlayer ? `Mon joueur: ${localPlayer.name}` : "Aucun joueur revendiqué"}
              </span>
              <button
                className="touch-target rounded-md bg-red-700 text-white px-3 py-2 text-xs sm:text-sm font-medium shadow hover:bg-red-800 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto inline-flex items-center gap-2 justify-center"
                onClick={() => {
                  if (localPlayerId) removePlayer(localPlayerId);
                }}
                disabled={!localPlayerId}
              >
                <Trash2 size={16} />
                <span className="hidden sm:inline">Supprimer mon joueur</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <span className="text-sm text-neutral-400">{players.length} joueur(s)</span>
              <button
                className="touch-target rounded-md bg-green-600 text-white px-3 sm:px-4 py-2 font-semibold hover:bg-green-700 disabled:opacity-50 w-full sm:w-auto"
                onClick={startGame}
                disabled={players.length < 2}
              >
                Démarrer la partie
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-col"> 
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-neutral-400 font-bold">Phase</span>
                  <span className="font-semibold">{phase === "search" ? "Phase 1 · Recherche du Triman" : "Phase 2 · Jeu avec le Triman"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-neutral-400 font-bold">Triman</span>
                  <span className="font-semibold">{triman ? triman.name : "À trouver"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-neutral-400 font-bold">Joueur actuel</span>
                  <span className="font-semibold">{currentPlayer?.name}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 items-end">
                  <div className="col-span-1 text-center">
                    <div className="flex flex-col items-center mt-2">
                    <span className="col-span-1 text-xs uppercase tracking-wide text-neutral-400 font-bold mb-3">Dé 1</span>
                     <AnimatedDice 
                       value={dice ? dice[0] : null} 
                       isAnimating={isDiceAnimating}
                       delay={0}
                       diceIndex={0}
                       diceValues={dice}
                       phase={phase}
                     />
                    </div>
  
                    {/* {isDiceAnimating && (
                      <div className="text-xs text-purple-600 font-bold mt-1 animate-pulse">
                        🎲 Animation...
                      </div>
                    )} */}
                  </div>
                  <div className="col-span-1 text-center">
                    <div className="flex flex-col justify-center items-center mt-2">
                    <span className="col-span-1 text-xs uppercase tracking-wide text-neutral-400 font-bold mb-3">Total</span>
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-purple-200 border-2 border-purple-300 rounded-lg shadow-lg flex items-center justify-center">
                      <div className="text-3xl font-extrabold text-purple-700">
                        <span className="text-purple-700">
                          <AnimatedDice 
                            value={dice ? dice[0] + dice[1] : null} 
                            isAnimating={isDiceAnimating}
                            istotal={true}
                            delay={100}
                            diceValues={dice}
                            phase={phase}
                          />
                        </span>
                      </div>
                    </div>
                      <button
                        className="touch-target rounded-lg bg-purple-600 text-white px-4 py-3 font-bold text-sm hover:bg-purple-700 disabled:opacity-50 mt-3"
                        onClick={rollDice}
                        disabled={!hasStarted || !localPlayerId || currentPlayer?.id !== localPlayerId || isDiceAnimating}
                        title={diceAnimationId ? `Animation: ${diceAnimationId}` : undefined}
                      >
                        {isDiceAnimating ? "🎲 Lancement..." : "Lancer les dés"}
                      </button>
                    </div>
                  </div>
                  
                  <div className="col-span-1 text-center">
                    <div className="flex flex-col justify-center items-center mt-2">
                    <span className="col-span-1 text-xs uppercase tracking-wide text-neutral-400 font-bold mb-3">Dé 2</span>
                     <AnimatedDice 
                       value={dice ? dice[1] : null} 
                       isAnimating={isDiceAnimating}
                       delay={50}
                       diceIndex={1}
                       diceValues={dice}
                       phase={phase}
                     />
                    </div>
                    {/* {isDiceAnimating && (
                      <div className="text-xs text-purple-600 font-bold mt-1 animate-pulse">
                        🎲 Animation...
                      </div>
                    )} */}
                  </div>
              </div>
            </div>
            {/* <div className="grid grid-cols-3 gap-3 items-center m-auto w-90">
                <span className="col-span-1 text-xs uppercase tracking-wide text-neutral-400 font-bold">Dé 1</span>
                <div className="col-span-1"></div>
                <span className="col-span-1 text-xs uppercase tracking-wide text-neutral-400 font-bold">Dé 2</span>

            </div> */}
              

            <div className="glass-card p-3">
              <h3 className="text-sm font-semibold mb-2">Résultat</h3>
              {isDiceAnimating && (
                <div className="text-sm text-purple-400 font-bold mt-1 animate-pulse">
                  🎲 Animation...
                </div>
              )}
              { !isDiceAnimating && (
                <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
                  {messages.map((m, i) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: m }} />
                  ))}
                </ul>
              )}
            </div>

            <div className="glass-card p-3">
              <h3 className="text-sm font-semibold mb-2">Ordre des joueurs</h3>
              <ul className="flex flex-wrap gap-2">
                {players.map((p, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isTriman = trimanIndex === idx;
                  
                  return (
                    <li
                      key={p.id}
                      className={`px-3 py-1 rounded-full text-sm border ${isCurrent ? "bg-green-600 text-white border-green-700" : isTriman ? "bg-amber-500 text-white border-amber-600" : "bg-white dark:bg-neutral-800 border-black/10 dark:border-white/10"}`}
                      title={isCurrent ? "Joueur actuel" : isTriman ? "Triman" : undefined}
                    >
                      {p.name}
                    </li>
                  );
                  
                })}
              </ul>
            </div>

            <div className="flex justify-end">
              <button
                className="touch-target rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={resetGame}
              >
                Réinitialiser
              </button>
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-neutral-400 font-bold mt-2">
          Idéal sur mobile. Jouez responsable 🥂
        </footer>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
