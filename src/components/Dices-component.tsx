"use client"

import { useState, useRef, useEffect } from "react"

interface DicesComponentProps {
    dice: number
    size?: "small" | "medium" | "large"
    onComplete?: () => void
    rollId?: number // Nouvel identifiant unique pour chaque lancer
}

export default function DicesComponent({
                                           dice,
                                           size = "medium",
                                           onComplete,
                                           rollId = 0, // Valeur par défaut
                                       }: DicesComponentProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [isLoading, setIsLoading] = useState(true)

    // Déterminer les dimensions en fonction de la taille
    const dimensions = {
        small: { width: 80, height: 80 },
        medium: { width: 120, height: 120 },
        large: { width: 160, height: 160 },
    }

    const { width, height } = dimensions[size]

    // Mapping des valeurs de dés aux URLs des vidéos WebM avec transparence
    const diceVideos = {
        0: "/videos/transparent/dice1.webm",
        1: "/videos/transparent/dice1.webm",
        2: "/videos/transparent/dice2.webm",
        3: "/videos/transparent/dice3.webm",
        4: "/videos/transparent/dice4.webm",
        5: "/videos/transparent/dice5.webm",
        6: "/videos/transparent/dice6.webm",
    }

    // Utiliser useEffect avec dice ET rollId comme dépendances
    useEffect(() => {
        if (!videoRef.current) return

        // Réinitialiser la vidéo à chaque lancer, même si la valeur est identique
        videoRef.current.currentTime = 0

        // Forcer le rechargement de la vidéo en manipulant la source
        const currentSrc = diceVideos[dice as keyof typeof diceVideos]
        videoRef.current.src = currentSrc

        videoRef.current.load() // Recharger explicitement la vidéo
        videoRef.current.play()

        // Gérer les événements de la vidéo
        const handleLoadedData = () => {
            setIsLoading(false)
        }

        const handleEnded = () => {
            if (onComplete) onComplete()
        }

        const video = videoRef.current
        video.addEventListener("loadeddata", handleLoadedData)
        video.addEventListener("ended", handleEnded)

        return () => {
            video.removeEventListener("loadeddata", handleLoadedData)
            video.removeEventListener("ended", handleEnded)
        }
    }, [dice, rollId, onComplete]) // Ajouter rollId comme dépendance

    return (
        <div className="relative">
            {isLoading && (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-gray-200/50 rounded-lg"
                    style={{ width, height }}
                >
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
            <video
                ref={videoRef}
                width={width}
                height={height}
                className="rounded-lg mr-10"
                playsInline
                muted
                autoPlay
                style={{
                    background: "transparent",
                }}
            />
        </div>
    )
}
