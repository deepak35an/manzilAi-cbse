import { useEffect, useRef } from 'react'
import { useQuizStore } from '../../store/quizStore'
import ChatBubble from './ChatBubble'
import QuestionCard from './QuestionCard'
import FeedbackPanel from './FeedbackPanel'

export default function ChatThread() {
  const messages = useQuizStore((s) => s.messages)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => (
        <ChatBubble key={msg.id} type={msg.type} confidence={msg.voice_confidence}>
          {msg.type === 'question' && msg.question ? (
            <QuestionCard question={msg.question} readOnly />
          ) : msg.type === 'feedback' ? (
            <FeedbackPanel score={msg.score || 0} explanation={msg.explanation || ''} />
          ) : (
            <p>{msg.content}</p>
          )}
        </ChatBubble>
      ))}
      <div ref={endRef} />
    </div>
  )
}
