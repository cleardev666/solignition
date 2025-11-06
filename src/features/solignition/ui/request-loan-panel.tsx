import { useState, useEffect } from 'react'
import { UiWalletAccount } from '@wallet-ui/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useRequestLoanMutation } from '../data-access/use-request-loan-mutation'
import { useProtocolConfig } from '../data-access/use-protocol-config'
import { useUploadProgramFile } from '../data-access/use-upload-program-file'
import { Upload, X, FileCode, History, Info, CheckCircle } from 'lucide-react'
import { UploadedProgramsList } from './uploaded-programs-list'
import type { UploadedProgram } from '../data-access/use-uploaded-programs'
import { toast } from 'sonner'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes

export function RequestLoanPanel({ account }: { account: UiWalletAccount }) {
  const [principal, setPrincipal] = useState('')
  const [durationDays, setDurationDays] = useState('30')
  const [interestRate, setInterestRate] = useState('5')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string>('')
  const [selectedProgram, setSelectedProgram] = useState<UploadedProgram | null>(null)
  const [activeTab, setActiveTab] = useState<'upload' | 'existing'>('upload')
  const [uploadedFileData, setUploadedFileData] = useState<{ fileId: string; estimatedCost: number } | null>(null)
  const [isManuallyEdited, setIsManuallyEdited] = useState(false)

  const configQuery = useProtocolConfig()
  const requestLoanMutation = useRequestLoanMutation({ account })
  const uploadMutation = useUploadProgramFile()

  // Upload the file and get estimated cost
  const handleFileUpload = async (selectedFile: File) => {
    setFileError('')
    setUploadedFileData(null)
    
    try {
      const result = await uploadMutation.mutateAsync({
        file: selectedFile,
        borrower: account.address
      })
      
      setUploadedFileData({
        fileId: result.fileId,
        estimatedCost: result.estimatedCost
      })
      
      // Automatically set the loan amount to the estimated cost if not manually edited
      if (!isManuallyEdited) {
        setPrincipal(result.estimatedCost.toString())
      }
      
      toast.success('File uploaded successfully', {
        description: `Estimated deployment cost: ${result.estimatedCost} SOL`
      })
      
      return result
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Upload failed')
      throw error
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    setFileError('')
    setUploadedFileData(null)

    if (!selectedFile) {
      setFile(null)
      return
    }

    // Check file extension
    if (!selectedFile.name.endsWith('.so')) {
      setFileError('Only .so files are allowed')
      setFile(null)
      return
    }

    // Check file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFileError(`File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`)
      setFile(null)
      return
    }

    setFile(selectedFile)
    // Clear selected program when uploading new file
    setSelectedProgram(null)
    
    // Upload the file immediately to get estimated cost
    await handleFileUpload(selectedFile)
  }

  const handleRemoveFile = () => {
    setFile(null)
    setFileError('')
    setUploadedFileData(null)
    // Reset the file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement
    if (fileInput) fileInput.value = ''
    
    // Clear the amount if it was set from this file and not manually edited
    if (!isManuallyEdited) {
      setPrincipal('')
    }
  }

  const handleSelectProgram = (program: UploadedProgram) => {
    setSelectedProgram(program)
    setFile(null) // Clear uploaded file when selecting existing program
    setUploadedFileData(null)
    setActiveTab('existing') // Switch to existing tab when program is selected
    
    // Set the loan amount to the program's estimated cost if not manually edited
    if (!isManuallyEdited && program.estimatedCost) {
      setPrincipal(program.estimatedCost.toString())
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'upload' | 'existing')
    // Clear selections when switching tabs
    if (value === 'upload') {
      setSelectedProgram(null)
    } else {
      setFile(null)
      setFileError('')
      setUploadedFileData(null)
    }
  }

  const handlePrincipalChange = (value: string) => {
    setPrincipal(value)
    setIsManuallyEdited(true) // Mark as manually edited
  }

  const handleRequestLoan = async () => {
    const principalAmount = parseFloat(principal)
    const days = parseInt(durationDays)
    const rate = parseFloat(interestRate)

    if (isNaN(principalAmount) || principalAmount <= 0) return
    if (isNaN(days) || days <= 0) return
    if (isNaN(rate) || rate < 0) return

    // Check if we have either uploaded file data or a selected program
    let fileToProcess: File | { fileId: string; useExisting: true } | null = null
    
    if (activeTab === 'upload' && uploadedFileData) {
      // Use the already uploaded file data
      fileToProcess = {
        fileId: uploadedFileData.fileId,
        useExisting: true
      }
    } else if (activeTab === 'existing' && selectedProgram) {
      // Use existing program
      fileToProcess = {
        fileId: selectedProgram.fileId,
        useExisting: true
      }
    } else {
      toast.error('Please upload a file or select an existing program')
      return
    }

    const durationSeconds = BigInt(days * 24 * 60 * 60)
    const interestRateBps = Math.floor(rate * 100)
    const adminFeeBps = configQuery.data?.data.defaultAdminFeeBps ?? 100

    await requestLoanMutation.mutateAsync({
      principal: BigInt(Math.floor(principalAmount * 1_000_000_000)),
      duration: durationSeconds,
      interestRateBps,
      adminFeeBps,
      fileId: fileToProcess.fileId,
      useExisting: true, // Since file is already uploaded
    })

    // Reset form
    setPrincipal('')
    setDurationDays('30')
    setInterestRate('5')
    handleRemoveFile()
    setSelectedProgram(null)
    setActiveTab('upload')
    setIsManuallyEdited(false)
  }

  const calculateTotalRepayment = () => {
    const principalAmount = parseFloat(principal)
    const rate = parseFloat(interestRate)

    if (isNaN(principalAmount) || isNaN(rate)) return null

    const interest = (principalAmount * rate) / 100
    return (principalAmount + interest).toFixed(2)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const totalRepayment = calculateTotalRepayment()
  const hasValidFileSelection = (activeTab === 'upload' && uploadedFileData) || (activeTab === 'existing' && selectedProgram)
  
  // Get the current estimated cost based on selection
  const currentEstimatedCost = activeTab === 'upload' 
    ? uploadedFileData?.estimatedCost 
    : selectedProgram?.estimatedCost

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request a Loan</CardTitle>
        <CardDescription>Borrow SOL for program deployment. Repay with interest.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="principal">Loan Amount (SOL)</Label>
          {currentEstimatedCost && !isManuallyEdited && (
            <Alert className="mb-2">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Estimated deployment cost: <strong>{currentEstimatedCost} SOL</strong>
                <span className="text-xs text-muted-foreground ml-1">(You can adjust if needed)</span>
              </AlertDescription>
            </Alert>
          )}
          <Input
            id="principal"
            type="number"
            step="0.1"
            min="0"
            placeholder={currentEstimatedCost ? currentEstimatedCost.toString() : "5.0"}
            value={principal}
            onChange={(e) => handlePrincipalChange(e.target.value)}
            disabled={requestLoanMutation.isPending || uploadMutation.isPending}
          />
          {isManuallyEdited && currentEstimatedCost && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPrincipal(currentEstimatedCost.toString())
                setIsManuallyEdited(false)
              }}
              className="text-xs"
            >
              Reset to estimated cost ({currentEstimatedCost} SOL)
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="duration">Duration (days)</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              placeholder="30"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              disabled={requestLoanMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="interest">Interest Rate (%)</Label>
            <Input
              id="interest"
              type="number"
              step="0.1"
              min="0"
              placeholder="5.0"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              disabled={requestLoanMutation.isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Program File</Label>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload New
              </TabsTrigger>
              <TabsTrigger value="existing" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Use Existing
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="space-y-2">
              {!file ? (
                <label
                  htmlFor="file-upload"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground">
                      .so files only (Max {MAX_FILE_SIZE / (1024 * 1024)}MB)
                    </p>
                  </div>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".so"
                    onChange={handleFileChange}
                    disabled={requestLoanMutation.isPending || uploadMutation.isPending}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileCode className="w-8 h-8 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                        {uploadMutation.isPending && (
                          <p className="text-xs text-muted-foreground mt-1">Uploading...</p>
                        )}
                        {uploadedFileData && (
                          <div className="mt-1">
                            <Badge className="bg-green-500 text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Uploaded - Est. {uploadedFileData.estimatedCost} SOL
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveFile}
                      disabled={requestLoanMutation.isPending || uploadMutation.isPending}
                      className="flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {uploadMutation.isError && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        {uploadMutation.error?.message || 'Upload failed'}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
              {fileError && <p className="text-sm text-destructive">{fileError}</p>}
            </TabsContent>

            <TabsContent value="existing" className="space-y-2">
              <UploadedProgramsList 
                onSelectProgram={handleSelectProgram}
                selectedFileId={selectedProgram?.fileId}
              />
              {selectedProgram && (
                <div className="p-3 bg-primary/5 border border-primary rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium">Selected: {selectedProgram.fileName}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    File ID: {selectedProgram.fileId}
                  </p>
                </div>
              )}
              {!selectedProgram && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Select a previously uploaded program from the list above
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {totalRepayment && (
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Price To Open Loan</p>
            <p className="text-2xl font-bold">{(parseFloat(principal || "0") * ((configQuery.data?.data?.defaultAdminFeeBps ?? 150) / 10_000)).toFixed(6)}{" "}SOL</p>
            <p className="text-sm text-muted-foreground">Total Repayment Amount</p>
            <p className="text-2xl font-bold">{totalRepayment} SOL</p>
            <p className="text-xs text-muted-foreground mt-1">
              Principal: {principal} SOL + Interest: {(parseFloat(totalRepayment) - parseFloat(principal)).toFixed(6)}{' '}
              SOL
            </p>
          </div>
        )}

        <Button
          onClick={handleRequestLoan}
          disabled={requestLoanMutation.isPending || !principal || !durationDays || !interestRate || !hasValidFileSelection}
          className="w-full"
        >
          {requestLoanMutation.isPending ? 'Requesting Loan...' : 'Request Loan'}
        </Button>

        {configQuery.data && (
          <p className="text-xs text-muted-foreground">
            Default admin fee: {(configQuery.data.data.defaultAdminFeeBps / 100).toFixed(1)}%
          </p>
        )}
      </CardContent>
    </Card>
  )
}