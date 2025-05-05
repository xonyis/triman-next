"use client"
import { useEffect, useState } from "react"
import { socket } from "@/lib/socketClient"
import { Dice2, Dice3, Dice4, Dice5, Dice6, Beer, User, Dices } from "lucide-react"
import { motion } from "framer-motion"
import DicesComponent from "@/components/Dices-component"

export default function Home() {
    // const [messages, setMessages] = useState<{sender : string, message:string}[]>([]);
    const [room, setRoom] = useState("")
    const [joinded, setJoined] = useState(false)
    const [username, setUserName] = useState("")
    const [isRolling, setIsRolling] = useState(false)
    // const [isTriman, setIsTriman] = useState(false)
    const [de1, setDe1] = useState<number>(0)
    const [de2, setDe2] = useState<number>(0)
    const [nbrTours, setNbrTours] = useState<number>(0)
    const [currentTurn, setCurrentTurn] = useState("")
    const [rollCount, setRollCount] = useState(0) // Compteur pour forcer le rechargement des animations

    const [currentPlayer, setCurrentPlayer] = useState("")
    const [triman, setTriman] = useState("")
    const [playAgain, setPlayAgain] = useState(false)

    const [gameMessage, setGameMessage] = useState("")

    // Animation pour les dés quand on clique sur Jouer
    const handleRoll = () => {
        setIsRolling(true)
        const newDe1 = Math.floor(Math.random() * 6) + 1
        const newDe2 = Math.floor(Math.random() * 6) + 1
        console.log("current", playAgain)
        socket.emit("dice-roll", {
            room,
            username,
            de1: newDe1,
            de2: newDe2,
            total: newDe1 + newDe2,
            trimanPlayer: triman,
            playAgain,
        })

        // Incrémenter le compteur de lancers pour forcer le rechargement des animations
        setRollCount((prev) => prev + 1)

        setTimeout(() => {
            setIsRolling(false)
            setNbrTours(nbrTours + 1)
        }, 2000)
    }

    // Fonction pour obtenir l'icône de dé correspondant à la valeur
    const getDiceIcon = (value: number) => {
        const icons = [
            <Dice2 key={2} className="w-12 h-12 sm:w-16 sm:h-16 text-zinc-900" />,
            <Dice3 key={3} className="w-12 h-12 sm:w-16 sm:h-16 text-zinc-900" />,
            <Dice4 key={4} className="w-12 h-12 sm:w-16 sm:h-16 text-zinc-900" />,
            <Dice5 key={5} className="w-12 h-12 sm:w-16 sm:h-16 text-zinc-900" />,
            <Dice6 key={6} className="w-12 h-12 sm:w-16 sm:h-16 text-zinc-900" />,
        ]
        return icons[value - 1] || icons[0]
    }

    const handleJoinRoom = () => {
        if (room && username) {
            socket.emit("join-room", { room, username: username })
            setJoined(true)
            setCurrentPlayer(username)
            console.log(currentPlayer)
        }
    }

    const getRules = (d1: number, d2: number, total: number, player: string, triman: string, nextPlayer: string) => {
        if (!triman) {
            if (d1 === 3 || d2 === 3 || total === 3) {
                setTriman(player)
                setGameMessage(`${player} est triman! il boit pour feter cela !`)
            } else {
                setGameMessage(`${player} a fait ${total}, on cherche un triman`)
            }
            setCurrentTurn(nextPlayer)
            setPlayAgain(false)
        } else {
            if (d1 === d2) {
                setCurrentTurn(player)
                setPlayAgain(true)
                if (d1 === 3 || d2 === 3) {
                    setGameMessage(`Double ${d1}! ${player} distribue ${d1} gorgées! Le triman aussi prend une gorgée!`)
                } else {
                    setGameMessage(`Double ${d1}! ${player} distribue ${d1} gorgées!`)
                }
            } else if (total === 9) {
                setCurrentTurn(player)
                setPlayAgain(true)
                if (d1 === 3 || d2 === 3) {
                    setGameMessage(`${player}, ton voisin de gauche boit 1 gorgée! Le triman aussi prend une gorgée!`)
                } else {
                    setGameMessage(`${player}, ton voisin de gauche boit 1 gorgée!`)
                }
            } else if (total === 11) {
                setCurrentTurn(player)
                setPlayAgain(false)
                if (d1 === 3 || d2 === 3) {
                    setGameMessage(`${player}, ton voisin de droite boit 1 gorgée! Le triman aussi prend une gorgée!`)
                } else {
                    setGameMessage(`${player}, ton voisin de droite boit 1 gorgée!`)
                }
            } else if (total === 10) {
                setCurrentTurn(player)
                setPlayAgain(true)
                if (d1 === 3 || d2 === 3) {
                    setGameMessage(`${player} tu boit 1 gorgée! Le triman aussi prend une gorgée!`)
                } else {
                    setGameMessage(`${player} tu boit 1 gorgée!`)
                }
            } else if (total === 3 || d1 === 3 || d2 === 3) {
                setCurrentTurn(player)
                setPlayAgain(true)
                setGameMessage(`${triman} tu boit 1 gorgée!`)
            } else {
                setCurrentTurn(nextPlayer)
                if (triman === player) {
                    setTriman("")
                    setPlayAgain(false)
                    setGameMessage(`Rien ne se passe. On reset le triman`)
                } else {
                    setCurrentTurn(nextPlayer)
                    setPlayAgain(false)
                    setGameMessage(`${player} a fait ${total}. Rien ne se passe.`)
                }
            }
        }
    }

    useEffect(() => {
        // socket.on("message", (data) => {
        //     setMessages((prev) => [...prev,data])
        // })
        //
        // socket.on("user_joined", (message) => {
        //     setMessages((prev) => [...prev, {sender: "system", message}])
        // })

        socket.on("dice-roll-result", (data) => {
            console.log(data)
            setDe1(data.de1)
            setDe2(data.de2)
            const total = data.de1 + data.de2
            getRules(data.de1, data.de2, total, data.username, data.trimanPlayer, data.nextPlayer)

            // Incrémenter le compteur de lancers pour forcer le rechargement des animations
            // même quand les résultats viennent d'un autre joueur
            setRollCount((prev) => prev + 1)
        })

        socket.on("player_list", (players) => {
            console.log("Liste des joueurs:", players)
            setCurrentTurn(players[0])
        })

        return () => {
            socket.off("user_joined")
            socket.off("message")
            socket.off("dice-roll-result")
            socket.off("player8list")
        }
    }, [username])
    return (
        <div className="flex justify-center max-h-screen w-screen">
            {!joinded ? (
                <div className="flex w-full max-w-md mx-auto flex-col items-center justify-center h-screen bg-neutral-900 p-6">
                    <motion.div
                        className="w-full bg-gradient-to-br from-purple-600 to-indigo-700 rounded-3xl p-8 shadow-lg"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h1 className="mb-6 text-3xl font-bold text-center text-white">Jeu de Dés</h1>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-white mb-1">Votre pseudo</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50"
                                    placeholder="Entrez votre pseudo..."
                                    onChange={(e) => setUserName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-white mb-1">Code de la salle</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50"
                                    placeholder="Entrez le code de la salle..."
                                    onChange={(e) => setRoom(e.target.value)}
                                />
                            </div>
                            <button
                                className="w-full px-4 py-3 mt-4 text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all font-medium"
                                onClick={handleJoinRoom}
                            >
                                Rejoindre la salle
                            </button>
                        </div>
                    </motion.div>
                </div>
            ) : (
                <div className="w-full max-w-screen mx-auto">
                    <div className="min-h-screen w-full mx-auto overflow-y-auto bg-neutral-900">
                        <div className="grid grid-cols-2 grid-rows-[auto_1fr_1fr_auto_auto] gap-2 sm:gap-4 h-full p-2 sm:p-4">
                            {/* Section du joueur actuel */}
                            <motion.div
                                className="col-span-2 p-2 sm:p-4 mb-0 mt-2 py-0"
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                            >
                                <div className="w-full h-full min-h-30 flex justify-between flex-col bg-gradient-to-br from-amber-400 to-amber-500 rounded-xl sm:rounded-3xl p-3 sm:p-6 pb-2 sm:pb-3 shadow-lg">
                                    <div className="flex items-center gap-1 sm:gap-2">
                                        {triman ? (
                                            <>
                                                <Beer className="w-4 h-4 sm:w-6 sm:h-6 text-red-600"/>
                                                <motion.p
                                                    className="text-sm sm:text-md font-bold text-red-600"
                                                    initial={{opacity: 0, scale: 0.8}}
                                                    animate={{opacity: 1, scale: 1}}
                                                    transition={{
                                                        duration: 0.5,
                                                        ease: "easeOut",
                                                    }}
                                                >
                                                    {triman}
                                                </motion.p>
                                            </>
                                        ) : (
                                            <>
                                                <Beer className="w-6 h-6 text-white animate-pulse"/>
                                                <p className="text-md font-bold text-white">On cherche un triman</p>
                                            </>
                                        )}
                                    </div>
                                    <div className="h-full flex items-center justify-center py-1">

                                        <motion.p
                                            className="text-xs sm:text-sm font-extrabold text-white drop-shadow-md text-center"
                                            initial={{opacity: 0, scale: 0.8}}
                                            animate={{opacity: 1, scale: 1}}
                                            transition={{
                                                duration: 0.5,
                                                ease: "easeOut",
                                            }}
                                        >
                                            {gameMessage}
                                        </motion.p>
                                    </div>
                                    <div className="w-full flex justify-between text-xs sm:text-sm">
                                        <div className="bg-white/30 flex px-2 sm:px-4 py-1 sm:py-2 rounded-full">
                                            <User className="w-3 h-3 sm:w-4 sm:h-4 text-white mr-1"/>
                                            <p className=" font-bold text-white "> {currentTurn}</p>
                                        </div>
                                        <div className="bg-white/30 px-2 sm:px-4 py-1 sm:py-2 rounded-full">
                                        <p className=" font-bold text-white">Tour {nbrTours}</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                            {/* Dé 1 */}
                            <motion.div
                                className="row-span-2 row-start-2 p-2 sm:p-3"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                            >
                                <div className="w-full flex flex-col items-center justify-between h-full bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl sm:rounded-3xl p-3 sm:p-5 shadow-lg">
                                    <p className="text-base sm:text-xl font-bold text-white/90 mb-1 sm:mb-2">Dé 1</p>
                                    <DicesComponent dice={de1} rollId={rollCount} />

                                    <div className="mt-2 sm:mt-4 bg-white/20 px-4 sm:px-6 py-2 sm:py-3 rounded-full">
                                        { isRolling ? (
                                            <p className="text-xl sm:text-3xl font-bold text-white">  &nbsp;</p>

                                        ) : (
                                            <motion.p
                                                className="text-xl sm:text-3xl font-bold text-white"
                                                initial={{opacity: 0, scale: 0.8}}
                                                animate={{opacity: 1, scale: 1}}
                                                transition={{
                                                    duration: 0.5,
                                                    ease: "easeOut",
                                                }}
                                            >
                                                {de1}
                                            </motion.p>
                                        )}                                    </div>
                                </div>
                            </motion.div>
                            {/* Dé 2 */}
                            <motion.div
                                className="row-span-2 row-start-2 p-2 sm:p-3"
                                initial={{opacity: 0, x: -20}}
                                animate={{opacity: 1, x: 0}}
                                transition={{duration: 0.5, delay: 0.2}}
                            >
                                <div className="w-full flex flex-col items-center justify-between h-full min-h-60 bg-gradient-to-br from-blue-600 to-cyan-700 rounded-xl sm:rounded-3xl p-3 sm:p-5 shadow-lg">
                                    <p className="text-base sm:text-xl font-bold text-white/90 mb-1 sm:mb-2">Dé 2</p>
                                    <DicesComponent dice={de2} rollId={rollCount} />
                                    <div className="mt-2 sm:mt-4 bg-white/20 px-4 sm:px-6 py-2 sm:py-3 rounded-full">
                                        { isRolling ? (
                                            <p className="text-xl sm:text-3xl font-bold text-white">  &nbsp;</p>

                                        ) : (
                                            <motion.p
                                            className="text-xl sm:text-3xl font-bold text-white"
                                            initial={{opacity: 0, scale: 0.8}}
                                        animate={{opacity: 1, scale: 1}}
                                        transition={{
                                            duration: 0.5,
                                            ease: "easeOut",
                                        }}
                                    >
                                        {de2}
                                    </motion.p>
                                            )}
                                    </div>
                                </div>
                            </motion.div>
                            <div className=" col-span-2 row-start-4 p-2 sm:p-4 mb-0 sm:mb-1 pt-0">
                                <div className="w-full max-h-full h-full flex flex-col bg-red-500 rounded-xl sm:rounded-3xl p-2 sm:p-4">
                                    <p className="text-base sm:text-lg font-bold text-white">Total : </p>
                                    <div className="h-full flex justify-center items-center">
                                        { isRolling ? (
                                            <p className="text-4xl sm:text-6xl font-bold text-white">&nbsp;</p>
                                        ) : (
                                            <motion.p
                                                className="text-4xl sm:text-6xl font-bold text-white"
                                                initial={{opacity: 0, scale: 0.8}}
                                                animate={{opacity: 1, scale: 1}}
                                                transition={{
                                                    duration: 0.5,
                                                    ease: "easeOut",
                                                }}
                                            >
                                                {de2 + de1}
                                            </motion.p>)}
                                    </div>
                                </div>
                            </div>

                            {/* Bouton Jouer */}
                            <motion.div
                                className="col-span-2 row-start-5 p-2 sm:p-4 mb-3 pt-1 sm:pt-2"
                                initial={{opacity: 0, y: 30}}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.5 }}
                            >
                                {currentTurn === username ? (
                                    <motion.button
                                        className="w-full h-full bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl sm:rounded-3xl p-2 sm:p-3 shadow-lg flex items-center justify-center gap-2 sm:gap-4 hover:from-emerald-600 hover:to-green-700 transition-all"
                                        whileTap={{ scale: 0.95 }}
                                        onClick={handleRoll}
                                    >
                                        <p className="text-2xl sm:text-4xl font-bold text-white">Lancer les dés</p>
                                        <Dices className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                                    </motion.button>
                                ) : (
                                    <motion.button className="w-full h-full bg-gradient-to-br from-red-500 to-red-600 rounded-xl sm:rounded-3xl p-2 sm:p-3 shadow-lg flex items-center justify-center gap-2 sm:gap-4 hover:from-red-600 hover:to-red-700 transition-all">
                                        <p className="text-2xl sm:text-4xl font-bold text-white">Lancer les dés</p>
                                        <Dices className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                                    </motion.button>
                                )}
                            </motion.div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
