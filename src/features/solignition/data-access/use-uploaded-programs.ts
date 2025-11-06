import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSolana } from '@/components/solana/use-solana'
import { toast } from 'sonner'

const DEPLOYER_API_URL = import.meta.env.VITE_DEPLOYER_API_URL || 'http://localhost:3000'

export interface UploadedProgram {
  fileId: string
  fileName: string
  borrower: string
  filePath: string
  fileSize: number
  binaryHash: string
  estimatedCost: number
  status: 'pending' | 'ready' | 'deployed'
  createdAt: number
  loanId?: string
  deployedProgramId?: string
}

export interface PaginatedUploadsResponse {
  uploads: UploadedProgram[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

// Hook to fetch all uploads for a borrower
export function useUploadedPrograms(status?: 'pending' | 'ready' | 'deployed') {
  const { account } = useSolana()

  return useQuery({
    queryKey: ['uploaded-programs', account?.address, status],
    queryFn: async () => {
      if (!account?.address) {
        throw new Error('No account connected')
      }

      const url = status 
        ? `${DEPLOYER_API_URL}/uploads/borrower/${account.address}?status=${status}`
        : `${DEPLOYER_API_URL}/uploads/borrower/${account.address}`

      const response = await fetch(url)
      
      if (!response.ok) {
        if (response.status === 404) {
          return []
        }
        throw new Error('Failed to fetch uploaded programs')
      }

      const data: UploadedProgram[] = await response.json()
      return data
    },
    enabled: !!account?.address,
    staleTime: 30000, // Consider data stale after 30 seconds
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('404')) {
        return false
      }
      return failureCount < 2
    },
  })
}

// Hook to fetch paginated uploads
export function useUploadedProgramsPaginated(
  limit: number = 10, 
  offset: number = 0, 
  status?: 'pending' | 'ready' | 'deployed'
) {
  const { account } = useSolana()

  return useQuery({
    queryKey: ['uploaded-programs-paginated', account?.address, limit, offset, status],
    queryFn: async () => {
      if (!account?.address) {
        throw new Error('No account connected')
      }

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        ...(status && { status })
      })

      const response = await fetch(
        `${DEPLOYER_API_URL}/uploads/borrower/${account.address}/paginated?${params}`
      )
      
      if (!response.ok) {
        throw new Error('Failed to fetch uploaded programs')
      }

      const data: PaginatedUploadsResponse = await response.json()
      return data
    },
    enabled: !!account?.address,
  })
}

// Hook to delete an uploaded program
export function useDeleteUploadedProgram() {
  const { account } = useSolana()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fileId: string) => {
      if (!account?.address) {
        throw new Error('No account connected')
      }

      const response = await fetch(`${DEPLOYER_API_URL}/uploads/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ borrower: account.address }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete upload')
      }

      return await response.json()
    },
    onSuccess: () => {
      toast.success('Program deleted successfully')
      // Invalidate all upload queries to refresh the lists
      queryClient.invalidateQueries({ queryKey: ['uploaded-programs'] })
      queryClient.invalidateQueries({ queryKey: ['uploaded-programs-paginated'] })
    },
    onError: (error: Error) => {
      toast.error('Failed to delete program', {
        description: error.message,
      })
    },
  })
}

// Hook to upload a program file
export function useUploadProgramFile() {
  const queryClient = useQueryClient()

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
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const data = await response.json()
      return data
    },
    onSuccess: (data) => {
      // Invalidate uploads list to include the new upload
      queryClient.invalidateQueries({ queryKey: ['uploaded-programs'] })
      queryClient.invalidateQueries({ queryKey: ['uploaded-programs-paginated'] })
    },
    onError: (error: Error) => {
      toast.error('Failed to upload program file', {
        description: error.message,
      })
    },
  })
}