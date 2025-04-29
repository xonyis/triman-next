import { createServer } from "node:http"
import next from 'next'
import { Server } from "socket.io"

const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOSTNAME || "localhost"
const port = parseInt(process.env.PORT || "3000", 10)
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler()

// Structure pour stocker les informations des salles
const rooms: {
    [key: string]: {
        players: string[];
        currentPlayerIndex: number;
        isTrimanMode: boolean;
        trimanPlayer: string;
    }
} = {}

app.prepare().then(() => {
    const httpServer = createServer(handle)
    const io = new Server(httpServer, {
        cors: {
            origin: "*", // Autoriser toutes les origines en développement
            methods: ["GET", "POST"],
            credentials: true
        }
    })



    io.on("connection", (socket) => {
        console.log(`a user connected: ${socket.id}`)

        socket.on("join-room", ({room, username}) => {
            socket.join(room)

            // Initialiser la salle si elle n'existe pas
            if (!rooms[room]) {
                rooms[room] = {
                    players: [],
                    currentPlayerIndex: 0,
                    isTrimanMode: true,
                    trimanPlayer: ""
                }
            }

            // Ajouter le joueur à la salle s'il n'y est pas déjà
            if (!rooms[room].players.includes(username)) {
                rooms[room].players.push(username)
            }

            console.log(`user ${username} join room : ${room}`)
            console.log(`Players in room ${room}:`, rooms[room].players)

            socket.to(room).emit('user_joined', `${username} join room`)

            // Envoyer la liste des joueurs à tous les clients dans la salle
            io.to(room).emit("player_list", rooms[room].players)

            // Envoyer l'état actuel du jeu au nouveau joueur
            socket.emit("game-state", {
                isTrimanMode: rooms[room].isTrimanMode,
                trimanPlayer: rooms[room].trimanPlayer
            })
        })

        // Quand un utilisateur lance les dés
        socket.on("dice-roll", ({ room, username, de1, de2, total, isTrimanMode, trimanPlayer, hasEffect, playAgain, resetTriman, nextTurn }) => {
            console.log(`from ${username} on ${room} score: ${de1} + ${de2} = ${total}`)

            if (rooms[room]) {
                // Mettre à jour l'état du triman
                if (isTrimanMode !== undefined) {
                    rooms[room].isTrimanMode = isTrimanMode
                }

                if (trimanPlayer !== undefined) {
                    rooms[room].trimanPlayer = trimanPlayer
                }

                if (resetTriman) {
                    rooms[room].isTrimanMode = true
                    rooms[room].trimanPlayer = ""
                }

                // Déterminer le prochain joueur
                let nextPlayerIndex

                if (playAgain) {
                    // Si le joueur doit rejouer, on garde le même index
                    nextPlayerIndex = rooms[room].currentPlayerIndex
                } else {
                    // Sinon on passe au joueur suivant
                    nextPlayerIndex = (rooms[room].currentPlayerIndex + 1) % rooms[room].players.length
                }

                // Obtenir le nom du prochain joueur
                const nextPlayer = rooms[room].players[nextPlayerIndex]

                // Mettre à jour l'index du joueur actuel
                rooms[room].currentPlayerIndex = nextPlayerIndex

                console.log(`Next player in room ${room}: ${nextPlayer}`)

                // Émettre le résultat avec le prochain joueur
                socket.to(room).emit("dice-roll-result", {
                    room,
                    username,
                    de1,
                    de2,
                    total,
                    nextPlayer,
                    isTrimanMode: rooms[room].isTrimanMode,
                    trimanPlayer: rooms[room].trimanPlayer,
                    playAgain,
                    resetTriman
                })

                // Émettre également au lanceur pour qu'il sache qui est le prochain
                socket.emit("dice-roll-result", {
                    room,
                    username,
                    de1,
                    de2,
                    total,
                    nextPlayer,
                    isTrimanMode: rooms[room].isTrimanMode,
                    trimanPlayer: rooms[room].trimanPlayer,
                    playAgain,
                    resetTriman,
                    nextTurn
                })
            }
        })

        // Quand un utilisateur envoie un message
        socket.on("send-message", ({ room, sender, message }) => {
            console.log(`Message in ${room} from ${sender}: ${message}`)
            io.to(room).emit("message", { sender, message })
        })

        socket.on("disconnect", () => {
            console.log(`user disconnected : ${socket.id}`)

            // Rechercher et supprimer le joueur de toutes les salles
            Object.keys(rooms).forEach((room) => {
                const playerIndex = rooms[room].players.findIndex(
                    (player) => player === socket.data?.username
                )

                if (playerIndex !== -1) {
                    const username = rooms[room].players[playerIndex]
                    rooms[room].players.splice(playerIndex, 1)

                    // Si la salle est vide, la supprimer
                    if (rooms[room].players.length === 0) {
                        delete rooms[room]
                    } else {
                        // Ajuster l'index du joueur actuel si nécessaire
                        if (rooms[room].currentPlayerIndex >= rooms[room].players.length) {
                            rooms[room].currentPlayerIndex = 0
                        }

                        // Si le triman se déconnecte, on reset le mode triman
                        if (username === rooms[room].trimanPlayer) {
                            rooms[room].isTrimanMode = true
                            rooms[room].trimanPlayer = ""
                        }

                        // Informer les autres utilisateurs que le joueur a quitté
                        io.to(room).emit("user_left", `${username} a quitté la salle`)

                        // Envoyer la liste mise à jour des joueurs
                        io.to(room).emit("player_list", rooms[room].players)

                        // Envoyer l'état mis à jour du jeu
                        io.to(room).emit("game-state", {
                            isTrimanMode: rooms[room].isTrimanMode,
                            trimanPlayer: rooms[room].trimanPlayer
                        })
                    }
                }
            })
        })
    })

    httpServer.listen(port, () => {
        console.log(`Server running on : http://46.202.153.153:${port}`)
    })
})
