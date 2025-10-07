"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

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
      socket.on("dice:roll", (payload: { d1: number; d2: number; meta?: string }) => {
        applyRollRef.current(payload.d1, payload.d2);
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
      outcomes.push(`${triman.name} boit ${threeRuleCount} ${pluralizeGorgees(threeRuleCount)} (règle du 3).`);
    }

    if (d1 === d2) {
      outcomes.push(`${currentPlayer.name} distribue ${d1} ${pluralizeGorgees(d1)} (double ${d1}).`);
    }

    if (sum === 9) {
      const leftIndex = (currentIndex - 1 + totalPlayers) % totalPlayers;
      outcomes.push(`${players[leftIndex].name} boit 1 ${pluralizeGorgees(1)} (règle du 9).`);
    }
    if (sum === 10) {
      outcomes.push(`${currentPlayer.name} boit 1 ${pluralizeGorgees(1)} (règle du 10).`);
    }
    if (sum === 11) {
      const rightIndex = (currentIndex + 1) % totalPlayers;
      outcomes.push(`${players[rightIndex].name} boit 1 ${pluralizeGorgees(1)} (règle du 11).`);
    }

    return outcomes.length > 0 ? outcomes : ["Aucune règle ne s'applique."];
  }, [currentPlayer, triman, players, currentIndex]);

  const applyRoll = useCallback((d1: number, d2: number) => {
    setDice([d1, d2]);

    if (phase === "search") {
      const foundTriman = d1 === 3 || d2 === 3 || d1 + d2 === 3;
      if (foundTriman) {
        if (!currentPlayer) return; // guard
        const newMessages = [`${currentPlayer.name} devient Triman et boit 1 ${pluralizeGorgees(1)}.`];
        const tIndex = currentIndex;
        const n = players.length;
        const order = computeRoundOrderForTriman(tIndex, n);
        setTrimanIndex(tIndex);
        setPhase("play");
        setRoundOrder(order);
        setRoundCursor(0);
        setMessages(newMessages);
        setCurrentIndex(order[0]);
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

  

  function rollDice() {
    if (!hasStarted || players.length < 2 || !currentPlayer) return;
    // Guard: seul le joueur courant peut lancer depuis ce client
    if (!localPlayerId || currentPlayer.id !== localPlayerId) return;
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    socketRef.current?.emit("dice:roll", { d1, d2 });
    applyRoll(d1, d2);
  }

  return (
    <div className="font-sans min-h-screen p-6 sm:p-10 bg-gradient-to-b from-pink-50 to-purple-100 dark:from-neutral-900 dark:to-neutral-950 text-neutral-900 dark:text-neutral-100">
      <main className="max-w-xl mx-auto w-full flex flex-col gap-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-center">Triman</h1>

        <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur p-4 sm:p-5 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Salle</h2>
          <div className="flex gap-2 items-center">
            <input
              className="flex-1 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 outline-none"
              placeholder="ID de la room (ex: party1)"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
            />
            <button
              className="rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => {
                const id = roomInput.trim() || `room-${Math.random().toString(36).slice(2,8)}`;
                router.push(`/?room=${encodeURIComponent(id)}`);
              }}
            >
              Rejoindre
            </button>
            <button
              className="rounded-md bg-purple-600 text-white px-4 py-2 text-sm font-medium hover:bg-purple-700"
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
              <span className="text-neutral-600">Room actuelle: <span className="font-semibold">{roomIdFromUrl}</span></span>
              <button
                className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${location.origin}/?room=${encodeURIComponent(roomIdFromUrl)}`);
                  } catch {}
                }}
              >
                Copier le lien
              </button>
            </div>
          )}
        </section>

        {!hasStarted ? (
          <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur p-4 sm:p-5 flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Joueurs</h2>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="Pseudo du joueur"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addPlayer();
                }}
                disabled={!!localPlayerId}
              />
              <button
                className="rounded-md bg-purple-600 text-white px-4 py-2 font-medium hover:bg-purple-700 disabled:opacity-50"
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
                    <span className="text-sm text-neutral-500 w-6 text-right">{idx + 1}.</span>
                    <input
                      className="flex-1 rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 outline-none"
                      value={p.name}
                      onChange={(e) => updatePlayerName(p.id, e.target.value)}
                      disabled={p.id !== localPlayerId}
                    />
                    {p.id !== localPlayerId && (
                      <button
                        className="text-xs px-2 py-1 rounded-md border border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        onClick={() => claimPlayer(p)}
                        aria-label={`Assigner ${p.name} à cet appareil`}
                      >
                        C&#39;est moi
                      </button>
                    )}
                    <button
                      className="text-xs px-2 py-1 rounded-md border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => removePlayer(p.id)}
                      aria-label={`Supprimer ${p.name}`}
                      disabled={p.id !== localPlayerId}
                    >
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-neutral-600">
                {localPlayer ? `Mon joueur: ${localPlayer.name}` : "Aucun joueur revendiqué"}
              </span>
              <button
                className="text-xs px-2 py-1 rounded-md border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                onClick={() => {
                  if (localPlayerId) removePlayer(localPlayerId);
                }}
                disabled={!localPlayerId}
              >
                Supprimer mon joueur
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">{players.length} joueur(s)</span>
              <button
                className="rounded-md bg-green-600 text-white px-4 py-2 font-semibold hover:bg-green-700 disabled:opacity-50"
                onClick={startGame}
                disabled={players.length < 2}
              >
                Démarrer la partie
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-neutral-500">Phase</span>
                <span className="font-semibold">{phase === "search" ? "Phase 1 · Recherche du Triman" : "Phase 2 · Jeu avec le Triman"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-neutral-500">Triman</span>
                <span className="font-semibold">{triman ? triman.name : "À trouver"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-neutral-500">Joueur actuel</span>
                <span className="font-semibold">{currentPlayer?.name}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 items-center">
              <div className="col-span-1 text-center">
                <span className="text-xs uppercase tracking-wide text-neutral-500">Dé 1</span>
                <div className="text-3xl font-extrabold mt-1">{dice ? dice[0] : "-"}</div>
              </div>
              <button
                className="col-span-1 rounded-lg bg-purple-600 text-white px-4 py-3 font-bold text-sm hover:bg-purple-700 disabled:opacity-50"
                onClick={rollDice}
                disabled={!hasStarted || !localPlayerId || currentPlayer?.id !== localPlayerId}
              >
                Lancer les dés
              </button>
              <div className="col-span-1 text-center">
                <span className="text-xs uppercase tracking-wide text-neutral-500">Dé 2</span>
                <div className="text-3xl font-extrabold mt-1">{dice ? dice[1] : "-"}</div>
              </div>
            </div>

            <div className="rounded-md bg-neutral-100 dark:bg-neutral-800 p-3">
              <h3 className="text-sm font-semibold mb-2">Résultat</h3>
              <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
                {messages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 border border-black/10 dark:border-white/10 p-3">
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
                className="rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={resetGame}
              >
                Réinitialiser
              </button>
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-neutral-500 mt-2">
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
