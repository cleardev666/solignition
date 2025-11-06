import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileCode, Calendar, HardDrive, Hash, Clock, CheckCircle, Trash2, AlertCircle } from 'lucide-react'
import { useUploadedPrograms, useDeleteUploadedProgram, UploadedProgram } from '../data-access/use-uploaded-programs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface UploadedProgramsListProps {
  onSelectProgram: (program: UploadedProgram) => void
  selectedFileId?: string | null
  allowDelete?: boolean
}

export function UploadedProgramsList({ 
  onSelectProgram, 
  selectedFileId,
  allowDelete = false 
}: UploadedProgramsListProps) {
  const { data: programs, isLoading, isError } = useUploadedPrograms()
  const deleteMutation = useDeleteUploadedProgram()
  const [expandedView, setExpandedView] = useState(false)
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      case 'ready':
        return <Badge className="bg-green-500 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>
      case 'deployed':
        return <Badge className="bg-blue-500 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Deployed</Badge>
      default:
        return null
    }
  }

  const handleDelete = async (fileId: string) => {
    await deleteMutation.mutateAsync(fileId)
    setDeleteFileId(null)
    // Clear selection if deleted file was selected
    if (selectedFileId === fileId) {
      onSelectProgram(null as any)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation() // Prevent selecting the program when clicking delete
    setDeleteFileId(fileId)
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Loading uploaded programs...</p>
        <div className="h-20 bg-muted animate-pulse rounded" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="text-sm text-muted-foreground">
        Unable to load uploaded programs
      </div>
    )
  }

  if (!programs || programs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileCode className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No programs uploaded yet</p>
        <p className="text-xs mt-1">Upload a program to see it here</p>
      </div>
    )
  }

  // Filter to show only programs that can be used (not deployed)
  const availablePrograms = programs.filter(p => p.status !== '')

  if (availablePrograms.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">All programs have been deployed</p>
        <p className="text-xs mt-1">Upload a new program to request another loan</p>
      </div>
    )
  }

  // Show compact view by default, expandable to full list
  const displayPrograms = expandedView ? availablePrograms : availablePrograms.slice(0, 3)

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Previously Uploaded Programs</Label>
          {availablePrograms.length > 3 && !expandedView && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpandedView(true)}
            >
              Show all ({availablePrograms.length})
            </Button>
          )}
        </div>
        
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {displayPrograms.map((program) => (
            <div
              key={program.fileId}
              className={`relative p-3 border rounded-lg transition-all cursor-pointer
                ${selectedFileId === program.fileId 
                  ? 'border-primary bg-primary/5' 
                  : 'hover:bg-muted/50 hover:border-muted-foreground/30'
                }`}
              onClick={() => onSelectProgram(program)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <FileCode className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{program.fileName}</p>
                      {getStatusBadge(program.status)}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {formatFileSize(program.fileSize)}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(program.createdAt)}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {program.binaryHash.substring(0, 8)}...
                      </span>
                    </div>
                    {program.estimatedCost && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Est. deployment: {program.estimatedCost} SOL
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {selectedFileId === program.fileId && (
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                  )}
                  {allowDelete && program.status !== 'deployed' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => handleDeleteClick(e, program.fileId)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {availablePrograms.length > 3 && expandedView && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpandedView(false)}
            className="w-full"
          >
            Show less
          </Button>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteFileId} onOpenChange={(open) => !open && setDeleteFileId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Program</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this uploaded program? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteFileId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(deleteFileId!)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Also export Label component if not already available
import { Label } from '@/components/ui/label'