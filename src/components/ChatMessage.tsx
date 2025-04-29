"use client"

interface ChatMessageProps {
    sender: string;
    message: string;
    isOwnMessage: boolean;
}
export default function ChatMessage({sender,message, isOwnMessage}: ChatMessageProps) {
    const isSystemMessage = sender === "system"
    const handleSendMessage = (message:string) => {
        console.log(message)
    }
    return (
        <div className={`flex  ${
            isSystemMessage 
                ? "justify-center"
                : isOwnMessage ? "justify-end": "justify-start"} 
        `}>
            <div className={` max-w-xs px-4 py-2 rounded-lg
            ${isSystemMessage ? "bg-gray-800 text-white text-center text-xs" : isOwnMessage ? "bg-black-900 text-white": "bg-white text-black" }
            `}>
                {!isSystemMessage && <p className="text-sm font-bold">{sender}</p>}
                <p className="">{message}</p>
            </div>

        </div>
    );
}