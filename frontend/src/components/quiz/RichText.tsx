import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { memo } from 'react'
import { prepareQuestionMarkdown } from '@/lib/codeBlocks'

interface RichTextProps {
  text: string | string[] | unknown
  className?: string
  inline?: boolean
}

export default memo(function RichText({ 
  text, 
  className, 
  inline = false 
}: RichTextProps) {
  
  const Wrapper = inline ? 'span' : 'div'

  const normalizedText = prepareQuestionMarkdown(
    Array.isArray(text)
      ? text.join(', ')
      : typeof text === 'string'
        ? text
        : String(text ?? '')
  )

  return (
    <Wrapper className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ ...props }) => (
            inline 
              ? <span {...props} />
              : <p className="leading-relaxed my-1" {...props} />
          ),
          
          pre: ({ children }) => (
            <pre className="p-4 bg-gray-50 border border-gray-200 rounded-xl overflow-x-auto my-3 font-mono text-[13px] leading-6 text-gray-800 whitespace-pre">
              {children}
            </pre>
          ),
          code: ({ className: codeClass, children, ...props }) => {
            const isBlock = /language-/.test(codeClass || '') || String(children).includes('\n')
            if (isBlock) {
              return (
                <code className="font-mono text-gray-800" {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code
                className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-800 text-[13px] rounded"
                {...props}
              >
                {children}
              </code>
            )
          },

          ul: ({ ...props }) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
          ol: ({ ...props }) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
          li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
        }}
      >
        {normalizedText}
      </ReactMarkdown>
    </Wrapper>
  )
})
