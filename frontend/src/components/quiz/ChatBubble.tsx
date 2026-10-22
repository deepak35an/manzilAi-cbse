import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

interface ChatBubbleProps {
  type: 'question' | 'answer' | 'feedback' | 'system'
  children: React.ReactNode
  confidence?: number
}

export default function ChatBubble({ type, children, confidence }: ChatBubbleProps) {
  const isLeft = type === 'question' || type === 'feedback' || type === 'system'
  const showConfidence = type === 'answer' && confidence !== undefined && confidence !== null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex', isLeft ? 'justify-start' : 'justify-end')}
    >
      <div className={cn(
        'max-w-[80%] rounded-2xl px-4 py-3 text-sm relative group',
        type === 'question' && 'bg-gray-100 text-gray-800 rounded-tl-sm',
        type === 'answer' && 'bg-primary-600 text-white rounded-tr-sm',
        type === 'feedback' && 'bg-green-50 border border-green-200 text-green-800 rounded-tl-sm',
        type === 'system' && 'bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-tl-sm'
      )}>
        {children}
        {showConfidence && (
          <div className="absolute -bottom-2 right-2 bg-white/90 backdrop-blur-sm text-[9px] font-bold text-gray-500 py-0.5 px-1.5 rounded-full border border-gray-100 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
            {Math.round(confidence * 100)}% Confidence
          </div>
        )}
      </div>
    </motion.div>
  )
}
