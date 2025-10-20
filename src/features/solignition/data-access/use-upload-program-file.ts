import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

const DEPLOYER_API_URL = import.meta.env.VITE_DEPLOYER_API_URL || 'http://localhost:3000'

interface UploadResponse {
  success: boolean
  fileId: string
  estimatedCost: number
  binaryHash: string
  message: string
}

interface UploadError {
  error: string
}

export function useUploadProgramFile() {
  return useMutation({
    mutationFn: async ({ file, borrower }: { file: File; borrower: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('borrower', borrower)

      const response = await fetch(`${DEPLOYER_API_URL}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData: UploadError = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const data: UploadResponse = await response.json()
      return data
    },
    onSuccess: (data) => {
      toast.success('Program file uploaded successfully', {
        description: `Estimated deployment cost: ${data.estimatedCost} SOL`,
      })
    },
    onError: (error: Error) => {
      toast.error('Failed to upload program file', {
        description: error.message,
      })
    },
  })
}