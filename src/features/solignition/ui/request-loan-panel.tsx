import { useState } from 'react'
import { UiWalletAccount } from '@wallet-ui/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useRequestLoanMutation } from '../data-access/use-request-loan-mutation'
import { useProtocolConfig } from '../data-access/use-protocol-config'
import { Upload, X, FileCode } from 'lucide-react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes

export function RequestLoanPanel({ account }: { account: UiWalletAccount }) {
  const [principal, setPrincipal] = useState('')
  const [durationDays, setDurationDays] = useState('30')
  const [interestRate, setInterestRate] = useState('5')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string>('')

  const configQuery = useProtocolConfig()
  const requestLoanMutation = useRequestLoanMutation({ account })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    setFileError('')

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
  }

  const handleRemoveFile = () => {
    setFile(null)
    setFileError('')
    // Reset the file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement
    if (fileInput) fileInput.value = ''
  }

  const handleRequestLoan = async () => {
    const principalAmount = parseFloat(principal)
    const days = parseInt(durationDays)
    const rate = parseFloat(interestRate)

    if (isNaN(principalAmount) || principalAmount <= 0) return
    if (isNaN(days) || days <= 0) return
    if (isNaN(rate) || rate < 0) return
    if (!file) return

    const durationSeconds = BigInt(days * 24 * 60 * 60)
    const interestRateBps = Math.floor(rate * 100)
    const adminFeeBps = configQuery.data?.data.defaultAdminFeeBps ?? 100

    await requestLoanMutation.mutateAsync({
      principal: BigInt(Math.floor(principalAmount * 1_000_000_000)),
      duration: durationSeconds,
      interestRateBps,
      adminFeeBps,
      file, // Pass the file to the mutation
    })

    // Reset form
    setPrincipal('')
    setDurationDays('30')
    setInterestRate('5')
    handleRemoveFile()
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request a Loan</CardTitle>
        <CardDescription>Borrow SOL for program deployment. Repay with interest.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="principal">Loan Amount (SOL)</Label>
          <Input
            id="principal"
            type="number"
            step="0.1"
            min="0"
            placeholder="5.0"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            disabled={requestLoanMutation.isPending}
          />
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
          <Label htmlFor="file-upload">Program File (.so)</Label>
          <div className="space-y-2">
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
                  disabled={requestLoanMutation.isPending}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileCode className="w-8 h-8 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  disabled={requestLoanMutation.isPending}
                  className="flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          </div>
        </div>

        {totalRepayment && (
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Total Repayment Amount</p>
            <p className="text-2xl font-bold">{totalRepayment} SOL</p>
            <p className="text-xs text-muted-foreground mt-1">
              Principal: {principal} SOL + Interest: {(parseFloat(totalRepayment) - parseFloat(principal)).toFixed(2)}{' '}
              SOL
            </p>
          </div>
        )}

        <Button
          onClick={handleRequestLoan}
          disabled={requestLoanMutation.isPending || !principal || !durationDays || !interestRate || !file}
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