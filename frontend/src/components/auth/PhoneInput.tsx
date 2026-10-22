import { useState } from 'react'
import Input from '../ui/Input'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  error?: string
}

export default function PhoneInput({ value, onChange, error }: PhoneInputProps) {
  return (
    <div className="flex gap-2">
      <div className="w-20">
        <Input value="+91" readOnly className="text-center bg-gray-50" />
      </div>
      <div className="flex-1">
        <Input
          type="tel"
          placeholder="Enter phone number"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
          error={error}
          maxLength={10}
        />
      </div>
    </div>
  )
}
