"use client"
import {useState} from "react";

export default function ChatForm({onSendMessage}: {onSendMessage:(message:string)=>void;}) {
    const [message, setMessage] = useState("")
    const handleSubmit = (e:React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
  
        if (message.trim()!=="") {
            onSendMessage(message)
            setMessage("")
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
            <input 
                type="text"
                className="flex-1 px-4 border-2 py-2 rounded-lg focus:outline-none"
                placeholder="Your message here ..."
                onChange={(e) => setMessage(e.target.value)}
            />

            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-500 text-white">Send</button>
        </form>
    );
}
